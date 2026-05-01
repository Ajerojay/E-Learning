import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { FcGoogle } from "react-icons/fc";
import { FaFacebook } from "react-icons/fa";
import { IoEyeOutline, IoEyeOffOutline } from "react-icons/io5";

import "./Signup.css";
import bear from "../img/bear.jpg";
import { supabase } from "../lib/supabase";

export default function ParentSignup() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [childPin, setChildPin] = useState("");
  const [error, setError] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [activeField, setActiveField] = useState("");
  const [confirmTyping, setConfirmTyping] = useState(false);
  const [loading, setLoading] = useState(false);

  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*]/.test(password),
  };

  const allPassed = Object.values(checks).every(Boolean);
  const passwordsMatch = password === confirmPassword && confirmPassword !== "";

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    const cleanUsername = username.trim();
    const cleanPassword = password.trim();
    const cleanChildPin = childPin.trim();

    if (!cleanUsername || !cleanPassword || !confirmPassword.trim() || !cleanChildPin) {
      setError("Please fill in all fields.");
      return;
    }

    if (!/^\d{4}$/.test(cleanChildPin)) {
      setError("Child PIN must be exactly 4 digits.");
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

    try {
      setLoading(true);

      // Check if username already exists
      const { data: existingUser, error: checkError } = await supabase
        .from("parents_accounts")
        .select("id")
        .eq("username", cleanUsername)
        .maybeSingle();

      if (checkError) {
        console.error("Check username error:", checkError.message);
        setError("Something went wrong while checking the username.");
        return;
      }

      if (existingUser) {
        setError("Username already exists. Please choose another one.");
        return;
      }

      const { data: createdParent, error: insertError } = await supabase
        .from("parents_accounts")
        .insert([
          {
            username: cleanUsername,
            password: cleanPassword,
          },
        ])
        .select("id")
        .single();

      if (insertError) {
        console.error("Signup error:", insertError.message);
        setError("Failed to register account.");
        return;
      }

      const { error: childInsertError } = await supabase
        .from("children_accounts")
        .insert([
          {
            parent_id: createdParent.id,
            child_name: "Sofia Cruz",
            grade_level: "Kinder",
            pin_code: cleanChildPin,
          },
        ]);

      if (childInsertError) {
        console.error("Child setup error:", childInsertError.message);
        setError("Account created, but child PIN setup failed. Please contact support.");
        return;
      }

      alert("Account registered successfully!");
      navigate("/");
    } catch (err) {
      console.error(err);
      setError("Something went wrong while registering.");
    } finally {
      setLoading(false);
    }
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
                        {checks.special ? "✔" : "✖"} Special char (!@#$%^&*)
                      </p>
                    </div>
                  )}
                </div>

                {allPassed && (
                  <p
                    style={{
                      fontSize: "13px",
                      fontWeight: "700",
                      color: "#2e7d32",
                      marginTop: "6px",
                    }}
                  >
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
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
                      <IoEyeOffOutline />
                    ) : (
                      <IoEyeOutline />
                    )}
                  </button>

                  {activeField === "confirm" &&
                    confirmTyping &&
                    !passwordsMatch && (
                      <div className="le-passHints">
                        <p className="invalid">✖ Passwords do not match</p>
                      </div>
                    )}
                </div>

                {confirmTyping && passwordsMatch && (
                  <p
                    style={{
                      fontSize: "13px",
                      fontWeight: "700",
                      color: "#2e7d32",
                      marginTop: "6px",
                    }}
                  >
                    ✔ Passwords matched
                  </p>
                )}
              </div>
            </div>

            {/* CHILD PIN */}
            <div className="le-row1">
              <span className="le-label1">Child PIN:</span>
              <input
                className="le-input"
                type="password"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                placeholder="Set 4-digit PIN"
                value={childPin}
                onChange={(e) => {
                  const onlyDigits = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setChildPin(onlyDigits);
                }}
              />
            </div>

            <button className="le-btn1" type="submit" disabled={loading}>
              {loading ? "CREATING..." : "CREATE ACCOUNT"}
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