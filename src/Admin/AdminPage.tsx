import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./AdminPage.css";

export default function AdminPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || "null");

    if (!user || user.role !== "admin") {
      navigate("/");
    }
  }, [navigate]);

  return (
    <div className="admin-container">
      <div className="admin-dashboard">

        <h1 className="admin-title">Admin Dashboard</h1>

        <div className="admin-grid">

          <div
            className="admin-card"
            onClick={() => navigate("/admin/students")}
          >
            Students
          </div>

          <div
            className="admin-card"
            onClick={() => navigate("/admin/parents")}
          >
            Parents
          </div>

        </div>

      </div>
    </div>
  );
}