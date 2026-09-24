const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  config: null,
  mode: 'chat',
  provider: 'gemini',
  model: '',
  imageProvider: 'gemini',
  imageModel: '',
  messages: [],
  chats: [],
  currentChatId: null,
  character: null,
  busy: false,
  live: {
    socket: null,
    stream: null,
    audioContext: null,
    source: null,
    processor: null,
    outputGain: null,
    silentGain: null,
    nextPlayTime: 0,
    active: false,
    connecting: false,
    stopping: false
  }
};

const STORAGE = {
  chats: 'zaka_chats_v2',
  theme: 'zaka_theme_v2',
  character: 'zaka_character_v2'
};

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function toast(message, kind = '') {
  const wrap = $('#toastWrap');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3400);
}

function setBusy(button, busy, text = 'جاري التنفيذ...') {
  if (!button) return;
  if (busy) {
    button.dataset.oldText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span>${text}`;
  } else {
    button.disabled = false;
    button.innerHTML = button.dataset.oldText || button.innerHTML;
  }
}

function saveChats() {
  localStorage.setItem(STORAGE.chats, JSON.stringify(state.chats));
}

function loadLocal() {
  try {
    state.chats = JSON.parse(localStorage.getItem(STORAGE.chats) || '[]');
    state.character = JSON.parse(localStorage.getItem(STORAGE.character) || 'null');
    const theme = localStorage.getItem(STORAGE.theme);
    document.body.classList.toggle('light', theme === 'light');
  } catch {
    state.chats = [];
  }
}

function createChat(title = 'محادثة جديدة') {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    title,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function currentChat() {
  return state.chats.find((c) => c.id === state.currentChatId) || null;
}

function ensureChat() {
  let chat = currentChat();
  if (!chat) {
    chat = createChat();
    state.chats.unshift(chat);
    state.currentChatId = chat.id;
    state.messages = chat.messages;
    saveChats();
  }
  return chat;
}

function renderHistory() {
  const box = $('#history');
  box.innerHTML = '';
  if (!state.chats.length) {
    box.innerHTML = '<div class="history-empty">لا توجد محادثات محفوظة بعد.</div>';
    return;
  }
  state.chats.slice(0, 40).forEach((chat) => {
    const btn = document.createElement('button');
    btn.className = `history-item ${chat.id === state.currentChatId ? 'active' : ''}`;
    btn.innerHTML = `<span>💬</span><span class="title">${escapeHtml(chat.title || 'محادثة')}</span>`;
    btn.onclick = () => selectChat(chat.id);
    box.appendChild(btn);
  });
}

function selectChat(id) {
  state.currentChatId = id;
  const chat = currentChat();
  state.messages = chat ? chat.messages : [];
  renderHistory();
  renderMessages();
  $('#menuBtn')?.closest('.sidebar')?.classList.remove('open');
}

function newChat() {
  stopLiveCall(false);
  state.currentChatId = null;
  state.messages = [];
  ensureChat();
  renderHistory();
  renderMessages();
  $('#chatInput').focus();
}

function updateCurrentChat() {
  const chat = ensureChat();
  chat.messages = state.messages;
  chat.updatedAt = Date.now();
  const firstUser = state.messages.find((m) => m.role === 'user');
  if (firstUser && (!chat.title || chat.title === 'محادثة جديدة')) {
    chat.title = String(firstUser.content).slice(0, 38);
  }
  state.chats = state.chats.filter((c) => c.id !== chat.id);
  state.chats.unshift(chat);
  saveChats();
  renderHistory();
}

function renderMessages() {
  const box = $('#chatScroll');
  if (!state.messages.length) {
    box.innerHTML = `<div class="empty-state" id="emptyState"><div class="empty-icon">✦</div><h2>جاهز لك</h2><p>اختر النموذج واكتب رسالتك. النماذج المتاحة تُكتشف تلقائيًا من API.</p></div>`;
    return;
  }
  box.innerHTML = '';
  for (const message of state.messages) addMessageBubble(message, false);
  box.scrollTop = box.scrollHeight;
}

function addMessageBubble(message, scroll = true) {
  $('#emptyState')?.remove();
  const row = document.createElement('div');
  row.className = `message ${message.role === 'user' ? 'user' : 'ai'}`;
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = message.role === 'user' ? '👤' : '✦';
  const wrap = document.createElement('div');
  wrap.className = 'msg-wrap';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = message.content || '';
  wrap.appendChild(bubble);

  if (message.role !== 'user') {
    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    const copy = document.createElement('button');
    copy.className = 'msg-action';
    copy.textContent = '📋 نسخ';
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(message.content || '');
        copy.textContent = '✅ تم النسخ';
        setTimeout(() => copy.textContent = '📋 نسخ', 1200);
      } catch { toast('تعذر النسخ.', 'error'); }
    };
    actions.appendChild(copy);

    if (state.config?.providers?.elevenlabs) {
      const speak = document.createElement('button');
      speak.className = 'msg-action';
      speak.textContent = '🔊 استماع';
      speak.onclick = () => speakText(message.content, speak);
      actions.appendChild(speak);
    }
    if (state.config?.providers?.telegram) {
      const sendTelegram = document.createElement('button');
      sendTelegram.className = 'msg-action';
      sendTelegram.textContent = '✈️ Telegram';
      sendTelegram.onclick = () => sendToTelegram(message.content, sendTelegram);
      actions.appendChild(sendTelegram);
    }
    wrap.appendChild(actions);
  }

  row.append(avatar, wrap);
  $('#chatScroll').appendChild(row);
  if (scroll) $('#chatScroll').scrollTop = $('#chatScroll').scrollHeight;
  return bubble;
}

async function speakText(text, button) {
  try {
    button.disabled = true;
    button.textContent = '⏳';
    const r = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await r.arrayBuffer();
    if (!r.ok) {
      let message = 'تعذر تشغيل الصوت.';
      try { message = JSON.parse(new TextDecoder().decode(data)).error || message; } catch {}
      throw new Error(message);
    }
    const url = URL.createObjectURL(new Blob([data], { type: 'audio/mpeg' }));
    const audio = new Audio(url);
    await audio.play();
    audio.onended = () => URL.revokeObjectURL(url);
  } catch (error) {
    toast(error.message || 'تعذر تشغيل الصوت.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = '🔊 استماع';
  }
}

async function sendToTelegram(text, button) {
  try {
    button.disabled = true;
    const r = await fetch('/api/telegram/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || 'تعذر الإرسال.');
    button.textContent = '✅ أُرسل';
  } catch (error) {
    button.disabled = false;
    toast(error.message || 'تعذر إرسال Telegram.', 'error');
  }
}

function setMode(mode) {
  state.mode = mode;
  $$('.mode-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.mode === mode));
  $('#chatPanel').classList.toggle('hidden', mode !== 'chat');
  $('#imagePanel').classList.toggle('hidden', mode !== 'image');
  $('#videoPanel').classList.toggle('hidden', mode !== 'video');
  $('#livePanel').classList.toggle('hidden', mode !== 'live');
  $('#composerWrap').classList.toggle('hidden', mode === 'live' || mode === 'video' || mode === 'image');
  $('#heroCard').classList.toggle('hidden', mode === 'live');
  if (mode === 'live') stopLiveCall(false);
}

function fillSelect(select, items, current = '') {
  select.innerHTML = '';
  if (!items.length) {
    select.innerHTML = '<option value="">لا يوجد</option>';
    return;
  }
  items.forEach((item) => {
    const id = typeof item === 'string' ? item : item.id;
    const label = typeof item === 'string' ? item : item.label || item.id;
    const option = document.createElement('option');
    option.value = id;
    option.textContent = label;
    option.selected = id === current;
    select.appendChild(option);
  });
  if (!select.value) select.value = items[0].id || items[0];
}

function providerChoices() {
  const choices = [];
  if (state.config?.providers?.gemini) choices.push({ id: 'gemini', label: '✨ Gemini' });
  if (state.config?.providers?.openai) choices.push({ id: 'openai', label: '◉ OpenAI' });
  return choices;
}

function setupSelectors() {
  const providerList = providerChoices();
  fillSelect($('#chatProvider'), providerList, state.config?.defaults?.chatProvider || providerList[0]?.id);
  state.provider = $('#chatProvider').value || 'gemini';
  updateChatModels();

  const imageProviders = [];
  if (state.config?.providers?.geminiImage) imageProviders.push({ id: 'gemini', label: '✨ Gemini Image' });
  if (state.config?.providers?.pixazo) imageProviders.push({ id: 'pixazo', label: '🪄 Pixazo' });
  fillSelect($('#imageProvider'), imageProviders, state.config?.defaults?.imageProvider || imageProviders[0]?.id);
  state.imageProvider = $('#imageProvider').value || 'gemini';
  updateImageModels();

  const vids = state.config?.models?.pixazoVideo || [];
  fillSelect($('#videoModel'), vids.map((id) => ({ id, label: videoLabel(id) })), vids[0]);
}

function updateChatModels() {
  const models = state.provider === 'openai' ? (state.config?.models?.openai || []) : (state.config?.models?.gemini || []);
  const desired = state.model || state.config?.defaults?.chatModel;
  fillSelect($('#chatModel'), models, desired);
  state.model = $('#chatModel').value || '';
}

function updateImageModels() {
  const models = state.imageProvider === 'pixazo' ? (state.config?.models?.pixazoImage || []) : (state.config?.models?.geminiImage || []);
  fillSelect($('#imageModel'), models.map((id) => ({ id, label: imageLabel(id) })), state.imageModel);
  state.imageModel = $('#imageModel').value || '';
  const isGemini = state.imageProvider === 'gemini';
  $('#imageSize').disabled = !isGemini;
  $('#imageAspect').disabled = false;
}

function imageLabel(id) {
  const map = {
    'gemini-3.1-flash-image': 'Gemini 3.1 Flash Image',
    'gemini-3-pro-image': 'Gemini 3 Pro Image',
    'gemini-3.1-flash-lite-image': 'Gemini 3.1 Flash Lite Image',
    flux: 'FLUX 1 Schnell • مجاني',
    'gpt-image-2-5-flare': 'GPT Image 2.5 Flare'
  };
  return map[id] || id;
}

function videoLabel(id) {
  return ({
    ltx: 'LTX • مجاني',
    'ltx-2-5-lite': 'LTX 2.5 Lite',
    'ltx-2-5-pro': 'LTX 2.5 Pro',
    'flux-3-video': 'FLUX 3 Video'
  })[id] || id;
}

async function loadConfig(showToast = false) {
  try {
    const r = await fetch('/api/config', { cache: 'no-store' });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || 'تعذر تحميل إعدادات التطبيق.');
    state.config = data;
    setupSelectors();
    const pill = $('#connectionPill');
    const dot = pill.querySelector('.status-dot');
    dot.className = 'status-dot ok';
    pill.querySelector('span:last-child').textContent = 'الاتصال سليم';
    if (showToast) toast('تم تحديث النماذج.', 'success');
  } catch (error) {
    const pill = $('#connectionPill');
    const dot = pill.querySelector('.status-dot');
    dot.className = 'status-dot bad';
    pill.querySelector('span:last-child').textContent = 'تحقق من الخادم';
    toast(error.message || 'تعذر تحميل الإعدادات.', 'error');
  }
}

async function refreshModels() {
  $('#refreshModelsBtn').disabled = true;
  await loadConfig(true);
  $('#refreshModelsBtn').disabled = false;
}

function buildSystemMessages() {
  const system = [
    'أنت مساعد عربي داخل تطبيق ذكا صناعي. أجب بوضوح وودّ، وكن عمليًا ومختصرًا عند الأسئلة البسيطة. استخدم العربية ما لم يطلب المستخدم لغة أخرى.'
  ];
  if (state.character) {
    system.push(`الشخصية المطلوبة: الاسم ${state.character.name || 'غير محدد'}. الشخصية ${state.character.personality || 'ودودة'}. المظهر ${state.character.appearance || 'غير محدد'}. التعليمات ${state.character.instructions || 'لا توجد تعليمات إضافية'}.`);
  }
  return [{ role: 'system', content: system.join('\n') }];
}

async function submitChat() {
  const input = $('#chatInput');
  const text = input.value.trim();
  if (!text || state.busy) return;
  state.busy = true;
  const chat = ensureChat();
  const userMessage = { role: 'user', content: text, time: Date.now() };
  state.messages.push(userMessage);
  addMessageBubble(userMessage);
  input.value = '';
  input.style.height = 'auto';
  updateCurrentChat();

  const thinking = { role: 'assistant', content: 'يفكر…', time: Date.now(), temporary: true };
  const bubble = addMessageBubble(thinking);

  try {
    const payloadMessages = [...buildSystemMessages(), ...state.messages.filter((m) => !m.temporary)];
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: state.provider, model: state.model, messages: payloadMessages })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || 'تعذر الحصول على رد.');
    state.messages = state.messages.filter((m) => !m.temporary);
    state.messages.push({ role: 'assistant', content: data.text || 'لم يصل رد.', time: Date.now(), model: data.model });
    renderMessages();
    updateCurrentChat();
  } catch (error) {
    bubble.textContent = `⚠️ ${error.message || 'حدث خطأ.'}`;
    state.messages = state.messages.filter((m) => !m.temporary);
    updateCurrentChat();
  } finally {
    state.busy = false;
    $('#chatInput').focus();
  }
}

async function generateImage(event) {
  event.preventDefault();
  const prompt = $('#imagePrompt').value.trim();
  if (!prompt) return toast('اكتب وصف الصورة أولًا.', 'error');
  const btn = $('#imageSubmitBtn');
  const result = $('#imageResult');
  setBusy(btn, true, 'جاري الإنشاء…');
  result.innerHTML = '<div class="result-status">🧠 جاري تحويل الوصف إلى صورة…</div>';
  try {
    const endpoint = state.imageProvider === 'gemini' ? '/api/gemini-image' : '/api/image';
    const body = {
      model: state.imageModel,
      prompt,
      aspectRatio: $('#imageAspect').value,
      imageSize: $('#imageSize').value
    };
    const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || 'تعذر إنشاء الصورة.');
    if (data.imageUrl) {
      renderImageResult(result, data.imageUrl, data.model);
    } else if (data.jobId) {
      result.innerHTML = '<div class="result-status">⏳ الطلب دخل قائمة المعالجة…</div>';
      await pollPixazo(data.jobId, 'image', result);
    } else {
      throw new Error('المزود لم يرجع صورة أو مهمة معالجة.');
    }
  } catch (error) {
    result.innerHTML = `<div class="result-status result-error">⚠️ ${escapeHtml(error.message || 'حدث خطأ')}</div>`;
  } finally {
    setBusy(btn, false);
  }
}

function renderImageResult(result, url, model) {
  result.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'image-result';
  wrap.innerHTML = `<img src="${url}" alt="صورة مولدة" /><div class="media-actions"><a class="secondary-btn" href="${url}" target="_blank" rel="noopener">🔗 فتح</a><button class="secondary-btn" type="button">💾 حفظ</button></div>`;
  const saveBtn = wrap.querySelector('button');
  saveBtn.onclick = async () => {
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = `zaka-image-${Date.now()}.png`;
      a.click();
    } catch { toast('تعذر الحفظ المباشر.', 'error'); }
  };
  result.appendChild(wrap);
  toast(`تم إنشاء الصورة عبر ${imageLabel(model)}.`, 'success');
}

async function generateVideo(event) {
  event.preventDefault();
  const prompt = $('#videoPrompt').value.trim();
  if (!prompt) return toast('اكتب وصف الفيديو أولًا.', 'error');
  const btn = $('#videoSubmitBtn');
  const result = $('#videoResult');
  setBusy(btn, true, 'جاري الطلب…');
  result.innerHTML = '<div class="result-status">🎬 إرسال مهمة الفيديو…</div>';
  try {
    const r = await fetch('/api/video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: $('#videoModel').value,
        prompt,
        duration: Number($('#videoDuration').value),
        resolution: $('#videoResolution').value,
        aspectRatio: $('#videoAspect').value
      })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || 'تعذر بدء الفيديو.');
    if (data.videoUrl) {
      renderVideoResult(result, data.videoUrl);
    } else if (data.jobId) {
      result.innerHTML = '<div class="result-status">⏳ الفيديو قيد المعالجة. سننتظر النتيجة تلقائيًا…</div>';
      await pollPixazo(data.jobId, 'video', result);
    } else {
      throw new Error('المزود لم يرجع رابط فيديو أو مهمة معالجة.');
    }
  } catch (error) {
    result.innerHTML = `<div class="result-status result-error">⚠️ ${escapeHtml(error.message || 'حدث خطأ')}</div>`;
  } finally {
    setBusy(btn, false);
  }
}

async function pollPixazo(jobId, kind, result, attempts = 0) {
  if (attempts > 90) throw new Error('استغرق التوليد وقتًا أطول من المتوقع. جرّب فحص المهمة لاحقًا.');
  const r = await fetch('/api/pixazo/status', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error || 'تعذر فحص حالة المهمة.');
  const status = String(data.status || '').toUpperCase();
  if (status === 'COMPLETED' || data.mediaUrl) {
    if (kind === 'image') renderImageResult(result, data.mediaUrl, 'pixazo');
    else renderVideoResult(result, data.mediaUrl);
    return;
  }
  if (status === 'ERROR' || status === 'FAILED') throw new Error(data?.raw?.error || 'فشلت مهمة Pixazo.');
  result.innerHTML = `<div class="result-status">⏳ الحالة: ${escapeHtml(data.status || 'PROCESSING')} • محاولة ${attempts + 1}</div>`;
  await new Promise((resolve) => setTimeout(resolve, 4000));
  return pollPixazo(jobId, kind, result, attempts + 1);
}

function renderVideoResult(result, url) {
  result.innerHTML = `<div class="video-result"><video controls playsinline src="${url}"></video><div class="media-actions"><a class="secondary-btn" href="${url}" target="_blank" rel="noopener">🔗 فتح الفيديو</a></div></div>`;
  toast('تم تجهيز الفيديو.', 'success');
}

async function startLiveCall() {
  const L = state.live;
  if (L.active || L.connecting) return;
  L.connecting = true;
  L.stopping = false;
  $('#liveCallBtn').classList.add('hidden');
  $('#liveStopBtn').classList.remove('hidden');
  $('#liveStatus').textContent = '⏳ جاري الاتصال…';
  $('#liveRing').classList.add('active');
  $('#liveTranscript').textContent = '';

  try {
    const tokenResponse = await fetch('/api/live-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) throw new Error(tokenData?.error || 'تعذر إنشاء اتصال اللايف.');

    if (!navigator.mediaDevices?.getUserMedia) throw new Error('المتصفح لا يدعم الميكروفون.');
    L.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await L.audioContext.resume();

    L.outputGain = L.audioContext.createGain();
    L.outputGain.gain.value = 1;
    L.outputGain.connect(L.audioContext.destination);

    L.silentGain = L.audioContext.createGain();
    L.silentGain.gain.value = 0;
    L.silentGain.connect(L.audioContext.destination);
    L.nextPlayTime = L.audioContext.currentTime;

    L.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });

    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(tokenData.token)}`;
    L.socket = new WebSocket(wsUrl);

    L.socket.onopen = () => {
      L.socket.send(JSON.stringify({
        setup: {
          model: `models/${tokenData.model || 'gemini-3.8-live'}`,
          generationConfig: { responseModalities: ['AUDIO'] },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          sessionResumption: {},
          systemInstruction: {
            parts: [{ text: 'أنت مساعد صوتي عربي داخل ذكا صناعي. تحدث بالعربية بشكل طبيعي وودود ومختصر، وتعامل مع الحوار كمكالمة صوتية مباشرة. لا تقطع المستخدم، واسمع ثم أجب صوتيًا.' }]
          }
        }
      }));
      $('#liveStatus').textContent = '⏳ تم الاتصال، انتظر قليلًا…';
    };

    L.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.setupComplete) {
          beginLiveMicrophone();
          $('#liveStatus').textContent = '🟢 متصل — تحدث الآن';
          return;
        }
        const serverContent = message.serverContent;
        if (!serverContent) return;
        const t = serverContent.outputTranscription?.text || serverContent.inputTranscription?.text || serverContent.interimInputTranscription?.text;
        if (t) $('#liveTranscript').textContent = t;
        if (serverContent.interrupted) L.nextPlayTime = L.audioContext?.currentTime || 0;
        for (const part of serverContent.modelTurn?.parts || []) {
          const audio = part?.inlineData?.data;
          if (audio) playPcm24k(audio);
        }
      } catch (error) {
        console.error('Live message error', error);
      }
    };

    L.socket.onerror = () => {
      if (!L.stopping) $('#liveStatus').textContent = '⚠️ حدث خطأ في الاتصال.';
    };
    L.socket.onclose = () => {
      if (!L.stopping) {
        stopLiveCall(true);
        $('#liveStatus').textContent = '⚠️ انتهت المكالمة.';
      }
    };
  } catch (error) {
    stopLiveCall(true);
    $('#liveStatus').textContent = `⚠️ ${error.message || 'تعذر بدء المكالمة.'}`;
  } finally {
    L.connecting = false;
  }
}

function floatTo16BitBase64(float32, rate) {
  const target = 16000;
  const ratio = rate / target;
  const length = Math.max(1, Math.round(float32.length / ratio));
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(float32.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) { sum += float32[j]; count++; }
    samples[i] = count ? sum / count : 0;
  }
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  return btoa(binary);
}

function beginLiveMicrophone() {
  const L = state.live;
  if (!L.socket || L.socket.readyState !== WebSocket.OPEN || !L.stream || !L.audioContext || L.processor) return;
  L.source = L.audioContext.createMediaStreamSource(L.stream);
  L.processor = L.audioContext.createScriptProcessor(4096, 1, 1);
  L.processor.onaudioprocess = (event) => {
    if (!L.active || !L.socket || L.socket.readyState !== WebSocket.OPEN) return;
    const data = event.inputBuffer.getChannelData(0);
    const audio = floatTo16BitBase64(data, L.audioContext.sampleRate);
    L.socket.send(JSON.stringify({ realtimeInput: { audio: { data: audio, mimeType: 'audio/pcm;rate=16000' } } }));
  };
  L.source.connect(L.processor);
  L.processor.connect(L.silentGain);
  L.active = true;
}

function base64Bytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function playPcm24k(base64) {
  const L = state.live;
  if (!L.audioContext || !L.outputGain) return;
  try {
    const bytes = base64Bytes(base64);
    const count = Math.floor(bytes.byteLength / 2);
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, count);
    const buffer = L.audioContext.createBuffer(1, samples.length, 24000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768;
    const source = L.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(L.outputGain);
    const now = L.audioContext.currentTime;
    const start = Math.max(now, L.nextPlayTime);
    source.start(start);
    L.nextPlayTime = start + buffer.duration;
  } catch (error) {
    console.error('Playback error', error);
  }
}

function stopLiveCall(updateUi = true) {
  const L = state.live;
  L.stopping = true;
  L.active = false;
  L.connecting = false;
  try { L.processor?.disconnect(); } catch {}
  try { L.source?.disconnect(); } catch {}
  L.processor = null; L.source = null;
  if (L.stream) L.stream.getTracks().forEach((track) => track.stop());
  L.stream = null;
  try { L.socket?.close(); } catch {}
  L.socket = null;
  try { L.audioContext?.close(); } catch {}
  L.audioContext = null; L.outputGain = null; L.silentGain = null; L.nextPlayTime = 0;
  if (updateUi) {
    $('#liveCallBtn').classList.remove('hidden');
    $('#liveStopBtn').classList.add('hidden');
    $('#liveRing').classList.remove('active');
    $('#liveStatus').textContent = 'تم إنهاء المكالمة';
  }
  setTimeout(() => L.stopping = false, 0);
}

function saveCharacter() {
  state.character = {
    name: $('#charName').value.trim(),
    personality: $('#charPersonality').value.trim(),
    appearance: $('#charAppearance').value.trim(),
    instructions: $('#charInstructions').value.trim()
  };
  localStorage.setItem(STORAGE.character, JSON.stringify(state.character));
  $('#characterModal').classList.add('hidden');
  toast('تم حفظ الشخصية.', 'success');
}

function loadCharacterForm() {
  if (!state.character) return;
  $('#charName').value = state.character.name || '';
  $('#charPersonality').value = state.character.personality || '';
  $('#charAppearance').value = state.character.appearance || '';
  $('#charInstructions').value = state.character.instructions || '';
}

function initEvents() {
  $('#composer').addEventListener('submit', (event) => { event.preventDefault(); submitChat(); });
  $('#chatInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('#composer').requestSubmit(); }
  });
  $('#chatInput').addEventListener('input', () => {
    const el = $('#chatInput');
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  });
  $('#chatProvider').addEventListener('change', () => { state.provider = $('#chatProvider').value; state.model = ''; updateChatModels(); });
  $('#chatModel').addEventListener('change', () => { state.model = $('#chatModel').value; });
  $('#imageProvider').addEventListener('change', () => { state.imageProvider = $('#imageProvider').value; state.imageModel = ''; updateImageModels(); });
  $('#imageModel').addEventListener('change', () => { state.imageModel = $('#imageModel').value; });
  $('#refreshModelsBtn').onclick = refreshModels;
  $('#imageForm').addEventListener('submit', generateImage);
  $('#videoForm').addEventListener('submit', generateVideo);

  $$('.mode-tab').forEach((btn) => btn.onclick = () => setMode(btn.dataset.mode));
  $$('.quick-chip').forEach((btn) => btn.onclick = () => { setMode('chat'); $('#chatInput').value = btn.dataset.quick; $('#chatInput').focus(); });
  $$('.secondary-btn[data-fill]').forEach((btn) => btn.onclick = () => $('#imagePrompt').value = btn.dataset.fill);
  $$('.secondary-btn[data-fill-video]').forEach((btn) => btn.onclick = () => $('#videoPrompt').value = btn.dataset.fillVideo);
  $('#newChatBtn').onclick = newChat; $('#newTopBtn').onclick = newChat;
  $('#clearBtn').onclick = () => { state.messages = []; const chat = currentChat(); if (chat) chat.messages = []; saveChats(); renderMessages(); toast('تم مسح المحادثة.', 'success'); };
  $('#themeBtn').onclick = () => {
    const light = document.body.classList.toggle('light');
    localStorage.setItem(STORAGE.theme, light ? 'light' : 'dark');
    $('#themeBtn span').textContent = light ? 'الوضع الداكن' : 'الوضع الليلي';
  };
  $('#settingsBtn').onclick = () => $('#settingsModal').classList.remove('hidden');
  $('#characterBtn').onclick = () => { loadCharacterForm(); $('#characterModal').classList.remove('hidden'); };
  $('#saveCharacterBtn').onclick = saveCharacter;
  $('#liveCallBtn').onclick = startLiveCall; $('#liveStopBtn').onclick = () => stopLiveCall(true);
  $('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');
  $$('.modal-close').forEach((btn) => btn.onclick = () => $('#' + btn.dataset.close).classList.add('hidden'));
  $$('.modal-backdrop').forEach((backdrop) => backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.classList.add('hidden'); }));
  window.addEventListener('beforeunload', () => stopLiveCall(false));
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

function applySpinnerCss() {
  const style = document.createElement('style');
  style.textContent = '.spinner{display:inline-block;width:13px;height:13px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;margin-inline-end:7px;vertical-align:-2px}@keyframes spin{to{transform:rotate(360deg)}}';
  document.head.appendChild(style);
}

async function boot() {
  applySpinnerCss();
  loadLocal();
  initEvents();
  if (state.chats.length) state.currentChatId = state.chats[0].id;
  ensureChat();
  renderHistory();
  renderMessages();
  await loadConfig();
  $('#themeBtn span').textContent = document.body.classList.contains('light') ? 'الوضع الداكن' : 'الوضع الليلي';
}

boot();
