/**
 * CodeIn MAS — Indian Language Native Support
 *
 * Enables native Indian language understanding for the AI assistant.
 * Not just translated UI labels — the assistant understands Hindi/Tamil/Bengali/etc
 * prompts natively and generates code with comments in those languages.
 *
 * Uses pure JavaScript Unicode script-range analysis (no external NLP deps).
 * Handles romanized Indian language text (e.g. "yeh function ko fix karo")
 * which is extremely common in Indian developer communication.
 *
 * @module indian-lang
 */
"use strict";

const { createLogger } = require("./logger");

const log = createLogger("IndianLang");

/* ------------------------------------------------------------------ */
/*  Unicode Script Ranges                                              */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} UnicodeScriptRange
 * @property {number} start - Start code point (inclusive)
 * @property {number} end   - End code point (inclusive)
 */

/** @type {Record<string, UnicodeScriptRange>} */
const SCRIPT_RANGES = Object.freeze({
  devanagari: { start: 0x0900, end: 0x097f },
  bengali: { start: 0x0980, end: 0x09ff },
  gurmukhi: { start: 0x0a00, end: 0x0a7f },
  gujarati: { start: 0x0a80, end: 0x0aff },
  oriya: { start: 0x0b00, end: 0x0b7f },
  tamil: { start: 0x0b80, end: 0x0bff },
  telugu: { start: 0x0c00, end: 0x0c7f },
  kannada: { start: 0x0c80, end: 0x0cff },
  malayalam: { start: 0x0d00, end: 0x0d7f },
  arabic: { start: 0x0600, end: 0x06ff }, // Urdu, Sindhi, Kashmiri (Nastaliq)
  ol_chiki: { start: 0x1c50, end: 0x1c7f }, // Santali
});

/* ------------------------------------------------------------------ */
/*  Romanized Word Lists                                               */
/* ------------------------------------------------------------------ */

/**
 * Common Hindi words written in Latin script that developers use daily.
 * Includes imperative verbs, conjunctions, pronouns, and dev-specific slang.
 * @type {string[]}
 */
const ROMANIZED_HINDI_WORDS = Object.freeze([
  // Imperative / action verbs developers use
  "karo",
  "banao",
  "dikhao",
  "likho",
  "badlo",
  "hatao",
  "jodo",
  "dekho",
  "samjhao",
  "chalao",
  "bhejo",
  "nikalo",
  "dalo",
  "kholo",
  "band",
  "chalu",
  "theek",
  "sahi",
  "galat",
  "achha",
  "bura",
  "pehle",
  "baad",
  "abhi",
  // Common connectors / particles
  "hai",
  "hain",
  "ho",
  "tha",
  "thi",
  "the",
  "hoga",
  "hogi",
  "ka",
  "ki",
  "ke",
  "ko",
  "se",
  "mein",
  "par",
  "pe",
  "tak",
  "wala",
  "yeh",
  "woh",
  "kya",
  "kaise",
  "kahan",
  "kab",
  "kyun",
  "kaun",
  "aur",
  "ya",
  "lekin",
  "agar",
  "toh",
  "nahi",
  "mat",
  "bas",
  // Dev-specific Hindi
  "chal",
  "ruk",
  "dekh",
  "bata",
  "samajh",
  "pakad",
  "error",
  "bug",
  "code",
  "file",
  "folder",
  "function",
  "variable",
  "loop",
  "isko",
  "usko",
  "idhar",
  "udhar",
  "sab",
  "kuch",
  "bohot",
  "thoda",
]);

/**
 * Common Tamil words in Latin script used by developers.
 * @type {string[]}
 */
const ROMANIZED_TAMIL_WORDS = Object.freeze([
  "seyya",
  "kaattu",
  "ezhuthu",
  "maatru",
  "neekku",
  "serr",
  "paaru",
  "puriyala",
  "sollu",
  "kondu",
  "vaa",
  "po",
  "podu",
  "eduthu",
  "enna",
  "epdi",
  "enga",
  "yaar",
  "ethuku",
  "appuram",
  "ippo",
  "iru",
  "illa",
  "aama",
  "seri",
  "thappu",
  "correct",
  "romba",
  "konjam",
  "intha",
  "antha",
  "ithu",
  "athu",
  "inga",
  "anga",
]);

/**
 * Common Bengali words in Latin script used by developers.
 * @type {string[]}
 */
const ROMANIZED_BENGALI_WORDS = Object.freeze([
  "koro",
  "dekhao",
  "likho",
  "banao",
  "bodlao",
  "felo",
  "jogkoro",
  "bolo",
  "bojhao",
  "pathao",
  "kholo",
  "bondho",
  "chalo",
  "ki",
  "keno",
  "kothay",
  "kobe",
  "ke",
  "aar",
  "ba",
  "kintu",
  "haan",
  "na",
  "thik",
  "bhul",
  "shotti",
  "onek",
  "ektu",
  "eta",
  "ota",
  "ekhane",
  "okhane",
  "shob",
  "kichu",
  "aro",
]);

/**
 * Common Telugu words in Latin script.
 * @type {string[]}
 */
const ROMANIZED_TELUGU_WORDS = Object.freeze([
  "cheyyi",
  "chudu",
  "raayii",
  "maarchu",
  "teeseyyi",
  "kalpu",
  "cheppu",
  "ardam",
  "pampu",
  "teruvu",
  "enti",
  "ela",
  "ekkada",
  "eppudu",
  "enduku",
  "evaru",
  "avunu",
  "kaadu",
  "sare",
  "tappu",
  "correct",
  "chala",
  "koncham",
]);

/**
 * Combined romanized lookup — maps each word to its source language(s).
 * Built once at module load for O(1) lookups.
 * @type {Map<string, string[]>}
 */
const ROMANIZED_LOOKUP = new Map();
(function buildLookup() {
  const sources = [
    ["hindi", ROMANIZED_HINDI_WORDS],
    ["tamil", ROMANIZED_TAMIL_WORDS],
    ["bengali", ROMANIZED_BENGALI_WORDS],
    ["telugu", ROMANIZED_TELUGU_WORDS],
  ];
  for (const [lang, words] of sources) {
    for (const w of words) {
      const key = w.toLowerCase();
      if (ROMANIZED_LOOKUP.has(key)) {
        ROMANIZED_LOOKUP.get(key).push(lang);
      } else {
        ROMANIZED_LOOKUP.set(key, [lang]);
      }
    }
  }
})();

/* ------------------------------------------------------------------ */
/*  INDIAN_LANGUAGES — Full config for all 19 deeply-configured languages */
/* (22 languages including Maithili, Nepali, Sanskrit, Kashmiri are      */
/*  served by the /api/languages endpoint via i18n.js)                   */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} IndianLanguageConfig
 * @property {string}   code              - ISO 639 code
 * @property {string}   name              - English name
 * @property {string}   nativeName        - Name in the language's own script
 * @property {string}   script            - Script name
 * @property {string}   unicodeRange      - "U+XXXX-U+XXXX"
 * @property {string[]} commentExamples   - Example code comments
 * @property {Record<string,string>} commonDevTerms - Programming terms in that language
 * @property {string[]} romanizedPatterns - Words commonly written in Latin script
 */

/** @type {Record<string, IndianLanguageConfig>} */
const INDIAN_LANGUAGES = Object.freeze({
  hi: {
    code: "hi",
    name: "Hindi",
    nativeName: "हिन्दी",
    script: "Devanagari",
    unicodeRange: "U+0900-U+097F",
    commentExamples: [
      "// यह फ़ंक्शन डेटा लोड करता है",
      "// उपयोगकर्ता इनपुट की जाँच करें",
    ],
    commonDevTerms: {
      function: "फ़ंक्शन",
      variable: "चर",
      loop: "लूप",
      array: "सारणी",
      string: "स्ट्रिंग",
      object: "ऑब्जेक्ट",
      error: "त्रुटि",
      file: "फ़ाइल",
      input: "इनपुट",
      output: "आउटपुट",
    },
    romanizedPatterns: [
      "karo",
      "banao",
      "dikhao",
      "likho",
      "badlo",
      "hai",
      "hain",
      "ko",
      "ka",
      "ki",
      "se",
      "mein",
      "kaise",
      "kya",
      "yeh",
      "woh",
    ],
  },

  bn: {
    code: "bn",
    name: "Bengali",
    nativeName: "বাংলা",
    script: "Bengali",
    unicodeRange: "U+0980-U+09FF",
    commentExamples: [
      "// এই ফাংশন ডেটা লোড করে",
      "// ব্যবহারকারীর ইনপুট যাচাই করুন",
    ],
    commonDevTerms: {
      function: "ফাংশন",
      variable: "চলক",
      loop: "লুপ",
      array: "অ্যারে",
      string: "স্ট্রিং",
      error: "ত্রুটি",
      file: "ফাইল",
      input: "ইনপুট",
      output: "আউটপুট",
    },
    romanizedPatterns: [
      "koro",
      "dekhao",
      "likho",
      "banao",
      "bodlao",
      "bolo",
      "ki",
      "keno",
      "kothay",
      "eta",
      "ota",
      "haan",
      "na",
    ],
  },

  te: {
    code: "te",
    name: "Telugu",
    nativeName: "తెలుగు",
    script: "Telugu",
    unicodeRange: "U+0C00-U+0C7F",
    commentExamples: [
      "// ఈ ఫంక్షన్ డేటాను లోడ్ చేస్తుంది",
      "// వినియోగదారు ఇన్‌పుట్‌ను ధృవీకరించండి",
    ],
    commonDevTerms: {
      function: "ఫంక్షన్",
      variable: "వేరియబుల్",
      loop: "లూప్",
      array: "శ్రేణి",
      string: "స్ట్రింగ్",
      error: "లోపం",
      file: "ఫైలు",
    },
    romanizedPatterns: [
      "cheyyi",
      "chudu",
      "raayii",
      "maarchu",
      "cheppu",
      "enti",
      "ela",
      "ekkada",
      "avunu",
      "kaadu",
    ],
  },

  mr: {
    code: "mr",
    name: "Marathi",
    nativeName: "मराठी",
    script: "Devanagari",
    unicodeRange: "U+0900-U+097F",
    commentExamples: [
      "// हे फंक्शन डेटा लोड करते",
      "// वापरकर्त्याच्या इनपुटची तपासणी करा",
    ],
    commonDevTerms: {
      function: "फंक्शन",
      variable: "चल",
      loop: "लूप",
      array: "मालिका",
      string: "स्ट्रिंग",
      error: "चूक",
      file: "फाइल",
    },
    romanizedPatterns: [
      "kara",
      "dakhva",
      "liha",
      "badla",
      "bagha",
      "ahe",
      "aahe",
      "ka",
      "kasa",
      "kuthe",
    ],
  },

  ta: {
    code: "ta",
    name: "Tamil",
    nativeName: "தமிழ்",
    script: "Tamil",
    unicodeRange: "U+0B80-U+0BFF",
    commentExamples: [
      "// இந்த செயல்பாடு தரவை ஏற்றுகிறது",
      "// பயனர் உள்ளீட்டை சரிபார்க்கவும்",
    ],
    commonDevTerms: {
      function: "செயல்பாடு",
      variable: "மாறி",
      loop: "வளையம்",
      array: "அணி",
      string: "சரம்",
      error: "பிழை",
      file: "கோப்பு",
      input: "உள்ளீடு",
      output: "வெளியீடு",
    },
    romanizedPatterns: [
      "seyya",
      "kaattu",
      "ezhuthu",
      "maatru",
      "paaru",
      "enna",
      "epdi",
      "enga",
      "aama",
      "illa",
    ],
  },

  ur: {
    code: "ur",
    name: "Urdu",
    nativeName: "اردو",
    script: "Arabic",
    unicodeRange: "U+0600-U+06FF",
    commentExamples: [
      "// یہ فنکشن ڈیٹا لوڈ کرتا ہے",
      "// صارف کے ان پٹ کی جانچ کریں",
    ],
    commonDevTerms: {
      function: "فنکشن",
      variable: "متغیر",
      loop: "لوپ",
      array: "صف",
      string: "سٹرنگ",
      error: "خرابی",
      file: "فائل",
    },
    romanizedPatterns: [
      "karo",
      "banao",
      "dikhao",
      "likho",
      "badlo",
      "hai",
      "hain",
      "ko",
      "ka",
      "ki",
      "kaise",
      "kya",
    ],
  },

  gu: {
    code: "gu",
    name: "Gujarati",
    nativeName: "ગુજરાતી",
    script: "Gujarati",
    unicodeRange: "U+0A80-U+0AFF",
    commentExamples: [
      "// આ ફંક્શન ડેટા લોડ કરે છે",
      "// વપરાશકર્તા ઇનપુટ ચકાસો",
    ],
    commonDevTerms: {
      function: "ફંક્શન",
      variable: "ચલ",
      loop: "લૂપ",
      array: "શ્રેણી",
      string: "સ્ટ્રિંગ",
      error: "ભૂલ",
      file: "ફાઇલ",
    },
    romanizedPatterns: [
      "karo",
      "banavo",
      "batavo",
      "lakho",
      "badlo",
      "chhe",
      "hatu",
      "su",
      "kem",
      "kya",
    ],
  },

  kn: {
    code: "kn",
    name: "Kannada",
    nativeName: "ಕನ್ನಡ",
    script: "Kannada",
    unicodeRange: "U+0C80-U+0CFF",
    commentExamples: [
      "// ಈ ಫಂಕ್ಷನ್ ಡೇಟಾವನ್ನು ಲೋಡ್ ಮಾಡುತ್ತದೆ",
      "// ಬಳಕೆದಾರರ ಇನ್‌ಪುಟ್ ಅನ್ನು ಪರಿಶೀಲಿಸಿ",
    ],
    commonDevTerms: {
      function: "ಫಂಕ್ಷನ್",
      variable: "ವೇರಿಯಬಲ್",
      loop: "ಲೂಪ್",
      array: "ಅರೇ",
      string: "ಸ್ಟ್ರಿಂಗ್",
      error: "ದೋಷ",
      file: "ಫೈಲ್",
    },
    romanizedPatterns: [
      "maadu",
      "toorisu",
      "bareyiri",
      "badlisu",
      "noodu",
      "enu",
      "hege",
      "elli",
      "yavaga",
      "yaaru",
    ],
  },

  ml: {
    code: "ml",
    name: "Malayalam",
    nativeName: "മലയാളം",
    script: "Malayalam",
    unicodeRange: "U+0D00-U+0D7F",
    commentExamples: [
      "// ഈ ഫങ്ഷൻ ഡാറ്റ ലോഡ് ചെയ്യുന്നു",
      "// ഉപയോക്തൃ ഇൻപുട്ട് പരിശോധിക്കുക",
    ],
    commonDevTerms: {
      function: "ഫങ്ഷൻ",
      variable: "വേരിയബിൾ",
      loop: "ലൂപ്പ്",
      array: "അറേ",
      string: "സ്ട്രിംഗ്",
      error: "പിശക്",
      file: "ഫയൽ",
    },
    romanizedPatterns: [
      "cheyyuka",
      "kaanikkuka",
      "ezhuthuka",
      "maattuka",
      "nokkuka",
      "enthu",
      "engane",
      "evide",
      "eppol",
      "aaru",
    ],
  },

  or: {
    code: "or",
    name: "Odia",
    nativeName: "ଓଡ଼ିଆ",
    script: "Oriya",
    unicodeRange: "U+0B00-U+0B7F",
    commentExamples: [
      "// ଏହି ଫଙ୍କସନ ଡାଟା ଲୋଡ କରେ",
      "// ଉପଯୋଗକର୍ତ୍ତାଙ୍କ ଇନପୁଟ ଯାଞ୍ଚ କରନ୍ତୁ",
    ],
    commonDevTerms: {
      function: "ଫଙ୍କସନ",
      variable: "ଭେରିଏବଲ",
      loop: "ଲୁପ",
      array: "ଆରେ",
      string: "ଷ୍ଟ୍ରିଂ",
      error: "ତ୍ରୁଟି",
      file: "ଫାଇଲ",
    },
    romanizedPatterns: [
      "kara",
      "dekhao",
      "likha",
      "badla",
      "dekha",
      "ki",
      "kain",
      "kuanre",
      "haan",
      "na",
    ],
  },

  pa: {
    code: "pa",
    name: "Punjabi",
    nativeName: "ਪੰਜਾਬੀ",
    script: "Gurmukhi",
    unicodeRange: "U+0A00-U+0A7F",
    commentExamples: [
      "// ਇਹ ਫੰਕਸ਼ਨ ਡੇਟਾ ਲੋਡ ਕਰਦਾ ਹੈ",
      "// ਉਪਭੋਗਤਾ ਇਨਪੁੱਟ ਦੀ ਜਾਂਚ ਕਰੋ",
    ],
    commonDevTerms: {
      function: "ਫੰਕਸ਼ਨ",
      variable: "ਵੇਰੀਏਬਲ",
      loop: "ਲੂਪ",
      array: "ਐਰੇ",
      string: "ਸਤਰ",
      error: "ਗਲਤੀ",
      file: "ਫ਼ਾਈਲ",
    },
    romanizedPatterns: [
      "karo",
      "banao",
      "dikhao",
      "likho",
      "badlo",
      "hai",
      "ji",
      "ki",
      "kiven",
      "kidhar",
    ],
  },

  as: {
    code: "as",
    name: "Assamese",
    nativeName: "অসমীয়া",
    script: "Bengali",
    unicodeRange: "U+0980-U+09FF",
    commentExamples: [
      "// এই ফাংচনে ডেটা লোড কৰে",
      "// ব্যৱহাৰকাৰীৰ ইনপুট পৰীক্ষা কৰক",
    ],
    commonDevTerms: {
      function: "ফাংচন",
      variable: "চলক",
      loop: "লুপ",
      array: "এৰে",
      string: "ষ্ট্ৰিং",
      error: "ত্ৰুটি",
      file: "ফাইল",
    },
    romanizedPatterns: [
      "korok",
      "dikhuwak",
      "likhok",
      "solak",
      "saak",
      "ki",
      "kio",
      "kot",
      "hoi",
      "nai",
    ],
  },

  mai: {
    code: "mai",
    name: "Maithili",
    nativeName: "मैथिली",
    script: "Devanagari",
    unicodeRange: "U+0900-U+097F",
    commentExamples: [
      "// ई फंक्शन डेटा लोड करैत अछि",
      "// यूजर इनपुट जाँच करू",
    ],
    commonDevTerms: {
      function: "फंक्शन",
      variable: "चर",
      loop: "लूप",
      array: "सारणी",
      string: "स्ट्रिंग",
      error: "गलती",
      file: "फाइल",
    },
    romanizedPatterns: [
      "karu",
      "dekhau",
      "likhu",
      "banau",
      "badlu",
      "achhi",
      "chhaith",
      "ki",
      "kona",
      "katay",
    ],
  },

  sat: {
    code: "sat",
    name: "Santali",
    nativeName: "ᱥᱟᱱᱛᱟᱲᱤ",
    script: "Ol Chiki",
    unicodeRange: "U+1C50-U+1C7F",
    commentExamples: [
      "// ᱱᱩᱭ ᱯᱷᱟᱝᱥᱚᱱ ᱰᱟᱴᱟ ᱞᱚᱰ ᱮᱫᱟ",
      "// ᱵᱮᱵᱷᱟᱨᱤᱭᱟᱹ ᱤᱱᱯᱩᱴ ᱧᱮᱞ ᱢᱮ",
    ],
    commonDevTerms: {
      function: "ᱯᱷᱟᱝᱥᱚᱱ",
      variable: "ᱵᱮᱵᱷᱟᱨᱤᱭᱟᱹ",
      loop: "ᱞᱩᱯ",
      array: "ᱮᱨᱮ",
      string: "ᱥᱴᱨᱤᱝ",
      error: "ᱵᱷᱩᱞ",
      file: "ᱯᱷᱟᱭᱤᱞ",
    },
    romanizedPatterns: [
      "me",
      "nel",
      "ol",
      "ror",
      "cal",
      "do",
      "okoy",
      "oka",
      "haan",
      "bah",
    ],
  },

  ks: {
    code: "ks",
    name: "Kashmiri",
    nativeName: "कॉशुर",
    script: "Devanagari",
    unicodeRange: "U+0900-U+097F",
    commentExamples: [
      "// यि फंक्शन डेटा लोड करान छु",
      "// यूज़र इनपुट चेक करिव",
    ],
    commonDevTerms: {
      function: "फंक्शन",
      variable: "वेरिएबल",
      loop: "लूप",
      array: "ऐरे",
      string: "स्ट्रिंग",
      error: "गलती",
      file: "फ़ाइल",
    },
    romanizedPatterns: [
      "kariv",
      "dikhnaav",
      "likhiv",
      "badaliv",
      "gatshiv",
      "chu",
      "chhu",
      "kya",
      "kati",
      "yeli",
    ],
  },

  ne: {
    code: "ne",
    name: "Nepali",
    nativeName: "नेपाली",
    script: "Devanagari",
    unicodeRange: "U+0900-U+097F",
    commentExamples: [
      "// यो फंक्शनले डेटा लोड गर्छ",
      "// प्रयोगकर्ता इनपुट जाँच गर्नुहोस्",
    ],
    commonDevTerms: {
      function: "फंक्शन",
      variable: "चर",
      loop: "लुप",
      array: "एरे",
      string: "स्ट्रिङ",
      error: "त्रुटि",
      file: "फाइल",
    },
    romanizedPatterns: [
      "garnus",
      "dekhaunus",
      "lekhnus",
      "badlnus",
      "hernus",
      "cha",
      "chha",
      "ho",
      "ke",
      "kasari",
      "kaha",
    ],
  },

  kok: {
    code: "kok",
    name: "Konkani",
    nativeName: "कोंकणी",
    script: "Devanagari",
    unicodeRange: "U+0900-U+097F",
    commentExamples: [
      "// हें फंक्शन डेटा लोड करता",
      "// वापरप्याच्या इनपुटाची तपासणी करात",
    ],
    commonDevTerms: {
      function: "फंक्शन",
      variable: "चल",
      loop: "लूप",
      array: "एरे",
      string: "स्ट्रिंग",
      error: "चूक",
      file: "फायल",
    },
    romanizedPatterns: [
      "kora",
      "dakhoita",
      "bora",
      "bodla",
      "poia",
      "asa",
      "kitein",
      "koslo",
      "kityak",
      "konnak",
    ],
  },

  sd: {
    code: "sd",
    name: "Sindhi",
    nativeName: "سنڌي",
    script: "Arabic",
    unicodeRange: "U+0600-U+06FF",
    commentExamples: ["// هي فنڪشن ڊيٽا لوڊ ڪندو آهي", "// يوزر انپٽ چيڪ ڪريو"],
    commonDevTerms: {
      function: "فنڪشن",
      variable: "ويريئبل",
      loop: "لوپ",
      array: "ايري",
      string: "اسٽرنگ",
      error: "نقص",
      file: "فائيل",
    },
    romanizedPatterns: [
      "kayo",
      "dikhayo",
      "likho",
      "badlo",
      "hato",
      "aahe",
      "kire",
      "kithey",
      "kahiro",
      "cha",
    ],
  },

  doi: {
    code: "doi",
    name: "Dogri",
    nativeName: "डोगरी",
    script: "Devanagari",
    unicodeRange: "U+0900-U+097F",
    commentExamples: [
      "// एह् फंक्शन डेटा लोड करदा ऐ",
      "// यूज़र इनपुट दी जाँच करो",
    ],
    commonDevTerms: {
      function: "फंक्शन",
      variable: "वेरिएबल",
      loop: "लूप",
      array: "एरे",
      string: "स्ट्रिंग",
      error: "गलती",
      file: "फ़ाइल",
    },
    romanizedPatterns: [
      "karo",
      "dikhao",
      "likho",
      "badlo",
      "dekho",
      "ai",
      "hega",
      "ki",
      "kiyan",
      "kithey",
    ],
  },
});

/* ------------------------------------------------------------------ */
/*  Script-to-language mapping (for disambiguation within a script)    */
/* ------------------------------------------------------------------ */

/** @type {Record<string, string[]>} */
const SCRIPT_TO_LANGS = Object.freeze({
  devanagari: ["hi", "mr", "mai", "ks", "ne", "kok", "doi"],
  bengali: ["bn", "as"],
  gurmukhi: ["pa"],
  gujarati: ["gu"],
  oriya: ["or"],
  tamil: ["ta"],
  telugu: ["te"],
  kannada: ["kn"],
  malayalam: ["ml"],
  arabic: ["ur", "sd"],
  ol_chiki: ["sat"],
});

/* ------------------------------------------------------------------ */
/*  IndianLanguageProcessor                                            */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} LanguageDetectionResult
 * @property {string}  language   - Detected language code ("hi", "bn", "ta", etc.) or "unknown"
 * @property {string}  script     - Detected script name ("devanagari", "bengali", etc.) or "latin"
 * @property {number}  confidence - Detection confidence 0–1
 * @property {boolean} isIndic    - Whether the text is in an Indian language
 * @property {boolean} isMixed    - Whether the text mixes Indian language with English
 */

/**
 * @typedef {Object} EnhancedPromptResult
 * @property {string} enhancedPrompt - The original prompt with language context prepended
 * @property {string} systemAddendum - Additional system-level instruction for the LLM
 * @property {string} commentPrefix  - Suggested comment prefix (e.g. "//")
 */

class IndianLanguageProcessor {
  constructor() {
    /** @type {Map<string, string[]>} */
    this._romanizedLookup = ROMANIZED_LOOKUP;
    log.info("IndianLanguageProcessor initialised", {
      supportedLanguages: Object.keys(INDIAN_LANGUAGES).length,
    });
  }

  /* ---------------------------------------------------------------- */
  /*  detectLanguage                                                    */
  /* ---------------------------------------------------------------- */

  /**
   * Detects which Indian language the input text is written in.
   *
   * Works in two phases:
   *   1. Unicode script analysis — counts characters per script range.
   *   2. Romanized fallback — if text is mostly Latin, checks against
   *      known romanized Indian-language word lists.
   *
   * @param {string} text - User input text
   * @returns {LanguageDetectionResult}
   */
  detectLanguage(text) {
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return {
        language: "unknown",
        script: "unknown",
        confidence: 0,
        isIndic: false,
        isMixed: false,
      };
    }

    const cleaned = text.trim();

    // Phase 1: Unicode script analysis
    const scriptCounts = this._countScripts(cleaned);
    const totalLetters = scriptCounts._totalLetters;

    if (totalLetters === 0) {
      return {
        language: "unknown",
        script: "unknown",
        confidence: 0,
        isIndic: false,
        isMixed: false,
      };
    }

    // Find dominant Indic script
    let dominantScript = null;
    let dominantCount = 0;
    for (const [script, count] of Object.entries(scriptCounts)) {
      if (script.startsWith("_")) continue;
      if (script === "latin") continue;
      if (count > dominantCount) {
        dominantCount = count;
        dominantScript = script;
      }
    }

    const latinCount = scriptCounts.latin || 0;
    const indicRatio = dominantCount / totalLetters;
    const latinRatio = latinCount / totalLetters;

    // Case A: Mostly Indic script characters
    if (dominantScript && indicRatio >= 0.3) {
      const isMixed = latinRatio >= 0.15;
      const langs = SCRIPT_TO_LANGS[dominantScript] || [];
      const language =
        langs.length === 1
          ? langs[0]
          : this._disambiguateScript(cleaned, dominantScript, langs);
      const confidence = Math.min(1, indicRatio + 0.1);

      log.debug("Detected Indic script", {
        language,
        dominantScript,
        indicRatio,
        isMixed,
      });

      return {
        language,
        script: dominantScript,
        confidence: Math.round(confidence * 100) / 100,
        isIndic: true,
        isMixed,
      };
    }

    // Case B: Mostly Latin — check for romanized Indian language
    if (latinRatio >= 0.7) {
      const romanResult = this._detectRomanized(cleaned);
      if (romanResult) {
        log.debug("Detected romanized Indian language", romanResult);
        return romanResult;
      }
    }

    // Case C: No clear Indian language signal
    return {
      language: "unknown",
      script: latinRatio > 0.5 ? "latin" : "unknown",
      confidence: 0,
      isIndic: false,
      isMixed: false,
    };
  }

  /* ---------------------------------------------------------------- */
  /*  enhancePrompt                                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Wraps the user's prompt with language-aware instructions for the LLM.
   *
   * @param {string} userPrompt    - Original user prompt
   * @param {LanguageDetectionResult} detectedLang - Output from detectLanguage()
   * @returns {EnhancedPromptResult}
   */
  enhancePrompt(userPrompt, detectedLang) {
    if (!detectedLang || !detectedLang.isIndic) {
      return {
        enhancedPrompt: userPrompt,
        systemAddendum: "",
        commentPrefix: "//",
      };
    }

    const langConfig = INDIAN_LANGUAGES[detectedLang.language];
    const langName = langConfig ? langConfig.name : detectedLang.language;
    const nativeName = langConfig ? langConfig.nativeName : "";
    const commentPrefix = "//";

    let systemAddendum;

    if (detectedLang.isMixed) {
      systemAddendum =
        `The user is mixing ${langName}${nativeName ? ` (${nativeName})` : ""} with English (code-switching). ` +
        `This is normal in Indian developer communication. ` +
        `Understand their intent, respond in a mix of English and ${langName} as appropriate, ` +
        `and generate clean code. Add comments in ${langName} using ${commentPrefix} format where helpful.`;
    } else if (detectedLang.script === "latin") {
      // Romanized
      systemAddendum =
        `The user is writing in romanized ${langName} (${langName} words in Latin script). ` +
        `This is a common input method for Indian developers. ` +
        `Understand their intent fully. Respond with code and add ${langName} comments using ${commentPrefix} format. ` +
        `You may respond in romanized ${langName} or ${nativeName ? `in ${nativeName} script` : `in native script`} as appropriate.`;
    } else {
      systemAddendum =
        `The user is writing in ${langName}${nativeName ? ` (${nativeName})` : ""}. ` +
        `Understand their intent and respond with code. ` +
        `Add ${langName} comments using ${commentPrefix} format. ` +
        `You may include explanations in ${langName} alongside the code.`;
    }

    const enhancedPrompt = `[Language Context: ${langName}]\n${userPrompt}`;

    log.debug("Prompt enhanced", {
      language: langName,
      isMixed: detectedLang.isMixed,
    });

    return {
      enhancedPrompt,
      systemAddendum,
      commentPrefix,
    };
  }

  /* ---------------------------------------------------------------- */
  /*  generateLocalizedComments                                        */
  /* ---------------------------------------------------------------- */

  /**
   * Returns instructions for the LLM to add comments in the specified Indian language.
   * Does NOT translate anything itself — instructs the LLM to do so.
   *
   * @param {string} code     - Source code to be commented
   * @param {string} langCode - Target language code ("hi", "ta", "bn", etc.)
   * @returns {{ instruction: string, examples: string[], language: string, commentStyle: string }}
   */
  generateLocalizedComments(code, langCode) {
    const langConfig = INDIAN_LANGUAGES[langCode];
    if (!langConfig) {
      log.warn("Unsupported language code for comment generation", {
        langCode,
      });
      return {
        instruction:
          "Add clear comments in English explaining each section of the code.",
        examples: ["// Load user data", "// Validate input"],
        language: "en",
        commentStyle: "//",
      };
    }

    const devTermsList = Object.entries(langConfig.commonDevTerms)
      .map(([en, native]) => `${en} → ${native}`)
      .join(", ");

    const instruction =
      `Add inline comments to the following code in ${langConfig.name} (${langConfig.nativeName}). ` +
      `Use the // comment style. ` +
      `Write comments that explain the purpose and logic, not just literal translations of the code. ` +
      `Use these ${langConfig.name} programming terms where appropriate: ${devTermsList}. ` +
      `Keep variable names, function names, and keywords in English — only comments should be in ${langConfig.name}.\n\n` +
      `Code:\n${code}`;

    return {
      instruction,
      examples: langConfig.commentExamples,
      language: langConfig.code,
      commentStyle: "//",
    };
  }

  /* ---------------------------------------------------------------- */
  /*  getLanguageConfig                                                 */
  /* ---------------------------------------------------------------- */

  /**
   * Returns the full configuration object for a given language code.
   *
   * @param {string} langCode - ISO 639 language code ("hi", "bn", "ta", etc.)
   * @returns {IndianLanguageConfig|null}
   */
  getLanguageConfig(langCode) {
    return INDIAN_LANGUAGES[langCode] || null;
  }

  /* ---------------------------------------------------------------- */
  /*  getSupportedLanguages                                             */
  /* ---------------------------------------------------------------- */

  /**
   * Returns metadata for all 19 supported Indian languages.
   *
   * @returns {Array<{ code: string, name: string, nativeName: string, script: string }>}
   */
  getSupportedLanguages() {
    return Object.values(INDIAN_LANGUAGES).map((lang) => ({
      code: lang.code,
      name: lang.name,
      nativeName: lang.nativeName,
      script: lang.script,
    }));
  }

  /* ---------------------------------------------------------------- */
  /*  Internal helpers                                                  */
  /* ---------------------------------------------------------------- */

  /**
   * Counts characters belonging to each Unicode script range.
   * @param {string} text
   * @returns {Record<string, number> & { _totalLetters: number }}
   * @private
   */
  _countScripts(text) {
    /** @type {Record<string, number>} */
    const counts = { latin: 0, _totalLetters: 0 };

    for (const scriptName of Object.keys(SCRIPT_RANGES)) {
      counts[scriptName] = 0;
    }

    for (let i = 0; i < text.length; i++) {
      const cp = text.codePointAt(i);
      if (cp === undefined) continue;

      // Skip surrogate pair trailing units
      if (cp > 0xffff) {
        i++;
      }

      // Skip whitespace, digits, punctuation (ASCII)
      if (cp <= 0x40) continue;
      if (cp >= 0x5b && cp <= 0x60) continue;
      if (cp >= 0x7b && cp <= 0x7f) continue;

      // Latin letters
      if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) {
        counts.latin++;
        counts._totalLetters++;
        continue;
      }

      // Check each Indic script range
      let matched = false;
      for (const [scriptName, range] of Object.entries(SCRIPT_RANGES)) {
        if (cp >= range.start && cp <= range.end) {
          counts[scriptName]++;
          counts._totalLetters++;
          matched = true;
          break;
        }
      }

      // Count any other letter-like characters (extended Latin, etc.)
      if (!matched && cp > 0x7f) {
        counts._totalLetters++;
      }
    }

    return counts;
  }

  /**
   * Disambiguates between languages sharing the same script
   * (e.g. Devanagari → Hindi vs Marathi vs Nepali).
   *
   * Uses simple heuristics: checks for language-specific words / particles.
   *
   * @param {string} text
   * @param {string} script
   * @param {string[]} candidateLangs
   * @returns {string} Best-guess language code
   * @private
   */
  _disambiguateScript(text, script, candidateLangs) {
    if (candidateLangs.length === 0) return "unknown";
    if (candidateLangs.length === 1) return candidateLangs[0];

    // Score each candidate by checking romanized patterns against any Latin
    // portions AND by defaulting to the most commonly spoken language.
    // For Devanagari, Hindi is the default. For Bengali script, Bengali is default.
    const defaults = {
      devanagari: "hi",
      bengali: "bn",
      arabic: "ur",
    };

    // Try romanized pattern matching on any Latin-script portions
    const latinWords = text
      .split(/\s+/)
      .map((w) => w.toLowerCase().replace(/[^a-z]/g, ""))
      .filter((w) => w.length > 1);

    if (latinWords.length > 0) {
      /** @type {Record<string, number>} */
      const scores = {};
      for (const lang of candidateLangs) scores[lang] = 0;

      for (const word of latinWords) {
        for (const lang of candidateLangs) {
          const config = INDIAN_LANGUAGES[lang];
          if (config && config.romanizedPatterns.includes(word)) {
            scores[lang]++;
          }
        }
      }

      const topLang = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
      if (topLang && topLang[1] > 0) {
        return topLang[0];
      }
    }

    return defaults[script] || candidateLangs[0];
  }

  /**
   * Detects romanized Indian language from Latin-script text.
   * Tokenises the text and checks each word against the romanized lookup.
   *
   * @param {string} text
   * @returns {LanguageDetectionResult|null}
   * @private
   */
  _detectRomanized(text) {
    const words = text
      .toLowerCase()
      .split(/[\s,.\-!?;:'"()\[\]{}]+/)
      .map((w) => w.replace(/[^a-z]/g, ""))
      .filter((w) => w.length > 1);

    if (words.length === 0) return null;

    // Count matches per language
    /** @type {Record<string, number>} */
    const langHits = {};
    let totalHits = 0;

    for (const word of words) {
      const langs = this._romanizedLookup.get(word);
      if (langs) {
        totalHits++;
        for (const lang of langs) {
          langHits[lang] = (langHits[lang] || 0) + 1;
        }
      }
    }

    // Need at least 2 matches or 20% of words to be recognised
    const hitRatio = totalHits / words.length;
    if (totalHits < 2 && hitRatio < 0.2) return null;

    // Find dominant language
    const sorted = Object.entries(langHits).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return null;

    const [topLang, topCount] = sorted[0];
    const confidence = Math.min(
      1,
      hitRatio * 0.7 + (Math.min(topCount, 10) / 10) * 0.3,
    );

    // Check if there are significant English-only words too
    const nonMatchedRatio = 1 - hitRatio;
    const isMixed = hitRatio > 0.1 && nonMatchedRatio > 0.3;

    return {
      language: topLang,
      script: "latin",
      confidence: Math.round(confidence * 100) / 100,
      isIndic: true,
      isMixed,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Exports                                                            */
/* ------------------------------------------------------------------ */

module.exports = {
  IndianLanguageProcessor,
  INDIAN_LANGUAGES,
};
