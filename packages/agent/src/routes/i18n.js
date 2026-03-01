/**
 * I18N, translation, voice (STT/TTS) route handlers
 */
const {
  jsonResponse,
  readBody,
  parseJsonBody,
  validateAndSanitizeInput,
  handleRoute,
} = require("../utils/http-helpers");

function registerI18nRoutes(router, deps) {
  const { i18nOrchestrator, cache, logger } = deps;

  // ── core i18n endpoints ────────────────────────────────────────────────
  router.post("/i18n/translate", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const raw = await readBody(req);
        const parsed = parseJsonBody(raw);
        if (!parsed.ok) {
          jsonResponse(res, 400, { error: parsed.error });
          return;
        }

        const validation = validateAndSanitizeInput(parsed.value, {
          text: {
            required: true,
            type: "string",
            maxLength: 100000,
            sanitize: true,
          },
          sourceLang: { required: false, type: "string", maxLength: 10 },
          targetLang: { required: true, type: "string", maxLength: 10 },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const { text, sourceLang, targetLang } = validation.data;
        const cacheKey = `translate:${sourceLang}:${targetLang}:${text.substring(0, 100)}`;
        const cached = cache.get(cacheKey);
        if (cached) {
          jsonResponse(res, 200, { ...cached, cached: true });
          return;
        }

        const translated = await i18nOrchestrator.translate(
          text,
          sourceLang,
          targetLang,
        );
        const result = { translated, source: sourceLang, target: targetLang };
        cache.set(cacheKey, result, { ttl: 3600000, category: "translation" });
        jsonResponse(res, 200, result);
      },
      logger,
    );
  });

  router.post("/i18n/detect-language", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const raw = await readBody(req);
        const parsed = parseJsonBody(raw);
        if (!parsed.ok) {
          jsonResponse(res, 400, { error: parsed.error });
          return;
        }

        const validation = validateAndSanitizeInput(parsed.value, {
          text: {
            required: true,
            type: "string",
            maxLength: 10000,
            sanitize: true,
          },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const { text } = validation.data;
        const cacheKey = `detect-lang:${text.substring(0, 100)}`;
        const cached = cache.get(cacheKey);
        if (cached) {
          jsonResponse(res, 200, { language: cached, cached: true });
          return;
        }

        const language = i18nOrchestrator.detectLanguage(text);
        cache.set(cacheKey, language, {
          ttl: 3600000,
          category: "language-detection",
        });
        jsonResponse(res, 200, { language });
      },
      logger,
    );
  });

  router.post("/i18n/stt", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const raw = await readBody(req);
        const parsed = parseJsonBody(raw);
        if (!parsed.ok) {
          jsonResponse(res, 400, { error: parsed.error });
          return;
        }

        const validation = validateAndSanitizeInput(parsed.value, {
          audioPath: {
            required: true,
            type: "string",
            format: "path",
            mustExist: true,
          },
          lang: { required: true, type: "string", maxLength: 10 },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const { audioPath, lang } = validation.data;
        const transcript = await i18nOrchestrator.stt(audioPath, lang);
        jsonResponse(res, 200, { transcript, language: lang });
      },
      logger,
    );
  });

  router.post("/i18n/tts", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const raw = await readBody(req);
        const parsed = parseJsonBody(raw);
        if (!parsed.ok) {
          jsonResponse(res, 400, { error: parsed.error });
          return;
        }

        const validation = validateAndSanitizeInput(parsed.value, {
          text: {
            required: true,
            type: "string",
            maxLength: 10000,
            sanitize: true,
          },
          lang: { required: true, type: "string", maxLength: 10 },
          outputPath: { required: false, type: "string", format: "path" },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const { text, lang, outputPath } = validation.data;
        const audioPath = await i18nOrchestrator.tts(text, lang, outputPath);
        jsonResponse(res, 200, { audioPath });
      },
      logger,
    );
  });

  // ── legacy /translate and /voice endpoints ─────────────────────────────
  router.post("/translate", async (req, res) => {
    const raw = await readBody(req);
    const parsed = parseJsonBody(raw);
    if (!parsed.ok) {
      jsonResponse(res, 400, { error: parsed.error });
      return;
    }

    const validation = validateAndSanitizeInput(parsed.value, {
      text: {
        required: true,
        type: "string",
        maxLength: 100000,
        sanitize: true,
      },
      source: { required: false, type: "string", maxLength: 10 },
      target: { required: true, type: "string", maxLength: 10 },
    });
    if (!validation.valid) {
      jsonResponse(res, 400, { error: validation.errors.join(", ") });
      return;
    }

    await handleRoute(
      res,
      async () => {
        const { text, source, target } = validation.data;
        const translated = await i18nOrchestrator.translate(
          text,
          source || "auto",
          target,
        );
        jsonResponse(res, 200, {
          provider: "i18n",
          source: source || "auto",
          target,
          translated,
        });
      },
      logger,
    );
  });

  router.post("/voice/stt", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const raw = await readBody(req);
        const parsed = parseJsonBody(raw);
        if (!parsed.ok) {
          jsonResponse(res, 400, { error: parsed.error });
          return;
        }

        const validation = validateAndSanitizeInput(parsed.value, {
          audioPath: {
            required: true,
            type: "string",
            format: "path",
            mustExist: true,
          },
          language: { required: true, type: "string", maxLength: 10 },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const { audioPath, language } = validation.data;
        const result = await i18nOrchestrator.stt(audioPath, language);
        jsonResponse(res, 200, result);
      },
      logger,
    );
  });

  router.post("/voice/tts", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const raw = await readBody(req);
        const parsed = parseJsonBody(raw);
        if (!parsed.ok) {
          jsonResponse(res, 400, { error: parsed.error });
          return;
        }

        const validation = validateAndSanitizeInput(parsed.value, {
          text: {
            required: true,
            type: "string",
            maxLength: 10000,
            sanitize: true,
          },
          language: { required: true, type: "string", maxLength: 10 },
          outputPath: { required: false, type: "string", format: "path" },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const { text, language, outputPath } = validation.data;
        const result = await i18nOrchestrator.tts(text, language, outputPath);
        jsonResponse(res, 200, result);
      },
      logger,
    );
  });

  // ── compatibility /api endpoints ───────────────────────────────────────
  router.post("/api/translate", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const raw = await readBody(req);
        const parsed = parseJsonBody(raw);
        if (!parsed.ok) {
          jsonResponse(res, 400, { error: parsed.error });
          return;
        }

        const validation = validateAndSanitizeInput(parsed.value, {
          text: {
            required: true,
            type: "string",
            maxLength: 100000,
            sanitize: true,
          },
          source_language: { required: false, type: "string", maxLength: 10 },
          target_language: { required: true, type: "string", maxLength: 10 },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const translated = await i18nOrchestrator.translate(
          validation.data.text,
          validation.data.source_language || "auto",
          validation.data.target_language,
        );
        jsonResponse(res, 200, { translation: translated });
      },
      logger,
    );
  });

  router.post("/api/detect-language", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const raw = await readBody(req);
        const parsed = parseJsonBody(raw);
        if (!parsed.ok) {
          jsonResponse(res, 400, { error: parsed.error });
          return;
        }

        const validation = validateAndSanitizeInput(parsed.value, {
          text: {
            required: true,
            type: "string",
            maxLength: 10000,
            sanitize: true,
          },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const language = i18nOrchestrator.detectLanguage(validation.data.text);
        jsonResponse(res, 200, { language, name: language });
      },
      logger,
    );
  });

  router.get("/api/languages", async (req, res) => {
    jsonResponse(res, 200, {
      languages: [
        { code: "en", name: "English", native: "English" },
        { code: "hi", name: "Hindi", native: "हिन्दी" },
        { code: "as", name: "Assamese", native: "অসমীয়া" },
        { code: "ta", name: "Tamil", native: "தமிழ்" },
        { code: "te", name: "Telugu", native: "తెలుగు" },
        { code: "bn", name: "Bengali", native: "বাংলা" },
        { code: "kn", name: "Kannada", native: "ಕನ್ನಡ" },
        { code: "ml", name: "Malayalam", native: "മലയാളം" },
        { code: "mr", name: "Marathi", native: "मराठी" },
        { code: "gu", name: "Gujarati", native: "ગુજરાતી" },
        { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ" },
        { code: "or", name: "Odia", native: "ଓଡ଼ିଆ" },
        { code: "ur", name: "Urdu", native: "اردو" },
      ],
    });
  });

  router.post("/api/completion", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const raw = await readBody(req);
        const parsed = parseJsonBody(raw);
        if (!parsed.ok) {
          jsonResponse(res, 400, { error: parsed.error });
          return;
        }
        jsonResponse(res, 200, {
          completion: "",
          note: "Completion provider not configured",
        });
      },
      logger,
    );
  });
}

module.exports = { registerI18nRoutes };
