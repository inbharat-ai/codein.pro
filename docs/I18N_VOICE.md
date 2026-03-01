# Multilingual & Voice Support (I18N)

## Overview

CodIn provides **first-class support for Indian languages** with AI4Bharat integration, enabling developers to code in their native language.

## Supported Languages

| Language | Code | Script              | Voice Support |
| -------- | ---- | ------------------- | ------------- |
| Hindi    | `hi` | Devanagari (हिन्दी) | ✅ Yes        |
| Assamese | `as` | Bengali (অসমীয়া)   | ✅ Yes        |
| Tamil    | `ta` | Tamil (தமிழ்)       | ✅ Yes        |
| English  | `en` | Latin               | ✅ Yes        |

## Architecture

```
┌─────────────────────────────────────────┐
│   VS Code Extension                      │
│   - Language Selector                    │
│   - Voice Panel (STT/TTS)                │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│   CodIn Agent (I18n Orchestrator)       │
│   - Translation Provider Hierarchy       │
│   - STT Provider Hierarchy               │
│   - TTS Provider Hierarchy               │
└──────┬───────────────────────────────────┘
       │
       ├── AI4Bharat Provider (Python microservice)
       │   └── IndicTrans2, STT/TTS models
       │
       ├── Whisper.cpp (STT fallback)
       ├── OS TTS (macOS say, Windows SAPI, espeak)
       └── Local LLM Translation (fallback)
```

## Provider Hierarchy

### Translation Providers

**Priority Order:**

1. **AI4Bharat IndicTrans2** (preferred for Indic languages)
2. **Local LLM** (using installed coder model)
3. **Passthrough** (return original text)

### STT Providers

**Priority Order:**

1. **AI4Bharat STT** (Indic languages)
2. **Whisper.cpp** (offline multilingual)
3. **Browser Web Speech API** (fallback in webview)

### TTS Providers

**Priority Order:**

1. **AI4Bharat TTS** (natural Indic voices)
2. **OS TTS** (system voices)
3. **None** (graceful degradation)

## Features

### 1. Automatic Language Detection

```typescript
const detected = i18nOrchestrator.detectLanguage("यह एक परीक्षण है");
// Returns: "hi" (Hindi)
```

**Detection Method:**

- Unicode script analysis (Devanagari, Bengali, Tamil)
- Fallback to English for ASCII-only text

### 2. Seamless Translation Pipeline

**User Input Flow:**

```
User types in Hindi
  ↓
Auto-detect language: "hi"
  ↓
Translate to English (for best LLM output)
  ↓
LLM processes in English
  ↓
Translate response back to Hindi
  ↓
Display to user in Hindi
```

**Code Example:**

```typescript
// Translate prompt to English
const {
  text: englishPrompt,
  language,
  translated,
} = await i18nOrchestrator.translateToEnglishIfNeeded(userInput);

// Send to LLM
const response = await llm.generate(englishPrompt);

// Translate response back
const { text: localizedResponse } =
  await i18nOrchestrator.translateFromEnglishIfNeeded(response, language);
```

### 3. Voice Input (Speech-to-Text)

**UI Location:** Voice Panel (microphone icon below chat input)

**Workflow:**

1. Click microphone icon
2. Select language: Hindi / Assamese / Tamil / English
3. Grant browser microphone permission (first time only)
4. Speak your query
5. Transcript appears in input box
6. Review and send

**Backend:**

```typescript
const transcript = await i18nOrchestrator.stt(audioPath, "hi");
// Returns: "मुझे एक Todo ऐप बनाना है"
```

**Audio Formats:** WAV, MP3, OGG (auto-converted)

### 4. Voice Output (Text-to-Speech)

**Enable:** Click speaker icon in Voice Panel

**Workflow:**

1. Enable "Speak Output" toggle
2. LLM generates response
3. Explanation text sent to TTS
4. Audio file generated
5. Extension plays audio automatically

**Backend:**

```typescript
const audioPath = await i18nOrchestrator.tts(
  "यहाँ एक Todo ऐप है",
  "hi",
  "/tmp/output.wav",
);
// Returns: path to generated audio file
```

## AI4Bharat Integration

### Python Microservice

**Location:** `packages/agent/src/i18n/indic_server/`

**Files:**

- `server.py` – Flask server for translation/STT/TTS
- `setup.py` – Virtual environment auto-setup
- `venv/` – Python dependencies (auto-created)

### First-Time Setup

**Automatic on first use:**

1. Python virtual environment created
2. Dependencies installed:
   - Flask
   - Transformers
   - Torch
   - SentencePiece
3. Models downloaded to `~/.codin/indic_models/`

**Manual setup (if needed):**

```bash
cd packages/agent/src/i18n/indic_server
python setup.py
python server.py
```

**Server runs on:** `http://127.0.0.1:43121`

### Translation Model

**Model:** AI4Bharat IndicTrans2 (1B parameters)

**Features:**

- Indic → English translation
- English → Indic translation
- Optimized for Indian languages
- 4-bit quantization support

**Example:**

```python
# Hindi to English
POST /translate
{
  "text": "मुझे एक Todo ऐप बनाना है",
  "sourceLang": "hi",
  "targetLang": "en"
}

# Response:
{
  "translated": "I want to create a Todo app",
  "source": "hi",
  "target": "en"
}
```

### Model Storage

All AI4Bharat models stored in:

```
~/.codin/indic_models/
├── models--ai4bharat--indictrans2-indic-en-1B/
│   ├── tokenizer/
│   ├── pytorch_model.bin
│   └── config.json
└── [other models]
```

## REST API Endpoints

All endpoints: `http://localhost:43120/i18n/*`

### Translate

```http
POST /i18n/translate
Content-Type: application/json

{
  "text": "मुझे एक Todo ऐप बनाना है",
  "sourceLang": "hi",
  "targetLang": "en"
}
```

Response:

```json
{
  "translated": "I want to create a Todo app",
  "source": "hi",
  "target": "en"
}
```

### Detect Language

```http
POST /i18n/detect-language
Content-Type: application/json

{
  "text": "यह एक परीक्षण है"
}
```

Response:

```json
{
  "language": "hi"
}
```

### Speech-to-Text

```http
POST /i18n/stt
Content-Type: application/json

{
  "audioPath": "/tmp/recording.wav",
  "lang": "hi"
}
```

Response:

```json
{
  "transcript": "मुझे एक Todo ऐप बनाना है",
  "language": "hi"
}
```

### Text-to-Speech

```http
POST /i18n/tts
Content-Type: application/json

{
  "text": "यहाँ एक Todo ऐप है",
  "lang": "hi",
  "outputPath": "/tmp/output.wav"
}
```

Response:

```json
{
  "audioPath": "/tmp/output.wav"
}
```

## User Workflow

### Typing in Native Language

1. **Open CodIn chat**
2. **Select language** (or use auto-detect)
3. **Type in Hindi/Assamese/Tamil**
4. **Send message**
5. **Receive response in same language**

Example:

```
User (Hindi): मुझे एक React Todo ऐप बनाना है
Assistant (Hindi): यहाँ एक सरल React Todo ऐप है:
[Code in English with Hindi comments]
```

### Voice Input Workflow

1. **Click microphone icon** below chat input
2. **Select language** from dropdown
3. **Click "Start Recording"**
4. **Speak clearly** into microphone
5. **Click "Stop Recording"**
6. **Review transcript** in input box
7. **Edit if needed**
8. **Send message**

### Voice Output Workflow

1. **Enable "Speak Output"** toggle
2. **Send message** (voice or text)
3. **Wait for response**
4. **Audio plays automatically**
5. **Pause/replay controls** available

## Language Selector UI

**Location:** Above chat input (next to mode selector)

**Options:**

- 🔄 Auto-detect (default)
- 🇮🇳 हिन्दी (Hindi)
- 🇮🇳 অসমীয়া (Assamese)
- 🇮🇳 தமிழ் (Tamil)
- 🇬🇧 English

**Behavior:**

- Auto-detect: Analyzes input text to determine language
- Manual selection: Forces all translations to/from selected language

## Voice Panel UI

**Location:** Below chat input (microphone and speaker icons)

**Components:**

1. **Microphone Button** – Start/stop recording
2. **Language Dropdown** – Select input language
3. **Recording Indicator** – Shows when active
4. **Transcript Display** – Real-time text
5. **Speaker Button** – Enable/disable TTS
6. **Volume Control** – Adjust playback

## Fallback Providers

### Whisper.cpp (STT Fallback)

**Installation:**

```bash
# macOS
brew install whisper.cpp

# Linux
git clone https://github.com/ggerganov/whisper.cpp
make

# Windows
# Download prebuilt binary from releases
```

**Models:** Base, Small, Medium (auto-downloaded)

**Usage:** Automatic if AI4Bharat STT unavailable

### OS TTS (Platform-Specific)

#### macOS

```bash
say -v "Lekha" "नमस्ते"  # Hindi voice
```

#### Windows

```powershell
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Speak("Hello")
```

#### Linux

```bash
espeak -v hi "नमस्ते"  # Hindi voice
```

### LLM Translation (Fallback)

If AI4Bharat unavailable, uses local coder model:

```
Prompt: "Translate the following Hindi text to English.
Provide ONLY the translation, no explanations:

मुझे एक Todo ऐप बनाना है"

Response: "I want to create a Todo app"
```

**Quality:** Good for simple translations, may struggle with technical terms

## Configuration

### Enable/Disable Providers

Edit `~/.codin/i18n/config.json`:

```json
{
  "translation": {
    "preferredProvider": "ai4bharat",
    "fallbackToLLM": true
  },
  "stt": {
    "preferredProvider": "ai4bharat",
    "fallbackToWhisper": true
  },
  "tts": {
    "preferredProvider": "ai4bharat",
    "fallbackToOS": true
  }
}
```

### Model Download Location

Change model storage directory:

```bash
export CODIN_INDIC_MODELS="/custom/path/to/models"
```

## Troubleshooting

### AI4Bharat Server Not Starting

**Symptoms:** Translation fails, "Translation provider not available"

**Solutions:**

1. Check Python installation: `python --version` (3.8+ required)
2. Run setup manually: `cd packages/agent/src/i18n/indic_server && python setup.py`
3. Check port 43121 availability
4. View logs: `~/.codin/logs/indic_server.log`

### Voice Input Not Working

**Symptoms:** No microphone access or empty transcript

**Solutions:**

1. Grant microphone permission in browser/VS Code
2. Check microphone settings in OS
3. Try different browser (Chrome/Edge recommended)
4. Install Whisper.cpp as fallback

### Translation Quality Issues

**Symptoms:** Incorrect or garbled translations

**Solutions:**

1. Use simpler sentences (under 100 words)
2. Avoid mixing languages in single sentence
3. Check if AI4Bharat model downloaded correctly
4. Try manual English input for complex technical terms

### Voice Output Silent

**Symptoms:** No audio plays, but no errors

**Solutions:**

1. Check system volume settings
2. Verify speaker icon is enabled
3. Test OS TTS manually: `say "test"` (macOS)
4. Check audio format compatibility

## Best Practices

✅ **Keep sentences simple** – better translation quality  
✅ **Technical terms in English** – variable names, APIs, frameworks  
✅ **Code in English** – with Hindi/Tamil/Assamese comments  
✅ **Voice input in quiet environment** – better transcription  
✅ **Review voice transcripts** – correct errors before sending

❌ **Avoid mixing scripts** – use one language per message  
❌ **Don't use slang** – stick to standard language  
❌ **Don't rely 100% on translation** – verify critical instructions

## Future Enhancements

- [ ] More Indic languages (Bengali, Telugu, Kannada, Malayalam)
- [ ] Custom vocabulary for technical terms
- [ ] Translation memory for consistency
- [ ] Offline TTS models
- [ ] Voice cloning for personalized output
