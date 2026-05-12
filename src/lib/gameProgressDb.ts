import { supabase } from "./supabase";

/** First published game in a learning category (same pattern as Logic / Phonics pages). */
export async function loadPrimaryGameCodeForCategory(
  categoryCode: string
): Promise<string | null> {
  const { data: cat, error: catErr } = await supabase
    .from("learning_categories")
    .select("id")
    .eq("code", categoryCode)
    .maybeSingle();

  if (catErr || !cat?.id) {
    if (catErr) console.error(`learning_categories ${categoryCode}:`, catErr.message);
    return null;
  }

  const { data: games, error: gErr } = await supabase
    .from("learning_games")
    .select("game_code")
    .eq("category_id", cat.id)
    .order("created_at", { ascending: true })
    .limit(1);

  if (gErr || !games?.[0]?.game_code) {
    if (gErr) console.error(`learning_games ${categoryCode}:`, gErr.message);
    return null;
  }

  return games[0].game_code;
}

export async function recordGameProgressRpc(
  childId: string,
  gameCode: string,
  score: number,
  wrongAttempts: number,
  finished: boolean
): Promise<void> {
  const { error } = await supabase.rpc("record_game_attempt", {
    p_child_id: childId,
    p_game_code: gameCode,
    p_score: score,
    p_wrong_attempts: wrongAttempts,
    p_finished: finished,
  });
  if (error) {
    console.error("record_game_attempt:", error.message);
  }
}
