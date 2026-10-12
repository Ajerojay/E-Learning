import { useEffect, useState } from "react";
import { Check, Download, X } from "lucide-react";
import {
  CERTIFICATE_DOWNLOAD_ERROR_EVENT,
  CERTIFICATE_DOWNLOAD_EVENT,
  CERTIFICATE_REDOWNLOAD_EVENT,
  downloadCertificatePng,
  type CertificateDownloadInput,
} from "./downloadCertificate";
import "./CertificateDownloadNotice.css";

type Notice =
  | { type: "success" }
  | { type: "repeat"; input: CertificateDownloadInput }
  | { type: "error"; message: string }
  | null;

export default function CertificateDownloadNotice() {
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    const showSuccess = () => setNotice({ type: "success" });
    const showRepeat = (event: Event) => {
      const input = (event as CustomEvent<CertificateDownloadInput>).detail;
      setNotice({ type: "repeat", input });
    };
    const showError = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      setNotice({ type: "error", message });
    };
    window.addEventListener(CERTIFICATE_DOWNLOAD_EVENT, showSuccess);
    window.addEventListener(CERTIFICATE_REDOWNLOAD_EVENT, showRepeat);
    window.addEventListener(CERTIFICATE_DOWNLOAD_ERROR_EVENT, showError);
    return () => {
      window.removeEventListener(CERTIFICATE_DOWNLOAD_EVENT, showSuccess);
      window.removeEventListener(CERTIFICATE_REDOWNLOAD_EVENT, showRepeat);
      window.removeEventListener(CERTIFICATE_DOWNLOAD_ERROR_EVENT, showError);
    };
  }, []);

  useEffect(() => {
    if (!notice || notice.type === "repeat") return;
    const timeout = window.setTimeout(() => setNotice(null), notice.type === "error" ? 4500 : 2600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!notice) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotice(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [notice]);

  if (!notice) return null;

  if (notice.type === "repeat") {
    return (
      <div className="certificate-download-notice is-repeat" role="alertdialog" aria-live="assertive">
        <span className="certificate-download-notice-icon is-repeat" aria-hidden="true">
          <Download size={19} />
        </span>
        <p>This certificate was already downloaded on this device. Download another copy?</p>
        <div className="certificate-download-notice-actions">
          <button type="button" className="certificate-download-notice-cancel" onClick={() => setNotice(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="certificate-download-notice-again"
            onClick={() => {
              const { input } = notice;
              setNotice(null);
              void downloadCertificatePng({ ...input, allowRepeat: true });
            }}
          >
            Download again
          </button>
        </div>
        <button
          type="button"
          className="certificate-download-notice-close"
          onClick={() => setNotice(null)}
          aria-label="Dismiss download confirmation"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className={`certificate-download-notice is-${notice.type}`} role="status" aria-live="polite">
      <span className="certificate-download-notice-icon" aria-hidden="true">
        {notice.type === "success" ? <Check size={19} strokeWidth={3} /> : <X size={19} />}
      </span>
      <p>
        {notice.type === "success"
          ? "Certificate downloaded to this device."
          : `Certificate download failed: ${notice.message}`}
      </p>
      <button
        type="button"
        className="certificate-download-notice-close"
        onClick={() => setNotice(null)}
        aria-label="Dismiss notification"
      >
        <X size={16} />
      </button>
    </div>
  );
}
