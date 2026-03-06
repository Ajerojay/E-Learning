import React from "react";
import { Link } from "react-router-dom";
import "./ParentLogin.css";
import bear from "../img/bear.jpg";

export default function ParentLogin() {
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

          <form className="le-form">

            <label className="le-row">
              <span className="le-label">Username:</span>
              <input className="le-input" type="text" placeholder=" " />
            </label>

            <label className="le-row">
              <span className="le-label">Password:</span>
              <input className="le-input" type="password" placeholder=" " />
            </label>

            <button className="le-btn">LOGIN</button>

            {/* LINKS */}
            <div className="le-links">

              <span className="le-linkText">
                New Parent?{" "}
                <Link to="/signup" className="le-linkBlue">
                  Create Account
                </Link>
              </span>

              <Link to="#" className="le-linkRed">
                Forgot Password?
              </Link>

            </div>

          </form>

        </div>
      </main>

    </div>
  );
}