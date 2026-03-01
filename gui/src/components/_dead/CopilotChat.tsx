/**
 * Copilot Chat Panel - AI Chat Interface
 * Enhanced with markdown, code highlighting, and multilingual support
 */

import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useDispatch, useSelector } from "react-redux";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { addMessage, clearMessages } from "../redux/slices/copilotSlice";
import { agentFetch } from "../util/agentConfig";
import "./CopilotChat.css";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  code?: string;
  language?: string;
}

export const CopilotChat: React.FC = () => {
  const dispatch = useDispatch();
  const messages = useSelector((state: any) => state.copilot.messages);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue,
      timestamp: Date.now(),
    };

    dispatch(addMessage(userMessage));
    const messageToSend = inputValue;
    setInputValue("");
    setIsLoading(true);

    try {
      // Get context (current file, selected text, workspace info)
      const context = await getContext();

      // Translate if not English
      let prompt = messageToSend;
      if (selectedLanguage !== "en") {
        try {
          const translatedResult = await translateToEnglish(messageToSend);
          if (translatedResult.translatedText) {
            prompt = translatedResult.translatedText;
          }
        } catch (err) {
          console.warn("Translation failed, using original text:", err);
        }
      }

      // Call AI
      const fullPrompt = context
        ? `Context:\n${context}\n\nUser: ${prompt}`
        : prompt;

      const response = await window.codinAPI.agent.generateCompletion(
        fullPrompt,
        { temperature: 0.7, max_tokens: 2000 },
      );

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response,
        timestamp: Date.now(),
      };

      dispatch(addMessage(assistantMessage));
    } catch (error) {
      console.error("Failed to get response:", error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content:
          "Sorry, I encountered an error. Please ensure the CodIn Agent is running and try again.",
        timestamp: Date.now(),
      };
      dispatch(addMessage(errorMessage));
    } finally {
      setIsLoading(false);
    }
  };

  const getContext = async (): Promise<string> => {
    try {
      // Get current editor state
      const activeFile = await window.codinAPI?.editor?.getActiveFile?.();
      const selection = await window.codinAPI?.editor?.getSelection?.();

      let context = "";

      if (activeFile) {
        context += `Current file: ${activeFile}\n`;
      }

      if (selection) {
        context += `Selected code:\n\`\`\`\n${selection}\n\`\`\`\n`;
      }

      return context || "No specific context";
    } catch (error) {
      return "No context available";
    }
  };

  const translateToEnglish = async (
    text: string,
  ): Promise<{ translatedText: string | null }> => {
    const response = await agentFetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        source_language: selectedLanguage,
        target_language: "en",
      }),
    });

    if (!response.ok) {
      throw new Error("Translation failed");
    }

    const data = await response.json();
    return { translatedText: data.translation };
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearChat = () => {
    dispatch(clearMessages());
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="copilot-chat">
      <div className="copilot-header">
        <div className="header-left">
          <h3>✨ CodIn AI</h3>
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            className="language-select"
          >
            <option value="en">English</option>
            <option value="hi">हिन्दी (Hindi)</option>
            <option value="as">অসমীয়া (Assamese)</option>
            <option value="ta">தமிழ் (Tamil)</option>
          </select>
        </div>
        <button onClick={clearChat} title="Clear chat" aria-label="Clear">
          🗑️
        </button>
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-welcome">
            <h3>🚀 Welcome to CodIn AI</h3>
            <p>Your multilingual AI coding assistant</p>
            <ul>
              <li>💡 Code explanation & documentation</li>
              <li>🐛 Bug detection & fixing</li>
              <li>✨ Feature generation</li>
              <li>🧪 Test writing & TDD</li>
              <li>🔧 Refactoring suggestions</li>
              <li>🌐 Multilingual support (हिन्दी, অসমীয়া, தமிழ்)</li>
            </ul>
          </div>
        ) : (
          messages.map((msg: ChatMessage) => (
            <div key={msg.id} className={`message ${msg.role}`}>
              <div className="message-role">
                {msg.role === "user" ? "👤" : "🤖"}
              </div>
              <div className="message-content">
                <ReactMarkdown
                  components={{
                    code({ node, className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || "");
                      const codeString = String(children).replace(/\n$/, "");
                      const isInline = !match;

                      return !isInline && match ? (
                        <div className="code-block-wrapper">
                          <div className="code-block-header">
                            <span className="code-lang">{match[1]}</span>
                            <button
                              className="copy-btn"
                              onClick={() => copyToClipboard(codeString)}
                              title="Copy code"
                            >
                              📋
                            </button>
                          </div>
                          <SyntaxHighlighter
                            style={
                              vscDarkPlus as Record<string, React.CSSProperties>
                            }
                            language={match[1]}
                            PreTag="div"
                          >
                            {codeString}
                          </SyntaxHighlighter>
                        </div>
                      ) : (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="message assistant">
            <div className="message-role">🤖</div>
            <div className="message-content typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Ask me anything... (${selectedLanguage !== "en" ? "multilingual mode" : "English"}) [Shift+Enter for new line]`}
          className="chat-input"
          disabled={isLoading}
          rows={1}
        />
        <button
          onClick={handleSendMessage}
          disabled={isLoading || !inputValue.trim()}
          className="send-button"
          aria-label="Send"
          title="Send message"
        >
          {isLoading ? "⏳" : "🚀"}
        </button>
      </div>
    </div>
  );
};
