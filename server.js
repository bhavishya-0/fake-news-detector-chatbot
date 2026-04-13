require('dotenv').config();
const express   = require('express');
const mongoose  = require('mongoose');
const jwt       = require('jsonwebtoken');
const cors      = require('cors');
const path      = require('path');
const rateLimit = require('express-rate-limit');
const User      = require('./models/User');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 20 });

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fakenews_db')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.log('⚠️  MongoDB not connected - Guest mode only\n', err.message));

const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token required' });
  jwt.verify(token, process.env.JWT_SECRET || 'secret', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user; next();
  });
};

// ── Register ──
app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ error: 'All fields required' });
    const exists = await User.findOne({ $or: [{ email }, { username }] });
    if (exists) return res.status(409).json({ error: 'User already exists' });
    const user  = new User({ username, email, password });
    await user.save();
    const token = jwt.sign({ userId: user._id, username: user.username }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
    res.status(201).json({ message: 'Account created!', token, user: { id: user._id, username: user.username, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Login ──
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'All fields required' });
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ error: 'Invalid email or password' });
    user.lastLogin = new Date();
    await user.save();
    const token = jwt.sign({ userId: user._id, username: user.username }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
    res.json({ message: 'Login successful!', token, user: { id: user._id, username: user.username, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Ollama AI Detection ──
async function detectFakeNewsWithOllama(text) {
  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL || 'llama2';
  const prompt = `You are a fake news detection expert. Analyze the following text and determine if it's likely fake news, real news, or uncertain.

Text: "${text}"

Respond ONLY with valid JSON (no markdown, no code blocks):
{
  "result": "fake|real|uncertain",
  "verdict": "short verdict",
  "confidence": 0-100,
  "explanation": "brief explanation",
  "flags": []
}

For confidence: fake news should be 50-95%, real news 50-90%, uncertain 0-40%.`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`Ollama error: ${response.status}`);

    const data = await response.json();
    const responseText = data.response || '';
    
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    
    const result = JSON.parse(jsonMatch[0]);
    
    // Validate result structure
    if (!result.result || !result.verdict || result.confidence === undefined) {
      throw new Error('Invalid response structure');
    }
    
    return { ...result, flags: result.flags || [] };
  } catch (err) {
    console.log('⚠️  Ollama unavailable, falling back to keyword detection:', err.message);
    return null; // Fall back to keyword detection
  }
}

// ── Fake News Detection Engine ──
function detectFakeNews(text) {
  const lower = text.toLowerCase();
  let score = 0;
  const flags = [];

  const fakeWords = [
    { words: ['shocking','urgent','breaking alert'],          weight: 1, label: 'sensational language' },
    { words: ["they don't want you to know",'hidden truth'],  weight: 4, label: 'conspiracy framing' },
    { words: ['miracle cure','guaranteed','100% effective'],  weight: 3, label: 'unverified claims' },
    { words: ['share before deleted','must share now'],       weight: 4, label: 'urgency manipulation' },
    { words: ['deep state','new world order','illuminati'],   weight: 5, label: 'conspiracy terminology' },
    { words: ["you won't believe",'jaw-dropping'],            weight: 2, label: 'clickbait language' },
    { words: ['wake up','sheeple','open your eyes'],          weight: 4, label: 'radicalization language' },
    { words: ['doctors hate','big pharma hiding'],            weight: 4, label: 'anti-establishment framing' },
  ];

  const realWords = [
    { words: ['according to','researchers found','study shows'], weight: -2, label: 'evidence-based language' },
    { words: ['official statement','confirmed by','press release'], weight: -2, label: 'official sourcing' },
    { words: ['reuters','associated press','bbc','new york times'], weight: -3, label: 'credible source' },
    { words: ['percent','statistics show','survey of'],          weight: -1, label: 'statistical evidence' },
    { words: ['scientists say','experts warn','university study'], weight: -2, label: 'expert citation' },
  ];

  for (const item of fakeWords) {
    for (const word of item.words) {
      if (lower.includes(word)) { score += item.weight; flags.push({ type:'fake', label: item.label }); break; }
    }
  }
  for (const item of realWords) {
    for (const word of item.words) {
      if (lower.includes(word)) { score += item.weight; flags.push({ type:'real', label: item.label }); break; }
    }
  }

  const capsRatio = (text.match(/[A-Z]/g)||[]).length / text.length;
  if (capsRatio > 0.4 && text.length > 20) { score += 2; flags.push({ type:'fake', label:'excessive caps' }); }

  if (text.trim().length < 15)
    return { result:'uncertain', verdict:'Uncertain', emoji:'❓', confidence:0, explanation:'Text too short to analyze.', flags:[] };

  if (score >= 5)  return { result:'fake',     verdict:'Likely Fake News',   emoji:'🚨', confidence: Math.min(95, 55+score*4), explanation:'Multiple misinformation patterns detected: ' + [...new Set(flags.filter(f=>f.type==='fake').map(f=>f.label))].slice(0,3).join(', ') + '.', flags };
  if (score >= 2)  return { result:'fake',     verdict:'Possibly Fake News', emoji:'⚠️', confidence: Math.min(75, 45+score*5), explanation:'Some suspicious patterns found. Please verify before sharing.', flags };
  if (score <= -3) return { result:'real',     verdict:'Likely Real News',   emoji:'✅', confidence: Math.min(90, 60+Math.abs(score)*5), explanation:'Uses credible journalistic patterns: ' + [...new Set(flags.filter(f=>f.type==='real').map(f=>f.label))].slice(0,2).join(', ') + '.', flags };
  if (score <= -1) return { result:'real',     verdict:'Possibly Real News', emoji:'🟡', confidence: Math.min(65, 40+Math.abs(score)*8), explanation:'Some credible indicators found. Still verify independently.', flags };
  return               { result:'uncertain', verdict:'Uncertain',          emoji:'❓', confidence:0, explanation:'Cannot classify confidently. Check multiple trusted sources.', flags };
}

// ── Detect Route ──
app.post('/api/detect', async (req, res) => {
  try {
    const { text, saveToHistory } = req.body;
    if (!text || text.trim().length === 0) return res.status(400).json({ error: 'Please provide text' });
    if (text.length > 2000) return res.status(400).json({ error: 'Text too long (max 2000 chars)' });
    
    let result;
    const useAI = process.env.USE_AI_DETECTION === 'true';
    
    // Try AI detection first (Ollama + Llama 2)
    if (useAI) {
      result = await detectFakeNewsWithOllama(text);
    }
    
    // Fall back to keyword detection if AI is disabled or fails
    if (!result) {
      result = detectFakeNews(text);
    }
    
    if (saveToHistory) {
      const token = req.headers['authorization']?.split(' ')[1];
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
          await User.findByIdAndUpdate(decoded.userId, { $push: { chatHistory: { role:'user', message: text, result: result.result, confidence: result.confidence } } });
        } catch(e) {}
      }
    }
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: 'Analysis failed' });
  }
});

app.get('/api/history', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('chatHistory');
    res.json({ history: user.chatHistory.slice(-50).reverse() });
  } catch(err) { res.status(500).json({ error: 'Cannot fetch history' }); }
});

app.delete('/api/history', authenticateToken, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.userId, { $set: { chatHistory: [] } });
    res.json({ message: 'History cleared' });
  } catch(err) { res.status(500).json({ error: 'Cannot clear history' }); }
});

app.get('/api/health', (req, res) => res.json({ status:'OK', mongodb: mongoose.connection.readyState === 1 ? 'Connected':'Disconnected' }));

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  const mode = process.env.USE_AI_DETECTION === 'true' ? 'AI-Powered (Ollama)' : 'Keyword-Based';
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║   🔍 Fake News Detector — Running!       ║`);
  console.log(`║   Mode: ${mode.padEnd(30)}║`);
  console.log(`║   http://localhost:${PORT}                  ║`);
  console.log(`╚══════════════════════════════════════════╝\n`);
});