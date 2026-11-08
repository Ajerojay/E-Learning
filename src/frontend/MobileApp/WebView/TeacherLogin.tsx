import { useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, LogIn } from "lucide-react";
import "./AppAuth.css";
import logo from "../../../../images/learnease logo-no bg.png";
import { supabase } from "../../../backend/supabase";
import { cacheVerifiedLogin } from "../../../backend/offlineAuth";
import BearLoading from "../BearLoading";

const TEACHER_USERNAME = "teacher";
const TEACHER_PASSWORD = "teacher123";

export default function TeacherLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const finishTeacherLogin = async (teacherUser: Record<string, unknown>, cleanUsername: string, cleanPassword: string) => {
    localStorage.setItem("user", JSON.stringify(teacherUser));
    await cacheVerifiedLogin(cleanUsername, cleanPassword, teacherUser as { role: "teacher" });
    navigate("/teacher-dashboard");
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const cleanUsername = username.trim();
    const cleanPassword = password.trim();
    if (!cleanUsername || !cleanPassword) {
      setError("Please enter your faculty username and password.");
      return;
    }

    try {
      flushSync(() => setLoading(true));

      if (cleanUsername.toLowerCase() === TEACHER_USERNAME && cleanPassword === TEACHER_PASSWORD) {
        await finishTeacherLogin(
          { role: "teacher", id: "temporary-teacher", username: cleanUsername, source: "web" },
          cleanUsername,
          cleanPassword,
        );
        return;
      }

      const { data: teacherRows, error: teacherError } = await supabase.rpc(
        "authenticate_teacher",
        { p_username: cleanUsername, p_password: cleanPassword },
      );
      if (teacherError) console.error("Teacher login error:", teacherError.message);
      const teacher = Array.isArray(teacherRows) ? teacherRows[0] : teacherRows;
      if (teacher) {
        await finishTeacherLogin(
          { ...teacher, role: "teacher", source: "web" },
          cleanUsername,
          cleanPassword,
        );
        return;
      }

      setError("Those faculty details were not recognized. Use your teacher username and password.");
    } catch (caught) {
      console.error(caught);
      setError("Something went wrong while signing in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="app-auth-shell">
      {loading && <BearLoading overlay />}
      <section className="app-auth-phone" aria-label="LearnEase teacher sign in">
        <header className="app-auth-top">
          <img className="app-auth-logo" src={logo} alt="LearnEase" />
          <div className="app-auth-brand">
            <span className="app-auth-name">LearnEase</span>
          </div>
        </header>

        <div className="app-auth-panel">
          <h1 className="app-auth-title app-auth-welcome">WELCOME TEACHER!</h1>
          <p className="app-auth-copy app-auth-tagline">Classroom tools for your learners</p>

          <form className="app-auth-form" onSubmit={handleLogin}>
            {error && <p className="app-auth-alert">{error}</p>}

            <div className="app-auth-field">
              <label htmlFor="teacher-signin-username">Username</label>
              <input
                id="teacher-signin-username"
                className="app-auth-input"
                type="text"
                autoComplete="username"
                placeholder="Enter faculty username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>

            <div className="app-auth-field">
              <label htmlFor="teacher-signin-password">Password</label>
              <div className="app-auth-input-wrap">
                <input
                  id="teacher-signin-password"
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

            <button className="app-auth-main-btn" type="submit" disabled={loading}>
              <LogIn size={19} />
              {loading ? "Please wait..." : "Sign in"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
