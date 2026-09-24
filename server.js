import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 10000);

app.use(express.json({ limit: '8mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const safe = (v) => typeof v === 'string' && v.trim() ? v.trim() : '';
const list = (name, fallback = '') => {
  const raw = safe(process.env[name]);
  return raw ? raw.split(',').map((x) => x.trim()).filter(Boolean) : (fallback ? [fallback] : []);
};
const key = (name) => {
  const value = safe(process.env[name]);
  if (!value) throw new Error(`${name} is not configured on the server.`);
  return value;
};

const OPENAI_MODELS = list(
  'OPENAI_MODELS',
  safe(process.env.OPENAI_MODEL)
);

const GEMINI_MODELS = list(
  'GEMINI_MODELS',
  safe(process.env.GEMINI_MODEL)
);

const GEMINI_IMAGE_MODELS = list(
  'GEMINI_IMAGE_MODELS'
);

const PIXAZO_IMAGE_MODELS = list(
  'PIXAZO_IMAGE_MODELS'
);

const PIXAZO_VIDEO_MODELS = list(
  'PIXAZO_VIDEO_MODELS'
);
const openText = (d) => safe(d?.output_text) || ((d?.output || []).flatMap((x) => x?.content || []).map((x) => x?.text || '')).join('\n').trim();
const gemText = (d) => (d?.candidates?.[0]?.content?.parts || []).map((p) => p?.text || '').join('').trim();
const mediaUrl = (v) => {
  if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v;
  if (Array.isArray(v)) for (const x of v) { const u = mediaUrl(x); if (u) return u; }
  if (v && typeof v === 'object') {
    for (const k of ['output_url','media_url','image_url','video_url','url','output']) { const u = mediaUrl(v[k]); if (u) return u; }
    for (const x of Object.values(v)) { const u = mediaUrl(x); if (u) return u; }
  }
  return '';
};
const jobInfo = (d) => ({ pollingUrl: d?.polling_url || d?.poll_url || d?.pollingUrl || '', jobId: d?.request_id || d?.job_id || d?.id || '' });

app.get('/api/health', (_q, res) => res.json({ ok: true, service: 'zaka-ai', time: new Date().toISOString() }));

app.get('/api/config', (_q, res) => res.json({
  providers: {
    openai: OPENAI_MODELS.length > 0 && !!process.env.OPENAI_API_KEY,
    gemini: GEMINI_MODELS.length > 0 && !!process.env.GEMINI_API_KEY,
    geminiImage: !!process.env.GEMINI_API_KEY,
    elevenlabs: !!process.env.ELEVENLABS_API_KEY,
    pixazo: !!process.env.PIXAZO_API_KEY,
    telegram: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    geminiLive: !!process.env.GEMINI_API_KEY,
  },

  models: {
    openai: OPENAI_MODELS,
    gemini: GEMINI_MODELS,
    geminiImage: GEMINI_IMAGE_MODELS,
    pixazoImage: PIXAZO_IMAGE_MODELS,
    pixazoVideo: PIXAZO_VIDEO_MODELS,

    geminiLive: [
      'gemini-2.5-flash-native-audio-preview-12-2025'
    ]
  }
}));

app.post('/api/chat', async (req, res) => {
  try {
    const provider = safe(req.body?.provider).toLowerCase();
    const model = safe(req.body?.model);
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    if (!messages.length) return res.status(400).json({ error: 'messages is required' });

    if (provider === 'openai') {
      const k = key('OPENAI_API_KEY');
      const m = model || OPENAI_MODELS[0];
      if (!m) return res.status(400).json({ error: 'No OpenAI model configured.' });
      const r = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: m, input: messages, store: false }),
      });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: d?.error?.message || 'OpenAI request failed' });
      return res.json({ provider, model: m, text: openText(d) });
    }

    if (provider === 'gemini') {
      const k = key('GEMINI_API_KEY');
      const m = model || GEMINI_MODELS[0];
      if (!m) return res.status(400).json({ error: 'No Gemini model configured.' });
      const sys = messages.find((x) => x.role === 'system');
      const contents = messages.filter((x) => x.role !== 'system').map((x) => ({
        role: x.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(x.content ?? '') }],
      }));
      const body = { contents };
      if (sys) body.systemInstruction = { parts: [{ text: String(sys.content ?? '') }] };
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(k)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: d?.error?.message || 'Gemini request failed' });
      return res.json({ provider, model: m, text: gemText(d) });
    }

    return res.status(400).json({ error: 'Unsupported provider.' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
});

app.post('/api/gemini-image', async (req, res) => {
  try {
    const k = key('GEMINI_API_KEY');
    const model = safe(req.body?.model) || GEMINI_IMAGE_MODELS[0] || 'gemini-3.1-flash-image';
    const prompt = safe(req.body?.prompt);
    const aspectRatio = safe(req.body?.aspectRatio) || '1:1';
    const imageSize = safe(req.body?.imageSize) || '1K';
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    const body = {
      model,
      input: prompt,
      response_format: {
        type: 'image',
        aspect_ratio: aspectRatio,
        image_size: imageSize,
      },
    };

    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'x-goog-api-key': k, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: d?.error?.message || 'Gemini image request failed' });

    const image = d?.output_image;
    if (!image?.data) return res.status(502).json({ error: 'Gemini returned no image data.' });
    const mime = safe(image.mime_type) || 'image/png';
    return res.json({ ok: true, provider: 'gemini', model, imageUrl: `data:${mime};base64,${image.data}` });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
});

app.get('/api/voices', async (_q, res) => {
  try {
    const k = key('ELEVENLABS_API_KEY');
    const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': k } });
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: d?.detail?.message || 'ElevenLabs voices request failed' });
    res.json({ voices: d?.voices || [] });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

app.post('/api/tts', async (req, res) => {
  try {
    const k = key('ELEVENLABS_API_KEY');
    const voiceId = safe(req.body?.voiceId) || safe(process.env.ELEVENLABS_VOICE_ID);
    const text = safe(req.body?.text);
    if (!voiceId) return res.status(400).json({ error: 'No ElevenLabs voice ID configured.' });
    if (!text) return res.status(400).json({ error: 'text is required' });
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: 'POST',
      headers: { 'xi-api-key': k, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: safe(req.body?.modelId) || 'eleven_multilingual_v2', output_format: 'mp3_44100_128' }),
    });
    if (!r.ok) return res.status(r.status).json({ error: await r.text() });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

async function pixazoRequest(pathname, body) {
  const k = key('PIXAZO_API_KEY');
  const r = await fetch(`https://gateway.pixazo.ai/${pathname}`, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': k, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  let d;
  try { d = JSON.parse(t); } catch { d = { raw: t }; }
  return { r, d };
}

function pixazoImagePath(model) {
  if (model === 'flux') return 'flux/text-to-image';
  if (model === 'gpt-image-2-5-flare') return 'gpt-image-2-5-flare/v1/text-to-image';
  if (model.endsWith('/text-to-image')) return model;
  return `${model}/text-to-image`;
}
function pixazoVideoPath(model) {
  if (model === 'ltx') return 'ltx/text-to-video';
  if (model === 'ltx-2-5-lite') return 'ltx-2-5-lite/v1/text-to-video';
  if (model === 'ltx-2-5-pro') return 'ltx-2-5-pro/v1/text-to-video';
  if (model.endsWith('/text-to-video')) return model;
  return `${model}/text-to-video`;
}

app.post('/api/image', async (req, res) => {
  try {
    const model = safe(req.body?.model) || PIXAZO_IMAGE_MODELS[0] || 'flux';
    const prompt = safe(req.body?.prompt);
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });
    const body = { prompt };
    if (safe(req.body?.imageSize)) body.image_size = safe(req.body.imageSize);
    const { r, d } = await pixazoRequest(pixazoImagePath(model), body);
    if (!r.ok) return res.status(r.status).json({ error: d?.error || d?.message || 'Pixazo image request failed' });
    res.json({ ok: true, provider: 'pixazo', model, imageUrl: mediaUrl(d), ...jobInfo(d) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

app.post('/api/video', async (req, res) => {
  try {
    const model = safe(req.body?.model) || PIXAZO_VIDEO_MODELS[0] || 'ltx';
    const prompt = safe(req.body?.prompt);
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });
    const body = { prompt };
    if (req.body?.duration) body.duration = Number(req.body.duration);
    if (safe(req.body?.aspectRatio)) body.aspect_ratio = safe(req.body.aspectRatio);
    if (safe(req.body?.resolution)) body.resolution = safe(req.body.resolution);
    const { r, d } = await pixazoRequest(pixazoVideoPath(model), body);
    if (!r.ok) return res.status(r.status).json({ error: d?.error || d?.message || 'Pixazo video request failed' });
    res.json({ ok: true, provider: 'pixazo', model, videoUrl: mediaUrl(d), ...jobInfo(d) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

app.post('/api/pixazo/status', async (req, res) => {
  try {
    const pollingUrl = safe(req.body?.pollingUrl);
    if (!pollingUrl) return res.status(400).json({ error: 'pollingUrl is required' });
    const parsed = new URL(pollingUrl);
    if (parsed.hostname !== 'gateway.pixazo.ai') return res.status(400).json({ error: 'Invalid Pixazo polling URL.' });
    const k = key('PIXAZO_API_KEY');
    const r = await fetch(pollingUrl, { headers: { 'Ocp-Apim-Subscription-Key': k } });
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: d?.error || d?.message || 'Pixazo status request failed' });
    res.json({ ok: true, status: d?.status || '', mediaUrl: mediaUrl(d), raw: d });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

app.post('/api/telegram/send', async (req, res) => {
  try {
    const token = key('TELEGRAM_BOT_TOKEN');
    const chatId = safe(req.body?.chatId) || safe(process.env.TELEGRAM_CHAT_ID);
    const text = safe(req.body?.text);
    if (!chatId) return res.status(400).json({ error: 'TELEGRAM_CHAT_ID is not configured.' });
    if (!text) return res.status(400).json({ error: 'text is required' });
    const r = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text }),
    });
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: d?.description || 'Telegram request failed' });
    res.json({ ok: true, result: d?.result });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
});


app.use((_q, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, '0.0.0.0', () => console.log(`Zaka AI listening on ${PORT}`));




// ==========================================
// GEMINI LIVE CONFIG
// ==========================================

app.get('/api/live/config', (_req, res) => {
  try {
    const k = key('GEMINI_API_KEY');

    res.json({
      ok: true,
      apiKey: k,
      model: safe(process.env.GEMINI_LIVE_MODEL)
        || 'gemini-2.5-flash-native-audio-preview-12-2025'
    });

  } catch (e) {
    res.status(500).json({
      error: e.message || 'Gemini Live is not configured'
    });
  }
});
