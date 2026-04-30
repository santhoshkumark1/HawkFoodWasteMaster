import React from "react";
import { Link, useLocation } from "react-router-dom";

export default function Navbar() {
  const { pathname } = useLocation();
  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/dashboard" className="navbar-brand">
          <div className="brand-icon">🦅</div>
          <span className="brand-name">HawkWaste</span>
          <span className="brand-sub">IIT Commons</span>
        </Link>
        <div className="nav-links">
          <Link to="/dashboard" className={`nav-link${pathname === "/dashboard" ? " active" : ""}`}>
            Dashboard
          </Link>
          <Link to="/log" className={`nav-link${pathname === "/log" ? " active" : ""}`}>
            Log Waste
          </Link>
        </div>
      </div>
    </nav>
  );
}
