import { Navigate, useParams } from "react-router-dom";
import LogicQuestPage from "./LogicQuestPage";
import LogicBigSmall from "./LogicBigSmall";
import LogicOddOneOut from "./LogicOddOneOut";

export default function LogicGameRouter({ mobileApp = false }: { mobileApp?: boolean } = {}) {
  const { gameId } = useParams();

  if (gameId === "pattern") return <LogicQuestPage />;
  if (gameId === "size") return <LogicBigSmall mobileApp={mobileApp} />;
  if (gameId === "odd") return <LogicOddOneOut />;
  return <Navigate to="/quest/logic" replace />;
}
