import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, KeyRound, LogIn } from "lucide-react";
import "./AppAuth.css";
import logo from "../../../images/learnease logo-no bg.png";
// ===== SUPABASE DATABASE CONNECTION (same client used by the web app) =====
import { supabase } from "../../lib/supabase";
import { getOrCreateActiveChildId } from "../../lib/childProgress";
import { authenticateOffline, cacheVerifiedLogin } from "../../lib/offlineAuth";

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";
export default function AppSignIn() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const cleanUsername = username.trim();
    const cleanPassword = password.trim();

    if (!cleanUsername || !cleanPassword) {
      setError("Please enter both username and password.");
      return;
    }

    if (cleanUsername === ADMIN_USERNAME && cleanPassword === ADMIN_PASSWORD) {
      localStorage.setItem("user", JSON.stringify({ role: "admin" }));
      navigate("/admin");
      return;
    }

    const finishOfflineLogin = async () => {
      const cached = await authenticateOffline(cleanUsername, cleanPassword);
      if (!cached) {
        setError("Offline login is unavailable. Sign in once online on this device first.");
        return false;
      }
      localStorage.setItem("user", JSON.stringify(cached));
      navigate(cached.role === "teacher" ? "/teacher-dashboard" : "/parent-dashboard");
      return true;
    };

    try {
      setLoading(true);
      if (!navigator.onLine) { await finishOfflineLogin(); return; }
      const { data: teacherRows, error: teacherError } = await supabase.rpc(
        "authenticate_teacher",
        { p_username: cleanUsername, p_password: cleanPassword }
      );

      if (teacherError) {
        console.error("Teacher login error:", teacherError.message);
      }

      const teacher = Array.isArray(teacherRows) ? teacherRows[0] : teacherRows;
      if (teacher) {
        const teacherUser = { ...teacher, role: "teacher" as const, source: "mobile-app" };
        localStorage.setItem(
          "user",
          JSON.stringify(teacherUser)
        );
        await cacheVerifiedLogin(cleanUsername, cleanPassword, teacherUser);
        navigate("/teacher-dashboard");
        return;
      }

      // ===== SUPABASE DATABASE: VERIFY PARENT USERNAME AND PASSWORD =====
      const { data, error: loginError } = await supabase
        .from("parents_accounts")
        .select("*")
        .eq("username", cleanUsername)
        .eq("password", cleanPassword)
        .maybeSingle();

      if (loginError) {
        console.error("App login error:", loginError.message);
        await finishOfflineLogin();
        return;
      }

      if (!data) {
        setError("Invalid credentials.");
        return;
      }

      const parentUser = {
          role: "parent",
          id: data.id,
          username: data.username,
          source: "mobile-app",
        } as const;
      localStorage.setItem("user", JSON.stringify(parentUser));
      await cacheVerifiedLogin(cleanUsername, cleanPassword, parentUser);

      // ===== SUPABASE DATABASE: LOAD THE PARENT'S ACTIVE CHILD AND PIN =====
      const { data: childData, error: childError } = await supabase
        .from("children_accounts")
        .select("id, pin_code")
        .eq("parent_id", data.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (childError) {
        console.error("App child lookup error:", childError.message);
      }

      if (childData?.id) {
        localStorage.setItem("activeChildId", childData.id);
        if (childData.pin_code) {
          localStorage.setItem("studentPin", childData.pin_code);
        }
      }

      await getOrCreateActiveChildId();
      navigate("/parent-dashboard");
    } catch (caughtError) {
      console.error(caughtError);
      await finishOfflineLogin();
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="app-auth-shell">
      <section className="app-auth-phone" aria-label="LearnEase mobile app sign in">
        <header className="app-auth-top">
          <img className="app-auth-logo" src={logo} alt="LearnEase Kids" />
          <div className="app-auth-brand">
            <span className="app-auth-name">LearnEase</span>
            <span className="app-auth-label">Mobile app</span>
          </div>
        </header>

        <div className="app-auth-panel">
          <h1 className="app-auth-title">Sign in</h1>
          <p className="app-auth-copy">
            Parent and teacher access for lessons, progress, and classroom management.
          </p>

          <form className="app-auth-form" onSubmit={handleLogin}>
            <div className="app-auth-field">
              <label htmlFor="app-signin-username">Username</label>
              <input
                id="app-signin-username"
                className="app-auth-input"
                type="text"
                autoComplete="username"
                placeholder="Enter username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>

            <div className="app-auth-field">
              <label htmlFor="app-signin-password">Password</label>
              <div className="app-auth-input-wrap">
                <input
                  id="app-signin-password"
                  className="app-auth-input"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  className="app-auth-icon-btn"
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {error && <p className="app-auth-alert">{error}</p>}

            <button className="app-auth-main-btn" type="submit" disabled={loading}>
              <LogIn size={19} />
              {loading ? "Signing in..." : "Sign in"}
            </button>

            <button
              className="app-auth-secondary-btn"
              type="button"
              onClick={() => navigate("/student-access")}
            >
              <KeyRound size={19} />
              Enter kids PIN
            </button>

            <p className="app-auth-link-line">
              New parent? <Link to="/app/signup">Create app account</Link>
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}
