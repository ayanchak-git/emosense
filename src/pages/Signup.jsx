import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth, googleProvider, db } from "../firebase";
import {
  createUserWithEmailAndPassword,
  signInWithPopup,
  sendEmailVerification,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import toast from "react-hot-toast";

function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords don't match!");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(result.user);
      await setDoc(doc(db, "users", result.user.uid), {
        email,
        createdAt: new Date().toISOString(),
        onboardingComplete: false,
      });
      setVerificationSent(true);
      toast.success("Verification email sent! Check your inbox.");
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        toast.error("Email already registered. Please login.");
      } else {
        toast.error("Signup failed. Try again.");
      }
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const userDoc = doc(db, "users", result.user.uid);
      await setDoc(userDoc, {
        email: result.user.email,
        name: result.user.displayName,
        createdAt: new Date().toISOString(),
        onboardingComplete: false,
      }, { merge: true });
      navigate("/onboarding");
      toast.success("Account created!");
    } catch (err) {
      toast.error("Google sign in failed");
    }
    setLoading(false);
  };

  if (verificationSent) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.logo}>📧</div>
          <h2 style={styles.title}>Check your email!</h2>
          <p style={styles.subtitle}>
            We sent a verification link to{" "}
            <strong style={{ color: "#3fa08e" }}>{email}</strong>.
            Click the link in the email then come back and log in.{" "}
          <strong style={{ color: "#f39c12" }}>
             ⚠️ Check your spam/junk folder if you don't see it!
          </strong>
         </p>
          <button
            style={styles.btnPrimary}
            onClick={() => navigate("/login")}
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>🧘</div>
        <h1 style={styles.title}>Create Account</h1>
        <p style={styles.subtitle}>Start your wellness journey today</p>

        <form onSubmit={handleSignup} style={styles.form}>
          <input
            style={styles.input}
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            style={styles.input}
            type="password"
            placeholder="Password (min 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <input
            style={styles.input}
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          <button style={styles.btnPrimary} type="submit" disabled={loading}>
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <div style={styles.divider}>
          <span style={styles.dividerLine}></span>
          <span style={styles.dividerText}>or</span>
          <span style={styles.dividerLine}></span>
        </div>

        <button onClick={handleGoogle} style={styles.btnGoogle} disabled={loading}>
          <img src="https://www.google.com/favicon.ico" width="18" alt="Google" />
          Continue with Google
        </button>

        <p style={styles.switchText}>
          Already have an account?{" "}
          <Link to="/login" style={styles.link}>Sign in</Link>
        </p>
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
    maxWidth: "420px",
    textAlign: "center",
  },
  logo: { fontSize: "3rem", marginBottom: "12px" },
  title: {
    fontFamily: "Georgia, serif",
    fontSize: "2rem",
    color: "#fff",
    margin: "0 0 8px",
  },
  subtitle: { color: "rgba(255,255,255,0.5)", fontSize: "0.9rem", marginBottom: "32px" },
  form: { display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" },
  input: {
    padding: "14px 16px",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.07)",
    color: "#fff",
    fontSize: "0.95rem",
    outline: "none",
  },
  btnPrimary: {
    padding: "14px",
    borderRadius: "12px",
    border: "none",
    background: "linear-gradient(135deg, #2d7d6f, #1f6156)",
    color: "#fff",
    fontSize: "1rem",
    fontWeight: "600",
    cursor: "pointer",
  },
  divider: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    margin: "20px 0",
  },
  dividerLine: {
    flex: 1,
    height: "1px",
    background: "rgba(255,255,255,0.1)",
  },
  dividerText: { color: "rgba(255,255,255,0.4)", fontSize: "0.85rem" },
  btnGoogle: {
    width: "100%",
    padding: "13px",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.07)",
    color: "#fff",
    fontSize: "0.95rem",
    fontWeight: "500",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
  },
  switchText: { color: "rgba(255,255,255,0.5)", fontSize: "0.88rem", marginTop: "24px" },
  link: { color: "#3fa08e", textDecoration: "none", fontWeight: "600" },
};

export default Signup;