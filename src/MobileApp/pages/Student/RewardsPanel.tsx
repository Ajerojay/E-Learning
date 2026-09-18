import CertificateModal from "./CertificateModal";
import "./RewardsPanel.css";
import { useState } from "react";
import type { ChildRewardSummary } from "../../../lib/childRewards";

type RewardsPanelProps = {
  open: boolean;
  childName: string;
  summary: ChildRewardSummary;
  onClose: () => void;
};

export default function RewardsPanel({ open, childName, summary, onClose }: RewardsPanelProps) {
  const [certificate, setCertificate] = useState<ChildRewardSummary["certificates"][number] | null>(null);
  if (!open) return null;

  return (
    <div className="rewards-overlay" role="dialog" aria-modal="true" aria-labelledby="rewards-title">
      <div className="rewards-sheet">
        <button type="button" className="rewards-x" onClick={onClose} aria-label="Close rewards">
          ×
        </button>
        <h2 id="rewards-title">My Rewards</h2>
        <p className="rewards-stars">⭐ {summary.stars} stars</p>
        <p className="rewards-copy">Finish a level to earn stars. Finish a quest for a sticker. Finish all 3 levels for a certificate.</p>

        <h3>Stickers</h3>
        <div className="rewards-stickers">
          {summary.stickers.map((sticker) => (
            <div
              key={sticker.key}
              className={`rewards-sticker${sticker.earned ? " is-earned" : ""}${sticker.complete ? " is-gold" : ""}`}
            >
              <span aria-hidden="true">{sticker.earned ? sticker.icon : "🔒"}</span>
              <b>{sticker.label}</b>
            </div>
          ))}
        </div>

        <h3>Certificates</h3>
        {summary.certificates.length === 0 ? (
          <p className="rewards-empty">No certificates yet. Complete all 3 levels in a quest!</p>
        ) : (
          <ul className="rewards-certs">
            {summary.certificates.map((item) => (
              <li key={item.key}>
                <button type="button" onClick={() => setCertificate(item)}>
                  <span aria-hidden="true">{item.icon}</span>
                  <span>
                    <b>{item.title}</b>
                    <small>{item.subtitle}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CertificateModal
        open={Boolean(certificate)}
        childName={childName}
        title={certificate?.title ?? ""}
        subtitle={certificate?.subtitle ?? ""}
        onClose={() => setCertificate(null)}
      />
    </div>
  );
}
