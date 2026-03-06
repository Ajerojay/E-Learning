import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./App.css";
import ParentLogin from "./Parent/ParentLogin";
import ParentDashboard from "./Parent/ParentDashboard";
import ParentSignup from "./Parent/SignUp";

function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* Login Page */}
        <Route path="/" element={<ParentLogin />} />

        {/* Signup Page */}
        <Route path="/signup" element={<ParentSignup />} />

        {/* Dashboard */}
        <Route path="/parent-dashboard" element={<ParentDashboard />} />

        {/* optional */}
        <Route path="/Parent" element={<ParentLogin />} />

        {/* redirect unknown routes */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;