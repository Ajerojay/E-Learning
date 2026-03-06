import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./App.css";
import ParentLogin from "./Parent/ParentLogin";
import ParentDashboard from "./Parent/ParentDashboard";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* show ParentLogin on home */}
        <Route path="/" element={<ParentLogin />} />

        {/* Parent Dashboard */}
        <Route path="/parent-dashboard" element={<ParentDashboard />} />

        {/* optional: keep /Parent working too */}
        <Route path="/Parent" element={<ParentLogin />} />

        {/* optional: redirect unknown routes to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;