import React, { useState, useEffect } from "react";
import {
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  MessageSquare,
  AlertCircle,
  Filter,
  Check,
  X,
} from "lucide-react";
import { api } from "../api";
import Modal from "../components/Modal";

export default function LeaveRequestsPage({ user, viewMode = "my", showToast }) {
  const role = user?.role;
  const isEmployee = role === "EMPLOYEE";

  // Data states
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Approval modal states
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [decisionType, setDecisionType] = useState(null); // 'APPROVED' or 'REJECTED'
  const [managerComment, setManagerComment] = useState("");
  const [processing, setProcessing] = useState(false);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      if (isEmployee || viewMode === "my") {
        const data = await api.getMyLeaveRequests();
        setRequests(data.requests || []);
      } else if (viewMode === "pending") {
        const data = await api.getPendingLeaves();
        setRequests(data.pending_requests || []);
      } else {
        // Full team / company history
        const data = await api.getTeamLeaveHistory();
        setRequests(data.requests || []);
      }
    } catch (err) {
      if (showToast) showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [viewMode, isEmployee]);

  const handleOpenReviewModal = (req, decision) => {
    setSelectedRequest(req);
    setDecisionType(decision);
    setManagerComment("");
  };

  const handleCloseModal = () => {
    setSelectedRequest(null);
    setDecisionType(null);
    setManagerComment("");
  };

  const handleConfirmDecision = async () => {
    if (!selectedRequest || !decisionType) return;
    setProcessing(true);

    try {
      if (decisionType === "APPROVED") {
        const res = await api.approveLeave(selectedRequest.id, managerComment);
        if (showToast) showToast(res.message, "success");
      } else {
        const res = await api.rejectLeave(selectedRequest.id, managerComment);
        if (showToast) showToast(res.message, "success");
      }
      handleCloseModal();
      await fetchRequests();
    } catch (err) {
      if (showToast) showToast(err.message, "error");
    } finally {
      setProcessing(false);
    }
  };

  // Filter requests by status if filter is not ALL
  const filteredRequests = requests.filter((r) => {
    if (statusFilter === "ALL") return true;
    return r.status === statusFilter;
  });

  return (
    <div>
      <div className="card">
        <div className="card-header" style={{ flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h2 className="card-title">
              <FileText size={20} color="var(--color-primary)" />
              {viewMode === "pending"
                ? "Pending Leave Approvals"
                : viewMode === "team_history"
                ? "Team Leave Requests"
                : "My Leave Requests"}
            </h2>
            <span className="card-subtitle">
              {viewMode === "pending"
                ? "Review and act on leave applications submitted by your team members"
                : "Complete history of submitted leave applications and approval statuses"}
            </span>
          </div>

          {/* Filter dropdown for history views */}
          {viewMode !== "pending" && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Filter size={16} color="var(--color-text-muted)" />
              <select
                className="form-control"
                style={{ width: "auto", padding: "6px 12px", fontSize: "0.85rem" }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING">Pending Only</option>
                <option value="APPROVED">Approved Only</option>
                <option value="REJECTED">Rejected Only</option>
              </select>
            </div>
          )}
        </div>

        {loading ? (
          <div className="loading-container">
            <div className="loading-spinner" />
            <p>Loading leave requests...</p>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="empty-state">
            <FileText className="empty-state-icon" />
            <div className="empty-state-title">No leave requests found</div>
            <p>
              {viewMode === "pending"
                ? "There are no leave requests currently pending your approval."
                : "No matching leave records were found for this selection."}
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  {!isEmployee && viewMode !== "my" && <th>Employee</th>}
                  {!isEmployee && viewMode !== "my" && <th>Department</th>}
                  <th>Leave Type</th>
                  <th>Dates</th>
                  <th>Days</th>
                  {viewMode === "pending" && <th>Available Balance</th>}
                  <th>Reason</th>
                  <th>Status</th>
                  {viewMode === "pending" ? (
                    <th>Actions</th>
                  ) : (
                    <>
                      <th>Approver Note</th>
                      <th>Applied On</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((req) => (
                  <tr key={req.id}>
                    {!isEmployee && viewMode !== "my" && (
                      <td>
                        <div style={{ fontWeight: 600 }}>{req.employee_name}</div>
                        <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
                          {req.employee_code}
                        </div>
                      </td>
                    )}
                    {!isEmployee && viewMode !== "my" && (
                      <td style={{ color: "var(--color-text-muted)" }}>{req.department_name}</td>
                    )}
                    <td style={{ fontWeight: 600 }}>{req.leave_type_name}</td>
                    <td>
                      <div>
                        {req.start_date} → {req.end_date}
                      </div>
                    </td>
                    <td>
                      <strong>{req.requested_days}</strong> {req.requested_days === 1 ? "day" : "days"}
                    </td>
                    {viewMode === "pending" && (
                      <td>
                        <span
                          style={{
                            fontWeight: 700,
                            color: req.available_balance >= req.requested_days ? "var(--color-primary)" : "var(--color-danger)",
                          }}
                        >
                          {req.available_balance} days
                        </span>
                      </td>
                    )}
                    <td style={{ maxWidth: "220px", fontSize: "0.85rem" }}>{req.reason}</td>
                    <td>
                      <span className={`badge badge-${req.status.toLowerCase()}`}>
                        {req.status}
                      </span>
                    </td>

                    {/* Actions for Pending Requests View */}
                    {viewMode === "pending" ? (
                      <td>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleOpenReviewModal(req, "APPROVED")}
                            title="Approve this leave request"
                          >
                            <Check size={14} />
                            <span>Approve</span>
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleOpenReviewModal(req, "REJECTED")}
                            title="Reject this leave request"
                          >
                            <X size={14} />
                            <span>Reject</span>
                          </button>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td style={{ fontSize: "0.82rem", color: "var(--color-text-muted)" }}>
                          {req.approver_comment ? (
                            <span>
                              <strong>{req.approver_name}:</strong> {req.approver_comment}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                          {req.created_at?.slice(0, 10)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manager Decision Modal */}
      <Modal
        isOpen={Boolean(selectedRequest)}
        title={decisionType === "APPROVED" ? "Approve Leave Request" : "Reject Leave Request"}
        onClose={handleCloseModal}
      >
        {selectedRequest && (
          <div>
            <div
              style={{
                padding: "12px 16px",
                backgroundColor: decisionType === "APPROVED" ? "var(--color-light)" : "var(--color-danger-bg)",
                borderRadius: "var(--radius-md)",
                marginBottom: "16px",
                fontSize: "0.88rem",
              }}
            >
              <div>
                <strong>Applicant:</strong> {selectedRequest.employee_name} ({selectedRequest.employee_code})
              </div>
              <div>
                <strong>Requested:</strong> {selectedRequest.requested_days} days of {selectedRequest.leave_type_name}
              </div>
              <div>
                <strong>Dates:</strong> {selectedRequest.start_date} to {selectedRequest.end_date}
              </div>
              <div>
                <strong>Current Balance:</strong> {selectedRequest.available_balance} days available
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="decision-comment">
                Manager Review Comment (Optional)
              </label>
              <textarea
                id="decision-comment"
                className="form-control"
                placeholder={
                  decisionType === "APPROVED"
                    ? "e.g., Approved. Handover completed."
                    : "e.g., Rejected due to upcoming project milestone."
                }
                value={managerComment}
                onChange={(e) => setManagerComment(e.target.value)}
                rows={3}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "20px" }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleCloseModal}
                disabled={processing}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn ${decisionType === "APPROVED" ? "btn-primary" : "btn-danger"}`}
                onClick={handleConfirmDecision}
                disabled={processing}
              >
                {processing ? (
                  <span>Processing...</span>
                ) : decisionType === "APPROVED" ? (
                  <>
                    <Check size={16} />
                    <span>Confirm Approval</span>
                  </>
                ) : (
                  <>
                    <X size={16} />
                    <span>Confirm Rejection</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
