import { JSONContent } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { setMainEditorContentTrigger } from "../redux/slices/sessionSlice";
import "./VoicePanel.css";

const LANGUAGES = [
  { label: "Hindi", code: "hi-IN", flag: "🇮🇳", native: "हिन्दी" },
  { label: "Bengali", code: "bn-IN", flag: "🇮🇳", native: "বাংলা" },
  { label: "Tamil", code: "ta-IN", flag: "🇮🇳", native: "தமிழ்" },
  { label: "Telugu", code: "te-IN", flag: "🇮🇳", native: "తెలుగు" },
  { label: "Kannada", code: "kn-IN", flag: "🇮🇳", native: "ಕನ್ನಡ" },
  { label: "Malayalam", code: "ml-IN", flag: "🇮🇳", native: "മലയാളം" },
  { label: "Marathi", code: "mr-IN", flag: "🇮🇳", native: "मराठी" },
  { label: "Gujarati", code: "gu-IN", flag: "🇮🇳", native: "ગુજરાતી" },
  { label: "Punjabi", code: "pa-IN", flag: "🇮🇳", native: "ਪੰਜਾਬੀ" },
  { label: "Odia", code: "or-IN", flag: "🇮🇳", native: "ଓଡ଼ିଆ" },
  { label: "Assamese", code: "as-IN", flag: "🇮🇳", native: "অসমীয়া" },
  { label: "Urdu", code: "ur-IN", flag: "🇮🇳", native: "اردو" },
  { label: "English", code: "en-IN", flag: "🇮🇳", native: "English (India)" },
  { label: "English US", code: "en-US", flag: "🇺🇸", native: "English" },
];

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export function VoicePanel() {
  const dispatch = useAppDispatch();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLang, setSelectedLang] = useState(LANGUAGES[0]);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [confidence, setConfidence] = useState<number>(0);
  const recognitionRef = useRef<any | null>(null);

  const lastAssistantMessage = useAppSelector((state) =>
    [...state.session.history]
      .reverse()
      .find((item) => item.message.role === "assistant"),
  );

  const speechSupported = useMemo(() => {
    return (
      typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
    );
  }, []);

  const ttsSupported = useMemo(() => {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }, []);

  useEffect(() => {
    if (!speechSupported) {
      return;
    }

    const SpeechRecognitionImpl =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognitionImpl();
    recognition.lang = selectedLang.code;
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      let interim = "";

      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
          if (result[0].confidence) {
            setConfidence(result[0].confidence);
          }
        } else {
          interim += result[0].transcript;
        }
      }

      if (finalTranscript) {
        setTranscript((prev) => `${prev} ${finalTranscript}`.trim());
      }
      setInterimTranscript(interim);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
      setInterimTranscript("");
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, [selectedLang.code, speechSupported]);

  const handleRecord = () => {
    if (!speechSupported || !recognitionRef.current) {
      return;
    }
    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
      setInterimTranscript("");
    } else {
      setTranscript("");
      setConfidence(0);
      recognitionRef.current.lang = selectedLang.code;
      recognitionRef.current.start();
      setIsRecording(true);
    }
  };

  const handleSendToChat = () => {
    if (transcript.trim()) {
      const editorContent: JSONContent = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: transcript }],
          },
        ],
      };
      dispatch(setMainEditorContentTrigger(editorContent));
      setTranscript("");
      setIsOpen(false);
    }
  };

  const handleSpeakLast = () => {
    if (!lastAssistantMessage?.message?.content || !ttsSupported) {
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    // Handle both string and ChatMessagePart[] content
    const rawContent = lastAssistantMessage.message.content;
    const textContent =
      typeof rawContent === "string"
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent
              .map((p: any) => (typeof p === "string" ? p : p?.text || ""))
              .join(" ")
          : String(rawContent);

    const utterance = new SpeechSynthesisUtterance(textContent);
    utterance.lang = selectedLang.code;
    utterance.rate = 0.9;
    utterance.pitch = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  const handleClear = () => {
    setTranscript("");
    setInterimTranscript("");
    setConfidence(0);
  };

  return (
    <div className="voice-panel-container">
      <button
        className={`voice-trigger-btn ${isOpen ? "active" : ""}`}
        onClick={() => setIsOpen((prev) => !prev)}
        title="Voice Input"
      >
        <span className="voice-icon">🎤</span>
        <span className="voice-label">Voice</span>
      </button>

      {isOpen && (
        <>
          <div
            className="voice-panel-backdrop"
            onClick={() => setIsOpen(false)}
          />
          <div className="voice-panel">
            <div className="voice-panel-header">
              <h3>🎤 Voice Assistant</h3>
              <button
                className="close-btn"
                onClick={() => setIsOpen(false)}
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="voice-panel-content">
              {/* Language Selector */}
              <div className="language-selector">
                <label className="input-label">Language</label>
                <div className="language-grid">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      className={`lang-btn ${selectedLang.code === lang.code ? "active" : ""}`}
                      onClick={() => setSelectedLang(lang)}
                    >
                      <span className="flag">{lang.flag}</span>
                      <span className="native-name">{lang.native}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Recording Controls */}
              <div className="recording-section">
                {!speechSupported ? (
                  <div className="warning-box">
                    ⚠️ Speech recognition not available in this browser
                  </div>
                ) : (
                  <>
                    <button
                      className={`record-btn ${isRecording ? "recording" : ""}`}
                      onClick={handleRecord}
                    >
                      <span className="record-icon">
                        {isRecording ? "⏹" : "🎤"}
                      </span>
                      <span className="record-text">
                        {isRecording ? "Stop Recording" : "Start Recording"}
                      </span>
                    </button>

                    {isRecording && (
                      <div className="recording-indicator">
                        <span className="pulse"></span>
                        <span className="recording-text">Listening...</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Transcript Display */}
              <div className="transcript-section">
                <div className="transcript-header">
                  <label className="input-label">Transcript</label>
                  {transcript && (
                    <button
                      className="clear-btn"
                      onClick={handleClear}
                      title="Clear"
                    >
                      🗑️ Clear
                    </button>
                  )}
                </div>
                <div className="transcript-wrapper">
                  <div className="transcript-display">
                    {transcript || (
                      <span className="placeholder">
                        Your speech will appear here...
                      </span>
                    )}
                    {interimTranscript && (
                      <span className="interim-text"> {interimTranscript}</span>
                    )}
                  </div>
                  {confidence > 0 && (
                    <div className="confidence-meter">
                      <span className="confidence-label">Confidence:</span>
                      <div className="confidence-bar">
                        <div
                          className="confidence-fill"
                          style={{ width: `${confidence * 100}%` }}
                        />
                      </div>
                      <span className="confidence-value">
                        {Math.round(confidence * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="action-buttons">
                <button
                  className="primary-btn"
                  onClick={handleSendToChat}
                  disabled={!transcript.trim()}
                  title="Send to chat"
                >
                  💬 Send to Chat
                </button>

                {ttsSupported && lastAssistantMessage && (
                  <button
                    className="secondary-btn"
                    onClick={handleSpeakLast}
                    title={isSpeaking ? "Stop speaking" : "Speak last response"}
                  >
                    {isSpeaking ? "⏸ Stop" : "🔊 Speak Last"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
