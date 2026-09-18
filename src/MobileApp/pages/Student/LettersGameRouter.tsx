import { Navigate, useParams } from "react-router-dom";
import LetterQuestPage from "./LetterQuestPage";
import LettersMamaBaby from "./LettersMamaBaby";
import LettersAlphabetTrain from "./LettersAlphabetTrain";
import "../../WebView/AppLetterQuestPage.css";

export default function LettersGameRouter({ mobileApp = false }: { mobileApp?: boolean }) {
  const { gameId } = useParams();

  if (gameId === "match") return <LetterQuestPage mobileApp={mobileApp} />;
  if (gameId === "mama") return <LettersMamaBaby />;
  if (gameId === "train") return <LettersAlphabetTrain />;
  return <Navigate to="/quest/letter" replace />;
}
