/**
 * CodeIn Landing Page — Internationalisation (i18n)
 *
 * Supported UI languages (landing page translations):
 *   en — English         (full)
 *   hi — हिन्दी (Hindi)   (full)
 *   ta — தமிழ் (Tamil)    (full)
 *   te — తెలుగు (Telugu)   (partial)
 *   bn — বাংলা (Bengali)   (partial)
 *   mr — मराठी (Marathi)   (partial)
 *   gu — ગુજરાતી (Gujarati) (beta — hero + CTA only)
 *   kn — ಕನ್ನಡ (Kannada)   (beta — hero + CTA only)
 *   ml — മലയാളം (Malayalam) (beta — hero + CTA only)
 *   pa — ਪੰਜਾਬੀ (Punjabi)  (beta — hero + CTA only)
 *
 * Note: The AI agent supports 22 Indian languages + English (23 total).
 * Missing landing-page keys fall back to English via t().
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
    "hero.badge": "v1.1.0-beta — Open Source & Free Forever",
    "hero.title1": "Code in every",
    "hero.title2": "language of Bharat",
    "hero.subtitle":
      "CodeIn is by Bharat, for the world - an open-source AI coding platform that supports multilingual workflows, runs locally, and keeps your code private.",
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

    "feat.languages.title": "22 Indian Languages",
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
    "feat.gpu.title": "GPU Panel & RunPod",
    "feat.gpu.desc":
      "Dedicated GPU management panel — connect RunPod, browse GPU types with live pricing, create pods, submit jobs, and track budget. All via MCP with real GraphQL API.",

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
      "Speak in Hindi, Tamil, Bengali, or 19 other Indian languages and watch code appear. Real-time speech-to-text voice input, and AI reads answers back to you.",
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
    "stats.models": "LLM Providers",
    "stats.tools": "Built-in + MCP Tools",
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
      "Hindi, Tamil, Telugu, Bengali, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Odia, Assamese, Urdu, Sindhi, Konkani, Manipuri, Dogri, Bodo, Santali, Maithili, Nepali, Sanskrit, and Kashmiri — 22 Indian languages plus English (23 total). The AI agent can understand prompts, generate comments, and explain code in all of these.",
    "faq.q4": "Do I need a GPU?",
    "faq.a4":
      "No. CodeIn works on CPU-only machines. However, if you have an NVIDIA GPU with CUDA support, the inference engine will automatically use it for significantly faster AI responses.",
    "faq.q5": "Can I use cloud AI providers instead?",
    "faq.a5":
      "Absolutely. CodeIn supports OpenAI, Anthropic, Google Gemini, Ollama, and many other providers. Just add your API key in Settings. The local engine is the default, but you can switch anytime.",
    "faq.q6": "What makes CodeIn different from Cursor or Copilot?",
    "faq.a6":
      "CodeIn is built for Bharat. It supports 22 Indian languages for voice coding, AI chat, and comments. It runs fully offline with Sovereign Mode. It has a built-in compute engine, web research, and MCP tools — all free, open-source, and private.",

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
    "compare.card3.title": "By Bharat, for the world",
    "compare.card3.desc":
      "No other AI code editor combines 22 Indian languages with a global, local-first workflow. CodeIn lets you think in your mother tongue and ship for the world.",

    // --- "What Makes CodeIn Different" section ---
    "diff.label": "What Makes CodeIn Different",
    "diff.title": "More than a code editor with AI attached",
    "diff.subtitle":
      "CodeIn is designed as a full AI coding system with local-first execution, agent orchestration, multilingual understanding, autonomous workflows, and visible control over what the AI is doing.",
    "diff.vibe.title": "Vibe Coding, Not Just Autocomplete",
    "diff.vibe.desc":
      "Not limited to single-line suggestions. Describe what you want in natural language and CodeIn helps plan, generate, refactor, validate, and improve code across the project — feature generation, repo-aware edits, multi-step workflows, and autonomous coding pipelines.",
    "diff.multilingual.title": "Multilingual Command Understanding",
    "diff.multilingual.desc":
      "Type or speak in Hindi, Hinglish, Bengali-English mix, Assamese-English mix, and other multilingual patterns. CodeIn normalizes your input into an internal English task format for precise AI execution — you think naturally, the AI works with technical precision.",
    "diff.cost.title": "Powerful AI, Practical Cost",
    "diff.cost.desc":
      "Core AI workflows run without forcing expensive usage patterns. Local-first execution, intelligent routing, and built-in agent capabilities keep the tool accessible and cost-efficient — feel like premium coding tools while staying practical and accessible.",
    "diff.local.title": "Local-First Control",
    "diff.local.desc":
      "Your workflows stay closer to your own environment instead of depending on a remote black-box editor. Better visibility, more control, and a stronger foundation for privacy-conscious and enterprise-friendly development.",
    "diff.expansion.title": "Built for Language Expansion",
    "diff.expansion.desc":
      "The multilingual layer is designed to be extensible — support grows across more Indian and global languages over time. The vision: make AI coding usable for people who do not naturally think only in English.",
    "diff.ux.title": "Cursor/Copilot-Class UX",
    "diff.ux.desc":
      "Built to reach the same trust, speed, and usability standard people expect from tools like Cursor and GitHub Copilot, while adding strengths that matter for Bharat and global developers alike.",

    // --- 4 AI Modes section ---
    "modes.label": "4 AI Modes",
    "modes.title": "One editor, four ways to code with AI",
    "modes.subtitle":
      "Choose how deeply AI assists you — from gentle suggestions to fully autonomous coding.",
    "modes.ask.tag": "ASK",
    "modes.ask.title": "Chat & Explore",
    "modes.ask.desc":
      "Open-ended AI conversation about your code. Context-aware from selected files. No file changes — purely assistant.",
    "modes.plan.tag": "PLAN",
    "modes.plan.title": "Architecture & Strategy",
    "modes.plan.desc":
      "Structured step-by-step breakdowns for complex tasks. Get detailed plans for migrations, refactors, and new features.",
    "modes.impl.tag": "IMPLEMENT",
    "modes.impl.title": "Precise Edit Contracts",
    "modes.impl.desc":
      "AI produces strict JSON patches with unified diffs. Preview, one-click Apply, one-click Rollback. Deterministic and safe.",
    "modes.agent.tag": "AGENT",
    "modes.agent.title": "Fully Autonomous",
    "modes.agent.desc":
      "Reads files, writes code, runs terminal commands, self-corrects. Goes from idea to working code completely hands-free.",

    // --- Vibe Coding section ---
    "vibe.label": "Vibe Coding",
    "vibe.title": "Intent-driven development",
    "vibe.subtitle":
      'Instead of only asking the AI to "complete code," CodeIn supports a more expressive workflow. The developer focuses on intent, direction, and quality, while CodeIn handles the heavy lifting.',
    "vibe.step1": "Describe the feature",
    "vibe.step2": "Full frontend/backend flow",
    "vibe.step3": "Request refactors",
    "vibe.step4": "Improve UI/UX",
    "vibe.step5": "Fix bugs",
    "vibe.step6": "Generate missing files",
    "vibe.step7": "Validate & iterate",
    "vibe.step8": "Multi-file changes",
    "vibe.footnote":
      "The long-term goal is for CodeIn to feel like a serious AI engineering partner, not just a code suggestion box.",

    // --- Multilingual Intelligence section ---
    "mling.label": "Multilingual Intelligence",
    "mling.title": "Think naturally, code precisely",
    "mling.subtitle":
      "Instead of forcing perfect English prompts, CodeIn detects your language, preserves technical terms, normalizes colloquial phrasing, and converts instructions into execution-ready English internally.",
    "mling.input_label": "User says (Hinglish)",
    "mling.input":
      "Mere liye ek dashboard banao jisme login, profile aur settings ho.",
    "mling.interpret_label": "Internal system interpretation",
    "mling.interpret":
      "Create a dashboard with authentication, user profile, and settings pages.",
    "mling.exec_label": "AI executes",
    "mling.exec_desc":
      "Coding agents work in a structured technical format while the user interacts naturally. Technical terms like React, API, auth, Docker are always preserved.",
    "mling.mockup_title": "Multilingual → Internal Normalization",
    "mling.example_hinglish": "Hinglish",

    // --- Supported Languages section ---
    "langs.label": "Supported Languages",
    "langs.title": "Code in your mother tongue",
    "langs.desc":
      "Voice input, AI chat, code comments, error messages, documentation — all in your preferred language. Auto-translate bridge ensures the AI understands you perfectly.",

    // --- Why This Matters section ---
    "why.label": "Why This Matters",
    "why.title": "Most coding tools still assume",
    "why.assume1": "The user thinks in English",
    "why.assume2": "The user wants only inline completion",
    "why.assume3": "The AI is a helper, not a workflow engine",
    "why.assume4": "Powerful AI must always be expensive",
    "why.challenge": "CodeIn challenges that.",
    "why.answer1": "Natural multilingual interaction",
    "why.answer2": "Stronger repo-aware workflows",
    "why.answer3": "Affordable, practical AI-assisted development",
    "why.answer4": "Local-first control",
    "why.footnote":
      "Future-ready expansion across languages, tools, and agents. That is what makes it different.",

    // --- Comparison table row labels ---
    "compare.f.completion": "AI Code Completion",
    "compare.f.chat": "AI Chat & Agent Mode",
    "compare.f.free": "100% Free & Open Source",
    "compare.f.offline": "Runs Fully Offline (Local AI)",
    "compare.f.languages": "22 Indian Language Support",
    "compare.f.voice": "Voice Coding (Indian Languages)",
    "compare.f.sovereign": "Sovereign / Air-Gapped Mode",
    "compare.f.mcp": "MCP Tool Protocol",
    "compare.f.git": "Git Commit & Push to GitHub",
    "compare.f.research": "Built-in Web Research",
    "compare.f.telemetry": "Zero Telemetry / No Tracking",
    "compare.f.compute": "Local Compute Engine",
    "compare.f.media": "Local Media Generation (Images/Video)",
    "compare.f.price_free": "FREE",
    "compare.f.forever": "forever",

    // --- System Requirements ---
    "req.win.r1": "Windows 10 or later (x64)",
    "req.win.r2": "8 GB RAM (16 GB recommended)",
    "req.win.r3": "500 MB free disk space",
    "req.win.r4": "GPU optional (CUDA supported)",
    "req.mac.r1": "macOS 12 Monterey or later",
    "req.mac.r2": "Intel or Apple Silicon (M1+)",
    "req.mac.r3": "8 GB RAM (16 GB recommended)",
    "req.mac.r4": "500 MB free disk space",
    "req.linux.r1": "Ubuntu 20.04+ / Fedora 36+",
    "req.linux.r2": "x64 architecture",
    "req.linux.r3": "8 GB RAM (16 GB recommended)",
    "req.linux.r4": "500 MB free disk space",

    // --- Downloads dynamic text ---
    "downloads.latest": "Latest release:",
    "downloads.release_notes": "Release notes",
    "downloads.recommended": "Recommended",
    "downloads.sha256_label": "SHA-256",
    "downloads.download_btn": "Download",
    "downloads.download_alt": "Download (alternate)",
    "downloads.get_release": "Get Current Release",
    "downloads.cta_desc":
      "is available now. Get the current release from GitHub.",
    "downloads.tab_windows": "Windows",
    "downloads.tab_macos": "macOS",
    "downloads.tab_linux": "Linux",

    // --- Footer links ---
    "footer.github": "GitHub",
    "footer.bug": "Report a Bug",
    "footer.discussions": "Discussions",
    "footer.contributing": "Contributing",
    "footer.license_apache": "Apache-2.0 License",
    "footer.security": "Security Policy",
    "footer.coc": "Code of Conduct",
    "footer.license_link": "License",
    "footer.privacy": "Privacy Policy",
    "footer.terms": "Terms of Service",
    "footer.copyright":
      "© 2025-2026 CodeIn Project. Open-source under Apache-2.0.",

    // --- Footer ---
    "footer.tagline": "By Bharat, for the world.",
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

    "hero.badge": "v1.1.0-beta — ओपन सोर्स, हमेशा मुफ़्त",
    "hero.title1": "भारत की हर भाषा में",
    "hero.title2": "कोड लिखो",
    "hero.subtitle":
      "CodeIn एक AI-संचालित कोड एडिटर है जो हिंदी, तमिल, बंगाली और 22 भारतीय भाषाएँ समझता है। ओपन-सोर्स। ऑफ़लाइन चलता है। आपका कोड कभी बाहर नहीं जाता।",
    "hero.download": "डाउनलोड करें",
    "hero.all_platforms": "सभी प्लेटफ़ॉर्म",
    "hero.detected": "पहचाना:",
    "hero.license": "Apache-2.0 लाइसेंस",

    "features.label": "विशेषताएँ",
    "features.title1": "जो चाहिए वो सब,",
    "features.title2": "कुछ भी ज़्यादा नहीं",
    "features.subtitle":
      "उन भारतीय डेवलपर्स के लिए बनाया गया जो अपनी मातृभाषा में सोचते हैं लेकिन दुनिया के लिए कोड लिखते हैं।",

    "feat.languages.title": "22 भारतीय भाषाएँ",
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
    "feat.gpu.title": "GPU पैनल और RunPod",
    "feat.gpu.desc":
      "समर्पित GPU प्रबंधन पैनल — RunPod से कनेक्ट करें, लाइव प्राइसिंग के साथ GPU ब्राउज़ करें, पॉड बनाएं, जॉब सबमिट करें और बजट ट्रैक करें। असली GraphQL API।",

    "skills.label": "सुपरपावर",
    "skills.title": "CodeIn को असाधारण क्या बनाता है",
    "skills.subtitle":
      "सिर्फ़ एक और कोड एडिटर नहीं। CodeIn में वो क्षमताएँ हैं जो किसी और टूल में नहीं।",

    "skill.sovereign.title": "सॉवरेन मोड",
    "skill.sovereign.desc":
      "एयर-गैप्ड, शून्य-टेलीमेट्री। हर फ़ीचर बिना इंटरनेट चलता है। रक्षा, सरकार और संवेदनशील कार्यों के लिए। AES-256 एन्क्रिप्शन।",
    "skill.voice.title": "वॉइस कोडिंग",
    "skill.voice.desc":
      "हिंदी, तमिल, बंगाली या 19 अन्य भारतीय भाषाओं में बोलें और कोड बनते देखें। रियल-टाइम ट्रांस्क्रिप्शन, वॉइस कमांड और AI जवाब सुनाता है।",
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
    "stats.tools": "बिल्ट-इन + MCP टूल्स",
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
      "हिंदी, तमिल, तेलुगु, बंगाली, मराठी, गुजराती, कन्नड़, मलयालम, पंजाबी, ओडिया, असमिया, उर्दू, सिंधी, कोंकणी, मणिपुरी, डोगरी, बोडो और संताली — 18 भारतीय भाषाएँ + अंग्रेज़ी। AI एजेंट इन सभी में प्रॉम्प्ट समझ सकता है और कमेंट और कोड एक्सप्लेनेशन दे सकता है।",
    "faq.q4": "क्या मुझे GPU चाहिए?",
    "faq.a4":
      "नहीं। CodeIn CPU-ओनली मशीनों पर काम करता है। लेकिन अगर CUDA वाला NVIDIA GPU है तो इंजन ऑटोमैटिक इसका उपयोग करेगा।",
    "faq.q5": "क्या मैं क्लाउड AI प्रोवाइडर इस्तेमाल कर सकता हूँ?",
    "faq.a5":
      "बिल्कुल। CodeIn OpenAI, Anthropic, Google Gemini, Ollama और कई अन्य प्रोवाइडर्स सपोर्ट करता है। बस Settings में API कुंजी डालें।",
    "faq.q6": "CodeIn Cursor या Copilot से कैसे अलग है?",
    "faq.a6":
      "CodeIn भारत के लिए बना है। 22 भारतीय भाषाओं में वॉइस कोडिंग, AI चैट और कमेंट। सॉवरेन मोड में पूरी तरह ऑफ़लाइन। बिल्ट-इन कम्प्यूट इंजन, वेब रिसर्च, MCP टूल्स — सब मुफ़्त, ओपन-सोर्स और प्राइवेट।",

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
      "कोई और AI कोड एडिटर वॉइस, चैट और कमेंट्स में 22 भारतीय भाषाएँ सपोर्ट नहीं करता। CodeIn आपकी मातृभाषा में सोचता है।",

    // --- What Makes CodeIn Different ---
    "diff.label": "CodeIn को अलग क्या बनाता है",
    "diff.title": "सिर्फ़ AI जोड़ा हुआ कोड एडिटर नहीं",
    "diff.subtitle":
      "CodeIn एक पूर्ण AI कोडिंग सिस्टम है — लोकल-फ़र्स्ट एक्ज़ीक्यूशन, एजेंट ऑर्केस्ट्रेशन, बहुभाषी समझ, स्वायत्त वर्कफ़्लो, और AI क्या कर रहा है इसका पूरा नियंत्रण।",
    "diff.vibe.title": "वाइब कोडिंग, सिर्फ़ ऑटोकम्प्लीट नहीं",
    "diff.vibe.desc":
      "सिंगल-लाइन सुझावों तक सीमित नहीं। नैचुरल लैंग्वेज में बताएँ और CodeIn प्लान, जेनरेट, रिफैक्टर, वैलिडेट करता है — फ़ीचर जेनरेशन, रेपो-अवेयर एडिट्स, मल्टी-स्टेप वर्कफ़्लो और ऑटोनॉमस कोडिंग पाइपलाइन।",
    "diff.multilingual.title": "बहुभाषी कमांड समझ",
    "diff.multilingual.desc":
      "हिंदी, हिंग्लिश, बंगाली-अंग्रेज़ी मिक्स, असमिया-अंग्रेज़ी मिक्स में टाइप या बोलें। CodeIn आपके इनपुट को इंटरनल अंग्रेज़ी फ़ॉर्मेट में बदलता है — आप नैचुरली सोचें, AI तकनीकी सटीकता से काम करे।",
    "diff.cost.title": "शक्तिशाली AI, व्यावहारिक लागत",
    "diff.cost.desc":
      "कोर AI वर्कफ़्लो महंगे पैटर्न पर निर्भर नहीं। लोकल-फ़र्स्ट एक्ज़ीक्यूशन, इंटेलिजेंट राउटिंग और बिल्ट-इन एजेंट — प्रीमियम जैसा अनुभव, किफ़ायती कीमत।",
    "diff.local.title": "लोकल-फ़र्स्ट कंट्रोल",
    "diff.local.desc":
      "आपके वर्कफ़्लो रिमोट ब्लैक-बॉक्स एडिटर पर निर्भर नहीं। बेहतर दृश्यता, अधिक नियंत्रण, प्राइवेसी-फ़र्स्ट और एंटरप्राइज़-फ़्रेंडली।",
    "diff.expansion.title": "भाषा विस्तार के लिए बना",
    "diff.expansion.desc":
      "बहुभाषी लेयर विस्तारयोग्य है — समय के साथ और भारतीय व वैश्विक भाषाएँ जुड़ेंगी। लक्ष्य: AI कोडिंग उन लोगों के लिए भी जो सिर्फ़ अंग्रेज़ी में नहीं सोचते।",
    "diff.ux.title": "Cursor/Copilot-क्लास UX",
    "diff.ux.desc":
      "Cursor और GitHub Copilot जैसी विश्वसनीयता, गति और उपयोगिता — साथ ही भारत और वैश्विक डेवलपर्स के लिए अतिरिक्त ताकत।",

    // --- 4 AI Modes ---
    "modes.label": "4 AI मोड",
    "modes.title": "एक एडिटर, चार तरीके AI के साथ कोड करें",
    "modes.subtitle":
      "चुनें कि AI कितनी गहराई से मदद करे — हल्के सुझावों से पूर्ण ऑटोनॉमस कोडिंग तक।",
    "modes.ask.tag": "ASK",
    "modes.ask.title": "चैट और एक्सप्लोर",
    "modes.ask.desc":
      "आपके कोड के बारे में ओपन-एंडेड AI बातचीत। चुनी हुई फ़ाइलों से कॉन्टेक्स्ट-अवेयर। कोई फ़ाइल बदलाव नहीं।",
    "modes.plan.tag": "PLAN",
    "modes.plan.title": "आर्किटेक्चर और रणनीति",
    "modes.plan.desc":
      "जटिल कार्यों के लिए स्ट्रक्चर्ड स्टेप-बाय-स्टेप ब्रेकडाउन। माइग्रेशन, रिफैक्टर और नई फ़ीचर्स के लिए विस्तृत प्लान।",
    "modes.impl.tag": "IMPLEMENT",
    "modes.impl.title": "सटीक एडिट कॉन्ट्रैक्ट",
    "modes.impl.desc":
      "AI स्ट्रिक्ट JSON पैच बनाता है। प्रीव्यू, वन-क्लिक अप्लाई, वन-क्लिक रोलबैक। सटीक और सुरक्षित।",
    "modes.agent.tag": "AGENT",
    "modes.agent.title": "पूर्ण ऑटोनॉमस",
    "modes.agent.desc":
      "फ़ाइलें पढ़ता है, कोड लिखता है, टर्मिनल चलाता है, ख़ुद सुधार करता है। आइडिया से वर्किंग कोड तक पूरी तरह हैंड्स-फ़्री।",

    // --- Vibe Coding ---
    "vibe.label": "वाइब कोडिंग",
    "vibe.title": "इंटेंट-ड्रिवन डेवलपमेंट",
    "vibe.subtitle":
      'सिर्फ़ "कोड कम्प्लीट" करने के बजाय, CodeIn एक अभिव्यक्तिपूर्ण वर्कफ़्लो देता है। डेवलपर इरादे, दिशा और गुणवत्ता पर ध्यान दे, CodeIn भारी काम सँभालता है।',
    "vibe.step1": "फ़ीचर का वर्णन करें",
    "vibe.step2": "पूरा फ़्रंटएंड/बैकएंड फ़्लो",
    "vibe.step3": "रिफैक्टर करवाएँ",
    "vibe.step4": "UI/UX सुधारें",
    "vibe.step5": "बग ठीक करें",
    "vibe.step6": "मिसिंग फ़ाइलें बनाएँ",
    "vibe.step7": "वैलिडेट और इटरेट करें",
    "vibe.step8": "मल्टी-फ़ाइल बदलाव",
    "vibe.footnote":
      "दीर्घकालिक लक्ष्य: CodeIn एक गंभीर AI इंजीनियरिंग पार्टनर बने, सिर्फ़ कोड सुझाव बॉक्स नहीं।",

    // --- Multilingual Intelligence ---
    "mling.label": "बहुभाषी इंटेलिजेंस",
    "mling.title": "नैचुरली सोचें, सटीक कोड करें",
    "mling.subtitle":
      "परफ़ेक्ट इंग्लिश प्रॉम्प्ट की मजबूरी नहीं। CodeIn भाषा पहचानता है, तकनीकी शब्द रखता है, बोलचाल सामान्य करता है और निर्देशों को इंटरनली एक्ज़ीक्यूशन-रेडी अंग्रेज़ी में बदलता है।",
    "mling.input_label": "यूज़र कहता है (हिंग्लिश)",
    "mling.input":
      "Mere liye ek dashboard banao jisme login, profile aur settings ho.",
    "mling.interpret_label": "इंटरनल सिस्टम इंटरप्रिटेशन",
    "mling.interpret":
      "Create a dashboard with authentication, user profile, and settings pages.",
    "mling.exec_label": "AI एक्ज़ीक्यूट करता है",
    "mling.exec_desc":
      "कोडिंग एजेंट स्ट्रक्चर्ड तकनीकी फ़ॉर्मेट में काम करते हैं जबकि यूज़र नैचुरली इंटरैक्ट करता है। React, API, auth, Docker जैसे तकनीकी शब्द हमेशा संरक्षित रहते हैं।",
    "mling.mockup_title": "बहुभाषी → इंटरनल नॉर्मलाइज़ेशन",
    "mling.example_hinglish": "हिंग्लिश",

    // --- Supported Languages ---
    "langs.label": "समर्थित भाषाएँ",
    "langs.title": "अपनी मातृभाषा में कोड करें",
    "langs.desc":
      "वॉइस इनपुट, AI चैट, कोड कमेंट, एरर मैसेज, डॉक्यूमेंटेशन — सब आपकी पसंदीदा भाषा में। ऑटो-ट्रांसलेट ब्रिज AI को सटीक समझ देता है।",

    // --- Why This Matters ---
    "why.label": "यह क्यों ज़रूरी है",
    "why.title": "ज़्यादातर कोडिंग टूल अभी भी मानते हैं",
    "why.assume1": "यूज़र अंग्रेज़ी में सोचता है",
    "why.assume2": "यूज़र सिर्फ़ इनलाइन कम्प्लीशन चाहता है",
    "why.assume3": "AI एक सहायक है, वर्कफ़्लो इंजन नहीं",
    "why.assume4": "शक्तिशाली AI हमेशा महंगा होना चाहिए",
    "why.challenge": "CodeIn इसे चुनौती देता है।",
    "why.answer1": "नैचुरल बहुभाषी इंटरैक्शन",
    "why.answer2": "मज़बूत रेपो-अवेयर वर्कफ़्लो",
    "why.answer3": "किफ़ायती, व्यावहारिक AI-सहायित विकास",
    "why.answer4": "लोकल-फ़र्स्ट कंट्रोल",
    "why.footnote":
      "भाषाओं, टूल्स और एजेंट्स में भविष्य-तैयार विस्तार। यही इसे अलग बनाता है।",

    // --- Comparison table rows ---
    "compare.f.completion": "AI कोड कम्प्लीशन",
    "compare.f.chat": "AI चैट और एजेंट मोड",
    "compare.f.free": "100% मुफ़्त और ओपन सोर्स",
    "compare.f.offline": "पूर्ण ऑफ़लाइन (लोकल AI)",
    "compare.f.languages": "22 भारतीय भाषा सपोर्ट",
    "compare.f.voice": "वॉइस कोडिंग (भारतीय भाषाएँ)",
    "compare.f.sovereign": "सॉवरेन / एयर-गैप्ड मोड",
    "compare.f.mcp": "MCP टूल प्रोटोकॉल",
    "compare.f.git": "Git कमिट और GitHub पुश",
    "compare.f.research": "बिल्ट-इन वेब रिसर्च",
    "compare.f.telemetry": "ज़ीरो टेलीमेट्री / नो ट्रैकिंग",
    "compare.f.compute": "लोकल कम्प्यूट इंजन",
    "compare.f.media": "लोकल मीडिया जेनरेशन (इमेज/वीडियो)",
    "compare.f.price_free": "मुफ़्त",
    "compare.f.forever": "हमेशा",

    // --- System Requirements ---
    "req.win.r1": "Windows 10 या बाद (x64)",
    "req.win.r2": "8 GB RAM (16 GB अनुशंसित)",
    "req.win.r3": "500 MB खाली स्थान",
    "req.win.r4": "GPU वैकल्पिक (CUDA सपोर्ट)",
    "req.mac.r1": "macOS 12 Monterey या बाद",
    "req.mac.r2": "Intel या Apple Silicon (M1+)",
    "req.mac.r3": "8 GB RAM (16 GB अनुशंसित)",
    "req.mac.r4": "500 MB खाली स्थान",
    "req.linux.r1": "Ubuntu 20.04+ / Fedora 36+",
    "req.linux.r2": "x64 आर्किटेक्चर",
    "req.linux.r3": "8 GB RAM (16 GB अनुशंसित)",
    "req.linux.r4": "500 MB खाली स्थान",

    // --- Downloads dynamic ---
    "downloads.latest": "नवीनतम रिलीज़:",
    "downloads.release_notes": "रिलीज़ नोट्स",
    "downloads.recommended": "अनुशंसित",
    "downloads.sha256_label": "SHA-256",
    "downloads.download_btn": "डाउनलोड",
    "downloads.download_alt": "डाउनलोड (वैकल्पिक)",
    "downloads.get_release": "वर्तमान रिलीज़ पाएँ",
    "downloads.cta_desc": "उपलब्ध है। GitHub से वर्तमान रिलीज़ डाउनलोड करें।",
    "downloads.tab_windows": "विंडोज़",
    "downloads.tab_macos": "मैकओएस",
    "downloads.tab_linux": "लिनक्स",

    // --- Footer links ---
    "footer.github": "गिटहब",
    "footer.bug": "बग रिपोर्ट करें",
    "footer.discussions": "चर्चाएँ",
    "footer.contributing": "योगदान",
    "footer.license_apache": "Apache-2.0 लाइसेंस",
    "footer.security": "सुरक्षा नीति",
    "footer.coc": "आचार संहिता",
    "footer.license_link": "लाइसेंस",
    "footer.privacy": "गोपनीयता नीति",
    "footer.terms": "सेवा की शर्तें",
    "footer.copyright":
      "© 2025-2026 CodeIn प्रोजेक्ट। Apache-2.0 के तहत ओपन-सोर्स।",

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

    "hero.badge": "v1.1.0-beta — திறந்த மூலம், எப்போதும் இலவசம்",
    "hero.title1": "பாரதத்தின் ஒவ்வொரு",
    "hero.title2": "மொழியிலும் குறியிடு",
    "hero.subtitle":
      "CodeIn ஒரு AI-இயங்கும் குறியீடு திருத்தி, தமிழ், ஹிந்தி, வங்காளம் மற்றும் 22 இந்திய மொழிகளைப் புரிந்துகொள்கிறது. திறந்த மூலம். உள்ளூரில் இயங்கும். உங்கள் குறியீடு உங்கள் கணினியை விட்டு வெளியேறாது.",
    "hero.download": "பதிவிறக்கு",
    "hero.all_platforms": "எல்லா தளங்களும்",
    "hero.detected": "கண்டறியப்பட்டது:",
    "hero.license": "Apache-2.0 உரிமம்",

    "features.label": "அம்சங்கள்",
    "features.title1": "உங்களுக்கு தேவையான அனைத்தும்,",
    "features.title2": "தேவையற்றது ஒன்றுமில்லை",
    "features.subtitle":
      "தாய்மொழியில் சிந்தித்து உலகிற்காக குறியிடும் இந்திய டெவலப்பர்களுக்காக உருவாக்கப்பட்டது.",

    "feat.languages.title": "22 இந்திய மொழிகள்",
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
    "feat.gpu.title": "GPU பேனல் & RunPod",
    "feat.gpu.desc":
      "GPU மேலாண்மை பேனல் — RunPod உடன் இணையுங்கள், நேரடி விலையுடன் GPU வகைகளை உலாவுங்கள், பாட்கள் உருவாக்குங்கள், வேலைகள் சமர்ப்பிக்கவும்.",

    "skills.label": "சிறப்பு திறன்கள்",
    "skills.title": "CodeIn-ஐ அசாதாரணமாக்குவது என்ன",
    "skills.subtitle":
      "வெறும் குறியீடு திருத்தி அல்ல. எந்த கருவியிலும் இல்லாத திறன்கள் CodeIn-ல் உள்ளன.",

    "skill.sovereign.title": "இறையாண்மை பயன்முறை",
    "skill.sovereign.desc":
      "காற்று-இடைவெளி, பூஜ்ய-தொலைமறை. இணையம் இல்லாமல் எல்லா அம்சங்களும் இயங்கும். AES-256 மறையாக்கம்.",
    "skill.voice.title": "குரல் குறியீட்டு",
    "skill.voice.desc":
      "தமிழ், ஹிந்தி, வங்காளம் அல்லது 19 மொழிகளில் பேசுங்கள், குறியீடு தோன்றுவதைப் பாருங்கள். நிகழ்நேர எழுத்தாக்கம்.",
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
    "stats.tools": "உள்ளமைந்த + MCP கருவிகள்",
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
      "வேறு எந்த AI குறியீடு திருத்தியும் 22 இந்திய மொழிகளை ஆதரிக்காது. CodeIn உங்கள் தாய்மொழியில் சிந்திக்கிறது.",

    // --- What Makes CodeIn Different ---
    "diff.label": "CodeIn-ஐ வேறுபடுத்துவது என்ன",
    "diff.title": "AI பொருத்தப்பட்ட குறியீடு திருத்தி அல்ல",
    "diff.subtitle":
      "CodeIn ஒரு முழு AI குறியீட்டு அமைப்பு — உள்ளூர்-முதல் இயக்கம், ஏஜெண்ட் ஒருங்கிணைப்பு, பன்மொழி புரிதல், தன்னாட்சி பணிப்பாய்வுகள், மற்றும் AI என்ன செய்கிறது என்பதில் முழு கட்டுப்பாடு.",
    "diff.vibe.title": "வைப் குறியீட்டு, தானியங்கி நிரப்புதல் மட்டும் அல்ல",
    "diff.vibe.desc":
      "ஒற்றை-வரி பரிந்துரைகளுக்கு மட்டும் அல்ல. இயற்கை மொழியில் விவரிக்கவும் — CodeIn திட்டமிடல், உருவாக்கம், மறுசீரமைப்பு, சரிபார்ப்பு செய்கிறது.",
    "diff.multilingual.title": "பன்மொழி கட்டளை புரிதல்",
    "diff.multilingual.desc":
      "தமிழ், ஹிந்தி, ஹிங்கிலிஷ், வங்காள-ஆங்கில கலவையில் தட்டச்சு செய்யவும் அல்லது பேசவும். CodeIn உங்கள் உள்ளீட்டை உள்ளக ஆங்கில வடிவத்தில் மாற்றுகிறது.",
    "diff.cost.title": "சக்திவாய்ந்த AI, நடைமுறை செலவு",
    "diff.cost.desc":
      "முக்கிய AI பணிப்பாய்வுகள் விலையுயர்ந்த பயன்பாட்டு முறைகளை கட்டாயப்படுத்தாது. உள்ளூர்-முதல் இயக்கம், புத்திசாலி வழிப்படுத்தல் — பிரீமியம் அனுபவம், மலிவான விலை.",
    "diff.local.title": "உள்ளூர்-முதல் கட்டுப்பாடு",
    "diff.local.desc":
      "உங்கள் பணிப்பாய்வுகள் தொலைதூர கருப்பு-பெட்டி திருத்தியைச் சார்ந்தது அல்ல. சிறந்த தெரிவுநிலை, அதிக கட்டுப்பாடு.",
    "diff.expansion.title": "மொழி விரிவாக்கத்திற்காக உருவாக்கப்பட்டது",
    "diff.expansion.desc":
      "பன்மொழி அடுக்கு விரிவாக்கக்கூடியது — காலப்போக்கில் மேலும் இந்திய மற்றும் உலக மொழிகள் சேர்க்கப்படும்.",
    "diff.ux.title": "Cursor/Copilot-தர UX",
    "diff.ux.desc":
      "Cursor மற்றும் GitHub Copilot போன்ற நம்பிக்கை, வேகம் மற்றும் பயன்பாட்டுத்தன்மை — பாரதம் மற்றும் உலக டெவலப்பர்களுக்கு கூடுதல் பலங்களுடன்.",

    // --- 4 AI Modes ---
    "modes.label": "4 AI பயன்முறைகள்",
    "modes.title": "ஒரு திருத்தி, நான்கு வழிகள் AI-யுடன் குறியிட",
    "modes.subtitle":
      "AI எவ்வளவு ஆழமாக உதவ வேண்டும் என்பதைத் தேர்வு செய்யுங்கள் — லேசான பரிந்துரைகள் முதல் முழு தன்னாட்சி குறியீட்டு வரை.",
    "modes.ask.tag": "ASK",
    "modes.ask.title": "உரையாடல் & ஆய்வு",
    "modes.ask.desc":
      "உங்கள் குறியீட்டைப் பற்றிய திறந்த AI உரையாடல். தேர்ந்தெடுக்கப்பட்ட கோப்புகளிலிருந்து சூழல்-விழிப்புநிலை. கோப்பு மாற்றங்கள் இல்லை.",
    "modes.plan.tag": "PLAN",
    "modes.plan.title": "கட்டிடக்கலை & உத்தி",
    "modes.plan.desc":
      "சிக்கலான பணிகளுக்கான கட்டமைக்கப்பட்ட படிப்படியான பிரிவுகள். இடம்பெயர்வுகள், மறுசீரமைப்புகளுக்கான விரிவான திட்டங்கள்.",
    "modes.impl.tag": "IMPLEMENT",
    "modes.impl.title": "துல்லியமான திருத்த ஒப்பந்தங்கள்",
    "modes.impl.desc":
      "AI கண்டிப்பான JSON இணைப்புகளை உருவாக்கும். முன்னோட்டம், ஒரு-கிளிக் பயன்படுத்தல், ஒரு-கிளிக் பின்னோக்கி.",
    "modes.agent.tag": "AGENT",
    "modes.agent.title": "முழு தன்னாட்சி",
    "modes.agent.desc":
      "கோப்புகளைப் படிக்கும், குறியீடு எழுதும், முனையத்தை இயக்கும், தானே திருத்தும். யோசனையிலிருந்து வேலை செய்யும் குறியீடு வரை.",

    // --- Vibe Coding ---
    "vibe.label": "வைப் குறியீட்டு",
    "vibe.title": "நோக்கம் சார்ந்த உருவாக்கம்",
    "vibe.subtitle":
      '"குறியீடு நிரப்பு" என்று மட்டும் கேட்பதற்கு பதிலாக, CodeIn மிகவும் வெளிப்படையான பணிப்பாய்வை ஆதரிக்கிறது. டெவலப்பர் நோக்கம், திசை மற்றும் தரத்தில் கவனம் செலுத்துகிறார்.',
    "vibe.step1": "அம்சத்தை விவரிக்கவும்",
    "vibe.step2": "முழு முன்னோக்கு/பின்னோக்கு பாய்வு",
    "vibe.step3": "மறுசீரமைப்பு கோருங்கள்",
    "vibe.step4": "UI/UX மேம்படுத்துங்கள்",
    "vibe.step5": "பிழைகள் சரிசெய்யுங்கள்",
    "vibe.step6": "காணாத கோப்புகளை உருவாக்குங்கள்",
    "vibe.step7": "சரிபார்த்து மீண்டும் செய்யுங்கள்",
    "vibe.step8": "பல-கோப்பு மாற்றங்கள்",
    "vibe.footnote":
      "நீண்டகால இலக்கு: CodeIn ஒரு தீவிர AI பொறியியல் பங்காளியாக இருக்க வேண்டும், வெறும் குறியீடு பரிந்துரை பெட்டி அல்ல.",

    // --- Multilingual Intelligence ---
    "mling.label": "பன்மொழி நுண்ணறிவு",
    "mling.title": "இயல்பாக சிந்தியுங்கள், துல்லியமாக குறியிடுங்கள்",
    "mling.subtitle":
      "சரியான ஆங்கில கட்டளைகளை கட்டாயப்படுத்தாமல், CodeIn உங்கள் மொழியைக் கண்டறிகிறது, தொழில்நுட்ப சொற்களைப் பாதுகாக்கிறது, பேச்சு வழக்கை இயல்பாக்குகிறது.",
    "mling.input_label": "பயனர் சொல்கிறார் (ஹிங்கிலிஷ்)",
    "mling.input":
      "Mere liye ek dashboard banao jisme login, profile aur settings ho.",
    "mling.interpret_label": "உள்ளக அமைப்பு விளக்கம்",
    "mling.interpret":
      "Create a dashboard with authentication, user profile, and settings pages.",
    "mling.exec_label": "AI செயல்படுத்துகிறது",
    "mling.exec_desc":
      "குறியீட்டு ஏஜெண்ட்கள் கட்டமைக்கப்பட்ட தொழில்நுட்ப வடிவத்தில் வேலை செய்கின்றன, பயனர் இயல்பாக தொடர்பு கொள்கிறார். React, API, auth, Docker போன்ற சொற்கள் எப்போதும் பாதுகாக்கப்படும்.",
    "mling.mockup_title": "பன்மொழி → உள்ளக இயல்பாக்கம்",
    "mling.example_hinglish": "ஹிங்கிலிஷ்",

    // --- Supported Languages ---
    "langs.label": "ஆதரிக்கப்படும் மொழிகள்",
    "langs.title": "உங்கள் தாய்மொழியில் குறியிடுங்கள்",
    "langs.desc":
      "குரல் உள்ளீடு, AI உரையாடல், குறியீடு குறிப்புகள், பிழை செய்திகள், ஆவணங்கள் — எல்லாம் உங்கள் விருப்ப மொழியில்.",

    // --- Why This Matters ---
    "why.label": "இது ஏன் முக்கியமானது",
    "why.title": "பெரும்பாலான குறியீட்டு கருவிகள் இன்னும் கருதுகின்றன",
    "why.assume1": "பயனர் ஆங்கிலத்தில் சிந்திக்கிறார்",
    "why.assume2": "பயனர் இன்லைன் நிரப்புதல் மட்டுமே விரும்புகிறார்",
    "why.assume3": "AI ஒரு உதவியாளர், பணிப்பாய்வு இயந்திரம் அல்ல",
    "why.assume4": "சக்திவாய்ந்த AI எப்போதும் விலையுயர்ந்ததாக இருக்க வேண்டும்",
    "why.challenge": "CodeIn இதை சவால் செய்கிறது.",
    "why.answer1": "இயல்பான பன்மொழி தொடர்பு",
    "why.answer2": "வலுவான repo-விழிப்புநிலை பணிப்பாய்வுகள்",
    "why.answer3": "மலிவான, நடைமுறை AI-உதவி உருவாக்கம்",
    "why.answer4": "உள்ளூர்-முதல் கட்டுப்பாடு",
    "why.footnote":
      "மொழிகள், கருவிகள் மற்றும் ஏஜெண்ட்கள் முழுவதும் எதிர்கால-தயார் விரிவாக்கம். இதுவே வேறுபடுத்துகிறது.",

    // --- Comparison table rows ---
    "compare.f.completion": "AI குறியீடு நிரப்புதல்",
    "compare.f.chat": "AI உரையாடல் & ஏஜெண்ட் பயன்முறை",
    "compare.f.free": "100% இலவசம் & திறந்த மூலம்",
    "compare.f.offline": "முழு ஆஃப்லைன் (உள்ளூர் AI)",
    "compare.f.languages": "22 இந்திய மொழி ஆதரவு",
    "compare.f.voice": "குரல் குறியீட்டு (இந்திய மொழிகள்)",
    "compare.f.sovereign": "இறையாண்மை / காற்று-இடைவெளி பயன்முறை",
    "compare.f.mcp": "MCP கருவி நெறிமுறை",
    "compare.f.git": "Git Commit & GitHub Push",
    "compare.f.research": "உள்ளமைந்த இணைய ஆராய்ச்சி",
    "compare.f.telemetry": "பூஜ்ய தொலைமறை / கண்காணிப்பு இல்லை",
    "compare.f.compute": "உள்ளூர் கணினி இயந்திரம்",
    "compare.f.media": "உள்ளூர் மீடியா உருவாக்கம் (படங்கள்/வீடியோ)",
    "compare.f.price_free": "இலவசம்",
    "compare.f.forever": "எப்போதும்",
    "compare.footnote":
      "✓ = முழு ஆதரவு   ~ = பகுதி   ✗ = கிடைக்காது. ஒப்பீடு மார்ச் 2026 நிலவரம்.",

    // --- System Requirements ---
    "req.win.r1": "Windows 10 அல்லது அதற்குப் பிறகு (x64)",
    "req.win.r2": "8 GB RAM (16 GB பரிந்துரைக்கப்படுகிறது)",
    "req.win.r3": "500 MB காலி வட்டு இடம்",
    "req.win.r4": "GPU விருப்பத்தேர்வு (CUDA ஆதரவு)",
    "req.mac.r1": "macOS 12 Monterey அல்லது அதற்குப் பிறகு",
    "req.mac.r2": "Intel அல்லது Apple Silicon (M1+)",
    "req.mac.r3": "8 GB RAM (16 GB பரிந்துரைக்கப்படுகிறது)",
    "req.mac.r4": "500 MB காலி வட்டு இடம்",
    "req.linux.r1": "Ubuntu 20.04+ / Fedora 36+",
    "req.linux.r2": "x64 கட்டிடக்கலை",
    "req.linux.r3": "8 GB RAM (16 GB பரிந்துரைக்கப்படுகிறது)",
    "req.linux.r4": "500 MB காலி வட்டு இடம்",

    // --- Downloads dynamic ---
    "downloads.latest": "சமீபத்திய வெளியீடு:",
    "downloads.release_notes": "வெளியீட்டு குறிப்புகள்",
    "downloads.recommended": "பரிந்துரைக்கப்படுகிறது",
    "downloads.sha256_label": "SHA-256",
    "downloads.download_btn": "பதிவிறக்கு",
    "downloads.download_alt": "பதிவிறக்கு (மாற்று)",
    "downloads.get_release": "தற்போதைய வெளியீட்டைப் பெறுங்கள்",
    "downloads.cta_desc":
      "கிடைக்கிறது. GitHub-லிருந்து தற்போதைய வெளியீட்டைப் பெறுங்கள்.",
    "downloads.tab_windows": "விண்டோஸ்",
    "downloads.tab_macos": "மேக்ஓஎஸ்",
    "downloads.tab_linux": "லினக்ஸ்",

    // --- Footer links ---
    "footer.github": "GitHub",
    "footer.bug": "பிழை புகாரளிக்கவும்",
    "footer.discussions": "கலந்துரையாடல்கள்",
    "footer.contributing": "பங்களிப்பு",
    "footer.license_apache": "Apache-2.0 உரிமம்",
    "footer.security": "பாதுகாப்பு கொள்கை",
    "footer.coc": "நடத்தை விதிகள்",
    "footer.license_link": "உரிமம்",
    "footer.privacy": "தனியுரிமை கொள்கை",
    "footer.terms": "சேவை விதிமுறைகள்",
    "footer.copyright":
      "© 2025-2026 CodeIn திட்டம். Apache-2.0 கீழ் திறந்த மூலம்.",

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

    "hero.badge": "v1.1.0-beta — ఓపెన్ సోర్స్, ఎల్లప్పుడూ ఉచితం",
    "hero.title1": "భారత్ లోని ప్రతి",
    "hero.title2": "భాషలో కోడ్ చేయండి",
    "hero.subtitle":
      "CodeIn ఒక AI-ఆధారిత కోడ్ ఎడిటర్, తెలుగు, హిందీ, తమిళం మరియు 22 భారతీయ భాషలను అర్థం చేసుకుంటుంది. ఓపెన్-సోర్స్. లోకల్‌గా నడుస్తుంది.",
    "hero.download": "డౌన్‌లోడ్ చేయండి",
    "hero.all_platforms": "అన్ని ప్లాట్‌ఫారమ్‌లు",
    "hero.detected": "గుర్తించబడింది:",
    "hero.license": "Apache-2.0 లైసెన్స్",

    "features.label": "ఫీచర్లు",
    "features.title1": "మీకు కావలసినవన్నీ,",
    "features.title2": "అక్కర్లేనివి ఏమీ లేవు",
    "features.subtitle":
      "మాతృభాషలో ఆలోచించి ప్రపంచానికి కోడ్ వ్రాసే భారతీయ డెవలపర్ల కోసం నిర్మించబడింది.",

    "feat.languages.title": "22 భారతీయ భాషలు",
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
    "feat.gpu.title": "GPU ప్యానెల్ & RunPod",
    "feat.gpu.desc":
      "GPU నిర్వహణ ప్యానెల్ — RunPod తో కనెక్ట్ అవ్వండి, లైవ్ ప్రైసింగ్‌తో GPU రకాలను బ్రౌజ్ చేయండి, పాడ్‌లు సృష్టించండి, జాబ్‌లు సబ్మిట్ చేయండి.",

    "skills.label": "సూపర్ పవర్స్",
    "skills.title": "CodeIn ని అసాధారణంగా మార్చేది ఏమిటి",
    "skills.subtitle":
      "మరో కోడ్ ఎడిటర్ కాదు. ఏ ఇతర సాధనంలోనూ లేని సామర్థ్యాలు.",

    "cta.title1": "మీ భాషలో",
    "cta.title2": "కోడ్ చేయడానికి సిద్ధంగా ఉన్నారా?",
    "cta.subtitle":
      "వేలమంది భారతీయ డెవలపర్లు CodeIn ఉపయోగిస్తున్నారు. ఉచితం, ఓపెన్-సోర్స్.",

    // --- What Makes CodeIn Different ---
    "diff.label": "CodeIn ను భిన్నంగా మార్చేది ఏమిటి",
    "diff.title": "AI జోడించిన కోడ్ ఎడిటర్ కంటే ఎక్కువ",
    "diff.subtitle":
      "CodeIn ఒక పూర్తి AI కోడింగ్ సిస్టమ్ — లోకల్-ఫస్ట్ ఎక్జిక్యూషన్, ఏజెంట్ ఆర్కెస్ట్రేషన్, బహుభాషా అవగాహన, స్వయంప్రతిపత్త వర్క్‌ఫ్లోలు.",
    "diff.vibe.title": "వైబ్ కోడింగ్, ఆటోకంప్లీట్ మాత్రమే కాదు",
    "diff.vibe.desc":
      "సింగిల్-లైన్ సూచనలకు పరిమితం కాదు. సహజ భాషలో వివరించండి — CodeIn ప్లాన్, జనరేట్, రీఫ్యాక్టర్, వ్యాలిడేట్ చేస్తుంది.",
    "diff.multilingual.title": "బహుభాషా కమాండ్ అవగాహన",
    "diff.multilingual.desc":
      "తెలుగు, హిందీ, హింగ్లీష్, బెంగాలీ-ఇంగ్లీష్ మిక్స్‌లో టైప్ చేయండి లేదా మాట్లాడండి. CodeIn మీ ఇన్‌పుట్‌ను ఇంటర్నల్ ఇంగ్లీష్‌లో మారుస్తుంది.",
    "diff.cost.title": "శక్తివంతమైన AI, ఆచరణాత్మక ధర",
    "diff.cost.desc":
      "కోర్ AI వర్క్‌ఫ్లోలు ఖరీదైన పద్ధతులపై ఆధారపడవు. లోకల్-ఫస్ట్, తెలివైన రూటింగ్ — ప్రీమియం అనుభవం, అందుబాటు ధరలో.",
    "diff.local.title": "లోకల్-ఫస్ట్ నియంత్రణ",
    "diff.local.desc":
      "మీ వర్క్‌ఫ్లోలు రిమోట్ బ్లాక్-బాక్స్ ఎడిటర్‌పై ఆధారపడవు. మెరుగైన దృశ్యమానత, ఎక్కువ నియంత్రణ.",
    "diff.expansion.title": "భాషా విస్తరణ కోసం నిర్మించబడింది",
    "diff.expansion.desc":
      "బహుభాషా లేయర్ విస్తరించగలది — కాలక్రమేణా మరిన్ని భారతీయ & ప్రపంచ భాషలు చేరతాయి.",
    "diff.ux.title": "Cursor/Copilot-తరగతి UX",
    "diff.ux.desc":
      "Cursor మరియు GitHub Copilot లాంటి నమ్మకం, వేగం మరియు వాడుకగలిగేతనం — భారత్ కోసం అదనపు బలాలతో.",

    // --- 4 AI Modes ---
    "modes.label": "4 AI మోడ్‌లు",
    "modes.title": "ఒక ఎడిటర్, AI తో కోడ్ చేయడానికి నాలుగు మార్గాలు",
    "modes.subtitle": "AI ఎంత లోతుగా సహాయం చేయాలో ఎంచుకోండి.",
    "modes.ask.tag": "ASK",
    "modes.ask.title": "చాట్ & అన్వేషణ",
    "modes.ask.desc":
      "మీ కోడ్ గురించి ఓపెన్-ఎండెడ్ AI సంభాషణ. ఫైల్ మార్పులు లేవు.",
    "modes.plan.tag": "PLAN",
    "modes.plan.title": "ఆర్కిటెక్చర్ & వ్యూహం",
    "modes.plan.desc":
      "సంక్లిష్ట పనుల కోసం స్ట్రక్చర్డ్ స్టెప్-బై-స్టెప్ విశ్లేషణ.",
    "modes.impl.tag": "IMPLEMENT",
    "modes.impl.title": "ఖచ్చితమైన ఎడిట్ కాంట్రాక్ట్‌లు",
    "modes.impl.desc":
      "AI స్ట్రిక్ట్ JSON ప్యాచ్‌లు సృష్టిస్తుంది. ప్రివ్యూ, వన్-క్లిక్ అప్లై, వన్-క్లిక్ రోల్‌బ్యాక్.",
    "modes.agent.tag": "AGENT",
    "modes.agent.title": "పూర్తి స్వయంప్రతిపత్తి",
    "modes.agent.desc":
      "ఫైల్‌లు చదువుతుంది, కోడ్ రాస్తుంది, టెర్మినల్ నడిపిస్తుంది, తనంతట తాను సరిచేస్తుంది.",

    // --- Vibe Coding ---
    "vibe.label": "వైబ్ కోడింగ్",
    "vibe.title": "ఉద్దేశ్య-ఆధారిత అభివృద్ధి",
    "vibe.subtitle":
      '"కోడ్ పూర్తి చేయి" అని మాత్రమే కాకుండా, CodeIn మరింత వ్యక్తీకరణాత్మక వర్క్‌ఫ్లోకు మద్దతు ఇస్తుంది.',
    "vibe.step1": "ఫీచర్ వివరించండి",
    "vibe.step2": "పూర్తి ఫ్రంటెండ్/బ్యాకెండ్ ఫ్లో",
    "vibe.step3": "రీఫ్యాక్టర్ అభ్యర్థించండి",
    "vibe.step4": "UI/UX మెరుగుపరచండి",
    "vibe.step5": "బగ్‌లు సరిచేయండి",
    "vibe.step6": "మిస్సింగ్ ఫైల్‌లు సృష్టించండి",
    "vibe.step7": "ధ్రువీకరించి మళ్ళీ చేయండి",
    "vibe.step8": "మల్టీ-ఫైల్ మార్పులు",
    "vibe.footnote":
      "దీర్ఘకాలిక లక్ష్యం: CodeIn ఒక తీవ్రమైన AI ఇంజనీరింగ్ భాగస్వామిగా ఉండాలి.",

    // --- Multilingual Intelligence ---
    "mling.label": "బహుభాషా మేధస్సు",
    "mling.title": "సహజంగా ఆలోచించండి, ఖచ్చితంగా కోడ్ చేయండి",
    "mling.subtitle":
      "సరైన ఆంగ్ల ప్రాంప్ట్‌లు బలవంతం చేయకుండా, CodeIn మీ భాషను గుర్తిస్తుంది.",
    "mling.input_label": "వినియోగదారు చెప్తారు (హింగ్లీష్)",
    "mling.interpret_label": "అంతర్గత వ్యవస్థ వివరణ",
    "mling.exec_label": "AI అమలు చేస్తుంది",
    "mling.exec_desc":
      "కోడింగ్ ఏజెంట్‌లు స్ట్రక్చర్డ్ టెక్నికల్ ఫార్మాట్‌లో పనిచేస్తాయి. React, API, auth, Docker వంటి టెక్నికల్ పదాలు ఎల్లప్పుడూ రక్షించబడతాయి.",
    "mling.mockup_title": "బహుభాషా → అంతర్గత సాధారణీకరణ",

    // --- Supported Languages ---
    "langs.label": "మద్దతు భాషలు",
    "langs.title": "మీ మాతృభాషలో కోడ్ చేయండి",
    "langs.desc":
      "వాయిస్ ఇన్‌పుట్, AI చాట్, కోడ్ వ్యాఖ్యలు, ఎర్రర్ మెసేజ్‌లు — అన్నీ మీ ఇష్టమైన భాషలో.",

    // --- Why This Matters ---
    "why.label": "ఇది ఎందుకు ముఖ్యం",
    "why.title": "చాలా కోడింగ్ సాధనాలు ఇంకా భావిస్తాయి",
    "why.assume1": "వినియోగదారు ఆంగ్లంలో ఆలోచిస్తారు",
    "why.assume2": "వినియోగదారు ఇన్‌లైన్ కంప్లీషన్ మాత్రమే కోరుతారు",
    "why.assume3": "AI ఒక సహాయకం, వర్క్‌ఫ్లో ఇంజన్ కాదు",
    "why.assume4": "శక్తివంతమైన AI ఎల్లప్పుడూ ఖరీదైనదై ఉండాలి",
    "why.challenge": "CodeIn దానిని సవాలు చేస్తుంది.",
    "why.answer1": "సహజ బహుభాషా పరస్పర చర్య",
    "why.answer2": "బలమైన repo-అవగాహన వర్క్‌ఫ్లోలు",
    "why.answer3": "అందుబాటులో, ఆచరణాత్మక AI-సహాయిత అభివృద్ధి",
    "why.answer4": "లోకల్-ఫస్ట్ నియంత్రణ",
    "why.footnote": "భాషలు, సాధనాలు మరియు ఏజెంట్‌లలో భవిష్యత్-సిద్ధ విస్తరణ.",

    // --- Comparison table rows ---
    "compare.f.completion": "AI కోడ్ కంప్లీషన్",
    "compare.f.chat": "AI చాట్ & ఏజెంట్ మోడ్",
    "compare.f.free": "100% ఉచితం & ఓపెన్ సోర్స్",
    "compare.f.offline": "పూర్తి ఆఫ్‌లైన్ (లోకల్ AI)",
    "compare.f.languages": "22 భారతీయ భాషల మద్దతు",
    "compare.f.voice": "వాయిస్ కోడింగ్ (భారతీయ భాషలు)",
    "compare.f.sovereign": "సావరిన్ / ఎయిర్-గ్యాప్డ్ మోడ్",
    "compare.f.mcp": "MCP టూల్ ప్రోటోకాల్",
    "compare.f.git": "Git Commit & GitHub Push",
    "compare.f.research": "అంతర్నిర్మిత వెబ్ పరిశోధన",
    "compare.f.telemetry": "జీరో టెలిమెట్రీ / ట్రాకింగ్ లేదు",
    "compare.f.compute": "లోకల్ కంప్యూట్ ఇంజన్",
    "compare.f.media": "లోకల్ మీడియా జనరేషన్ (చిత్రాలు/వీడియో)",
    "compare.f.price_free": "ఉచితం",
    "compare.f.forever": "ఎల్లప్పుడూ",

    // --- System Requirements ---
    "req.win.r1": "Windows 10 లేదా తర్వాత (x64)",
    "req.win.r2": "8 GB RAM (16 GB సిఫార్సు)",
    "req.win.r3": "500 MB ఖాళీ డిస్క్ స్థలం",
    "req.win.r4": "GPU ఐచ్ఛికం (CUDA మద్దతు)",
    "req.mac.r1": "macOS 12 Monterey లేదా తర్వాత",
    "req.mac.r2": "Intel లేదా Apple Silicon (M1+)",
    "req.mac.r3": "8 GB RAM (16 GB సిఫార్సు)",
    "req.mac.r4": "500 MB ఖాళీ డిస్క్ స్థలం",
    "req.linux.r1": "Ubuntu 20.04+ / Fedora 36+",
    "req.linux.r2": "x64 ఆర్కిటెక్చర్",
    "req.linux.r3": "8 GB RAM (16 GB సిఫార్సు)",
    "req.linux.r4": "500 MB ఖాళీ డిస్క్ స్థలం",

    // --- Downloads dynamic ---
    "downloads.latest": "తాజా విడుదల:",
    "downloads.release_notes": "విడుదల గమనికలు",
    "downloads.recommended": "సిఫార్సు",
    "downloads.sha256_label": "SHA-256",
    "downloads.download_btn": "డౌన్‌లోడ్",
    "downloads.download_alt": "డౌన్‌లోడ్ (ప్రత్యామ్నాయం)",
    "downloads.get_release": "తాజా విడుదల పొందండి",
    "downloads.cta_desc": "అందుబాటులో ఉంది. GitHub నుండి తాజా విడుదల పొందండి.",
    "downloads.tab_windows": "విండోస్",
    "downloads.tab_macos": "మాకోస్",
    "downloads.tab_linux": "లినక్స్",

    // --- Footer links ---
    "footer.github": "GitHub",
    "footer.bug": "బగ్ నివేదించండి",
    "footer.discussions": "చర్చలు",
    "footer.contributing": "సహకారం",
    "footer.license_apache": "Apache-2.0 లైసెన్స్",
    "footer.security": "భద్రతా విధానం",
    "footer.coc": "ప్రవర్తనా నియమావళి",
    "footer.license_link": "లైసెన్స్",
    "footer.privacy": "గోప్యతా విధానం",
    "footer.terms": "సేవా నిబంధనలు",
    "footer.copyright":
      "© 2025-2026 CodeIn ప్రాజెక్ట్. Apache-2.0 కింద ఓపెన్-సోర్స్.",

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

    "hero.badge": "v1.1.0-beta — ওপেন সোর্স, চিরকাল বিনামূল্যে",
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
    "feat.gpu.title": "GPU প্যানেল & RunPod",
    "feat.gpu.desc":
      "GPU ম্যানেজমেন্ট প্যানেল — RunPod এর সাথে সংযুক্ত হন, লাইভ প্রাইসিং সহ GPU ধরন ব্রাউজ করুন, পড তৈরি করুন, জব সাবমিট করুন।",

    "skills.label": "সুপারপাওয়ার",
    "skills.title": "যা CodeIn-কে অসাধারণ করে তোলে",
    "skills.subtitle":
      "শুধু আরেকটি কোড এডিটর নয়। অন্য কোনো টুলে নেই এমন ক্ষমতা।",

    "cta.title1": "আপনার ভাষায়",
    "cta.title2": "কোড করতে প্রস্তুত?",
    "cta.subtitle":
      "হাজার হাজার ভারতীয় ডেভেলপার CodeIn ব্যবহার করছেন। বিনামূল্যে, ওপেন-সোর্স।",

    // --- What Makes CodeIn Different ---
    "diff.label": "CodeIn কে আলাদা করে কী",
    "diff.title": "শুধু AI যোগ করা কোড এডিটর নয়",
    "diff.subtitle":
      "CodeIn একটি সম্পূর্ণ AI কোডিং সিস্টেম — লোকাল-ফার্স্ট এক্সিকিউশন, এজেন্ট অর্কেস্ট্রেশন, বহুভাষিক বোঝাপড়া, স্বায়ত্তশাসিত ওয়ার্কফ্লো।",
    "diff.vibe.title": "ভাইব কোডিং, শুধু অটোকম্প্লিট নয়",
    "diff.vibe.desc":
      "একক-লাইন পরামর্শে সীমাবদ্ধ নয়। প্রাকৃতিক ভাষায় বর্ণনা করুন — CodeIn পরিকল্পনা, তৈরি, রিফ্যাক্টর, যাচাই করে।",
    "diff.multilingual.title": "বহুভাষিক কমান্ড বোঝাপড়া",
    "diff.multilingual.desc":
      "বাংলা, হিন্দি, হিংলিশ, বাংলা-ইংরেজি মিশ্রণে টাইপ বা বলুন। CodeIn আপনার ইনপুট অভ্যন্তরীণ ইংরেজিতে রূপান্তর করে।",
    "diff.cost.title": "শক্তিশালী AI, ব্যবহারিক খরচ",
    "diff.cost.desc":
      "মূল AI ওয়ার্কফ্লো ব্যয়বহুল প্যাটার্নের উপর নির্ভর করে না। লোকাল-ফার্স্ট, বুদ্ধিমান রাউটিং — প্রিমিয়াম অভিজ্ঞতা, সাশ্রয়ী মূল্যে।",
    "diff.local.title": "লোকাল-ফার্স্ট নিয়ন্ত্রণ",
    "diff.local.desc":
      "আপনার ওয়ার্কফ্লো রিমোট ব্ল্যাক-বক্স এডিটরের উপর নির্ভর করে না। ভালো দৃশ্যমানতা, বেশি নিয়ন্ত্রণ।",
    "diff.expansion.title": "ভাষা সম্প্রসারণের জন্য তৈরি",
    "diff.expansion.desc":
      "বহুভাষিক স্তর সম্প্রসারণযোগ্য — সময়ের সাথে আরো ভারতীয় ও বিশ্ব ভাষা যোগ হবে।",
    "diff.ux.title": "Cursor/Copilot-মানের UX",
    "diff.ux.desc":
      "Cursor এবং GitHub Copilot এর মতো বিশ্বাস, গতি ও ব্যবহারযোগ্যতা — ভারতের জন্য অতিরিক্ত শক্তি সহ।",

    // --- 4 AI Modes ---
    "modes.label": "৪ AI মোড",
    "modes.title": "একটি এডিটর, AI দিয়ে কোড করার চারটি উপায়",
    "modes.subtitle": "AI কতটা গভীরভাবে সাহায্য করবে তা বেছে নিন।",
    "modes.ask.tag": "ASK",
    "modes.ask.title": "চ্যাট ও অন্বেষণ",
    "modes.ask.desc":
      "আপনার কোড সম্পর্কে ওপেন-এন্ডেড AI কথোপকথন। ফাইল পরিবর্তন নেই।",
    "modes.plan.tag": "PLAN",
    "modes.plan.title": "আর্কিটেকচার ও কৌশল",
    "modes.plan.desc": "জটিল কাজের জন্য কাঠামোগত ধাপ-ধাপ বিশ্লেষণ।",
    "modes.impl.tag": "IMPLEMENT",
    "modes.impl.title": "সুনির্দিষ্ট এডিট চুক্তি",
    "modes.impl.desc":
      "AI কঠোর JSON প্যাচ তৈরি করে। প্রিভিউ, ওয়ান-ক্লিক অ্যাপ্লাই, ওয়ান-ক্লিক রোলব্যাক।",
    "modes.agent.tag": "AGENT",
    "modes.agent.title": "সম্পূর্ণ স্বায়ত্তশাসিত",
    "modes.agent.desc":
      "ফাইল পড়ে, কোড লেখে, টার্মিনাল চালায়, নিজে সংশোধন করে।",

    // --- Vibe Coding ---
    "vibe.label": "ভাইব কোডিং",
    "vibe.title": "উদ্দেশ্য-চালিত উন্নয়ন",
    "vibe.subtitle":
      'শুধু "কোড সম্পূর্ণ করো" এর বদলে, CodeIn আরো অভিব্যক্তিমূলক ওয়ার্কফ্লো সমর্থন করে।',
    "vibe.step1": "ফিচার বর্ণনা করুন",
    "vibe.step2": "সম্পূর্ণ ফ্রন্টএন্ড/ব্যাকএন্ড ফ্লো",
    "vibe.step3": "রিফ্যাক্টর অনুরোধ করুন",
    "vibe.step4": "UI/UX উন্নত করুন",
    "vibe.step5": "বাগ ঠিক করুন",
    "vibe.step6": "অনুপস্থিত ফাইল তৈরি করুন",
    "vibe.step7": "যাচাই ও পুনরাবৃত্তি করুন",
    "vibe.step8": "মাল্টি-ফাইল পরিবর্তন",
    "vibe.footnote":
      "দীর্ঘমেয়াদী লক্ষ্য: CodeIn একটি গুরুতর AI ইঞ্জিনিয়ারিং অংশীদার হওয়া।",

    // --- Multilingual Intelligence ---
    "mling.label": "বহুভাষিক বুদ্ধিমত্তা",
    "mling.title": "স্বাভাবিকভাবে চিন্তা করুন, নির্ভুলভাবে কোড করুন",
    "mling.subtitle":
      "নিখুঁত ইংরেজি প্রম্পট বাধ্যতামূলক নয়। CodeIn আপনার ভাষা শনাক্ত করে।",
    "mling.input_label": "ব্যবহারকারী বলেন (হিংলিশ)",
    "mling.interpret_label": "অভ্যন্তরীণ সিস্টেম ব্যাখ্যা",
    "mling.exec_label": "AI সম্পাদন করে",
    "mling.exec_desc":
      "কোডিং এজেন্টরা কাঠামোগত প্রযুক্তিগত বিন্যাসে কাজ করে। React, API, auth, Docker এর মতো প্রযুক্তিগত শব্দগুলি সর্বদা সংরক্ষিত।",
    "mling.mockup_title": "বহুভাষিক → অভ্যন্তরীণ স্বাভাবিকীকরণ",

    // --- Supported Languages ---
    "langs.label": "সমর্থিত ভাষা",
    "langs.title": "আপনার মাতৃভাষায় কোড করুন",
    "langs.desc":
      "ভয়েস ইনপুট, AI চ্যাট, কোড মন্তব্য, ত্রুটি বার্তা — সব আপনার পছন্দের ভাষায়।",

    // --- Why This Matters ---
    "why.label": "এটি কেন গুরুত্বপূর্ণ",
    "why.title": "বেশিরভাগ কোডিং টুল এখনও মনে করে",
    "why.assume1": "ব্যবহারকারী ইংরেজিতে চিন্তা করেন",
    "why.assume2": "ব্যবহারকারী শুধু ইনলাইন কম্প্লিশন চান",
    "why.assume3": "AI একটি সহায়ক, ওয়ার্কফ্লো ইঞ্জিন নয়",
    "why.assume4": "শক্তিশালী AI সর্বদা ব্যয়বহুল হতে হবে",
    "why.challenge": "CodeIn এটি চ্যালেঞ্জ করে।",
    "why.answer1": "প্রাকৃতিক বহুভাষিক মিথস্ক্রিয়া",
    "why.answer2": "শক্তিশালী repo-সচেতন ওয়ার্কফ্লো",
    "why.answer3": "সাশ্রয়ী, ব্যবহারিক AI-সহায়তা উন্নয়ন",
    "why.answer4": "লোকাল-ফার্স্ট নিয়ন্ত্রণ",
    "why.footnote": "ভাষা, টুল ও এজেন্ট জুড়ে ভবিষ্যৎ-প্রস্তুত সম্প্রসারণ।",

    // --- Comparison table rows ---
    "compare.f.completion": "AI কোড কম্প্লিশন",
    "compare.f.chat": "AI চ্যাট ও এজেন্ট মোড",
    "compare.f.free": "১০০% বিনামূল্যে ও ওপেন সোর্স",
    "compare.f.offline": "সম্পূর্ণ অফলাইন (লোকাল AI)",
    "compare.f.languages": "২২ ভারতীয় ভাষা সমর্থন",
    "compare.f.voice": "ভয়েস কোডিং (ভারতীয় ভাষা)",
    "compare.f.sovereign": "সার্বভৌম / এয়ার-গ্যাপড মোড",
    "compare.f.mcp": "MCP টুল প্রোটোকল",
    "compare.f.git": "Git Commit & GitHub Push",
    "compare.f.research": "অন্তর্নির্মিত ওয়েব গবেষণা",
    "compare.f.telemetry": "শূন্য টেলিমেট্রি / ট্র্যাকিং নেই",
    "compare.f.compute": "লোকাল কম্পিউট ইঞ্জিন",
    "compare.f.media": "লোকাল মিডিয়া জেনারেশন (ছবি/ভিডিও)",
    "compare.f.price_free": "বিনামূল্যে",
    "compare.f.forever": "চিরকাল",

    // --- System Requirements ---
    "req.win.r1": "Windows 10 বা পরবর্তী (x64)",
    "req.win.r2": "8 GB RAM (16 GB প্রস্তাবিত)",
    "req.win.r3": "500 MB ফাঁকা ডিস্ক স্পেস",
    "req.win.r4": "GPU ঐচ্ছিক (CUDA সমর্থন)",
    "req.mac.r1": "macOS 12 Monterey বা পরবর্তী",
    "req.mac.r2": "Intel বা Apple Silicon (M1+)",
    "req.mac.r3": "8 GB RAM (16 GB প্রস্তাবিত)",
    "req.mac.r4": "500 MB ফাঁকা ডিস্ক স্পেস",
    "req.linux.r1": "Ubuntu 20.04+ / Fedora 36+",
    "req.linux.r2": "x64 আর্কিটেকচার",
    "req.linux.r3": "8 GB RAM (16 GB প্রস্তাবিত)",
    "req.linux.r4": "500 MB ফাঁকা ডিস্ক স্পেস",

    // --- Downloads dynamic ---
    "downloads.latest": "সর্বশেষ রিলিজ:",
    "downloads.release_notes": "রিলিজ নোট",
    "downloads.recommended": "প্রস্তাবিত",
    "downloads.sha256_label": "SHA-256",
    "downloads.download_btn": "ডাউনলোড",
    "downloads.download_alt": "ডাউনলোড (বিকল্প)",
    "downloads.get_release": "বর্তমান রিলিজ পান",
    "downloads.cta_desc": "উপলব্ধ। GitHub থেকে বর্তমান রিলিজ ডাউনলোড করুন।",
    "downloads.tab_windows": "উইন্ডোজ",
    "downloads.tab_macos": "ম্যাকওএস",
    "downloads.tab_linux": "লিনাক্স",

    // --- Footer links ---
    "footer.github": "GitHub",
    "footer.bug": "বাগ রিপোর্ট করুন",
    "footer.discussions": "আলোচনা",
    "footer.contributing": "অবদান",
    "footer.license_apache": "Apache-2.0 লাইসেন্স",
    "footer.security": "নিরাপত্তা নীতি",
    "footer.coc": "আচরণ বিধি",
    "footer.license_link": "লাইসেন্স",
    "footer.privacy": "গোপনীয়তা নীতি",
    "footer.terms": "সেবার শর্তাবলী",
    "footer.copyright":
      "© 2025-2026 CodeIn প্রকল্প। Apache-2.0 এর অধীনে ওপেন-সোর্স।",

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

    "hero.badge": "v1.1.0-beta — ओपन सोर्स, कायम मोफत",
    "hero.title1": "भारताच्या प्रत्येक",
    "hero.title2": "भाषेत कोड करा",
    "hero.subtitle":
      "CodeIn एक AI-संचालित कोड एडिटर आहे जो मराठी, हिंदी, तमिळ आणि 22 भारतीय भाषा समजतो. ओपन-सोर्स. स्थानिक पातळीवर चालतो.",
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

    // --- What Makes CodeIn Different ---
    "diff.label": "CodeIn ला वेगळे बनवणारे काय",
    "diff.title": "AI जोडलेला कोड एडिटर नव्हे",
    "diff.subtitle":
      "CodeIn एक पूर्ण AI कोडिंग सिस्टम आहे — लोकल-फर्स्ट एक्झिक्यूशन, एजेंट ऑर्केस्ट्रेशन, बहुभाषिक समज, स्वायत्त वर्कफ्लो.",
    "diff.vibe.title": "वाइब कोडिंग, केवळ ऑटोकम्प्लीट नाही",
    "diff.vibe.desc":
      "सिंगल-लाइन सूचनांपुरते मर्यादित नाही. नैसर्गिक भाषेत वर्णन करा — CodeIn प्लान, जनरेट, रिफॅक्टर, व्हॅलिडेट करतो.",
    "diff.multilingual.title": "बहुभाषिक कमांड समज",
    "diff.multilingual.desc":
      "मराठी, हिंदी, हिंग्लिश, बंगाली-इंग्लिश मिक्समध्ये टाइप किंवा बोला. CodeIn तुमचा इनपुट इंटरनल इंग्लिश फॉर्मॅटमध्ये बदलतो.",
    "diff.cost.title": "शक्तिशाली AI, व्यावहारिक खर्च",
    "diff.cost.desc":
      "कोअर AI वर्कफ्लो महागड्या पॅटर्नवर अवलंबून नाहीत. लोकल-फर्स्ट, इंटेलिजेंट राउटिंग — प्रीमियम अनुभव, किफायतशीर किंमत.",
    "diff.local.title": "लोकल-फर्स्ट नियंत्रण",
    "diff.local.desc":
      "तुमचे वर्कफ्लो रिमोट ब्लॅक-बॉक्स एडिटरवर आधारित नाहीत. चांगली दृश्यमानता, अधिक नियंत्रण.",
    "diff.expansion.title": "भाषा विस्तारासाठी बनवले",
    "diff.expansion.desc":
      "बहुभाषिक लेयर विस्तारयोग्य आहे — कालांतराने अधिक भारतीय व जागतिक भाषा जोडल्या जातील.",
    "diff.ux.title": "Cursor/Copilot-क्लास UX",
    "diff.ux.desc":
      "Cursor आणि GitHub Copilot सारखा विश्वास, वेग व वापरण्यासारखा — भारतासाठी अतिरिक्त ताकदीसह.",

    // --- 4 AI Modes ---
    "modes.label": "4 AI मोड",
    "modes.title": "एक एडिटर, AI सह कोड करण्याचे चार मार्ग",
    "modes.subtitle": "AI किती खोलवर मदत करायची ते निवडा.",
    "modes.ask.tag": "ASK",
    "modes.ask.title": "चॅट आणि एक्सप्लोर",
    "modes.ask.desc": "तुमच्या कोडबद्दल ओपन-एंडेड AI संभाषण. फाइल बदल नाहीत.",
    "modes.plan.tag": "PLAN",
    "modes.plan.title": "आर्किटेक्चर आणि धोरण",
    "modes.plan.desc": "जटिल कामांसाठी स्ट्रक्चर्ड स्टेप-बाय-स्टेप विश्लेषण.",
    "modes.impl.tag": "IMPLEMENT",
    "modes.impl.title": "अचूक एडिट कॉन्ट्रॅक्ट",
    "modes.impl.desc":
      "AI स्ट्रिक्ट JSON पॅच बनवतो. प्रीव्यू, वन-क्लिक अप्लाय, वन-क्लिक रोलबॅक.",
    "modes.agent.tag": "AGENT",
    "modes.agent.title": "पूर्ण स्वायत्त",
    "modes.agent.desc":
      "फाइल्स वाचतो, कोड लिहितो, टर्मिनल चालवतो, स्वतः दुरुस्त करतो.",

    // --- Vibe Coding ---
    "vibe.label": "वाइब कोडिंग",
    "vibe.title": "इरादा-चालित विकास",
    "vibe.subtitle":
      '"कोड पूर्ण करा" एवढेच न विचारता, CodeIn अधिक अभिव्यक्तीपूर्ण वर्कफ्लो सपोर्ट करतो.',
    "vibe.step1": "फीचर वर्णन करा",
    "vibe.step2": "पूर्ण फ्रंटएंड/बॅकएंड फ्लो",
    "vibe.step3": "रिफॅक्टर करायला सांगा",
    "vibe.step4": "UI/UX सुधारा",
    "vibe.step5": "बग दुरुस्त करा",
    "vibe.step6": "मिसिंग फाइल्स तयार करा",
    "vibe.step7": "व्हॅलिडेट आणि इटरेट करा",
    "vibe.step8": "मल्टी-फाइल बदल",
    "vibe.footnote":
      "दीर्घकालीन ध्येय: CodeIn एक गंभीर AI इंजिनिअरिंग पार्टनर असावे.",

    // --- Multilingual Intelligence ---
    "mling.label": "बहुभाषिक बुद्धिमत्ता",
    "mling.title": "नैसर्गिकपणे विचार करा, अचूक कोड करा",
    "mling.subtitle":
      "परिपूर्ण इंग्लिश प्रॉम्प्ट बंधनकारक नाही. CodeIn तुमची भाषा ओळखतो.",
    "mling.input_label": "वापरकर्ता म्हणतो (हिंग्लिश)",
    "mling.interpret_label": "इंटरनल सिस्टम इंटरप्रिटेशन",
    "mling.exec_label": "AI एक्झिक्यूट करतो",
    "mling.exec_desc":
      "कोडिंग एजेंट्स स्ट्रक्चर्ड तांत्रिक फॉर्मॅटमध्ये काम करतात. React, API, auth, Docker सारखे तांत्रिक शब्द नेहमी संरक्षित राहतात.",
    "mling.mockup_title": "बहुभाषिक → इंटरनल नॉर्मलायझेशन",

    // --- Supported Languages ---
    "langs.label": "समर्थित भाषा",
    "langs.title": "तुमच्या मातृभाषेत कोड करा",
    "langs.desc":
      "व्हॉइस इनपुट, AI चॅट, कोड कमेंट्स, एरर मेसेज — सगळे तुमच्या आवडत्या भाषेत.",

    // --- Why This Matters ---
    "why.label": "हे का महत्त्वाचे आहे",
    "why.title": "बहुतेक कोडिंग टूल्स अजूनही गृहीत धरतात",
    "why.assume1": "वापरकर्ता इंग्लिशमध्ये विचार करतो",
    "why.assume2": "वापरकर्त्याला केवळ इनलाइन कम्प्लीशन हवे",
    "why.assume3": "AI एक सहाय्यक आहे, वर्कफ्लो इंजिन नाही",
    "why.assume4": "शक्तिशाली AI नेहमी महाग असावा",
    "why.challenge": "CodeIn याला आव्हान देतो.",
    "why.answer1": "नैसर्गिक बहुभाषिक संवाद",
    "why.answer2": "मजबूत repo-जागरूक वर्कफ्लो",
    "why.answer3": "किफायतशीर, व्यावहारिक AI-सहाय्यित विकास",
    "why.answer4": "लोकल-फर्स्ट नियंत्रण",
    "why.footnote": "भाषा, साधने आणि एजेंट्समध्ये भविष्य-तैयार विस्तार.",

    // --- Comparison table rows ---
    "compare.f.completion": "AI कोड कम्प्लीशन",
    "compare.f.chat": "AI चॅट आणि एजेंट मोड",
    "compare.f.free": "100% मोफत आणि ओपन सोर्स",
    "compare.f.offline": "पूर्ण ऑफलाइन (लोकल AI)",
    "compare.f.languages": "22 भारतीय भाषा सपोर्ट",
    "compare.f.voice": "व्हॉइस कोडिंग (भारतीय भाषा)",
    "compare.f.sovereign": "सॉव्हरिन / एअर-गॅप्ड मोड",
    "compare.f.mcp": "MCP टूल प्रोटोकॉल",
    "compare.f.git": "Git Commit आणि GitHub Push",
    "compare.f.research": "बिल्ट-इन वेब रिसर्च",
    "compare.f.telemetry": "शून्य टेलिमेट्री / ट्रॅकिंग नाही",
    "compare.f.compute": "लोकल कम्प्यूट इंजिन",
    "compare.f.media": "लोकल मीडिया जनरेशन (इमेज/व्हिडिओ)",
    "compare.f.price_free": "मोफत",
    "compare.f.forever": "कायम",

    // --- System Requirements ---
    "req.win.r1": "Windows 10 किंवा नंतरचे (x64)",
    "req.win.r2": "8 GB RAM (16 GB शिफारस)",
    "req.win.r3": "500 MB रिकामी डिस्क जागा",
    "req.win.r4": "GPU वैकल्पिक (CUDA सपोर्ट)",
    "req.mac.r1": "macOS 12 Monterey किंवा नंतरचे",
    "req.mac.r2": "Intel किंवा Apple Silicon (M1+)",
    "req.mac.r3": "8 GB RAM (16 GB शिफारस)",
    "req.mac.r4": "500 MB रिकामी डिस्क जागा",
    "req.linux.r1": "Ubuntu 20.04+ / Fedora 36+",
    "req.linux.r2": "x64 आर्किटेक्चर",
    "req.linux.r3": "8 GB RAM (16 GB शिफारस)",
    "req.linux.r4": "500 MB रिकामी डिस्क जागा",

    // --- Downloads dynamic ---
    "downloads.latest": "नवीनतम रिलीज:",
    "downloads.release_notes": "रिलीज नोट्स",
    "downloads.recommended": "शिफारस केलेले",
    "downloads.sha256_label": "SHA-256",
    "downloads.download_btn": "डाउनलोड",
    "downloads.download_alt": "डाउनलोड (पर्यायी)",
    "downloads.get_release": "सध्याचे रिलीज मिळवा",
    "downloads.cta_desc": "उपलब्ध आहे. GitHub वरून सध्याचे रिलीज डाउनलोड करा.",
    "downloads.tab_windows": "विंडोज",
    "downloads.tab_macos": "मॅकओएस",
    "downloads.tab_linux": "लिनक्स",

    // --- Footer links ---
    "footer.github": "GitHub",
    "footer.bug": "बग रिपोर्ट करा",
    "footer.discussions": "चर्चा",
    "footer.contributing": "योगदान",
    "footer.license_apache": "Apache-2.0 परवाना",
    "footer.security": "सुरक्षा धोरण",
    "footer.coc": "आचारसंहिता",
    "footer.license_link": "परवाना",
    "footer.privacy": "गोपनीयता धोरण",
    "footer.terms": "सेवा अटी",
    "footer.copyright":
      "© 2025-2026 CodeIn प्रकल्प. Apache-2.0 अंतर्गत ओपन-सोर्स.",

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
    "hero.badge": "v1.1.0-beta — ઓપન સોર્સ, હંમેશા મફત",
    "hero.title1": "ભારતની દરેક",
    "hero.title2": "ભાષામાં કોડ કરો",
    "hero.subtitle":
      "CodeIn એક AI-સંચાલિત કોડ એડિટર છે જે ગુજરાતી, હિન્દી, તમિલ અને 22 ભારતીય ભાષાઓ સમજે છે. ઓપન-સોર્સ. સ્થાનિક રીતે ચાલે છે.",
    "hero.download": "ડાઉનલોડ કરો",
    "hero.all_platforms": "બધા પ્લેટફોર્મ",
    "cta.title1": "તમારી ભાષામાં",
    "cta.title2": "કોડ કરવા તૈયાર?",
    "footer.tagline": "ભારત માટે AI-સંચાલિત કોડ એડિટર.",
    "footer.madeWith": "ભારતમાં ❤️ થી બનાવ્યું.",
  },

  /* ═══════════════════════ KANNADA ═══════════════════════ */
  kn: {
    "hero.badge": "v1.1.0-beta — ಮುಕ್ತ ಮೂಲ, ಶಾಶ್ವತ ಉಚಿತ",
    "hero.title1": "ಭಾರತದ ಪ್ರತಿ",
    "hero.title2": "ಭಾಷೆಯಲ್ಲಿ ಕೋಡ್ ಮಾಡಿ",
    "hero.subtitle":
      "CodeIn ಒಂದು AI-ಚಾಲಿತ ಕೋಡ್ ಸಂಪಾದಕ, ಕನ್ನಡ, ಹಿಂದಿ, ತಮಿಳು ಮತ್ತು 22 ಭಾರತೀಯ ಭಾಷೆಗಳನ್ನು ಅರ್ಥಮಾಡಿಕೊಳ್ಳುತ್ತದೆ.",
    "hero.download": "ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ",
    "cta.title1": "ನಿಮ್ಮ ಭಾಷೆಯಲ್ಲಿ",
    "cta.title2": "ಕೋಡ್ ಮಾಡಲು ಸಿದ್ಧರೇ?",
    "footer.tagline": "ಭಾರತಕ್ಕಾಗಿ AI-ಚಾಲಿತ ಕೋಡ್ ಸಂಪಾದಕ.",
    "footer.madeWith": "ಭಾರತದಲ್ಲಿ ❤️ ಇಂದ ತಯಾರಿಸಲಾಗಿದೆ.",
  },

  /* ═══════════════════════ MALAYALAM ═══════════════════════ */
  ml: {
    "hero.badge": "v1.1.0-beta — ഓപ്പൺ സോഴ്സ്, என்றும் സൗജன്യം",
    "hero.title1": "ഭാരതത്തിന്റെ ഓരോ",
    "hero.title2": "ഭാഷയിലും കോഡ് ചെയ്യൂ",
    "hero.subtitle":
      "CodeIn ഒരു AI-പവർഡ് കോഡ് എഡിറ്ററാണ്, മലയാളം, ഹിന്ദി, തമിഴ് തുടങ്ങി 22 ഇന്ത്യൻ ഭാഷകൾ മനസ്സിലാക്കുന്നു.",
    "hero.download": "ഡൗൺലോഡ്",
    "cta.title1": "നിങ്ങളുടെ ഭാഷയിൽ",
    "cta.title2": "കോഡ് ചെയ്യാൻ തയ്യാറാണോ?",
    "footer.tagline": "ഭാരതത്തിനായുള്ള AI-പവർഡ് കോഡ് എഡിറ്റർ.",
    "footer.madeWith": "ഇന്ത്യയിൽ ❤️ ഓടെ നിർമ്മിച്ചത്.",
  },

  /* ═══════════════════════ PUNJABI ═══════════════════════ */
  pa: {
    "hero.badge": "v1.1.0-beta — ਓਪਨ ਸੋਰਸ, ਹਮੇਸ਼ਾ ਮੁਫ਼ਤ",
    "hero.title1": "ਭਾਰਤ ਦੀ ਹਰ",
    "hero.title2": "ਭਾਸ਼ਾ ਵਿੱਚ ਕੋਡ ਕਰੋ",
    "hero.subtitle":
      "CodeIn ਇੱਕ AI-ਸੰਚਾਲਿਤ ਕੋਡ ਐਡੀਟਰ ਹੈ ਜੋ ਪੰਜਾਬੀ, ਹਿੰਦੀ, ਤਮਿਲ ਅਤੇ 22 ਭਾਰਤੀ ਭਾਸ਼ਾਵਾਂ ਸਮਝਦਾ ਹੈ। ਓਪਨ-ਸੋਰਸ। ਲੋਕਲ ਚੱਲਦਾ ਹੈ।",
    "hero.download": "ਡਾਊਨਲੋਡ ਕਰੋ",
    "cta.title1": "ਆਪਣੀ ਭਾਸ਼ਾ ਵਿੱਚ",
    "cta.title2": "ਕੋਡ ਕਰਨ ਲਈ ਤਿਆਰ?",
    "footer.tagline": "ਭਾਰਤ ਲਈ AI-ਸੰਚਾਲਿਤ ਕੋਡ ਐਡੀਟਰ।",
    "footer.madeWith": "ਭਾਰਤ ਵਿੱਚ ❤️ ਨਾਲ ਬਣਾਇਆ।",
  },
};

// ─── Language Metadata ──────────────────────────────────────
const LANG_META = {
  en: { label: "English", native: "English", flag: "🇬🇧", coverage: "full" },
  hi: { label: "Hindi", native: "हिन्दी", flag: "🇮🇳", coverage: "full" },
  ta: { label: "Tamil", native: "தமிழ்", flag: "🇮🇳", coverage: "full" },
  te: { label: "Telugu", native: "తెలుగు", flag: "🇮🇳", coverage: "partial" },
  bn: { label: "Bengali", native: "বাংলা", flag: "🇮🇳", coverage: "partial" },
  mr: { label: "Marathi", native: "मराठी", flag: "🇮🇳", coverage: "partial" },
  gu: { label: "Gujarati", native: "ગુજરાતી", flag: "🇮🇳", coverage: "beta" },
  kn: { label: "Kannada", native: "ಕನ್ನಡ", flag: "🇮🇳", coverage: "beta" },
  ml: { label: "Malayalam", native: "മലയാളം", flag: "🇮🇳", coverage: "beta" },
  pa: { label: "Punjabi", native: "ਪੰਜਾਬੀ", flag: "🇮🇳", coverage: "beta" },
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
