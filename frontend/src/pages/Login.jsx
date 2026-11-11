import React, { useEffect, useState } from "react";
import { FolderGit2, LogIn, Key, Mail, AlertCircle, User } from "lucide-react";
import { api, authStorage } from "../api";
import PasswordInput from "../components/PasswordInput";

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isAdminSignup, setIsAdminSignup] = useState(false);
  const [bootstrapRequired, setBootstrapRequired] = useState(false);
  const [setupKeyRequired, setSetupKeyRequired] = useState(false);
  const [setupKey, setSetupKey] = useState("");
  const [setupLoading, setSetupLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    api.getBootstrapStatus()
      .then((data) => {
        setBootstrapRequired(data.setup_required);
        setSetupKeyRequired(data.setup_key_required);
      })
      .catch((err) => setErrorMessage(err.message))
      .finally(() => setSetupLoading(false));
  }, []);

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    if (setupLoading) return;
    if ((bootstrapRequired || isAdminSignup) && fullName.trim().length < 2) {
      setErrorMessage("Please enter your full name.");
      return;
    }
    if (!email || !password) {
      setErrorMessage("Please enter both email address and password.");
      return;
    }
    if ((bootstrapRequired || isAdminSignup) && password.length < 8) {
      setErrorMessage("Use a password with at least 8 characters.");
      return;
    }
    if ((bootstrapRequired || isAdminSignup) && password !== confirmPassword) {
      setErrorMessage("The passwords do not match.");
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      if (bootstrapRequired) {
        await api.bootstrapAdmin({
          full_name: fullName,
          email,
          password,
          setup_key: setupKeyRequired ? setupKey : undefined,
        });
        setBootstrapRequired(false);
      } else if (isAdminSignup) {
        await api.registerAdmin({
          full_name: fullName,
          email,
          password,
        });
      }
      const data = await api.login(email, password);
      // Store token and user profile in sessionStorage
      authStorage.setToken(data.access_token);
      authStorage.setUser(data.user);
      onLoginSuccess(data.user);
    } catch (err) {
      setErrorMessage(err.message || "Failed to sign in. Please verify your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Brand Header */}
        <div className="login-header">
          <div className="login-brand-icon">
            <FolderGit2 size={28} />
          </div>
          <h1 className="login-title">LeaveFlow</h1>
          <p className="login-subtitle">Employee Leave & Attendance Management System</p>
          {setupLoading ? (
            <p className="login-subtitle">Checking account setup...</p>
          ) : (
            <p className="login-subtitle">
              {bootstrapRequired
                ? "Create the first administrator account"
                : isAdminSignup
                ? "Create an Admin account"
                : "Sign in to your account"}
            </p>
          )}
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="alert alert-danger" role="alert">
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <div>{errorMessage}</div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin}>
          {(bootstrapRequired || isAdminSignup) && (
            <div className="form-group">
              <label className="form-label" htmlFor="login-name">Full Name</label>
              <div style={{ position: "relative" }}>
                <input
                  id="login-name"
                  type="text"
                  className="form-control"
                  placeholder="Your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  minLength={2}
                  autoComplete="name"
                  style={{ paddingLeft: "38px" }}
                />
                <User
                  size={17}
                  style={{
                    position: "absolute",
                    left: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--color-text-muted)",
                  }}
                />
              </div>
            </div>
          )}

          {bootstrapRequired && setupKeyRequired && (
            <div className="form-group">
              <label className="form-label" htmlFor="setup-key">Initial Setup Key</label>
              <input
                id="setup-key"
                type="password"
                className="form-control"
                placeholder="Enter the key configured by the server administrator"
                value={setupKey}
                onChange={(e) => setSetupKey(e.target.value)}
                required
                autoComplete="off"
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="login-email">
              Email Address
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="login-email"
                type="email"
                className="form-control"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={{ paddingLeft: "38px" }}
              />
              <Mail
                size={17}
                style={{
                  position: "absolute",
                  left: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--color-text-muted)",
                }}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">
              Password
            </label>
            <div style={{ position: "relative" }}>
              <PasswordInput
                id="login-password"
                className="form-control"
                placeholder={bootstrapRequired || isAdminSignup ? "At least 8 characters" : "Enter password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={bootstrapRequired || isAdminSignup ? 8 : undefined}
                autoComplete="current-password"
                style={{ paddingLeft: "38px" }}
              />
              <Key
                size={17}
                style={{
                  position: "absolute",
                  left: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--color-text-muted)",
                }}
              />
            </div>
          </div>

          {(bootstrapRequired || isAdminSignup) && (
            <div className="form-group">
              <label className="form-label" htmlFor="login-confirm-password">Confirm Password</label>
              <PasswordInput
                id="login-confirm-password"
                className="form-control"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || setupLoading}
            style={{ width: "100%", marginTop: "8px", padding: "12px" }}
          >
            {loading ? (
              <>
                <div className="loading-spinner" style={{ width: "16px", height: "16px", borderWidth: "2px" }} />
                <span>{bootstrapRequired || isAdminSignup ? "Creating Admin account..." : "Signing in..."}</span>
              </>
            ) : (
              <>
                <LogIn size={18} />
                <span>
                  {bootstrapRequired || isAdminSignup
                    ? "Create Admin Account"
                    : "Sign In to LeaveFlow"}
                </span>
              </>
            )}
          </button>
        </form>

        {!bootstrapRequired && !setupLoading && (
          <div style={{ marginTop: "18px", textAlign: "center" }}>
            {isAdminSignup ? (
              <>
                <p className="form-hint">
                  This creates an Admin account with access to all system
                  records and account settings.
                </p>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setIsAdminSignup(false);
                    setErrorMessage("");
                  }}
                  style={{ marginTop: "12px" }}
                >
                  Back to Sign In
                </button>
              </>
            ) : (
              <>
                <p className="form-hint">
                  Need access? Create an Admin account or sign in. Admins can
                  also create Admin, HR, Manager, and Employee accounts.
                </p>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setIsAdminSignup(true);
                    setFullName("");
                    setPassword("");
                    setConfirmPassword("");
                    setErrorMessage("");
                  }}
                  style={{ marginTop: "12px" }}
                >
                  Create Admin Account
                </button>
              </>
            )}
          </div>
        )}

        {bootstrapRequired && !setupLoading && (
          <p className="form-hint" style={{ marginTop: "16px", textAlign: "center" }}>
            This one-time setup creates the first administrator account.
          </p>
        )}

      </div>
    </div>
  );
}
