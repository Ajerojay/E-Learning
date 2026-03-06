import "./Dashboard.css";
import { Bell, Home, Users, BarChart2, LogOut } from "lucide-react";
import bg from "../img/parent-bg.png";

export default function Dashboard() {
  return (
    <div
      className="dashboard"
      style={{ backgroundImage: `url(${bg})` }}
    >
      {/* Sidebar */}
      <div className="sidebar">
        <Home />
        <Users />
        <BarChart2 />
        <LogOut />
      </div>

      {/* Main Content */}
      <div className="content">

        {/* Top Bar */}
        <div className="topbar">
          <div className="logo">
            <h1>LearnEase Kids</h1>
          </div>
          <Bell className="bell-icon" />
        </div>

        {/* Welcome Box */}
        <div className="welcome-box">
          <h2>Welcome!</h2>
        </div>

        {/* Main Blue Container */}
        <div className="main-card">

          <div className="section">
            <h3>📌 Quick Summary</h3>
            <p>Sofia: <strong>45% Progress</strong></p>
          </div>

          <div className="section">
            <h3>✨ Recent Activity</h3>
            <p>Sofia completed "Colors"</p>
          </div>

        </div>

      </div>
    </div>
  );
}