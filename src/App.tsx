import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./App.css";

import ParentLogin from "./Parent/ParentLogin";
import ParentSignUp from "./Parent/SignUp";   
import Dashboard from "./Parent/Dashboard";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ParentLogin />} />
        <Route path="/signup" element={<ParentSignUp />} /> 
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;