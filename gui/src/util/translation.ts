import { agentFetch } from "./agentConfig";

const LANG_DETECTORS = [
  { label: "Hindi", code: "hi-IN", regex: /[\u0900-\u097F]/ },
  { label: "Bengali", code: "bn-IN", regex: /[\u0980-\u09FF]/ },
  { label: "Tamil", code: "ta-IN", regex: /[\u0B80-\u0BFF]/ },
  { label: "Telugu", code: "te-IN", regex: /[\u0C00-\u0C7F]/ },
  { label: "Kannada", code: "kn-IN", regex: /[\u0C80-\u0CFF]/ },
  { label: "Malayalam", code: "ml-IN", regex: /[\u0D00-\u0D7F]/ },
  { label: "Marathi", code: "mr-IN", regex: /[\u0900-\u097F]/ },
  { label: "Gujarati", code: "gu-IN", regex: /[\u0A80-\u0AFF]/ },
  { label: "Punjabi", code: "pa-IN", regex: /[\u0A00-\u0A7F]/ },
  { label: "Odia", code: "or-IN", regex: /[\u0B00-\u0B7F]/ },
  { label: "Assamese", code: "as-IN", regex: /[\u0980-\u09FF]/ },
  { label: "Urdu", code: "ur-IN", regex: /[\u0600-\u06FF]/ },
];

export type TranslationResult = {
  languageLabel: string | null;
  languageCode: string | null;
  translatedText: string | null;
};

export function detectIndianLanguage(text: string): {
  label: string | null;
  code: string | null;
} {
  for (const lang of LANG_DETECTORS) {
    if (lang.regex.test(text)) {
      return { label: lang.label, code: lang.code };
    }
  }
  return { label: null, code: null };
}

export async function translateToEnglish(
  text: string,
): Promise<TranslationResult> {
  const detection = detectIndianLanguage(text);
  if (!detection.code) {
    return { languageLabel: null, languageCode: null, translatedText: null };
  }

  try {
    const response = await agentFetch("/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        source: detection.code,
        target: "en",
      }),
    });
    if (!response.ok) {
      throw new Error("Translation failed");
    }
    const data = await response.json();
    return {
      languageLabel: detection.label,
      languageCode: detection.code,
      translatedText: data.text || null,
    };
  } catch {
    return {
      languageLabel: detection.label,
      languageCode: detection.code,
      translatedText: null,
    };
  }
}
