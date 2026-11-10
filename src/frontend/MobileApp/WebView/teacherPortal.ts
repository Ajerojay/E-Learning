export const TEACHER_PORTAL_URL = "https://e-learning-5sk.pages.dev/teacher-login";

export function openTeacherPortal() {
  const browser = (window as Window & { AndroidBrowser?: { open?: (url: string) => void } }).AndroidBrowser;
  if (typeof browser?.open === "function") {
    browser.open(TEACHER_PORTAL_URL);
    return;
  }
  window.open(TEACHER_PORTAL_URL, "_blank", "noopener,noreferrer");
}
