import { Component, type ErrorInfo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Page failed to open:", error, info.componentStack);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main style={{ minHeight: "100dvh", display: "grid", placeContent: "center", gap: 18, padding: 28, textAlign: "center", background: "#f4faff", color: "#263a56" }}>
      <span aria-hidden="true" style={{ fontSize: 60 }}>🧸</span>
      <h1 style={{ fontSize: 28, margin: 0 }}>Let's try that again</h1>
      <p style={{ maxWidth: 420, margin: 0 }}>This page could not open. Your saved progress is still on this device.</p>
      <button style={{ background: "#6778dc", color: "white", borderRadius: 22 }} onClick={() => window.location.reload()}>Try again</button>
      <a href="/student" style={{ color: "#354f86" }}>Back to learning</a>
    </main>;
  }
}

export default function PageErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return <PageBoundary key={location.pathname}>{children}</PageBoundary>;
}
