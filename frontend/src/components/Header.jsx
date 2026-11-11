import React from "react";
import { Menu, User, Calendar, LogOut } from "lucide-react";

export default function Header({ currentScreen, user, onToggleSidebar, onLogout }) {
  const getScreenTitle = () => {
    const titles = {
      dashboard: "Dashboard Overview",
      my_attendance: "My Attendance",
      apply_leave: "Apply for Leave",
      my_requests: "My Leave Requests",
      my_balances: "My Leave Balances",
      team_attendance: "Team Attendance",
      pending_approvals: "Pending Leave Approvals",
      team_leave_requests: "Team Leave Requests",
      employees: "Employee Directory",
      departments: "Department Management",
      leave_types: "Leave Types & Allowances",
      company_attendance: "Company Attendance",
      company_leave_requests: "All Leave Requests",
      company_balances: "Company Leave Balances",
      audit_logs: "Security Audit Logs",
      manage_users: "Manage Users",
      profile: "My Profile",
    };
    return titles[currentScreen] || "LeaveFlow Management";
  };

  const todayFormatted = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <header className="app-header">
      <div className="header-left">
        <button
          className="mobile-menu-btn"
          onClick={onToggleSidebar}
          aria-label="Toggle navigation menu"
        >
          <Menu size={20} />
        </button>
        <h1 className="page-title">{getScreenTitle()}</h1>
      </div>

      <div className="header-right">
        {/* Date Display */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "0.82rem",
            color: "var(--color-text-muted)",
            backgroundColor: "#f4f7f2",
            padding: "6px 12px",
            borderRadius: "9999px",
            border: "1px solid var(--color-border)",
          }}
        >
          <Calendar size={14} color="var(--color-primary)" />
          <span>{todayFormatted}</span>
        </div>

        {/* User Pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "0.85rem",
            fontWeight: 600,
            color: "var(--color-dark)",
            backgroundColor: "var(--color-light)",
            padding: "6px 14px",
            borderRadius: "9999px",
          }}
        >
          <User size={15} color="var(--color-primary)" />
          <span>{user?.full_name || user?.email}</span>
        </div>

        {/* Logout Button */}
        <button
          onClick={onLogout}
          className="btn btn-outline btn-sm"
          title="Sign Out"
          style={{ padding: "6px 10px" }}
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
