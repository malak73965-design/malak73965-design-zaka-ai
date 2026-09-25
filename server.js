import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html']
}));

const safe = (value) => {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : '';
};

const csv = (value = '') => {
  return safe(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const envList = (plural, singular, fallback = []) => {
  const many = csv(process.env[plural]);
  if (many.length) return many;

  const one = csv(process.env[singular]);
  if (one.length) return one;

  return [...fallback];
};

const requireKey = (name) => {
  const value = safe(process.env[name]);

  if (!value) {
    throw new Error(`${name} غير مضبوط في Render.`);
  }

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
  safe(process.env.GEMINI_LIVE_MODEL) ||
  'gemini-3.8-live';

let geminiCache = {
  at: 0,
  models: []
};

let openaiCache = {
  at: 0,
  models: []
};

let elevenCache = {
  at: 0,
  voiceId: ''
};

function modelId(value) {
  return String(value || '')
    .replace(/^models\//, '');
}

function modelLabel(value) {
  return modelId(value)
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* -----------------------------
   اكتشاف نماذج Gemini
----------------------------- */

async function discoverGeminiModels(force = false) {
  const key = safe(process.env.GEMINI_API_KEY);

  const fallback = envList(
    'GEMINI_MODELS',
    'GEMINI_MODEL',
    ['gemini-2.5-flash']
  ).map((id) => ({
    id,
    label: id
  }));

  if (!key) {
    return fallback;
  }

  if (
    !force &&
    geminiCache.models.length &&
    Date.now() - geminiCache.at < 5 * 60 * 1000
  ) {
    return geminiCache.models;
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=1000`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data?.error?.message ||
        'تعذر جلب نماذج Gemini.'
      );
    }

    const models = Array.isArray(data?.models)
      ? data.models
      : [];

    const candidates = models
      .filter((model) => {
        return Array.isArray(
          model?.supportedGenerationMethods
        ) &&
          model.supportedGenerationMethods.includes(
            'generateContent'
          );
      })
      .map((model) => {
        const id = modelId(model.name);

        return {
          id,
          label: model.displayName || modelLabel(id)
        };
      })
      .filter((model) => {
        return model.id &&
          /^gemini-/i.test(model.id) &&
          !/embedding|aqa|live|image/i.test(model.id);
      });

    const configured = envList(
      'GEMINI_MODELS',
      'GEMINI_MODEL'
    );

    const preferred = configured
      .filter((wanted) => {
        return candidates.some(
          (model) => model.id === wanted
        );
      })
      .map((id) => ({
        id,
        label: id
      }));

    const ordered = preferred.length
      ? [
          ...preferred,
          ...candidates.filter((model) => {
            return !preferred.some(
              (item) => item.id === model.id
            );
          })
        ]
      : candidates;

    const unique = [];
    const seen = new Set();

    for (const model of ordered) {
      if (!seen.has(model.id)) {
        seen.add(model.id);
        unique.push(model);
      }
    }

    geminiCache = {
      at: Date.now(),
      models: unique.slice(0, 16)
    };

    return geminiCache.models.length
      ? geminiCache.models
      : fallback;
  } catch {
    geminiCache = {
      at: Date.now(),
      models: fallback
    };

    return fallback;
  }
}

/* -----------------------------
   اكتشاف نماذج OpenAI
----------------------------- */

async function discoverOpenAIModels(force = false) {
  const key = safe(process.env.OPENAI_API_KEY);

  const fallback = envList(
    'OPENAI_MODELS',
    'OPENAI_MODEL',
    ['gpt-4o-mini']
  ).map((id) => ({
    id,
    label: id
  }));

  if (!key) {
    return [];
  }

  if (
    !force &&
    openaiCache.models.length &&
    Date.now() - openaiCache.at < 5 * 60 * 1000
  ) {
    return openaiCache.models;
  }

  try {
    const response = await fetch(
      'https://api.openai.com/v1/models',
      {
        headers: {
          Authorization: `Bearer ${key}`
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data?.error?.message ||
        'تعذر جلب نماذج OpenAI.'
      );
    }

    const models = Array.isArray(data?.data)
      ? data.data
      : [];

    const candidates = models
      .filter((model) => {
        return /^gpt-/i.test(model.id) &&
          !/embedding|moderation|tts|whisper|audio|transcribe/i.test(
            model.id
          );
      })
      .map((model) => ({
        id: model.id,
        label: model.id
      }));

    const result = candidates.length
      ? candidates
      : fallback;

    openaiCache = {
      at: Date.now(),
      models: result.slice(0, 16)
    };

    return openaiCache.models;
  } catch {
    return fallback;
  }
}

/* -----------------------------
   أصوات ElevenLabs
----------------------------- */

async function discoverElevenLabsVoice() {
  const key = safe(process.env.ELEVENLABS_API_KEY);

  if (!key) return '';

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

  if (
    elevenCache.voiceId &&
    Date.now() - elevenCache.at < 30 * 60 * 1000
  ) {
    return elevenCache.voiceId;
  }

  try {
    const response = await fetch(
      'https://api.elevenlabs.io/v1/voices',
      {
        headers: {
          'xi-api-key': key
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error('تعذر جلب أصوات ElevenLabs.');
    }

    const voice = Array.isArray(data?.voices)
      ? data.voices[0]
      : null;

    elevenCache = {
      at: Date.now(),
      voiceId: voice?.voice_id || ''
    };

    return elevenCache.voiceId;
  } catch {
    return '';
  }
}

/* -----------------------------
   أدوات Gemini
----------------------------- */

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

/* -----------------------------
   أدوات Pixazo
----------------------------- */

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
      const result = recursiveMediaUrl(
        item,
        depth + 1
      );

      if (result) return result;
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
      const result = recursiveMediaUrl(
        value[key],
        depth + 1
      );

      if (result) return result;
    }

    for (const [key, child] of Object.entries(value)) {
      if (
        /url|image|video|media|output|result|data/i.test(
          key
        )
      ) {
        const result = recursiveMediaUrl(
          child,
          depth + 1
        );

        if (result) return result;
      }
    }
  }

  return '';
}

function getJobId(data) {
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

function normalizePixazoPath(pathname = '') {
  return String(pathname || '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

async function pixazoPost(pathname, body) {
  const key = requireKey('PIXAZO_API_KEY');
  const url = `https://gateway.pixazo.ai/${normalizePixazoPath(pathname)}`;

  const response = await fetch(
    url,
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

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = {
      raw: text
    };
  }

  return {
    response,
    data
  };
}

/* -----------------------------
   فحص الخادم
----------------------------- */

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'zaka-ai',
    time: new Date().toISOString()
  });
});

/* -----------------------------
   إعدادات الواجهة
----------------------------- */

app.get('/api/config', async (_req, res) => {
  try {
    const geminiModels =
      await discoverGeminiModels();

    const openaiModels =
      await discoverOpenAIModels();

    const elevenVoice =
      await discoverElevenLabsVoice();

    const geminiImageModels = envList(
      'GEMINI_IMAGE_MODELS',
      'GEMINI_IMAGE_MODEL',
      DEFAULT_GEMINI_IMAGE_MODELS
    );

    const pixazoImageModels = envList(
      'PIXAZO_IMAGE_MODELS',
      'PIXAZO_IMAGE_MODEL',
      DEFAULT_PIXAZO_IMAGE_MODELS
    );

    res.json({
      ok: true,

      providers: {
        gemini: !!safe(process.env.GEMINI_API_KEY),
        openai: !!safe(process.env.OPENAI_API_KEY),
        geminiImage: !!safe(process.env.GEMINI_API_KEY),
        pixazo: !!safe(process.env.PIXAZO_API_KEY),
        elevenlabs: !!safe(process.env.ELEVENLABS_API_KEY),
        telegram: !!safe(process.env.TELEGRAM_BOT_TOKEN)
      },

      defaults: {
        chatProvider: 'gemini',
        imageProvider: 'gemini',
        chatModel: geminiModels[0]?.id || 'gemini-2.5-flash'
      },

      models: {
        gemini: geminiModels,
        openai: openaiModels,
        geminiImage: geminiImageModels,
        pixazoImage: pixazoImageModels,
        elevenLabs: elevenVoice
      }
    });
  } catch (error) {
    res.status(500).json({
      error:
        error.message ||
        'تعذر تحميل إعدادات النماذج.'
    });
  }
});

/* -----------------------------
   المحادثة
----------------------------- */

app.post('/api/chat', async (req, res) => {
  try {
    const provider =
      safe(req.body?.provider) || 'gemini';

    const directMessage =
      safe(req.body?.message);

    const messages = Array.isArray(
      req.body?.messages
    )
      ? req.body.messages
      : [];

    const lastMessage =
      messages.length
        ? safe(
            messages[messages.length - 1]?.content
          )
        : '';

    const message =
      directMessage || lastMessage;

    if (!message) {
      return res.status(400).json({
        error: 'اكتب رسالتك أولًا.'
      });
    }

    if (provider !== 'gemini') {
      return res.status(400).json({
        error:
          'المحادثة الحالية تعمل مع Gemini فقط.'
      });
    }

    const key = requireKey('GEMINI_API_KEY');

    const models =
      await discoverGeminiModels();

    const model =
      safe(req.body?.model) ||
      models[0]?.id ||
      'gemini-2.5-flash';

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
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
      provider: 'gemini',
      model,
      text
    });
  } catch (error) {
    res.status(500).json({
      error:
        error.message ||
        'حدث خطأ في المحادثة.'
    });
  }
});

/* -----------------------------
   توليد صورة Gemini
----------------------------- */

app.post('/api/gemini-image', async (req, res) => {
  try {
    const key = requireKey('GEMINI_API_KEY');

    const models = envList(
      'GEMINI_IMAGE_MODELS',
      'GEMINI_IMAGE_MODEL',
      DEFAULT_GEMINI_IMAGE_MODELS
    );

    const model =
      safe(req.body?.model) ||
      models[0];

    const prompt =
      safe(req.body?.prompt);

    if (!prompt) {
      return res.status(400).json({
        error: 'اكتب وصف الصورة أولًا.'
      });
    }

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
          response_format: {
            type: 'image',
            mime_type: 'image/png',
            aspect_ratio:
              safe(req.body?.aspectRatio) || '1:1',
            image_size:
              safe(req.body?.imageSize) || '1K'
          }
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
          'Gemini لم يُرجع صورة.'
      });
    }

    const mime =
      safe(
        image.mime_type ||
        image.mimeType
      ) || 'image/png';

    res.json({
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

/* -----------------------------
   توليد صورة Pixazo
----------------------------- */

app.post('/api/image', async (req, res) => {
  try {
    const models = envList(
      'PIXAZO_IMAGE_MODELS',
      'PIXAZO_IMAGE_MODEL',
      DEFAULT_PIXAZO_IMAGE_MODELS
    );

    const model =
      safe(req.body?.model) ||
      models[0];

    const prompt =
      safe(req.body?.prompt);

    if (!prompt) {
      return res.status(400).json({
        error: 'اكتب وصف الصورة أولًا.'
      });
    }

    const body = {
      prompt
    };

    if (safe(req.body?.imageSize)) {
      body.image_size =
        safe(req.body.imageSize);
    }

    if (safe(req.body?.aspectRatio)) {
      body.aspect_ratio =
        safe(req.body.aspectRatio);
    }

    const result = await pixazoPost(
      pixazoImagePath(model),
      body
    );

    if (!result.response.ok) {
      return res.status(result.response.status).json({
        error:
          result.data?.error ||
          result.data?.message ||
          'فشل توليد صورة Pixazo.'
      });
    }

    res.json({
      ok: true,
      provider: 'pixazo',
      model,
      imageUrl: recursiveMediaUrl(result.data),
      jobId: getJobId(result.data),
      status: result.data?.status || ''
    });
  } catch (error) {
    res.status(500).json({
      error:
        error.message ||
        'تعذر توليد الصورة عبر Pixazo.'
    });
  }
});

/* -----------------------------
   حالة صورة Pixazo
----------------------------- */

async function pixazoStatusHandler(req, res) {
  try {
    const jobId =
      safe(req.body?.jobId);

    if (!jobId) {
      return res.status(400).json({
        error: 'معرّف المهمة غير موجود.'
      });
    }

    const result = await pixazoPost(
      `v1/images/${encodeURIComponent(jobId)}`,
      {}
    );

    if (!result.response.ok) {
      return res.status(result.response.status).json({
        error:
          result.data?.error ||
          result.data?.message ||
          'تعذر معرفة حالة الصورة.'
      });
    }

    res.json({
      ok: true,
      status: result.data?.status || '',
      imageUrl: recursiveMediaUrl(result.data),
      data: result.data
    });
  } catch (error) {
    res.status(500).json({
      error:
        error.message ||
        'حدث خطأ أثناء متابعة الصورة.'
    });
  }
}

app.post('/api/status', pixazoStatusHandler);
app.post('/api/pixazo/status', pixazoStatusHandler);

/* -----------------------------
   تحويل النص إلى صوت
----------------------------- */

app.post('/api/tts', async (req, res) => {
  try {
    const key =
      requireKey('ELEVENLABS_API_KEY');

    const text =
      safe(req.body?.text);

    const voiceId =
      safe(req.body?.voiceId) ||
      safe(process.env.ELEVENLABS_VOICE_ID) ||
      await discoverElevenLabsVoice();

    if (!text) {
      return res.status(400).json({
        error: 'اكتب النص أولًا.'
      });
    }

    if (!voiceId) {
      return res.status(400).json({
        error:
          'لم يتم تحديد صوت ElevenLabs.'
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
      const message =
        await response.text();

      return res.status(response.status).json({
        error:
          message ||
          'فشل تحويل النص إلى صوت.'
      });
    }

    const buffer =
      Buffer.from(
        await response.arrayBuffer()
      );

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

/* -----------------------------
   Telegram
----------------------------- */

app.post('/api/telegram/send', async (req, res) => {
  try {
    const token =
      requireKey('TELEGRAM_BOT_TOKEN');

    const chatId =
      safe(req.body?.chatId) ||
      safe(process.env.TELEGRAM_CHAT_ID);

    const text =
      safe(req.body?.text);

    if (!chatId || !text) {
      return res.status(400).json({
        error:
          'أدخل TELEGRAM_CHAT_ID والنص.'
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
        error: data?.description || 'فشل إرسال الرسالة إلى Telegram.'
      });
    }

    res.json({
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

/* -----------------------------
   المكالمة المباشرة
----------------------------- */

app.post('/api/live-token', async (req, res) => {
  try {
    const key =
      requireKey('GEMINI_API_KEY');

    const model =
      safe(req.body?.model) ||
      DEFAULT_LIVE_MODEL;

    /*
      لا نرسل المفتاح إلى الواجهة.
      نرجع النموذج فقط، لأن إرسال المفتاح للمتصفح غير آمن.
    */

    res.json({
      ok: true,
      model
    });
  } catch (error) {
    res.status(500).json({
      error:
        error.message ||
        'تعذر إنشاء إعدادات الاتصال المباشر.'
    });
  }
});

/* -----------------------------
   حالة التطبيق
----------------------------- */

app.get('/api/status', (_req, res) => {
  res.json({
    ok: true,
    service: 'ذكا صناعي',
    chat: true,
    image: true,
    video: false
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(
    `Zaka AI server running on port ${PORT}`
  );
});
