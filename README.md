# ذكا صناعي

واجهة عربية موحدة للدردشة وتوليد الصور والفيديو والصوت، مع تبديل المزود والنموذج من داخل التطبيق.

## المزايا الحالية
- ChatGPT / OpenAI عبر Responses API.
- Gemini Chat عبر Gemini API.
- Gemini Image (Nano Banana) مع اختيار النموذج والدقة ونسبة الأبعاد.
- Pixazo Image.
- Pixazo Video مع polling للوظائف غير المتزامنة.
- ElevenLabs لتحويل ردود الشات إلى صوت.
- إدخال صوتي من متصفح الجهاز.
- PWA قابلة للتثبيت على أندرويد.
- Telegram endpoint اختياري.

## التشغيل
```bash
npm install
npm start
```

## Render
Build Command: `npm install`

Start Command: `npm start`

ضع المفاتيح في Render Environment فقط، ولا تضعها في JavaScript أو GitHub.

يمكنك استخدام متغيرات مفردة أو قوائم مفصولة بفواصل للنماذج:
- `OPENAI_MODEL` أو `OPENAI_MODELS`
- `GEMINI_MODEL` أو `GEMINI_MODELS`
- `GEMINI_IMAGE_MODEL` أو `GEMINI_IMAGE_MODELS`
- `PIXAZO_IMAGE_MODEL` أو `PIXAZO_IMAGE_MODELS`
- `PIXAZO_VIDEO_MODEL` أو `PIXAZO_VIDEO_MODELS`
