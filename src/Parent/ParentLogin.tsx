import { useState } from "react";
import { IoEyeOutline, IoEyeOffOutline } from "react-icons/io5";
import "./ParentLogin.css";
import { useNavigate } from "react-router-dom";
import bear from "../../images/learnease logo-no bg.png";

const TEMP_USERNAME = "parent";
const TEMP_PASSWORD = "Parent123!";

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";

export default function ParentLogin() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const user = username.trim();
    const pass = password.trim();

    if (!user || !pass) {
      setError("Please enter both username and password.");
      return;
    }

    if (user === ADMIN_USERNAME && pass === ADMIN_PASSWORD) {
      localStorage.setItem("user", JSON.stringify({ role: "admin" }));
      navigate("/admin");
      return;
    }

    if (user === TEMP_USERNAME && pass === TEMP_PASSWORD) {
      localStorage.setItem("user", JSON.stringify({ role: "parent" }));

      if (!localStorage.getItem("studentPin")) {
        localStorage.setItem("studentPin", "1234");
      }

      navigate("/parent-dashboard");
      return;
    }

    setError("Invalid credentials.");
  };

  return (
    <div className="le-page">

      {/* LEFT */}
      <aside className="le-left">
        <div className="le-bearWrap">
          <img className="le-bear" src={bear} alt="LearnEase Kids logo" />
        </div>

        <div className="le-brandText">
          <div className="le-brandTop">LearnEase</div>
          <div className="le-brandBottom">Kids</div>
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
              <span className="le-label">Username:</span>
              <input
                className="le-input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
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
            <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
              <button className="le-btn" type="submit">
                LOGIN
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

            {/* 🔥 RESTORED LINKS */}
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