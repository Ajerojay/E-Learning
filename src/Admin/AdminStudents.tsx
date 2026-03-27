import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./AdminStudents.css";
import { supabase } from "../lib/supabase";

type VideoRecord = {
  id: string;
  title: string;
  video_path: string;
  category: string;
  grade_level: string;
  is_published: boolean;
};

type VideoMap = {
  [key: string]: VideoRecord[];
};

const categoryConfig = [
  { ui: "Numbers", db: "Numbers" },
  { ui: "Letters", db: "Alphabets" },
  { ui: "Phonics", db: "Phonics" },
  { ui: "Colors", db: "Colors" },
  { ui: "Shapes", db: "Shapes" },
  { ui: "Logic", db: "Logic" },
];

const getDbCategory = (uiCategory: string) => {
  return categoryConfig.find((c) => c.ui === uiCategory)?.db || uiCategory;
};

const getUiCategory = (dbCategory: string) => {
  return categoryConfig.find((c) => c.db === dbCategory)?.ui || dbCategory;
};

export default function AdminStudents() {
  const navigate = useNavigate();

  const categories = categoryConfig.map((c) => c.ui);

  const [videos, setVideos] = useState<VideoMap>({});
  const [showModal, setShowModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteCategory, setDeleteCategory] = useState("");
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);

  const [showEditConfirm, setShowEditConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    if (!user || user.role !== "admin") {
      navigate("/");
    }
  }, [navigate]);

  useEffect(() => {
    fetchVideos();
  }, []);

  const fetchVideos = async () => {
    const { data, error } = await supabase
      .from("video_lessons")
      .select("*")
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching videos:", error.message);
      return;
    }

    const grouped: VideoMap = {};
    categories.forEach((cat) => {
      grouped[cat] = [];
    });

    (data || []).forEach((video) => {
      const uiCategory = getUiCategory(video.category);
      if (!grouped[uiCategory]) grouped[uiCategory] = [];
      grouped[uiCategory].push(video);
    });

    setVideos(grouped);
  };

  const resetModal = () => {
    setShowModal(false);
    setVideoTitle("");
    setSelectedFile(null);
    setEditIndex(null);
    setSelectedCategory("");
  };

  const handleSaveVideo = async () => {
    if (!videoTitle.trim()) {
      alert("Please enter a video title.");
      return;
    }

    const dbCategory = getDbCategory(selectedCategory);

    setIsSaving(true);

    try {
      if (editIndex !== null) {
        const currentVideo = videos[selectedCategory][editIndex];
        if (!currentVideo) return;

        let updatedVideoPath = currentVideo.video_path;

        if (selectedFile) {
          const cleanFileName = selectedFile.name.replace(/\s+/g, "-");
          const newPath = `Nursery/${dbCategory}/${Date.now()}-${cleanFileName}`;

          const { error: uploadError } = await supabase.storage
            .from("lesson-videos")
            .upload(newPath, selectedFile, {
              upsert: false,
            });

          if (uploadError) {
            throw uploadError;
          }

          updatedVideoPath = newPath;
        }

        const { error: updateError } = await supabase
          .from("video_lessons")
          .update({
            title: videoTitle.trim(),
            category: dbCategory,
            video_path: updatedVideoPath,
          })
          .eq("id", currentVideo.id);

        if (updateError) {
          throw updateError;
        }
      } else {
        if (!selectedFile) {
          alert("Please select a video file.");
          return;
        }

        const cleanFileName = selectedFile.name.replace(/\s+/g, "-");
        const filePath = `Nursery/${dbCategory}/${Date.now()}-${cleanFileName}`;

        const { error: uploadError } = await supabase.storage
          .from("lesson-videos")
          .upload(filePath, selectedFile, {
            upsert: false,
          });

        if (uploadError) {
          throw uploadError;
        }

        const { error: insertError } = await supabase.from("video_lessons").insert([
          {
            title: videoTitle.trim(),
            description: `${selectedCategory} lesson video`,
            grade_level: "Nursery",
            category: dbCategory,
            video_path: filePath,
            is_published: true,
          },
        ]);

        if (insertError) {
          throw insertError;
        }
      }

      await fetchVideos();
      resetModal();
    } catch (error: any) {
      console.error("Save error:", error.message);
      alert(error.message || "Something went wrong while saving the video.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteClick = (cat: string, index: number) => {
    setDeleteCategory(cat);
    setDeleteIndex(index);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (deleteIndex === null) return;

    const currentVideo = videos[deleteCategory][deleteIndex];
    if (!currentVideo) return;

    try {
      const { error } = await supabase
        .from("video_lessons")
        .update({ is_published: false })
        .eq("id", currentVideo.id);

      if (error) {
        throw error;
      }

      await fetchVideos();
      setShowDeleteModal(false);
      setDeleteIndex(null);
    } catch (error: any) {
      console.error("Archive error:", error.message);
      alert(error.message || "Failed to archive video.");
    }
  };

  const handleEdit = (cat: string, index: number) => {
    const vid = videos[cat][index];

    setSelectedCategory(cat);
    setVideoTitle(vid.title);
    setSelectedFile(null);
    setEditIndex(index);
    setShowModal(true);
  };

  return (
    <div className="admin2-container">
      <div className="admin2-header">
        <h1>Student Learning Content</h1>
        <button onClick={() => navigate("/admin")}>← Back</button>
      </div>

      <div className="admin2-card">
        <h2>Video Lessons</h2>

        <div className="admin2-category-grid">
          {categories.map((cat) => (
            <div key={cat} className="admin2-category-box">
              <div className="admin2-category-header">
                <h3>{cat}</h3>
                <button
                  className="admin2-add-btn"
                  onClick={() => {
                    setSelectedCategory(cat);
                    setShowModal(true);
                    setEditIndex(null);
                    setVideoTitle("");
                    setSelectedFile(null);
                  }}
                >
                  + Add
                </button>
              </div>

              <div className="admin2-box">
                {videos[cat]?.length ? (
                  <ul className="admin2-video-list">
                    {videos[cat].map((vid, i) => (
                      <li key={vid.id} className="video-item">
                        <span>{vid.title}</span>

                        <div className="video-actions">
                          <button
                            className="edit-btn"
                            onClick={() => handleEdit(cat, i)}
                          >
                            Edit
                          </button>

                          <button
                            className="delete-btn"
                            onClick={() => handleDeleteClick(cat, i)}
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No videos yet</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showModal && (
        <div className="admin2-modal">
          <div className="admin2-modal-content">
            <h3>
              {editIndex !== null ? "Edit Video" : "Add Video"} ({selectedCategory})
            </h3>

            <input
              type="text"
              placeholder="Video Title"
              value={videoTitle}
              onChange={(e) => setVideoTitle(e.target.value)}
            />

            <input
              type="file"
              accept="video/mp4"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            />

            {editIndex !== null && (
              <p className="file-note">
                Leave file empty if you only want to update the title.
              </p>
            )}

            <div className="admin2-modal-actions">
              <button
                onClick={() => {
                  if (editIndex !== null) {
                    setShowEditConfirm(true);
                  } else {
                    handleSaveVideo();
                  }
                }}
                disabled={isSaving}
              >
                {isSaving
                  ? "Saving..."
                  : editIndex !== null
                  ? "Update"
                  : "Add"}
              </button>

              <button onClick={resetModal} disabled={isSaving}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditConfirm && (
        <div className="admin2-modal">
          <div className="admin2-modal-content delete-modal">
            <h3>✏️ Confirm Update</h3>

            <p>
              You are about to update this video.
              <br />
              Continue?
            </p>

            <div className="admin2-modal-actions">
              <button
                className="delete-confirm"
                onClick={async () => {
                  await handleSaveVideo();
                  setShowEditConfirm(false);
                }}
              >
                Confirm
              </button>

              <button
                className="delete-cancel"
                onClick={() => setShowEditConfirm(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="admin2-modal">
          <div className="admin2-modal-content delete-modal">
            <h3>📦 Archive Video</h3>

            <p>
              This video will be removed from the students page and stored in archive.
              <br />
              Are you sure?
            </p>

            <div className="admin2-modal-actions">
              <button className="delete-confirm" onClick={confirmDelete}>
                Confirm
              </button>

              <button
                className="delete-cancel"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}