import React, { useState, useEffect } from "react";
import { PieChart, Search, Info, CheckCircle2 } from "lucide-react";
import { api } from "../api";

export default function LeaveBalancesPage({ user, showToast }) {
  const role = user?.role;
  const isAdmin = role === "ADMIN" || role === "HR";

  const [myBalances, setMyBalances] = useState([]);
  const [allBalances, setAllBalances] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBalances = async () => {
      try {
        setLoading(true);
        if (isAdmin) {
          const data = await api.getAllLeaveBalances();
          setAllBalances(data.balances || []);
        } else {
          const data = await api.getMyBalances();
          setMyBalances(data.balances || []);
        }
      } catch (err) {
        if (showToast) showToast(err.message, "error");
      } finally {
        setLoading(false);
      }
    };
    fetchBalances();
  }, [isAdmin]);

  const filteredAllBalances = allBalances.filter(
    (b) =>
      b.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.employee_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.department_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.leave_type_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      {/* ========================================================
          EMPLOYEE / MANAGER PERSONAL BALANCES VIEW
          ======================================================== */}
      {!isAdmin ? (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">
                <PieChart size={20} color="var(--color-primary)" />
                My Leave Balances
              </h2>
              <span className="card-subtitle">
                Current allocation and utilization breakdown for the active calendar year
              </span>
            </div>
          </div>

          {loading ? (
            <div className="loading-container">
              <div className="loading-spinner" />
              <p>Loading leave balances...</p>
            </div>
          ) : myBalances.length === 0 ? (
            <div className="empty-state">
              <PieChart className="empty-state-icon" />
              <div className="empty-state-title">No leave balances assigned</div>
              <p>Contact your HR administrator to set up your yearly leave entitlement.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
              {myBalances.map((b) => {
                const usedPercent = Math.min(
                  100,
                  Math.round((b.used_days / (b.allocated_days || 1)) * 100)
                );
                return (
                  <div
                    key={b.id}
                    style={{
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-lg)",
                      padding: "20px",
                      backgroundColor: "#fafdfa",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                      <div>
                        <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--color-dark)" }}>
                          {b.leave_type_name}
                        </h3>
                        {b.leave_type_description && (
                          <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: "2px" }}>
                            {b.leave_type_description}
                          </p>
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: "1.4rem",
                          fontWeight: 700,
                          color: "var(--color-primary)",
                          backgroundColor: "var(--color-light)",
                          padding: "4px 12px",
                          borderRadius: "var(--radius-md)",
                        }}
                      >
                        {b.remaining_days} <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>left</span>
                      </span>
                    </div>

                    <div className="progress-bar-bg" style={{ height: "10px" }}>
                      <div className="progress-bar-fill" style={{ width: `${usedPercent}%` }} />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "14px" }}>
                      <div style={{ padding: "10px", backgroundColor: "#ffffff", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}>
                        <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Total Allocated</div>
                        <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--color-text)" }}>
                          {b.allocated_days} days
                        </div>
                      </div>
                      <div style={{ padding: "10px", backgroundColor: "#ffffff", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}>
                        <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Days Used</div>
                        <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--color-warning)" }}>
                          {b.used_days} days
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ========================================================
           ADMIN COMPANY-WIDE BALANCES MATRIX
           ======================================================== */
        <div className="card">
          <div className="card-header" style={{ flexWrap: "wrap", gap: "12px" }}>
            <div>
              <h2 className="card-title">
                <PieChart size={20} color="var(--color-primary)" />
                Company-wide Leave Balances Matrix
              </h2>
              <span className="card-subtitle">
                Overview of all employee allocations, used days, and remaining balances
              </span>
            </div>

            {/* Search Input */}
            <div style={{ position: "relative", width: "260px" }}>
              <input
                type="text"
                className="form-control"
                placeholder="Search employee or type..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ paddingLeft: "36px", fontSize: "0.85rem" }}
              />
              <Search
                size={16}
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

          {loading ? (
            <div className="loading-container">
              <div className="loading-spinner" />
              <p>Loading company balances...</p>
            </div>
          ) : filteredAllBalances.length === 0 ? (
            <div className="empty-state">
              <PieChart className="empty-state-icon" />
              <div className="empty-state-title">No balance records found</div>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Emp Code</th>
                    <th>Employee Name</th>
                    <th>Department</th>
                    <th>Leave Type</th>
                    <th>Allocated</th>
                    <th>Used</th>
                    <th>Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAllBalances.map((b) => (
                    <tr key={b.id}>
                      <td style={{ fontFamily: "monospace", fontWeight: 600 }}>{b.employee_code}</td>
                      <td style={{ fontWeight: 600 }}>{b.employee_name}</td>
                      <td style={{ color: "var(--color-text-muted)" }}>{b.department_name || "Unassigned"}</td>
                      <td>{b.leave_type_name}</td>
                      <td>{b.allocated_days} days</td>
                      <td style={{ color: "var(--color-warning)", fontWeight: 600 }}>
                        {b.used_days} days
                      </td>
                      <td>
                        <span
                          style={{
                            fontWeight: 700,
                            color: b.remaining_days > 0 ? "var(--color-primary)" : "var(--color-danger)",
                          }}
                        >
                          {b.remaining_days} days
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
