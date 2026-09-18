import "./CertificateModal.css";

type CertificateModalProps = {
  open: boolean;
  childName: string;
  title: string;
  subtitle: string;
  onClose: () => void;
};

export default function CertificateModal({
  open,
  childName,
  title,
  subtitle,
  onClose,
}: CertificateModalProps) {
  if (!open) return null;

  const dateText = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="cert-overlay" role="dialog" aria-modal="true" aria-labelledby="cert-title">
      <div className="cert-sheet">
        <p className="cert-kicker">LearnEase Kids</p>
        <h2 id="cert-title">Certificate of Achievement</h2>
        <p className="cert-line">This is to certify that</p>
        <p className="cert-name">{childName}</p>
        <p className="cert-award">{title}</p>
        <p className="cert-sub">{subtitle}</p>
        <p className="cert-date">{dateText}</p>
        <p className="cert-seal" aria-hidden="true">⭐</p>
        <button type="button" className="cert-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
