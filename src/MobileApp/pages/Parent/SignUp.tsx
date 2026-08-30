import React, { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { FcGoogle } from "react-icons/fc";
import { FaFacebook } from "react-icons/fa";
import { IoEyeOutline, IoEyeOffOutline } from "react-icons/io5";

import "./Signup.css";
import bear from "../../../../images/learnease logo-no bg.png";
import { supabase } from "../../../lib/supabase";

const GRADE_OPTIONS = ["Nursery", "Prep", "Kinder"] as const;

const PRESCHOOL_MIN_AGE = 3;
const PRESCHOOL_MAX_AGE = 6;

const SEX_OPTIONS = [
  { value: "boy", label: "Boy" },
  { value: "girl", label: "Girl" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
] as const;

function getAgeYears(birthday: string): number | null {
  if (!birthday) return null;
  const born = new Date(birthday);
  if (Number.isNaN(born.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - born.getFullYear();
  const monthDiff = today.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < born.getDate())) {
    age -= 1;
  }
  return age;
}

export default function ParentSignup() {
  const navigate = useNavigate();

  const [childFirstName, setChildFirstName] = useState("");
  const [childLastName, setChildLastName] = useState("");
  const [childBirthday, setChildBirthday] = useState("");
  const [childSex, setChildSex] = useState("");
  const [childGrade, setChildGrade] = useState<string>(GRADE_OPTIONS[0]);
  const [childPin, setChildPin] = useState("");
  const [confirmChildPin, setConfirmChildPin] = useState("");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [successOpen, setSuccessOpen] = useState(false);
  const [registeredChildName, setRegisteredChildName] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showChildPin, setShowChildPin] = useState(false);
  const [showConfirmChildPin, setShowConfirmChildPin] = useState(false);

  const [activeField, setActiveField] = useState("");
  const [confirmTyping, setConfirmTyping] = useState(false);
  const [pinConfirmTyping, setPinConfirmTyping] = useState(false);
  const [loading, setLoading] = useState(false);

  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*]/.test(password),
  };

  const allPassed = Object.values(checks).every(Boolean);
  const passwordsMatch = password === confirmPassword && confirmPassword !== "";
  const pinsMatch =
    childPin.length === 4 && childPin === confirmChildPin && confirmChildPin.length === 4;

  const maxBirthday = new Date().toISOString().slice(0, 10);

  const childAge = childBirthday ? getAgeYears(childBirthday) : null;
  const childAgeValid =
    childAge !== null && childAge >= PRESCHOOL_MIN_AGE && childAge <= PRESCHOOL_MAX_AGE;

  const canSubmit = useMemo(() => {
    const cleanFirst = childFirstName.trim();
    const cleanLast = childLastName.trim();
    const cleanUsername = username.trim();
    const cleanPassword = password.trim();
    const cleanConfirmPassword = confirmPassword.trim();

    return (
      Boolean(cleanFirst) &&
      Boolean(cleanLast) &&
      Boolean(childBirthday) &&
      childAgeValid &&
      Boolean(childSex) &&
      Boolean(childGrade) &&
      pinsMatch &&
      Boolean(cleanUsername) &&
      Boolean(cleanPassword) &&
      Boolean(cleanConfirmPassword) &&
      allPassed &&
      passwordsMatch
    );
  }, [
    childFirstName,
    childLastName,
    childBirthday,
    childAgeValid,
    childSex,
    childGrade,
    pinsMatch,
    username,
    password,
    confirmPassword,
    allPassed,
    passwordsMatch,
  ]);

  const handlePinChange = (value: string, setter: (v: string) => void) => {
    setter(value.replace(/\D/g, "").slice(0, 4));
  };

  const validateForm = (): string | null => {
    const cleanFirst = childFirstName.trim();
    const cleanLast = childLastName.trim();
    const cleanUsername = username.trim();
    const cleanPassword = password.trim();
    const cleanConfirmPassword = confirmPassword.trim();
    const cleanPin = childPin.trim();
    const cleanConfirmPin = confirmChildPin.trim();

    if (
      !cleanFirst ||
      !cleanLast ||
      !childBirthday ||
      !childSex ||
      !childGrade ||
      !cleanPin ||
      !cleanConfirmPin ||
      !cleanUsername ||
      !cleanPassword ||
      !cleanConfirmPassword
    ) {
      return "Please fill in all required fields.";
    }

    if (!/^\d{4}$/.test(cleanPin)) {
      return "Child PIN must be exactly 4 digits.";
    }

    if (cleanPin !== cleanConfirmPin) {
      return "Child PIN and confirmation do not match.";
    }

    const age = getAgeYears(childBirthday);
    if (age === null) {
      return "Please enter a valid birthday.";
    }
    if (age < PRESCHOOL_MIN_AGE || age > PRESCHOOL_MAX_AGE) {
      return `This app is for preschoolers ages ${PRESCHOOL_MIN_AGE} to ${PRESCHOOL_MAX_AGE} only.`;
    }

    if (!allPassed) {
      return "Please meet all password requirements.";
    }

    if (cleanPassword !== cleanConfirmPassword) {
      return "Passwords do not match.";
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (!canSubmit) {
      setError("Please complete all required fields before signing up.");
      return;
    }

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    const cleanFirst = childFirstName.trim();
    const cleanLast = childLastName.trim();
    const fullChildName = `${cleanFirst} ${cleanLast}`.trim();
    const cleanUsername = username.trim();
    const cleanPassword = password.trim();
    const cleanPin = childPin.trim();

    try {
      setLoading(true);

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

      const childPayload: Record<string, string> = {
        parent_id: createdParent.id,
        child_name: fullChildName,
        first_name: cleanFirst,
        last_name: cleanLast,
        date_of_birth: childBirthday,
        sex: childSex,
        grade_level: childGrade,
        pin_code: cleanPin,
      };

      let { error: childInsertError } = await supabase
        .from("children_accounts")
        .insert([ { ...childPayload, is_active: true } ]);

      if (
        childInsertError &&
        /column|schema|does not exist/i.test(childInsertError.message)
      ) {
        const { error: fallbackError } = await supabase.from("children_accounts").insert([
          {
            parent_id: createdParent.id,
            child_name: fullChildName,
            grade_level: childGrade,
            pin_code: cleanPin,
            is_active: true,
          },
        ]);
        childInsertError = fallbackError;
        if (!fallbackError) {
          console.warn(
            "Child profile saved without extended fields. Run supabase/migrations/20250521_children_profile_fields.sql in Supabase."
          );
        }
      }

      if (childInsertError) {
        console.error("Child setup error:", childInsertError.message);
        setError("Account created, but child setup failed. Please contact support.");
        return;
      }

      setRegisteredChildName(cleanFirst);
      setSuccessOpen(true);
    } catch (err) {
      console.error(err);
      setError("Something went wrong while registering.");
    } finally {
      setLoading(false);
    }
  };

  const goToLogin = () => {
    setSuccessOpen(false);
    navigate("/");
  };

  return (
    <div className="le-page">
      <aside className="le-left1">
        <div className="le-brandText">
          <div className="le-brandTop">LearnEase</div>
          <div className="le-brandBottom">Kids</div>
        </div>

        <div className="le-bearWrap">
          <img className="le-bear" src={bear} alt="LearnEase Kids logo" />
        </div>
      </aside>

      <main className="le-right">
        <div className="le-card1">
          <h1 className="le-title1">Create your account</h1>
          <p className="le-subtitle1">
            For preschoolers (Nursery, Prep, and Kinder) â€” parent login first, then your
            child&apos;s profile.
          </p>

          <form className="le-form1" onSubmit={handleSubmit} noValidate>
            {/* â€”â€”â€” Parent (first) â€”â€”â€” */}
            <section className="le-signup-section" aria-labelledby="parent-section-title">
              <div className="le-section-head">
                <span className="le-section-icon le-section-icon--parent" aria-hidden="true">
                  ðŸ‘¤
                </span>
                <div>
                  <h2 id="parent-section-title" className="le-section-title">
                    Parent account
                  </h2>
                  <p className="le-section-desc">
                    You will use this username and password to view progress and settings.
                  </p>
                </div>
              </div>

              <div className="le-field-grid le-field-grid--full">
                <div className="le-field">
                  <label className="le-label1" htmlFor="parent-username">
                    Username <span className="le-required">*</span>
                  </label>
                  <input
                    id="parent-username"
                    className="le-input"
                    type="text"
                    autoComplete="username"
                    placeholder="Choose a username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>

                <div className="le-field">
                  <label className="le-label1" htmlFor="parent-password">
                    Password <span className="le-required">*</span>
                  </label>
                  <div className="le-inputWrap">
                    <input
                      id="parent-password"
                      className="le-input"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Create a strong password"
                      value={password}
                      onFocus={() => setActiveField("password")}
                      onBlur={() => setActiveField("")}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="le-showPwd"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <IoEyeOffOutline /> : <IoEyeOutline />}
                    </button>

                    {activeField === "password" && !allPassed && (
                      <div className="le-passHints">
                        <p className="invalid">Weak password</p>
                        <p className={checks.length ? "valid" : "invalid"}>
                          {checks.length ? "âœ”" : "âœ–"} Min. 8 characters
                        </p>
                        <p className={checks.uppercase ? "valid" : "invalid"}>
                          {checks.uppercase ? "âœ”" : "âœ–"} One uppercase letter
                        </p>
                        <p className={checks.number ? "valid" : "invalid"}>
                          {checks.number ? "âœ”" : "âœ–"} One number
                        </p>
                        <p className={checks.special ? "valid" : "invalid"}>
                          {checks.special ? "âœ”" : "âœ–"} Special char (!@#$%^&*)
                        </p>
                      </div>
                    )}
                  </div>
                  {allPassed && <p className="le-field-hint">âœ” Strong password</p>}
                </div>

                <div className="le-field">
                  <label className="le-label1" htmlFor="parent-password-confirm">
                    Confirm password <span className="le-required">*</span>
                  </label>
                  <div className="le-inputWrap">
                    <input
                      id="parent-password-confirm"
                      className="le-input"
                      type={showConfirmPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Re-enter your password"
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
                      required
                    />
                    <button
                      type="button"
                      className="le-showPwd"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-label={
                        showConfirmPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showConfirmPassword ? <IoEyeOffOutline /> : <IoEyeOutline />}
                    </button>

                    {activeField === "confirm" &&
                      confirmTyping &&
                      !passwordsMatch && (
                        <div className="le-passHints">
                          <p className="invalid">âœ– Passwords do not match</p>
                        </div>
                      )}
                  </div>
                  {confirmTyping && passwordsMatch && (
                    <p className="le-field-hint">âœ” Passwords matched</p>
                  )}
                </div>
              </div>
            </section>

            {/* â€”â€”â€” Child (second) â€”â€”â€” */}
            <section className="le-signup-section" aria-labelledby="child-section-title">
              <div className="le-section-head">
                <span className="le-section-icon le-section-icon--child" aria-hidden="true">
                  ðŸ§’
                </span>
                <div>
                  <h2 id="child-section-title" className="le-section-title">
                    Child&apos;s information
                  </h2>
                  <p className="le-section-desc">
                    Preschool only (Nursery, Prep, or Kinder). Your child uses their PIN to
                    play.
                  </p>
                </div>
              </div>

              <div className="le-field-grid">
                <div className="le-field">
                  <label className="le-label1" htmlFor="child-first-name">
                    First name <span className="le-required">*</span>
                  </label>
                  <input
                    id="child-first-name"
                    className="le-input"
                    type="text"
                    autoComplete="given-name"
                    placeholder="e.g. Sofia"
                    value={childFirstName}
                    onChange={(e) => setChildFirstName(e.target.value)}
                    required
                  />
                </div>

                <div className="le-field">
                  <label className="le-label1" htmlFor="child-last-name">
                    Last name <span className="le-required">*</span>
                  </label>
                  <input
                    id="child-last-name"
                    className="le-input"
                    type="text"
                    autoComplete="family-name"
                    placeholder="e.g. Cruz"
                    value={childLastName}
                    onChange={(e) => setChildLastName(e.target.value)}
                    required
                  />
                </div>

                <div className="le-field">
                  <label className="le-label1" htmlFor="child-birthday">
                    Birthday <span className="le-required">*</span>
                  </label>
                  <input
                    id="child-birthday"
                    className="le-input"
                    type="date"
                    max={maxBirthday}
                    value={childBirthday}
                    onChange={(e) => setChildBirthday(e.target.value)}
                    required
                  />
                  {childBirthday && !childAgeValid && (
                    <p className="le-field-hint le-field-hint--error">
                      Child must be {PRESCHOOL_MIN_AGE}â€“{PRESCHOOL_MAX_AGE} years old
                      (preschool).
                    </p>
                  )}
                </div>

                <div className="le-field">
                  <label className="le-label1" htmlFor="child-sex">
                    Sex <span className="le-required">*</span>
                  </label>
                  <select
                    id="child-sex"
                    className="le-select"
                    value={childSex}
                    onChange={(e) => setChildSex(e.target.value)}
                    required
                  >
                    <option value="">Select</option>
                    {SEX_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="le-field le-field--full">
                  <label className="le-label1" htmlFor="child-grade">
                    Preschool level <span className="le-required">*</span>
                  </label>
                  <select
                    id="child-grade"
                    className="le-select"
                    value={childGrade}
                    onChange={(e) => setChildGrade(e.target.value)}
                    required
                  >
                    {GRADE_OPTIONS.map((grade) => (
                      <option key={grade} value={grade}>
                        {grade}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="le-field">
                  <label className="le-label1" htmlFor="child-pin">
                    Child PIN (4 digits) <span className="le-required">*</span>
                  </label>
                  <div className="le-inputWrap">
                    <input
                      id="child-pin"
                      className="le-input"
                      type={showChildPin ? "text" : "password"}
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={4}
                      placeholder="â€¢â€¢â€¢â€¢"
                      value={childPin}
                      onChange={(e) => handlePinChange(e.target.value, setChildPin)}
                      required
                    />
                    <button
                      type="button"
                      className="le-showPwd"
                      onClick={() => setShowChildPin(!showChildPin)}
                      aria-label={showChildPin ? "Hide PIN" : "Show PIN"}
                    >
                      {showChildPin ? <IoEyeOffOutline /> : <IoEyeOutline />}
                    </button>
                  </div>
                </div>

                <div className="le-field">
                  <label className="le-label1" htmlFor="child-pin-confirm">
                    Confirm PIN <span className="le-required">*</span>
                  </label>
                  <div className="le-inputWrap">
                    <input
                      id="child-pin-confirm"
                      className="le-input"
                      type={showConfirmChildPin ? "text" : "password"}
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={4}
                      placeholder="â€¢â€¢â€¢â€¢"
                      value={confirmChildPin}
                      onFocus={() => setActiveField("pinConfirm")}
                      onBlur={() => {
                        setActiveField("");
                        setPinConfirmTyping(false);
                      }}
                      onChange={(e) => {
                        handlePinChange(e.target.value, setConfirmChildPin);
                        setPinConfirmTyping(true);
                      }}
                      required
                    />
                    <button
                      type="button"
                      className="le-showPwd"
                      onClick={() => setShowConfirmChildPin(!showConfirmChildPin)}
                      aria-label={showConfirmChildPin ? "Hide PIN" : "Show PIN"}
                    >
                      {showConfirmChildPin ? <IoEyeOffOutline /> : <IoEyeOutline />}
                    </button>

                    {activeField === "pinConfirm" &&
                      pinConfirmTyping &&
                      confirmChildPin.length > 0 &&
                      !pinsMatch && (
                        <div className="le-passHints">
                          <p className="invalid">âœ– PINs do not match</p>
                        </div>
                      )}
                  </div>
                  {pinConfirmTyping && pinsMatch && (
                    <p className="le-field-hint">âœ” PINs matched</p>
                  )}
                </div>
              </div>
            </section>

            <button
              className="le-btn1"
              type="submit"
              disabled={loading || !canSubmit}
              aria-disabled={loading || !canSubmit}
            >
              {loading ? "Creating accountâ€¦" : "Create account"}
            </button>

            {!canSubmit && !loading && (
              <p className="le-submit-hint" role="status">
                Please complete all fields, match your password and PIN, and use a strong
                password before signing up.
              </p>
            )}

            {error && (
              <p className="le-errorMsg" role="alert">
                {error}
              </p>
            )}

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

      {successOpen && (
        <div
          className="le-success-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="signup-success-title"
        >
          <div className="le-success-modal">
            <div className="le-success-icon" aria-hidden="true">
              âœ“
            </div>
            <h2 id="signup-success-title" className="le-success-title">
              Successfully registered!
            </h2>
            <p className="le-success-text">
              {registeredChildName
                ? `${registeredChildName}'s profile and your parent account are ready. You can log in now.`
                : "Your accounts are ready. You can log in now."}
            </p>
            <button type="button" className="le-success-btn" onClick={goToLogin}>
              Go to login
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

