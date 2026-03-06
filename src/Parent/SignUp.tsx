import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { FcGoogle } from "react-icons/fc";
import { FaFacebook } from "react-icons/fa";

import "./Signup.css";
import bear from "../img/bear.jpg";

export default function ParentSignup() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();

    setError("");

    if (!username || !password || !confirmPassword) {
      setError("Please fill in all fields.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
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

            <label className="le-row1">
              <span className="le-label1">Username:</span>
              <input
                className="le-input"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>

            <label className="le-row1">
              <span className="le-label1">Password:</span>
              <input
                className="le-input"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>

            <label className="le-row1">
              <span className="le-label1">Confirm Password:</span>
              <input
                className="le-input"
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </label>

            <button className="le-btn1" type="submit">
              CREATE ACCOUNT
            </button>

            {/* ERROR MESSAGE */}
            {error && <p className="le-error">{error}</p>}

            <div className="le-socialLogin">

              <button type="button" className="le-googleBtn">
                <FcGoogle className="le-icon" /> Sign in with Google
              </button>

              <button type="button" className="le-facebookBtn">
                <FaFacebook className="le-icon" /> Sign in with Facebook
              </button>

            </div>

            <div className="le-linksSignup">
              Already have an account?{" "}
              <Link to="/ParentLogin" className="le-linkBlue">
                Login here
              </Link>
            </div>

          </form>

        </div>
      </main>

    </div>
  );
}