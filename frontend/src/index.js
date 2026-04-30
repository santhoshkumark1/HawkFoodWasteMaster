import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import LoggerPage from "./pages/LoggerPage";
import DashboardPage from "./pages/DashboardPage";
import "./index.css";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <BrowserRouter>
    <Navbar />
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/log" element={<LoggerPage />} />
    </Routes>
  </BrowserRouter>
);
