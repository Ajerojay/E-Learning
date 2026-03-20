import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./AdminStudents.css";

type Video = {
  title: string;
  link: string;
  archived?: boolean; // ✅ archive support
};

type VideoMap = {
  [key: string]: Video[];
};

export default function AdminStudents() {
  const navigate = useNavigate();

  const categories = [
    "Numbers",
    "Letters",
    "Phonics",
    "Colors",
    "Shapes",
    "Logic",
  ];

  const [videos, setVideos] = useState<VideoMap>({});
  const [showModal, setShowModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [videoLink, setVideoLink] = useState("");
  const [editIndex, setEditIndex] = useState<number | null>(null);

  // DELETE (ARCHIVE)
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteCategory, setDeleteCategory] = useState("");
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);

  // EDIT CONFIRM
  const [showEditConfirm, setShowEditConfirm] = useState(false);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    if (!user || user.role !== "admin") {
      navigate("/");
    }
  }, [navigate]);

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("videos") || "{}");
    setVideos(saved);
  }, []);

  const saveVideos = (updated: VideoMap) => {
    setVideos(updated);
    localStorage.setItem("videos", JSON.stringify(updated));
  };

  // 🔥 Convert YouTube → embed
  const convertToEmbed = (link: string) => {
    if (link.includes("watch?v=")) {
      const id = link.split("watch?v=")[1].split("&")[0];
      return `https://www.youtube.com/embed/${id}`;
    } else if (link.includes("youtu.be/")) {
      const id = link.split("youtu.be/")[1].split("?")[0];
      return `https://www.youtube.com/embed/${id}`;
    }
    return link;
  };

  // ADD / EDIT SAVE
  const handleSaveVideo = () => {
    if (!videoTitle || !videoLink) return;

    const updated = { ...videos };
    const embedLink = convertToEmbed(videoLink);

    if (!updated[selectedCategory]) {
      updated[selectedCategory] = [];
    }

    if (editIndex !== null) {
      updated[selectedCategory][editIndex] = {
        title: videoTitle,
        link: embedLink,
      };
    } else {
      updated[selectedCategory].push({
        title: videoTitle,
        link: embedLink,
      });
    }

    saveVideos(updated);

    setShowModal(false);
    setVideoTitle("");
    setVideoLink("");
    setEditIndex(null);
  };

  // CLICK DELETE → OPEN MODAL
  const handleDeleteClick = (cat: string, index: number) => {
    setDeleteCategory(cat);
    setDeleteIndex(index);
    setShowDeleteModal(true);
  };

  // CONFIRM DELETE → ARCHIVE
  const confirmDelete = () => {
    if (deleteIndex === null) return;

    const updated = { ...videos };

    updated[deleteCategory][deleteIndex].archived = true; // ✅ archive

    saveVideos(updated);

    setShowDeleteModal(false);
    setDeleteIndex(null);
  };

  // EDIT CLICK
  const handleEdit = (cat: string, index: number) => {
    const vid = videos[cat][index];

    setSelectedCategory(cat);
    setVideoTitle(vid.title);
    setVideoLink(vid.link);
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
                  }}
                >
                  + Add
                </button>
              </div>

              <div className="admin2-box">
                {videos[cat]?.filter(v => !v.archived).length ? (
                  <ul className="admin2-video-list">
                    {videos[cat]
                      .map((vid, i) => ({ ...vid, index: i }))
                      .filter((vid) => !vid.archived)
                      .map((vid, i) => (
                        <li key={i} className="video-item">

                          <span>{vid.title}</span>

                          <div className="video-actions">
                            <button
                              className="edit-btn"
                              onClick={() => handleEdit(cat, vid.index)}
                            >
                              Edit
                            </button>

                            <button
                              className="delete-btn"
                              onClick={() => handleDeleteClick(cat, vid.index)}
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

      {/* ADD / EDIT MODAL */}
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
              type="text"
              placeholder="YouTube Link"
              value={videoLink}
              onChange={(e) => setVideoLink(e.target.value)}
            />

            <div className="admin2-modal-actions">
              <button
                onClick={() => {
                  if (editIndex !== null) {
                    setShowEditConfirm(true);
                  } else {
                    handleSaveVideo();
                  }
                }}
              >
                {editIndex !== null ? "Update" : "Add"}
              </button>

              <button onClick={() => setShowModal(false)}>Cancel</button>
            </div>

          </div>
        </div>
      )}

      {/* EDIT CONFIRM MODAL */}
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
                onClick={() => {
                  handleSaveVideo();
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

      {/* ARCHIVE (DELETE) MODAL */}
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