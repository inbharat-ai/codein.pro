/**
 * CodeIn Landing Page — Internationalisation (i18n)
 *
 * Supported UI languages:
 *   en — English
 *   hi — हिन्दी (Hindi)
 *   ta — தமிழ் (Tamil)
 *   te — తెలుగు (Telugu)
 *   bn — বাংলা (Bengali)
 *   mr — मराठी (Marathi)
 *   gu — ગુજરાતી (Gujarati)
 *   kn — ಕನ್ನಡ (Kannada)
 *   ml — മലയാളം (Malayalam)
 *   pa — ਪੰਜਾਬੀ (Punjabi)
 *
 * Usage:
 *   setLanguage('hi');
 *   t('hero.title');         // returns Hindi string
 *   applyTranslations();    // walks DOM, replaces [data-i18n] nodes
 */

const I18N = {
  /* ═══════════════════════ ENGLISH (default) ═══════════════════════ */
  en: {
    // --- Navbar ---
    "nav.features": "Features",
    "nav.skills": "Superpowers",
    "nav.downloads": "Downloads",
    "nav.requirements": "Requirements",
    "nav.faq": "FAQ",
    "nav.github": "GitHub",

    // --- Hero ---
    "hero.badge": "v1.0.0 — Open Source & Free Forever",
    "hero.title1": "Code in every",
    "hero.title2": "language of Bharat",
    "hero.subtitle":
      "CodeIn is an AI-powered code editor that understands Hindi, Tamil, Bengali, and 20+ Indian languages. Built on open-source. Runs locally. Your code never leaves your machine.",
    "hero.download": "Download for",
    "hero.all_platforms": "All platforms",
    "hero.detected": "Detected:",
    "hero.license": "Apache-2.0 License",

    // --- Features section ---
    "features.label": "Features",
    "features.title1": "Everything you need,",
    "features.title2": "nothing you don't",
    "features.subtitle":
      "Built from the ground up for Indian developers who think in their mother tongue but code for the world.",

    "feat.languages.title": "20+ Indian Languages",
    "feat.languages.desc":
      "Code with comments, prompts, and AI chat in Hindi, Tamil, Bengali, Telugu, Marathi, Gujarati, Kannada, Malayalam, Punjabi, and more.",
    "feat.offline.title": "Offline AI Agent",
    "feat.offline.desc":
      "Bundled llama.cpp inference engine. No API keys, no cloud bills. Your code and prompts never leave your machine.",
    "feat.autocomplete.title": "Smart Autocomplete",
    "feat.autocomplete.desc":
      "Context-aware ghost-text suggestions that understand your project structure, imports, and coding style. Lightning fast.",
    "feat.chat.title": "AI Chat & Edit",
    "feat.chat.desc":
      "Ask questions, refactor code, generate tests — all in a conversational interface. Supports @-mentions for files and symbols.",
    "feat.privacy.title": "100% Private",
    "feat.privacy.desc":
      "No telemetry, no tracking, no cloud dependency. Perfect for government, defense, and enterprise environments.",
    "feat.crossplatform.title": "Cross-Platform",
    "feat.crossplatform.desc":
      "Native builds for Windows, macOS (Intel + Apple Silicon), and Linux. One codebase, consistent experience everywhere.",

    // --- Superpowers section ---
    "skills.label": "Superpowers",
    "skills.title": "What makes CodeIn extraordinary",
    "skills.subtitle":
      "Not just another code editor. CodeIn has capabilities no other tool offers.",

    "skill.sovereign.title": "Sovereign Mode",
    "skill.sovereign.desc":
      "Air-gapped, zero-telemetry computing. Every feature works without internet. Built for defense, government, and sensitive environments. AES-256 encrypted config.",
    "skill.voice.title": "Voice Coding",
    "skill.voice.desc":
      "Speak in Hindi, Tamil, Bengali, or 11 other Indian languages and watch code appear. Real-time speech-to-text, voice commands, and AI reads answers back to you.",
    "skill.compute.title": "CodeIn Computer",
    "skill.compute.desc":
      "Full local compute engine with auto-setup on first launch. Give it a goal in any language, it plans, codes, tests, and delivers. Process isolation with pause, resume, cancel. LLM auto-installs or reuses existing model.",
    "skill.agent.title": "Autonomous Agent Mode",
    "skill.agent.desc":
      "Reads files, writes code, runs terminal, self-corrects errors. 4 AI modes: Ask, Plan, Implement, Agent. Goes from idea to working code hands-free.",
    "skill.edit.title": "Edit Contracts",
    "skill.edit.desc":
      "AI produces precise JSON patches with unified diffs. Preview every change, one-click Apply, instant Rollback. No guesswork, full version control.",
    "skill.research.title": "Built-in Web Research",
    "skill.research.desc":
      "Search the web, fetch documentation, find code examples and bug solutions — all from inside the editor. 6 research modes, zero API keys needed.",
    "skill.mcp.title": "MCP Tool Protocol",
    "skill.mcp.desc":
      "Connect to any MCP server \u2014 GitHub, Slack, Jira, databases, Docker, Kubernetes, and hundreds more. The AI agent uses MCP tools autonomously: open PRs, query DBs, deploy apps, run CI pipelines. Infinite extensibility.",
    "skill.models.title": "Model Management",
    "skill.models.desc":
      "Download and manage GGUF models from HuggingFace. Smart router picks the right model for each task. Separate Coder and Reasoner model slots.",
    "skill.git.title": "Full Git Integration",
    "skill.git.desc":
      "Commit code, push to GitHub/GitLab/Bitbucket, pull, branch, merge, rebase, stash, tag \u2014 all from a beautiful GUI. AI writes your commit messages. Full blame, diff viewer, and history timeline. No terminal needed.",
    "skill.debug.title": "Advanced Debugging",
    "skill.debug.desc":
      "Breakpoints, watch expressions, call stack, variables inspector. Multi-language support: JS, Python, Java, C#, Go, Rust, and more.",
    "skill.deploy.title": "One-Click Deploy",
    "skill.deploy.desc":
      "Auto-generate configs for Vercel, Netlify, Firebase. Deploy instructions and setup — no manual configuration needed.",
    "skill.cli.title": "CLI Agent (cn)",
    "skill.cli.desc":
      "Full coding agent in your terminal. Interactive TUI, headless mode for CI/CD, session management, JSON output. Works in Docker and VS Code.",
    "skill.media.title": "Media Toolkit",
    "skill.media.desc":
      "Generate diagrams, images, and videos \u2014 all locally on your CPU or GPU. Auto-detects hardware, picks optimal presets, and renders Mermaid, PlantUML, Stable Diffusion, and more. Zero cloud, full privacy.",

    // --- Flagship Features section ---
    "flagship.label": "Flagship Features",
    "flagship.title": "Power tools no other editor has",
    "flagship.subtitle":
      "Local compute and media generation \u2014 entirely on your machine, no cloud required.",
    "flagship.compute.tag": "Agentic Local Compute Engine",
    "flagship.compute.desc":
      "Give it a goal in any language — it plans, codes, tests, and delivers. Auto-installs LLM on first launch (requires llama.cpp or pre-downloaded model). Process isolation & control. No API keys, no cloud bills.",
    "flagship.compute.f1": "Auto-setup LLM on first launch",
    "flagship.compute.f2": "Process-level isolation & control",
    "flagship.compute.f3": "Pause / Resume / Cancel jobs",
    "flagship.compute.f4": "Accept goals in any Indian language",
    "flagship.compute.f5": "Reads, writes, tests code autonomously",
    "flagship.compute.f6": "100% offline after initial setup",
    "flagship.media.tag": "Local Image, Video & Diagram Generation",
    "flagship.media.desc":
      "Generate diagrams (Mermaid, PlantUML, D2), images (Stable Diffusion), and videos \u2014 all running locally on your CPU or GPU. Auto-detects your hardware and picks optimal presets. Full audit logging.",
    "flagship.media.f1": "CPU & GPU auto-detection",
    "flagship.media.f2": "Mermaid / PlantUML / D2",
    "flagship.media.f3": "Stable Diffusion images",
    "flagship.media.f4": "Video generation (SVD)",
    "flagship.media.f5": "Quality auto-advisor",
    "flagship.media.f6": "SHA-256 audit logging",

    // --- Stats section ---
    "stats.languages": "Indian Languages",
    "stats.models": "Local AI Models",
    "stats.tools": "Built-in Tools",
    "stats.platforms": "Platforms",

    // --- Downloads section ---
    "downloads.label": "Downloads",
    "downloads.title": "Get CodeIn for your platform",
    "downloads.subtitle":
      "All builds ship with the bundled AI engine. No extra downloads required.",

    // --- Requirements section ---
    "req.label": "Requirements",
    "req.title": "System Requirements",
    "req.subtitle":
      "Lightweight enough for a laptop, powerful enough for serious work.",

    // --- FAQ section ---
    "faq.label": "FAQ",
    "faq.title": "Frequently Asked Questions",
    "faq.q1": "Is CodeIn really free?",
    "faq.a1":
      "Yes! CodeIn is 100% free and open-source under the Apache-2.0 license. No subscription, no premium tier, no locked features. The bundled AI runs locally on your hardware — there are no API costs.",
    "faq.q2": "Does it send my code to the cloud?",
    "faq.a2":
      "No. CodeIn ships with a bundled llama.cpp inference engine that runs entirely on your machine. Your code, prompts, and AI responses never leave your computer. You can optionally connect cloud providers like OpenAI or Anthropic, but that's entirely your choice.",
    "faq.q3": "Which Indian languages are supported?",
    "faq.a3":
      "Hindi, Tamil, Telugu, Bengali, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Odia, Assamese, Urdu, Sanskrit, and more — over 20 languages. The AI agent can understand prompts, generate comments, and explain code in all of these.",
    "faq.q4": "Do I need a GPU?",
    "faq.a4":
      "No. CodeIn works on CPU-only machines. However, if you have an NVIDIA GPU with CUDA support, the inference engine will automatically use it for significantly faster AI responses.",
    "faq.q5": "Can I use cloud AI providers instead?",
    "faq.a5":
      "Absolutely. CodeIn supports OpenAI, Anthropic, Google Gemini, Ollama, and many other providers. Just add your API key in Settings. The local engine is the default, but you can switch anytime.",
    "faq.q6": "What makes CodeIn different from Cursor or Copilot?",
    "faq.a6":
      "CodeIn is built for Bharat. It supports 20+ Indian languages for voice coding, AI chat, and comments. It runs fully offline with Sovereign Mode. It has a built-in compute engine, web research, and MCP tools — all free, open-source, and private.",

    // --- CTA section ---
    "cta.title1": "Ready to code in",
    "cta.title2": "your language?",
    "cta.subtitle":
      "Join thousands of Indian developers already using CodeIn. Free, open-source, privacy-first.",

    // --- Comparison Section ---
    "compare.label": "Why CodeIn",
    "compare.title": "How we compare to paid tools",
    "compare.subtitle":
      "Cursor, Copilot, Windsurf, and others charge $10–$40/month. CodeIn gives you more — for free, forever.",
    "compare.feature": "Feature",
    "compare.price": "Price",
    "compare.footnote":
      "✓ = Full support   ~ = Partial   ✗ = Not available. Comparison as of July 2025.",
    "compare.card1.title": "Save $120–$480/year",
    "compare.card1.desc":
      "Cursor costs $240/yr, Copilot $120/yr. CodeIn is free forever with no usage limits, no premium tiers, no locked features.",
    "compare.card2.title": "Your Code Stays Yours",
    "compare.card2.desc":
      "Paid tools send your code to their servers for processing. CodeIn's local AI means your proprietary code, API keys, and secrets never leave your machine.",
    "compare.card3.title": "Built for Bharat",
    "compare.card3.desc":
      "No other AI code editor supports 20+ Indian languages for voice, chat, and comments. CodeIn thinks in your mother tongue.",

    // --- Footer ---
    "footer.tagline": "AI-powered code editor for Bharat.",
    "footer.madeWith": "Made with ❤️ in India.",
    "footer.product": "Product",
    "footer.community": "Community",
    "footer.legal": "Legal",
    "footer.builtFor": "Built for",
    "footer.bharat": "Bharat",
  },

  /* ═══════════════════════ HINDI ═══════════════════════ */
  hi: {
    "nav.features": "विशेषताएँ",
    "nav.skills": "सुपरपावर",
    "nav.downloads": "डाउनलोड",
    "nav.requirements": "आवश्यकताएँ",
    "nav.faq": "प्रश्नोत्तर",
    "nav.github": "गिटहब",

    "hero.badge": "v1.0.0 — ओपन सोर्स, हमेशा मुफ़्त",
    "hero.title1": "भारत की हर भाषा में",
    "hero.title2": "कोड लिखो",
    "hero.subtitle":
      "CodeIn एक AI-संचालित कोड एडिटर है जो हिंदी, तमिल, बंगाली और 20+ भारतीय भाषाएँ समझता है। ओपन-सोर्स। ऑफ़लाइन चलता है। आपका कोड कभी बाहर नहीं जाता।",
    "hero.download": "डाउनलोड करें",
    "hero.all_platforms": "सभी प्लेटफ़ॉर्म",
    "hero.detected": "पहचाना:",
    "hero.license": "Apache-2.0 लाइसेंस",

    "features.label": "विशेषताएँ",
    "features.title1": "जो चाहिए वो सब,",
    "features.title2": "कुछ भी ज़्यादा नहीं",
    "features.subtitle":
      "उन भारतीय डेवलपर्स के लिए बनाया गया जो अपनी मातृभाषा में सोचते हैं लेकिन दुनिया के लिए कोड लिखते हैं।",

    "feat.languages.title": "20+ भारतीय भाषाएँ",
    "feat.languages.desc":
      "हिंदी, तमिल, बंगाली, तेलुगु, मराठी, गुजराती, कन्नड़, मलयालम, पंजाबी और अन्य भाषाओं में AI चैट और कोड लिखें।",
    "feat.offline.title": "ऑफ़लाइन AI एजेंट",
    "feat.offline.desc":
      "बंडल किया हुआ llama.cpp इंजन। कोई API कुंजी नहीं, कोई क्लाउड बिल नहीं। आपका कोड और प्रॉम्प्ट कभी बाहर नहीं जाते।",
    "feat.autocomplete.title": "स्मार्ट ऑटोकम्प्लीट",
    "feat.autocomplete.desc":
      "संदर्भ-जागरूक सुझाव जो आपके प्रोजेक्ट की संरचना, इम्पोर्ट्स और कोडिंग शैली समझते हैं। बिजली जैसी तेज़।",
    "feat.chat.title": "AI चैट और एडिट",
    "feat.chat.desc":
      "सवाल पूछें, कोड रिफैक्टर करें, टेस्ट बनाएँ — सब बातचीत में। फ़ाइलों और सिम्बल्स के लिए @-मेंशन।",
    "feat.privacy.title": "100% निजी",
    "feat.privacy.desc":
      "कोई टेलीमेट्री नहीं, कोई ट्रैकिंग नहीं, कोई क्लाउड निर्भरता नहीं। सरकार, रक्षा और एंटरप्राइज़ के लिए उपयुक्त।",
    "feat.crossplatform.title": "क्रॉस-प्लेटफ़ॉर्म",
    "feat.crossplatform.desc":
      "Windows, macOS (Intel + Apple Silicon) और Linux के लिए नेटिव बिल्ड। हर जगह एक जैसा अनुभव।",

    "skills.label": "सुपरपावर",
    "skills.title": "CodeIn को असाधारण क्या बनाता है",
    "skills.subtitle":
      "सिर्फ़ एक और कोड एडिटर नहीं। CodeIn में वो क्षमताएँ हैं जो किसी और टूल में नहीं।",

    "skill.sovereign.title": "सॉवरेन मोड",
    "skill.sovereign.desc":
      "एयर-गैप्ड, शून्य-टेलीमेट्री। हर फ़ीचर बिना इंटरनेट चलता है। रक्षा, सरकार और संवेदनशील कार्यों के लिए। AES-256 एन्क्रिप्शन।",
    "skill.voice.title": "वॉइस कोडिंग",
    "skill.voice.desc":
      "हिंदी, तमिल, बंगाली या 11 अन्य भारतीय भाषाओं में बोलें और कोड बनते देखें। रियल-टाइम ट्रांस्क्रिप्शन, वॉइस कमांड और AI जवाब सुनाता है।",
    "skill.compute.title": "CodeIn कंप्यूटर",
    "skill.compute.desc":
      "लोकल कम्प्यूट इंजन जो पहली लॉन्च पर ऑटो-सेटअप होता है। किसी भी भाषा में लक्ष्य दें — यह प्लान करता है, कोड लिखता है, टेस्ट करता है और डिलीवर करता है। प्रोसेस आइसोलेशन pause, resume, cancel के साथ। LLM ऑटो-इंस्टॉल या मौजूदा मॉडल का उपयोग।",
    "skill.agent.title": "ऑटोनॉमस एजेंट",
    "skill.agent.desc":
      "फ़ाइलें पढ़ता है, कोड लिखता है, टर्मिनल चलाता है, ख़ुद त्रुटियाँ सुधारता है। 4 AI मोड: Ask, Plan, Implement, Agent।",
    "skill.edit.title": "एडिट कॉन्ट्रैक्ट",
    "skill.edit.desc":
      "AI सटीक JSON पैच बनाता है। हर बदलाव प्रीव्यू करें, वन-क्लिक अप्लाई, तुरंत रोलबैक। पूर्ण वर्शन कंट्रोल।",
    "skill.research.title": "बिल्ट-इन वेब रिसर्च",
    "skill.research.desc":
      "एडिटर के अंदर से वेब खोजें, डॉक्यूमेंटेशन पाएँ, कोड उदाहरण और बग समाधान खोजें। 6 रिसर्च मोड, कोई API कुंजी नहीं।",
    "skill.mcp.title": "MCP टूल प्रोटोकॉल",
    "skill.mcp.desc":
      "कोई भी MCP सर्वर कनेक्ट करें — GitHub, Slack, Jira, डेटाबेस, Docker, Kubernetes और सैकड़ों अन्य। AI एजेंट MCP टूल्स स्वचालित उपयोग करता है: PR बनाएँ, DB क्वेरी करें, ऐप्स डिप्लॉय करें। अनंत विस्तारक्षमता।",
    "skill.models.title": "मॉडल प्रबंधन",
    "skill.models.desc":
      "HuggingFace से GGUF मॉडल डाउनलोड करें। स्मार्ट राउटर हर कार्य के लिए सही मॉडल चुनता है। अलग Coder और Reasoner स्लॉट।",
    "skill.git.title": "पूर्ण Git एकीकरण",
    "skill.git.desc":
      "कोड commit करें, GitHub/GitLab/Bitbucket पर push करें, pull, branch, merge, rebase, stash, tag — सुंदर GUI में। AI कमिट संदेश लिखता है। पूर्ण blame, diff व्यूअर और हिस्ट्री। कोई टर्मिनल ज़रूरी नहीं।",
    "skill.debug.title": "एडवांस्ड डीबगिंग",
    "skill.debug.desc":
      "ब्रेकपॉइंट, वॉच, कॉल स्टैक, वेरिएबल्स। JS, Python, Java, C#, Go, Rust और अधिक।",
    "skill.deploy.title": "वन-क्लिक डिप्लॉय",
    "skill.deploy.desc":
      "Vercel, Netlify, Firebase के लिए ऑटो कॉन्फ़िग। कोई मैनुअल सेटअप नहीं।",
    "skill.cli.title": "CLI एजेंट (cn)",
    "skill.cli.desc":
      "टर्मिनल में पूर्ण कोडिंग एजेंट। इंटरैक्टिव TUI, CI/CD के लिए हेडलेस मोड, सेशन प्रबंधन। Docker और VS Code में काम करता है।",
    "skill.media.title": "मीडिया टूलकिट",
    "skill.media.desc":
      "डायग्राम, इमेज और वीडियो बनाएँ — सब लोकल CPU या GPU पर। हार्डवेयर ऑटो-डिटेक्ट, Mermaid, PlantUML, Stable Diffusion और अधिक। ज़ीरो क्लाउड, पूर्ण प्राइवेसी।",

    // --- Flagship Features section ---
    "flagship.label": "प्रमुख विशेषताएँ",
    "flagship.title": "ऐसे टूल जो किसी और एडिटर में नहीं",
    "flagship.subtitle":
      "लोकल कंप्यूट और मीडिया जेनरेशन — पूरी तरह आपकी मशीन पर, कोई क्लाउड नहीं।",
    "flagship.compute.tag": "एजेंटिक लोकल कंप्यूट इंजन",
    "flagship.compute.desc":
      "किसी भी भाषा में लक्ष्य दें — यह प्लान करता है, कोड लिखता है, टेस्ट करता है और डिलीवर करता है। पहली लॉन्च पर LLM ऑटो-इंस्टॉल (llama.cpp या प्री-डाउनलोडेड मॉडल की जरूरत)। प्रोसेस आइसोलेशन और कंट्रोल। कोई API की नहीं, कोई क्लाउड बिल नहीं।",
    "flagship.compute.f1": "पहली लॉन्च पर LLM ऑटो-सेटअप",
    "flagship.compute.f2": "प्रोसेस-लेवल आइसोलेशन और कंट्रोल",
    "flagship.compute.f3": "Jobs को Pause / Resume / Cancel करें",
    "flagship.compute.f4": "किसी भी भारतीय भाषा में लक्ष्य स्वीकार करें",
    "flagship.compute.f5": "ऑटोनोमस रूप से कोड पढ़ें, लिखें, टेस्ट करें",
    "flagship.compute.f6": "शुरुआती सेटअप के बाद 100% ऑफ़लाइन",
    "flagship.compute.f3": "रुकें / जारी रखें / रद्द करें",
    "flagship.compute.f4": "किसी भी भारतीय भाषा में इनपुट",
    "flagship.compute.f5": "कोड पढ़ता, लिखता, टेस्ट करता है",
    "flagship.compute.f6": "100% ऑफ़लाइन सक्षम",
    "flagship.media.tag": "लोकल इमेज, वीडियो और डायग्राम",
    "flagship.media.desc":
      "डायग्राम (Mermaid, PlantUML, D2), इमेज (Stable Diffusion) और वीडियो बनाएँ — सब लोकल CPU या GPU पर। हार्डवेयर ऑटो-डिटेक्ट। पूर्ण ऑडिट लॉगिंग।",
    "flagship.media.f1": "CPU और GPU ऑटो-डिटेक्शन",
    "flagship.media.f2": "Mermaid / PlantUML / D2",
    "flagship.media.f3": "Stable Diffusion इमेज",
    "flagship.media.f4": "वीडियो जेनरेशन (SVD)",
    "flagship.media.f5": "क्वालिटी ऑटो-एडवाइजर",
    "flagship.media.f6": "SHA-256 ऑडिट लॉगिंग",

    "stats.languages": "भारतीय भाषाएँ",
    "stats.models": "लोकल AI मॉडल",
    "stats.tools": "बिल्ट-इन टूल्स",
    "stats.platforms": "प्लेटफ़ॉर्म",

    "downloads.label": "डाउनलोड",
    "downloads.title": "अपने प्लेटफ़ॉर्म के लिए CodeIn पाएँ",
    "downloads.subtitle":
      "सभी बिल्ड में AI इंजन बंडल है। कोई अतिरिक्त डाउनलोड ज़रूरी नहीं।",

    "req.label": "आवश्यकताएँ",
    "req.title": "सिस्टम आवश्यकताएँ",
    "req.subtitle":
      "लैपटॉप के लिए पर्याप्त हल्का, गंभीर कार्य के लिए पर्याप्त शक्तिशाली।",

    "faq.label": "प्रश्नोत्तर",
    "faq.title": "अक्सर पूछे जाने वाले सवाल",
    "faq.q1": "क्या CodeIn सच में मुफ़्त है?",
    "faq.a1":
      "हाँ! CodeIn Apache-2.0 लाइसेंस के तहत 100% मुफ़्त और ओपन-सोर्स है। कोई सब्सक्रिप्शन नहीं, कोई प्रीमियम टियर नहीं। बंडल AI आपके हार्डवेयर पर लोकली चलता है — कोई API लागत नहीं।",
    "faq.q2": "क्या यह मेरा कोड क्लाउड पर भेजता है?",
    "faq.a2":
      "नहीं। CodeIn में बंडल llama.cpp इंजन है जो पूरी तरह आपकी मशीन पर चलता है। आपका कोड, प्रॉम्प्ट और AI जवाब कभी बाहर नहीं जाते। आप वैकल्पिक रूप से OpenAI या Anthropic कनेक्ट कर सकते हैं, लेकिन यह पूरी तरह आपकी पसंद है।",
    "faq.q3": "कौन सी भारतीय भाषाएँ समर्थित हैं?",
    "faq.a3":
      "हिंदी, तमिल, तेलुगु, बंगाली, मराठी, गुजराती, कन्नड़, मलयालम, पंजाबी, ओडिया, असमिया, उर्दू, संस्कृत और अन्य — 20+ भाषाएँ। AI एजेंट इन सभी में प्रॉम्प्ट समझ सकता है और कमेंट और कोड एक्सप्लेनेशन दे सकता है।",
    "faq.q4": "क्या मुझे GPU चाहिए?",
    "faq.a4":
      "नहीं। CodeIn CPU-ओनली मशीनों पर काम करता है। लेकिन अगर CUDA वाला NVIDIA GPU है तो इंजन ऑटोमैटिक इसका उपयोग करेगा।",
    "faq.q5": "क्या मैं क्लाउड AI प्रोवाइडर इस्तेमाल कर सकता हूँ?",
    "faq.a5":
      "बिल्कुल। CodeIn OpenAI, Anthropic, Google Gemini, Ollama और कई अन्य प्रोवाइडर्स सपोर्ट करता है। बस Settings में API कुंजी डालें।",
    "faq.q6": "CodeIn Cursor या Copilot से कैसे अलग है?",
    "faq.a6":
      "CodeIn भारत के लिए बना है। 20+ भारतीय भाषाओं में वॉइस कोडिंग, AI चैट और कमेंट। सॉवरेन मोड में पूरी तरह ऑफ़लाइन। बिल्ट-इन कम्प्यूट इंजन, वेब रिसर्च, MCP टूल्स — सब मुफ़्त, ओपन-सोर्स और प्राइवेट।",

    "cta.title1": "अपनी भाषा में",
    "cta.title2": "कोड करने के लिए तैयार?",
    "cta.subtitle":
      "हज़ारों भारतीय डेवलपर्स CodeIn इस्तेमाल कर रहे हैं। मुफ़्त, ओपन-सोर्स, प्राइवेसी-फ़र्स्ट।",

    // --- Comparison Section ---
    "compare.label": "CodeIn क्यों",
    "compare.title": "पेड टूल्स से तुलना",
    "compare.subtitle":
      "Cursor, Copilot, Windsurf $10–$40/महीना लेते हैं। CodeIn आपको ज़्यादा देता है — मुफ़्त, हमेशा।",
    "compare.feature": "फ़ीचर",
    "compare.price": "कीमत",
    "compare.footnote":
      "✓ = पूर्ण सपोर्ट   ~ = आंशिक   ✗ = उपलब्ध नहीं। तुलना जुलाई 2025 के अनुसार।",
    "compare.card1.title": "₹10,000–₹40,000/वर्ष बचाएँ",
    "compare.card1.desc":
      "Cursor ₹20,000/वर्ष, Copilot ₹10,000/वर्ष लेता है। CodeIn हमेशा मुफ़्त है — कोई उपयोग सीमा नहीं, कोई प्रीमियम टियर नहीं।",
    "compare.card2.title": "आपका कोड आपके पास",
    "compare.card2.desc":
      "पेड टूल्स प्रोसेसिंग के लिए आपका कोड सर्वर पर भेजते हैं। CodeIn का लोकल AI मतलब आपका कोड, API कुंजियाँ और सीक्रेट कभी बाहर नहीं जाते।",
    "compare.card3.title": "भारत के लिए बना",
    "compare.card3.desc":
      "कोई और AI कोड एडिटर वॉइस, चैट और कमेंट्स में 20+ भारतीय भाषाएँ सपोर्ट नहीं करता। CodeIn आपकी मातृभाषा में सोचता है।",

    "footer.tagline": "भारत का AI-संचालित कोड एडिटर।",
    "footer.madeWith": "भारत में ❤️ से बनाया।",
    "footer.product": "उत्पाद",
    "footer.community": "समुदाय",
    "footer.legal": "कानूनी",
    "footer.builtFor": "बनाया",
    "footer.bharat": "भारत के लिए",
  },

  /* ═══════════════════════ TAMIL ═══════════════════════ */
  ta: {
    "nav.features": "அம்சங்கள்",
    "nav.skills": "சிறப்பு திறன்கள்",
    "nav.downloads": "பதிவிறக்கம்",
    "nav.requirements": "தேவைகள்",
    "nav.faq": "கே & பதில்",
    "nav.github": "GitHub",

    "hero.badge": "v1.0.0 — திறந்த மூலம், எப்போதும் இலவசம்",
    "hero.title1": "பாரதத்தின் ஒவ்வொரு",
    "hero.title2": "மொழியிலும் குறியிடு",
    "hero.subtitle":
      "CodeIn ஒரு AI-இயங்கும் குறியீடு திருத்தி, தமிழ், ஹிந்தி, வங்காளம் மற்றும் 20+ இந்திய மொழிகளைப் புரிந்துகொள்கிறது. திறந்த மூலம். உள்ளூரில் இயங்கும். உங்கள் குறியீடு உங்கள் கணினியை விட்டு வெளியேறாது.",
    "hero.download": "பதிவிறக்கு",
    "hero.all_platforms": "எல்லா தளங்களும்",
    "hero.detected": "கண்டறியப்பட்டது:",
    "hero.license": "Apache-2.0 உரிமம்",

    "features.label": "அம்சங்கள்",
    "features.title1": "உங்களுக்கு தேவையான அனைத்தும்,",
    "features.title2": "தேவையற்றது ஒன்றுமில்லை",
    "features.subtitle":
      "தாய்மொழியில் சிந்தித்து உலகிற்காக குறியிடும் இந்திய டெவலப்பர்களுக்காக உருவாக்கப்பட்டது.",

    "feat.languages.title": "20+ இந்திய மொழிகள்",
    "feat.languages.desc":
      "தமிழ், ஹிந்தி, வங்காளம், தெலுங்கு, மராத்தி, குஜராத்தி, கன்னடம், மலையாளம் மற்றும் பலவற்றில் AI உரையாடல்.",
    "feat.offline.title": "ஆஃப்லைன் AI ஏஜெண்ட்",
    "feat.offline.desc":
      "உள்ளமைக்கப்பட்ட llama.cpp இயந்திரம். API விசைகள் இல்லை, கிளவுட் கட்டணம் இல்லை. உங்கள் குறியீடு வெளியே செல்லாது.",
    "feat.autocomplete.title": "புத்திசாலி தானியங்கி நிரப்புதல்",
    "feat.autocomplete.desc":
      "உங்கள் திட்ட அமைப்பு, இறக்குமதிகள் மற்றும் குறியீட்டு முறையைப் புரிந்துகொள்ளும் சூழல்-விழிப்புநிலை பரிந்துரைகள்.",
    "feat.chat.title": "AI உரையாடல் & திருத்தம்",
    "feat.chat.desc":
      "கேள்விகள் கேளுங்கள், குறியீட்டை மறுசீரமைக்கவும், சோதனைகள் உருவாக்கவும் — எல்லாம் உரையாடலில்.",
    "feat.privacy.title": "100% தனிப்பட்ட",
    "feat.privacy.desc":
      "தொலைமறை இல்லை, கண்காணிப்பு இல்லை, கிளவுட் சார்பு இல்லை. அரசு மற்றும் பாதுகாப்பு சூழல்களுக்கு ஏற்றது.",
    "feat.crossplatform.title": "பல-தளம்",
    "feat.crossplatform.desc":
      "Windows, macOS (Intel + Apple Silicon) மற்றும் Linux க்கான சொந்த உருவாக்கங்கள்.",

    "skills.label": "சிறப்பு திறன்கள்",
    "skills.title": "CodeIn-ஐ அசாதாரணமாக்குவது என்ன",
    "skills.subtitle":
      "வெறும் குறியீடு திருத்தி அல்ல. எந்த கருவியிலும் இல்லாத திறன்கள் CodeIn-ல் உள்ளன.",

    "skill.sovereign.title": "இறையாண்மை பயன்முறை",
    "skill.sovereign.desc":
      "காற்று-இடைவெளி, பூஜ்ய-தொலைமறை. இணையம் இல்லாமல் எல்லா அம்சங்களும் இயங்கும். AES-256 மறையாக்கம்.",
    "skill.voice.title": "குரல் குறியீட்டு",
    "skill.voice.desc":
      "தமிழ், ஹிந்தி, வங்காளம் அல்லது 11 மொழிகளில் பேசுங்கள், குறியீடு தோன்றுவதைப் பாருங்கள். நிகழ்நேர எழுத்தாக்கம்.",
    "skill.compute.title": "CodeIn கணினி",
    "skill.compute.desc":
      "எந்த மொழியிலும் இலக்கை கொடுங்கள் — திட்டமிடும், குறியிடும், சோதிக்கும், வழங்கும். சாண்ட்பாக்ஸ் தனிமைப்படுத்தல்.",
    "skill.agent.title": "தன்னாட்சி ஏஜெண்ட்",
    "skill.agent.desc":
      "கோப்புகளைப் படிக்கும், குறியீடு எழுதும், முனையத்தை இயக்கும், பிழைகளைத் திருத்தும். 4 AI பயன்முறைகள்.",
    "skill.edit.title": "திருத்த ஒப்பந்தங்கள்",
    "skill.edit.desc":
      "AI துல்லியமான JSON இணைப்புகளை உருவாக்கும். மாற்றங்களை முன்னோட்டமிடுங்கள், ஒரு-கிளிக் பயன்படுத்தல், உடனடி பின்னோக்கி.",
    "skill.research.title": "உள்ளமைந்த இணைய ஆராய்ச்சி",
    "skill.research.desc":
      "திருத்தியின் உள்ளிருந்து இணையத்தில் தேடுங்கள், ஆவணங்களைப் பெறுங்கள், குறியீடு எடுத்துக்காட்டுகள் கண்டறியுங்கள்.",
    "skill.mcp.title": "MCP கருவி நெறிமுறை",
    "skill.mcp.desc":
      "எந்த MCP சேவையகத்தையும் இணைக்கவும் — GitHub, Slack, Jira, Docker, Kubernetes. AI ஏஜெண்ட் MCP கருவிகளை தானியங்கி பயன்படுத்தும்: PR திற, DB வினவல், அப்ளிகேஷன் வரிசைப்படுத்தல்.",
    "skill.models.title": "மாதிரி மேலாண்மை",
    "skill.models.desc":
      "HuggingFace-லிருந்து GGUF மாதிரிகளைப் பதிவிறக்கவும். புத்திசாலி திசைவி ஒவ்வொரு பணிக்கும் சரியான மாதிரியைத் தேர்ந்தெடுக்கும்.",
    "skill.git.title": "முழு Git ஒருங்கிணைப்பு",
    "skill.git.desc":
      "Commit, GitHub/GitLab/Bitbucket-க்கு push, pull, branch, merge, rebase, stash, tag — அழகிய GUI-யில். AI commit செய்திகள் எழுதும். டெர்மினல் தேவையில்லை.",
    "skill.debug.title": "மேம்பட்ட பிழைநீக்கம்",
    "skill.debug.desc":
      "இடைநிறுத்தப் புள்ளிகள், கண்காணிப்பு, அழைப்பு அடுக்கு. JS, Python, Java, Go, Rust மற்றும் பல.",
    "skill.deploy.title": "ஒரு-கிளிக் வரிசைப்படுத்தல்",
    "skill.deploy.desc":
      "Vercel, Netlify, Firebase க்கான தானியங்கி கட்டமைப்பு.",
    "skill.cli.title": "CLI ஏஜெண்ட் (cn)",
    "skill.cli.desc":
      "முனையத்தில் முழு குறியீட்டு ஏஜெண்ட். CI/CD, Docker மற்றும் VS Code-ல் இயங்கும்.",
    "skill.media.title": "மீடியா கருவிகள்",
    "skill.media.desc":
      "வரைபடங்கள், படங்கள் மற்றும் வீடியோக்கள் — உங்கள் CPU அல்லது GPU-ல் உருவாக்கவும். Mermaid, PlantUML, Stable Diffusion. கிளவுட் இல்லை, தனிப்பட்டது.",

    "stats.languages": "இந்திய மொழிகள்",
    "stats.models": "உள்ளூர் AI மாதிரிகள்",
    "stats.tools": "உள்ளமைந்த கருவிகள்",
    "stats.platforms": "தளங்கள்",

    "downloads.label": "பதிவிறக்கம்",
    "downloads.title": "உங்கள் தளத்திற்கு CodeIn பெறுங்கள்",
    "downloads.subtitle":
      "எல்லா உருவாக்கங்களிலும் AI இயந்திரம் உள்ளது. கூடுதல் பதிவிறக்கம் தேவையில்லை.",

    "cta.title1": "உங்கள் மொழியில்",
    "cta.title2": "குறியிட தயாரா?",
    "cta.subtitle":
      "ஆயிரக்கணக்கான இந்திய டெவலப்பர்கள் CodeIn பயன்படுத்துகின்றனர். இலவசம், திறந்த மூலம்.",

    // --- Comparison Section ---
    "compare.label": "ஏன் CodeIn",
    "compare.title": "கட்டண கருவிகளுடன் ஒப்பீடு",
    "compare.subtitle":
      "Cursor, Copilot, Windsurf $10–$40/மாதம் வசூலிக்கின்றன. CodeIn அதிகம் தருகிறது — இலவசமாக, எப்போதும்.",
    "compare.feature": "அம்சம்",
    "compare.price": "விலை",
    "compare.card1.title": "₹10,000–₹40,000/வருடம் சேமியுங்கள்",
    "compare.card1.desc":
      "Cursor ₹20,000/வருடம், Copilot ₹10,000/வருடம். CodeIn எப்போதும் இலவசம் — பயன்பாட்டு வரம்புகள் இல்லை.",
    "compare.card2.title": "உங்கள் குறியீடு உங்களுடையது",
    "compare.card2.desc":
      "கட்டண கருவிகள் உங்கள் குறியீட்டை சேவையகங்களுக்கு அனுப்புகின்றன. CodeIn-ன் உள்ளூர் AI உங்கள் குறியீடு வெளியே செல்லாது.",
    "compare.card3.title": "பாரதத்திற்காக உருவாக்கப்பட்டது",
    "compare.card3.desc":
      "வேறு எந்த AI குறியீடு திருத்தியும் 20+ இந்திய மொழிகளை ஆதரிக்காது. CodeIn உங்கள் தாய்மொழியில் சிந்திக்கிறது.",

    "footer.tagline": "பாரதத்தின் AI-இயங்கும் குறியீடு திருத்தி.",
    "footer.madeWith": "இந்தியாவில் ❤️ உடன் உருவாக்கப்பட்டது.",
    "footer.product": "தயாரிப்பு",
    "footer.community": "சமூகம்",
    "footer.legal": "சட்ட",
    "footer.builtFor": "உருவாக்கப்பட்டது",
    "footer.bharat": "பாரதத்திற்காக",
  },

  /* ═══════════════════════ TELUGU ═══════════════════════ */
  te: {
    "nav.features": "ఫీచర్లు",
    "nav.skills": "సూపర్ పవర్స్",
    "nav.downloads": "డౌన్‌లోడ్",
    "nav.requirements": "అవసరాలు",
    "nav.faq": "ప్రశ్నలు",
    "nav.github": "GitHub",

    "hero.badge": "v1.0.0 — ఓపెన్ సోర్స్, ఎల్లప్పుడూ ఉచితం",
    "hero.title1": "భారత్ లోని ప్రతి",
    "hero.title2": "భాషలో కోడ్ చేయండి",
    "hero.subtitle":
      "CodeIn ఒక AI-ఆధారిత కోడ్ ఎడిటర్, తెలుగు, హిందీ, తమిళం మరియు 20+ భారతీయ భాషలను అర్థం చేసుకుంటుంది. ఓపెన్-సోర్స్. లోకల్‌గా నడుస్తుంది.",
    "hero.download": "డౌన్‌లోడ్ చేయండి",
    "hero.all_platforms": "అన్ని ప్లాట్‌ఫారమ్‌లు",
    "hero.detected": "గుర్తించబడింది:",
    "hero.license": "Apache-2.0 లైసెన్స్",

    "features.label": "ఫీచర్లు",
    "features.title1": "మీకు కావలసినవన్నీ,",
    "features.title2": "అక్కర్లేనివి ఏమీ లేవు",
    "features.subtitle":
      "మాతృభాషలో ఆలోచించి ప్రపంచానికి కోడ్ వ్రాసే భారతీయ డెవలపర్ల కోసం నిర్మించబడింది.",

    "feat.languages.title": "20+ భారతీయ భాషలు",
    "feat.languages.desc":
      "తెలుగు, హిందీ, తమిళం, బెంగాలీ, మరాఠీ, గుజరాతీ, కన్నడం, మలయాళం మరియు మరిన్నిటిలో AI చాట్.",
    "feat.offline.title": "ఆఫ్‌లైన్ AI ఏజెంట్",
    "feat.offline.desc":
      "బండిల్ చేయబడిన llama.cpp ఇంజన్. API కీలు లేవు, క్లౌడ్ బిల్లులు లేవు.",
    "feat.autocomplete.title": "స్మార్ట్ ఆటోకంప్లీట్",
    "feat.autocomplete.desc":
      "మీ ప్రాజెక్ట్ నిర్మాణం, దిగుమతులు మరియు కోడింగ్ శైలిని అర్థం చేసుకునే సూచనలు.",
    "feat.chat.title": "AI చాట్ & ఎడిట్",
    "feat.chat.desc":
      "ప్రశ్నలు అడగండి, కోడ్ రీఫ్యాక్టర్ చేయండి, టెస్ట్‌లు సృష్టించండి — అన్నీ సంభాషణలో.",
    "feat.privacy.title": "100% ప్రైవేట్",
    "feat.privacy.desc":
      "టెలిమెట్రీ లేదు, ట్రాకింగ్ లేదు, క్లౌడ్ డిపెండెన్సీ లేదు.",
    "feat.crossplatform.title": "క్రాస్-ప్లాట్‌ఫారమ్",
    "feat.crossplatform.desc":
      "Windows, macOS మరియు Linux కోసం నేటివ్ బిల్డ్‌లు.",

    "skills.label": "సూపర్ పవర్స్",
    "skills.title": "CodeIn ని అసాధారణంగా మార్చేది ఏమిటి",
    "skills.subtitle":
      "మరో కోడ్ ఎడిటర్ కాదు. ఏ ఇతర సాధనంలోనూ లేని సామర్థ్యాలు.",

    "cta.title1": "మీ భాషలో",
    "cta.title2": "కోడ్ చేయడానికి సిద్ధంగా ఉన్నారా?",
    "cta.subtitle":
      "వేలమంది భారతీయ డెవలపర్లు CodeIn ఉపయోగిస్తున్నారు. ఉచితం, ఓపెన్-సోర్స్.",

    "footer.tagline": "భారత్ కోసం AI-ఆధారిత కోడ్ ఎడిటర్.",
    "footer.madeWith": "భారతదేశంలో ❤️ తో తయారు.",
    "footer.product": "ఉత్పత్తి",
    "footer.community": "సముదాయం",
    "footer.legal": "చట్టపరమైన",
    "footer.builtFor": "నిర్మించబడింది",
    "footer.bharat": "భారత్ కోసం",
  },

  /* ═══════════════════════ BENGALI ═══════════════════════ */
  bn: {
    "nav.features": "বৈশিষ্ট্য",
    "nav.skills": "সুপারপাওয়ার",
    "nav.downloads": "ডাউনলোড",
    "nav.requirements": "প্রয়োজনীয়তা",
    "nav.faq": "জিজ্ঞাসা",
    "nav.github": "GitHub",

    "hero.badge": "v1.0.0 — ওপেন সোর্স, চিরকাল বিনামূল্যে",
    "hero.title1": "ভারতের প্রতিটি",
    "hero.title2": "ভাষায় কোড করুন",
    "hero.subtitle":
      "CodeIn একটি AI-চালিত কোড এডিটর যা বাংলা, হিন্দি, তামিল এবং ২০+ ভারতীয় ভাষা বোঝে। ওপেন-সোর্স। স্থানীয়ভাবে চলে। আপনার কোড কখনো বাইরে যায় না।",
    "hero.download": "ডাউনলোড করুন",
    "hero.all_platforms": "সকল প্ল্যাটফর্ম",
    "hero.detected": "শনাক্ত হয়েছে:",
    "hero.license": "Apache-2.0 লাইসেন্স",

    "features.label": "বৈশিষ্ট্য",
    "features.title1": "আপনার যা দরকার সবকিছু,",
    "features.title2": "অপ্রয়োজনীয় কিছু নয়",
    "features.subtitle":
      "মাতৃভাষায় চিন্তা করে বিশ্বের জন্য কোড লেখা ভারতীয় ডেভেলপারদের জন্য তৈরি।",

    "feat.languages.title": "২০+ ভারতীয় ভাষা",
    "feat.languages.desc":
      "বাংলা, হিন্দি, তামিল, তেলুগু, মারাঠি, গুজরাটি, কন্নড়, মালায়ালম এবং আরও অনেক ভাষায় কোড লিখুন।",
    "feat.offline.title": "অফলাইন AI এজেন্ট",
    "feat.offline.desc":
      "বান্ডেল করা llama.cpp ইঞ্জিন। কোনো API কী নেই, কোনো ক্লাউড বিল নেই।",
    "feat.autocomplete.title": "স্মার্ট অটোকম্প্লিট",
    "feat.autocomplete.desc":
      "আপনার প্রকল্পের কাঠামো ও কোডিং ধরন বুঝতে পারে এমন প্রসঙ্গ-সচেতন পরামর্শ।",
    "feat.chat.title": "AI চ্যাট ও এডিট",
    "feat.chat.desc":
      "প্রশ্ন করুন, কোড রিফ্যাক্টর করুন, টেস্ট তৈরি করুন — সবকিছু কথোপকথনে।",
    "feat.privacy.title": "১০০% ব্যক্তিগত",
    "feat.privacy.desc":
      "কোনো টেলিমেট্রি নেই, ট্র্যাকিং নেই, ক্লাউড নির্ভরতা নেই।",
    "feat.crossplatform.title": "ক্রস-প্ল্যাটফর্ম",
    "feat.crossplatform.desc": "Windows, macOS এবং Linux এর জন্য নেটিভ বিল্ড।",

    "skills.label": "সুপারপাওয়ার",
    "skills.title": "যা CodeIn-কে অসাধারণ করে তোলে",
    "skills.subtitle":
      "শুধু আরেকটি কোড এডিটর নয়। অন্য কোনো টুলে নেই এমন ক্ষমতা।",

    "cta.title1": "আপনার ভাষায়",
    "cta.title2": "কোড করতে প্রস্তুত?",
    "cta.subtitle":
      "হাজার হাজার ভারতীয় ডেভেলপার CodeIn ব্যবহার করছেন। বিনামূল্যে, ওপেন-সোর্স।",

    "footer.tagline": "ভারতের AI-চালিত কোড এডিটর।",
    "footer.madeWith": "ভারতে ❤️ দিয়ে তৈরি।",
    "footer.product": "পণ্য",
    "footer.community": "সম্প্রদায়",
    "footer.legal": "আইনি",
    "footer.builtFor": "তৈরি হয়েছে",
    "footer.bharat": "ভারতের জন্য",
  },

  /* ═══════════════════════ MARATHI ═══════════════════════ */
  mr: {
    "nav.features": "वैशिष्ट्ये",
    "nav.skills": "सुपरपॉवर्स",
    "nav.downloads": "डाउनलोड",
    "nav.requirements": "आवश्यकता",
    "nav.faq": "प्रश्नोत्तरी",
    "nav.github": "GitHub",

    "hero.badge": "v1.0.0 — ओपन सोर्स, कायम मोफत",
    "hero.title1": "भारताच्या प्रत्येक",
    "hero.title2": "भाषेत कोड करा",
    "hero.subtitle":
      "CodeIn एक AI-संचालित कोड एडिटर आहे जो मराठी, हिंदी, तमिळ आणि 20+ भारतीय भाषा समजतो. ओपन-सोर्स. स्थानिक पातळीवर चालतो.",
    "hero.download": "डाउनलोड करा",
    "hero.all_platforms": "सर्व प्लॅटफॉर्म",
    "hero.detected": "शोधले:",
    "hero.license": "Apache-2.0 परवाना",

    "features.label": "वैशिष्ट्ये",
    "features.title1": "तुम्हाला हवे ते सगळे,",
    "features.title2": "अनावश्यक काहीही नाही",
    "features.subtitle":
      "मातृभाषेत विचार करून जगासाठी कोड लिहिणाऱ्या भारतीय डेव्हलपर्ससाठी बनवले.",

    "cta.title1": "तुमच्या भाषेत",
    "cta.title2": "कोड करायला तयार?",
    "cta.subtitle":
      "हजारो भारतीय डेव्हलपर्स CodeIn वापरत आहेत. मोफत, ओपन-सोर्स.",

    "footer.tagline": "भारतासाठी AI-संचालित कोड एडिटर.",
    "footer.madeWith": "भारतात ❤️ ने बनवले.",
    "footer.product": "उत्पादन",
    "footer.community": "समुदाय",
    "footer.legal": "कायदेशीर",
    "footer.builtFor": "बनवले",
    "footer.bharat": "भारतासाठी",
  },

  /* ═══════════════════════ GUJARATI ═══════════════════════ */
  gu: {
    "hero.badge": "v1.0.0 — ઓપન સોર્સ, હંમેશા મફત",
    "hero.title1": "ભારતની દરેક",
    "hero.title2": "ભાષામાં કોડ કરો",
    "hero.subtitle":
      "CodeIn એક AI-સંચાલિત કોડ એડિટર છે જે ગુજરાતી, હિન્દી, તમિલ અને 20+ ભારતીય ભાષાઓ સમજે છે. ઓપન-સોર્સ. સ્થાનિક રીતે ચાલે છે.",
    "hero.download": "ડાઉનલોડ કરો",
    "hero.all_platforms": "બધા પ્લેટફોર્મ",
    "cta.title1": "તમારી ભાષામાં",
    "cta.title2": "કોડ કરવા તૈયાર?",
    "footer.tagline": "ભારત માટે AI-સંચાલિત કોડ એડિટર.",
    "footer.madeWith": "ભારતમાં ❤️ થી બનાવ્યું.",
  },

  /* ═══════════════════════ KANNADA ═══════════════════════ */
  kn: {
    "hero.badge": "v1.0.0 — ಮುಕ್ತ ಮೂಲ, ಶಾಶ್ವತ ಉಚಿತ",
    "hero.title1": "ಭಾರತದ ಪ್ರತಿ",
    "hero.title2": "ಭಾಷೆಯಲ್ಲಿ ಕೋಡ್ ಮಾಡಿ",
    "hero.subtitle":
      "CodeIn ಒಂದು AI-ಚಾಲಿತ ಕೋಡ್ ಸಂಪಾದಕ, ಕನ್ನಡ, ಹಿಂದಿ, ತಮಿಳು ಮತ್ತು 20+ ಭಾರತೀಯ ಭಾಷೆಗಳನ್ನು ಅರ್ಥಮಾಡಿಕೊಳ್ಳುತ್ತದೆ.",
    "hero.download": "ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ",
    "cta.title1": "ನಿಮ್ಮ ಭಾಷೆಯಲ್ಲಿ",
    "cta.title2": "ಕೋಡ್ ಮಾಡಲು ಸಿದ್ಧರೇ?",
    "footer.tagline": "ಭಾರತಕ್ಕಾಗಿ AI-ಚಾಲಿತ ಕೋಡ್ ಸಂಪಾದಕ.",
    "footer.madeWith": "ಭಾರತದಲ್ಲಿ ❤️ ಇಂದ ತಯಾರಿಸಲಾಗಿದೆ.",
  },

  /* ═══════════════════════ MALAYALAM ═══════════════════════ */
  ml: {
    "hero.badge": "v1.0.0 — ഓപ്പൺ സോഴ്സ്, എന്നും സൗജന്യം",
    "hero.title1": "ഭാരതത്തിന്റെ ഓരോ",
    "hero.title2": "ഭാഷയിലും കോഡ് ചെയ്യൂ",
    "hero.subtitle":
      "CodeIn ഒരു AI-പവർഡ് കോഡ് എഡിറ്ററാണ്, മലയാളം, ഹിന്ദി, തമിഴ് തുടങ്ങി 20+ ഇന്ത്യൻ ഭാഷകൾ മനസ്സിലാക്കുന്നു.",
    "hero.download": "ഡൗൺലോഡ്",
    "cta.title1": "നിങ്ങളുടെ ഭാഷയിൽ",
    "cta.title2": "കോഡ് ചെയ്യാൻ തയ്യാറാണോ?",
    "footer.tagline": "ഭാരതത്തിനായുള്ള AI-പവർഡ് കോഡ് എഡിറ്റർ.",
    "footer.madeWith": "ഇന്ത്യയിൽ ❤️ ഓടെ നിർമ്മിച്ചത്.",
  },

  /* ═══════════════════════ PUNJABI ═══════════════════════ */
  pa: {
    "hero.badge": "v1.0.0 — ਓਪਨ ਸੋਰਸ, ਹਮੇਸ਼ਾ ਮੁਫ਼ਤ",
    "hero.title1": "ਭਾਰਤ ਦੀ ਹਰ",
    "hero.title2": "ਭਾਸ਼ਾ ਵਿੱਚ ਕੋਡ ਕਰੋ",
    "hero.subtitle":
      "CodeIn ਇੱਕ AI-ਸੰਚਾਲਿਤ ਕੋਡ ਐਡੀਟਰ ਹੈ ਜੋ ਪੰਜਾਬੀ, ਹਿੰਦੀ, ਤਮਿਲ ਅਤੇ 20+ ਭਾਰਤੀ ਭਾਸ਼ਾਵਾਂ ਸਮਝਦਾ ਹੈ। ਓਪਨ-ਸੋਰਸ। ਲੋਕਲ ਚੱਲਦਾ ਹੈ।",
    "hero.download": "ਡਾਊਨਲੋਡ ਕਰੋ",
    "cta.title1": "ਆਪਣੀ ਭਾਸ਼ਾ ਵਿੱਚ",
    "cta.title2": "ਕੋਡ ਕਰਨ ਲਈ ਤਿਆਰ?",
    "footer.tagline": "ਭਾਰਤ ਲਈ AI-ਸੰਚਾਲਿਤ ਕੋਡ ਐਡੀਟਰ।",
    "footer.madeWith": "ਭਾਰਤ ਵਿੱਚ ❤️ ਨਾਲ ਬਣਾਇਆ।",
  },
};

// ─── Language Metadata ──────────────────────────────────────
const LANG_META = {
  en: { label: "English", native: "English", flag: "🇬🇧" },
  hi: { label: "Hindi", native: "हिन्दी", flag: "🇮🇳" },
  ta: { label: "Tamil", native: "தமிழ்", flag: "🇮🇳" },
  te: { label: "Telugu", native: "తెలుగు", flag: "🇮🇳" },
  bn: { label: "Bengali", native: "বাংলা", flag: "🇮🇳" },
  mr: { label: "Marathi", native: "मराठी", flag: "🇮🇳" },
  gu: { label: "Gujarati", native: "ગુજરાતી", flag: "🇮🇳" },
  kn: { label: "Kannada", native: "ಕನ್ನಡ", flag: "🇮🇳" },
  ml: { label: "Malayalam", native: "മലയാളം", flag: "🇮🇳" },
  pa: { label: "Punjabi", native: "ਪੰਜਾਬੀ", flag: "🇮🇳" },
};

// ─── Engine ─────────────────────────────────────────────────
let currentLang = "en";

/**
 * Get translation for a key. Falls back to English, then returns the key itself.
 */
function t(key) {
  return I18N[currentLang]?.[key] ?? I18N.en?.[key] ?? key;
}

/**
 * Set the active language and update localStorage + <html lang>.
 */
function setLanguage(lang) {
  if (!I18N[lang]) lang = "en";
  currentLang = lang;
  localStorage.setItem("codein-lang", lang);
  document.documentElement.lang = lang;
  applyTranslations();
  updateLangSwitcherUI();
}

/**
 * Walk all [data-i18n] elements and replace their textContent.
 * data-i18n="hero.title1"  →  textContent = t('hero.title1')
 * data-i18n-placeholder="..."  →  placeholder attribute
 */
function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    el.textContent = t(key);
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const key = el.getAttribute("data-i18n-html");
    el.innerHTML = t(key);
  });
}

/**
 * Highlight active language in the language switcher.
 */
function updateLangSwitcherUI() {
  document.querySelectorAll(".lang-opt").forEach((btn) => {
    const lang = btn.getAttribute("data-lang");
    btn.classList.toggle("ring-2", lang === currentLang);
    btn.classList.toggle("ring-brand-500", lang === currentLang);
    btn.classList.toggle("bg-brand-500/10", lang === currentLang);
  });
  const currentLabel = document.getElementById("current-lang-label");
  if (currentLabel) {
    const meta = LANG_META[currentLang];
    currentLabel.textContent = meta?.native || "English";
  }
}

/**
 * Auto-detect language from localStorage or browser settings.
 */
function detectLanguage() {
  const stored = localStorage.getItem("codein-lang");
  if (stored && I18N[stored]) return stored;

  // Try browser language
  const browserLang = (navigator.language || "").split("-")[0];
  if (I18N[browserLang]) return browserLang;

  return "en";
}
