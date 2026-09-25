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
  if (!wrap) return;
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
  localStorage.setItem(
    STORAGE.chats,
    JSON.stringify(state.chats)
  );
}

function loadLocal() {
  try {
    state.chats = JSON.parse(
      localStorage.getItem(STORAGE.chats) || '[]'
    );

    state.character = JSON.parse(
      localStorage.getItem(STORAGE.character) || 'null'
    );

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
  if (!box) return;

  box.innerHTML = '';

  if (!state.chats.length) {
    box.innerHTML = '<div class="history-empty">لا توجد محادثات محفوظة بعد.</div>';
    return;
  }

  state.chats.slice(0, 40).forEach((chat) => {
    const btn = document.createElement('button');
    btn.className = `history-item ${chat.id === state.currentChatId ? 'active' : ''}`;
    btn.innerHTML =
      `<span>💬</span>` +
      `<span class="title">${escapeHtml(chat.title || 'محادثة')}</span>`;

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

  $('#menuBtn')
    ?.closest('.sidebar')
    ?.classList.remove('open');
}

function newChat() {
  stopLiveCall(false);
  state.currentChatId = null;
  state.messages = [];
  ensureChat();
  renderHistory();
  renderMessages();
  $('#chatInput')?.focus();
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
  if (!box) return;

  if (!state.messages.length) {
    box.innerHTML = `
      <div class="empty-state" id="emptyState">
        <div class="empty-icon">✦</div>
        <h2>جاهز لك</h2>
        <p>اختر النموذج واكتب رسالتك. النماذج المتاحة تُكتشف تلقائيًا من API.</p>
      </div>
    `;
    return;
  }

  box.innerHTML = '';
  for (const message of state.messages) {
    addMessageBubble(message, false);
  }
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
        setTimeout(() => (copy.textContent = '📋 نسخ'), 1200);
      } catch {
        toast('تعذر النسخ.', 'error');
      }
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
  $('#chatScroll')?.appendChild(row);

  if (scroll) {
    $('#chatScroll').scrollTop = $('#chatScroll').scrollHeight;
  }

  return bubble;
}

async function speakText(text, button) {
  try {
    button.disabled = true;
    button.textContent = '⏳';

    const r = await fetch('/api/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    });

    const data = await r.arrayBuffer();

    if (!r.ok) {
      let message = 'تعذر تشغيل الصوت.';
      try {
        message = JSON.parse(new TextDecoder().decode(data)).error || message;
      } catch {}
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
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    });

    const data = await r.json();

    if (!r.ok) {
      throw new Error(data?.error || 'تعذر الإرسال.');
    }

    button.textContent = '✅ أُرسل';
  } catch (error) {
    button.disabled = false;
    toast(error.message || 'تعذر إرسال Telegram.', 'error');
  }
}

function setMode(mode) {
  state.mode = mode;

  $$('.mode-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  $('#chatPanel')?.classList.toggle('hidden', mode !== 'chat');
  $('#imagePanel')?.classList.toggle('hidden', mode !== 'image');
  $('#livePanel')?.classList.toggle('hidden', mode !== 'live');
  $('#composerWrap')?.classList.toggle('hidden', mode === 'live' || mode === 'image');
  $('#heroCard')?.classList.toggle('hidden', mode === 'live');

  if (mode === 'live') {
    stopLiveCall(false);
  }
}

function fillSelect(select, items, current = '') {
  if (!select) return;

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

  if (!select.value) {
    select.value = typeof items[0] === 'string' ? items[0] : items[0].id;
  }
}

function providerChoices() {
  const choices = [];

  if (state.config?.providers?.gemini) {
    choices.push({ id: 'gemini', label: '✨ Gemini' });
  }

  if (state.config?.providers?.openai) {
    choices.push({ id: 'openai', label: '◉ OpenAI' });
  }

  return choices;
}

function setupSelectors() {
  const providerList = providerChoices();

  fillSelect(
    $('#chatProvider'),
    providerList,
    state.config?.defaults?.chatProvider || providerList[0]?.id
  );

  state.provider = $('#chatProvider').value || 'gemini';
  updateChatModels();

  const imageProviders = [];

  if (state.config?.providers?.geminiImage) {
    imageProviders.push({ id: 'gemini', label: '✨ Gemini Image' });
  }

  if (state.config?.providers?.pixazo) {
    imageProviders.push({ id: 'pixazo', label: '🪄 Pixazo' });
  }

  fillSelect(
    $('#imageProvider'),
    imageProviders,
    state.config?.defaults?.imageProvider || imageProviders[0]?.id
  );

  state.imageProvider = $('#imageProvider').value || 'gemini';
  updateImageModels();
}

function updateChatModels() {
  const models =
    state.provider === 'openai'
      ? state.config?.models?.openai || []
      : state.config?.models?.gemini || [];

  const desired = state.model || state.config?.defaults?.chatModel;

  fillSelect($('#chatModel'), models, desired);
  state.model = $('#chatModel').value || '';
}

function updateImageModels() {
  const models =
    state.imageProvider === 'pixazo'
      ? state.config?.models?.pixazoImage || []
      : state.config?.models?.geminiImage || [];

  fillSelect(
    $('#imageModel'),
    models.map((id) => ({ id, label: imageLabel(id) })),
    state.imageModel
  );

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

async function loadConfig() {
  try {
    const response = await fetch('/api/config', { cache: 'no-store' });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error || 'تعذر تحميل إعدادات الموقع.');
    }

    state.config = data;
    setupSelectors();
    return data;
  } catch (error) {
    console.error(error);
    toast(error.message || 'تعذر الاتصال بالخادم.', 'error');
    return null;
  }
}

function addTypingBubble() {
  $('#emptyState')?.remove();

  const row = document.createElement('div');
  row.className = 'message ai typing-message';

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = '✦';

  const wrap = document.createElement('div');
  wrap.className = 'msg-wrap';

  const bubble = document.createElement('div');
  bubble.className = 'bubble typing-bubble';
  bubble.innerHTML = '<span></span><span></span><span></span>';

  wrap.appendChild(bubble);
  row.append(avatar, wrap);

  $('#chatScroll')?.appendChild(row);
  $('#chatScroll').scrollTop = $('#chatScroll').scrollHeight;

  return row;
}

function removeTypingBubble() {
  document.querySelector('.typing-message')?.remove();
}

async function sendMessage() {
  if (state.busy) return;

  const input = $('#chatInput');
  if (!input) return;

  const message = input.value.trim();
  if (!message) return;

  state.busy = true;
  input.value = '';

  const userMessage = {
    role: 'user',
    content: message,
    createdAt: Date.now()
  };

  state.messages.push(userMessage);
  addMessageBubble(userMessage, true);
  updateCurrentChat();

  const typing = addTypingBubble();
  const sendButton = $('#sendBtn');

  setBusy(sendButton, true, 'جاري الكتابة...');

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        provider: state.provider,
        model: state.model,
        messages: state.messages.map((item) => ({
          role: item.role,
          content: item.content
        }))
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error || 'فشل إرسال الرسالة.');
    }

    const answer = data?.text || data?.message || '';

    if (!answer) {
      throw new Error('لم يصل رد من النموذج.');
    }

    const aiMessage = {
      role: 'assistant',
      content: answer,
      createdAt: Date.now(),
      model: data?.model || state.model
    };

    state.messages.push(aiMessage);
    typing.remove();
    addMessageBubble(aiMessage, true);
    updateCurrentChat();
  } catch (error) {
    typing.remove();
    toast(error.message || 'حدث خطأ أثناء إرسال الرسالة.', 'error');
    input.value = message;
  } finally {
    state.busy = false;
    setBusy(sendButton, false);
    input.focus();
  }
}

async function generateImage(event) {
  event?.preventDefault();

  if (state.busy) return;

  const prompt = $('#imagePrompt')?.value?.trim();
  if (!prompt) {
    toast('اكتب وصف الصورة أولًا.', 'error');
    return;
  }

  state.busy = true;

  const button = $('#imageSubmitBtn');
  setBusy(button, true, 'جاري توليد الصورة...');

  const result = $('#imageResult');

  if (result) {
    result.innerHTML = '<div class="image-loading">⏳ جاري إنشاء الصورة...</div>';
  }

  try {
    const endpoint = state.imageProvider === 'pixazo' ? '/api/image' : '/api/gemini-image';

    const body = {
      prompt,
      model: state.imageModel,
      aspectRatio: $('#imageAspect')?.value || '1:1',
      imageSize: $('#imageSize')?.value || '1K'
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error || 'فشل توليد الصورة.');
    }

    if (data?.imageUrl) {
      showGeneratedImage(data.imageUrl, prompt);
    } else if (data?.jobId) {
      await pollImageJob(data.jobId, prompt);
    } else {
      throw new Error('لم يتم استلام صورة من الخادم.');
    }
  } catch (error) {
    if (result) result.innerHTML = '';
    toast(error.message || 'حدث خطأ في توليد الصورة.', 'error');
  } finally {
    state.busy = false;
    setBusy(button, false);
  }
}

function showGeneratedImage(url, prompt = '') {
  const result = $('#imageResult');
  if (!result || !url) return;
  renderImageResult(result, url, state.imageProvider === 'pixazo' ? 'pixazo' : (state.imageModel || 'gemini'));
}

function renderImageResult(result, url, model) {
  if (!result || !url) {
    toast('لم تصل صورة صالحة من الخادم.', 'error');
    return;
  }

  result.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'image-result';

  const img = document.createElement('img');
  img.src = url;
  img.alt = 'صورة مولدة';

  const actions = document.createElement('div');
  actions.className = 'media-actions';

  const open = document.createElement('a');
  open.className = 'secondary-btn';
  open.href = url;
  open.target = '_blank';
  open.rel = 'noopener';
  open.textContent = '🔗 فتح';

  const save = document.createElement('button');
  save.className = 'secondary-btn';
  save.type = 'button';
  save.textContent = '💾 حفظ';

  save.onclick = () => {
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = `zaka-image-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      toast('تعذر حفظ الصورة.', 'error');
    }
  };

  actions.append(open, save);
  wrap.append(img, actions);
  result.appendChild(wrap);

  toast(`تم إنشاء الصورة عبر ${imageLabel(model)}.`, 'success');
}

async function pollImageJob(jobId, prompt, attempts = 0) {
  if (attempts > 90) {
    throw new Error('استغرق توليد الصورة وقتًا طويلًا.');
  }

  const response = await fetch('/api/pixazo/status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ jobId })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error || 'تعذر فحص حالة الصورة.');
  }

  const status = String(data?.status || '').toUpperCase();
  const mediaUrl = data?.mediaUrl || data?.imageUrl;

  if (status === 'COMPLETED' || mediaUrl) {
    if (!mediaUrl) {
      throw new Error('اكتملت المهمة ولكن لم يصل رابط الصورة.');
    }

    renderImageResult($('#imageResult'), mediaUrl, 'pixazo');
    return;
  }

  if (status === 'ERROR' || status === 'FAILED') {
    throw new Error(data?.error || 'فشلت مهمة توليد الصورة.');
  }

  const result = $('#imageResult');
  if (result) {
    result.innerHTML = `
      <div class="result-status">
        ⏳ الحالة: ${escapeHtml(data?.status || 'PROCESSING')} • محاولة ${attempts + 1}
      </div>
    `;
  }

  await new Promise((resolve) => setTimeout(resolve, 4000));
  return pollImageJob(jobId, prompt, attempts + 1);
}

function saveCurrentImage() {
  const img = $('#imageResult img');
  if (!img?.src) {
    toast('لا توجد صورة لحفظها.', 'error');
    return;
  }

  try {
    const link = document.createElement('a');
    link.href = img.src;
    link.download = `zaka-image-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch {
    toast('تعذر حفظ الصورة.', 'error');
  }
}

function resizeChatInput() {
  const input = $('#chatInput');
  if (!input) return;

  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
}

function updateConnectionStatus(ok, text) {
  const pill = $('#connectionPill');
  if (!pill) return;

  const dot = pill.querySelector('.status-dot');
  if (dot) {
    dot.className = `status-dot ${ok ? 'ok' : 'bad'}`;
  }

  const label = pill.querySelector('span:last-child');
  if (label) {
    label.textContent = text || (ok ? 'الاتصال سليم' : 'تحقق من الخادم');
  }
}

async function checkHealth() {
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error || 'الخادم غير متاح.');
    }

    updateConnectionStatus(true, 'الاتصال سليم');
    return data;
  } catch (error) {
    updateConnectionStatus(false, 'تحقق من الخادم');
    return null;
  }
}

function openSettings() {
  const modal = $('#settingsModal');
  if (modal) modal.classList.remove('hidden');
}

function closeModal(id) {
  const modal = $('#' + id);
  if (modal) modal.classList.add('hidden');
}

function toggleSidebar() {
  const sidebar = $('#sidebar');
  if (sidebar) sidebar.classList.toggle('open');
}

function clearChat() {
  state.messages = [];

  const chat = currentChat();
  if (chat) {
    chat.messages = [];
    chat.updatedAt = Date.now();
  }

  saveChats();
  renderHistory();
  renderMessages();
  toast('تم مسح المحادثة.', 'success');
}

function toggleTheme() {
  const light = document.body.classList.toggle('light');
  localStorage.setItem(STORAGE.theme, light ? 'light' : 'dark');

  const label = $('#themeBtn span');
  if (label) {
    label.textContent = light ? 'الوضع الداكن' : 'الوضع الليلي';
  }
}

function submitChat() {
  return sendMessage();
}

async function refreshModels() {
  return loadConfig();
}

function loadCharacterForm() {
  const character = state.character || {};
  $('#charName').value = character.name || '';
  $('#charPersonality').value = character.personality || '';
  $('#charAppearance').value = character.appearance || '';
  $('#charInstructions').value = character.instructions || '';
}

function saveCharacter() {
  state.character = {
    name: $('#charName')?.value || '',
    personality: $('#charPersonality')?.value || '',
    appearance: $('#charAppearance')?.value || '',
    instructions: $('#charInstructions')?.value || ''
  };

  localStorage.setItem(STORAGE.character, JSON.stringify(state.character));
  toast('تم حفظ الشخصية.', 'success');
  closeModal('characterModal');
}

function startLiveCall() {
  toast('ميزة المكالمة المباشرة غير مفعلة حاليًا.', 'error');
}

function stopLiveCall(showMessage = false) {
  state.live.active = false;
  state.live.connecting = false;

  if (state.live.socket) {
    state.live.socket.close();
    state.live.socket = null;
  }

  $('#liveCallBtn')?.classList.remove('hidden');
  $('#liveStopBtn')?.classList.add('hidden');

  if ($('#liveStatus')) {
    $('#liveStatus').textContent = 'جاهز للاتصال';
  }

  if (showMessage) {
    toast('تم إنهاء المكالمة.', 'success');
  }
}

function initEvents() {
  $('#composer')?.addEventListener('submit', (event) => {
    event.preventDefault();
    submitChat();
  });

  $('#chatInput')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      $('#composer')?.requestSubmit();
    }
  });

  $('#chatInput')?.addEventListener('input', resizeChatInput);

  $('#chatProvider')?.addEventListener('change', () => {
    state.provider = $('#chatProvider').value;
    state.model = '';
    updateChatModels();
  });

  $('#chatModel')?.addEventListener('change', () => {
    state.model = $('#chatModel').value;
  });

  $('#imageProvider')?.addEventListener('change', () => {
    state.imageProvider = $('#imageProvider').value;
    state.imageModel = '';
    updateImageModels();
  });

  $('#imageModel')?.addEventListener('change', () => {
    state.imageModel = $('#imageModel').value;
  });

  $('#refreshModelsBtn')?.addEventListener('click', refreshModels);

  $('#imageForm')?.addEventListener('submit', generateImage);

  $$('.mode-tab').forEach((button) => {
    button.addEventListener('click', () => {
      setMode(button.dataset.mode);
    });
  });

  $$('.quick-chip').forEach((button) => {
    button.addEventListener('click', () => {
      setMode('chat');
      const input = $('#chatInput');
      if (!input) return;
      input.value = button.dataset.quick || '';
      input.focus();
      resizeChatInput();
    });
  });

  $$('.secondary-btn[data-fill]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = $('#imagePrompt');
      if (input) {
        input.value = button.dataset.fill || '';
        input.focus();
      }
    });
  });

  $('#newChatBtn')?.addEventListener('click', newChat);
  $('#newTopBtn')?.addEventListener('click', newChat);
  $('#clearBtn')?.addEventListener('click', clearChat);
  $('#themeBtn')?.addEventListener('click', toggleTheme);
  $('#settingsBtn')?.addEventListener('click', openSettings);

  $('#characterBtn')?.addEventListener('click', () => {
    loadCharacterForm();
    $('#characterModal')?.classList.remove('hidden');
  });

  $('#saveCharacterBtn')?.addEventListener('click', saveCharacter);

  $('#liveCallBtn')?.addEventListener('click', startLiveCall);
  $('#liveStopBtn')?.addEventListener('click', () => stopLiveCall(true));

  $('#menuBtn')?.addEventListener('click', toggleSidebar);

  $$('.modal-close').forEach((button) => {
    button.addEventListener('click', () => {
      closeModal(button.dataset.close);
    });
  });

  $$('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) {
        backdrop.classList.add('hidden');
      }
    });
  });

  window.addEventListener('beforeunload', () => {
    stopLiveCall(false);
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

function applySpinnerCss() {
  const style = document.createElement('style');
  style.textContent = `
    .spinner{
      display:inline-block;
      width:13px;
      height:13px;
      border:2px solid rgba(255,255,255,.35);
      border-top-color:#fff;
      border-radius:50%;
      animation:spin .7s linear infinite;
      margin-inline-end:7px;
      vertical-align:-2px
    }

    @keyframes spin{
      to{
        transform:rotate(360deg)
      }
    }
  `;
  document.head.appendChild(style);
}

async function boot() {
  applySpinnerCss();
  loadLocal();
  initEvents();

  if (state.chats.length) {
    state.currentChatId = state.chats[0].id;
  }

  ensureChat();
  renderHistory();
  renderMessages();

  await loadConfig();
  await checkHealth();

  const themeLabel = $('#themeBtn span');
  if (themeLabel) {
    themeLabel.textContent = document.body.classList.contains('light')
      ? 'الوضع الداكن'
      : 'الوضع الليلي';
  }
}

boot();
