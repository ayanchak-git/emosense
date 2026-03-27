import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { collection, addDoc, query, orderBy, limit, getDocs } from "firebase/firestore";
import { HfInference } from "@huggingface/inference";

const hf = new HfInference(import.meta.env.VITE_HF_API_KEY);
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import toast from "react-hot-toast";

const EMOTION_EMOJI = {
  happy: "😊", sad: "😢", angry: "😠",
  fearful: "😨", surprised: "😲",
  disgusted: "🤢", neutral: "😐",
};

const EMOTION_COLORS = {
  happy: "#2ecc71", sad: "#3498db", angry: "#e74c3c",
  fearful: "#9b59b6", surprised: "#f39c12",
  disgusted: "#27ae60", neutral: "#95a5a6",
};

const EMOTION_TO_SCORE = {
  happy: 8, surprised: 6, neutral: 5,
  disgusted: 4, sad: 3, fearful: 2, angry: 2,
};

function Dashboard() {
  const { user, userData, logout } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState(null);
  const [emotionScores, setEmotionScores] = useState(null);
  const [moodLogs, setMoodLogs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("checkin");
  const [note, setNote] = useState("");
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    fetchMoodLogs();
    return () => stopCamera();
  }, []);

  const fetchMoodLogs = async () => {
    try {
      const q = query(
        collection(db, "moodLogs", user.uid, "logs"),
        orderBy("timestamp", "desc"),
        limit(30)
      );
      const snap = await getDocs(q);
      const logs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMoodLogs(logs);
    } catch (err) {
      console.log("No logs yet");
    }
  };

  // ── START CAMERA ──
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraOn(true);
      setCurrentEmotion(null);
      setEmotionScores(null);
      setSnapshot(null);
      toast.success("Camera started! Position your face and click Scan.");
    } catch (err) {
      toast.error("Camera access denied. Please allow camera access.");
    }
  };

  // ── STOP CAMERA ──
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOn(false);
  };

  // ── CAPTURE + ANALYZE ──
  const scanEmotion = async () => {
    if (!videoRef.current || !cameraOn) {
      toast.error("Please start the camera first");
      return;
    }
    setScanning(true);
    setCurrentEmotion(null);
    setEmotionScores(null);

    try {
      // Take snapshot from video
      const canvas = canvasRef.current;
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(videoRef.current, 0, 0);

      // Save snapshot preview
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      setSnapshot(dataUrl);

      // ✅ FIXED: Properly convert canvas to Blob and send as binary
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9)
      );

      toast.loading("🤖 Analyzing your expression...", { id: "scan" });

      // Send to Hugging Face via SDK (fixes CORS)
      const results = await hf.imageClassification({
        model: "trpakov/vit-face-expression",
        data: blob,
      });

      toast.dismiss("scan");

      if (!Array.isArray(results) || results.length === 0) {
        throw new Error("No results returned. Make sure your face is visible and well lit.");
      }

      // Sort by score
      const sorted = [...results].sort((a, b) => b.score - a.score);
      const top = sorted[0];

      // Normalize label
      const labelMap = {
        angry: "angry", disgust: "disgusted", disgusted: "disgusted",
        fear: "fearful", fearful: "fearful", happy: "happy",
        neutral: "neutral", sad: "sad",
        surprised: "surprised", surprise: "surprised",
      };
      const emotion = labelMap[top.label.toLowerCase()] || top.label.toLowerCase();

      setCurrentEmotion(emotion);
      setEmotionScores(sorted.map((r) => ({
        emotion: labelMap[r.label.toLowerCase()] || r.label.toLowerCase(),
        score: r.score,
      })));

      stopCamera();
      toast.success(`Detected: ${emotion} ${EMOTION_EMOJI[emotion] || ""}`, { duration: 3000 });

    } catch (err) {
      console.error("Scan error:", err);
      toast.dismiss("scan");
      toast.error("Scan failed: " + err.message, { duration: 5000 });
    }

    setScanning(false);
  };

  // ── SAVE CHECK-IN ──
  const saveCheckin = async () => {
    if (!currentEmotion) {
      toast.error("No emotion detected yet. Click Scan first!");
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, "moodLogs", user.uid, "logs"), {
        emotion: currentEmotion,
        scores: emotionScores || [],
        note: note || "",
        timestamp: new Date().toISOString(),
        date: new Date().toLocaleDateString("en-IN"),
      });
      toast.success("Check-in saved! 🎉");
      setNote("");
      setCurrentEmotion(null);
      setEmotionScores(null);
      setSnapshot(null);
      fetchMoodLogs();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save: " + err.message);
    }
    setSaving(false);
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  // ── CHART DATA ──
  const chartData = [...moodLogs].reverse().slice(-7).map((log) => ({
    date: log.date,
    mood: EMOTION_TO_SCORE[log.emotion] || 5,
    emotion: log.emotion,
  }));

  const pieData = Object.entries(
    moodLogs.reduce((acc, log) => {
      acc[log.emotion] = (acc[log.emotion] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div style={styles.container}>

      {/* ── SIDEBAR ── */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarLogo}>🧘 EmoSense</div>
        <nav style={styles.nav}>
          {[
            { id: "checkin", icon: "📸", label: "Check In" },
            { id: "analytics", icon: "📊", label: "Analytics" },
            { id: "logs", icon: "📋", label: "Mood Logs" },
          ].map((item) => (
            <button
              key={item.id}
              style={{
                ...styles.navItem,
                ...(activeTab === item.id ? styles.navItemActive : {}),
              }}
              onClick={() => setActiveTab(item.id)}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
          <button
            style={styles.navItem}
            onClick={() => navigate("/chat")}
          >
            <span>💬</span>
            <span>AI Chat</span>
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
          <button style={styles.logoutBtn} onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </div>

      {/* ── MAIN ── */}
      <div style={styles.main}>

        {/* Header */}
        <div style={styles.header}>
          <div>
            <h1 style={styles.headerTitle}>
              {greeting()}, {userData?.name?.split(" ")[0] || "there"} 👋
            </h1>
            <p style={styles.headerSub}>
              {new Date().toLocaleDateString("en-IN", {
                weekday: "long", year: "numeric",
                month: "long", day: "numeric",
              })}
            </p>
          </div>
          <div style={styles.statsBadge}>
            📊 {moodLogs.length} check-ins total
          </div>
        </div>

        {/* ── CHECK IN TAB ── */}
        {activeTab === "checkin" && (
          <div style={styles.grid2}>

            {/* Camera Card */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>📸 Emotion Scan</h3>
              <div style={styles.cameraWrap}>
                <video
                  ref={videoRef}
                  style={{
                    ...styles.video,
                    display: cameraOn ? "block" : "none",
                  }}
                  muted
                  playsInline
                />
                <canvas ref={canvasRef} style={{ display: "none" }} />

                {/* Snapshot preview */}
                {snapshot && !cameraOn && (
                  <img
                    src={snapshot}
                    alt="snapshot"
                    style={styles.snapshot}
                  />
                )}

                {!cameraOn && !snapshot && (
                  <div style={styles.cameraPlaceholder}>
                    <span style={{ fontSize: "3rem" }}>📷</span>
                    <p style={{ color: "rgba(255,255,255,0.4)", marginTop: "8px", fontSize: "0.85rem" }}>
                      Camera not started
                    </p>
                  </div>
                )}
              </div>

              <div style={styles.cameraControls}>
                {!cameraOn ? (
                  <button style={styles.btnGreen} onClick={startCamera}>
                    ▶ Start Camera
                  </button>
                ) : (
                  <>
                    <button
                      style={{ ...styles.btnBlue, opacity: scanning ? 0.6 : 1 }}
                      onClick={scanEmotion}
                      disabled={scanning}
                    >
                      {scanning ? "⏳ Analyzing..." : "🔍 Scan Emotion"}
                    </button>
                    <button style={styles.btnRed} onClick={stopCamera}>
                      ■ Stop
                    </button>
                  </>
                )}
              </div>

              {scanning && (
                <div style={styles.scanningMsg}>
                  🤖 AI is analyzing your expression...
                </div>
              )}

              {/* Tips */}
              <div style={styles.tips}>
                💡 <strong>Tips:</strong> Good lighting, face the camera directly, neutral background
              </div>
            </div>

            {/* Result Card */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>🎯 Result</h3>

              {!currentEmotion && (
                <div style={styles.noDetection}>
                  <p style={{ color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
                    Start camera and click<br />
                    "Scan Emotion" to analyze<br />
                    your facial expression
                  </p>
                </div>
              )}

              {currentEmotion && (
                <div>
                  <div style={styles.emotionBig}>
                    <div style={{ fontSize: "4rem" }}>
                      {EMOTION_EMOJI[currentEmotion]}
                    </div>
                    <div style={{
                      fontSize: "1.8rem",
                      fontWeight: "700",
                      color: EMOTION_COLORS[currentEmotion],
                      textTransform: "capitalize",
                      marginTop: "8px",
                    }}>
                      {currentEmotion}
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.82rem", marginTop: "4px" }}>
                      Confidence: {emotionScores ? (emotionScores[0].score * 100).toFixed(1) : 0}%
                    </div>
                  </div>

                  {emotionScores && (
                    <div style={{ marginTop: "12px" }}>
                      {emotionScores.map((item) => (
                        <div key={item.emotion} style={styles.barRow}>
                          <span style={styles.barLabel}>
                            {EMOTION_EMOJI[item.emotion]} {item.emotion}
                          </span>
                          <div style={styles.barTrack}>
                            <div style={{
                              ...styles.barFill,
                              width: `${(item.score * 100).toFixed(0)}%`,
                              background: EMOTION_COLORS[item.emotion] || "#ccc",
                            }} />
                          </div>
                          <span style={styles.barPct}>
                            {(item.score * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <textarea
                    style={styles.noteInput}
                    placeholder="Add a note... (optional)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                  />

                  <button
                    style={{ ...styles.btnPrimary, opacity: saving ? 0.6 : 1 }}
                    onClick={saveCheckin}
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "💾 Save Check-In"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ANALYTICS TAB ── */}
        {activeTab === "analytics" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {moodLogs.length === 0 ? (
              <div style={styles.emptyState}>
                <div style={{ fontSize: "3rem" }}>📊</div>
                <p style={{ color: "rgba(255,255,255,0.5)", marginTop: "12px" }}>
                  No data yet. Do your first check-in!
                </p>
              </div>
            ) : (
              <>
                <div style={styles.card}>
                  <h3 style={styles.cardTitle}>📈 Mood Trend (Last 7 days)</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={chartData}>
                      <XAxis dataKey="date" stroke="rgba(255,255,255,0.2)" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
                      <YAxis domain={[0, 10]} stroke="rgba(255,255,255,0.2)" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ background: "#1a1f2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }}
                        labelStyle={{ color: "#fff" }}
                      />
                      <Line type="monotone" dataKey="mood" stroke="#3fa08e" strokeWidth={2.5} dot={{ fill: "#3fa08e", r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div style={styles.card}>
                  <h3 style={styles.cardTitle}>🥧 Emotion Distribution</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={({ name, percent }) =>
                          `${EMOTION_EMOJI[name] || ""} ${name} ${(percent * 100).toFixed(0)}%`
                        }
                      >
                        {pieData.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={EMOTION_COLORS[entry.name] || "#ccc"}
                          />
                        ))}
                      </Pie>
                      <Legend />
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── LOGS TAB ── */}
        {activeTab === "logs" && (
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>📋 Mood History</h3>
            {moodLogs.length === 0 ? (
              <p style={{ color: "rgba(255,255,255,0.4)", textAlign: "center", padding: "40px" }}>
                No check-ins yet!
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      {["Date", "Emotion", "Confidence", "Note"].map((h) => (
                        <th key={h} style={styles.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {moodLogs.map((log) => (
                      <tr key={log.id}>
                        <td style={styles.td}>{log.date}</td>
                        <td style={styles.td}>
                          <span style={{
                            ...styles.emotionTag,
                            background: `${EMOTION_COLORS[log.emotion]}22`,
                            color: EMOTION_COLORS[log.emotion],
                            border: `1px solid ${EMOTION_COLORS[log.emotion]}44`,
                          }}>
                            {EMOTION_EMOJI[log.emotion]} {log.emotion}
                          </span>
                        </td>
                        <td style={styles.td}>
                          {log.scores?.[0]?.score
                            ? `${(log.scores[0].score * 100).toFixed(1)}%`
                            : "—"}
                        </td>
                        <td style={styles.td}>
                          {log.note || <span style={{ color: "rgba(255,255,255,0.3)" }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
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
  userInfo: {
    display: "flex", alignItems: "center",
    gap: "10px", marginBottom: "12px",
  },
  avatar: {
    width: "36px", height: "36px", borderRadius: "50%",
    background: "linear-gradient(135deg, #2d7d6f, #1f6156)",
    display: "flex", alignItems: "center",
    justifyContent: "center", fontWeight: "700",
    fontSize: "0.9rem", flexShrink: 0,
  },
  userName: { fontSize: "0.88rem", fontWeight: "600", color: "#fff" },
  userEmail: { fontSize: "0.72rem", color: "rgba(255,255,255,0.4)", marginTop: "2px" },
  logoutBtn: {
    width: "100%", padding: "9px", borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "transparent", color: "rgba(255,255,255,0.5)",
    fontSize: "0.85rem", cursor: "pointer",
  },
  main: { flex: 1, overflow: "auto", padding: "32px" },
  header: {
    display: "flex", justifyContent: "space-between",
    alignItems: "flex-start", marginBottom: "28px",
  },
  headerTitle: {
    fontFamily: "Georgia, serif",
    fontSize: "1.8rem", color: "#fff", margin: "0 0 4px",
  },
  headerSub: { color: "rgba(255,255,255,0.4)", fontSize: "0.88rem", margin: 0 },
  statsBadge: {
    padding: "8px 16px", borderRadius: "20px",
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.1)",
    fontSize: "0.82rem", color: "rgba(255,255,255,0.6)",
  },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" },
  card: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "16px", padding: "24px",
    marginBottom: "20px",
  },
  cardTitle: {
    fontFamily: "Georgia, serif",
    fontSize: "1rem", color: "#fff", margin: "0 0 16px",
  },
  cameraWrap: {
    position: "relative", background: "#000",
    borderRadius: "12px", overflow: "hidden",
    aspectRatio: "4/3",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  video: { width: "100%", height: "100%", objectFit: "cover" },
  snapshot: { width: "100%", height: "100%", objectFit: "cover" },
  cameraPlaceholder: {
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
  },
  cameraControls: { display: "flex", gap: "10px", marginTop: "12px" },
  btnGreen: {
    flex: 1, padding: "11px", borderRadius: "10px",
    border: "none", background: "#2d7d6f",
    color: "#fff", cursor: "pointer", fontWeight: "600",
  },
  btnBlue: {
    flex: 1, padding: "11px", borderRadius: "10px",
    border: "none", background: "#2980b9",
    color: "#fff", cursor: "pointer", fontWeight: "600",
  },
  btnRed: {
    padding: "11px 16px", borderRadius: "10px",
    border: "none", background: "#c0392b",
    color: "#fff", cursor: "pointer", fontWeight: "600",
  },
  scanningMsg: {
    textAlign: "center", marginTop: "10px",
    color: "#3fa08e", fontSize: "0.85rem",
  },
  tips: {
    marginTop: "12px", padding: "10px 14px",
    borderRadius: "10px", background: "rgba(63,160,142,0.08)",
    border: "1px solid rgba(63,160,142,0.15)",
    color: "rgba(255,255,255,0.5)", fontSize: "0.78rem",
    lineHeight: "1.5",
  },
  emotionBig: { textAlign: "center", padding: "16px 0 12px" },
  barRow: {
    display: "flex", alignItems: "center",
    gap: "8px", marginBottom: "8px",
  },
  barLabel: {
    width: "95px", fontSize: "0.78rem",
    color: "rgba(255,255,255,0.6)", textTransform: "capitalize",
  },
  barTrack: {
    flex: 1, height: "6px",
    background: "rgba(255,255,255,0.1)",
    borderRadius: "3px", overflow: "hidden",
  },
  barFill: {
    height: "100%", borderRadius: "3px",
    transition: "width 0.4s ease",
  },
  barPct: {
    width: "32px", fontSize: "0.75rem",
    color: "rgba(255,255,255,0.4)", textAlign: "right",
  },
  noteInput: {
    width: "100%", marginTop: "16px", padding: "12px",
    borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.05)", color: "#fff",
    fontSize: "0.88rem", resize: "none", outline: "none",
    boxSizing: "border-box",
  },
  btnPrimary: {
    width: "100%", marginTop: "12px", padding: "13px",
    borderRadius: "12px", border: "none",
    background: "linear-gradient(135deg, #2d7d6f, #1f6156)",
    color: "#fff", fontSize: "0.95rem",
    fontWeight: "600", cursor: "pointer",
  },
  noDetection: {
    display: "flex", alignItems: "center",
    justifyContent: "center", minHeight: "200px",
  },
  emptyState: {
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    minHeight: "300px", textAlign: "center",
  },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    textAlign: "left", padding: "10px 12px",
    color: "rgba(255,255,255,0.4)", fontSize: "0.78rem",
    fontWeight: "600", textTransform: "uppercase",
    letterSpacing: "0.07em",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
  },
  td: {
    padding: "12px", fontSize: "0.88rem",
    color: "rgba(255,255,255,0.7)",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
  },
  emotionTag: {
    display: "inline-block", padding: "4px 10px",
    borderRadius: "20px", fontSize: "0.8rem",
    fontWeight: "500", textTransform: "capitalize",
  },
};

export default Dashboard;