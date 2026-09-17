export type OfflineLesson = {
  id: string;
  title: string;
  description: string;
  category: string;
  gradeLevel: string;
  videoName: string;
  videoType: string;
  video: Blob;
  createdAt: number;
};

export type OfflineProgress = {
  id: string;
  childId: string;
  gameCode: string;
  score: number;
  wrongAttempts: number;
  finished: boolean;
  createdAt: number;
};

export type StudentLessonDownload = {
  id: string;
  childId: string;
  category: string;
  title: string;
  sourceUrl: string;
  videoType: string;
  video: Blob;
  createdAt: number;
};

const DATABASE_NAME = "learnease-offline-v1";
const STORE_NAME = "lessons";
const PROGRESS_STORE_NAME = "progress";
const STUDENT_LESSON_STORE = "student_lessons";
const STUDENT_LESSON_META_STORE = "student_lesson_meta";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 4);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
      if (!request.result.objectStoreNames.contains(PROGRESS_STORE_NAME)) {
        request.result.createObjectStore(PROGRESS_STORE_NAME, { keyPath: "id" });
      }
      if (!request.result.objectStoreNames.contains(STUDENT_LESSON_STORE)) {
        request.result.createObjectStore(STUDENT_LESSON_STORE, { keyPath: "id" });
      }
      if (!request.result.objectStoreNames.contains(STUDENT_LESSON_META_STORE)) {
        request.result.createObjectStore(STUDENT_LESSON_META_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline storage could not open."));
  });
}

export function studentLessonDownloadId(childId: string, category: string): string {
  return `${childId}::${category}`;
}

export async function saveStudentLessonDownload(lesson: StudentLessonDownload): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([STUDENT_LESSON_STORE, STUDENT_LESSON_META_STORE], "readwrite");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("The lesson could not be saved for offline playback."));
    transaction.objectStore(STUDENT_LESSON_STORE).put(lesson);
    transaction.objectStore(STUDENT_LESSON_META_STORE).put({
      id: lesson.id,
      childId: lesson.childId,
      category: lesson.category,
      title: lesson.title,
      sourceUrl: lesson.sourceUrl,
      createdAt: lesson.createdAt,
    });
  });
  database.close();
}

export async function getStudentLessonMeta(childId: string, category: string): Promise<{ title: string; sourceUrl: string } | null> {
  const database = await openDatabase();
  const meta = await new Promise<{ title: string; sourceUrl: string } | null>((resolve, reject) => {
    const request = database.transaction(STUDENT_LESSON_META_STORE, "readonly").objectStore(STUDENT_LESSON_META_STORE).get(studentLessonDownloadId(childId, category));
    request.onsuccess = () => {
      const row = request.result as { title?: string; sourceUrl?: string } | undefined;
      resolve(row ? { title: row.title || "", sourceUrl: row.sourceUrl || "" } : null);
    };
    request.onerror = () => reject(request.error ?? new Error("Saved lessons could not load."));
  });
  database.close();
  return meta;
}

export async function hasStudentLessonDownload(childId: string, category: string, sourceUrl = ""): Promise<boolean> {
  try {
    const meta = await getStudentLessonMeta(childId, category);
    if (meta) {
      if (sourceUrl && meta.sourceUrl && meta.sourceUrl !== sourceUrl && navigator.onLine) return false;
      return true;
    }
  } catch {
    // Fall through to the video store for lessons saved before metadata existed.
  }

  const database = await openDatabase();
  const exists = await new Promise<boolean>((resolve, reject) => {
    const request = database.transaction(STUDENT_LESSON_STORE, "readonly").objectStore(STUDENT_LESSON_STORE).getKey(studentLessonDownloadId(childId, category));
    request.onsuccess = () => resolve(request.result != null);
    request.onerror = () => reject(request.error ?? new Error("Saved lessons could not load."));
  });
  database.close();
  return exists;
}

export async function getStudentLessonDownload(childId: string, category: string): Promise<StudentLessonDownload | null> {
  const database = await openDatabase();
  const lesson = await new Promise<StudentLessonDownload | null>((resolve, reject) => {
    const request = database.transaction(STUDENT_LESSON_STORE, "readonly").objectStore(STUDENT_LESSON_STORE).get(studentLessonDownloadId(childId, category));
    request.onsuccess = () => resolve((request.result as StudentLessonDownload | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Saved lessons could not load."));
  });
  database.close();
  return lesson;
}

export async function saveOfflineLesson(lesson: OfflineLesson): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(lesson);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Offline lesson could not be saved."));
  });
  database.close();
}

export async function getOfflineLessons(): Promise<OfflineLesson[]> {
  const database = await openDatabase();
  const lessons = await new Promise<OfflineLesson[]>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as OfflineLesson[]);
    request.onerror = () => reject(request.error ?? new Error("Offline lessons could not load."));
  });
  database.close();
  return lessons.sort((left, right) => right.createdAt - left.createdAt);
}

export async function getOfflineLesson(category: string): Promise<OfflineLesson | null> {
  const lessons = await getOfflineLessons();
  return lessons.find(lesson => lesson.category === category) ?? null;
}

export function createOfflineLessonUrl(lesson: OfflineLesson): string {
  return URL.createObjectURL(lesson.video);
}

export async function removeOfflineLesson(id: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Offline lesson could not be removed."));
  });
  database.close();
}

export async function queueOfflineProgress(progress: OfflineProgress): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(PROGRESS_STORE_NAME, "readwrite").objectStore(PROGRESS_STORE_NAME).put(progress);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Offline progress could not be saved."));
  });
  database.close();
}

export async function getOfflineProgress(): Promise<OfflineProgress[]> {
  const database = await openDatabase();
  const progress = await new Promise<OfflineProgress[]>((resolve, reject) => {
    const request = database.transaction(PROGRESS_STORE_NAME, "readonly").objectStore(PROGRESS_STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as OfflineProgress[]);
    request.onerror = () => reject(request.error ?? new Error("Offline progress could not load."));
  });
  database.close();
  return progress;
}

export async function removeOfflineProgress(id: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(PROGRESS_STORE_NAME, "readwrite").objectStore(PROGRESS_STORE_NAME).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Offline progress could not be removed."));
  });
  database.close();
}