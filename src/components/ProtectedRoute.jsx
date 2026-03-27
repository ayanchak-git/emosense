import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function ProtectedRoute({ children }) {
  const { user, userData, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        background: "#0f1117",
        color: "#fff",
        fontSize: "1.2rem"
      }}>
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (user && userData !== null && !userData?.onboardingComplete && window.location.pathname !== "/onboarding") {
  }

  return children;
}

export default ProtectedRoute;