import { useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, KeyRound, LogIn, Mail } from "lucide-react";
import "./AppAuth.css";
import logo from "../../../../images/learnease logo-no bg.png";
import { sendPasswordReset, signInParentAccount } from "../../../backend/supabaseAuth";
import { getOrCreateActiveChildId } from "../../../backend/childProgress";
import { supabase } from "../../../backend/supabase";
import { authenticateOfflineParent, cacheOfflineChild, cacheOfflineParentLogin } from "../../../backend/offlineSqlite";
import { authenticateOffline, cacheVerifiedLogin } from "../../../backend/offlineAuth";
import BearLoading from "../BearLoading";
import { isMobileApp } from "../isMobileApp";

const TEACHER_USERNAME = "teacher";
const TEACHER_PASSWORD = "teacher123";

function teacherSiteUrl() {
  const { origin, protocol } = window.location;
  if (!/^https?:$/i.test(protocol)) return "";
  try {
    const host = new URL(origin).hostname;
    if (host === "localhost" || host === "127.0.0.1") return "";
  } catch {
    return "";
  }
  return `${origin}/`;
}

function openTeacherSite() {
  const url = teacherSiteUrl();
  if (!url) return;
  const browser = (window as Window & { AndroidBrowser?: { open?: (url: string) => void } }).AndroidBrowser;
  if (typeof browser?.open === "function") browser.open(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

export default function AppSignIn() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const [resetMode, setResetMode] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const cleanUsername = username.trim();
    const cleanPassword = password.trim();

    if (!cleanUsername || !cleanPassword) {
      setError("Please enter your username or email, and your password.");
      return;
    }

    let keepLoading = false;
    const markSignedIn = () => {
      keepLoading = true;
    };
    const finishCachedLogin = async () => {
      const cached = await authenticateOffline(cleanUsername, cleanPassword);
      if (!cached) return false;
      if (cached.role === "teacher") {
        if (isMobileApp()) {
          setLeaveOpen(true);
          return true;
        }
        localStorage.setItem("user", JSON.stringify(cached));
        markSignedIn();
        navigate("/teacher-dashboard");
        return true;
      }
      localStorage.setItem("user", JSON.stringify(cached));
      markSignedIn();
      navigate("/parent-dashboard");
      return true;
    };

    try {
      flushSync(() => setLoading(true));

      if (cleanUsername.toLowerCase() === TEACHER_USERNAME && cleanPassword === TEACHER_PASSWORD) {
        if (isMobileApp()) {
          setLeaveOpen(true);
          return;
        }
        const teacherUser = { role: "teacher" as const, id: "temporary-teacher", username: cleanUsername, source: "app" };
        localStorage.setItem("user", JSON.stringify(teacherUser));
        await cacheVerifiedLogin(cleanUsername, cleanPassword, teacherUser);
        markSignedIn();
        navigate("/teacher-dashboard");
        return;
      }

      if (!navigator.onLine) {
        const offlineParent = await authenticateOfflineParent(cleanUsername, cleanPassword);
        if (offlineParent) {
          localStorage.setItem("user", JSON.stringify({ role: "parent", id: offlineParent.id, username: offlineParent.username, source: "offline" }));
          if (offlineParent.activeChildId) localStorage.setItem("activeChildId", offlineParent.activeChildId);
          markSignedIn();
          navigate("/parent-dashboard");
          return;
        }
        if (await finishCachedLogin()) return;
      }

      if (isMobileApp() && navigator.onLine) {
        try {
          const { data: teacherRows } = await supabase.rpc(
            "authenticate_teacher",
            { p_username: cleanUsername, p_password: cleanPassword }
          );
          const teacher = Array.isArray(teacherRows) ? teacherRows[0] : teacherRows;
          if (teacher) {
            setLeaveOpen(true);
            return;
          }
        } catch (teacherLookupError) {
          console.warn("Teacher login skipped:", teacherLookupError);
        }
      }

      if (!isMobileApp()) try {
        const { data: teacherRows, error: teacherError } = await supabase.rpc(
          "authenticate_teacher",
          { p_username: cleanUsername, p_password: cleanPassword }
        );
        if (teacherError) console.error("Teacher login error:", teacherError.message);
        const teacher = Array.isArray(teacherRows) ? teacherRows[0] : teacherRows;
        if (teacher) {
          const teacherUser = { ...teacher, role: "teacher" as const, source: "app" };
          localStorage.setItem("user", JSON.stringify(teacherUser));
          await cacheVerifiedLogin(cleanUsername, cleanPassword, teacherUser);
          markSignedIn();
          navigate("/teacher-dashboard");
          return;
        }
      } catch (teacherLookupError) {
        console.warn("Teacher login skipped:", teacherLookupError);
      }

      let parent;
      try {
        parent = await signInParentAccount(cleanUsername, cleanPassword);
      } catch (loginError) {
        if (await finishCachedLogin()) return;
        setError(loginError instanceof Error ? loginError.message : "Something went wrong while logging in.");
        return;
      }

      try {
        localStorage.setItem(
          "user",
          JSON.stringify({ role: "parent", id: parent.id, username: parent.username })
        );
        const childId = await getOrCreateActiveChildId();
        const { data: childRows } = await supabase
          .from("children_accounts")
          .select("id, parent_id, child_name, first_name, last_name, pin_code, is_active")
          .eq("parent_id", parent.id)
          .eq("is_active", true);
        const rows = Array.isArray(childRows) ? childRows : childRows ? [childRows] : [];
        const child = rows.find((row) => String(row.id) === childId) ?? rows.find((row) => {
          const name = `${row.first_name || ""} ${row.last_name || ""}`.trim() || row.child_name || "";
          return name && name !== "Child";
        }) ?? rows[0];

        if (child?.id) {
          localStorage.setItem("activeChildId", String(child.id));
          if (child.pin_code) localStorage.setItem("studentPin", child.pin_code);
          await cacheOfflineChild({
            id: String(child.id),
            parentId: String(child.parent_id),
            childName: child.child_name,
            firstName: child.first_name,
            lastName: child.last_name,
            pinCode: child.pin_code,
            isActive: child.is_active,
          });
        }

        await cacheOfflineParentLogin(parent.id, parent.username, cleanPassword, child?.id ? String(child.id) : childId);
      } catch (cacheError) {
        console.warn("Parent session extras failed:", cacheError);
        localStorage.setItem(
          "user",
          JSON.stringify({ role: "parent", id: parent.id, username: parent.username })
        );
      }
      markSignedIn();
      navigate("/parent-dashboard");
    } catch (caughtError) {
      console.error(caughtError);
      if (await finishCachedLogin()) return;
      setError(caughtError instanceof Error ? caughtError.message : "Something went wrong while logging in.");
    } finally {
      if (!keepLoading) setLoading(false);
    }
  };

  const handlePasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setResetMessage("");
    const cleanEmail = username.trim().toLowerCase();
    if (!cleanEmail) {
      setError("Enter your email address first.");
      return;
    }

    try {
      setLoading(true);
      await sendPasswordReset(cleanEmail);
      setResetMessage("Password reset instructions were sent to your email.");
    } catch (caughtError) {
      console.error(caughtError);
      setError("We could not send the reset email. Check the email address and try again.");
    } finally {
      setLoading(false);
    }
  };

  const siteUrl = teacherSiteUrl();

  return (
    <main className="app-auth-shell">
      {loading && <BearLoading overlay />}
      {leaveOpen && (
        <div className="app-auth-leave" role="dialog" aria-modal="true" aria-labelledby="leave-app-title">
          <div className="app-auth-leave-card">
            <h2 id="leave-app-title">Leaving the app</h2>
            <p>You are leaving the LearnEase app. The teacher portal opens in your browser.</p>
            <p>{siteUrl
              ? "Sign in again there with the same username and password. The app stays for parents and kids."
              : "Open this website in Chrome or Safari on your phone or computer. This installed app has no public teacher address."}</p>
            <button className="app-auth-main-btn" type="button" onClick={openTeacherSite} disabled={!siteUrl}>Open browser</button>
            <button className="app-auth-secondary-btn" type="button" onClick={() => setLeaveOpen(false)}>Stay in the app</button>
          </div>
        </div>
      )}
      <section className="app-auth-phone" aria-label="LearnEase mobile app sign in">
        <header className="app-auth-top">
          <img className="app-auth-logo" src={logo} alt="LearnEase" />
          <div className="app-auth-brand">
            <span className="app-auth-name">LearnEase</span>
          </div>
        </header>

        <div className="app-auth-panel">
          <h1 className="app-auth-title app-auth-welcome">WELCOME PARENT!</h1>
          <p className="app-auth-copy app-auth-tagline">Learning made fun and easy!</p>

          <form className="app-auth-form" onSubmit={resetMode ? handlePasswordReset : handleLogin}>
            {error && <p className="app-auth-alert">{error}</p>}
            {resetMessage && <p className="app-auth-success">{resetMessage}</p>}

            <div className="app-auth-field">
              <label htmlFor="app-signin-username">{resetMode ? "Email address" : "Username or email"}</label>
              <input
                id="app-signin-username"
                className="app-auth-input"
                type={resetMode ? "email" : "text"}
                autoComplete={resetMode ? "email" : "username"}
                placeholder={resetMode ? "Enter email address" : "Enter username or email"}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>

            {!resetMode && <div className="app-auth-field">
              <label htmlFor="app-signin-password">Password</label>
              <div className="app-auth-input-wrap">
                <input
                  id="app-signin-password"
                  className="app-auth-input"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter password"
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
            </div>}

            <button className="app-auth-main-btn" type="submit" disabled={loading}>
              {resetMode ? <Mail size={19} /> : <LogIn size={19} />}
              {loading ? "Please wait..." : resetMode ? "Send reset email" : "Sign in"}
            </button>

            <button
              className="app-auth-link-button"
              type="button"
              onClick={() => { setResetMode((current) => !current); setError(""); setResetMessage(""); }}
            >
              {resetMode ? "Back to sign in" : "Forgot password?"}
            </button>

            {!resetMode && <button
              className="app-auth-secondary-btn"
              type="button"
              onClick={() => navigate("/student-access")}
            >
              <KeyRound size={19} />
              Enter kids PIN
            </button>}

            {!resetMode && <p className="app-auth-link-line">
              New parent? <Link to="/app/signup">Create account</Link>
            </p>}
          </form>
        </div>
      </section>
    </main>
  );
}
