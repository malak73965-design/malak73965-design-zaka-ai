const state = {
  config: null,
  mode: 'chat',
  provider: 'openai',
  history: [],
  voiceId: '',
  recognition: null,
  recording: false,
};

const $ = (id) => document.getElementById(id);
const chat = $('chat');
const prompt = $('prompt');
const providerSelect = $('providerSelect');
const modelSelect = $('modelSelect');
const ratioSelect = $('ratioSelect');
const sizeSelect = $('sizeSelect');
const mediaResult = $('mediaResult');
const composer = $('composer');
const statusEl = $('status');
const voicePanel = $('voicePanel');
const ratioWrap = $('ratioWrap');
const sizeWrap = $('sizeWrap');

const esc = (s) => String(s ?? '').replace(/[&<>\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[c]));

function addMessage(role, text, meta = '') {
  const e = document.createElement('div');
  e.className = `msg ${role === 'user' ? 'user' : 'ai'}`;
  e.innerHTML = `${esc(text)}${meta ? `<div class="meta">${esc(meta)}</div>` : ''}`;
  chat.appendChild(e);
  chat.scrollTop = chat.scrollHeight;
}
function err(t) { addMessage('ai', `⚠️ ${t}`); }

async function api(url, opt = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opt.headers || {}) };
  const r = await fetch(url, { ...opt, headers });
  const ct = r.headers.get('content-type') || '';
  if (!r.ok) {
    let d = {};
    try { d = ct.includes('json') ? await r.json() : { error: await r.text() }; } catch {}
    throw new Error(d.error || 'Request failed');
  }
  return ct.includes('json') ? r.json() : r.blob();
}

function providerOptions() {
  const c = state.config?.providers || {};
  if (state.mode === 'chat') {
    return [
      ...(c.openai ? [{ id: 'openai', name: 'ChatGPT / OpenAI' }] : []),
      ...(c.gemini ? [{ id: 'gemini', name: 'Gemini' }] : []),
    ];
  }
  if (state.mode === 'image') {
    return [
      ...(c.geminiImage ? [{ id: 'gemini-image', name: 'Gemini Image' }] : []),
      ...(c.pixazo ? [{ id: 'pixazo-image', name: 'Pixazo Image' }] : []),
    ];
  }
  return c.pixazo ? [{ id: 'pixazo-video', name: 'Pixazo Video' }] : [];
}

function modelListFor(provider) {
  const m = state.config?.models || {};
  if (provider === 'openai') return m.openai || [];
  if (provider === 'gemini') return m.gemini || [];
  if (provider === 'gemini-image') return m.geminiImage || [];
  if (provider === 'pixazo-image') return m.pixazoImage || [];
  if (provider === 'pixazo-video') return m.pixazoVideo || [];
  return [];
}

function rebuildControls() {
  const options = providerOptions();
  providerSelect.innerHTML = '';
  for (const p of options) {
    const o = document.createElement('option');
    o.value = p.id; o.textContent = p.name; providerSelect.appendChild(o);
  }
  if (!options.some((x) => x.id === state.provider)) state.provider = options[0]?.id || '';
  providerSelect.value = state.provider;

  modelSelect.innerHTML = '';
  const models = modelListFor(state.provider);
  for (const model of models) {
    const o = document.createElement('option'); o.value = model; o.textContent = model; modelSelect.appendChild(o);
  }
  if (!models.length) {
    const o = document.createElement('option'); o.value = ''; o.textContent = 'لا يوجد نموذج مضبوط'; modelSelect.appendChild(o);
  }

  const imageMode = state.mode === 'image';
  ratioWrap.classList.toggle('hidden', !imageMode);
  sizeWrap.classList.toggle('hidden', !(imageMode && state.provider === 'gemini-image'));
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  const defaults = { chat: 'openai', image: 'gemini-image', video: 'pixazo-video' };
  state.provider = defaults[mode];
  mediaResult.classList.add('hidden');
  rebuildControls();
  prompt.placeholder = mode === 'chat' ? 'اكتب رسالتك…' : mode === 'image' ? 'صف الصورة التي تريدها…' : 'صف الفيديو الذي تريد توليده…';
}

async function load() {
  state.config = await api('/api/config');
  const active = Object.values(state.config.providers).filter(Boolean).length;
  statusEl.textContent = active ? `متصل · ${active} مزوّد` : 'لا توجد مفاتيح مضبوطة';
  setMode('chat');
  if (state.config.providers.elevenlabs) {
    try {
      const d = await api('/api/voices');
      state.voiceId = d.voices?.[0]?.voice_id || '';
    } catch {}
  }
}

async function chatSend(text) {
  const provider = state.provider;
  const model = modelSelect.value;
  if (!['openai', 'gemini'].includes(provider)) throw new Error('اختر نموذج محادثة.');
  if (!model) throw new Error('لا يوجد نموذج محادثة مضبوط.');

  state.history.push({ role: 'user', content: text });
  addMessage('user', text);
  const t = document.createElement('div');
  t.className = 'msg ai'; t.textContent = 'يكتب…'; chat.appendChild(t);
  chat.scrollTop = chat.scrollHeight;

  try {
    const d = await api('/api/chat', { method: 'POST', body: JSON.stringify({ provider, model, messages: state.history }) });
    t.remove();
    state.history.push({ role: 'assistant', content: d.text });
    addMessage('ai', d.text, `${provider === 'openai' ? 'ChatGPT' : 'Gemini'} · ${model}`);
    await speak(d.text);
  } catch (e) {
    t.remove(); state.history.pop(); throw e;
  }
}

async function pollPixazo(pollingUrl, kind) {
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const d = await api('/api/pixazo/status', { method: 'POST', body: JSON.stringify({ pollingUrl }) });
    if (d.mediaUrl) return d.mediaUrl;
    if (['FAILED', 'ERROR', 'CANCELLED', 'processing_failed'].includes(String(d.status).toUpperCase())) {
      throw new Error('فشل توليد الوسائط عبر Pixazo.');
    }
    mediaResult.querySelector('.job-state').textContent = `الحالة: ${d.status || 'PROCESSING'}…`;
  }
  throw new Error(`انتهى وقت انتظار ${kind}. جرّب مرة أخرى.`);
}

async function media(kind, text) {
  const model = modelSelect.value;
  if (!model) throw new Error('لا يوجد نموذج متاح لهذا الوضع.');
  mediaResult.classList.remove('hidden');
  mediaResult.innerHTML = `<div class="meta job-state">جاري التوليد عبر ${esc(model)}…</div>`;

  let data;
  if (kind === 'image' && state.provider === 'gemini-image') {
    data = await api('/api/gemini-image', {
      method: 'POST',
      body: JSON.stringify({ model, prompt: text, aspectRatio: ratioSelect.value, imageSize: sizeSelect.value }),
    });
  } else {
    data = await api(`/api/${kind}`, {
      method: 'POST',
      body: JSON.stringify({ model, prompt: text, aspectRatio: ratioSelect.value }),
    });
  }

  let url = data[`${kind}Url`];
  if (!url && data.pollingUrl) url = await pollPixazo(data.pollingUrl, kind);
  if (!url) throw new Error('تم إرسال المهمة، لكن لم يرجع المزود رابط الناتج.');

  mediaResult.innerHTML = kind === 'image'
    ? `<img src="${esc(url)}" alt="generated"><div class="meta"><a target="_blank" rel="noopener" href="${esc(url)}">فتح الصورة</a></div>`
    : `<video src="${esc(url)}" controls playsinline></video><div class="meta"><a target="_blank" rel="noopener" href="${esc(url)}">فتح الفيديو</a></div>`;
}

async function speak(text) {
  if (!state.config?.providers.elevenlabs || !text) return;
  try {
    const r = await fetch('/api/tts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voiceId: state.voiceId }),
    });
    if (!r.ok) return;
    const u = URL.createObjectURL(await r.blob());
    const a = new Audio(u); a.play().catch(() => {}); a.onended = () => URL.revokeObjectURL(u);
  } catch {}
}

function setupSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  const r = new SR(); r.lang = 'ar'; r.interimResults = false; r.continuous = false;
  r.onstart = () => { state.recording = true; $('micBtn').classList.add('recording'); $('voiceMic').classList.add('recording'); $('voiceState').textContent = 'استمع…'; };
  r.onend = () => { state.recording = false; $('micBtn').classList.remove('recording'); $('voiceMic').classList.remove('recording'); $('voiceState').textContent = 'اضغط الميكروفون وتحدث'; };
  r.onresult = (e) => { prompt.value = e.results[0][0].transcript; resize(); };
  state.recognition = r;
}
function mic() { if (!state.recognition) return err('التعرف على الكلام غير مدعوم هنا. جرّب Chrome على أندرويد.'); state.recording ? state.recognition.stop() : state.recognition.start(); }
function resize() { prompt.style.height = 'auto'; prompt.style.height = `${Math.min(prompt.scrollHeight, 180)}px`; }

for (const button of document.querySelectorAll('.mode-btn')) button.onclick = () => setMode(button.dataset.mode);
providerSelect.onchange = () => { state.provider = providerSelect.value; rebuildControls(); };
$('micBtn').onclick = mic;
$('voiceMic').onclick = mic;
$('voiceToggle').onclick = () => voicePanel.classList.toggle('hidden');
$('clearBtn').onclick = () => { state.history = []; chat.innerHTML = ''; mediaResult.innerHTML = ''; mediaResult.classList.add('hidden'); };
prompt.oninput = resize;
prompt.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); composer.requestSubmit(); } };
composer.onsubmit = async (e) => {
  e.preventDefault();
  const text = prompt.value.trim(); if (!text) return;
  prompt.value = ''; resize();
  try {
    if (state.mode === 'chat') await chatSend(text); else await media(state.mode, text);
  } catch (x) { err(x.message); }
};

setupSpeech();
load().catch((e) => { statusEl.textContent = 'تعذر الاتصال بالسيرفر'; err(e.message); });
addMessage('ai', 'مرحبًا 👋\nاختر ChatGPT أو Gemini للمحادثة، أو Gemini Image / Pixazo للصور، أو Pixazo للفيديو.');
