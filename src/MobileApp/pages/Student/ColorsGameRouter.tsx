import { Navigate, useParams } from "react-router-dom";
import ColorsQuestPage from "./ColorsQuestPage";
import ColorsBalloonPop from "./ColorsBalloonPop";
import ColorsPaintCanvas from "./ColorsPaintCanvas";
import "./ColorsQuestPage.css";
import "../../WebView/AppColorsQuestPage.css";

export default function ColorsGameRouter({ mobileApp = false }: { mobileApp?: boolean }) {
  const { gameId } = useParams();

  if (gameId === "sort") return <ColorsQuestPage mobileApp={mobileApp} />;
  if (gameId === "balloons") return <ColorsBalloonPop mobileApp={mobileApp} />;
  if (gameId === "paint") return <ColorsPaintCanvas mobileApp={mobileApp} />;
  return <Navigate to="/quest/colors" replace />;
}
