import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 10000);

app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

const safe = (value) => typeof value === 'string' && value.trim() ? value.trim() : '';
const csv = (value = '') => safe(value).split(',').map((x) => x.trim()).filter(Boolean);
const envList = (plural, singular, fallback = []) => {
  const many = csv(process.env[plural]);
  if (many.length) return many;
  const one = csv(process.env[singular]);
  if (one.length) return one;
  return [...fallback];
};
const requireKey = (name) => {
  const value = safe(process.env[name]);
  if (!value) throw new Error(`${name} غير مضبوط في Render.`);
  return value;
};

const DEFAULT_GEMINI_IMAGE_MODELS = ['gemini-3.1-flash-image'];
const PIXAZO_API_KEY = ['PIXAZO'];
const DEFAULT_PIXAZO_VIDEO_MODELS = [
  'ltx',
  'ltx-2-5-lite',
  'ltx-2-5-pro'
];
const DEFAULT_LIVE_MODEL = safe(process.env.GEMINI_LIVE_MODEL) || 'gemini-3.8-live';

let geminiCache = { at: 0, models: [] };
let openaiCache = { at: 0, models: [] };
let elevenCache = { at: 0, voiceId: '' };

function modelId(value) {
  return String(value || '').replace(/^models\//, '');
}

function modelLabel(id) {
  const raw = modelId(id);
  return raw
    .replace(/-\d{6,}$/g, '')
    .replace(/-/g, ' ')
    .replace(/\bgemini\b/gi, 'Gemini')
    .replace(/\bflash\b/gi, 'Flash')
    .replace(/\bpro\b/gi, 'Pro')
    .replace(/\blite\b/gi, 'Lite')
    .replace(/\bimage\b/gi, 'Image')
    .replace(/\blive\b/gi, 'Live')
    .replace(/\s+/g, ' ')
    .trim();
}

async function discoverGeminiModels(force = false) {
  const key = safe(process.env.GEMINI_API_KEY);
  if (!key) return [];
  if (!force && geminiCache.models.length && Date.now() - geminiCache.at < 5 * 60_000) {
    return geminiCache.models;
  }

  const configured = envList('GEMINI_MODELS', 'GEMINI_MODEL');
  let r;
  let data;
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=1000`);
    data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || 'تعذر جلب نماذج Gemini.');
  } catch (error) {
    const fallback = configured.map((id) => ({ id, label: id, description: '', methods: ['generateContent'] }));
    geminiCache = { at: Date.now(), models: fallback };
    return fallback;
  }

  const all = Array.isArray(data?.models) ? data.models : [];
  const candidates = all
    .filter((m) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
    .map((m) => ({
      id: modelId(m.name),
      label: m.displayName || modelLabel(m.name),
      description: m.description || '',
      methods: m.supportedGenerationMethods
    }))
    .filter((m) => m.id && /^gemini-/i.test(m.id))
    .filter((m) => !/embedding|aqa|live|image/i.test(m.id));

  const preferred = configured.filter((wanted) => candidates.some((m) => m.id === wanted));
  const ordered = preferred.length ? [
    ...preferred,
    ...candidates.filter((m) => !preferred.includes(m.id))
  ] : candidates;

  // Keep the UI compact while still showing a good choice of currently available models.
  const unique = [];
  const seen = new Set();
  for (const m of ordered) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      unique.push(m);
    }
  }

  geminiCache = { at: Date.now(), models: unique.slice(0, 16) };
  return geminiCache.models;
}

async function discoverOpenAIModels(force = false) {
  const key = safe(process.env.OPENAI_API_KEY);
  const configured = envList('OPENAI_MODELS', 'OPENAI_MODEL');
  if (!key) return configured.map((id) => ({ id, label: id }));
  if (!force && openaiCache.models.length && Date.now() - openaiCache.at < 5 * 60_000) {
    return openaiCache.models;
  }

  try {
    const r = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` }
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || 'OpenAI models request failed');
    const discovered = (Array.isArray(data?.data) ? data.data : [])
      .map((m) => String(m?.id || ''))
      .filter((id) => /^(gpt-|o1|o3|o4)/i.test(id))
      .filter((id) => !/audio|realtime|transcribe|tts|search|image|embedding|moderation/i.test(id))
      .sort();
    const ids = configured.length ? [
      ...configured,
      ...discovered.filter((id) => !configured.includes(id))
    ] : discovered;
    openaiCache = { at: Date.now(), models: ids.slice(0, 20).map((id) => ({ id, label: id })) };
  } catch {
    openaiCache = { at: Date.now(), models: configured.map((id) => ({ id, label: id })) };
  }
  return openaiCache.models;
}

async function getElevenVoiceId() {
  if (safe(process.env.ELEVENLABS_VOICE_ID)) return safe(process.env.ELEVENLABS_VOICE_ID);
  if (elevenCache.voiceId) return elevenCache.voiceId;
  const key = requireKey('ELEVENLABS_API_KEY');
  const r = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': key }
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.detail?.message || 'تعذر جلب أصوات ElevenLabs.');
  const voiceId = safe(data?.voices?.[0]?.voice_id);
  if (!voiceId) throw new Error('لم يتم العثور على صوت في ElevenLabs.');
  elevenCache.voiceId = voiceId;
  return voiceId;
}

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((part) => part?.text || '').join('').trim();
}

function extractImagePart(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    const inline = part?.inlineData || part?.inline_data;
    if (inline?.data) {
      return {
        mimeType: safe(inline.mimeType || inline.mime_type) || 'image/png',
        data: inline.data
      };
    }
  }
  return null;
}

function recursiveMediaUrl(value) {
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = recursiveMediaUrl(item);
      if (found) return found;
    }
    return '';
  }
  if (value && typeof value === 'object') {
    for (const key of ['media_url', 'image_url', 'video_url', 'output_url', 'url', 'output']) {
      const found = recursiveMediaUrl(value[key]);
      if (found) return found;
    }
    for (const child of Object.values(value)) {
      const found = recursiveMediaUrl(child);
      if (found) return found;
    }
  }
  return '';
}

function jobIdFrom(data) {
  return safe(data?.request_id || data?.job_id || data?.id);
}

function pixazoImagePath(model) {
  if (model === 'flux') return 'flux/text-to-image';
  if (model === 'gpt-image-2-5-flare') return 'gpt-image-2-5-flare/v1/text-to-image';
  if (model.includes('/')) return model;
  return `${model}/text-to-image`;
}

function pixazoVideoPath(model) {
  if (model === 'ltx') return 'ltx/text-to-video';
  if (model === 'ltx-2-5-lite') return 'ltx-2-5-lite/v1/text-to-video';
  if (model === 'ltx-2-5-pro') return 'ltx-2-5-pro/v1/text-to-video';
  if (model === 'flux-3-video') return 'flux-3-video/v1/text-to-video';
  if (model.includes('/')) return model;
  return `${model}/text-to-video`;
}

async function pixazoPost(pathname, body) {
  const key = requireKey('PIXAZO_API_KEY');
  const r = await fetch(`https://gateway.pixazo.ai/${pathname}`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    },
    body: JSON.stringify(body)
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { response: r, data };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'zaka-ai', time: new Date().toISOString() });
});

app.get('/api/config', async (_req, res) => {
  try {
    const gemini = await discoverGeminiModels();
    const openai = await discoverOpenAIModels();
    const configuredGeminiImage = envList('GEMINI_IMAGE_MODELS', 'GEMINI_IMAGE_MODEL', DEFAULT_GEMINI_IMAGE_MODELS);
    const pixazoImage = envList('PIXAZO_IMAGE_MODELS', 'PIXAZO_IMAGE_MODEL', DEFAULT_PIXAZO_IMAGE_MODELS);
    const pixazoVideo = envList('PIXAZO_VIDEO_MODELS', 'PIXAZO_VIDEO_MODEL', DEFAULT_PIXAZO_VIDEO_MODELS);

    res.json({
      providers: {
        gemini: !!process.env.GEMINI_API_KEY && gemini.length > 0,
        geminiImage: !!process.env.GEMINI_API_KEY,
        geminiLive: !!process.env.GEMINI_API_KEY,
        openai: !!process.env.OPENAI_API_KEY && openai.length > 0,
        pixazo: !!process.env.PIXAZO_API_KEY,
        elevenlabs: !!process.env.ELEVENLABS_API_KEY,
        telegram: !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID
      },
      models: {
        gemini: gemini.map((m) => ({ id: m.id, label: m.label })),
        openai,
        geminiImage: configuredGeminiImage,
        pixazoImage,
        pixazoVideo,
        geminiLive: [DEFAULT_LIVE_MODEL]
      },
      defaults: {
        chatProvider: gemini.length ? 'gemini' : (openai.length ? 'openai' : ''),
        chatModel: gemini[0]?.id || openai[0]?.id || '',
        imageProvider: process.env.GEMINI_API_KEY ? 'gemini' : (process.env.PIXAZO_API_KEY ? 'pixazo' : ''),
        imageModel: configuredGeminiImage[0] || pixazoImage[0] || ''
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'تعذر تحميل إعدادات التطبيق.' });
  }
});

app.get('/api/models', async (_req, res) => {
  try {
    const models = await discoverGeminiModels(true);
    res.json({ models: models.map((m) => m.id), default: models[0]?.id || '' });
  } catch (error) {
    res.status(500).json({ error: error.message || 'تعذر تحميل النماذج.' });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const provider = (safe(req.body?.provider) || 'gemini').toLowerCase();
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    if (!messages.length) return res.status(400).json({ error: 'أرسل رسالة أولًا.' });

    if (provider === 'openai') {
      const key = requireKey('OPENAI_API_KEY');
      const available = await discoverOpenAIModels();
      const requested = safe(req.body?.model);
      const model = requested || available[0]?.id;
      if (!model) return res.status(400).json({ error: 'لا يوجد نموذج OpenAI متاح.' });

      const r = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          input: messages.map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : m.role,
            content: String(m.content ?? '')
          })),
          store: false
        })
      });
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || 'فشل طلب OpenAI.' });
      const text = safe(data?.output_text) || ((data?.output || []).flatMap((x) => x?.content || []).map((x) => x?.text || '')).join('\n').trim();
      return res.json({ ok: true, provider, model, text: text || 'لم يصل نص من النموذج.' });
    }

    if (provider !== 'gemini') {
      return res.status(400).json({ error: 'المزود غير مدعوم.' });
    }

    const key = requireKey('GEMINI_API_KEY');
    const available = await discoverGeminiModels();
    const requested = safe(req.body?.model);
    let model = requested || available[0]?.id;
    if (!model) return res.status(400).json({ error: 'لا يوجد نموذج Gemini متاح لمفتاحك.' });

    const sys = messages.find((m) => m.role === 'system');
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(m.content ?? '') }]
      }));

    const body = { contents };
    if (sys) body.systemInstruction = { parts: [{ text: String(sys.content ?? '') }] };

    let r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    let data = await r.json();

    // One automatic recovery for stale/invalid model selections.
    if (!r.ok && /not found|resource|invalid model/i.test(String(data?.error?.message || ''))) {
      geminiCache = { at: 0, models: [] };
      const fresh = await discoverGeminiModels(true);
      const fallback = fresh[0]?.id;
      if (fallback && fallback !== model) {
        model = fallback;
        r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        data = await r.json();
      }
    }

    if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || 'فشل طلب Gemini.' });
    return res.json({ ok: true, provider, model, text: extractGeminiText(data) || 'لم يصل نص من النموذج.' });
  } catch (error) {
    res.status(500).json({ error: error.message || 'حدث خطأ في المحادثة.' });
  }
});

function extractInteractionsImage(data) {
  const direct = data?.output_image;
  if (direct?.data) {
    return {
      mimeType: safe(direct.mime_type || direct.mimeType) || 'image/png',
      data: direct.data
    };
  }

  for (const step of (Array.isArray(data?.steps) ? data.steps : [])) {
    for (const content of (Array.isArray(step?.content) ? step.content : [])) {
      if (content?.type === 'image' && content?.data) {
        return {
          mimeType: safe(content.mime_type || content.mimeType) || 'image/png',
          data: content.data
        };
      }
    }
  }

  return null;
}

app.post('/api/gemini-image', async (req, res) => {
  try {
    const key = requireKey('GEMINI_API_KEY');
    const available = envList(
      'GEMINI_IMAGE_MODELS',
      'GEMINI_IMAGE_MODEL',
      DEFAULT_GEMINI_IMAGE_MODELS
    );
    const requestedModel = safe(req.body?.model);
    const prompt = safe(req.body?.prompt);

    if (!prompt) {
      return res.status(400).json({ error: 'اكتب وصف الصورة أولًا.' });
    }

    const responseFormat = {
      type: 'image',
      mime_type: 'image/png',
      aspect_ratio: safe(req.body?.aspectRatio) || '1:1',
      image_size: safe(req.body?.imageSize) || '1K'
    };

    const candidates = [
      ...(requestedModel && available.includes(requestedModel) ? [requestedModel] : []),
      ...available.filter((id) => id !== requestedModel),
      'gemini-3.1-flash-image'
    ].filter((id, index, list) => id && list.indexOf(id) === index);

    let lastError = null;

    for (const model of candidates) {
      const r = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/interactions',
        {
          method: 'POST',
          headers: {
            'x-goog-api-key': key,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            input: prompt,
            response_format: responseFormat
          })
        }
      );

      const text = await r.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }

      if (!r.ok) {
        lastError = {
          status: r.status,
          message: data?.error?.message || data?.message || 'فشل طلب Gemini.'
        };
        continue;
      }

      const image = extractInteractionsImage(data);
      if (image?.data) {
        return res.json({
          ok: true,
          provider: 'gemini',
          model,
          imageUrl: `data:${image.mimeType};base64,${image.data}`
        });
      }

      lastError = { status: 502, message: 'Gemini استجاب بدون صورة.' };
    }

    return res.status(lastError?.status || 502).json({
      error: lastError?.message || 'فشل توليد صورة Gemini.',
      provider: 'gemini',
      triedModels: candidates
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'حدث خطأ في توليد الصورة.'
    });
  }
});

app.get('/api/voices', async (_req, res) => {
  try {
    const key = requireKey('ELEVENLABS_API_KEY');
    const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data?.detail?.message || 'تعذر جلب الأصوات.' });
    res.json({ voices: data?.voices || [] });
  } catch (error) {
    res.status(500).json({ error: error.message || 'تعذر جلب الأصوات.' });
  }
});

app.post('/api/tts', async (req, res) => {
  try {
    const key = requireKey('ELEVENLABS_API_KEY');
    const voiceId = safe(req.body?.voiceId) || await getElevenVoiceId();
    const text = safe(req.body?.text);
    if (!text) return res.status(400).json({ error: 'لا يوجد نص للصوت.' });
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: 'POST',
      headers: {
        'xi-api-key': key,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg'
      },
      body: JSON.stringify({
        text,
        model_id: safe(req.body?.modelId) || 'eleven_multilingual_v2',
        output_format: 'mp3_44100_128'
      })
    });
    if (!r.ok) return res.status(r.status).json({ error: await r.text() });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (error) {
    res.status(500).json({ error: error.message || 'تعذر تحويل النص إلى صوت.' });
  }
});

app.post('/api/image', async (req, res) => {
  try {
    const model = safe(req.body?.model) || envList('PIXAZO_IMAGE_MODELS', 'PIXAZO_IMAGE_MODEL', DEFAULT_PIXAZO_IMAGE_MODELS)[0];
    const prompt = safe(req.body?.prompt);
    if (!prompt) return res.status(400).json({ error: 'اكتب وصف الصورة أولًا.' });

    const body = { prompt };
    if (safe(req.body?.imageSize)) body.image_size = safe(req.body.imageSize);
    if (safe(req.body?.aspectRatio)) body.aspect_ratio = safe(req.body.aspectRatio);

    const { response, data } = await pixazoPost(pixazoImagePath(model), body);
    if (!response.ok) return res.status(response.status).json({ error: data?.error || data?.message || 'فشل توليد صورة Pixazo.' });

    const imageUrl = recursiveMediaUrl(data);
    const jobId = jobIdFrom(data);
    return res.json({ ok: true, provider: 'pixazo', model, imageUrl, jobId, status: data?.status || '' });
  } catch (error) {
    res.status(500).json({ error: error.message || 'تعذر توليد الصورة عبر Pixazo.' });
  }
});

app.post('/api/video', async (req, res) => {
  try {
    const model = safe(req.body?.model) || envList('PIXAZO_VIDEO_MODELS', 'PIXAZO_VIDEO_MODEL', DEFAULT_PIXAZO_VIDEO_MODELS)[0];
    const prompt = safe(req.body?.prompt);
    if (!prompt) return res.status(400).json({ error: 'اكتب وصف الفيديو أولًا.' });

    const duration = Math.max(2, Math.min(10, Number(req.body?.duration) || 5));
    const body = { prompt };
    if (model !== 'ltx') {
      body.duration = duration;
      body.resolution = safe(req.body?.resolution) || '720p';
      if (safe(req.body?.aspectRatio)) body.aspect_ratio = safe(req.body.aspectRatio);
    }

    const { response, data } = await pixazoPost(pixazoVideoPath(model), body);
    if (!response.ok) return res.status(response.status).json({ error: data?.error || data?.message || 'فشل توليد الفيديو.' });

    const videoUrl = recursiveMediaUrl(data);
    const jobId = jobIdFrom(data);
    return res.json({ ok: true, provider: 'pixazo', model, videoUrl, jobId, status: data?.status || '' });
  } catch (error) {
    res.status(500).json({ error: error.message || 'تعذر توليد الفيديو.' });
  }
});

app.post('/api/pixazo/status', async (req, res) => {
  try {
    const jobId = safe(req.body?.jobId);
    if (!jobId) return res.status(400).json({ error: 'jobId مطلوب.' });
    const key = requireKey('PIXAZO_API_KEY');
    const r = await fetch(`https://gateway.pixazo.ai/v2/requests/status/${encodeURIComponent(jobId)}`, {
      headers: { 'Ocp-Apim-Subscription-Key': key }
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data?.error || data?.message || 'تعذر فحص حالة المهمة.' });
    res.json({ ok: true, status: data?.status || '', mediaUrl: recursiveMediaUrl(data), raw: data });
  } catch (error) {
    res.status(500).json({ error: error.message || 'تعذر فحص المهمة.' });
  }
});

app.post('/api/live-token', async (_req, res) => {
  try {
    const key = requireKey('GEMINI_API_KEY');
    const model = DEFAULT_LIVE_MODEL;
    const expireTime = new Date(Date.now() + 30 * 60_000).toISOString();
    const newSessionExpireTime = new Date(Date.now() + 60_000).toISOString();

    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key
      },
      body: JSON.stringify({
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveConnectConstraints: {
          model: `models/${model}`,
          config: {
            responseModalities: ['AUDIO'],
            sessionResumption: {}
          }
        }
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || 'تعذر إنشاء رمز الاتصال الصوتي.' });
    if (!data?.name) return res.status(502).json({ error: 'Gemini لم يُرجع رمز اتصال صوتي صالحًا.' });
    res.json({ ok: true, token: data.name, model });
  } catch (error) {
    res.status(500).json({ error: error.message || 'تعذر بدء المكالمة اللايف.' });
  }
});

app.post('/api/telegram/send', async (req, res) => {
  try {
    const token = requireKey('TELEGRAM_BOT_TOKEN');
    const chatId = safe(req.body?.chatId) || safe(process.env.TELEGRAM_CHAT_ID);
    const text = safe(req.body?.text);
    if (!chatId) return res.status(400).json({ error: 'TELEGRAM_CHAT_ID غير مضبوط.' });
    if (!text) return res.status(400).json({ error: 'لا يوجد نص للإرسال.' });

    const r = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data?.description || 'فشل إرسال Telegram.' });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message || 'تعذر إرسال Telegram.' });
  }
});

app.use((_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Zaka AI listening on ${PORT}`);
});
