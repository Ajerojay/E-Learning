import LetterQuestPage from "./pages/Student/LetterQuestPage";
import "./AppLetterQuestPage.css";

// SUPABASE DATABASE: saves progress through gameProgressDb.ts / record_game_attempt RPC.
export default function AppLetterQuestPage() {
  return <LetterQuestPage mobileApp />;
}

