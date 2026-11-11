import React, { useState } from "react";
import { api } from "../api";
import PasswordInput from "../components/PasswordInput";

export default function ProfilePage({ user, onUserUpdated, showToast }) {
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    setProfileLoading(true);
    try {
      const response = await api.updateProfile({ full_name: fullName });
      onUserUpdated(response.user);
      showToast("Profile updated successfully.", "success");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      showToast("New passwords do not match.", "error");
      return;
    }
    setPasswordLoading(true);
    try {
      const response = await api.changePassword({
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });
      setPasswordForm({
        current_password: "",
        new_password: "",
        confirm_password: "",
      });
      showToast(response.message, "success");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: "20px", maxWidth: "820px" }}>
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">My Profile</h2>
            <span className="card-subtitle">View your account details and update your name.</span>
          </div>
        </div>
        <div className="card-body">
          <form onSubmit={handleProfileSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="profile-name">Full Name</label>
                <input
                  id="profile-name"
                  className="form-control"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  minLength={2}
                  maxLength={100}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="profile-email">Email Address</label>
                <input id="profile-email" className="form-control" value={user?.email || ""} readOnly />
              </div>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Role</label>
                <input className="form-control" value={user?.role || ""} readOnly />
              </div>
              <div className="form-group">
                <label className="form-label">Department</label>
                <input className="form-control" value={user?.department_name || "Not assigned"} readOnly />
              </div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={profileLoading}>
              {profileLoading ? "Saving..." : "Save Profile"}
            </button>
          </form>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Change Password</h2>
            <span className="card-subtitle">Choose a new password with at least 8 characters.</span>
          </div>
        </div>
        <div className="card-body">
          <form onSubmit={handlePasswordSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="current-password">Current Password</label>
              <PasswordInput
                id="current-password"
                className="form-control"
                autoComplete="current-password"
                value={passwordForm.current_password}
                onChange={(event) => setPasswordForm({ ...passwordForm, current_password: event.target.value })}
                required
              />
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="new-password">New Password</label>
                <PasswordInput
                  id="new-password"
                  className="form-control"
                  autoComplete="new-password"
                  minLength={8}
                  value={passwordForm.new_password}
                  onChange={(event) => setPasswordForm({ ...passwordForm, new_password: event.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="confirm-password">Confirm New Password</label>
                <PasswordInput
                  id="confirm-password"
                  className="form-control"
                  autoComplete="new-password"
                  minLength={8}
                  value={passwordForm.confirm_password}
                  onChange={(event) => setPasswordForm({ ...passwordForm, confirm_password: event.target.value })}
                  required
                />
              </div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={passwordLoading}>
              {passwordLoading ? "Updating..." : "Change Password"}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
