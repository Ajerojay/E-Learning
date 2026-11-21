import { supabase } from "./supabase";

export type LessonWrite = {
  title: string;
  description: string;
  grade_level: string;
  category: string;
  video_path: string;
  is_published: true;
};

const publishedFields = "id,title,description,grade_level,category,video_path,is_published";
const bucket = "lesson-videos";

export function lessonErrorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Unable to save the lesson. Please try again.";
}

export function lessonFilePath(id: string, name: string, category: string) {
  const safeName = name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120);
  return `Nursery/${category}/${id}-${safeName || "video"}`;
}

export async function uploadLessonFile(path: string, video: Blob) {
  const { error } = await supabase.storage.from(bucket).upload(path, video, { upsert: false });
  if (!error) return;
  // This path belongs to one upload attempt. A matching video may already be present if its response was lost.
  const conflict = /^(duplicate|keyalreadyexists|resourcealreadyexists|409)$/i.test(error.statusCode ?? "")
    || /^(the )?((resource|object|file|asset) )?already exists\.?$/i.test(error.message);
  if (conflict) {
    const { data } = await supabase.storage.from(bucket).info(path);
    if (data?.size === video.size) return;
  }
  throw new Error(`Video upload failed. ${error.message}`);
}

function categoryOccupied(category: string) {
  const name = category === "Alphabets" ? "Letters" : category;
  return new Error(`${name} already has a published lesson. Use Edit to replace its video.`);
}

type LessonPublication = { id: string; state: "new" | "archived" | "published" };

export async function findLessonPublication(category: string, gradeLevel: string, draftId: string): Promise<LessonPublication> {
  const aliases = category === "Alphabets" || category === "Letters" ? ["Alphabets", "Letters"] : [category];
  const { data: published, error: publishedError } = await supabase.from("video_lessons").select("id")
    .in("category", aliases).eq("is_published", true).limit(2);
  if (publishedError) throw publishedError;
  if (published?.length) {
    if (published.length === 1 && published[0].id === draftId) return { id: draftId, state: "published" };
    throw categoryOccupied(category);
  }
  const { data: archived, error: archivedError } = await supabase.from("video_lessons").select("id")
    .in("category", aliases).eq("grade_level", gradeLevel).eq("is_published", false)
    .order("created_at", { ascending: false }).order("id").limit(1).maybeSingle();
  if (archivedError) throw archivedError;
  return archived ? { id: archived.id, state: "archived" } : { id: draftId, state: "new" };
}

export async function publishTeacherLesson(slot: LessonPublication, payload: LessonWrite) {
  let writeError: { message: string; code?: string } | null = null;
  if (slot.state === "archived") {
    const { data, error } = await supabase.from("video_lessons").update(payload)
      .eq("id", slot.id).eq("is_published", false).select("id").maybeSingle();
    if (data && !error) return;
    writeError = error;
  } else if (slot.state === "new") {
    const { error } = await supabase.from("video_lessons").insert({ id: slot.id, ...payload });
    if (!error) return;
    writeError = error;
  }

  // Confirm the complete payload after an uncertain response. An ID alone could belong to a different save.
  const { data } = await supabase.from("video_lessons").select(publishedFields).eq("id", slot.id).maybeSingle();
  if (data && data.is_published && data.video_path === payload.video_path && data.title === payload.title
    && data.description === payload.description && data.grade_level === payload.grade_level && data.category === payload.category) return;
  if (data?.is_published) throw categoryOccupied(payload.category);
  if (writeError?.code === "23505") {
    await findLessonPublication(payload.category, payload.grade_level, slot.id);
    throw new Error("Supabase found an existing lesson with the same details. Refresh Lessons & Videos before trying again.");
  }
  throw new Error(writeError ? `Could not publish the lesson. ${writeError.message}` : "Supabase did not save the lesson. Refresh and try again.");
}

function isDatabaseUnavailable(status: number, code?: string) {
  return status === 0 || status === 502 || status === 503 || status === 504 || /^PGRST00[0-3]$/.test(code ?? "");
}

export async function archiveTeacherLesson(lesson: { id: string; title: string; video_path: string }) {
  const retryDelays = [0, 1000, 2500];
  for (const delay of retryDelays) {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    const query = supabase.from("video_lessons").update({ is_published: false })
      .eq("id", lesson.id).eq("is_published", true).eq("title", lesson.title);
    const matchedVideo = lesson.video_path == null ? query.is("video_path", null) : query.eq("video_path", lesson.video_path);
    const { data, error, status } = await matchedVideo.select("id,is_published").maybeSingle();
    if (!error && data?.is_published === false) return;
    if (error && isDatabaseUnavailable(status, error.code)) continue;

    const verification = await supabase.from("video_lessons").select("id,is_published")
      .eq("id", lesson.id).maybeSingle();
    if (verification.data?.is_published === false) return;
    if (error) throw new Error(`Could not remove the lesson. ${error.message}`);
    if (verification.error && isDatabaseUnavailable(verification.status, verification.error.code)) continue;
    throw new Error("The lesson may have changed or is still published. Refresh and try again.");
  }

  // The last request may have reached the database even if its response timed out.
  const { data } = await supabase.from("video_lessons").select("id,is_published")
    .eq("id", lesson.id).maybeSingle();
  if (data?.is_published === false) return;
  throw new Error("Supabase is temporarily unavailable. The removal could not be confirmed. Try again in a moment.");
}
