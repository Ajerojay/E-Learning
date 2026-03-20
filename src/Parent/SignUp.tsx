import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { FcGoogle } from "react-icons/fc";
import { FaFacebook } from "react-icons/fa";
import { IoEyeOutline, IoEyeOffOutline } from "react-icons/io5";

import "./Signup.css";
import bear from "../img/bear.jpg";

export default function ParentSignup() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [activeField, setActiveField] = useState("");
  const [confirmTyping, setConfirmTyping] = useState(false);

  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*]/.test(password),
  };

  const allPassed = Object.values(checks).every(Boolean);
  const passwordsMatch = password === confirmPassword && confirmPassword !== "";

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");

    if (!username || !password || !confirmPassword) {
      setError("Please fill in all fields.");
      return;
    }

    if (!allPassed) {
      setError("Please meet all password requirements.");
      return;
    }

    if (!passwordsMatch) {
      setError("Passwords do not match.");
      return;
    }

    alert("Account created successfully!");
    navigate("/");
  };

  return (
    <div className="le-page">
      <aside className="le-left1">
        <div className="le-bearWrap">
          <img className="le-bear" src={bear} alt="LearnEase Kids logo" />
        </div>

        <div className="le-brandText">
          <div className="le-brandTop">LearnEase</div>
          <div className="le-brandBottom">Kids</div>
        </div>
      </aside>

      <main className="le-right">
        <div className="le-card1">
          <h1 className="le-title1">WELCOME PARENT!</h1>
          <p className="le-subtitle1">Learning made fun and easy!</p>

          <form className="le-form1" onSubmit={handleSubmit}>
            
            {/* USERNAME */}
            <div className="le-row1">
              <span className="le-label1">Username:</span>
              <input
                className="le-input"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            {/* PASSWORD */}
            <div className="le-row1">
              <span className="le-label1">Password:</span>

              <div style={{ width: "100%" }}>
                <div className="le-inputWrap">
                  <input
                    className="le-input"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onFocus={() => setActiveField("password")}
                    onBlur={() => setActiveField("")}
                    onChange={(e) => setPassword(e.target.value)}
                  />

                  <button
                    type="button"
                    className="le-showPwd"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <IoEyeOffOutline /> : <IoEyeOutline />}
                  </button>

                  {/* PASSWORD TOOLTIP */}
                  {activeField === "password" && !allPassed && (
                    <div className="le-passHints">
                      <p className="invalid">Weak Password</p>

                      <p className={checks.length ? "valid" : "invalid"}>
                        {checks.length ? "✔" : "✖"} Min. 8 characters
                      </p>

                      <p className={checks.uppercase ? "valid" : "invalid"}>
                        {checks.uppercase ? "✔" : "✖"} One uppercase letter
                      </p>

                      <p className={checks.number ? "valid" : "invalid"}>
                        {checks.number ? "✔" : "✖"} One number
                      </p>

                      <p className={checks.special ? "valid" : "invalid"}>
                        {checks.special ? "✔" : "✖"} Special char (!@#$)
                      </p>
                    </div>
                  )}
                </div>

                {/* STRONG PASSWORD */}
                {allPassed && (
                  <p style={{
                    fontSize: "13px",
                    fontWeight: "700",
                    color: "#2e7d32",
                    marginTop: "6px"
                  }}>
                    ✔ Strong Password
                  </p>
                )}
              </div>
            </div>

            {/* CONFIRM PASSWORD */}
            <div className="le-row1">
              <span className="le-label1">Confirm:</span>

              <div style={{ width: "100%" }}>
                <div className="le-inputWrap">
                  <input
                    className="le-input"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onFocus={() => setActiveField("confirm")}
                    onBlur={() => {
                      setActiveField("");
                      setConfirmTyping(false);
                    }}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setConfirmTyping(true);
                    }}
                  />

                  <button
                    type="button"
                    className="le-showPwd"
                    onClick={() =>
                      setShowConfirmPassword(!showConfirmPassword)
                    }
                  >
                    {showConfirmPassword ? (
                      <IoEyeOffOutline />
                    ) : (
                      <IoEyeOutline />
                    )}
                  </button>

                  {/* CONFIRM TOOLTIP */}
                  {activeField === "confirm" &&
                    confirmTyping &&
                    !passwordsMatch && (
                      <div className="le-passHints">
                        <p className="invalid">✖ Passwords do not match</p>
                      </div>
                    )}
                </div>

                {/* PASSWORD MATCHED */}
                {confirmTyping && passwordsMatch && (
                  <p style={{
                    fontSize: "13px",
                    fontWeight: "700",
                    color: "#2e7d32",
                    marginTop: "6px"
                  }}>
                    ✔ Passwords matched
                  </p>
                )}
              </div>
            </div>

            <button className="le-btn1" type="submit">
              CREATE ACCOUNT
            </button>

            {error && <p className="le-errorMsg">{error}</p>}

            <div className="le-socialLogin">
              <button type="button" className="le-googleBtn">
                <FcGoogle /> Sign in with Google
              </button>

              <button type="button" className="le-facebookBtn">
                <FaFacebook /> Sign in with Facebook
              </button>
            </div>

            <div className="le-linksSignup">
              Already have an account?{" "}
              <Link to="/" className="le-linkBlue">
                Login here
              </Link>
            </div>

          </form>
        </div>
      </main>
    </div>
  );
}