/**
 * LeaveFlow - Frontend API Client
 * Reusable HTTP client using native fetch.
 * Automatically attaches JWT from sessionStorage, parses JSON,
 * and formats backend error messages consistently.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const TOKEN_KEY = "leaveflow_token";
const USER_KEY = "leaveflow_user";

export const authStorage = {
  getToken: () => sessionStorage.getItem(TOKEN_KEY),
  setToken: (token) => sessionStorage.setItem(TOKEN_KEY, token),
  clearToken: () => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  },
  getUser: () => {
    const raw = sessionStorage.getItem(USER_KEY);
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  setUser: (user) => sessionStorage.setItem(USER_KEY, JSON.stringify(user)),
};

async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = authStorage.getToken();

  const headers = {
    Accept: "application/json",
    ...options.headers,
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(url, { ...options, headers });

    // Try to parse JSON response body
    let data;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      // Extract human-readable error from FastAPI HTTPException format
      let errorMessage = "An unexpected error occurred.";
      if (typeof data === "object" && data !== null) {
        if (data.detail) {
          if (Array.isArray(data.detail)) {
            // Pydantic validation error list
            errorMessage = data.detail.map((err) => `${err.loc.join(" -> ")}: ${err.msg}`).join("; ");
          } else {
            errorMessage = data.detail;
          }
        } else if (data.message) {
          errorMessage = data.message;
        }
      } else if (typeof data === "string" && data.length > 0) {
        errorMessage = data;
      }

      // If unauthorized, clear token
      if (response.status === 401) {
        authStorage.clearToken();
      }

      const error = new Error(errorMessage);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (error) {
    if (error.name === "TypeError" && error.message.includes("Failed to fetch")) {
      throw new Error(
        "Cannot connect to the backend server. Make sure the FastAPI backend is running at http://localhost:8000"
      );
    }
    throw error;
  }
}

export const api = {
  // Authentication
  getBootstrapStatus: () => apiRequest("/auth/bootstrap-status"),
  bootstrapAdmin: (accountData) =>
    apiRequest("/auth/bootstrap", {
      method: "POST",
      body: accountData,
    }),
  registerAdmin: (accountData) =>
    apiRequest("/auth/register-admin", {
      method: "POST",
      body: accountData,
    }),
  login: (email, password) =>
    apiRequest("/auth/login", {
      method: "POST",
      body: { email, password },
    }),

  getMe: () => apiRequest("/auth/me"),
  updateProfile: (profileData) =>
    apiRequest("/auth/me", {
      method: "PUT",
      body: profileData,
    }),
  changePassword: (passwordData) =>
    apiRequest("/auth/change-password", {
      method: "POST",
      body: passwordData,
    }),

  // Dashboard
  getDashboardSummary: () => apiRequest("/dashboard/summary"),

  // Attendance
  getMyAttendance: () => apiRequest("/attendance/me"),
  getTodayStatus: () => apiRequest("/attendance/today-status"),
  checkIn: () => apiRequest("/attendance/check-in", { method: "POST" }),
  checkOut: () => apiRequest("/attendance/check-out", { method: "POST" }),
  getTeamAttendance: (date) =>
    apiRequest(`/attendance/team${date ? `?date=${encodeURIComponent(date)}` : ""}`),

  // Leaves (Employee)
  getMyBalances: () => apiRequest("/leaves/balance/me"),
  getMyLeaveRequests: () => apiRequest("/leaves/my-requests"),
  getLeaveTypes: () => apiRequest("/leaves/types"),
  applyLeave: (leaveData) =>
    apiRequest("/leaves/apply", {
      method: "POST",
      body: leaveData,
    }),

  // Leaves (Manager & Admin)
  getPendingLeaves: () => apiRequest("/manager/leaves/pending"),
  getTeamLeaveHistory: () => apiRequest("/manager/leaves/history"),
  approveLeave: (requestId, comment) =>
    apiRequest(`/manager/leaves/${requestId}/approve`, {
      method: "PUT",
      body: { comment },
    }),
  rejectLeave: (requestId, comment) =>
    apiRequest(`/manager/leaves/${requestId}/reject`, {
      method: "PUT",
      body: { comment },
    }),

  // Admin Directory & Setup
  getEmployees: () => apiRequest("/employees"),
  getUsers: () => apiRequest("/admin/users"),
  updateUserStatus: (userId, isActive) =>
    apiRequest(`/admin/users/${userId}/status`, {
      method: "PATCH",
      body: { is_active: isActive },
    }),
  createEmployee: (employeeData) =>
    apiRequest("/employees", {
      method: "POST",
      body: employeeData,
    }),
  updateEmployeeManager: (employeeId, managerId) =>
    apiRequest(`/employees/${employeeId}/manager`, {
      method: "PATCH",
      body: { manager_id: managerId },
    }),
  getDepartments: () => apiRequest("/departments"),
  createDepartment: (departmentData) =>
    apiRequest("/departments", {
      method: "POST",
      body: departmentData,
    }),
  getAllLeaveTypes: () => apiRequest("/leave-types"),
  createLeaveType: (leaveTypeData) =>
    apiRequest("/leave-types", {
      method: "POST",
      body: leaveTypeData,
    }),
  getAllLeaveBalances: () => apiRequest("/leaves/balances"),
  getAuditLogs: (limit = 100) => apiRequest(`/admin/audit-logs?limit=${limit}`),
};
