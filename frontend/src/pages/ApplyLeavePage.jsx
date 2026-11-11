import React, { useState, useEffect } from "react";
import { CalendarPlus, AlertCircle, CheckCircle, Info, Calendar, ArrowRight } from "lucide-react";
import { api } from "../api";

export default function ApplyLeavePage({ onNavigate, showToast }) {
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [balances, setBalances] = useState([]);
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successInfo, setSuccessInfo] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [typesData, balancesData] = await Promise.all([
          api.getLeaveTypes(),
          api.getMyBalances(),
        ]);
        setLeaveTypes(typesData.leave_types || []);
        setBalances(balancesData.balances || []);

        if (typesData.leave_types?.length > 0) {
          setSelectedTypeId(typesData.leave_types[0].id);
        }
      } catch (err) {
        setErrorMessage(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Find balance for selected leave type
  const selectedBalance = balances.find(
    (b) => Number(b.leave_type_id) === Number(selectedTypeId)
  );

  // Calculate requested calendar days dynamically
  let calculatedDays = 0;
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (!isNaN(start) && !isNaN(end) && end >= start) {
      const diffMs = end.getTime() - start.getTime();
      calculatedDays = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessInfo(null);

    if (!selectedTypeId) {
      setErrorMessage("Please select a leave category.");
      return;
    }
    if (!startDate || !endDate) {
      setErrorMessage("Please select both start date and end date.");
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      setErrorMessage("Start date cannot be later than end date.");
      return;
    }
    if (!reason.trim()) {
      setErrorMessage("Please provide a reason for your leave application.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await api.applyLeave({
        leave_type_id: Number(selectedTypeId),
        start_date: startDate,
        end_date: endDate,
        reason: reason.trim(),
      });

      setSuccessInfo(response);
      if (showToast) showToast(response.message, "success");

      // Reset fields
      setStartDate("");
      setEndDate("");
      setReason("");

      // Refresh balances
      const balData = await api.getMyBalances();
      setBalances(balData.balances || []);
    } catch (err) {
      // Displays the exact backend validation message (e.g. Insufficient leave balance. Available: X days, requested: Y days.)
      setErrorMessage(err.message);
      if (showToast) showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Loading leave application form...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "680px", margin: "0 auto" }}>
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">
              <CalendarPlus size={20} color="var(--color-primary)" />
              Apply for Leave
            </h2>
            <span className="card-subtitle">
              Submit a leave application for manager review and approval
            </span>
          </div>
        </div>

        {/* Backend Error Display */}
        {errorMessage && (
          <div className="alert alert-danger" role="alert">
            <AlertCircle size={20} style={{ flexShrink: 0 }} />
            <div>
              <strong>Validation Error:</strong>
              <div>{errorMessage}</div>
            </div>
          </div>
        )}

        {/* Success Alert */}
        {successInfo && (
          <div className="alert alert-success" role="alert">
            <CheckCircle size={20} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <strong>Application Submitted!</strong>
              <div>{successInfo.message}</div>
              <div style={{ marginTop: "8px" }}>
                <button
                  onClick={() => onNavigate("my_requests")}
                  className="btn btn-secondary btn-sm"
                  style={{ gap: "4px" }}
                >
                  View My Requests <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Leave Type Dropdown */}
          <div className="form-group">
            <label className="form-label" htmlFor="leave-type-select">
              Leave Category
            </label>
            <select
              id="leave-type-select"
              className="form-control"
              value={selectedTypeId}
              onChange={(e) => setSelectedTypeId(e.target.value)}
              disabled={leaveTypes.length === 0}
              required
            >
              {leaveTypes.length === 0 && (
                <option value="">No leave categories in this workspace</option>
              )}
              {leaveTypes.map((lt) => (
                <option key={lt.id} value={lt.id}>
                  {lt.name} (Yearly allowance: {lt.yearly_allowance} days)
                </option>
              ))}
            </select>
            {leaveTypes.length === 0 && (
              <span className="form-hint">
                Ask your Admin or HR to add a leave category for this workspace
                from the Leave Types page.
              </span>
            )}
          </div>

          {/* Current Balance Preview */}
          {selectedBalance && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                backgroundColor: "#f4f8f3",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                marginBottom: "20px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Info size={16} color="var(--color-primary)" />
                <span style={{ fontSize: "0.85rem", color: "var(--color-text)" }}>
                  Available balance for <strong>{selectedBalance.leave_type_name}</strong>:
                </span>
              </div>
              <span
                style={{
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: "var(--color-primary)",
                  backgroundColor: "var(--color-light)",
                  padding: "2px 10px",
                  borderRadius: "9999px",
                }}
              >
                {selectedBalance.remaining_days} days
              </span>
            </div>
          )}

          {/* Date Pickers Grid */}
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label" htmlFor="start-date">
                Start Date
              </label>
              <input
                id="start-date"
                type="date"
                className="form-control"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="end-date">
                End Date
              </label>
              <input
                id="end-date"
                type="date"
                className="form-control"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Calculated Requested Days Indicator */}
          {calculatedDays > 0 && (
            <div
              style={{
                fontSize: "0.88rem",
                color: "var(--color-text)",
                padding: "10px 14px",
                backgroundColor: "#fafdfa",
                border: "1px dashed var(--color-border)",
                borderRadius: "var(--radius-md)",
                marginBottom: "18px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>Requested calendar duration (inclusive):</span>
              <strong style={{ color: "var(--color-dark)", fontSize: "1.05rem" }}>
                {calculatedDays} {calculatedDays === 1 ? "day" : "days"}
              </strong>
            </div>
          )}

          {/* Reason Textarea */}
          <div className="form-group">
            <label className="form-label" htmlFor="leave-reason">
              Reason for Leave
            </label>
            <textarea
              id="leave-reason"
              className="form-control"
              placeholder="Briefly state the reason for this leave request..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              required
            />
            <span className="form-hint">
              This reason will be reviewed by your manager prior to approval.
            </span>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
            style={{ width: "100%", padding: "12px", marginTop: "10px" }}
          >
            {submitting ? (
              <>
                <div className="loading-spinner" style={{ width: "16px", height: "16px", borderWidth: "2px" }} />
                <span>Validating & Submitting...</span>
              </>
            ) : (
              <>
                <CalendarPlus size={18} />
                <span>Submit Leave Application</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
