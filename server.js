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

const DEFAULT_GEMINI_IMAGE_MODELS = [
  'gemini-3.1-flash-image',
  'gemini-3-pro-image',
  'gemini-3.1-flash-lite-image'
];

const DEFAULT_PIXAZO_IMAGE_MODELS = [
  'flux',
  'gpt-image-2-5-flare'
];

const DEFAULT_LIVE_MODEL =
  safe(process.env.GEMINI_LIVE_MODEL) || 'gemini-3.8-live';

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

  if (
    !force &&
    geminiCache.models.length &&
    Date.now() - geminiCache.at < 5 * 60_000
  ) {
    return geminiCache.models;
  }

  const configured = envList('GEMINI_MODELS', 'GEMINI_MODEL');

  let r;
  let data;

  try {
    r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=1000`
    );

    data = await r.json();

    if (!r.ok) {
      throw new Error(
        data?.error?.message || 'تعذر جلب نماذج Gemini.'
      );
    }
  } catch (error) {
    const fallback = configured.map((id) => ({
      id,
      label: id,
      description: '',
      methods: ['generateContent']
    }));

    geminiCache = {
      at: Date.now(),
      models: fallback
    };

    return fallback;
  }

  const all = Array.isArray(data?.models)
    ? data.models
    : [];

  const candidates = all
    .filter(
      (m) =>
        Array.isArray(m?.supportedGenerationMethods) &&
        m.supportedGenerationMethods.includes('generateContent')
    )
    .map((m) => ({
      id: modelId(m.name),
      label: m.displayName || modelLabel(m.name),
      description: m.description || '',
      methods: m.supportedGenerationMethods
    }))
    .filter((m) => m.id && /^gemini-/i.test(m.id))
    .filter((m) => !/embedding|aqa|live|image/i.test(m.id));

  const preferred = configured.filter((wanted) =>
    candidates.some((m) => m.id === wanted)
  );

  const ordered = preferred.length
    ? [
        ...preferred,
        ...candidates.filter(
          (m) => !preferred.includes(m.id)
        )
      ]
    : candidates;

  const unique = [];
  const seen = new Set();

  for (const m of ordered) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      unique.push(m);
    }
  }

  geminiCache = {
    at: Date.now(),
    models: unique.slice(0, 16)
  };

  return geminiCache.models;
}

async function discoverOpenAIModels(force = false) {
  const key = safe(process.env.OPENAI_API_KEY);
  const configured = envList('OPENAI_MODELS', 'OPENAI_MODEL');

  if (!key) {
    return configured.map((id) => ({
      id,
      label: id
    }));
  }

  if (
    !force &&
    openaiCache.models.length &&
    Date.now() - openaiCache.at < 5 * 60_000
  ) {
    return openaiCache.models;
  }

  try {
    const r = await fetch('https://api.openai.com/v1/models', {















    const data = await r.json();

    if (!r.ok) {
      throw new Error(
        data?.error?.message || 'تعذر جلب نماذج OpenAI.'
      );
    }

    const models = Array.isArray(data?.data)
      ? data.data
      : [];

    const candidates = models
      .map((m) => ({
        id: m.id,
        label: m.id
      }))
      .filter((m) => /^gpt-/i.test(m.id))
      .filter(
        (m) =>
          !/embedding|moderation|tts|whisper|audio|transcribe/i.test(
            m.id
          )
      );

    const preferred = configured.filter((wanted) =>
      candidates.some((m) => m.id === wanted)
    );

    const ordered = preferred.length
      ? [
          ...preferred,
          ...candidates.filter(
            (m) => !preferred.includes(m.id)
          )
        ]
      : candidates;

    const unique = [];
    const seen = new Set();

    for (const m of ordered) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        unique.push(m);
      }
    }

    openaiCache = {
      at: Date.now(),
      models: unique.slice(0, 16)
    };

    return openaiCache.models;
  } catch (error) {
    const fallback = configured.map((id) => ({
      id,
      label: id
    }));

    openaiCache = {
      at: Date.now(),
      models: fallback
    };

    return fallback;
  }
}

async function discoverElevenVoice() {
  const key = safe(process.env.ELEVENLABS_API_KEY);

  if (!key) return '';

  if (
    elevenCache.voiceId &&
    Date.now() - elevenCache.at < 30 * 60_000
  ) {
    return elevenCache.voiceId;
  }

  const configured =
    safe(process.env.ELEVENLABS_VOICE_ID) ||
    safe(process.env.ELEVENLABS_DEFAULT_VOICE_ID);

  if (configured) {
    elevenCache = {
      at: Date.now(),
      voiceId: configured
    };

    return configured;
  }

  try {
    const r = await fetch(
      'https://api.elevenlabs.io/v1/voices',
      {
        headers: {
          'xi-api-key': key
        }
      }
    );

    const data = await r.json();

    if (!r.ok) {
      throw new Error(
        data?.detail?.message ||
        data?.detail ||
        'تعذر جلب أصوات ElevenLabs.'
      );
    }

    const voices = Array.isArray(data?.voices)
      ? data.voices
      : [];

    const voice = voices[0];

    elevenCache = {
      at: Date.now(),
      voiceId: voice?.voice_id || ''
    };

    return elevenCache.voiceId;
  } catch {
    return '';
  }
}

function extractGeminiText(data) {
  const parts =
    data?.candidates?.[0]?.content?.parts || [];

  return parts
    .map((part) => part?.text || '')
    .join('')
    .trim();
}

function extractImagePart(data) {
  const parts =
    data?.candidates?.[0]?.content?.parts || [];

  for (const part of parts) {
    const inline =
      part?.inlineData ||
      part?.inline_data;

    if (inline?.data) {
      return {
        mimeType:
          safe(
            inline.mimeType ||
            inline.mime_type
          ) || 'image/png',
        data: inline.data
      };
    }
  }

  return null;
}

function recursiveMediaUrl(value, depth = 0) {
  if (!value || depth > 8) return '';

  if (typeof value === 'string') {
    if (
      /^https?:\/\//i.test(value) ||
      /^data:image\//i.test(value) ||
      /^data:video\//i.test(value)
    ) {
      return value;
    }

    return '';
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = recursiveMediaUrl(
        item,
        depth + 1
      );

      if (found) return found;
    }

    return '';
  }

  if (typeof value === 'object') {
    const directKeys = [
      'url',
      'image_url',
      'imageUrl',
      'video_url',
      'videoUrl',
      'media_url',
      'mediaUrl'
    ];

    for (const key of directKeys) {
      const found = recursiveMediaUrl(
        value[key],
        depth + 1
      );

      if (found) return found;
    }

    for (const [key, child] of Object.entries(value)) {
      if (
        /url|image|video|media|output|result|data/i.test(
          key
        )
      ) {
        const found = recursiveMediaUrl(
          child,
          depth + 1
        );

        if (found) return found;
      }
    }
  }

  return '';
}

function jobIdFrom(data) {
  return (
    safe(data?.job_id) ||
    safe(data?.jobId) ||
    safe(data?.id) ||
    safe(data?.task_id) ||
    safe(data?.taskId) ||
    ''
  );
}

function pixazoImagePath(model) {
  if (model === 'flux') {
    return 'flux/text-to-image';
  }

  if (model === 'gpt-image-2-5-flare') {
    return 'gpt-image-2-5-flare/v1/text-to-image';
  }

  if (model.includes('/')) {
    return model;
  }

  return `${model}/text-to-image`;
}

async function pixazoPost(pathname, body) {
  const key = requireKey('PIXAZO_API_KEY');

  const r = await fetch(
    `https://gateway.pixazo.ai/${pathname}`,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify(body)
    }
  );

  const text = await r.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = {
      raw: text
    };
  }

  return {
    response: r,
    data
  };
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'zaka-ai',
    time: new Date().toISOString()
  });
});





app.get('/api/config', async (req, res) => {
  try {
    const geminiModels = await discoverGeminiModels();
    const openaiModels = await discoverOpenAIModels();
    const elevenVoices = await discoverElevenLabsVoices();

    res.json({
      ok: true,
      models: {
        gemini: geminiModels,
        openai: openaiModels,
        geminiImage: envList(
          'GEMINI_IMAGE_MODELS',
          'GEMINI_IMAGE_MODEL',
          DEFAULT_GEMINI_IMAGE_MODELS
        ),
        pixazoImage: envList(
          'PIXAZO_IMAGE_MODELS',
          'PIXAZO_IMAGE_MODEL',
          DEFAULT_PIXAZO_IMAGE_MODELS
        ),
        elevenLabs: elevenVoices
      }
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || 'تعذر تحميل إعدادات النماذج.'
    });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const message = safe(req.body?.message);
    const model = safe(req.body?.model);

    if (!message) {
      return res.status(400).json({
        error: 'اكتب رسالتك أولًا.'
      });
    }

    const key = requireKey('GEMINI_API_KEY');

    const available = await discoverGeminiModels();
    const selectedModel =
      model ||
      available[0] ||
      safe(process.env.GEMINI_MODEL) ||
      'gemini-2.5-flash';

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': key,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: message
                }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          data?.error?.message ||
          'فشل الاتصال بنموذج Gemini.'
      });
    }

    const text = extractGeminiText(data);

    if (!text) {
      return res.status(502).json({
        error: 'لم يُرجع النموذج نصًا.'
      });
    }

    res.json({
      ok: true,
      model: selectedModel,
      text
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || 'حدث خطأ في المحادثة.'
    });
  }
});

app.post('/api/gemini-image', async (req, res) => {
  try {
    const key = requireKey('GEMINI_API_KEY');

    const available = envList(
      'GEMINI_IMAGE_MODELS',
      'GEMINI_IMAGE_MODEL',
      DEFAULT_GEMINI_IMAGE_MODELS
    );

    const model =
      safe(req.body?.model) ||
      available[0];

    const prompt = safe(req.body?.prompt);

    if (!prompt) {
      return res.status(400).json({
        error: 'اكتب وصف الصورة أولًا.'
      });
    }

    const responseFormat = {
      type: 'image',
      mime_type: 'image/png',
      aspect_ratio:
        safe(req.body?.aspectRatio) || '1:1',
      image_size:
        safe(req.body?.imageSize) || '1K'
    };

    const response = await fetch(
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

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          data?.error?.message ||
          'فشل توليد صورة Gemini.'
      });
    }

    const image =
      data?.output_image ||
      extractImagePart(data);

    if (!image?.data) {
      return res.status(502).json({
        error:
          'Gemini لم يُرجع صورة. جرّب نموذج صورة آخر.'
      });
    }

    const mime =
      safe(image.mime_type) || 'image/png';

    return res.json({
      ok: true,
      provider: 'gemini',
      model,
      imageUrl:
        `data:${mime};base64,${image.data}`
    });
  } catch (error) {
    res.status(500).json({
      error:
        error.message ||
        'حدث خطأ في توليد الصورة.'
    });
  }
});






app.post('/api/image', async (req, res) => {
  try {
    const model =
      safe(req.body?.model) ||
      envList(
        'PIXAZO_IMAGE_MODELS',
        'PIXAZO_IMAGE_MODEL',
        DEFAULT_PIXAZO_IMAGE_MODELS
      )[0];

    const prompt = safe(req.body?.prompt);

    if (!prompt) {
      return res.status(400).json({
        error: 'اكتب وصف الصورة أولًا.'
      });
    }

    const body = {
      prompt
    };

    if (safe(req.body?.imageSize)) {
      body.image_size = safe(req.body.imageSize);
    }

    if (safe(req.body?.aspectRatio)) {
      body.aspect_ratio = safe(req.body.aspectRatio);
    }

    const { response, data } =
      await pixazoPost(
        pixazoImagePath(model),
        body
      );

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          data?.error ||
          data?.message ||
          'فشل توليد صورة Pixazo.'
      });
    }

    const imageUrl = recursiveMediaUrl(data);
    const jobId = jobIdFrom(data);

    return res.json({
      ok: true,
      provider: 'pixazo',
      model,
      imageUrl,
      jobId,
      status: data?.status || ''
    });
  } catch (error) {
    res.status(500).json({
      error:
        error.message ||
        'تعذر توليد الصورة عبر Pixazo.'
    });
  }
});


app.post('/api/status', async (req, res) => {
  try {
    const jobId = safe(req.body?.jobId);

    if (!jobId) {
      return res.status(400).json({
        error: 'معرّف المهمة غير موجود.'
      });
    }

    const { response, data } =
      await pixazoPost(
        `/v1/images/${encodeURIComponent(jobId)}`,
        {}
      );

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          data?.error ||
          data?.message ||
          'تعذر معرفة حالة الصورة.'
      });
    }

    return res.json({
      ok: true,
      status: data?.status || '',
      imageUrl: recursiveMediaUrl(data),
      data
    });
  } catch (error) {
    res.status(500).json({
      error:
        error.message ||
        'حدث خطأ أثناء متابعة الصورة.'
    });
  }
});


app.post('/api/tts', async (req, res) => {
  try {
    const key = requireKey('ELEVENLABS_API_KEY');

    const text = safe(req.body?.text);
    const voiceId =
      safe(req.body?.voiceId) ||
      safe(process.env.ELEVENLABS_VOICE_ID);

    if (!text) {
      return res.status(400).json({
        error: 'اكتب النص أولًا.'
      });
    }

    if (!voiceId) {
      return res.status(400).json({
        error: 'لم يتم تحديد صوت ElevenLabs.'
      });
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': key,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg'
        },
        body: JSON.stringify({
          text,
          model_id:
            safe(req.body?.model) ||
            'eleven_multilingual_v2'
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      return res.status(response.status).json({
        error:
          errorText ||
          'فشل تحويل النص إلى صوت.'
      });
    }

    const buffer =
      Buffer.from(await response.arrayBuffer());

    res.setHeader(
      'Content-Type',
      'audio/mpeg'
    );

    res.send(buffer);
  } catch (error) {
    res.status(500).json({
      error:
        error.message ||
        'حدث خطأ في تحويل النص إلى صوت.'
    });
  }
});



app.post('/api/telegram/send', async (req, res) => {
  try {
    const token = requireKey('TELEGRAM_BOT_TOKEN');

    const chatId = safe(req.body?.chatId);
    const text = safe(req.body?.text);

    if (!chatId || !text) {
      return res.status(400).json({
        error: 'أدخل chatId والنص.'
      });
    }

    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: chatId,
          text
        })
      }
    );

    const data = await response.json();

    if (!response.ok || !data?.ok) {
      return res.status(response.status || 500).json({
        error:
          data?.description ||
          'فشل إرسال الرسالة إلى Telegram.'
      });
    }

    return res.json({
      ok: true,
      data
    });
  } catch (error) {
    res.status(500).json({
      error:
        error.message ||
        'حدث خطأ في Telegram.'
    });
  }
});


app.post('/api/live-token', async (req, res) => {
  try {
    const key = requireKey('GEMINI_API_KEY');

    const model =
      safe(req.body?.model) ||
      safe(process.env.GEMINI_LIVE_MODEL) ||
      DEFAULT_LIVE_MODEL;

    return res.json({
      ok: true,
      model,
      apiKey: key
    });
  } catch (error) {
    res.status(500).json({
      error:
        error.message ||
        'تعذر إنشاء إعدادات الاتصال المباشر.'
    });
  }
});


app.get('/api/status', (req, res) => {
  res.json({
    ok: true,
    service: 'ذكا صناعي',
    video: false,
    chat: true,
    image: true
  });
});


const PORT =
  Number(process.env.PORT) || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(
    `Zaka AI server running on port ${PORT}`
  );
});
