import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Baby, Eye, EyeOff, UserRoundPlus } from "lucide-react";
import "./AppAuth.css";
import logo from "../../images/learnease logo-no bg.png";
import { supabase } from "../lib/supabase";

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

export default function AppSignUp() {
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

  const strongPassword = Object.values(passwordChecks).every(Boolean);
  const passwordsMatch = password !== "" && password === confirmPassword;
  const pinsMatch = childPin.length === 4 && childPin === confirmChildPin;
  const childAge = getAgeYears(childBirthday);
  const childAgeValid =
    childAge !== null && childAge >= PRESCHOOL_MIN_AGE && childAge <= PRESCHOOL_MAX_AGE;
  const maxBirthday = new Date().toISOString().slice(0, 10);

  const canSubmit = useMemo(
    () =>
      Boolean(childFirstName.trim()) &&
      Boolean(childLastName.trim()) &&
      Boolean(childBirthday) &&
      childAgeValid &&
      Boolean(childSex) &&
      Boolean(childGrade) &&
      pinsMatch &&
      Boolean(username.trim()) &&
      strongPassword &&
      passwordsMatch,
    [
      childFirstName,
      childLastName,
      childBirthday,
      childAgeValid,
      childSex,
      childGrade,
      pinsMatch,
      username,
      strongPassword,
      passwordsMatch,
    ]
  );

  const handlePinChange = (value: string, setter: (newValue: string) => void) => {
    setter(value.replace(/\D/g, "").slice(0, 4));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!canSubmit) {
      setError("Please complete all required fields before signing up.");
      return;
    }

    const cleanFirstName = childFirstName.trim();
    const cleanLastName = childLastName.trim();
    const cleanUsername = username.trim();
    const cleanPassword = password.trim();
    const cleanPin = childPin.trim();
    const fullChildName = `${cleanFirstName} ${cleanLastName}`.trim();

    try {
      setLoading(true);

      const { data: existingUser, error: checkError } = await supabase
        .from("parents_accounts")
        .select("id")
        .eq("username", cleanUsername)
        .maybeSingle();

      if (checkError) {
        console.error("App username check error:", checkError.message);
        setError("Something went wrong while checking the username.");
        return;
      }

      if (existingUser) {
        setError("Username already exists. Please choose another one.");
        return;
      }

      const { data: createdParent, error: insertError } = await supabase
        .from("parents_accounts")
        .insert([{ username: cleanUsername, password: cleanPassword }])
        .select("id")
        .single();

      if (insertError) {
        console.error("App signup error:", insertError.message);
        setError("Failed to register account.");
        return;
      }

      const childPayload = {
        parent_id: createdParent.id,
        child_name: fullChildName,
        first_name: cleanFirstName,
        last_name: cleanLastName,
        date_of_birth: childBirthday,
        sex: childSex,
        grade_level: childGrade,
        pin_code: cleanPin,
        is_active: true,
      };

      let { error: childInsertError } = await supabase
        .from("children_accounts")
        .insert([childPayload]);

      if (childInsertError && /column|schema|does not exist/i.test(childInsertError.message)) {
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
      }

      if (childInsertError) {
        console.error("App child setup error:", childInsertError.message);
        setError("Account created, but child setup failed. Please contact support.");
        return;
      }

      setSuccess("Successfully registered. You can sign in now.");
      window.setTimeout(() => navigate("/app/signin"), 900);
    } catch (caughtError) {
      console.error(caughtError);
      setError("Something went wrong while registering.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="app-auth-shell">
      <section className="app-auth-phone" aria-label="LearnEase mobile app sign up">
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
                <label htmlFor="app-signup-username">Username</label>
                <input
                  id="app-signup-username"
                  className="app-auth-input"
                  type="text"
                  autoComplete="username"
                  placeholder="Choose username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </div>

              <div className="app-auth-field">
                <label htmlFor="app-signup-password">Password</label>
                <div className="app-auth-input-wrap">
                  <input
                    id="app-signup-password"
                    className="app-auth-input"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Create password"
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
                <p className="app-auth-hint">Use 8 characters, uppercase, number, and symbol.</p>
              </div>

              <div className="app-auth-field">
                <label htmlFor="app-signup-confirm-password">Confirm password</label>
                <div className="app-auth-input-wrap">
                  <input
                    id="app-signup-confirm-password"
                    className="app-auth-input"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Repeat password"
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
              </div>
            </section>

            <section className="app-auth-section">
              <h2 className="app-auth-section-title">
                <Baby size={18} />
                Child information
              </h2>

              <div className="app-auth-row">
                <div className="app-auth-field">
                  <label htmlFor="app-child-first">First name</label>
                  <input
                    id="app-child-first"
                    className="app-auth-input"
                    type="text"
                    autoComplete="given-name"
                    value={childFirstName}
                    onChange={(event) => setChildFirstName(event.target.value)}
                  />
                </div>

                <div className="app-auth-field">
                  <label htmlFor="app-child-last">Last name</label>
                  <input
                    id="app-child-last"
                    className="app-auth-input"
                    type="text"
                    autoComplete="family-name"
                    value={childLastName}
                    onChange={(event) => setChildLastName(event.target.value)}
                  />
                </div>
              </div>

              <div className="app-auth-row">
                <div className="app-auth-field">
                  <label htmlFor="app-child-birthday">Birthday</label>
                  <input
                    id="app-child-birthday"
                    className="app-auth-input"
                    type="date"
                    max={maxBirthday}
                    value={childBirthday}
                    onChange={(event) => setChildBirthday(event.target.value)}
                  />
                </div>

                <div className="app-auth-field">
                  <label htmlFor="app-child-sex">Sex</label>
                  <select
                    id="app-child-sex"
                    className="app-auth-select"
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

              <div className="app-auth-field">
                <label htmlFor="app-child-grade">Preschool level</label>
                <select
                  id="app-child-grade"
                  className="app-auth-select"
                  value={childGrade}
                  onChange={(event) => setChildGrade(event.target.value)}
                >
                  {GRADE_OPTIONS.map((grade) => (
                    <option key={grade} value={grade}>
                      {grade}
                    </option>
                  ))}
                </select>
              </div>

              <div className="app-auth-row">
                <div className="app-auth-field">
                  <label htmlFor="app-child-pin">Child PIN</label>
                  <div className="app-auth-input-wrap">
                    <input
                      id="app-child-pin"
                      className="app-auth-input"
                      type={showPin ? "text" : "password"}
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="4 digits"
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
                </div>

                <div className="app-auth-field">
                  <label htmlFor="app-child-pin-confirm">Confirm PIN</label>
                  <div className="app-auth-input-wrap">
                    <input
                      id="app-child-pin-confirm"
                      className="app-auth-input"
                      type={showConfirmPin ? "text" : "password"}
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="Repeat PIN"
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

            <button className="app-auth-main-btn" type="submit" disabled={loading || !canSubmit}>
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
