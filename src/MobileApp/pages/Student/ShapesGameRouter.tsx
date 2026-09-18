import { Navigate, useParams } from "react-router-dom";
import ShapesQuestPage from "./ShapesQuestPage";
import ShapesShadowMatch from "./ShapesShadowMatch";
import ShapesStarTrace from "./ShapesStarTrace";

export default function ShapesGameRouter() {
  const { gameId } = useParams();

  if (gameId === "house") return <ShapesQuestPage />;
  if (gameId === "shadow") return <ShapesShadowMatch />;
  if (gameId === "trace") return <ShapesStarTrace />;
  return <Navigate to="/quest/shapes" replace />;
}
