import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Circle, Eye, EyeOff, KeyRound } from "lucide-react";
import "./AppAuth.css";
import logo from "../../../../images/learnease logo-no bg.png";
import { openEmailLinkSession, sendPasswordReset, updateSignedInParentPassword } from "../../../backend/supabaseAuth";
import { createPasswordRecoveryClient, pendingEmailLink } from "../../../backend/supabase";
import BearLoading from "../BearLoading";

function RequiredLabel({ htmlFor, children }: { htmlFor: string; children: string }) {
  return (
    <label htmlFor={htmlFor}>
      {children}
      <span className="app-auth-required" title="Required"> *</span>
    </label>
  );
}

export default function AppResetPassword({ useEmailCode = false }: { useEmailCode?: boolean }) {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(
    () => !useEmailCode && Boolean(pendingEmailLink.accessToken || pendingEmailLink.tokenHash || pendingEmailLink.code),
  );
  const [canReset, setCanReset] = useState(false);
  const [recoveryClient] = useState(createPasswordRecoveryClient);
  const [email, setEmail] = useState("");
  const [requestedEmail, setRequestedEmail] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const passwordChecks = {
    length: password.trim().length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*]/.test(password),
  };
  const strongPassword = Object.values(passwordChecks).every(Boolean);
  const passwordsMatch = password !== "" && password === confirmPassword;
  const confirmPasswordStarted = confirmPassword.length > 0;
  const canSubmit = strongPassword && passwordsMatch && !loading;

  useEffect(() => {
    if (useEmailCode || !(pendingEmailLink.accessToken || pendingEmailLink.tokenHash || pendingEmailLink.code)) return;
    let active = true;
    void openEmailLinkSession("recovery")
      .then((result) => {
        if (!active) return;
        if (result === "wrong-type") {
          navigate("/email-verified", { replace: true });
          return;
        }
        setCanReset(result === "ready");
        if (result !== "ready") {
          setError("Request an OTP below to continue resetting your password.");
        }
      })
      .catch((caughtError) => {
        if (!active) return;
        setCanReset(false);
        console.warn("Password reset link could not be verified:", caughtError);
        setError("Request an OTP below to continue resetting your password.");
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [navigate, useEmailCode]);

  const requestCode = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (loading) return;
    const address = requestedEmail || email.trim().toLowerCase();
    if (!address) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      await sendPasswordReset(address, recoveryClient);
      setRequestedEmail(address);
      setCode("");
      setNotice("If an account uses this email, an OTP will arrive shortly. Check your inbox or spam folder.");
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Could not send the OTP. Try again.";
      if (/timed out/i.test(message)) {
        setRequestedEmail(address);
        setError("The request timed out. Check your email in case the OTP arrived, or tap Resend OTP.");
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading || !requestedEmail || !/^\d{6,10}$/.test(code)) return;
    setLoading(true);
    setError("");
    try {
      const { data, error: verifyError } = await recoveryClient.auth.verifyOtp({
        email: requestedEmail,
        token: code,
        type: "recovery",
      });
      if (verifyError?.code === "otp_expired") {
        setError("This OTP is invalid or expired. Tap Resend OTP for a new one.");
        return;
      }
      if (verifyError) throw verifyError;
      if (!data.session) throw new Error("Could not verify the reset code. Request a new code.");
      setCode("");
      setCanReset(true);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not verify the reset code.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canReset || loading) return;
    setError("");
    if (!strongPassword) {
      setError("Use a stronger password before saving.");
      return;
    }
    if (!passwordsMatch) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      await updateSignedInParentPassword(password.trim(), requestedEmail ? recoveryClient : undefined);
      setPassword("");
      setConfirmPassword("");
      setSaved(true);
    } catch (caughtError) {
      console.error(caughtError);
      const message = caughtError instanceof Error ? caughtError.message : "Unable to change the password.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="app-auth-shell">
      {(checking || loading) && <BearLoading overlay />}
      <section className="app-auth-phone" aria-label="LearnEase reset password">
        <button
          className="app-auth-back-btn"
          type="button"
          aria-label="Back to sign in"
          onClick={() => navigate("/app/signin")}
        >
          <ArrowLeft size={22} strokeWidth={2.5} />
        </button>

        <header className="app-auth-top">
          <img className="app-auth-logo" src={logo} alt="LearnEase" />
          <div className="app-auth-brand">
            <span className="app-auth-name">LearnEase</span>
          </div>
        </header>

        <div className="app-auth-panel">
          <h1 className="app-auth-title">{saved ? "Password changed" : canReset ? "New password" : "Reset password"}</h1>
          {saved ? (
            <p className="app-auth-copy">
              Your password was changed. Click <Link to="/app/signin">here</Link> to log in.
            </p>
          ) : checking || canReset ? (
            <>
              <p className="app-auth-copy">
                Choose a new password.
              </p>
              <form className="app-auth-form" onSubmit={handleSubmit} noValidate>
                <section className="app-auth-section">
                  <h2 className="app-auth-section-title">
                    <KeyRound size={18} />
                    New password
                  </h2>

                  <div className="app-auth-field">
                    <RequiredLabel htmlFor="app-reset-password">Password</RequiredLabel>
                    <div className="app-auth-input-wrap">
                      <input
                        id="app-reset-password"
                        className={`app-auth-input${password && !strongPassword ? " app-auth-input-invalid" : ""}`}
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="Create password"
                        required
                        aria-required="true"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        disabled={checking}
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
                    <RequiredLabel htmlFor="app-reset-confirm-password">Confirm password</RequiredLabel>
                    <div className="app-auth-input-wrap">
                      <input
                        id="app-reset-confirm-password"
                        className={`app-auth-input${confirmPasswordStarted && !passwordsMatch ? " app-auth-input-invalid" : ""}`}
                        type={showConfirmPassword ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="Repeat password"
                        required
                        aria-required="true"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        disabled={checking}
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
                    {passwordsMatch && <p className="app-auth-field-ok">Passwords match.</p>}
                  </div>
                </section>

                {error && <p className="app-auth-alert">{error}</p>}

                <p className="app-auth-required-note">
                  <span className="app-auth-required">*</span> Required fields
                </p>

                <button
                  className="app-auth-main-btn"
                  type="submit"
                  disabled={!canSubmit}
                  title={canSubmit ? "Save password" : "Fill in every required field to continue"}
                >
                  <KeyRound size={19} />
                  {loading ? "Saving password..." : "Save password"}
                </button>

                <p className="app-auth-link-line">
                  Remembered it? <Link to="/app/signin">Sign in</Link>
                </p>
              </form>
            </>
          ) : (
            <form className="app-auth-form" onSubmit={requestedEmail ? verifyCode : requestCode}>
              {notice && <p className="app-auth-copy" role="status">{notice}</p>}
              {error && <p className="app-auth-alert" role="alert">{error}</p>}
              {requestedEmail ? (
                <div className="app-auth-field">
                  <label htmlFor="app-reset-code">OTP number</label>
                  <input
                    id="app-reset-code"
                    className="app-auth-input"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={10}
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                    required
                  />
                </div>
              ) : (
                <div className="app-auth-field">
                  <label htmlFor="app-reset-email">Email address</label>
                  <input
                    id="app-reset-email"
                    className="app-auth-input"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </div>
              )}
              <button className="app-auth-main-btn" type="submit" disabled={loading || (!!requestedEmail && code.length < 6)}>
                {requestedEmail ? "Verify OTP" : "Send OTP"}
              </button>
              {requestedEmail && (
                <>
                  <button className="app-auth-link-button" type="button" disabled={loading} onClick={() => void requestCode()}>
                    Resend OTP
                  </button>
                  <button className="app-auth-link-button" type="button" disabled={loading} onClick={() => {
                    setRequestedEmail("");
                    setCode("");
                    setNotice("");
                    setError("");
                  }}>
                    Change email
                  </button>
                </>
              )}
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
