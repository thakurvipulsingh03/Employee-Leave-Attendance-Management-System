import React, { useState, useEffect } from "react";
import {
  Users,
  Building2,
  Tags,
  ShieldCheck,
  Plus,
  Search,
  UserCheck,
  UserX,
  AlertCircle,
} from "lucide-react";
import { api } from "../api";
import Modal from "../components/Modal";
import PasswordInput from "../components/PasswordInput";

export default function AdminManagementPage({ activeSection = "employees", user, showToast }) {
  const isAdmin = user?.role === "ADMIN";
  const [dataList, setDataList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Ancillary data for dropdowns in modals
  const [departments, setDepartments] = useState([]);
  const [managers, setManagers] = useState([]);
  const [managerAssignments, setManagerAssignments] = useState({});
  const [savingManagerFor, setSavingManagerFor] = useState(null);

  // Modal control
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState("");

  // Form states
  const [employeeForm, setEmployeeForm] = useState({
    full_name: "",
    email: "",
    role: "EMPLOYEE",
    department_id: "",
    manager_id: "",
    designation: "",
    joining_date: new Date().toISOString().slice(0, 10),
    password: "",
  });

  const [departmentForm, setDepartmentForm] = useState({
    name: "",
    description: "",
  });

  const [leaveTypeForm, setLeaveTypeForm] = useState({
    name: "",
    description: "",
    yearly_allowance: 12,
  });
  const departmentManagers = managers.filter(
    (manager) => String(manager.department_id) === String(employeeForm.department_id)
  );

  const loadData = async () => {
    try {
      setLoading(true);
      if (activeSection === "employees" || activeSection === "users") {
        const [empData, deptData] = await Promise.all([
          activeSection === "users" ? api.getUsers() : api.getEmployees(),
          activeSection === "employees" ? api.getDepartments() : Promise.resolve({ departments: [] }),
        ]);
        const employees = activeSection === "users" ? empData.users : empData.employees;
        setDataList(employees || []);
        if (activeSection === "employees") setDepartments(deptData.departments || []);
        if (activeSection === "employees") {
          setManagerAssignments(Object.fromEntries(
            (employees || []).map((employee) => [
              employee.id,
              employee.manager_id ? String(employee.manager_id) : "",
            ])
          ));
        }
        // Find potential managers
        const mgrs = (activeSection === "employees" ? empData.employees || [] : []).filter(
          (e) => e.role === "MANAGER" && e.is_active
        );
        setManagers(mgrs);
      } else if (activeSection === "departments") {
        const data = await api.getDepartments();
        setDataList(data.departments || []);
      } else if (activeSection === "leave_types") {
        const data = await api.getAllLeaveTypes();
        setDataList(data.leave_types || []);
      } else if (activeSection === "audit_logs") {
        const data = await api.getAuditLogs(100);
        setDataList(data.audit_logs || []);
      }
    } catch (err) {
      if (showToast) showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleUserStatus = async (employee) => {
    try {
      const response = await api.updateUserStatus(employee.user_id, !employee.is_active);
      if (showToast) showToast(response.message, "success");
      await loadData();
    } catch (error) {
      if (showToast) showToast(error.message, "error");
    }
  };

  const handleManagerAssignment = async (employee) => {
    setSavingManagerFor(employee.id);
    try {
      const selectedManagerId = managerAssignments[employee.id];
      const response = await api.updateEmployeeManager(
        employee.id,
        selectedManagerId ? Number(selectedManagerId) : null
      );
      if (showToast) showToast(response.message, "success");
      await loadData();
    } catch (error) {
      if (showToast) showToast(error.message, "error");
    } finally {
      setSavingManagerFor(null);
    }
  };

  useEffect(() => {
    loadData();
    setIsModalOpen(false);
    setSearchTerm("");
  }, [activeSection]);

  const handleOpenModal = () => {
    setModalError("");
    if (user?.role === "MANAGER") {
      setEmployeeForm((form) => ({
        ...form,
        role: "EMPLOYEE",
        department_id: user.department_id || "",
        manager_id: "",
      }));
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setModalError("");
  };

  // Submit Add Employee
  const handleCreateEmployee = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setModalError("");

    try {
      const payload = {
        ...employeeForm,
        department_id: user?.role === "MANAGER"
          ? (user.department_id || null)
          : (employeeForm.department_id ? Number(employeeForm.department_id) : null),
        manager_id: employeeForm.manager_id ? Number(employeeForm.manager_id) : null,
      };
      const res = await api.createEmployee(payload);
      if (showToast) showToast(res.message, "success");
      setEmployeeForm({
        full_name: "",
        email: "",
        role: "EMPLOYEE",
        department_id: "",
        manager_id: "",
        designation: "",
        joining_date: new Date().toISOString().slice(0, 10),
        password: "",
      });
      handleCloseModal();
      await loadData();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Add Department
  const handleCreateDepartment = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setModalError("");

    try {
      const res = await api.createDepartment(departmentForm);
      if (showToast) showToast(res.message, "success");
      handleCloseModal();
      await loadData();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Add Leave Type
  const handleCreateLeaveType = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setModalError("");

    try {
      const res = await api.createLeaveType({
        ...leaveTypeForm,
        yearly_allowance: Number(leaveTypeForm.yearly_allowance),
      });
      if (showToast) showToast(res.message, "success");
      handleCloseModal();
      await loadData();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Filter list by search term
  const filteredData = dataList.filter((item) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    if (activeSection === "employees" || activeSection === "users") {
      return (
        item.full_name?.toLowerCase().includes(term) ||
        item.employee_code?.toLowerCase().includes(term) ||
        item.email?.toLowerCase().includes(term) ||
        item.department_name?.toLowerCase().includes(term)
      );
    }
    if (activeSection === "departments") {
      return item.name?.toLowerCase().includes(term);
    }
    if (activeSection === "leave_types") {
      return item.name?.toLowerCase().includes(term);
    }
    if (activeSection === "audit_logs") {
      return (
        item.action?.toLowerCase().includes(term) ||
        item.user_email?.toLowerCase().includes(term) ||
        item.details?.toLowerCase().includes(term)
      );
    }
    return true;
  });

  return (
    <div>
      <div className="card">
        <div className="card-header" style={{ flexWrap: "wrap", gap: "16px" }}>
          <div>
            <h2 className="card-title">
              {(activeSection === "employees" || activeSection === "users") && <Users size={20} color="var(--color-primary)" />}
              {activeSection === "departments" && <Building2 size={20} color="var(--color-primary)" />}
              {activeSection === "leave_types" && <Tags size={20} color="var(--color-primary)" />}
              {activeSection === "audit_logs" && <ShieldCheck size={20} color="var(--color-primary)" />}
              {activeSection === "employees" || activeSection === "users"
                ? activeSection === "users" ? "Manage Users" : "Employees & Accounts"
                : activeSection === "departments"
                ? "Department Management"
                : activeSection === "leave_types"
                ? "Leave Types & Allowances"
                : "Security & System Audit Logs"}
            </h2>
            <span className="card-subtitle">
              {activeSection === "employees"
                ? "Create multiple accounts and manage staff roles and reporting managers"
                : activeSection === "users"
                ? "Review account roles and activate or deactivate user access"
                : activeSection === "departments"
                ? "Company business units and organizational structures"
                : activeSection === "leave_types"
                ? "Configure annual leave categories and allowance policies"
                : "Immutable trail of system operations, authentications, and approvals"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {/* Search Input */}
            <div style={{ position: "relative", width: "220px" }}>
              <input
                type="text"
                className="form-control"
                placeholder="Search records..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ paddingLeft: "34px", fontSize: "0.85rem" }}
              />
              <Search
                size={15}
                style={{
                  position: "absolute",
                  left: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--color-text-muted)",
                }}
              />
            </div>

            {/* Add Record Button */}
            {activeSection !== "audit_logs" && activeSection !== "users" && (
              <button className="btn btn-primary btn-sm" onClick={handleOpenModal}>
                <Plus size={16} />
                <span>
                  {activeSection === "employees"
                    ? "Create Account"
                    : activeSection === "departments"
                    ? "Add Department"
                    : activeSection === "leave_types"
                    ? "Add Leave Type"
                    : "Add"}
                </span>
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="loading-container">
            <div className="loading-spinner" />
            <p>Loading records...</p>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">No records found</div>
            <p>Try modifying your search or add a new record.</p>
          </div>
        ) : (
          <div className="table-responsive">
            {/* EMPLOYEES TABLE */}
            {(activeSection === "employees" || activeSection === "users") && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Emp Code</th>
                    <th>Full Name</th>
                    <th>Email Address</th>
                    <th>Role</th>
                    <th>Department</th>
                    <th>
                      {activeSection === "employees" && (user?.role === "ADMIN" || user?.role === "HR")
                        ? "Reporting Manager"
                        : "Manager"}
                    </th>
                    <th>Designation</th>
                    <th>Joined</th>
                    {activeSection === "users" && <th>Status</th>}
                    {activeSection === "users" && <th>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((emp) => (
                    <tr key={activeSection === "users" ? emp.user_id : emp.id}>
                      <td style={{ fontFamily: "monospace", fontWeight: 600 }}>{emp.employee_code}</td>
                      <td style={{ fontWeight: 600 }}>{emp.full_name}</td>
                      <td style={{ color: "var(--color-text-muted)" }}>{emp.email}</td>
                      <td>
                        <span className="user-role-badge">{emp.role}</span>
                      </td>
                      <td>{emp.department_name || "—"}</td>
                      {activeSection === "employees" && (user?.role === "ADMIN" || user?.role === "HR") && (
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: "220px" }}>
                            <select
                              className="form-control"
                              aria-label={`Reporting Manager for ${emp.full_name}`}
                              value={managerAssignments[emp.id] ?? ""}
                              onChange={(event) => setManagerAssignments({
                                ...managerAssignments,
                                [emp.id]: event.target.value,
                              })}
                            >
                              <option value="">No Manager</option>
                              {emp.manager_id && !managers.some((manager) => manager.id === emp.manager_id) && (
                                <option value={emp.manager_id}>
                                  {emp.manager_name || "Current Manager"} (unavailable)
                                </option>
                              )}
                              {managers
                                .filter((manager) => (
                                  manager.department_id === emp.department_id ||
                                  manager.department_id == null
                                ) && manager.id !== emp.id)
                                .map((manager) => (
                                  <option key={manager.id} value={manager.id}>
                                    {manager.department_id == null
                                      ? `${manager.full_name} (department will be assigned)`
                                      : manager.full_name}
                                  </option>
                                ))}
                            </select>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => handleManagerAssignment(emp)}
                              disabled={savingManagerFor === emp.id || String(emp.manager_id || "") === (managerAssignments[emp.id] ?? "")}
                            >
                              {savingManagerFor === emp.id ? "Saving..." : "Save"}
                            </button>
                          </div>
                        </td>
                      )}
                      {(activeSection !== "employees" || (user?.role !== "ADMIN" && user?.role !== "HR")) && (
                        <td>{emp.manager_name || "—"}</td>
                      )}
                      <td>{emp.designation}</td>
                      <td style={{ fontSize: "0.82rem", color: "var(--color-text-muted)" }}>
                        {emp.joining_date}
                      </td>
                      {activeSection === "users" && (
                        <>
                          <td>
                            <span className={`badge ${emp.is_active ? "badge-approved" : "badge-neutral"}`}>
                              {emp.is_active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td>
                            <button
                              className={`btn btn-sm ${emp.is_active ? "btn-outline" : "btn-primary"}`}
                              onClick={() => handleToggleUserStatus(emp)}
                              disabled={emp.user_id === user?.id}
                              title={emp.user_id === user?.id ? "You cannot deactivate your own account" : undefined}
                            >
                              {emp.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                              {emp.is_active ? "Deactivate" : "Activate"}
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* DEPARTMENTS TABLE */}
            {activeSection === "departments" && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Department Name</th>
                    <th>Description</th>
                    <th>Assigned Employees</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((dept) => (
                    <tr key={dept.id}>
                      <td style={{ fontWeight: 600 }}>{dept.name}</td>
                      <td style={{ color: "var(--color-text-muted)" }}>{dept.description || "—"}</td>
                      <td>
                        <span
                          style={{
                            fontWeight: 700,
                            backgroundColor: "var(--color-light)",
                            color: "var(--color-primary)",
                            padding: "3px 10px",
                            borderRadius: "var(--radius-full)",
                          }}
                        >
                          {dept.employee_count} members
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* LEAVE TYPES TABLE */}
            {activeSection === "leave_types" && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Category Name</th>
                    <th>Description</th>
                    <th>Yearly Allowance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((lt) => (
                    <tr key={lt.id}>
                      <td style={{ fontWeight: 600 }}>{lt.name}</td>
                      <td style={{ color: "var(--color-text-muted)" }}>{lt.description || "—"}</td>
                      <td>
                        <strong>{lt.yearly_allowance}</strong> days per year
                      </td>
                      <td>
                        <span className="badge badge-approved">
                          {lt.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* AUDIT LOGS TABLE */}
            {activeSection === "audit_logs" && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Role</th>
                    <th>Action</th>
                    <th>Affected Record</th>
                    <th>Event Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((log) => (
                    <tr key={log.id}>
                      <td style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                        {log.timestamp}
                      </td>
                      <td style={{ fontWeight: 600 }}>{log.user_email || "System"}</td>
                      <td>
                        <span className="user-role-badge">{log.user_role || "SYS"}</span>
                      </td>
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
            )}
          </div>
        )}
      </div>

      {/* ========================================================
          MODAL: ADD EMPLOYEE
          ======================================================== */}
      {activeSection === "employees" && (
        <Modal
          isOpen={isModalOpen}
          title={isAdmin
            ? `Create ${employeeForm.role === "ADMIN" ? "Admin Account" : employeeForm.role === "HR" ? "HR Account" : employeeForm.role === "MANAGER" ? "Manager Account" : "Employee Account"}`
            : "Create Employee Account"}
          onClose={handleCloseModal}
        >
          {modalError && (
            <div className="alert alert-danger" role="alert">
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <div>{modalError}</div>
            </div>
          )}

          <form onSubmit={handleCreateEmployee}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. David Miller"
                  value={employeeForm.full_name}
                  onChange={(e) =>
                    setEmployeeForm({ ...employeeForm, full_name: e.target.value })
                  }
                  required
                />
              </div>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="david@company.com"
                  value={employeeForm.email}
                  onChange={(e) =>
                    setEmployeeForm({ ...employeeForm, email: e.target.value })
                  }
                  required
                />
              </div>

              {isAdmin && (
                <div className="form-group">
                  <label className="form-label">Account Role</label>
                  <select
                    className="form-control"
                    value={employeeForm.role}
                    onChange={(e) =>
                      setEmployeeForm({ ...employeeForm, role: e.target.value })
                    }
                    required
                  >
                    <option value="EMPLOYEE">Employee</option>
                    <option value="MANAGER">Manager</option>
                    <option value="HR">HR</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
              )}
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Department</label>
                <select
                  className="form-control"
                  value={user?.role === "MANAGER" ? (user.department_id || "") : employeeForm.department_id}
                  onChange={(e) => setEmployeeForm({
                    ...employeeForm,
                    department_id: e.target.value,
                    manager_id: "",
                  })}
                  disabled={employeeForm.role === "ADMIN" || user?.role === "MANAGER"}
                  required={employeeForm.role === "MANAGER"}
                >
                  <option value="">
                    {employeeForm.role === "ADMIN"
                      ? "Separate Admin workspace"
                      : departments.length > 0
                      ? "Select Department..."
                      : "No departments in this workspace"}
                  </option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                {departments.length === 0 && employeeForm.role !== "ADMIN" && (
                  <span className="form-hint">
                    {user?.role === "ADMIN" || user?.role === "HR"
                      ? "Add a department from Departments before assigning one to this account."
                      : "No department is set up in this workspace. Ask your Admin or HR to add one."}
                  </span>
                )}
              </div>

              {employeeForm.role === "EMPLOYEE" && user?.role !== "MANAGER" && (
                <div className="form-group">
                  <label className="form-label">Reporting Manager</label>
                  <select
                    className="form-control"
                    value={employeeForm.manager_id}
                    onChange={(e) =>
                      setEmployeeForm({ ...employeeForm, manager_id: e.target.value })
                    }
                    required={departmentManagers.length > 1}
                  >
                    <option value="">
                      {departmentManagers.length > 1
                        ? "Select Reporting Manager..."
                        : departmentManagers.length === 1
                        ? `Automatically assign ${departmentManagers[0].full_name}`
                        : "No Manager (Executive)"}
                    </option>
                    {departmentManagers.map((manager) => (
                      <option key={manager.id} value={manager.id}>
                        {manager.full_name} ({manager.designation})
                      </option>
                    ))}
                  </select>
                  {departmentManagers.length === 1 && (
                    <span className="form-hint">
                      This employee will automatically report to the only active Manager in the selected department.
                    </span>
                  )}
                  {departmentManagers.length > 1 && (
                    <span className="form-hint">
                      Select which active Manager this employee will report to.
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Designation / Title</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Senior QA Engineer"
                  value={employeeForm.designation}
                  onChange={(e) =>
                    setEmployeeForm({ ...employeeForm, designation: e.target.value })
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Joining Date</label>
                <input
                  type="date"
                  className="form-control"
                  value={employeeForm.joining_date}
                  onChange={(e) =>
                    setEmployeeForm({ ...employeeForm, joining_date: e.target.value })
                  }
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Initial Password</label>
              <PasswordInput
                className="form-control"
                value={employeeForm.password}
                onChange={(e) =>
                  setEmployeeForm({ ...employeeForm, password: e.target.value })
                }
                required
                minLength={8}
                autoComplete="new-password"
              />
              <span className="form-hint">Use at least 8 characters and share it securely with the new user.</span>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleCloseModal}
                disabled={submitting}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? "Saving..." : `Create ${employeeForm.role === "ADMIN" ? "Admin Account" : employeeForm.role === "HR" ? "HR Account" : employeeForm.role === "MANAGER" ? "Manager Account" : "Employee Account"}`}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================
          MODAL: ADD DEPARTMENT
          ======================================================== */}
      {activeSection === "departments" && (
        <Modal isOpen={isModalOpen} title="Add Department" onClose={handleCloseModal}>
          {modalError && (
            <div className="alert alert-danger" role="alert">
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <div>{modalError}</div>
            </div>
          )}

          <form onSubmit={handleCreateDepartment}>
            <div className="form-group">
              <label className="form-label">Department Name</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Product Design"
                value={departmentForm.name}
                onChange={(e) => setDepartmentForm({ ...departmentForm, name: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                className="form-control"
                placeholder="Briefly describe department scope..."
                value={departmentForm.description}
                onChange={(e) =>
                  setDepartmentForm({ ...departmentForm, description: e.target.value })
                }
                rows={3}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleCloseModal}
                disabled={submitting}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? "Saving..." : "Create Department"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================
          MODAL: ADD LEAVE TYPE
          ======================================================== */}
      {activeSection === "leave_types" && (
        <Modal isOpen={isModalOpen} title="Add Leave Category" onClose={handleCloseModal}>
          {modalError && (
            <div className="alert alert-danger" role="alert">
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <div>{modalError}</div>
            </div>
          )}

          <form onSubmit={handleCreateLeaveType}>
            <div className="form-group">
              <label className="form-label">Category Name</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Parental Leave"
                value={leaveTypeForm.name}
                onChange={(e) => setLeaveTypeForm({ ...leaveTypeForm, name: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Yearly Allowance (Days)</label>
              <input
                type="number"
                min="1"
                max="100"
                className="form-control"
                value={leaveTypeForm.yearly_allowance}
                onChange={(e) =>
                  setLeaveTypeForm({ ...leaveTypeForm, yearly_allowance: e.target.value })
                }
                required
              />
              <span className="form-hint">
                This allowance will automatically be provisioned to all current active employees.
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                className="form-control"
                placeholder="Guidelines and entitlement rules for this category..."
                value={leaveTypeForm.description}
                onChange={(e) =>
                  setLeaveTypeForm({ ...leaveTypeForm, description: e.target.value })
                }
                rows={3}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleCloseModal}
                disabled={submitting}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? "Saving..." : "Create Leave Type"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
