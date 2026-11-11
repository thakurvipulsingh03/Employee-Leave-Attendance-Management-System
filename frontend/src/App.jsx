import React, { useState, useEffect } from "react";
import { api, authStorage } from "./api";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Toast from "./components/Toast";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import AttendancePage from "./pages/AttendancePage";
import ApplyLeavePage from "./pages/ApplyLeavePage";
import LeaveRequestsPage from "./pages/LeaveRequestsPage";
import LeaveBalancesPage from "./pages/LeaveBalancesPage";
import AdminManagementPage from "./pages/AdminManagementPage";
import ProfilePage from "./pages/ProfilePage";

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentScreen, setCurrentScreen] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Global Toast Notification State
  const [toast, setToast] = useState({ message: "", type: "info" });

  const showToast = (message, type = "info") => {
    setToast({ message, type });
  };

  const clearToast = () => {
    setToast({ message: "", type: "info" });
  };

  // Verify session on app startup
  useEffect(() => {
    const verifySession = async () => {
      const token = authStorage.getToken();
      if (!token) {
        setAuthLoading(false);
        return;
      }

      try {
        const response = await api.getMe();
        setCurrentUser(response.user);
      } catch (err) {
        authStorage.clearToken();
        setCurrentUser(null);
      } finally {
        setAuthLoading(false);
      }
    };

    verifySession();
  }, []);

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    setCurrentScreen("dashboard");
    showToast(`Welcome back, ${user.full_name || user.email}!`, "success");
  };

  const handleLogout = () => {
    authStorage.clearToken();
    setCurrentUser(null);
    setCurrentScreen("dashboard");
    showToast("You have been signed out.", "info");
  };

  if (authLoading) {
    return (
      <div className="login-page">
        <div className="loading-container">
          <div className="loading-spinner" />
          <p style={{ color: "var(--color-text)", fontWeight: 500 }}>
            Initializing LeaveFlow...
          </p>
        </div>
      </div>
    );
  }

  // If not logged in, render the Login Screen
  if (!currentUser) {
    return (
      <>
        <Login onLoginSuccess={handleLoginSuccess} />
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={clearToast}
        />
      </>
    );
  }

  // Render the active screen component
  const renderScreen = () => {
    switch (currentScreen) {
      case "dashboard":
        return (
          <Dashboard
            user={currentUser}
            onNavigate={setCurrentScreen}
            showToast={showToast}
          />
        );

      case "my_attendance":
        return (
          <AttendancePage
            user={currentUser}
            viewMode="personal"
            showToast={showToast}
          />
        );

      case "team_attendance":
      case "company_attendance":
        return (
          <AttendancePage
            user={currentUser}
            viewMode="team"
            showToast={showToast}
          />
        );

      case "apply_leave":
        return (
          <ApplyLeavePage
            onNavigate={setCurrentScreen}
            showToast={showToast}
          />
        );

      case "my_requests":
        return (
          <LeaveRequestsPage
            user={currentUser}
            viewMode="my"
            showToast={showToast}
          />
        );

      case "pending_approvals":
        return (
          <LeaveRequestsPage
            user={currentUser}
            viewMode="pending"
            showToast={showToast}
          />
        );

      case "team_leave_requests":
      case "company_leave_requests":
        return (
          <LeaveRequestsPage
            user={currentUser}
            viewMode="team_history"
            showToast={showToast}
          />
        );

      case "my_balances":
      case "company_balances":
        return <LeaveBalancesPage user={currentUser} showToast={showToast} />;

      case "employees":
        return (
          <AdminManagementPage
            activeSection="employees"
            user={currentUser}
            showToast={showToast}
          />
        );

      case "departments":
        return (
          <AdminManagementPage
            activeSection="departments"
            user={currentUser}
            showToast={showToast}
          />
        );

      case "leave_types":
        return (
          <AdminManagementPage
            activeSection="leave_types"
            user={currentUser}
            showToast={showToast}
          />
        );

      case "audit_logs":
        return (
          <AdminManagementPage
            activeSection="audit_logs"
            user={currentUser}
            showToast={showToast}
          />
        );

      case "manage_users":
        return (
          <AdminManagementPage
            activeSection="users"
            user={currentUser}
            showToast={showToast}
          />
        );

      case "profile":
        return (
          <ProfilePage
            user={currentUser}
            onUserUpdated={setCurrentUser}
            showToast={showToast}
          />
        );

      default:
        return (
          <Dashboard
            user={currentUser}
            onNavigate={setCurrentScreen}
            showToast={showToast}
          />
        );
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <Sidebar
        currentScreen={currentScreen}
        setCurrentScreen={setCurrentScreen}
        user={currentUser}
        onLogout={handleLogout}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="app-main">
        <Header
          currentScreen={currentScreen}
          user={currentUser}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          onLogout={handleLogout}
        />

        <main className="content-wrapper">{renderScreen()}</main>
      </div>

      {/* Toast Feedback Notification */}
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={clearToast}
      />
    </div>
  );
}
