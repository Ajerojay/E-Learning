import { useEffect, useState } from "react";
import { Check, Download, X } from "lucide-react";
import {
  CERTIFICATE_DOWNLOAD_ERROR_EVENT,
  CERTIFICATE_DOWNLOAD_EVENT,
  CERTIFICATE_REDOWNLOAD_EVENT,
  downloadCertificatePng,
  type CertificateDownloadInput,
} from "./downloadCertificate";
import {
  ATTENDANCE_PDF_DOWNLOAD_ERROR_EVENT,
  ATTENDANCE_PDF_DOWNLOAD_EVENT,
  ATTENDANCE_PDF_REDOWNLOAD_EVENT,
  downloadTextPdf,
  type AttendancePdfDownloadInput,
} from "../../teacher/attendanceRecords";
import "./CertificateDownloadNotice.css";

type Notice =
  | { type: "success"; kind: "certificate" | "attendance" }
  | { type: "repeat"; kind: "certificate"; input: CertificateDownloadInput }
  | { type: "repeat"; kind: "attendance"; input: AttendancePdfDownloadInput }
  | { type: "error"; kind: "certificate" | "attendance"; message: string }
  | null;

export default function CertificateDownloadNotice() {
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    const showCertificateSuccess = () => setNotice({ type: "success", kind: "certificate" });
    const showCertificateRepeat = (event: Event) => {
      const input = (event as CustomEvent<CertificateDownloadInput>).detail;
      setNotice({ type: "repeat", kind: "certificate", input });
    };
    const showCertificateError = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      setNotice({ type: "error", kind: "certificate", message });
    };
    const showAttendanceSuccess = () => setNotice({ type: "success", kind: "attendance" });
    const showAttendanceRepeat = (event: Event) => {
      const input = (event as CustomEvent<AttendancePdfDownloadInput>).detail;
      setNotice({ type: "repeat", kind: "attendance", input });
    };
    const showAttendanceError = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      setNotice({ type: "error", kind: "attendance", message });
    };
    window.addEventListener(CERTIFICATE_DOWNLOAD_EVENT, showCertificateSuccess);
    window.addEventListener(CERTIFICATE_REDOWNLOAD_EVENT, showCertificateRepeat);
    window.addEventListener(CERTIFICATE_DOWNLOAD_ERROR_EVENT, showCertificateError);
    window.addEventListener(ATTENDANCE_PDF_DOWNLOAD_EVENT, showAttendanceSuccess);
    window.addEventListener(ATTENDANCE_PDF_REDOWNLOAD_EVENT, showAttendanceRepeat);
    window.addEventListener(ATTENDANCE_PDF_DOWNLOAD_ERROR_EVENT, showAttendanceError);
    return () => {
      window.removeEventListener(CERTIFICATE_DOWNLOAD_EVENT, showCertificateSuccess);
      window.removeEventListener(CERTIFICATE_REDOWNLOAD_EVENT, showCertificateRepeat);
      window.removeEventListener(CERTIFICATE_DOWNLOAD_ERROR_EVENT, showCertificateError);
      window.removeEventListener(ATTENDANCE_PDF_DOWNLOAD_EVENT, showAttendanceSuccess);
      window.removeEventListener(ATTENDANCE_PDF_REDOWNLOAD_EVENT, showAttendanceRepeat);
      window.removeEventListener(ATTENDANCE_PDF_DOWNLOAD_ERROR_EVENT, showAttendanceError);
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
        <p>{notice.kind === "certificate"
          ? "This certificate was already downloaded on this device. Download another copy?"
          : "This attendance PDF was already downloaded on this device. Download another copy?"}</p>
        <div className="certificate-download-notice-actions">
          <button type="button" className="certificate-download-notice-cancel" onClick={() => setNotice(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="certificate-download-notice-again"
            onClick={() => {
              const { input, kind } = notice;
              setNotice(null);
              if (kind === "certificate") void downloadCertificatePng({ ...input, allowRepeat: true });
              else downloadTextPdf(input.filename, input.text, true);
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
          ? notice.kind === "certificate" ? "Certificate downloaded to this device." : "Attendance PDF downloaded to this device."
          : notice.kind === "certificate"
            ? `Certificate download failed: ${notice.message}`
            : `Attendance PDF download failed: ${notice.message}`}
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
