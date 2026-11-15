import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";

const { outputText } = ts.transpileModule(readFileSync("src/backend/teacherLessons.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const original = {
  id: "lesson-id",
  title: "Shapes for Kids",
  description: "First shapes video",
  category: "Shapes",
  grade_level: "Nursery",
  video_path: "Nursery/Shapes/old-shapes.mp4",
  is_published: true,
  created_at: "2026-11-01T00:00:00.000Z",
};
const replacement = {
  title: original.title,
  description: "Updated shapes video",
  category: "Shapes",
  grade_level: "Nursery",
  video_path: "Nursery/Shapes/reupload-shapes.mp4",
  is_published: true,
};

function fixture({ initialRows = [original], ignoreUpdates = false, loseUpdateResponse = false, storedVideoSize } = {}) {
  const rows = initialRows.map(row => ({ ...row }));
  const writes = [];
  const uploads = [];
  const supabase = createClient("https://lessons.example", "mock-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input);
      if (url.pathname.startsWith("/storage/v1/object/info/")) {
        return Response.json({ size: storedVideoSize });
      }
      if (url.pathname.startsWith("/storage/v1/object/")) {
        uploads.push(url.pathname);
        assert.equal(new Headers(init.headers).get("x-upsert"), "false");
        return storedVideoSize === undefined
          ? Response.json({ Id: "uploaded", Key: url.pathname })
          : Response.json({ code: "ResourceAlreadyExists", message: "This object key is taken" }, { status: 409 });
      }
      assert.equal(url.pathname, "/rest/v1/video_lessons");
      const matches = rows.filter(row => [...url.searchParams].every(([field, filter]) => {
        if (filter.startsWith("eq.")) return String(row[field]) === filter.slice(3);
        if (filter.startsWith("in.")) return filter.slice(4, -1).split(",").includes(row[field]);
        return true;
      }));
      if (init.method === "POST") {
        const payload = JSON.parse(init.body);
        writes.push("insert");
        rows.push(payload);
        return new Response(null, { status: 201 });
      }
      if (init.method === "PATCH") {
        writes.push("update");
        if (ignoreUpdates) return Response.json([]);
        for (const row of matches) Object.assign(row, JSON.parse(init.body));
        if (loseUpdateResponse && matches.length) return Response.json({ message: "Response lost" }, { status: 500 });
      }
      matches.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      const limit = Number(url.searchParams.get("limit")) || matches.length;
      return Response.json(matches.slice(0, limit));
    } },
  });
  const module = { exports: {} };
  vm.runInNewContext(outputText, { exports: module.exports, require: () => ({ supabase }) });
  return { ...module.exports, rows, writes, uploads };
}

test("delete and upload the same title and filename reuse the archived row", async () => {
  const lessons = fixture();
  await lessons.archiveTeacherLesson(original);
  assert.equal(lessons.rows[0].is_published, false);
  const slot = await lessons.findLessonPublication("Shapes", "Nursery", "fresh-draft-id");
  assert.equal(slot.id, original.id);
  assert.equal(slot.state, "archived");
  const videoPath = lessons.lessonFilePath("new-file-id", "old-shapes.mp4", "Shapes");
  assert.notEqual(videoPath, original.video_path);
  await lessons.uploadLessonFile(videoPath, new Blob(["new version"]));
  await lessons.publishTeacherLesson(slot, { ...replacement, video_path: videoPath });
  assert.deepEqual(lessons.writes, ["update", "update"]);
  assert.equal(lessons.rows.length, 1);
  assert.equal(lessons.rows[0].is_published, true);
  assert.equal(lessons.rows[0].video_path, videoPath);
});

test("a zero-row delete never reports success while the lesson is still published", async () => {
  const lessons = fixture({ ignoreUpdates: true });
  await assert.rejects(lessons.archiveTeacherLesson(original), /still published/);
  assert.equal(lessons.rows[0].is_published, true);
});

test("an empty category accepts a fresh row and later blocks a different draft", async () => {
  const lessons = fixture({ initialRows: [] });
  const slot = await lessons.findLessonPublication("Shapes", "Nursery", "new-draft-id");
  assert.equal(slot.state, "new");
  await lessons.publishTeacherLesson(slot, replacement);
  assert.deepEqual(lessons.writes, ["insert"]);
  await assert.rejects(lessons.findLessonPublication("Shapes", "Nursery", "other-draft"), /already has a published lesson/);
});

test("an outdated card cannot delete a re-uploaded video in the same row", async () => {
  const lessons = fixture({ initialRows: [{ ...original, ...replacement }] });
  await assert.rejects(lessons.archiveTeacherLesson(original), /may have changed/);
  assert.equal(lessons.rows[0].video_path, replacement.video_path);
  assert.equal(lessons.rows[0].is_published, true);
});

test("only one concurrent re-upload can publish the same archived row", async () => {
  const lessons = fixture({ initialRows: [{ ...original, is_published: false }] });
  const [first, second] = await Promise.all([
    lessons.findLessonPublication("Shapes", "Nursery", "first"),
    lessons.findLessonPublication("Shapes", "Nursery", "second"),
  ]);
  assert.equal(first.id, second.id);
  await lessons.publishTeacherLesson(first, replacement);
  await assert.rejects(
    lessons.publishTeacherLesson(second, { ...replacement, video_path: "another-video.mp4" }),
    /already has a published lesson/,
  );
  assert.equal(lessons.rows[0].video_path, replacement.video_path);
});

test("an uncertain response can be retried only for the exact published video", async () => {
  const lessons = fixture({ initialRows: [{ ...original, is_published: false }], loseUpdateResponse: true });
  const slot = await lessons.findLessonPublication("Shapes", "Nursery", "draft");
  await lessons.publishTeacherLesson(slot, replacement);
  const retry = await lessons.findLessonPublication("Shapes", "Nursery", slot.id);
  assert.equal(retry.state, "published");
  await lessons.publishTeacherLesson(retry, replacement);
  await assert.rejects(
    lessons.publishTeacherLesson(retry, { ...replacement, title: "Different title" }),
    /already has a published lesson/,
  );
  assert.deepEqual(lessons.writes, ["update"]);
});

test("Letters and Alphabets share a published category", async () => {
  const lessons = fixture({ initialRows: [{ ...original, category: "Letters" }] });
  await assert.rejects(lessons.findLessonPublication("Alphabets", "Nursery", "draft"), /Letters already has a published lesson/);
  assert.equal(lessons.uploads.length, 0);
});

test("a duplicate storage response only succeeds when the existing video has the expected size", async () => {
  const video = new Blob(["retry"]);
  await fixture({ storedVideoSize: video.size }).uploadLessonFile("retry.mp4", video);
  await assert.rejects(
    fixture({ storedVideoSize: video.size + 1 }).uploadLessonFile("retry.mp4", video),
    /Video upload failed/,
  );
});
