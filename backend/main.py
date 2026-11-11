"""
LeaveFlow - Main Application Entry Point
FastAPI application with CORS, database initialization, routing,
and dynamic role-tailored dashboard summaries.
"""

from contextlib import asynccontextmanager
from datetime import date

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from admin import admin_router
from attendance import attendance_router
from auth import auth_router, get_current_user
from database import get_db_connection, init_db
from leaves import leaves_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler:
    Initializes database tables without inserting demonstration records.
    """
    # 1. Initialize 9 tables and indexes
    init_db()
    yield


app = FastAPI(
    title="LeaveFlow — Employee Leave & Attendance Management System",
    description="Full-stack enterprise backend with SQLite, FastAPI, and JWT authentication.",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS to allow frontend communication from Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth_router)
app.include_router(attendance_router)
app.include_router(leaves_router)
app.include_router(admin_router)


@app.get("/api/health")
def health_check():
    """
    Health check endpoint to verify backend status.
    """
    return {
        "status": "healthy",
        "app": "LeaveFlow API",
        "version": "1.0.0",
        "timestamp": date.today().isoformat()
    }


@app.get("/dashboard/summary")
def get_dashboard_summary(current_user: dict = Depends(get_current_user)):
    """
    Returns real database statistics tailored to the authenticated user's role:
    - Employee: Personal leave balances, recent attendance, personal requests summary
    - Manager: Team size, subordinates present today, pending approvals count
    - Admin: Company-wide metrics, departments, employees, pending leaves, audit highlights
    """
    role = current_user.get("role")
    emp_id = current_user.get("employee_id")
    today_str = date.today().isoformat()

    conn = get_db_connection()
    cursor = conn.cursor()

    summary_data = {
        "role": role,
        "user_name": current_user.get("full_name"),
        "employee_code": current_user.get("employee_code"),
        "today_date": today_str
    }

    if role == "EMPLOYEE":
        # 1. Available balances
        cursor.execute("""
            SELECT 
                lt.name AS leave_type_name,
                lb.allocated_days,
                lb.used_days,
                (lb.allocated_days - lb.used_days) AS remaining_days
            FROM leave_balances lb
            JOIN leave_types lt ON lb.leave_type_id = lt.id
            WHERE lb.employee_id = ? AND lt.workspace_id = ?
        """, (emp_id, current_user["workspace_id"]))
        balances = [dict(r) for r in cursor.fetchall()]

        # 2. Leave requests count by status
        cursor.execute("""
            SELECT 
                COUNT(*) AS total_requests,
                SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending_count,
                SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) AS approved_count,
                SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected_count
            FROM leave_requests
            WHERE employee_id = ?
        """, (emp_id,))
        req_counts = dict(cursor.fetchone())

        # 3. Today's attendance status
        cursor.execute("""
            SELECT check_in_time, check_out_time
            FROM attendance
            WHERE employee_id = ? AND attendance_date = ?
        """, (emp_id, today_str))
        att_row = cursor.fetchone()
        today_att = {
            "checked_in": bool(att_row and att_row["check_in_time"]),
            "checked_out": bool(att_row and att_row["check_out_time"]),
            "check_in_time": att_row["check_in_time"] if att_row else None,
            "check_out_time": att_row["check_out_time"] if att_row else None
        }

        # 4. Recent requests (last 5)
        cursor.execute("""
            SELECT 
                lr.id,
                lt.name AS leave_type_name,
                lr.start_date,
                lr.end_date,
                lr.requested_days,
                lr.status,
                lr.created_at
            FROM leave_requests lr
            JOIN leave_types lt ON lr.leave_type_id = lt.id
            WHERE lr.employee_id = ? AND lt.workspace_id = ?
            ORDER BY lr.created_at DESC
            LIMIT 5
        """, (emp_id, current_user["workspace_id"]))
        recent_requests = [dict(r) for r in cursor.fetchall()]

        # 5. Recent attendance (last 5)
        cursor.execute("""
            SELECT attendance_date, check_in_time, check_out_time
            FROM attendance
            WHERE employee_id = ?
            ORDER BY attendance_date DESC
            LIMIT 5
        """, (emp_id,))
        recent_attendance = [dict(r) for r in cursor.fetchall()]

        summary_data.update({
            "balances": balances,
            "request_counts": req_counts,
            "today_attendance": today_att,
            "recent_requests": recent_requests,
            "recent_attendance": recent_attendance
        })

    elif role == "MANAGER":
        # 1. Total team members reporting to this manager
        cursor.execute("""
            SELECT COUNT(*) AS team_count
            FROM employees e
            JOIN users u ON u.id = e.user_id
            WHERE e.manager_id = ? AND u.is_active = 1 AND u.workspace_id = ?
        """, (emp_id, current_user["workspace_id"]))
        team_count = cursor.fetchone()["team_count"]

        # 2. Team members present today
        cursor.execute("""
            SELECT COUNT(DISTINCT a.employee_id) AS present_count
            FROM attendance a
            JOIN employees e ON a.employee_id = e.id
            JOIN users u ON u.id = e.user_id
            WHERE e.manager_id = ? AND u.is_active = 1
              AND u.workspace_id = ? AND a.attendance_date = ?
              AND a.check_in_time IS NOT NULL
        """, (emp_id, current_user["workspace_id"], today_str))
        present_count = cursor.fetchone()["present_count"]

        # 3. Pending approvals awaiting action
        cursor.execute("""
            SELECT COUNT(*) AS pending_approvals
            FROM leave_requests lr
            JOIN employees e ON lr.employee_id = e.id
            JOIN users u ON u.id = e.user_id
            WHERE e.manager_id = ? AND u.is_active = 1 AND lr.status = 'PENDING'
              AND u.workspace_id = ?
        """, (emp_id, current_user["workspace_id"]))
        pending_approvals = cursor.fetchone()["pending_approvals"]

        # 4. Recent team requests
        cursor.execute("""
            SELECT 
                lr.id,
                e.full_name AS employee_name,
                lt.name AS leave_type_name,
                lr.start_date,
                lr.end_date,
                lr.requested_days,
                lr.status,
                lr.created_at
            FROM leave_requests lr
            JOIN employees e ON lr.employee_id = e.id
            JOIN users u ON u.id = e.user_id
            JOIN leave_types lt ON lr.leave_type_id = lt.id
                AND lt.workspace_id = u.workspace_id
            WHERE e.manager_id = ? AND u.is_active = 1 AND u.workspace_id = ?
            ORDER BY lr.created_at DESC
            LIMIT 5
        """, (emp_id, current_user["workspace_id"]))
        recent_team_requests = [dict(r) for r in cursor.fetchall()]

        # 5. Team attendance for today
        cursor.execute("""
            SELECT 
                e.full_name AS employee_name,
                e.designation,
                a.check_in_time,
                a.check_out_time
            FROM employees e
            JOIN users u ON u.id = e.user_id
            LEFT JOIN attendance a ON e.id = a.employee_id AND a.attendance_date = ?
            WHERE e.manager_id = ? AND u.is_active = 1 AND u.workspace_id = ?
            LIMIT 8
        """, (today_str, emp_id, current_user["workspace_id"]))
        team_att_today = [dict(r) for r in cursor.fetchall()]

        summary_data.update({
            "team_count": team_count,
            "present_today": present_count,
            "pending_approvals": pending_approvals,
            "recent_team_requests": recent_team_requests,
            "team_attendance_today": team_att_today
        })

    elif role in {"ADMIN", "HR"}:
        # 1. Total employees
        cursor.execute("""
            SELECT COUNT(*) AS total_employees
            FROM employees e
            JOIN users u ON u.id = e.user_id
            WHERE u.is_active = 1 AND u.workspace_id = ?
        """, (current_user["workspace_id"],))
        total_employees = cursor.fetchone()["total_employees"]

        # 2. Total departments
        cursor.execute(
            "SELECT COUNT(*) AS total_departments FROM departments WHERE workspace_id = ?",
            (current_user["workspace_id"],),
        )
        total_departments = cursor.fetchone()["total_departments"]

        # 3. Total leave types
        cursor.execute(
            "SELECT COUNT(*) AS total_leave_types FROM leave_types WHERE is_active = 1 AND workspace_id = ?",
            (current_user["workspace_id"],),
        )
        total_leave_types = cursor.fetchone()["total_leave_types"]

        # 4. Total present today across company
        cursor.execute("""
            SELECT COUNT(DISTINCT a.employee_id) AS present_count
            FROM attendance a
            JOIN employees e ON e.id = a.employee_id
            JOIN users u ON u.id = e.user_id
            WHERE u.is_active = 1 AND u.workspace_id = ?
              AND a.attendance_date = ? AND a.check_in_time IS NOT NULL
        """, (current_user["workspace_id"], today_str))
        present_count = cursor.fetchone()["present_count"]

        # 5. Total pending requests across company
        cursor.execute("""
            SELECT COUNT(*) AS total_pending
            FROM leave_requests lr
            JOIN employees e ON e.id = lr.employee_id
            JOIN users u ON u.id = e.user_id
            WHERE u.is_active = 1 AND lr.status = 'PENDING' AND u.workspace_id = ?
        """, (current_user["workspace_id"],))
        total_pending = cursor.fetchone()["total_pending"]

        # 6. Recent audit logs
        cursor.execute("""
            SELECT a.action, a.affected_record, a.details, a.timestamp,
                audit_user.email AS user_email
            FROM audit_logs a
            LEFT JOIN users audit_user ON a.user_id = audit_user.id
                AND audit_user.workspace_id = a.workspace_id
            WHERE a.workspace_id = ?
            ORDER BY a.timestamp DESC
            LIMIT 5
        """, (current_user["workspace_id"],))
        recent_audits = [dict(r) for r in cursor.fetchall()]

        # 7. Department breakdown
        cursor.execute("""
            SELECT d.name, COUNT(u.id) AS employee_count
            FROM departments d
            LEFT JOIN employees e ON d.id = e.department_id
            LEFT JOIN users u ON u.id = e.user_id AND u.is_active = 1
                AND u.workspace_id = d.workspace_id
            WHERE d.workspace_id = ?
            GROUP BY d.id
        """, (current_user["workspace_id"],))
        dept_breakdown = [dict(r) for r in cursor.fetchall()]

        summary_data.update({
            "total_employees": total_employees,
            "total_departments": total_departments,
            "total_leave_types": total_leave_types,
            "present_today": present_count,
            "total_pending_requests": total_pending,
            "recent_audits": recent_audits,
            "department_breakdown": dept_breakdown
        })

    conn.close()
    return summary_data
