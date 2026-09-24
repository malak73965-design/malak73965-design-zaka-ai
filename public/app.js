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

// ==========================================
// 🎙️ GEMINI LIVE VOICE
// ==========================================

let liveSocket = null;
let liveStream = null;
let liveAudioContext = null;
let liveSource = null;
let liveProcessor = null;

let livePlaybackContext = null;
let liveNextPlayTime = 0;

const livePanel = document.getElementById('livePanel');
const liveCallBtn = document.getElementById('liveCallBtn');
const liveStopBtn = document.getElementById('liveStopBtn');
const liveStatus = document.getElementById('liveStatus');
const liveDot = document.getElementById('liveDot');
const liveMessages = document.getElementById('liveMessages');

function liveSetStatus(text, active = false) {
  if (liveStatus) liveStatus.textContent = text;
  if (liveDot) liveDot.classList.toggle('active', active);
}

function liveAddMessage(type, text) {
  if (!liveMessages || !text) return;

  const div = document.createElement('div');
  div.className = `live-message ${type}`;
  div.textContent = text;

  liveMessages.appendChild(div);
  liveMessages.scrollTop = liveMessages.scrollHeight;
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function pcm16ToFloat32(bytes) {
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength
  );

  const output = new Float32Array(bytes.byteLength / 2);

  for (let i = 0; i < output.length; i++) {
    output[i] = view.getInt16(i * 2, true) / 32768;
  }

  return output;
}

function playGeminiPCM(base64) {
  const bytes = base64ToBytes(base64);
  const samples = pcm16ToFloat32(bytes);

  if (!livePlaybackContext) {
    livePlaybackContext = new AudioContext({
      sampleRate: 24000
    });

    liveNextPlayTime =
      livePlaybackContext.currentTime;
  }

  const buffer =
    livePlaybackContext.createBuffer(
      1,
      samples.length,
      24000
    );

  buffer.copyToChannel(samples, 0);

  const source =
    livePlaybackContext.createBufferSource();

  source.buffer = buffer;
  source.connect(
    livePlaybackContext.destination
  );

  const now =
    livePlaybackContext.currentTime;

  if (liveNextPlayTime < now) {
    liveNextPlayTime = now;
  }

  source.start(liveNextPlayTime);

  liveNextPlayTime += buffer.duration;
}

function sendLiveAudio(float32) {
  if (
    !liveSocket ||
    liveSocket.readyState !== WebSocket.OPEN
  ) {
    return;
  }

  const pcm = new Int16Array(
    float32.length
  );

  for (let i = 0; i < float32.length; i++) {
    const value =
      Math.max(-1, Math.min(1, float32[i]));

    pcm[i] =
      value < 0
        ? value * 32768
        : value * 32767;
  }

  const bytes =
    new Uint8Array(pcm.buffer);

  let binary = '';

  for (
    let i = 0;
    i < bytes.length;
    i += 0x8000
  ) {
    binary += String.fromCharCode(
      ...bytes.subarray(
        i,
        i + 0x8000
      )
    );
  }

  liveSocket.send(
    JSON.stringify({
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: 'audio/pcm;rate=16000',
            data: btoa(binary)
          }
        ]
      }
    })
  );
}

async function startLiveMicrophone() {

  liveStream =
    await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

  liveAudioContext =
    new AudioContext({
      sampleRate: 16000
    });

  liveSource =
    liveAudioContext.createMediaStreamSource(
      liveStream
    );

  liveProcessor =
    liveAudioContext.createScriptProcessor(
      4096,
      1,
      1
    );

  liveProcessor.onaudioprocess =
    (event) => {

      const input =
        event.inputBuffer.getChannelData(0);

      sendLiveAudio(input);
    };

  liveSource.connect(liveProcessor);

  liveProcessor.connect(
    liveAudioContext.destination
  );
}

async function stopLiveMicrophone() {

  try {
    liveProcessor?.disconnect();
    liveSource?.disconnect();

    if (liveAudioContext) {
      await liveAudioContext.close();
    }
  } catch {}

  if (liveStream) {
    liveStream
      .getTracks()
      .forEach(track => track.stop());
  }

  liveProcessor = null;
  liveSource = null;
  liveAudioContext = null;
  liveStream = null;
}

async function startLiveCall() {

  if (liveSocket) return;

  try {

    liveSetStatus(
      'جاري الاتصال…'
    );

    const response =
      await fetch('/api/live/config');

    const config =
      await response.json();

    if (
      !response.ok ||
      !config.apiKey
    ) {
      throw new Error(
        config.error ||
        'Gemini Live غير مفعّل'
      );
    }

    const wsUrl =
      'wss://generativelanguage.googleapis.com/ws/' +
      'google.ai.generativelanguage.v1beta.' +
      'GenerativeService.BidiGenerateContent' +
      '?key=' +
      encodeURIComponent(config.apiKey);

    liveSocket =
      new WebSocket(wsUrl);

    liveSocket.onopen =
      async () => {

        liveSocket.send(
          JSON.stringify({
            setup: {
              model:
                `models/${config.model}`,

              responseModalities: [
                'AUDIO'
              ],

              systemInstruction: {
                parts: [
                  {
                    text:
                      'أنت مساعد صوتي عربي داخل تطبيق ذكا صناعي. تحدث بالعربية بشكل طبيعي وودود ومختصر. تعامل مع المستخدم كمكالمة صوتية مباشرة.'
                  }
                ]
              },

              inputAudioTranscription: {},

              outputAudioTranscription: {}
            }
          })
        );

        await startLiveMicrophone();

        liveCallBtn
          ?.classList
          .add('hidden');

        liveStopBtn
          ?.classList
          .remove('hidden');

        liveSetStatus(
          'متصل — تحدث الآن 🎙️',
          true
        );
      };

    liveSocket.onmessage =
      (event) => {

        try {

          const data =
            JSON.parse(event.data);

          const content =
            data.serverContent;

          if (!content) return;

          if (
            content.inputTranscription?.text
          ) {
            liveAddMessage(
              'user',
              content.inputTranscription.text
            );
          }

          if (
            content.outputTranscription?.text
          ) {
            liveAddMessage(
              'ai',
              content.outputTranscription.text
            );
          }

          if (content.modelTurn?.parts) {

            for (
              const part
              of content.modelTurn.parts
            ) {

              if (
                part.inlineData?.data
              ) {
                playGeminiPCM(
                  part.inlineData.data
                );
              }

              if (part.text) {
                liveAddMessage(
                  'ai',
                  part.text
                );
              }
            }
          }

        } catch (error) {
          console.error(
            'Live message error:',
            error
          );
        }
      };

    liveSocket.onerror =
      () => {

        liveSetStatus(
          '⚠️ خطأ في الاتصال'
        );
      };

    liveSocket.onclose =
      async () => {

        await stopLiveMicrophone();

        liveSocket = null;

        liveCallBtn
          ?.classList
          .remove('hidden');

        liveStopBtn
          ?.classList
          .add('hidden');

        liveSetStatus(
          'تم إنهاء المكالمة'
        );
      };

  } catch (error) {

    console.error(error);

    await stopLiveMicrophone();

    if (liveSocket) {
      try {
        liveSocket.close();
      } catch {}
    }

    liveSocket = null;

    liveSetStatus(
      '⚠️ ' +
      (
        error.message ||
        'تعذر بدء المكالمة'
      )
    );
  }
}

async function stopLiveCall() {

  await stopLiveMicrophone();

  if (liveSocket) {
    try {
      liveSocket.close();
    } catch {}
  }

  liveSocket = null;

  liveCallBtn
    ?.classList
    .remove('hidden');

  liveStopBtn
    ?.classList
    .add('hidden');

  liveSetStatus(
    'تم إنهاء المكالمة'
  );
}

liveCallBtn?.addEventListener(
  'click',
  startLiveCall
);

liveStopBtn?.addEventListener(
  'click',
  stopLiveCall
);