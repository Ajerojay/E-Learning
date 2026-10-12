import { useEffect, useState } from "react";
import {
  GAME_CERTIFICATE_EVENT,
  GAME_CERTIFICATES,
  PROGRAM_STAR_MAX,
  certificateKindForGame,
  certificateMessageFor,
  earnedGameCertificates,
  gameCertificateByKey,
  starsEarnedLine,
  summarizeLevelStars,
  type CertificateKind,
  type GameCertificateAward,
} from "../../../../backend/gameCertificates";
import { getChildCertificateName } from "../../../../backend/childProgress";
import { readLocalQuestStars } from "../../../../backend/questLevelResults";
import CertificateModal from "./CertificateModal";
import { downloadCertificatePng } from "./downloadCertificate";

type OpenCertificate = {
  gameKey: string;
  certificateId: string;
  childName: string;
  heading: string;
  title: string;
  message: string;
  subtitle: string;
  starsLine: string;
  kind: CertificateKind;
  starTotal: number;
  starMax: number;
};

export default function GameCertificateHost() {
  const [open, setOpen] = useState<OpenCertificate | null>(null);

  useEffect(() => {
    const onCertificate = (event: Event) => {
      const detail = (event as CustomEvent<Partial<GameCertificateAward>>).detail;
      if (!detail?.gameKey || !gameCertificateByKey(detail.gameKey)) return;
      const game = gameCertificateByKey(detail.gameKey);
      if (!game) return;
      const starTotal = Number(detail.starTotal) || 0;
      const starMax = Number(detail.starMax) || 9;
      const perfect = Boolean(detail.perfect);
      void getChildCertificateName(detail.childId).then((childName) => {
        const local = detail.childId ? readLocalQuestStars(detail.childId) : {};
        const finishedEveryGame = earnedGameCertificates(local).length >= GAME_CERTIFICATES.length;
        let kind: CertificateKind = certificateKindForGame(perfect);
        let title = game.title;
        let subtitle = `${game.subject} · Completed all 3 levels`;
        let heading = perfect ? "Certificate" : "Certificate of Appreciation";
        let shownTotal = starTotal;
        let shownMax = starMax;
        if (finishedEveryGame && !perfect) {
          kind = "graduation";
          title = "Completed every game";
          subtitle = "Completed every game";
          heading = "Certificate of Graduation";
          shownTotal = GAME_CERTIFICATES.reduce(
            (sum, item) => sum + summarizeLevelStars(local[item.key] ?? []).starTotal,
            0
          );
          shownMax = PROGRAM_STAR_MAX;
        }
        setOpen({
          gameKey: game.key,
          certificateId: `${detail.childId}:${finishedEveryGame && !perfect ? "graduation" : game.key}`,
          childName,
          heading,
          title,
          message: certificateMessageFor({
            title,
            starTotal: shownTotal,
            starMax: shownMax,
            kind,
            childName,
          }),
          subtitle,
          starsLine: starsEarnedLine(shownTotal, shownMax),
          kind,
          starTotal: shownTotal,
          starMax: shownMax,
        });
      });
    };
    window.addEventListener(GAME_CERTIFICATE_EVENT, onCertificate);
    return () => window.removeEventListener(GAME_CERTIFICATE_EVENT, onCertificate);
  }, []);

  return (
    <CertificateModal
      open={Boolean(open)}
      childName={open?.childName ?? ""}
      title={open?.title ?? ""}
      message={open?.message}
      subtitle={open?.subtitle ?? ""}
      heading={open?.heading}
      starsLine={open?.starsLine}
      kind={open?.kind}
      starTotal={open?.starTotal}
      starMax={open?.starMax}
      onClose={() => setOpen(null)}
      onDownload={open ? () => {
        void downloadCertificatePng({
          childName: open.childName,
          certificateId: open.certificateId,
          title: open.title,
          message: open.message,
          subtitle: open.subtitle,
          kind: open.kind,
          starsLine: open.starsLine,
          starTotal: open.starTotal,
          starMax: open.starMax,
        });
      } : undefined}
    />
  );
}
