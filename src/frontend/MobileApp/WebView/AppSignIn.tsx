import { useEffect, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, KeyRound, LogIn } from "lucide-react";
import "./AppAuth.css";
import logo from "../../../../images/learnease logo-no bg.png";
import { signInParentAccount } from "../../../backend/supabaseAuth";
import { getOrCreateActiveChildId, isSignedInParent, lastParentRoute } from "../../../backend/childProgress";
import { supabase } from "../../../backend/supabase";
import { authenticateOfflineParent, cacheOfflineChild, cacheOfflineParentLogin } from "../../../backend/offlineSqlite";
import { authenticateOffline, cacheVerifiedLogin } from "../../../backend/offlineAuth";
import BearLoading from "../BearLoading";
import { isMobileApp } from "../isMobileApp";
import TeacherLogin from "./TeacherLogin";
import TeacherBrowserPrompt from "./TeacherBrowserPrompt";

const TEACHER_USERNAME = "teacher";
const TEACHER_PASSWORD = "teacher123";

export default function AppSignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [teacherFormOpen, setTeacherFormOpen] = useState(false);
  const [browserPrompt, setBrowserPrompt] = useState(false);
  const [signInNotice] = useState(
    location.state && typeof location.state === "object" && "emailJustVerified" in location.state
      && (location.state as { emailJustVerified?: boolean }).emailJustVerified
      ? "Your email is verified. Sign in with your username or email."
      : ""
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void import("./AppParentDashboard");
  }, []);

  useEffect(() => {
    if (isSignedInParent()) navigate(lastParentRoute(), { replace: true });
  }, [navigate]);

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
    const finishTeacherLogin = async (teacherUser: Record<string, unknown>) => {
      localStorage.setItem("user", JSON.stringify(teacherUser));
      await cacheVerifiedLogin(cleanUsername, cleanPassword, teacherUser as { role: "teacher" });
      if (isMobileApp()) {
        setBrowserPrompt(true);
        return;
      }
      markSignedIn();
      navigate("/teacher-dashboard");
    };
    const finishCachedLogin = async () => {
      const cached = await authenticateOffline(cleanUsername, cleanPassword);
      if (!cached) return false;
      if (cached.role === "teacher") {
        await finishTeacherLogin(cached);
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
        await finishTeacherLogin({ role: "teacher", id: "temporary-teacher", username: cleanUsername, source: "app" });
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

      try {
        const { data: teacherRows, error: teacherError } = await supabase.rpc(
          "authenticate_teacher",
          { p_username: cleanUsername, p_password: cleanPassword }
        );
        if (teacherError) console.error("Teacher login error:", teacherError.message);
        const teacher = Array.isArray(teacherRows) ? teacherRows[0] : teacherRows;
        if (teacher) {
          await finishTeacherLogin({ ...teacher, role: "teacher", source: "app" });
          return;
        }
      } catch (teacherLookupError) {
        console.warn("Teacher login skipped:", teacherLookupError);
      }

      let parent;
      try {
        parent = await signInParentAccount(cleanUsername, cleanPassword);
      } catch (loginError) {
        if (isMobileApp() && navigator.onLine) {
          try {
            const { data: teacherRows, error: teacherError } = await supabase.rpc(
              "authenticate_teacher",
              { p_username: cleanUsername, p_password: cleanPassword }
            );
            if (teacherError) console.error("Teacher login error:", teacherError.message);
            const teacher = Array.isArray(teacherRows) ? teacherRows[0] : teacherRows;
            if (teacher) {
              await finishTeacherLogin({ ...teacher, role: "teacher", source: "app" });
              return;
            }
          } catch (teacherLookupError) {
            console.warn("Teacher login skipped:", teacherLookupError);
          }
        }
        if (await finishCachedLogin()) return;
        setError(loginError instanceof Error ? loginError.message : "Something went wrong while logging in.");
        return;
      }

      localStorage.setItem(
        "user",
        JSON.stringify({ role: "parent", id: parent.id, username: parent.username })
      );
      markSignedIn();
      navigate("/parent-dashboard", { replace: true });
      void (async () => {
        try {
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
        }
      })();
    } catch (caughtError) {
      console.error(caughtError);
      if (await finishCachedLogin()) return;
      setError(caughtError instanceof Error ? caughtError.message : "Something went wrong while logging in.");
    } finally {
      if (!keepLoading) setLoading(false);
    }
  };

  if (teacherFormOpen) {
    return <TeacherLogin onBack={() => setTeacherFormOpen(false)} />;
  }

  return (
    <main className="app-auth-shell">
      {loading && <BearLoading overlay />}
      <TeacherBrowserPrompt
        open={browserPrompt}
        onClose={() => setBrowserPrompt(false)}
        onStayInApp={() => {
          setBrowserPrompt(false);
          navigate("/teacher-dashboard");
        }}
      />
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

          <form className="app-auth-form" onSubmit={handleLogin}>
            {error && <p className="app-auth-alert">{error}</p>}
            {signInNotice && <p className="app-auth-success">{signInNotice}</p>}

            <div className="app-auth-field">
              <label htmlFor="app-signin-username">Username or email</label>
              <input
                id="app-signin-username"
                className="app-auth-input"
                type="text"
                autoComplete="username"
                placeholder="Enter username or email"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>

            <div className="app-auth-field">
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
            </div>

            <button className="app-auth-main-btn" type="submit" disabled={loading}>
              <LogIn size={19} />
              {loading ? "Please wait..." : "Sign in"}
            </button>

            <button
              className="app-auth-link-button"
              type="button"
              onClick={() => navigate("/app/forgot-password")}
            >
              Forgot password?
            </button>

            <button
              className="app-auth-secondary-btn"
              type="button"
              onClick={() => navigate("/student-access")}
            >
              <KeyRound size={19} />
              Enter kids PIN
            </button>

            <p className="app-auth-link-line">
              New parent? <Link to="/app/signup">Create account</Link>
            </p>
            <p className="app-auth-link-line">
              Teacher?{" "}
              {isMobileApp() ? (
                <button className="app-auth-link-button" type="button" onClick={() => setTeacherFormOpen(true)}>
                  Teacher sign in
                </button>
              ) : <Link to="/teacher-login">Teacher sign in</Link>}
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}
