"""
AI4Bharat Translation/STT/TTS Microservice
Provides Indic language support for CodIn
"""

from flask import Flask, request, jsonify
import os
import sys

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


@app.route("/health", methods=["GET"])
def health():
    """Health check"""
    return jsonify(
        {
            "status": "ok",
            "models": {
                "translation": translation_model is not None,
                "stt": stt_model is not None,
                "tts": tts_model is not None,
            },
        }
    )


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
        # IndicTrans2 uses specific language codes
        lang_map = {
            "hi": "hin_Deva",
            "bn": "ben_Beng",
            "ta": "tam_Taml",
            "te": "tel_Telu",
            "kn": "kan_Knda",
            "ml": "mal_Mlym",
            "mr": "mar_Deva",
            "gu": "guj_Gujr",
            "pa": "pan_Guru",
            "or": "ory_Orya",
            "as": "asm_Beng",
            "ur": "urd_Arab",
            "sd": "snd_Arab",
            "kok": "kok_Deva",
            "mni": "mni_Beng",
            "doi": "doi_Deva",
            "brx": "brx_Deva",
            "sat": "sat_Olck",
            "en": "eng_Latn",
        }

        src_code = lang_map.get(source_lang, source_lang)
        tgt_code = lang_map.get(target_lang, target_lang)

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
    """Speech-to-text"""
    # Get audio file from request
    if "audio" not in request.files:
        return jsonify({"error": "Audio file is required"}), 400

    audio_file = request.files["audio"]
    lang = request.form.get("lang", "hi")

    # Save temporarily
    temp_path = os.path.join(MODEL_DIR, "temp_audio.wav")
    audio_file.save(temp_path)

    try:
        return jsonify({"error": "STT not implemented"}), 501
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@app.route("/tts", methods=["POST"])
def tts():
    """Text-to-speech"""
    data = request.json
    text = data.get("text", "")
    lang = data.get("lang", "hi")

    if not text:
        return jsonify({"error": "Text is required"}), 400

    try:
        return jsonify({"error": "TTS not implemented"}), 501
    except Exception as e:
        return jsonify({"error": str(e)}), 500


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
        # IndicTrans2 uses specific language codes
        lang_map = {
            "hi": "hin_Deva",
            "bn": "ben_Beng",
            "ta": "tam_Taml",
            "te": "tel_Telu",
            "kn": "kan_Knda",
            "ml": "mal_Mlym",
            "mr": "mar_Deva",
            "gu": "guj_Gujr",
            "pa": "pan_Guru",
            "or": "ory_Orya",
            "as": "asm_Beng",
            "ur": "urd_Arab",
            "sd": "snd_Arab",
            "kok": "kok_Deva",
            "mni": "mni_Beng",
            "doi": "doi_Deva",
            "brx": "brx_Deva",
            "sat": "sat_Olck",
            "en": "eng_Latn",
        }

        src_code = lang_map.get(source_language, source_language)
        tgt_code = lang_map.get(target_language, target_language)

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
            {"code": "hi", "name": "Hindi", "native": "हिन्दी"},
            {"code": "bn", "name": "Bengali", "native": "বাংলা"},
            {"code": "ta", "name": "Tamil", "native": "தமிழ்"},
            {"code": "te", "name": "Telugu", "native": "తెలుగు"},
            {"code": "kn", "name": "Kannada", "native": "ಕನ್ನಡ"},
            {"code": "ml", "name": "Malayalam", "native": "മലയാളം"},
            {"code": "mr", "name": "Marathi", "native": "मराठी"},
            {"code": "gu", "name": "Gujarati", "native": "ગુજરાતી"},
            {"code": "pa", "name": "Punjabi", "native": "ਪੰਜਾਬੀ"},
            {"code": "or", "name": "Odia", "native": "ଓଡ଼ିଆ"},
            {"code": "as", "name": "Assamese", "native": "অসমীয়া"},
            {"code": "ur", "name": "Urdu", "native": "اردو"},
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

    # Optionally pre-load translation model
    # load_translation_model()

    app.run(host="127.0.0.1", port=43121, debug=False)
