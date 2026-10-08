import { useState } from "react";
import { flushSync } from "react-dom";
import { IoEyeOutline, IoEyeOffOutline } from "react-icons/io5";
import "./ParentLogin.css";
import { useNavigate } from "react-router-dom";
import bear from "../../../../images/learnease logo-no bg.png";
import { supabase } from "../../../lib/supabase";
import { signInParentAccount } from "../../../lib/supabaseAuth";
import BearLoading from "../../BearLoading";

const TEACHER_USERNAME = "teacher";
const TEACHER_PASSWORD = "teacher123";

export default function ParentLogin() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const user = username.trim();
    const pass = password.trim();

    if (!user || !pass) {
      setError("Please enter your username or email, and your password.");
      return;
    }

    if (user === TEACHER_USERNAME && pass === TEACHER_PASSWORD) {
      localStorage.setItem(
        "user",
        JSON.stringify({ role: "teacher", id: "temporary-teacher", username: user })
      );
      navigate("/teacher-dashboard");
      return;
    }

    try {
      flushSync(() => setLoading(true));

      const teacherLookup = supabase.rpc(
        "authenticate_teacher",
        { p_username: user, p_password: pass }
      );
      let data;
      let parentError: string | null = null;
      try {
        data = await signInParentAccount(user, pass);
      } catch (loginError) {
        parentError = loginError instanceof Error ? loginError.message : "Something went wrong while logging in.";
      }

      const { data: teacherRows, error: teacherError } = await teacherLookup;
      if (teacherError) console.error("Teacher login error:", teacherError.message);
      const teacher = Array.isArray(teacherRows) ? teacherRows[0] : teacherRows;
      if (teacher) {
        localStorage.setItem(
          "user",
          JSON.stringify({ ...teacher, role: "teacher", source: "mobile-app" })
        );
        navigate("/teacher-dashboard");
        return;
      }

      if (!data) {
        setError(parentError || "Something went wrong while logging in.");
        return;
      }

      localStorage.setItem(
        "user",
        JSON.stringify({
          role: "parent",
          id: data.id,
          username: data.username,
        })
      );
      console.debug("ParentLogin: logged-in parent", { id: data.id, username: data.username });
      navigate("/parent-dashboard");
    } catch (err) {
      console.error(err);
      setError("Something went wrong while logging in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="le-page">
      {loading && <BearLoading overlay />}
      {/* LEFT */}
      <aside className="le-left">
        <div className="le-brandText">
          <div className="le-brandTop">LearnEase</div>
          <div className="le-brandBottom">Kids</div>
        </div>

        <div className="le-bearWrap">
          <img className="le-bear" src={bear} alt="LearnEase Kids logo" />
        </div>
      </aside>

      {/* RIGHT */}
      <main className="le-right">
        <div className="le-card">
          <h1 className="le-title">WELCOME PARENT!</h1>
          <p className="le-subtitle">Learning made fun and easy!</p>


          <form className="le-form" onSubmit={handleLogin}>
            {/* USERNAME */}
            <label className="le-row">
              <span className="le-label">Username or email:</span>
              <input
                className="le-input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username or email"
                autoComplete="username"
              />
            </label>

            {/* PASSWORD */}
            <label className="le-row">
              <span className="le-label">Password:</span>

              <div className="le-inputWrap">
                <input
                  className="le-input"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                />

                <button
                  type="button"
                  className="le-showPwd"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <IoEyeOffOutline /> : <IoEyeOutline />}
                </button>
              </div>
            </label>

            {/* BUTTONS */}
            <div className="le-actions">
              <button className="le-btn" type="submit" disabled={loading}>
                {loading ? "LOGGING IN..." : "LOGIN"}
              </button>

              <button
                type="button"
                className="le-btn"
                onClick={() => navigate("/student-access")}
              >
                Enter PIN for Kids
              </button>
            </div>

            {/* ERROR */}
            {error && <p className="le-error">{error}</p>}

            {/* LINKS */}
            <div className="le-links">
              <span className="le-linkText">
                New Parent?{" "}
                <a className="le-linkBlue" href="/signup">
                  Create Account
                </a>
              </span>

              <a className="le-linkRed" href="#">
                Forgot Password?
              </a>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

