import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import "./AppAuth.css";
import logo from "../../../../images/learnease logo-no bg.png";
import { completePendingParentRegistration, openEmailLinkSession } from "../../../backend/supabaseAuth";
import { pendingEmailLink, supabase } from "../../../backend/supabase";
import BearLoading from "../BearLoading";
import { isMobileApp } from "../isMobileApp";

const PARENT_SIGN_IN_PATH = "/app/signin";

function ParentSignInLink() {
  if (isMobileApp() || !/Android/i.test(navigator.userAgent)) {
    return <Link to={PARENT_SIGN_IN_PATH}>here</Link>;
  }
  const fallback = encodeURIComponent(new URL("/?view=parent-signin", window.location.origin).href);
  const openApp = `intent://open${PARENT_SIGN_IN_PATH}#Intent;scheme=learnease;package=com.learnease.app;S.browser_fallback_url=${fallback};end`;
  return <a href={openApp}>here</a>;
}

export default function AppEmailVerified() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void openEmailLinkSession("signup")
      .then(async (result) => {
        if (!active) return;
        if (result === "wrong-type") {
          navigate("/reset-password", { replace: true });
          return;
        }
        if (result !== "ready") {
          setError("This verification link is invalid or has expired. Open the latest email, or sign in if you already confirmed it.");
          return;
        }
        try {
          const { data } = await supabase.auth.getSession();
          if (data.session?.user) await completePendingParentRegistration(data.session.user);
        } catch (caughtError) {
          console.error(caughtError);
        }
        if (active) setVerified(true);
        try {
          const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
          if (signOutError) console.error(signOutError);
        } catch (signOutError) {
          console.error(signOutError);
        }
      })
      .catch((caughtError) => {
        if (!active) return;
        setError(caughtError instanceof Error ? caughtError.message : "This verification link is invalid or has expired.");
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <main className="app-auth-shell">
      {checking && <BearLoading overlay />}
      <section className="app-auth-phone" aria-label="LearnEase email verified">
        <button
          className="app-auth-back-btn"
          type="button"
          aria-label="Back to sign in"
          onClick={() => navigate(PARENT_SIGN_IN_PATH)}
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
          <h1 className="app-auth-title">
            {checking ? "Verifying your email" : verified ? "Email verified" : "Confirm your email"}
          </h1>
          {verified ? (
            <p className="app-auth-copy">
              Your email is verified. Click <ParentSignInLink /> to sign in with your username or email.
            </p>
          ) : !checking && (
            <>
              {error && <p className="app-auth-alert" role="alert">{error}</p>}
              {pendingEmailLink.errorCode === "otp_expired" && (
                <p className="app-auth-copy">Open the latest confirmation email. If you already confirmed your email, you can sign in below.</p>
              )}
              <p className="app-auth-copy">
                Click <ParentSignInLink /> to log in.
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
