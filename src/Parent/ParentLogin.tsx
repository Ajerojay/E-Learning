import React, { useState } from "react";
import { IoEyeOutline, IoEyeOffOutline } from "react-icons/io5";
import "./ParentLogin.css";
import { useNavigate } from "react-router-dom";
import bear from "../../images/learnease logo-no bg.png";

const TEMP_USERNAME = "parent";
const TEMP_PASSWORD = "parent123";

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

    const wrongUser = user !== TEMP_USERNAME;
    const wrongPass = pass !== TEMP_PASSWORD;

    if (wrongUser && wrongPass) {
      setError("Invalid username and password.");
      return;
    } else if (wrongUser) {
      setError("Invalid username.");
      return;
    } else if (wrongPass) {
      setError("Invalid password.");
      return;
    }

    setError(null);
    navigate("/parent-dashboard");
  };

  return (
    <div className="le-page">
      {/* LEFT SIDE */}
      <aside className="le-left">
        <div className="le-bearWrap">
          <img className="le-bear" src={bear} alt="LearnEase Kids logo" />
        </div>

        <div className="le-brandText">
          <div className="le-brandTop">LearnEase</div>
          <div className="le-brandBottom">Kids</div>
        </div>
      </aside>

      {/* RIGHT SIDE */}
      <main className="le-right">
        <div className="le-card">
          <h1 className="le-title">WELCOME PARENT!</h1>
          <p className="le-subtitle">Learning made fun and easy!</p>

          <form className="le-form" onSubmit={handleLogin}>
            <label className="le-row">
              <span className="le-label">Username:</span>
              <input
                className="le-input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
                placeholder="Username"
              />
            </label>

            <label className="le-row">
              <span className="le-label">Password:</span>
              <div className="le-inputWrap">
                <input
                  className="le-input"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="off"
                  placeholder="Password"
                />
                <button
                  type="button"
                  className="le-showPwd"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <IoEyeOffOutline size={22} /> : <IoEyeOutline size={22} />}
                </button>
              </div>
            </label>

            <button className="le-btn" type="submit">
              LOGIN
            </button>

            {error && (
              <p className="le-error" role="alert">
                {error}
              </p>
            )}

            <div className="le-links">
              <span className="le-linkText">
                New Parent? <a className="le-linkBlue" href="/signup">Create Account</a>
              </span>

              <a className="le-linkRed" href="#">Forgot Password?</a>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}