import React, { useState, useEffect } from "react";
import { Clock, LogIn, LogOut, Calendar, CheckCircle2, AlertCircle, Search } from "lucide-react";
import { api } from "../api";

export default function AttendancePage({ user, viewMode = "team", showToast }) {
  const role = user?.role;
  const isPersonalView = role === "EMPLOYEE" || viewMode === "personal";

  // State for the authenticated user's personal attendance
  const [myRecords, setMyRecords] = useState([]);
  const [todayStatus, setTodayStatus] = useState(null);

  // State for manager/admin team attendance
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [teamRecords, setTeamRecords] = useState([]);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Load the authenticated user's attendance
  const loadMyAttendance = async () => {
    try {
      setLoading(true);
      const [historyData, statusData] = await Promise.all([
        api.getMyAttendance(),
        api.getTodayStatus(),
      ]);
      setMyRecords(historyData.records || []);
      setTodayStatus(statusData);
    } catch (err) {
      if (showToast) showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // Load team/company attendance
  const loadTeamAttendance = async (dateStr) => {
    try {
      setLoading(true);
      const data = await api.getTeamAttendance(dateStr);
      setTeamRecords(data.team_attendance || []);
    } catch (err) {
      if (showToast) showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isPersonalView) {
      loadMyAttendance();
    } else {
      loadTeamAttendance(selectedDate);
    }
  }, [selectedDate, isPersonalView]);

  const handleCheckIn = async () => {
    setActionLoading(true);
    try {
      const res = await api.checkIn();
      if (showToast) showToast(res.message, "success");
      await loadMyAttendance();
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
      await loadMyAttendance();
    } catch (err) {
      if (showToast) showToast(err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div>
      {/* ========================================================
          EMPLOYEE ATTENDANCE VIEW
          ======================================================== */}
      {isPersonalView ? (
        <>
          {/* Daily Action Card */}
          <div className="card" style={{ maxWidth: "680px", margin: "0 auto 24px" }}>
            <div className="card-header">
              <div>
                <h2 className="card-title">
                  <Clock size={20} color="var(--color-primary)" />
                  Today's Attendance Action
                </h2>
                <span className="card-subtitle">{new Date().toDateString()}</span>
              </div>
              <span
                className={`badge ${
                  todayStatus?.checked_out
                    ? "badge-approved"
                    : todayStatus?.checked_in
                    ? "badge-pending"
                    : "badge-rejected"
                }`}
              >
                {todayStatus?.checked_out
                  ? "Completed"
                  : todayStatus?.checked_in
                  ? "Checked In"
                  : "Not Checked In"}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
              <div style={{ padding: "14px", backgroundColor: "#f8faf7", borderRadius: "var(--radius-md)" }}>
                <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>Check-In Time</div>
                <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--color-dark)" }}>
                  {todayStatus?.check_in_time || "—"}
                </div>
              </div>
              <div style={{ padding: "14px", backgroundColor: "#f8faf7", borderRadius: "var(--radius-md)" }}>
                <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>Check-Out Time</div>
                <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--color-dark)" }}>
                  {todayStatus?.check_out_time || "—"}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px" }}>
              <button
                className="btn btn-primary"
                onClick={handleCheckIn}
                disabled={actionLoading || todayStatus?.checked_in}
                style={{ flex: 1, padding: "12px" }}
              >
                <LogIn size={18} />
                <span>Check In for Today</span>
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleCheckOut}
                disabled={actionLoading || !todayStatus?.checked_in || todayStatus?.checked_out}
                style={{ flex: 1, padding: "12px" }}
              >
                <LogOut size={18} />
                <span>Check Out for Today</span>
              </button>
            </div>
          </div>

          {/* Attendance History Table */}
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Attendance History</h2>
                <span className="card-subtitle">Your recent check-in and check-out logs</span>
              </div>
            </div>

            {loading ? (
              <div className="loading-container">
                <div className="loading-spinner" />
                <p>Loading attendance history...</p>
              </div>
            ) : myRecords.length === 0 ? (
              <div className="empty-state">
                <Calendar className="empty-state-icon" />
                <div className="empty-state-title">No attendance records yet</div>
                <p>Use the Check In button above to mark today's attendance.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Check In</th>
                      <th>Check Out</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myRecords.map((r) => (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 600 }}>{r.attendance_date}</td>
                        <td>{r.check_in_time || "—"}</td>
                        <td>{r.check_out_time || "—"}</td>
                        <td>
                          <span
                            className={`badge ${
                              r.check_out_time ? "badge-approved" : "badge-pending"
                            }`}
                          >
                            {r.status}
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
      ) : (
        /* ========================================================
           MANAGER & ADMIN TEAM ATTENDANCE VIEW
           ======================================================== */
        <div className="card">
          <div className="card-header" style={{ flexWrap: "wrap", gap: "16px" }}>
            <div>
              <h2 className="card-title">
                <Calendar size={20} color="var(--color-primary)" />
                {role === "ADMIN" || role === "HR" ? "Company Attendance Overview" : "Team Attendance Log"}
              </h2>
              <span className="card-subtitle">
                {role === "ADMIN" || role === "HR" ? "All employee attendance records" : "Reporting team members"}
              </span>
            </div>

            {/* Date Filter Picker */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <label htmlFor="att-date" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                Select Date:
              </label>
              <input
                id="att-date"
                type="date"
                className="form-control"
                style={{ width: "auto" }}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <div className="loading-container">
              <div className="loading-spinner" />
              <p>Fetching attendance records for {selectedDate}...</p>
            </div>
          ) : teamRecords.length === 0 ? (
            <div className="empty-state">
              <Clock className="empty-state-icon" />
              <div className="empty-state-title">No employees found for this date</div>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Emp Code</th>
                    <th>Full Name</th>
                    <th>Department</th>
                    <th>Designation</th>
                    <th>Check In</th>
                    <th>Check Out</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {teamRecords.map((t) => (
                    <tr key={t.employee_id}>
                      <td style={{ fontFamily: "monospace", fontWeight: 600 }}>{t.employee_code}</td>
                      <td style={{ fontWeight: 600 }}>{t.full_name}</td>
                      <td>{t.department_name}</td>
                      <td style={{ color: "var(--color-text-muted)" }}>{t.designation}</td>
                      <td>{t.check_in_time || "—"}</td>
                      <td>{t.check_out_time || "—"}</td>
                      <td>
                        <span
                          className={`badge ${
                            t.status === "Completed"
                              ? "badge-approved"
                              : t.status === "Checked In"
                              ? "badge-pending"
                              : "badge-rejected"
                          }`}
                        >
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
