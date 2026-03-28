import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";

const LANGUAGES = [
  { code: "en-IN", label: "English", sarvam: "en-IN" },
  { code: "hi-IN", label: "Hindi", sarvam: "hi-IN" },
  { code: "bn-IN", label: "Bengali", sarvam: "bn-IN" },
  { code: "te-IN", label: "Telugu", sarvam: "te-IN" },
  { code: "ta-IN", label: "Tamil", sarvam: "ta-IN" },
  { code: "kn-IN", label: "Kannada", sarvam: "kn-IN" },
  { code: "ml-IN", label: "Malayalam", sarvam: "ml-IN" },
  { code: "mr-IN", label: "Marathi", sarvam: "mr-IN" },
  { code: "gu-IN", label: "Gujarati", sarvam: "gu-IN" },
  { code: "od-IN", label: "Odia", sarvam: "od-IN" },
  { code: "pa-IN", label: "Punjabi", sarvam: "pa-IN" },
];

const CLAUDE_SYSTEM_PROMPT = `You are Emo, a compassionate AI mental health companion for college students in India. You speak warmly, like a supportive friend who also has knowledge of psychology. You respond in the same language the user speaks in. You never diagnose. You always encourage professional help for serious concerns. Keep responses concise and conversational (2-4 sentences max for voice).`;

function Chat() {
  const { user, userData, logout } = useAuth();
  const navigate = useNavigate();

  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: `Hi ${userData?.name?.split(" ")[0] || "there"}! 👋 I'm Emo, your mental wellness companion. How are you feeling today? You can type or use the mic to talk to me.`,
      id: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [showLangMenu, setShowLangMenu] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const chatEndRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── SEND TO CLAUDE ──
  const sendToClaude = async (userText) => {
    const newMessages = [
      ...messages,
      { role: "user", content: userText, id: Date.now() },
    ];
    setMessages(newMessages);
    setLoading(true);

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          max_tokens: 300,
          messages: [
            { role: "system", content: CLAUDE_SYSTEM_PROMPT },
            ...newMessages
              .filter((m) => m.role === "user" || m.role === "assistant")
              .map((m) => ({ role: m.role, content: m.content })),
          ],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(err);
      }

      const data = await response.json();
      const reply = data.choices[0].message.content;

      const assistantMsg = { role: "assistant", content: reply, id: Date.now() };
      setMessages((prev) => [...prev, assistantMsg]);
      setLoading(false);

      // Auto speak the response
      await speakText(reply);
    } catch (err) {
      console.error("Claude error:", err);
      toast.error("AI response failed: " + err.message);
      setLoading(false);
    }
  };

  // ── TEXT SUBMIT ──
  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    await sendToClaude(text);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── SARVAM STT ──
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await transcribeAudio(audioBlob);
      };

      mediaRecorder.start();
      setRecording(true);
      toast.success("Recording... Click mic again to stop");
    } catch (err) {
      toast.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const toggleRecording = () => {
    if (recording) stopRecording();
    else startRecording();
  };

  const transcribeAudio = async (audioBlob) => {
    setLoading(true);
    toast.loading("Transcribing...", { id: "stt" });
    try {
      // Convert webm to wav-compatible format for Sarvam
      const formData = new FormData();
      formData.append("file", audioBlob, "audio.webm");
      formData.append("model", "saarika:v2.5");
      formData.append("language_code", language.sarvam);

      const response = await fetch("https://api.sarvam.ai/speech-to-text", {
        method: "POST",
        headers: {
          "api-subscription-key": import.meta.env.VITE_SARVAM_API_KEY,
        },
        body: formData,
      });

      toast.dismiss("stt");

      if (!response.ok) {
        const err = await response.text();
        throw new Error(err);
      }

      const data = await response.json();
      const transcript = data.transcript || data.text || "";

      if (!transcript) {
        toast.error("Could not hear anything. Please try again.");
        setLoading(false);
        return;
      }

      toast.success("Got it! Sending to Emo...");
      await sendToClaude(transcript);
    } catch (err) {
      toast.dismiss("stt");
      console.error("STT error:", err);
      toast.error("Transcription failed: " + err.message);
      setLoading(false);
    }
  };

  // ── SARVAM TTS ──
  const speakText = async (text) => {
    setSpeaking(true);
    try {
      const response = await fetch("https://api.sarvam.ai/text-to-speech", {
        method: "POST",
        headers: {
          "api-subscription-key": import.meta.env.VITE_SARVAM_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: [text.slice(0, 500)], // Sarvam has char limit
          target_language_code: language.sarvam,
          speaker: "anushka",
          pitch: 0,
          pace: 1.0,
          loudness: 1.5,
          speech_sample_rate: 22050,
          enable_preprocessing: true,
          model: "bulbul:v2",
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(err);
      }

      const data = await response.json();
      const base64Audio = data.audios?.[0];

      if (base64Audio) {
        const audioSrc = `data:audio/wav;base64,${base64Audio}`;
        if (audioRef.current) {
          audioRef.current.src = audioSrc;
          audioRef.current.play();
          audioRef.current.onended = () => setSpeaking(false);
        }
      } else {
        setSpeaking(false);
      }
    } catch (err) {
      console.error("TTS error:", err);
      setSpeaking(false);
      // TTS failure is non-critical, don't show error toast
    }
  };

  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setSpeaking(false);
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div style={styles.container}>
      <audio ref={audioRef} style={{ display: "none" }} />

      {/* ── SIDEBAR ── */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarLogo}>🧘 EmoSense</div>
        <nav style={styles.nav}>
          <button style={styles.navItem} onClick={() => navigate("/dashboard")}>
            <span>📊</span><span>Dashboard</span>
          </button>
          <button style={{ ...styles.navItem, ...styles.navItemActive }}>
            <span>💬</span><span>AI Chat</span>
          </button>
        </nav>
        <div style={styles.sidebarFooter}>
          <div style={styles.userInfo}>
            <div style={styles.avatar}>
              {userData?.name?.[0]?.toUpperCase() || "U"}
            </div>
            <div>
              <div style={styles.userName}>{userData?.name || "User"}</div>
              <div style={styles.userEmail}>{user?.email}</div>
            </div>
          </div>
          <button style={styles.logoutBtn} onClick={handleLogout}>Sign Out</button>
        </div>
      </div>

      {/* ── CHAT MAIN ── */}
      <div style={styles.main}>

        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <div style={styles.emoAvatar}>🤖</div>
            <div>
              <div style={styles.headerName}>Emo</div>
              <div style={styles.headerStatus}>
                <span style={styles.statusDot} />
                {loading ? "thinking..." : speaking ? "speaking..." : "online"}
              </div>
            </div>
          </div>

          {/* Language selector */}
          <div style={{ position: "relative" }}>
            <button
              style={styles.langBtn}
              onClick={() => setShowLangMenu((v) => !v)}
            >
              🌐 {language.label} ▾
            </button>
            {showLangMenu && (
              <div style={styles.langMenu}>
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    style={{
                      ...styles.langOption,
                      ...(language.code === l.code ? styles.langOptionActive : {}),
                    }}
                    onClick={() => {
                      setLanguage(l);
                      setShowLangMenu(false);
                      toast.success(`Language set to ${l.label}`);
                    }}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Messages */}
        <div style={styles.messagesWrap}>
          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                ...styles.msgRow,
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              {msg.role === "assistant" && (
                <div style={styles.msgAvatar}>🤖</div>
              )}
              <div
                style={{
                  ...styles.bubble,
                  ...(msg.role === "user" ? styles.bubbleUser : styles.bubbleAssistant),
                }}
              >
                {msg.content}
              </div>
              {msg.role === "user" && (
                <div style={styles.msgAvatarUser}>
                  {userData?.name?.[0]?.toUpperCase() || "U"}
                </div>
              )}
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div style={{ ...styles.msgRow, justifyContent: "flex-start" }}>
              <div style={styles.msgAvatar}>🤖</div>
              <div style={{ ...styles.bubble, ...styles.bubbleAssistant }}>
                <div style={styles.typingDots}>
                  <span /><span /><span />
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input bar */}
        <div style={styles.inputBar}>
          {/* Speaking indicator */}
          {speaking && (
            <button style={styles.speakingBadge} onClick={stopSpeaking}>
              🔊 Speaking... (tap to stop)
            </button>
          )}

          <div style={styles.inputRow}>
            {/* Mic button */}
            <button
              style={{
                ...styles.micBtn,
                ...(recording ? styles.micBtnActive : {}),
              }}
              onClick={toggleRecording}
              disabled={loading}
              title={recording ? "Click to stop recording" : "Click to speak"}
            >
              {recording ? "⏹" : "🎤"}
            </button>

            <textarea
              style={styles.textInput}
              placeholder="Type a message or use the mic..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={loading || recording}
            />

            <button
              style={{
                ...styles.sendBtn,
                opacity: (!input.trim() || loading) ? 0.4 : 1,
              }}
              onClick={handleSend}
              disabled={!input.trim() || loading}
            >
              ➤
            </button>
          </div>

          <div style={styles.hint}>
            Press Enter to send · Shift+Enter for new line · 🌐 {language.label}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes blink {
          0%, 80%, 100% { opacity: 0; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

const styles = {
  container: {
    display: "flex", minHeight: "100vh",
    background: "#0f1117", color: "#fff",
    fontFamily: "sans-serif",
  },
  sidebar: {
    width: "240px",
    background: "rgba(255,255,255,0.03)",
    borderRight: "1px solid rgba(255,255,255,0.07)",
    display: "flex", flexDirection: "column",
    padding: "24px 16px", flexShrink: 0,
  },
  sidebarLogo: {
    fontFamily: "Georgia, serif",
    fontSize: "1.3rem", color: "#fff",
    padding: "8px 12px 32px", fontWeight: "600",
  },
  nav: { display: "flex", flexDirection: "column", gap: "4px", flex: 1 },
  navItem: {
    display: "flex", alignItems: "center", gap: "10px",
    padding: "11px 12px", borderRadius: "10px",
    border: "none", background: "none",
    color: "rgba(255,255,255,0.5)", fontSize: "0.9rem",
    cursor: "pointer", textAlign: "left",
  },
  navItemActive: {
    background: "rgba(63,160,142,0.15)",
    color: "#3fa08e",
  },
  sidebarFooter: {
    borderTop: "1px solid rgba(255,255,255,0.07)",
    paddingTop: "16px",
  },
  userInfo: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" },
  avatar: {
    width: "36px", height: "36px", borderRadius: "50%",
    background: "linear-gradient(135deg, #2d7d6f, #1f6156)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: "700", fontSize: "0.9rem", flexShrink: 0,
  },
  userName: { fontSize: "0.88rem", fontWeight: "600", color: "#fff" },
  userEmail: { fontSize: "0.72rem", color: "rgba(255,255,255,0.4)", marginTop: "2px" },
  logoutBtn: {
    width: "100%", padding: "9px", borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "transparent", color: "rgba(255,255,255,0.5)",
    fontSize: "0.85rem", cursor: "pointer",
  },
  main: {
    flex: 1, display: "flex", flexDirection: "column",
    height: "100vh", overflow: "hidden",
  },
  header: {
    display: "flex", justifyContent: "space-between",
    alignItems: "center", padding: "20px 28px",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
    background: "rgba(255,255,255,0.02)",
    flexShrink: 0,
  },
  headerLeft: { display: "flex", alignItems: "center", gap: "14px" },
  emoAvatar: {
    width: "44px", height: "44px", borderRadius: "50%",
    background: "linear-gradient(135deg, #2d7d6f, #1f6156)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "1.4rem",
  },
  headerName: { fontSize: "1rem", fontWeight: "700", color: "#fff" },
  headerStatus: {
    display: "flex", alignItems: "center", gap: "6px",
    fontSize: "0.78rem", color: "rgba(255,255,255,0.4)",
    marginTop: "2px",
  },
  statusDot: {
    width: "7px", height: "7px", borderRadius: "50%",
    background: "#2ecc71",
    display: "inline-block",
    animation: "pulse 2s infinite",
  },
  langBtn: {
    padding: "8px 16px", borderRadius: "20px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    color: "rgba(255,255,255,0.7)", fontSize: "0.82rem",
    cursor: "pointer",
  },
  langMenu: {
    position: "absolute", right: 0, top: "calc(100% + 8px)",
    background: "#1a1f2e", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "12px", padding: "8px",
    display: "flex", flexDirection: "column", gap: "2px",
    zIndex: 100, minWidth: "140px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  },
  langOption: {
    padding: "9px 14px", borderRadius: "8px",
    border: "none", background: "none",
    color: "rgba(255,255,255,0.6)", fontSize: "0.85rem",
    cursor: "pointer", textAlign: "left",
  },
  langOptionActive: {
    background: "rgba(63,160,142,0.2)", color: "#3fa08e",
  },
  messagesWrap: {
    flex: 1, overflowY: "auto", padding: "24px 28px",
    display: "flex", flexDirection: "column", gap: "16px",
  },
  msgRow: { display: "flex", alignItems: "flex-end", gap: "10px" },
  msgAvatar: {
    width: "32px", height: "32px", borderRadius: "50%",
    background: "linear-gradient(135deg, #2d7d6f, #1f6156)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "1rem", flexShrink: 0,
  },
  msgAvatarUser: {
    width: "32px", height: "32px", borderRadius: "50%",
    background: "linear-gradient(135deg, #2980b9, #1a5276)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: "700", fontSize: "0.82rem", flexShrink: 0,
  },
  bubble: {
    maxWidth: "65%", padding: "12px 16px",
    borderRadius: "18px", fontSize: "0.92rem",
    lineHeight: "1.55",
  },
  bubbleAssistant: {
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.9)",
    borderBottomLeftRadius: "4px",
  },
  bubbleUser: {
    background: "linear-gradient(135deg, #2d7d6f, #1f6156)",
    color: "#fff",
    borderBottomRightRadius: "4px",
  },
  typingDots: {
    display: "flex", gap: "4px", padding: "4px 0",
    "& span": {
      width: "7px", height: "7px", borderRadius: "50%",
      background: "rgba(255,255,255,0.4)",
      animation: "blink 1.4s infinite",
    },
  },
  inputBar: {
    padding: "16px 28px 20px",
    borderTop: "1px solid rgba(255,255,255,0.07)",
    background: "rgba(255,255,255,0.02)",
    flexShrink: 0,
  },
  speakingBadge: {
    display: "block", width: "100%", marginBottom: "10px",
    padding: "8px", borderRadius: "10px",
    border: "1px solid rgba(63,160,142,0.3)",
    background: "rgba(63,160,142,0.1)",
    color: "#3fa08e", fontSize: "0.82rem",
    cursor: "pointer", textAlign: "center",
    animation: "pulse 1.5s infinite",
  },
  inputRow: { display: "flex", gap: "10px", alignItems: "center" },
  micBtn: {
    width: "46px", height: "46px", borderRadius: "50%",
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.07)",
    color: "#fff", fontSize: "1.1rem",
    cursor: "pointer", flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "all 0.2s",
  },
  micBtnActive: {
    background: "#c0392b",
    border: "1px solid #c0392b",
    animation: "pulse 1s infinite",
  },
  textInput: {
    flex: 1, padding: "12px 16px",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff", fontSize: "0.92rem",
    outline: "none", resize: "none",
    fontFamily: "sans-serif", lineHeight: "1.5",
  },
  sendBtn: {
    width: "46px", height: "46px", borderRadius: "50%",
    border: "none",
    background: "linear-gradient(135deg, #2d7d6f, #1f6156)",
    color: "#fff", fontSize: "1.1rem",
    cursor: "pointer", flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "opacity 0.2s",
  },
  hint: {
    marginTop: "8px", fontSize: "0.72rem",
    color: "rgba(255,255,255,0.25)", textAlign: "center",
  },
};

// Inject typing dots CSS since inline styles can't do nth-child
const styleTag = document.createElement("style");
styleTag.textContent = `
  .typing-dots span {
    width: 7px; height: 7px; border-radius: 50%;
    background: rgba(255,255,255,0.4);
    display: inline-block;
    animation: blink 1.4s infinite;
  }
  .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
  .typing-dots span:nth-child(3) { animation-delay: 0.4s; }
`;
document.head.appendChild(styleTag);

export default Chat;