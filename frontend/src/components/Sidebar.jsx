import React from "react";
import {
  LayoutDashboard,
  Clock,
  CalendarPlus,
  FileText,
  PieChart,
  Users,
  Building2,
  Tags,
  ShieldCheck,
  CheckSquare,
  LogOut,
  CalendarCheck,
  FolderGit2,
  User,
} from "lucide-react";

export default function Sidebar({
  currentScreen,
  setCurrentScreen,
  user,
  onLogout,
  isOpen,
  onClose,
}) {
  const role = user?.role || "EMPLOYEE";

  // Build nav menu according to role
  const getNavItems = () => {
    if (role === "EMPLOYEE") {
      return [
        { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
        { id: "my_attendance", label: "My Attendance", icon: Clock },
        { id: "apply_leave", label: "Apply for Leave", icon: CalendarPlus },
        { id: "my_requests", label: "My Leave Requests", icon: FileText },
        { id: "my_balances", label: "My Leave Balance", icon: PieChart },
      ];
    }

    if (role === "MANAGER") {
      return [
        { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
        { id: "my_attendance", label: "My Attendance", icon: Clock },
        { id: "team_attendance", label: "Team Attendance", icon: CalendarCheck },
        { id: "pending_approvals", label: "Pending Approvals", icon: CheckSquare },
        { id: "team_leave_requests", label: "Leave Requests", icon: FileText },
        { id: "employees", label: "Employees", icon: Users },
      ];
    }

    if (role === "HR") {
      return [
        { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
        { id: "my_attendance", label: "My Attendance", icon: Clock },
        { id: "employees", label: "Employees", icon: Users },
        { id: "departments", label: "Departments", icon: Building2 },
        { id: "leave_types", label: "Leave Types", icon: Tags },
        { id: "company_attendance", label: "Attendance", icon: Clock },
        { id: "pending_approvals", label: "Pending Approvals", icon: CheckSquare },
        { id: "company_leave_requests", label: "Leave Requests", icon: FileText },
        { id: "company_balances", label: "Leave Balances", icon: PieChart },
      ];
    }

    if (role === "ADMIN") {
      return [
        { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
        { id: "employees", label: "Employees", icon: Users },
        { id: "manage_users", label: "Manage Users", icon: Users },
        { id: "departments", label: "Departments", icon: Building2 },
        { id: "leave_types", label: "Leave Types", icon: Tags },
        { id: "company_attendance", label: "Attendance", icon: Clock },
        { id: "company_leave_requests", label: "Leave Requests", icon: FileText },
        { id: "company_balances", label: "Leave Balances", icon: PieChart },
        { id: "audit_logs", label: "Audit Logs", icon: ShieldCheck },
      ];
    }

    return [];
  };

  const navItems = [
    ...getNavItems(),
    { id: "profile", label: "My Profile", icon: User },
  ];

  const handleNavClick = (screenId) => {
    setCurrentScreen(screenId);
    if (onClose) onClose();
  };

  return (
    <>
      {isOpen && <div className="sidebar-backdrop" onClick={onClose} />}
      <aside className={`app-sidebar ${isOpen ? "open" : ""}`}>
        {/* Brand Header */}
        <div className="sidebar-header">
          <div className="brand-icon-box">
            <FolderGit2 size={22} />
          </div>
          <div className="brand-info">
            <span className="brand-title">LeaveFlow</span>
            <span className="brand-subtitle">Employee System</span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="sidebar-nav">
          <div className="nav-section-title">Navigation</div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentScreen === item.id;
            return (
              <button
                key={item.id}
                className={`nav-item ${isActive ? "active" : ""}`}
                onClick={() => handleNavClick(item.id)}
              >
                <Icon size={18} className="icon" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User Badge & Logout */}
        <div className="sidebar-footer">
          <div className="user-badge-card">
            <div className="user-avatar">
              {(user?.full_name || user?.email || "U").charAt(0).toUpperCase()}
            </div>
            <div className="user-meta">
              <div className="user-name">{user?.full_name || user?.email}</div>
              <span className="user-role-badge">{role}</span>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="btn btn-outline btn-sm"
            style={{ width: "100%", justifyContent: "center", gap: "6px" }}
          >
            <LogOut size={15} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
