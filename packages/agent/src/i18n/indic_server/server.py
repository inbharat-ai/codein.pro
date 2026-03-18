"""
AI4Bharat Translation/STT/TTS Microservice
Provides Indic language support for CodeIn

Fallback chain for each capability:
  STT: AI4Bharat ASR -> Whisper (pip) -> Whisper CLI -> 503
  TTS: AI4Bharat TTS -> gTTS -> pyttsx3 -> 503
  Translation: IndicTrans2 (already implemented)
"""

from flask import Flask, request, jsonify, send_file
import os
import sys
import shutil
import subprocess
import tempfile

app = Flask(__name__)

# Model paths
MODEL_DIR = os.path.expanduser("~/.codin/indic_models")
os.makedirs(MODEL_DIR, exist_ok=True)

# Translation model (IndicTrans2)
translation_model = None
translation_tokenizer = None

# STT model (if available)
stt_model = None

# TTS model (if available)
tts_model = None

# ── Capability detection ─────────────────────────────────────────

_capability_cache = None


def detect_capabilities():
    """Probe which Python packages and CLI tools are available."""
    global _capability_cache
    if _capability_cache is not None:
        return _capability_cache

    caps = {
        "ai4bharat_transliteration": False,
        "indic_nlp": False,
        "transformers": False,
        "whisper_pip": False,
        "whisper_cli": False,
        "gtts": False,
        "pyttsx3": False,
        "ai4bharat_tts": False,
    }

    try:
        import ai4bharat.transliteration  # noqa: F401
        caps["ai4bharat_transliteration"] = True
    except ImportError:
        pass

    try:
        from indicnlp.tokenize import indic_tokenize  # noqa: F401
        caps["indic_nlp"] = True
    except ImportError:
        pass

    try:
        from transformers import AutoTokenizer  # noqa: F401
        caps["transformers"] = True
    except ImportError:
        pass

    try:
        import whisper  # noqa: F401
        caps["whisper_pip"] = True
    except ImportError:
        pass

    # Check for whisper CLI (whisper.cpp or openai-whisper CLI)
    caps["whisper_cli"] = shutil.which("whisper") is not None

    try:
        from gtts import gTTS  # noqa: F401
        caps["gtts"] = True
    except ImportError:
        pass

    try:
        import pyttsx3  # noqa: F401
        caps["pyttsx3"] = True
    except ImportError:
        pass

    try:
        # Check for any AI4Bharat TTS package
        from ai4bharat.tts import TTS  # noqa: F401
        caps["ai4bharat_tts"] = True
    except ImportError:
        pass

    _capability_cache = caps
    return caps


# ── Translation ──────────────────────────────────────────────────

LANG_MAP = {
    "hi": "hin_Deva", "bn": "ben_Beng", "ta": "tam_Taml",
    "te": "tel_Telu", "kn": "kan_Knda", "ml": "mal_Mlym",
    "mr": "mar_Deva", "gu": "guj_Gujr", "pa": "pan_Guru",
    "or": "ory_Orya", "as": "asm_Beng", "ur": "urd_Arab",
    "sd": "snd_Arab", "kok": "kok_Deva", "mni": "mni_Beng",
    "doi": "doi_Deva", "brx": "brx_Deva", "sat": "sat_Olck",
    "en": "eng_Latn",
}


def load_translation_model():
    """Load IndicTrans2 model"""
    global translation_model, translation_tokenizer

    try:
        from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

        model_name = "ai4bharat/indictrans2-indic-en-1B"
        cache_dir = MODEL_DIR

        print(f"Loading translation model: {model_name}")
        translation_tokenizer = AutoTokenizer.from_pretrained(
            model_name, cache_dir=cache_dir, trust_remote_code=True
        )
        translation_model = AutoModelForSeq2SeqLM.from_pretrained(
            model_name, cache_dir=cache_dir, trust_remote_code=True
        )
        print("Translation model loaded successfully")
        return True
    except Exception as e:
        print(f"Failed to load translation model: {e}")
        return False


# ── STT fallback chain ───────────────────────────────────────────

def _stt_ai4bharat(audio_path, lang):
    """Attempt STT via AI4Bharat ASR model."""
    # AI4Bharat doesn't have a single unified ASR pip package yet;
    # this is a placeholder for when one ships.  For now we skip.
    raise NotImplementedError("AI4Bharat ASR package not available")


def _stt_whisper_pip(audio_path, lang):
    """Attempt STT via the openai-whisper Python package."""
    import whisper as whisper_mod

    global stt_model
    if stt_model is None:
        stt_model = whisper_mod.load_model("base")

    result = stt_model.transcribe(audio_path, language=lang)
    text = result.get("text", "").strip()
    if not text:
        raise RuntimeError("Whisper returned empty transcription")
    return {
        "text": text,
        "language": lang,
        "provider": "whisper-pip",
        "segments": result.get("segments", []),
    }


def _stt_whisper_cli(audio_path, lang):
    """Attempt STT via the whisper CLI (openai-whisper or whisper.cpp)."""
    whisper_bin = shutil.which("whisper")
    if not whisper_bin:
        raise FileNotFoundError("whisper CLI not in PATH")

    result = subprocess.run(
        [whisper_bin, audio_path, "--language", lang, "--output_format", "txt"],
        capture_output=True, text=True, timeout=120,
    )
    if result.returncode != 0:
        raise RuntimeError(f"whisper CLI failed: {result.stderr[:500]}")

    # whisper CLI writes <basename>.txt next to the audio
    txt_path = os.path.splitext(audio_path)[0] + ".txt"
    if os.path.exists(txt_path):
        with open(txt_path, "r", encoding="utf-8") as f:
            text = f.read().strip()
        os.remove(txt_path)
    else:
        text = result.stdout.strip()

    if not text:
        raise RuntimeError("Whisper CLI returned empty transcription")
    return {"text": text, "language": lang, "provider": "whisper-cli"}


# ── TTS fallback chain ──────────────────────────────────────────

def _tts_ai4bharat(text, lang):
    """Attempt TTS via AI4Bharat TTS package."""
    raise NotImplementedError("AI4Bharat TTS package not available")


def _tts_gtts(text, lang):
    """Attempt TTS via Google TTS (gTTS)."""
    from gtts import gTTS

    # gTTS language code mapping (uses BCP-47 style)
    gtts_lang_map = {
        "hi": "hi", "bn": "bn", "ta": "ta", "te": "te",
        "kn": "kn", "ml": "ml", "mr": "mr", "gu": "gu",
        "pa": "pa", "en": "en", "ur": "ur",
    }
    gtts_code = gtts_lang_map.get(lang, lang)

    tts = gTTS(text=text, lang=gtts_code)
    tmp = tempfile.NamedTemporaryFile(
        suffix=".mp3", dir=MODEL_DIR, delete=False
    )
    tmp_path = tmp.name
    tmp.close()
    tts.save(tmp_path)
    return tmp_path, "audio/mpeg", "gtts"


def _tts_pyttsx3(text, lang):
    """Attempt TTS via pyttsx3 (OS speech engine)."""
    import pyttsx3

    engine = pyttsx3.init()
    tmp = tempfile.NamedTemporaryFile(
        suffix=".wav", dir=MODEL_DIR, delete=False
    )
    tmp_path = tmp.name
    tmp.close()
    engine.save_to_file(text, tmp_path)
    engine.runAndWait()

    if not os.path.exists(tmp_path) or os.path.getsize(tmp_path) == 0:
        raise RuntimeError("pyttsx3 produced no audio output")
    return tmp_path, "audio/wav", "pyttsx3"


# ═════════════════════════════════════════════════════════════════
# ROUTES
# ═════════════════════════════════════════════════════════════════

@app.route("/health", methods=["GET"])
def health():
    """Health check — reports which capabilities are actually available."""
    caps = detect_capabilities()

    stt_available = caps["whisper_pip"] or caps["whisper_cli"]
    tts_available = caps["gtts"] or caps["pyttsx3"] or caps["ai4bharat_tts"]
    translation_available = caps["transformers"]

    install_hints = []
    if not stt_available:
        install_hints.append("STT: pip install openai-whisper")
    if not tts_available:
        install_hints.append("TTS: pip install gTTS")
    if not translation_available:
        install_hints.append("Translation: pip install transformers sentencepiece")

    return jsonify({
        "status": "ok" if (stt_available or tts_available or translation_available) else "degraded",
        "capabilities": {
            "translation": translation_available,
            "stt": stt_available,
            "tts": tts_available,
        },
        "providers": {
            "stt": {
                "whisper_pip": caps["whisper_pip"],
                "whisper_cli": caps["whisper_cli"],
                "ai4bharat_asr": False,  # not yet available as pip package
            },
            "tts": {
                "gtts": caps["gtts"],
                "pyttsx3": caps["pyttsx3"],
                "ai4bharat_tts": caps["ai4bharat_tts"],
            },
            "translation": {
                "indictrans2": caps["transformers"],
            },
        },
        "models": {
            "translation": translation_model is not None,
            "stt": stt_model is not None,
            "tts": tts_model is not None,
        },
        "install_hints": install_hints,
    })


@app.route("/translate", methods=["POST"])
def translate():
    """Translate text"""
    data = request.json
    text = data.get("text", "")
    source_lang = data.get("sourceLang", "hi")
    target_lang = data.get("targetLang", "en")

    if not text:
        return jsonify({"error": "Text is required"}), 400

    # Load model if not loaded
    if translation_model is None:
        if not load_translation_model():
            return jsonify({"error": "Translation model not available"}), 503

    try:
        src_code = LANG_MAP.get(source_lang, source_lang)
        tgt_code = LANG_MAP.get(target_lang, target_lang)

        # Tokenize
        inputs = translation_tokenizer(
            text, return_tensors="pt", padding=True, truncation=True, max_length=512
        )

        # Translate
        outputs = translation_model.generate(
            **inputs, max_length=512, num_beams=4, early_stopping=True
        )

        # Decode
        translated_text = translation_tokenizer.decode(outputs[0], skip_special_tokens=True)

        return jsonify({"translated": translated_text, "source": source_lang, "target": target_lang})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/stt", methods=["POST"])
def stt():
    """Speech-to-text with fallback chain: AI4Bharat -> Whisper pip -> Whisper CLI -> 503"""
    if "audio" not in request.files:
        return jsonify({"error": "Audio file is required"}), 400

    audio_file = request.files["audio"]
    lang = request.form.get("lang", "hi")

    # Save temporarily
    temp_path = os.path.join(MODEL_DIR, "temp_audio.wav")
    audio_file.save(temp_path)

    # Ordered fallback chain
    providers = [
        ("AI4Bharat ASR", _stt_ai4bharat),
        ("Whisper (pip)", _stt_whisper_pip),
        ("Whisper (CLI)", _stt_whisper_cli),
    ]

    last_error = None
    try:
        for name, fn in providers:
            try:
                result = fn(temp_path, lang)
                return jsonify(result)
            except (NotImplementedError, ImportError, FileNotFoundError):
                # Provider not installed — skip silently
                continue
            except Exception as e:
                # Provider installed but failed — log and try next
                last_error = f"{name}: {e}"
                print(f"[STT] {name} failed: {e}")
                continue

        # Nothing worked
        caps = detect_capabilities()
        return jsonify({
            "error": "No STT provider available",
            "tried": [name for name, _ in providers],
            "lastError": last_error,
            "install": "pip install openai-whisper   # or install whisper.cpp",
            "fallback": "Using cloud/browser speech recognition instead",
            "capabilities": {
                "whisper_pip": caps["whisper_pip"],
                "whisper_cli": caps["whisper_cli"],
            },
        }), 503
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@app.route("/tts", methods=["POST"])
def tts():
    """Text-to-speech with fallback chain: AI4Bharat TTS -> gTTS -> pyttsx3 -> 503"""
    data = request.json
    text = data.get("text", "")
    lang = data.get("lang", "hi")

    if not text:
        return jsonify({"error": "Text is required"}), 400

    # Ordered fallback chain
    providers = [
        ("AI4Bharat TTS", _tts_ai4bharat),
        ("gTTS", _tts_gtts),
        ("pyttsx3", _tts_pyttsx3),
    ]

    last_error = None
    for name, fn in providers:
        try:
            audio_path, content_type, provider_name = fn(text, lang)
            try:
                return send_file(
                    audio_path,
                    mimetype=content_type,
                    as_attachment=True,
                    download_name=f"tts_output{os.path.splitext(audio_path)[1]}",
                )
            finally:
                # Clean up temp file after sending
                if os.path.exists(audio_path):
                    try:
                        os.remove(audio_path)
                    except OSError:
                        pass
        except (NotImplementedError, ImportError, FileNotFoundError):
            # Provider not installed — skip silently
            continue
        except Exception as e:
            last_error = f"{name}: {e}"
            print(f"[TTS] {name} failed: {e}")
            continue

    # Nothing worked
    caps = detect_capabilities()
    return jsonify({
        "error": "No TTS provider available",
        "tried": [name for name, _ in providers],
        "lastError": last_error,
        "install": "pip install gTTS   # lightweight Google TTS, or: pip install pyttsx3",
        "fallback": "Using cloud/browser speech synthesis instead",
        "capabilities": {
            "gtts": caps["gtts"],
            "pyttsx3": caps["pyttsx3"],
        },
    }), 503


@app.route("/api/translate", methods=["POST"])
def api_translate():
    """Translation API endpoint (for AgentService compatibility)"""
    data = request.json
    text = data.get("text", "")
    source_language = data.get("source_language", "hi")
    target_language = data.get("target_language", "en")

    if not text:
        return jsonify({"error": "Text is required"}), 400

    # Load model if not loaded
    if translation_model is None:
        if not load_translation_model():
            return jsonify({"error": "Translation model not available"}), 503

    try:
        src_code = LANG_MAP.get(source_language, source_language)
        tgt_code = LANG_MAP.get(target_language, target_language)

        # Tokenize
        inputs = translation_tokenizer(
            text, return_tensors="pt", padding=True, truncation=True, max_length=512
        )

        # Translate
        outputs = translation_model.generate(
            **inputs, max_length=512, num_beams=4, early_stopping=True
        )

        # Decode
        translation = translation_tokenizer.decode(outputs[0], skip_special_tokens=True)

        return jsonify({"translation": translation})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/detect-language", methods=["POST"])
def detect_language():
    """Detect language from text"""
    data = request.json
    text = data.get("text", "")

    if not text:
        return jsonify({"error": "Text is required"}), 400

    # Detect language based on Unicode script ranges
    script_ranges = [
        ('\u0900', '\u097F', 'hi', 'Hindi'),
        ('\u0980', '\u09FF', 'bn', 'Bengali'),
        ('\u0B80', '\u0BFF', 'ta', 'Tamil'),
        ('\u0C00', '\u0C7F', 'te', 'Telugu'),
        ('\u0C80', '\u0CFF', 'kn', 'Kannada'),
        ('\u0D00', '\u0D7F', 'ml', 'Malayalam'),
        ('\u0A80', '\u0AFF', 'gu', 'Gujarati'),
        ('\u0A00', '\u0A7F', 'pa', 'Punjabi'),
        ('\u0B00', '\u0B7F', 'or', 'Odia'),
        ('\u0600', '\u06FF', 'ur', 'Urdu'),
    ]

    for start, end, code, name in script_ranges:
        if any(start <= c <= end for c in text):
            return jsonify({"language": code, "name": name})

    return jsonify({"language": "en", "name": "English"})


@app.route("/api/languages", methods=["GET"])
def get_languages():
    """Get supported languages"""
    return jsonify({
        "languages": [
            {"code": "en", "name": "English", "native": "English"},
            {"code": "hi", "name": "Hindi", "native": "\u0939\u093f\u0928\u094d\u0926\u0940"},
            {"code": "bn", "name": "Bengali", "native": "\u09ac\u09be\u0982\u09b2\u09be"},
            {"code": "ta", "name": "Tamil", "native": "\u0ba4\u0bae\u0bbf\u0bb4\u0bcd"},
            {"code": "te", "name": "Telugu", "native": "\u0c24\u0c46\u0c32\u0c41\u0c17\u0c41"},
            {"code": "kn", "name": "Kannada", "native": "\u0c95\u0ca8\u0ccd\u0ca8\u0ca1"},
            {"code": "ml", "name": "Malayalam", "native": "\u0d2e\u0d32\u0d2f\u0d3e\u0d33\u0d02"},
            {"code": "mr", "name": "Marathi", "native": "\u092e\u0930\u093e\u0920\u0940"},
            {"code": "gu", "name": "Gujarati", "native": "\u0a97\u0ac1\u0a9c\u0ab0\u0abe\u0aa4\u0ac0"},
            {"code": "pa", "name": "Punjabi", "native": "\u0a2a\u0a70\u0a1c\u0a3e\u0a2c\u0a40"},
            {"code": "or", "name": "Odia", "native": "\u0b13\u0b21\u0b3c\u0b3f\u0b06"},
            {"code": "as", "name": "Assamese", "native": "\u0985\u09b8\u09ae\u09c0\u09af\u09bc\u09be"},
            {"code": "ur", "name": "Urdu", "native": "\u0627\u0631\u062f\u0648"},
        ]
    })


@app.route("/api/completion", methods=["POST"])
def completion():
    """Generate code completion (placeholder for local LLM)"""
    data = request.json
    prompt = data.get("prompt", "")

    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400

    # TODO: Integrate with local LLM (llama.cpp or transformers)
    # For now, return a placeholder response
    return jsonify({
        "completion": "# Local LLM integration coming soon\n# This will use Qwen2.5-Coder or DeepSeek-R1",
        "model": "placeholder",
    })


if __name__ == "__main__":
    print("Starting AI4Bharat Indic Service...")
    print(f"Model directory: {MODEL_DIR}")

    # Report capabilities on startup
    caps = detect_capabilities()
    print(f"Detected capabilities: {caps}")

    available = [k for k, v in caps.items() if v]
    missing = [k for k, v in caps.items() if not v]
    if available:
        print(f"  Available: {', '.join(available)}")
    if missing:
        print(f"  Missing:   {', '.join(missing)}")

    app.run(host="127.0.0.1", port=43121, debug=False)
