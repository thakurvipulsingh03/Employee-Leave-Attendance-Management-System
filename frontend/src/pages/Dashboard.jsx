import React, { useState, useEffect } from "react";
import {
  Clock,
  LogIn,
  LogOut,
  Calendar,
  CheckCircle2,
  Clock3,
  XCircle,
  AlertCircle,
  Users,
  Building2,
  Tags,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { api } from "../api";

export default function Dashboard({ user, onNavigate, showToast }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchSummary = async () => {
    try {
      const data = await api.getDashboardSummary();
      setSummary(data);
    } catch (err) {
      if (showToast) showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  // Quick attendance actions for employee
  const handleCheckIn = async () => {
    setActionLoading(true);
    try {
      const res = await api.checkIn();
      if (showToast) showToast(res.message, "success");
      await fetchSummary();
    } catch (err) {
      if (showToast) showToast(err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async () => {
    setActionLoading(true);
    try {
      const res = await api.checkOut();
      if (showToast) showToast(res.message, "success");
      await fetchSummary();
    } catch (err) {
      if (showToast) showToast(err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Loading dashboard metrics...</p>
      </div>
    );
  }

  const role = user?.role;

  return (
    <div>
      {/* ========================================================
          1. EMPLOYEE DASHBOARD VIEW
          ======================================================== */}
      {role === "EMPLOYEE" && (
        <>
          {/* Top Row: Attendance Action Card + Quick Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "24px", marginBottom: "24px" }}>
            {/* Daily Attendance Widget */}
            <div className="card" style={{ marginBottom: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div className="card-header" style={{ marginBottom: "16px" }}>
                  <div>
                    <h2 className="card-title">
                      <Clock size={19} color="var(--color-primary)" />
                      Today's Attendance
                    </h2>
                    <span className="card-subtitle">{new Date().toDateString()}</span>
                  </div>
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: "1.1rem",
                      fontWeight: 700,
                      color: "var(--color-dark)",
                      backgroundColor: "var(--color-light)",
                      padding: "4px 10px",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    {currentTime}
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "16px", margin: "16px 0" }}>
                  <div
                    style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      backgroundColor: summary?.today_attendance?.checked_out
                        ? "var(--color-primary)"
                        : summary?.today_attendance?.checked_in
                        ? "var(--color-warning)"
                        : "var(--color-danger)",
                    }}
                  />
                  <div>
                    <div style={{ fontSize: "0.92rem", fontWeight: 600 }}>
                      Status:{" "}
                      {summary?.today_attendance?.checked_out
                        ? "Day Completed (Checked Out)"
                        : summary?.today_attendance?.checked_in
                        ? `Checked In at ${summary.today_attendance.check_in_time}`
                        : "Not Checked In Yet"}
                    </div>
                    {summary?.today_attendance?.checked_out && (
                      <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                        Checked in: {summary.today_attendance.check_in_time} | Checked out:{" "}
                        {summary.today_attendance.check_out_time}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: "12px", marginTop: "16px" }}>
                <button
                  className="btn btn-primary"
                  onClick={handleCheckIn}
                  disabled={actionLoading || summary?.today_attendance?.checked_in}
                  style={{ flex: 1 }}
                >
                  <LogIn size={16} />
                  <span>Check In</span>
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handleCheckOut}
                  disabled={
                    actionLoading ||
                    !summary?.today_attendance?.checked_in ||
                    summary?.today_attendance?.checked_out
                  }
                  style={{ flex: 1 }}
                >
                  <LogOut size={16} />
                  <span>Check Out</span>
                </button>
              </div>
            </div>

            {/* Leave Request Counters Card */}
            <div className="card" style={{ marginBottom: 0 }}>
              <div className="card-header" style={{ marginBottom: "16px" }}>
                <h2 className="card-title">
                  <Calendar size={19} color="var(--color-primary)" />
                  Leave Summary
                </h2>
                <button
                  onClick={() => onNavigate("apply_leave")}
                  className="btn btn-primary btn-sm"
                >
                  Apply Leave
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div style={{ padding: "14px", backgroundColor: "#f8faf7", borderRadius: "var(--radius-md)" }}>
                  <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted)", fontWeight: 600 }}>
                    TOTAL APPLIED
                  </div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--color-dark)" }}>
                    {summary?.request_counts?.total_requests || 0}
                  </div>
                </div>
                <div style={{ padding: "14px", backgroundColor: "var(--color-warning-bg)", borderRadius: "var(--radius-md)" }}>
                  <div style={{ fontSize: "0.78rem", color: "var(--color-warning)", fontWeight: 600 }}>
                    PENDING
                  </div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--color-warning)" }}>
                    {summary?.request_counts?.pending_count || 0}
                  </div>
                </div>
                <div style={{ padding: "14px", backgroundColor: "var(--color-success-bg)", borderRadius: "var(--radius-md)" }}>
                  <div style={{ fontSize: "0.78rem", color: "var(--color-success)", fontWeight: 600 }}>
                    APPROVED
                  </div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--color-success)" }}>
                    {summary?.request_counts?.approved_count || 0}
                  </div>
                </div>
                <div style={{ padding: "14px", backgroundColor: "var(--color-danger-bg)", borderRadius: "var(--radius-md)" }}>
                  <div style={{ fontSize: "0.78rem", color: "var(--color-danger)", fontWeight: 600 }}>
                    REJECTED
                  </div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--color-danger)" }}>
                    {summary?.request_counts?.rejected_count || 0}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Leave Balances Grid */}
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Available Leave Balances</h2>
                <span className="card-subtitle">Calendar year allocations</span>
              </div>
              <button
                onClick={() => onNavigate("my_balances")}
                className="btn btn-outline btn-sm"
              >
                View Details
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
              {summary?.balances?.map((b) => {
                const usedPercent = Math.min(
                  100,
                  Math.round((b.used_days / (b.allocated_days || 1)) * 100)
                );
                return (
                  <div
                    key={b.leave_type_name}
                    style={{
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-md)",
                      padding: "16px",
                      backgroundColor: "#fafdfa",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                      <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>{b.leave_type_name}</span>
                      <span style={{ fontSize: "0.82rem", color: "var(--color-text-muted)" }}>
                        {b.used_days} / {b.allocated_days} days
                      </span>
                    </div>
                    <div className="progress-bar-bg">
                      <div className="progress-bar-fill" style={{ width: `${usedPercent}%` }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: "8px" }}>
                      <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Available</span>
                      <span style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--color-primary)" }}>
                        {b.remaining_days} days
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Leave Requests Table */}
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Recent Leave Requests</h2>
                <span className="card-subtitle">Your last 5 submitted requests</span>
              </div>
              <button
                onClick={() => onNavigate("my_requests")}
                className="btn btn-outline btn-sm"
              >
                View All Requests
              </button>
            </div>

            {summary?.recent_requests?.length === 0 ? (
              <div className="empty-state">
                <Calendar className="empty-state-icon" />
                <div className="empty-state-title">No leave requests yet</div>
                <p>When you submit a leave application, it will appear here.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Leave Type</th>
                      <th>Dates</th>
                      <th>Days</th>
                      <th>Applied On</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary?.recent_requests?.map((req) => (
                      <tr key={req.id}>
                        <td style={{ fontWeight: 600 }}>{req.leave_type_name}</td>
                        <td>
                          {req.start_date} → {req.end_date}
                        </td>
                        <td>
                          <strong>{req.requested_days}</strong> days
                        </td>
                        <td style={{ color: "var(--color-text-muted)", fontSize: "0.82rem" }}>
                          {req.created_at?.slice(0, 10)}
                        </td>
                        <td>
                          <span className={`badge badge-${req.status.toLowerCase()}`}>
                            {req.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ========================================================
          2. MANAGER DASHBOARD VIEW
          ======================================================== */}
      {role === "MANAGER" && (
        <>
          {/* Manager Metrics */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon green">
                <Users size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{summary?.team_count || 0}</div>
                <div className="stat-label">Assigned Team Members</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon blue">
                <CheckCircle2 size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{summary?.present_today || 0}</div>
                <div className="stat-label">Present Today</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon amber">
                <Clock3 size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{summary?.pending_approvals || 0}</div>
                <div className="stat-label">Pending Approvals</div>
              </div>
            </div>
          </div>

          {/* Quick Approvals Link Card */}
          {summary?.pending_approvals > 0 && (
            <div
              className="alert alert-warning"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 20px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <AlertCircle size={22} color="var(--color-warning)" />
                <div>
                  <strong>You have {summary.pending_approvals} leave request(s) awaiting review.</strong>
                  <div style={{ fontSize: "0.82rem" }}>Review dates, reason, and employee balance to take action.</div>
                </div>
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => onNavigate("pending_approvals")}
              >
                Review Requests <ArrowRight size={14} />
              </button>
            </div>
          )}

          {/* Team Attendance Today Preview */}
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Team Attendance Status (Today)</h2>
                <span className="card-subtitle">Live check-in status for your reporting employees</span>
              </div>
              <button
                onClick={() => onNavigate("team_attendance")}
                className="btn btn-outline btn-sm"
              >
                Full Attendance Log
              </button>
            </div>

            {summary?.team_attendance_today?.length === 0 ? (
              <div className="empty-state">
                <Users className="empty-state-icon" />
                <div className="empty-state-title">No reporting team members found</div>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Employee Name</th>
                      <th>Designation</th>
                      <th>Check In</th>
                      <th>Check Out</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary?.team_attendance_today?.map((m, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600 }}>{m.employee_name}</td>
                        <td style={{ color: "var(--color-text-muted)" }}>{m.designation}</td>
                        <td>{m.check_in_time || "—"}</td>
                        <td>{m.check_out_time || "—"}</td>
                        <td>
                          {m.check_out_time ? (
                            <span className="badge badge-approved">Completed</span>
                          ) : m.check_in_time ? (
                            <span className="badge badge-pending">Present</span>
                          ) : (
                            <span className="badge badge-rejected">Absent / Not Marked</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ========================================================
          3. ADMIN / HR DASHBOARD VIEW
          ======================================================== */}
      {(role === "ADMIN" || role === "HR") && (
        <>
          {/* Admin Stats Grid */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon green">
                <Users size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{summary?.total_employees || 0}</div>
                <div className="stat-label">Total Employees</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon blue">
                <Building2 size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{summary?.total_departments || 0}</div>
                <div className="stat-label">Departments</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon green">
                <Tags size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{summary?.total_leave_types || 0}</div>
                <div className="stat-label">Leave Categories</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon blue">
                <CheckCircle2 size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{summary?.present_today || 0}</div>
                <div className="stat-label">Present Today</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon amber">
                <Clock3 size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{summary?.total_pending_requests || 0}</div>
                <div className="stat-label">Pending Leaves</div>
              </div>
            </div>
          </div>

          {/* Department Breakdown */}
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Department Distribution</h2>
                <span className="card-subtitle">Headcount across company divisions</span>
              </div>
              <button
                onClick={() => onNavigate("departments")}
                className="btn btn-outline btn-sm"
              >
                Manage Departments
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
              {summary?.department_breakdown?.map((d) => (
                <div
                  key={d.name}
                  style={{
                    padding: "16px",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    backgroundColor: "#fafdfa",
                  }}
                >
                  <div style={{ fontSize: "0.82rem", color: "var(--color-text-muted)", fontWeight: 500 }}>
                    {d.name}
                  </div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--color-dark)", marginTop: "4px" }}>
                    {d.employee_count} <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>employees</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Audit Trail Preview */}
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">System Activity & Audit Trail</h2>
                <span className="card-subtitle">Latest recorded system events</span>
              </div>
              <button
                onClick={() => onNavigate("audit_logs")}
                className="btn btn-outline btn-sm"
              >
                View Full Audit Logs
              </button>
            </div>

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Record</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {summary?.recent_audits?.map((log, i) => (
                    <tr key={i}>
                      <td style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                        {log.timestamp}
                      </td>
                      <td style={{ fontWeight: 600 }}>{log.user_email || "System"}</td>
                      <td>
                        <span className="badge badge-neutral">{log.action}</span>
                      </td>
                      <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
                        {log.affected_record || "—"}
                      </td>
                      <td style={{ fontSize: "0.85rem" }}>{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
