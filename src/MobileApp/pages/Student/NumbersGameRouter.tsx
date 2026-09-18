import { Navigate, useParams } from "react-router-dom";
import NumbersQuestPage from "./NumbersQuestPage";
import NumbersFeedingTime from "./NumbersFeedingTime";
import NumbersConnectDots from "./NumbersConnectDots";

export default function NumbersGameRouter(_props: { mobileApp?: boolean } = {}) {
  const { gameId } = useParams();

  if (gameId === "count") return <NumbersQuestPage />;
  if (gameId === "feed") return <NumbersFeedingTime />;
  if (gameId === "dots") return <NumbersConnectDots />;
  return <Navigate to="/quest/number" replace />;
}
