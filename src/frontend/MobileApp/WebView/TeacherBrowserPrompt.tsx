import { Globe, X } from "lucide-react";
import { TEACHER_PORTAL_URL, openTeacherPortal } from "./teacherPortal";

export default function TeacherBrowserPrompt({
  open,
  onClose,
  onStayInApp,
}: {
  open: boolean;
  onClose: () => void;
  onStayInApp?: () => void;
}) {
  if (!open) return null;

  return (
    <div className="app-auth-leave" role="dialog" aria-modal="true" aria-labelledby="teacher-browser-title">
      <section className="app-auth-leave-card">
        <button className="app-auth-leave-close" type="button" aria-label="Close" onClick={onClose}>
          <X size={18} />
        </button>
        <h2 id="teacher-browser-title">Open teacher portal?</h2>
        <p>You can open classroom tools in the browser, or stay in this app if the website does not load.</p>
        <p className="app-auth-portal-url">{TEACHER_PORTAL_URL.replace(/^https:\/\//, "")}</p>
        <button
          className="app-auth-main-btn"
          type="button"
          onClick={() => {
            openTeacherPortal();
            onClose();
          }}
        >
          <Globe size={18} />
          Open in browser
        </button>
        <button
          className="app-auth-secondary-btn"
          type="button"
          onClick={() => {
            onStayInApp?.();
            onClose();
          }}
        >
          Stay in the app
        </button>
      </section>
    </div>
  );
}
