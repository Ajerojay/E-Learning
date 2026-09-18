import { Navigate, useParams } from "react-router-dom";
import PhonicsQuestPage from "./PhonicsQuestPage";
import PhonicsBeginningSounds from "./PhonicsBeginningSounds";
import PhonicsSingingVowels from "./PhonicsSingingVowels";

export default function PhonicsGameRouter({ mobileApp = false }: { mobileApp?: boolean } = {}) {
  const { gameId } = useParams();

  if (gameId === "sound") return <PhonicsQuestPage mobileApp={mobileApp} />;
  if (gameId === "beginning") return <PhonicsBeginningSounds />;
  if (gameId === "vowels") return <PhonicsSingingVowels />;
  return <Navigate to="/quest/phonics" replace />;
}
