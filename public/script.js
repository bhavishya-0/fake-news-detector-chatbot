const State = {
  token:   localStorage.getItem('tl_token') || null,
  user:    JSON.parse(localStorage.getItem('tl_user') || 'null'),
  theme:   localStorage.getItem('tl_theme') || 'dark',
  isGuest: localStorage.getItem('tl_guest') === 'true',
  history: JSON.parse(localStorage.getItem('tl_local_history') || '[]'),
};
const API = window.location.origin;

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(State.theme);
  if (State.token || State.isGuest) enterApp();
  const input = document.getElementById('newsInput');
  if (input) input.addEventListener('input', () => {
    document.getElementById('charCount').textContent = `${input.value.length} / 2000`;
  });
});

// ── AUTH ──────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  document.querySelectorAll('.auth-tab')[tab === 'login' ? 0 : 1].classList.add('active');
  document.getElementById(tab === 'login' ? 'loginForm' : 'registerForm').classList.add('active');
  document.getElementById('loginError').textContent = '';
  document.getElementById('registerError').textContent = '';
}

function setLoading(formId, on) {
  const btn = document.querySelector(`#${formId} .auth-btn`);
  btn.disabled = on;
  btn.querySelector('.btn-text').classList.toggle('hidden', on);
  btn.querySelector('.btn-loader').classList.toggle('hidden', !on);
}

async function handleLogin() {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl    = document.getElementById('loginError');
  if (!email || !password) { errEl.textContent = 'Please fill in all fields.'; return; }
  setLoading('loginForm', true);
  try {
    const res  = await fetch(`${API}/api/auth/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 503) {
        errEl.textContent = 'Login service is unavailable right now. Use "Continue as Guest".';
      } else {
        errEl.textContent = data.error || 'Login failed. Please try again.';
      }
      return;
    }
    saveSession(data.token, data.user); enterApp();
  } catch { errEl.textContent = 'Network issue. Please try again.'; }
  finally { setLoading('loginForm', false); }
}

async function handleRegister() {
  const username = document.getElementById('regUsername').value.trim();
  const email    = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const errEl    = document.getElementById('registerError');
  if (!username || !email || !password) { errEl.textContent = 'Please fill in all fields.'; return; }
  setLoading('registerForm', true);
  try {
    const res  = await fetch(`${API}/api/auth/register`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, email, password }) });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 503) {
        errEl.textContent = 'Register service is unavailable right now. Use "Continue as Guest".';
      } else {
        errEl.textContent = data.error || 'Registration failed. Please try again.';
      }
      return;
    }
    saveSession(data.token, data.user); enterApp();
  } catch { errEl.textContent = 'Network issue. Please try again.'; }
  finally { setLoading('registerForm', false); }
}

function skipAuth() {
  State.isGuest = true;
  localStorage.setItem('tl_guest', 'true');
  enterApp();
}

function saveSession(token, user) {
  State.token = token; State.user = user; State.isGuest = false;
  localStorage.setItem('tl_token', token);
  localStorage.setItem('tl_user', JSON.stringify(user));
  localStorage.removeItem('tl_guest');
}

function handleLogout() {
  const isGuest = State.isGuest;
  ['tl_token','tl_user','tl_guest','tl_local_history'].forEach(k => localStorage.removeItem(k));
  Object.assign(State, { token:null, user:null, isGuest:false, history:[] });

  // Reset logout button text back to default
  const logoutBtn = document.getElementById('logoutBtn');
  logoutBtn.textContent = '⏻ Logout';
  logoutBtn.style.display = 'block';

  // Clear chat messages except intro
  document.getElementById('chatWindow')
    .querySelectorAll('.chat-message:not(.intro-msg)')
    .forEach(m => m.remove());

  document.getElementById('mainApp').classList.add('hidden');
  document.getElementById('authOverlay').classList.add('active');

  // Switch to login tab on logout
  switchTab('login');
}

function enterApp() {
  document.getElementById('authOverlay').classList.remove('active');
  document.getElementById('mainApp').classList.remove('hidden');
  const name = State.user?.username || 'Guest';
  document.getElementById('userDisplayName').textContent = name;
  document.getElementById('userAvatar').textContent = name[0].toUpperCase();
  if (State.isGuest) {
    document.getElementById('historyNavBtn').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'block';
    document.getElementById('logoutBtn').textContent = '⏻ Exit Guest';
  } else {
    document.getElementById('historyNavBtn').style.display = 'block';
    document.getElementById('logoutBtn').style.display = 'block';
    document.getElementById('logoutBtn').textContent = 'Logout';
  }
}

// ── NAVIGATION ────────────────────────────────────
function showSection(name, e) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById(`${name}Section`).classList.add('active');
  if (e?.currentTarget) e.currentTarget.classList.add('active');
  const titles = { chat:'Fake News Detector', tips:'Media Literacy Guide', history:'Detection History' };
  document.getElementById('pageTitle').textContent = titles[name];
  if (name === 'history') loadHistory();
  if (window.innerWidth <= 768) closeSidebar();
}

function toggleSidebar() {
  const s = document.getElementById('sidebar');
  s.classList.toggle('open');
  let o = document.getElementById('sidebarOverlay');
  if (!o) { o = document.createElement('div'); o.id='sidebarOverlay'; o.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:150;'; o.onclick=closeSidebar; document.getElementById('mainApp').appendChild(o); }
  o.style.display = s.classList.contains('open') ? 'block' : 'none';
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  const o = document.getElementById('sidebarOverlay');
  if (o) o.style.display = 'none';
}

// ── THEME ─────────────────────────────────────────
function toggleTheme() { applyTheme(State.theme === 'dark' ? 'light' : 'dark'); }
function applyTheme(theme) {
  State.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('tl_theme', theme);
  document.getElementById('themeIcon').textContent = theme === 'dark' ? '☀️' : '🌙';
}

// ── CHAT ──────────────────────────────────────────
async function analyzeNews() {
  const input = document.getElementById('newsInput');
  const text  = input.value.trim();
  if (!text) return showToast('Please enter some text to analyze.');
  if (text.length < 5) return showToast('Text too short. Enter a full headline.');

  appendUserMessage(text);
  input.value = ''; autoResize(input);
  document.getElementById('charCount').textContent = '0 / 2000';
  document.getElementById('examplePills').style.display = 'none';

  const typingId = showTyping();
  document.getElementById('sendBtn').disabled = true;

  try {
    const res  = await fetch(`${API}/api/detect`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', ...(State.token ? {'Authorization':`Bearer ${State.token}`} : {}) },
      body: JSON.stringify({ text, saveToHistory: !!State.token })
    });
    const data = await res.json();
    removeTyping(typingId);
    if (!res.ok) { appendBotMessage(`❌ ${data.error}`); return; }
    appendResultMessage(data);
    const entry = { text: text.substring(0,120), result:data.result, verdict:data.verdict, confidence:data.confidence, timestamp:new Date().toISOString() };
    State.history.unshift(entry);
    if (State.history.length > 50) State.history.pop();
    localStorage.setItem('tl_local_history', JSON.stringify(State.history));
  } catch {
    removeTyping(typingId);
    appendResultMessage(fallbackDetect(text));
  } finally {
    document.getElementById('sendBtn').disabled = false;
  }
}

function fallbackDetect(text) {
  const l = text.toLowerCase();
  const fw = ['shocking','wake up','sheeple','share before deleted','secret','they don\'t want','miracle cure','deep state'];
  const rw = ['according to','researchers','study shows','official','reuters','bbc','percent'];
  const fs = fw.filter(w => l.includes(w)).length;
  const rs = rw.filter(w => l.includes(w)).length;
  if (fs > rs) return { result:'fake',     verdict:'Likely Fake News',   emoji:'🚨', confidence:Math.min(80,50+fs*8), explanation:'Sensational language detected. Verify before sharing.', flags:[] };
  if (rs > fs) return { result:'real',     verdict:'Likely Real News',   emoji:'✅', confidence:Math.min(75,50+rs*8), explanation:'Credible language patterns found.', flags:[] };
  return           { result:'uncertain', verdict:'Uncertain',           emoji:'❓', confidence:0, explanation:'Cannot classify confidently. Check trusted sources.', flags:[] };
}

function handleKeyDown(e) { if (e.key==='Enter'&&!e.shiftKey) { e.preventDefault(); analyzeNews(); } }
function useExample(btn) {
  const input = document.getElementById('newsInput');
  input.value = btn.textContent.trim(); autoResize(input);
  document.getElementById('charCount').textContent = `${input.value.length} / 2000`;
  input.focus();
}
function autoResize(el) { el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,150)+'px'; }

// ── MESSAGES ──────────────────────────────────────
function appendUserMessage(text) {
  const chat = document.getElementById('chatWindow');
  const initial = (State.user?.username?.[0]||'G').toUpperCase();
  const div = document.createElement('div');
  div.className = 'chat-message user-message';
  div.innerHTML = `<div class="user-avatar-msg">${initial}</div><div class="message-bubble"><p>${esc(text)}</p></div>`;
  chat.appendChild(div); scrollChat();
}

function appendBotMessage(text) {
  const chat = document.getElementById('chatWindow');
  const div  = document.createElement('div');
  div.className = 'chat-message bot-message';
  div.innerHTML = `<div class="bot-avatar">🔍</div><div class="message-bubble"><p>${esc(text)}</p></div>`;
  chat.appendChild(div); scrollChat();
}

function appendResultMessage(data) {
  const chat = document.getElementById('chatWindow');
  const { result, verdict, emoji, confidence, explanation, flags=[] } = data;
  const flagsHtml = flags.length ? `<div class="flags-list">${flags.slice(0,5).map(f=>`<span class="flag-pill ${f.type}">${f.label}</span>`).join('')}</div>` : '';
  const div = document.createElement('div');
  div.className = 'chat-message bot-message';
  div.innerHTML = `
    <div class="bot-avatar">🔍</div>
    <div class="message-bubble">
      <div class="result-header">
        <span class="result-emoji">${emoji}</span>
        <span class="result-verdict ${result}">${verdict}</span>
      </div>
      ${result!=='uncertain'?`
      <div class="confidence-bar-wrapper">
        <div class="confidence-label"><span>Confidence</span><span>${confidence}%</span></div>
        <div class="confidence-bar"><div class="confidence-fill ${result}" data-width="${confidence}"></div></div>
      </div>`:''}
      <div class="result-explanation">${esc(explanation)}</div>
      ${flagsHtml}
    </div>`;
  chat.appendChild(div); scrollChat();
  setTimeout(() => { const f=div.querySelector('.confidence-fill'); if(f) f.style.width=f.dataset.width+'%'; }, 100);
}

function showTyping() {
  const id='typing-'+Date.now(), chat=document.getElementById('chatWindow');
  const div=document.createElement('div');
  div.id=id; div.className='chat-message bot-message typing-indicator';
  div.innerHTML=`<div class="bot-avatar">🔍</div><div class="message-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
  chat.appendChild(div); scrollChat(); return id;
}
function removeTyping(id) { const el=document.getElementById(id); if(el) el.remove(); }
function scrollChat() { const c=document.getElementById('chatWindow'); c.scrollTop=c.scrollHeight; }
function clearChat() {
  document.getElementById('chatWindow').querySelectorAll('.chat-message:not(.intro-msg)').forEach(m=>m.remove());
  document.getElementById('examplePills').style.display='';
}

// ── HISTORY ───────────────────────────────────────
async function loadHistory() {
  const list=document.getElementById('historyList');
  let items=[];
  if (State.token) {
    try {
      const res=await fetch(`${API}/api/history`,{headers:{'Authorization':`Bearer ${State.token}`}});
      if (res.ok) { const d=await res.json(); items=d.history.map(h=>({text:h.message,result:h.result,verdict:verdictLabel(h.result),confidence:h.confidence,timestamp:h.timestamp})); }
    } catch {}
  }
  if (!items.length) items=State.history;
  if (!items.length) { list.innerHTML=`<div class="empty-state"><span>📭</span><p>No history yet. Start analyzing news!</p></div>`; return; }
  list.innerHTML=items.map(i=>`
    <div class="history-item">
      <div class="history-item-header">
        <span class="history-verdict ${i.result}">${resultEmoji(i.result)} ${i.verdict||verdictLabel(i.result)}${i.confidence?' · '+i.confidence+'%':''}</span>
        <span class="history-time">${formatTime(i.timestamp)}</span>
      </div>
      <p class="history-text">${esc(i.text||'')}</p>
    </div>`).join('');
}

async function clearHistory() {
  if (!confirm('Clear all history?')) return;
  State.history=[]; localStorage.removeItem('tl_local_history');
  if (State.token) { try { await fetch(`${API}/api/history`,{method:'DELETE',headers:{'Authorization':`Bearer ${State.token}`}}); } catch{} }
  loadHistory();
}

// ── UTILS ─────────────────────────────────────────
function verdictLabel(r) { return {real:'Likely Real News',fake:'Likely Fake News',uncertain:'Uncertain'}[r]||'Unknown'; }
function resultEmoji(r)  { return {real:'✅',fake:'🚨',uncertain:'❓'}[r]||'🔍'; }
function formatTime(ts)  { if(!ts) return ''; const d=new Date(ts); return d.toLocaleDateString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}); }
function esc(text) { const d=document.createElement('div'); d.appendChild(document.createTextNode(text||'')); return d.innerHTML; }
function showToast(msg) {
  const existing=document.getElementById('toast'); if(existing) existing.remove();
  const t=document.createElement('div'); t.id='toast';
  t.style.cssText='position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);background:#1d4ed8;color:#fff;padding:0.65rem 1.25rem;border-radius:30px;font-size:0.85rem;font-weight:500;box-shadow:0 4px 20px rgba(0,0,0,0.3);z-index:9999;';
  t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),3000);
}