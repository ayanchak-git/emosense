import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";

const questions = [
  {
    id: "q1",
    question: "Over the last 2 weeks, how often have you felt down or hopeless?",
    options: ["Never", "Sometimes", "Often", "Always"],
  },
  {
    id: "q2",
    question: "How would you rate your stress levels lately?",
    type: "scale",
    min: 1,
    max: 10,
  },
  {
    id: "q3",
    question: "How many hours of sleep do you get on average?",
    options: ["Less than 5hrs", "5-6 hrs", "6-7 hrs", "7-8 hrs", "More than 8hrs"],
  },
  {
    id: "q4",
    question: "Do you have someone you can talk to when you feel low?",
    options: ["Yes always", "Sometimes", "Rarely", "No"],
  },
  {
    id: "q5",
    question: "How often do you feel anxious or worried?",
    options: ["Never", "Sometimes", "Often", "Always"],
  },
];

function Onboarding() {
  const [step, setStep] = useState(0); // 0 = personal info, 1-5 = questions
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(false);
  const { user, refreshUserData } = useAuth();
  const navigate = useNavigate();

  const handlePersonalNext = (e) => {
    e.preventDefault();
    if (!name || !age || !gender) {
      toast.error("Please fill all fields");
      return;
    }
    setStep(1);
  };

  const handleAnswer = (questionId, answer) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

  const handleNext = () => {
    const currentQ = questions[step - 1];
    if (!answers[currentQ.id]) {
      toast.error("Please answer the question");
      return;
    }
    if (step < questions.length) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await setDoc(doc(db, "users", user.uid), {
        name,
        age: parseInt(age),
        gender,
        answers,
        onboardingComplete: true,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      await refreshUserData();
       toast.success("Welcome to EmoSense! 🎉");
      navigate("/dashboard");
    } catch (err) {
      console.error("Firestore error:", err);
      toast.error("Error: " + err.message);
      alert("Full error: " + JSON.stringify(err));
    } finally {
      setLoading(false);
    }
  };

  const progress = step === 0 ? 0 : (step / (questions.length + 1)) * 100;

  return (
    <div style={styles.container}>
      <div style={styles.card}>

        {/* Progress bar */}
        <div style={styles.progressBar}>
          <div style={{ ...styles.progressFill, width: `${progress}%` }} />
        </div>

        {/* Step 0 — Personal Info */}
        {step === 0 && (
          <form onSubmit={handlePersonalNext}>
            <div style={styles.emoji}>👋</div>
            <h2 style={styles.title}>Let's get to know you</h2>
            <p style={styles.subtitle}>This helps us personalize your experience</p>

            <div style={styles.formGroup}>
              <label style={styles.label}>Your Name</label>
              <input
                style={styles.input}
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Age</label>
              <input
                style={styles.input}
                type="number"
                placeholder="Enter your age"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                min="10"
                max="100"
                required
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Gender</label>
              <div style={styles.optionGrid}>
                {["Male", "Female", "Non-binary", "Prefer not to say"].map((g) => (
                  <button
                    key={g}
                    type="button"
                    style={{
                      ...styles.optionBtn,
                      ...(gender === g ? styles.optionBtnActive : {}),
                    }}
                    onClick={() => setGender(g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" style={styles.btnPrimary}>
              Continue →
            </button>
          </form>
        )}

        {/* Steps 1-5 — Questions */}
        {step > 0 && step <= questions.length && (
          <div>
            <div style={styles.stepIndicator}>
              Question {step} of {questions.length}
            </div>
            <div style={styles.emoji}>🧠</div>
            <h2 style={styles.title}>{questions[step - 1].question}</h2>

            {questions[step - 1].type === "scale" ? (
              <div style={styles.scaleWrap}>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={answers[questions[step - 1].id] || 5}
                  onChange={(e) => handleAnswer(questions[step - 1].id, e.target.value)}
                  style={styles.slider}
                />
                <div style={styles.scaleLabels}>
                  <span>1 - Very Low</span>
                  <span style={{ color: "#3fa08e", fontSize: "1.5rem", fontWeight: "700" }}>
                    {answers[questions[step - 1].id] || 5}
                  </span>
                  <span>10 - Very High</span>
                </div>
              </div>
            ) : (
              <div style={styles.optionGrid}>
                {questions[step - 1].options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    style={{
                      ...styles.optionBtn,
                      ...(answers[questions[step - 1].id] === opt ? styles.optionBtnActive : {}),
                    }}
                    onClick={() => handleAnswer(questions[step - 1].id, opt)}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            <div style={styles.btnRow}>
              {step > 1 && (
                <button
                  style={styles.btnSecondary}
                  onClick={() => setStep(step - 1)}
                >
                  ← Back
                </button>
              )}
              <button
                style={styles.btnPrimary}
                onClick={handleNext}
                disabled={loading}
              >
                {step === questions.length
                  ? loading ? "Saving..." : "Finish ✓"
                  : "Next →"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0f1117 0%, #1a1f2e 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
  },
  card: {
    background: "rgba(255,255,255,0.05)",
    backdropFilter: "blur(20px)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "24px",
    padding: "48px 40px",
    width: "100%",
    maxWidth: "480px",
  },
  progressBar: {
    height: "4px",
    background: "rgba(255,255,255,0.1)",
    borderRadius: "2px",
    marginBottom: "32px",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "linear-gradient(90deg, #2d7d6f, #3fa08e)",
    borderRadius: "2px",
    transition: "width 0.3s ease",
  },
  emoji: { fontSize: "2.5rem", textAlign: "center", marginBottom: "12px" },
  title: {
    fontFamily: "Georgia, serif",
    fontSize: "1.4rem",
    color: "#fff",
    textAlign: "center",
    margin: "0 0 8px",
    lineHeight: "1.4",
  },
  subtitle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: "0.9rem",
    textAlign: "center",
    marginBottom: "28px",
  },
  stepIndicator: {
    color: "#3fa08e",
    fontSize: "0.82rem",
    fontWeight: "600",
    textAlign: "center",
    marginBottom: "16px",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
  },
  formGroup: { marginBottom: "16px" },
  label: {
    display: "block",
    color: "rgba(255,255,255,0.6)",
    fontSize: "0.82rem",
    fontWeight: "600",
    marginBottom: "6px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  input: {
    width: "100%",
    padding: "13px 16px",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.07)",
    color: "#fff",
    fontSize: "0.95rem",
    outline: "none",
    boxSizing: "border-box",
  },
  optionGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
    margin: "20px 0 28px",
  },
  optionBtn: {
    padding: "12px",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.05)",
    color: "rgba(255,255,255,0.7)",
    fontSize: "0.88rem",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  optionBtnActive: {
    border: "1px solid #3fa08e",
    background: "rgba(63,160,142,0.2)",
    color: "#fff",
  },
  scaleWrap: { margin: "24px 0 32px" },
  slider: { width: "100%", accentColor: "#3fa08e" },
  scaleLabels: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "8px",
    color: "rgba(255,255,255,0.5)",
    fontSize: "0.8rem",
  },
  btnRow: {
    display: "flex",
    gap: "12px",
    marginTop: "8px",
  },
  btnPrimary: {
    flex: 1,
    padding: "14px",
    borderRadius: "12px",
    border: "none",
    background: "linear-gradient(135deg, #2d7d6f, #1f6156)",
    color: "#fff",
    fontSize: "1rem",
    fontWeight: "600",
    cursor: "pointer",
  },
  btnSecondary: {
    padding: "14px 20px",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.15)",
    background: "transparent",
    color: "rgba(255,255,255,0.7)",
    fontSize: "1rem",
    cursor: "pointer",
  },
};

export default Onboarding;
