import { useMemo } from "react";
import { Download } from "lucide-react";
import { certificateMessageFor, type CertificateKind } from "../../../../backend/gameCertificates";
import { CERTIFICATE_LAYOUT, certificateDateText, certificateImageFor } from "./downloadCertificate";
import "./CertificateModal.css";

const CONFETTI_COLORS = ["#ef5b6a", "#4d9fff", "#ffe066", "#62d26f", "#ff9f43", "#ff8fb8", "#7c6cf0"];

function CertificateConfetti() {
  const bits = useMemo(
    () =>
      Array.from({ length: 52 }, (_, index) => {
        const angle = (index / 52) * Math.PI * 2 + (index % 3) * 0.2;
        const distance = 18 + (index % 7) * 7;
        return {
          id: index,
          x: `${Math.cos(angle) * distance}vw`,
          y: `${Math.sin(angle) * distance * 0.55}vh`,
          delay: `${(index % 6) * 0.03}s`,
          color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
          round: index % 4 === 0,
        };
      }),
    []
  );

  return (
    <div className="cert-confetti" aria-hidden="true">
      {bits.map((bit) => (
        <span
          key={bit.id}
          className={`cert-confetti-bit${bit.round ? " is-round" : ""}`}
          style={{
            background: bit.color,
            animationDelay: bit.delay,
            ["--x" as string]: bit.x,
            ["--y" as string]: bit.y,
          }}
        />
      ))}
    </div>
  );
}

type CertificateModalProps = {
  open: boolean;
  childName: string;
  title: string;
  message?: string;
  subtitle: string;
  heading?: string;
  starsLine?: string;
  kind?: CertificateKind;
  starTotal?: number;
  starMax?: number;
  dateText?: string;
  onClose: () => void;
  onDownload?: () => void;
};

function PreviewStars({ total, max }: { total: number; max: number }) {
  const rowMax = max > 12 ? 10 : Math.max(1, Math.round(max));
  const rowTotal = max > 12 ? (total / max) * rowMax : Math.min(total, rowMax);
  return (
    <span className="cert-art-star-row" aria-hidden="true">
      {Array.from({ length: rowMax }, (_, index) => {
        const fill = rowTotal >= index + 1 ? "full" : rowTotal >= index + 0.5 ? "half" : "empty";
        return <span key={index} className={`cert-art-star is-${fill}`}>★</span>;
      })}
    </span>
  );
}

export default function CertificateModal({
  open,
  childName,
  title,
  message,
  subtitle,
  heading = "Certificate of Achievement",
  starsLine,
  kind,
  starTotal = 0,
  starMax = 9,
  dateText,
  onClose,
  onDownload,
}: CertificateModalProps) {
  if (!open) return null;

  const shownDate = dateText || certificateDateText();
  const shownMessage = message?.trim() || certificateMessageFor({ title, starTotal, starMax, kind, childName });
  const artwork = kind ? (
    <div className="cert-art">
      <img src={certificateImageFor(kind)} alt="" />
      <p className="cert-art-name" style={{ top: `${CERTIFICATE_LAYOUT.nameBaseline * 100}%` }}>{childName}</p>
      <p className="cert-art-message" style={{ top: `${CERTIFICATE_LAYOUT.messageY * 100}%` }}>{shownMessage}</p>
      <span className="cert-art-stars" style={{ top: `${CERTIFICATE_LAYOUT.starsY * 100}%` }}>
        <PreviewStars total={starTotal} max={starMax} />
      </span>
      {starsLine ? (
        <p className="cert-art-earned" style={{ top: `${CERTIFICATE_LAYOUT.earnedY * 100}%` }}>{starsLine}</p>
      ) : null}
      <p className="cert-art-date" style={{ top: `${CERTIFICATE_LAYOUT.dateBaseline * 100}%`, left: `${CERTIFICATE_LAYOUT.dateX * 100}%` }}>{shownDate}</p>
    </div>
  ) : null;

  return (
    <div className="cert-overlay" role="dialog" aria-modal="true" aria-labelledby="cert-title">
      {artwork ? <CertificateConfetti /> : null}
      <div className={`cert-sheet${artwork ? " cert-sheet-art" : ""}`}>
        {artwork}
        {artwork ? (
          <h2 id="cert-title" className="cert-sr">{heading}</h2>
        ) : (
          <>
            <p className="cert-kicker">LearnEase</p>
            <h2 id="cert-title">{heading}</h2>
            <p className="cert-line">This is to certify that</p>
            <p className="cert-name">{childName}</p>
            <p className="cert-award">{title}</p>
            <p className="cert-sub">{subtitle}</p>
            {starsLine && <p className="cert-stars">{starsLine}</p>}
            <p className="cert-date">{shownDate}</p>
            <p className="cert-seal" aria-hidden="true">⭐</p>
          </>
        )}
        <div className="cert-actions">
          {onDownload && (
            <button type="button" className="cert-download" onClick={onDownload}>
              <Download size={16} aria-hidden="true" />
              Download
            </button>
          )}
          <button type="button" className="cert-close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
