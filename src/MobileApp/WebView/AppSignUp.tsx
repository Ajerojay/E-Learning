import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Baby, Check, Circle, Eye, EyeOff, UserRoundPlus } from "lucide-react";
import "./AppAuth.css";
import logo from "../../../images/learnease logo-no bg.png";
import { createParentAccount, resendVerificationEmail } from "../../lib/supabaseAuth";

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

function startsWithCapitalLetter(value: string): boolean {
  return /^\p{Lu}/u.test(value.trim());
}

function RequiredLabel({ htmlFor, children }: { htmlFor: string; children: string }) {
  return (
    <label htmlFor={htmlFor}>
      {children}
      <span className="app-auth-required" title="Required"> *</span>
    </label>
  );
}

export default function AppSignUp() {
  const navigate = useNavigate();
  const [childFirstName, setChildFirstName] = useState("");
  const [childLastName, setChildLastName] = useState("");
  const [childNickname, setChildNickname] = useState("");
  const [childBirthday, setChildBirthday] = useState("");
  const [childSex, setChildSex] = useState("");
  const [childPin, setChildPin] = useState("");
  const [confirmChildPin, setConfirmChildPin] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const passwordChecks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*]/.test(password),
  };

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const strongPassword = Object.values(passwordChecks).every(Boolean);
  const passwordsMatch = password !== "" && password === confirmPassword;
  const pinsMatch = childPin.length === 4 && childPin === confirmChildPin;
  const pinComplete = childPin.length === 4;
  const confirmPinStarted = confirmChildPin.length > 0;
  const confirmPasswordStarted = confirmPassword.length > 0;
  const firstNameCapitalized = startsWithCapitalLetter(childFirstName);
  const lastNameCapitalized = startsWithCapitalLetter(childLastName);
  const childAge = getAgeYears(childBirthday);
  const childAgeValid =
    childAge !== null && childAge >= PRESCHOOL_MIN_AGE && childAge <= PRESCHOOL_MAX_AGE;
  const maxBirthday = new Date().toISOString().slice(0, 10);

  const canSubmit = useMemo(
    () =>
      Boolean(childFirstName.trim()) &&
      firstNameCapitalized &&
      Boolean(childLastName.trim()) &&
      lastNameCapitalized &&
      Boolean(childBirthday) &&
      childAgeValid &&
      Boolean(childSex) &&
      pinsMatch &&
      Boolean(username.trim()) &&
      Boolean(email.trim()) &&
      emailValid &&
      strongPassword &&
      passwordsMatch,
    [
      childFirstName,
      childLastName,
      firstNameCapitalized,
      lastNameCapitalized,
      childBirthday,
      childAgeValid,
      childSex,
      pinsMatch,
      username,
      email,
      emailValid,
      strongPassword,
      passwordsMatch,
    ]
  );

  const getValidationMessage = () => {
    const missing: string[] = [];
    if (!childFirstName.trim()) missing.push("Child first name");
    else if (!firstNameCapitalized) missing.push("Child first name starting with a capital letter");
    if (!childLastName.trim()) missing.push("Child last name");
    else if (!lastNameCapitalized) missing.push("Child last name starting with a capital letter");
    if (!childBirthday) missing.push("Child birthday");
    else if (!childAgeValid) missing.push(`Child age must be ${PRESCHOOL_MIN_AGE}-${PRESCHOOL_MAX_AGE}`);
    if (!childSex) missing.push("Sex");
    if (!username.trim()) missing.push("Username");
    if (!email.trim()) missing.push("Email address");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) missing.push("Valid email address");
    if (!password) missing.push("Password");
    else if (!strongPassword) missing.push("Password: 8+ characters, uppercase, number, and symbol");
    if (!confirmPassword) missing.push("Confirm password");
    else if (!passwordsMatch) missing.push("Matching confirm password");
    if (!childPin || childPin.length !== 4) missing.push("4-digit child PIN");
    if (!confirmChildPin || confirmChildPin.length !== 4) missing.push("Confirm child PIN");
    else if (!pinsMatch) missing.push("Matching confirm child PIN");
    return missing.length ? `Please complete: ${missing.join(", ")}.` : "";
  };

  const handlePinChange = (value: string, setter: (newValue: string) => void) => {
    setter(value.replace(/\D/g, "").slice(0, 4));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!canSubmit) {
      setError(getValidationMessage());
      return;
    }

    const cleanFirstName = childFirstName.trim();
    const cleanLastName = childLastName.trim();
    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();
    const cleanPin = childPin.trim();
    const fullChildName = `${cleanFirstName} ${cleanLastName}`.trim();

    try {
      setLoading(true);

      const credential = await createParentAccount(cleanUsername, cleanEmail, cleanPassword, {
        childName: fullChildName,
        firstName: cleanFirstName,
        lastName: cleanLastName,
        dateOfBirth: childBirthday,
        sex: childSex,
        gradeLevel: "",
        pinCode: cleanPin,
        nickname: childNickname.trim() || "n/a",
      });

      if (credential.needsEmailConfirmation) {
        setSuccess("Check your email to confirm your account. After you click the link, sign in with your username or email.");
        return;
      }

      setSuccess("Email already confirmed. You can sign in now.");
      window.setTimeout(() => navigate("/app/signin"), 1400);
    } catch (caughtError) {
      console.error(caughtError);
      const message = caughtError instanceof Error ? caughtError.message : "Unable to create the account.";
      const normalizedMessage = message.toLowerCase();
      if (normalizedMessage.includes("already registered") || normalizedMessage.includes("already been registered") || normalizedMessage.includes("already exists")) {
        setError(message);
      } else if (normalizedMessage.includes("password")) {
        setError(`Password rejected: ${message}`);
      } else if (normalizedMessage.includes("email")) {
        setError(`Email rejected: ${message}`);
      } else {
        setError(`Account creation failed: ${message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="app-auth-shell">
      <section className="app-auth-phone" aria-label="LearnEase mobile app sign up">
        <button
          className="app-auth-back-btn"
          type="button"
          aria-label="Back to sign in"
          onClick={() => navigate("/app/signin")}
        >
          <ArrowLeft size={22} strokeWidth={2.5} />
        </button>

        <header className="app-auth-top">
          <img className="app-auth-logo" src={logo} alt="LearnEase Kids" />
          <div className="app-auth-brand">
            <span className="app-auth-name">LearnEase</span>
            <span className="app-auth-label">Mobile app</span>
          </div>
        </header>

        <div className="app-auth-panel">
          <h1 className="app-auth-title">Create account</h1>
          <p className="app-auth-copy">
            App-only signup screen using the same parent and child records as the website.
          </p>

          <form className="app-auth-form" onSubmit={handleSubmit} noValidate>
            <section className="app-auth-section">
              <h2 className="app-auth-section-title">
                <UserRoundPlus size={18} />
                Parent account
              </h2>

              <div className="app-auth-field">
                <RequiredLabel htmlFor="app-signup-username">Username</RequiredLabel>
                <input
                  id="app-signup-username"
                  className="app-auth-input"
                  type="text"
                  autoComplete="username"
                  placeholder="Choose username"
                  required
                  aria-required="true"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </div>

              <div className="app-auth-field">
                <RequiredLabel htmlFor="app-signup-email">Email address</RequiredLabel>
                <input
                  id="app-signup-email"
                  className={`app-auth-input${email && !emailValid ? " app-auth-input-invalid" : ""}`}
                  type="email"
                  autoComplete="email"
                  placeholder="parent@example.com"
                  required
                  aria-required="true"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <p className="app-auth-hint">Used for verification and password recovery.</p>
                {email.length > 0 && !emailValid && (
                  <p className="app-auth-field-error">Enter a valid email address.</p>
                )}
              </div>

              <div className="app-auth-field">
                <RequiredLabel htmlFor="app-signup-password">Password</RequiredLabel>
                <div className="app-auth-input-wrap">
                  <input
                    id="app-signup-password"
                    className={`app-auth-input${password && !strongPassword ? " app-auth-input-invalid" : ""}`}
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Create password"
                    required
                    aria-required="true"
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
                <ul className="app-auth-checklist" aria-live="polite">
                  {[
                    { ok: passwordChecks.length, label: "8 characters" },
                    { ok: passwordChecks.uppercase, label: "One uppercase letter" },
                    { ok: passwordChecks.number, label: "One number" },
                    { ok: passwordChecks.special, label: "One symbol (!@#$%^&*)" },
                  ].map((item) => (
                    <li key={item.label} className={item.ok ? "is-met" : "is-missing"}>
                      {item.ok ? <Check size={14} strokeWidth={3} /> : <Circle size={14} />}
                      {item.label}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="app-auth-field">
                <RequiredLabel htmlFor="app-signup-confirm-password">Confirm password</RequiredLabel>
                <div className="app-auth-input-wrap">
                  <input
                    id="app-signup-confirm-password"
                    className={`app-auth-input${confirmPasswordStarted && !passwordsMatch ? " app-auth-input-invalid" : ""}`}
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Repeat password"
                    required
                    aria-required="true"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                  <button
                    className="app-auth-icon-btn"
                    type="button"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowConfirmPassword((current) => !current)}
                  >
                    {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                {confirmPasswordStarted && !passwordsMatch && (
                  <p className="app-auth-field-error">Passwords do not match.</p>
                )}
                {passwordsMatch && (
                  <p className="app-auth-field-ok">Passwords match.</p>
                )}
              </div>
            </section>

            <section className="app-auth-section">
              <h2 className="app-auth-section-title">
                <Baby size={18} />
                Child information
              </h2>

              <div className="app-auth-row">
                <div className="app-auth-field">
                  <RequiredLabel htmlFor="app-child-first">First name</RequiredLabel>
                  <input
                    id="app-child-first"
                    className={`app-auth-input${childFirstName && !firstNameCapitalized ? " app-auth-input-invalid" : ""}`}
                    type="text"
                    autoComplete="given-name"
                    placeholder="e.g. Maria"
                    required
                    aria-required="true"
                    value={childFirstName}
                    onChange={(event) => setChildFirstName(event.target.value)}
                  />
                  {childFirstName.trim() && !firstNameCapitalized && (
                    <p className="app-auth-field-error">First name must start with a capital letter.</p>
                  )}
                </div>

                <div className="app-auth-field">
                  <RequiredLabel htmlFor="app-child-last">Last name</RequiredLabel>
                  <input
                    id="app-child-last"
                    className={`app-auth-input${childLastName && !lastNameCapitalized ? " app-auth-input-invalid" : ""}`}
                    type="text"
                    autoComplete="family-name"
                    placeholder="e.g. Santos"
                    required
                    aria-required="true"
                    value={childLastName}
                    onChange={(event) => setChildLastName(event.target.value)}
                  />
                  {childLastName.trim() && !lastNameCapitalized && (
                    <p className="app-auth-field-error">Last name must start with a capital letter.</p>
                  )}
                </div>
              </div>

              <div className="app-auth-field">
                <label htmlFor="app-child-nickname">Nickname <span className="app-auth-optional">(optional)</span></label>
                <input
                  id="app-child-nickname"
                  className="app-auth-input"
                  type="text"
                  autoComplete="nickname"
                  placeholder="Leave blank for n/a"
                  value={childNickname}
                  onChange={(event) => setChildNickname(event.target.value)}
                />
              </div>

              <div className="app-auth-row">
                <div className="app-auth-field">
                  <RequiredLabel htmlFor="app-child-birthday">Birthday</RequiredLabel>
                  <input
                    id="app-child-birthday"
                    className={`app-auth-input${childBirthday && !childAgeValid ? " app-auth-input-invalid" : ""}`}
                    type="date"
                    max={maxBirthday}
                    required
                    aria-required="true"
                    value={childBirthday}
                    onChange={(event) => setChildBirthday(event.target.value)}
                  />
                </div>

                <div className="app-auth-field">
                  <RequiredLabel htmlFor="app-child-sex">Sex</RequiredLabel>
                  <select
                    id="app-child-sex"
                    className="app-auth-select"
                    required
                    aria-required="true"
                    value={childSex}
                    onChange={(event) => setChildSex(event.target.value)}
                  >
                    <option value="">Select</option>
                    {SEX_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="app-auth-row">
                <div className="app-auth-field">
                  <RequiredLabel htmlFor="app-child-pin">Child PIN</RequiredLabel>
                  <div className="app-auth-input-wrap">
                    <input
                      id="app-child-pin"
                      className={`app-auth-input${childPin && !pinComplete ? " app-auth-input-invalid" : ""}`}
                      type={showPin ? "text" : "password"}
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="4 digits"
                      required
                      aria-required="true"
                      value={childPin}
                      onChange={(event) => handlePinChange(event.target.value, setChildPin)}
                    />
                    <button
                      className="app-auth-icon-btn"
                      type="button"
                      aria-label={showPin ? "Hide PIN" : "Show PIN"}
                      onClick={() => setShowPin((current) => !current)}
                    >
                      {showPin ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  {childPin.length > 0 && !pinComplete && (
                    <p className="app-auth-field-error">PIN must be 4 digits.</p>
                  )}
                </div>

                <div className="app-auth-field">
                  <RequiredLabel htmlFor="app-child-pin-confirm">Confirm PIN</RequiredLabel>
                  <div className="app-auth-input-wrap">
                    <input
                      id="app-child-pin-confirm"
                      className={`app-auth-input${confirmPinStarted && !pinsMatch ? " app-auth-input-invalid" : ""}`}
                      type={showConfirmPin ? "text" : "password"}
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="Repeat PIN"
                      required
                      aria-required="true"
                      value={confirmChildPin}
                      onChange={(event) =>
                        handlePinChange(event.target.value, setConfirmChildPin)
                      }
                    />
                    <button
                      className="app-auth-icon-btn"
                      type="button"
                      aria-label={showConfirmPin ? "Hide PIN" : "Show PIN"}
                      onClick={() => setShowConfirmPin((current) => !current)}
                    >
                      {showConfirmPin ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  {confirmPinStarted && !pinsMatch && (
                    <p className="app-auth-field-error">PINs do not match.</p>
                  )}
                  {pinsMatch && <p className="app-auth-field-ok">PINs match.</p>}
                </div>
              </div>

              {childBirthday && !childAgeValid && (
                <p className="app-auth-alert">
                  Child must be {PRESCHOOL_MIN_AGE} to {PRESCHOOL_MAX_AGE} years old.
                </p>
              )}
            </section>

            {error && <p className="app-auth-alert">{error}</p>}
            {success && <p className="app-auth-success">{success}</p>}
            {success && (
              <button
                className="app-auth-link-button"
                type="button"
                disabled={loading}
                onClick={async () => {
                  try {
                    setLoading(true);
                    setError("");
                    await resendVerificationEmail(email.trim());
                    setSuccess("A new confirmation email was sent. Confirm it before signing in.");
                  } catch (caughtError) {
                    const message = caughtError instanceof Error ? caughtError.message : "Could not resend the confirmation email.";
                    setError(message);
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                Resend confirmation email
              </button>
            )}

            <p className="app-auth-required-note">
              <span className="app-auth-required">*</span> Required fields
            </p>

            <button
              className="app-auth-main-btn"
              type="submit"
              disabled={loading || !canSubmit}
              title={canSubmit ? "Create account" : "Fill in every required field to continue"}
            >
              <UserRoundPlus size={19} />
              {loading ? "Creating account..." : "Create account"}
            </button>

            <p className="app-auth-link-line">
              Already registered? <Link to="/app/signin">Sign in</Link>
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}
