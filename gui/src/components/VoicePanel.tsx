import { JSONContent } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { setMainEditorContentTrigger } from "../redux/slices/sessionSlice";
import { agentFetch } from "../util/agentConfig";
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
  { label: "Konkani", code: "kok-IN", flag: "🇮🇳", native: "कोंकणी" },
  { label: "Manipuri", code: "mni-IN", flag: "🇮🇳", native: "মৈতৈলোন্" },
  { label: "Dogri", code: "doi-IN", flag: "🇮🇳", native: "डोगरी" },
  { label: "Bodo", code: "brx-IN", flag: "🇮🇳", native: "बड़ो" },
  { label: "Santali", code: "sat-IN", flag: "🇮🇳", native: "ᱥᱟᱱᱛᱟᱲᱤ" },
  { label: "Sindhi", code: "sd-IN", flag: "🇮🇳", native: "سنڌي" },
  { label: "Maithili", code: "mai-IN", flag: "🇮🇳", native: "मैथिली" },
  { label: "Nepali", code: "ne-NP", flag: "🇳🇵", native: "नेपाली" },
  { label: "Sanskrit", code: "sa-IN", flag: "🇮🇳", native: "संस्कृतम्" },
  { label: "Kashmiri", code: "ks-IN", flag: "🇮🇳", native: "کٲشُر" },
  { label: "English", code: "en-IN", flag: "🇮🇳", native: "English (India)" },
  { label: "English US", code: "en-US", flag: "🇺🇸", native: "English" },
];

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " code block ") // code blocks
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/\*\*([^*]+)\*\*/g, "$1") // bold
    .replace(/\*([^*]+)\*/g, "$1") // italic
    .replace(/#{1,6}\s/g, "") // headings
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/[>\-*+]/g, "") // list markers, blockquotes
    .replace(/\n{2,}/g, ". ") // paragraph breaks
    .replace(/\n/g, " ") // line breaks
    .trim();
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
  const [micError, setMicError] = useState<string | null>(null);
  const [backendAvailable, setBackendAvailable] = useState(false);
  const recognitionRef = useRef<any | null>(null);
  const intentionalStopRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  // Check if backend voice services are available
  useEffect(() => {
    agentFetch("/health")
      .then((r) => setBackendAvailable(r.ok))
      .catch(() => setBackendAvailable(false));
  }, []);

  // Close panel on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Fallback: browser-based TTS (used when backend TTS is unavailable)
  const fallbackBrowserTTS = useCallback(
    (text: string) => {
      if (!ttsSupported) {
        setIsSpeaking(false);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = selectedLang.code;
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    },
    [selectedLang.code, ttsSupported],
  );

  useEffect(() => {
    if (!speechSupported) {
      return;
    }

    const SpeechRecognitionImpl =
      window.SpeechRecognition || window.webkitSpeechRecognition;
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
      if (event.error === "not-allowed") {
        setMicError(
          "Microphone access denied. Please allow microphone permission in your browser or system settings.",
        );
      } else if (event.error === "no-speech") {
        // no-speech is non-fatal, don't stop recording
        return;
      } else {
        setMicError(`Speech recognition error: ${event.error}`);
      }
      setIsRecording(false);
      intentionalStopRef.current = false;
    };

    recognition.onend = () => {
      // Auto-restart if user hasn't intentionally stopped (continuous mode)
      if (!intentionalStopRef.current && recognitionRef.current) {
        try {
          recognitionRef.current.start();
          return; // keep isRecording true
        } catch {
          // Failed to restart — fall through to stop state
        }
      }
      setIsRecording(false);
      setInterimTranscript("");
      intentionalStopRef.current = false;
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, [selectedLang.code, speechSupported]);

  const handleRecord = async () => {
    if (!speechSupported || !recognitionRef.current) {
      return;
    }
    if (isRecording) {
      intentionalStopRef.current = true;
      recognitionRef.current.stop();
      setIsRecording(false);
      setInterimTranscript("");
    } else {
      setMicError(null);

      // Check microphone permission before starting recognition
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        // Release the stream immediately — we only needed permission
        stream.getTracks().forEach((track) => track.stop());
      } catch (err: any) {
        if (
          err.name === "NotAllowedError" ||
          err.name === "PermissionDeniedError"
        ) {
          setMicError(
            "Microphone access denied. Please allow microphone permission in your browser or system settings.",
          );
        } else if (
          err.name === "NotFoundError" ||
          err.name === "DevicesNotFoundError"
        ) {
          setMicError(
            "No microphone device found. Please connect a microphone and try again.",
          );
        } else {
          setMicError(`Microphone error: ${err.message || err.name}`);
        }
        return;
      }

      setTranscript("");
      setConfidence(0);
      intentionalStopRef.current = false;
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

  const handleSpeakLast = async () => {
    if (!lastAssistantMessage?.message?.content) {
      return;
    }

    // Stop any current playback
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
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

    const text = stripMarkdown(textContent);
    if (!text) return;

    setIsSpeaking(true);

    // Try backend TTS first (better Indian language support via gTTS/Azure)
    if (backendAvailable) {
      try {
        const langCode = selectedLang.code.split("-")[0]; // "hi-IN" -> "hi"
        const response = await agentFetch("/i18n/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: text.substring(0, 5000),
            lang: langCode,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.audioPath) {
            const audioUrl = `/i18n/tts/audio?path=${encodeURIComponent(data.audioPath)}`;
            // Use agentFetch to get the audio with auth, then create blob URL
            const audioResponse = await agentFetch(audioUrl);
            if (audioResponse.ok) {
              const blob = await audioResponse.blob();
              const blobUrl = URL.createObjectURL(blob);
              const audio = new Audio(blobUrl);
              audioRef.current = audio;
              audio.onended = () => {
                setIsSpeaking(false);
                URL.revokeObjectURL(blobUrl);
                audioRef.current = null;
              };
              audio.onerror = () => {
                URL.revokeObjectURL(blobUrl);
                audioRef.current = null;
                console.warn(
                  "Backend audio playback failed, using browser fallback",
                );
                fallbackBrowserTTS(text);
              };
              await audio.play();
              return;
            }
          }
        }
        // If backend returned non-ok, fall through to browser TTS
        console.warn("Backend TTS returned non-ok, using browser fallback");
        fallbackBrowserTTS(text);
      } catch (error) {
        console.warn("Backend TTS failed, using browser fallback:", error);
        fallbackBrowserTTS(text);
      }
    } else {
      // No backend — use browser TTS directly
      fallbackBrowserTTS(text);
    }
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
              <div className="voice-panel-title-row">
                <h3>🎤 Voice Assistant</h3>
                <span
                  className={`voice-backend-badge ${backendAvailable ? "connected" : "browser-only"}`}
                  title={
                    backendAvailable
                      ? "Backend TTS active (Indian language support)"
                      : "Browser-only mode (limited language support)"
                  }
                >
                  {backendAvailable ? "Enhanced Voice" : "Browser Voice"}
                </span>
              </div>
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
                    {micError && (
                      <div className="warning-box">⚠️ {micError}</div>
                    )}
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

                {(ttsSupported || backendAvailable) && lastAssistantMessage && (
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
