"""
LeaveFlow - Attendance Management Module
Handles daily check-in, check-out, attendance logs, and team attendance views.
Enforces business rules:
- One check-in per day per employee.
- Checkout requires existing check-in on the same date.
- Checkout time cannot precede check-in time.
"""

from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from auth import get_current_user, require_roles
from database import create_audit_log, get_db_connection

attendance_router = APIRouter(prefix="/attendance", tags=["Attendance"])


@attendance_router.get("/me")
def get_my_attendance(current_user: dict = Depends(get_current_user)):
    """
    Retrieves the attendance history for the authenticated employee,
    ordered by date descending.
    """
    emp_id = current_user.get("employee_id")
    if not emp_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current user is not associated with an employee record."
        )

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT 
            id,
            attendance_date,
            check_in_time,
            check_out_time
        FROM attendance
        WHERE employee_id = ?
        ORDER BY attendance_date DESC
        LIMIT 60
    """, (emp_id,))

    rows = cursor.fetchall()
    conn.close()

    # Convert SQLite rows into Python list of dictionaries
    records = []
    for row in rows:
        records.append({
            "id": row["id"],
            "attendance_date": row["attendance_date"],
            "check_in_time": row["check_in_time"],
            "check_out_time": row["check_out_time"],
            "status": "Completed" if row["check_out_time"] else "In Progress"
        })

    return {"records": records}


@attendance_router.get("/today-status")
def get_today_status(current_user: dict = Depends(get_current_user)):
    """
    Returns today's check-in and check-out status for the logged-in employee.
    """
    emp_id = current_user.get("employee_id")
    if not emp_id:
        return {"has_employee_profile": False}

    today_str = date.today().isoformat()

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id, attendance_date, check_in_time, check_out_time
        FROM attendance
        WHERE employee_id = ? AND attendance_date = ?
    """, (emp_id, today_str))

    row = cursor.fetchone()
    conn.close()

    if not row:
        return {
            "has_employee_profile": True,
            "today_date": today_str,
            "checked_in": False,
            "checked_out": False,
            "check_in_time": None,
            "check_out_time": None
        }

    return {
        "has_employee_profile": True,
        "today_date": today_str,
        "checked_in": bool(row["check_in_time"]),
        "checked_out": bool(row["check_out_time"]),
        "check_in_time": row["check_in_time"],
        "check_out_time": row["check_out_time"]
    }


@attendance_router.post("/check-in")
def check_in(current_user: dict = Depends(get_current_user)):
    """
    Records daily check-in for the current employee.
    Enforces the rule that an employee can check in only once per day.
    """
    emp_id = current_user.get("employee_id")
    if not emp_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No employee record associated with your user account."
        )

    today_str = date.today().isoformat()
    now_time_str = datetime.now().strftime("%H:%M:%S")

    conn = get_db_connection()
    cursor = conn.cursor()

    # Check if attendance record already exists for today
    cursor.execute("""
        SELECT id, check_in_time, check_out_time 
        FROM attendance
        WHERE employee_id = ? AND attendance_date = ?
    """, (emp_id, today_str))

    existing = cursor.fetchone()

    if existing:
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"You have already checked in today at {existing['check_in_time']}."
        )

    # Insert new attendance record
    cursor.execute("""
        INSERT INTO attendance (employee_id, attendance_date, check_in_time, check_out_time)
        VALUES (?, ?, ?, NULL)
    """, (emp_id, today_str, now_time_str))

    record_id = cursor.lastrowid

    # Record audit log
    create_audit_log(
        conn,
        current_user["user_id"],
        "ATTENDANCE_CHECK_IN",
        f"attendance:{record_id}",
        f"Checked in at {now_time_str} on {today_str}"
    )

    conn.commit()
    conn.close()

    return {
        "message": f"Successfully checked in at {now_time_str}.",
        "attendance_date": today_str,
        "check_in_time": now_time_str
    }


@attendance_router.post("/check-out")
def check_out(current_user: dict = Depends(get_current_user)):
    """
    Records checkout for the current employee.
    Enforces rules:
    - Checkout requires an existing check-in for today.
    - An employee cannot check out twice.
    - Checkout time cannot occur before check-in time.
    """
    emp_id = current_user.get("employee_id")
    if not emp_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No employee record associated with your user account."
        )

    today_str = date.today().isoformat()
    now_time_str = datetime.now().strftime("%H:%M:%S")

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id, check_in_time, check_out_time
        FROM attendance
        WHERE employee_id = ? AND attendance_date = ?
    """, (emp_id, today_str))

    existing = cursor.fetchone()

    if not existing or not existing["check_in_time"]:
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot check out without checking in first for today."
        )

    if existing["check_out_time"]:
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"You have already checked out today at {existing['check_out_time']}."
        )

    # Validate checkout time >= checkin time
    check_in_dt = datetime.strptime(existing["check_in_time"], "%H:%M:%S").time()
    now_dt = datetime.strptime(now_time_str, "%H:%M:%S").time()
    if now_dt < check_in_dt:
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Checkout time cannot be earlier than check-in time."
        )

    # Update attendance record with checkout time
    cursor.execute("""
        UPDATE attendance
        SET check_out_time = ?
        WHERE id = ?
    """, (now_time_str, existing["id"]))

    create_audit_log(
        conn,
        current_user["user_id"],
        "ATTENDANCE_CHECK_OUT",
        f"attendance:{existing['id']}",
        f"Checked out at {now_time_str} on {today_str}"
    )

    conn.commit()
    conn.close()

    return {
        "message": f"Successfully checked out at {now_time_str}.",
        "attendance_date": today_str,
        "check_in_time": existing["check_in_time"],
        "check_out_time": now_time_str
    }


@attendance_router.get("/team")
def get_team_attendance(
    target_date: Optional[str] = Query(None, alias="date"),
    current_user: dict = Depends(require_roles({"MANAGER", "HR", "ADMIN"}))
):
    """
    Managers can view attendance for assigned team members.
    Admins can view attendance across all employees.
    Filterable by attendance date (defaults to today if omitted).
    """
    user_role = current_user.get("role")
    manager_emp_id = current_user.get("employee_id")

    # If target_date is not specified, default to today
    selected_date = target_date.strip() if target_date else date.today().isoformat()

    conn = get_db_connection()
    cursor = conn.cursor()

    if user_role in {"ADMIN", "HR"}:
        # Admin and HR can view all employees and their attendance on selected_date.
        cursor.execute("""
            SELECT 
                e.id AS employee_id,
                e.employee_code,
                e.full_name,
                e.designation,
                d.name AS department_name,
                a.id AS attendance_id,
                a.attendance_date,
                a.check_in_time,
                a.check_out_time
            FROM employees e
            JOIN users u ON u.id = e.user_id AND u.is_active = 1
            LEFT JOIN departments d ON e.department_id = d.id
                AND d.workspace_id = u.workspace_id
            LEFT JOIN attendance a ON e.id = a.employee_id AND a.attendance_date = ?
            WHERE u.workspace_id = ?
            ORDER BY e.full_name ASC
        """, (selected_date, current_user["workspace_id"]))
    else:
        # Manager can view only subordinates reporting to them
        cursor.execute("""
            SELECT 
                e.id AS employee_id,
                e.employee_code,
                e.full_name,
                e.designation,
                d.name AS department_name,
                a.id AS attendance_id,
                a.attendance_date,
                a.check_in_time,
                a.check_out_time
            FROM employees e
            JOIN users u ON u.id = e.user_id AND u.is_active = 1
            LEFT JOIN departments d ON e.department_id = d.id
                AND d.workspace_id = u.workspace_id
            LEFT JOIN attendance a ON e.id = a.employee_id AND a.attendance_date = ?
            WHERE e.manager_id = ? AND u.workspace_id = ?
            ORDER BY e.full_name ASC
        """, (selected_date, manager_emp_id, current_user["workspace_id"]))

    rows = cursor.fetchall()
    conn.close()

    team_records = []
    for row in rows:
        check_in = row["check_in_time"]
        check_out = row["check_out_time"]

        if not check_in:
            att_status = "Absent / Not Marked"
        elif check_in and not check_out:
            att_status = "Checked In"
        else:
            att_status = "Completed"

        team_records.append({
            "employee_id": row["employee_id"],
            "employee_code": row["employee_code"],
            "full_name": row["full_name"],
            "designation": row["designation"],
            "department_name": row["department_name"] or "Unassigned",
            "attendance_date": selected_date,
            "check_in_time": check_in,
            "check_out_time": check_out,
            "status": att_status
        })

    return {
        "selected_date": selected_date,
        "team_attendance": team_records
    }
