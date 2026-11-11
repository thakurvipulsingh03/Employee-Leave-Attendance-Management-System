"""
LeaveFlow - Leave Management & Approval Module
Implements leave balances, leave application with strict balance validation,
and single-stage manager approval workflows.
"""

from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from auth import get_current_user, require_roles
from database import create_audit_log, get_db_connection

leaves_router = APIRouter(tags=["Leave Management"])


# ---------------------------------------------------------
# Request Models
# ---------------------------------------------------------

class LeaveApplicationRequest(BaseModel):
    leave_type_id: int = Field(..., description="ID of the leave type")
    start_date: str = Field(..., description="Start date in YYYY-MM-DD format")
    end_date: str = Field(..., description="End date in YYYY-MM-DD format")
    reason: str = Field(..., min_length=3, max_length=500, description="Reason for the leave request")


class ApprovalDecisionRequest(BaseModel):
    comment: Optional[str] = Field(None, max_length=300, description="Optional manager review comment")


# ---------------------------------------------------------
# Helper Functions (Pedagogical Python examples)
# ---------------------------------------------------------

def calculate_inclusive_days(start_str: str, end_str: str) -> int:
    """
    Parses dates and calculates inclusive calendar days.
    Raises ValueError if date format is invalid or start > end.
    Demonstrates Python datetime handling and exception flow.
    """
    start_dt = datetime.strptime(start_str, "%Y-%m-%d").date()
    end_dt = datetime.strptime(end_str, "%Y-%m-%d").date()

    if start_dt > end_dt:
        raise ValueError("Start date cannot be later than end date.")

    # Inclusive calendar days: (end - start) + 1 day
    return (end_dt - start_dt).days + 1


# ---------------------------------------------------------
# Employee Leave Endpoints
# ---------------------------------------------------------

@leaves_router.get("/leaves/types")
def get_active_leave_types(current_user: dict = Depends(get_current_user)):
    """
    Returns list of active leave types for selection in dropdowns.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, name, description, yearly_allowance
        FROM leave_types
        WHERE is_active = 1 AND workspace_id = ?
        ORDER BY name ASC
    """, (current_user["workspace_id"],))
    rows = cursor.fetchall()
    conn.close()

    return {"leave_types": [dict(r) for r in rows]}


@leaves_router.get("/leaves/balance/me")
def get_my_leave_balances(current_user: dict = Depends(get_current_user)):
    """
    Returns leave balances for all leave types for the authenticated employee.
    Calculates remaining days = allocated_days - used_days.
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
            lb.id,
            lb.leave_type_id,
            lt.name AS leave_type_name,
            lt.description AS leave_type_description,
            lb.allocated_days,
            lb.used_days,
            (lb.allocated_days - lb.used_days) AS remaining_days
        FROM leave_balances lb
        JOIN leave_types lt ON lb.leave_type_id = lt.id
        WHERE lb.employee_id = ? AND lt.workspace_id = ?
        ORDER BY lt.name ASC
    """, (emp_id, current_user["workspace_id"]))

    rows = cursor.fetchall()
    conn.close()

    balances = [dict(r) for r in rows]
    return {"balances": balances}


@leaves_router.get("/leaves/my-requests")
def get_my_leave_requests(current_user: dict = Depends(get_current_user)):
    """
    Returns all leave requests submitted by the logged-in employee,
    including approval comments and statuses.
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
            lr.id,
            lr.leave_type_id,
            lt.name AS leave_type_name,
            lr.start_date,
            lr.end_date,
            lr.requested_days,
            lr.reason,
            lr.status,
            lr.created_at,
            CASE
                WHEN approver_user.id IS NULL THEN NULL
                WHEN a.comment = 'Approved by manager.' THEN
                    'Approved by ' || CASE approver_user.role
                        WHEN 'HR' THEN 'HR'
                        WHEN 'ADMIN' THEN 'Admin'
                        ELSE 'Manager'
                    END || '.'
                WHEN a.comment = 'Rejected by manager.' THEN
                    'Rejected by ' || CASE approver_user.role
                        WHEN 'HR' THEN 'HR'
                        WHEN 'ADMIN' THEN 'Admin'
                        ELSE 'Manager'
                    END || '.'
                ELSE a.comment
            END AS approver_comment,
            CASE WHEN approver_user.id IS NULL THEN NULL ELSE a.decision_time END AS approval_time,
            CASE WHEN approver_user.id IS NULL THEN NULL ELSE m.full_name END AS approver_name
        FROM leave_requests lr
        JOIN leave_types lt ON lr.leave_type_id = lt.id
        JOIN employees requester ON requester.id = lr.employee_id
        JOIN users requester_user ON requester_user.id = requester.user_id
        LEFT JOIN approvals a ON lr.id = a.leave_request_id
        LEFT JOIN employees m ON a.approver_id = m.id
        LEFT JOIN users approver_user ON approver_user.id = m.user_id
            AND approver_user.workspace_id = requester_user.workspace_id
        WHERE lr.employee_id = ? AND lt.workspace_id = ?
            AND requester_user.workspace_id = ?
        ORDER BY lr.created_at DESC
    """, (emp_id, current_user["workspace_id"], current_user["workspace_id"]))

    rows = cursor.fetchall()
    conn.close()

    return {"requests": [dict(r) for r in rows]}


@leaves_router.post("/leaves/apply")
def apply_for_leave(
    application: LeaveApplicationRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Validates and submits a new leave request.
    Enforces the critical balance check:
    - Calculates requested calendar days inclusively.
    - Checks SQLite for employee's actual allocated and used days.
    - If requested_days > available_balance, returns HTTP 400 Bad Request:
      'Insufficient leave balance. Available: X days, requested: Y days.'
    """
    emp_id = current_user.get("employee_id")
    if not emp_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No employee record associated with your user account."
        )

    # 1. Date calculation & validation
    try:
        requested_days = calculate_inclusive_days(
            application.start_date.strip(),
            application.end_date.strip()
        )
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve)
        )

    conn = get_db_connection()
    cursor = conn.cursor()

    # 2. Check if leave type exists and is active
    cursor.execute(
        "SELECT id, name, is_active FROM leave_types WHERE id = ? AND workspace_id = ?",
        (application.leave_type_id, current_user["workspace_id"])
    )
    leave_type_row = cursor.fetchone()

    if not leave_type_row or not leave_type_row["is_active"]:
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The selected leave type does not exist or is inactive."
        )

    # 3. Retrieve employee's actual balance from SQLite
    cursor.execute("""
        SELECT id, allocated_days, used_days
        FROM leave_balances
        WHERE employee_id = ? AND leave_type_id = ?
    """, (emp_id, application.leave_type_id))

    balance_row = cursor.fetchone()

    if not balance_row:
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No leave balance record found for this leave type. Please contact HR."
        )

    allocated_days = balance_row["allocated_days"]
    used_days = balance_row["used_days"]
    available_days = allocated_days - used_days

    # 4. Critical check: requested days cannot exceed available balance
    if requested_days > available_days:
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient leave balance. Available: {available_days} days, requested: {requested_days} days."
        )

    # 5. Insert valid request with status PENDING
    cursor.execute("""
        INSERT INTO leave_requests (
            employee_id, leave_type_id, start_date, end_date, requested_days, reason, status
        )
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
    """, (
        emp_id,
        application.leave_type_id,
        application.start_date.strip(),
        application.end_date.strip(),
        requested_days,
        application.reason.strip()
    ))

    new_request_id = cursor.lastrowid

    # 6. Record audit log
    create_audit_log(
        conn,
        current_user["user_id"],
        "LEAVE_APPLY",
        f"leave_requests:{new_request_id}",
        f"Applied for {requested_days} days of {leave_type_row['name']} ({application.start_date} to {application.end_date})"
    )

    conn.commit()
    conn.close()

    return {
        "message": "Leave application submitted successfully. Pending manager approval.",
        "request_id": new_request_id,
        "requested_days": requested_days,
        "available_balance": available_days
    }


# ---------------------------------------------------------
# Manager & Admin Approval Endpoints
# ---------------------------------------------------------

@leaves_router.get("/manager/leaves/pending")
def get_pending_leaves_for_manager(
    current_user: dict = Depends(require_roles({"MANAGER", "HR", "ADMIN"}))
):
    """
    Returns pending leave requests for review.
    - Managers see pending requests from their assigned team members.
    - Admins see pending requests across all employees.
    Includes employee's current available balance for context.
    """
    user_role = current_user.get("role")
    manager_emp_id = current_user.get("employee_id")

    conn = get_db_connection()
    cursor = conn.cursor()

    if user_role in {"ADMIN", "HR"}:
        cursor.execute("""
            SELECT 
                lr.id,
                lr.employee_id,
                e.employee_code,
                e.full_name AS employee_name,
                e.designation,
                d.name AS department_name,
                lr.leave_type_id,
                lt.name AS leave_type_name,
                lr.start_date,
                lr.end_date,
                lr.requested_days,
                lr.reason,
                lr.status,
                lr.created_at,
                (lb.allocated_days - lb.used_days) AS available_balance
            FROM leave_requests lr
            JOIN employees e ON lr.employee_id = e.id
            JOIN users u ON u.id = e.user_id AND u.is_active = 1
            LEFT JOIN departments d ON e.department_id = d.id
                AND d.workspace_id = u.workspace_id
            JOIN leave_types lt ON lr.leave_type_id = lt.id
                AND lt.workspace_id = u.workspace_id
            LEFT JOIN leave_balances lb ON lr.employee_id = lb.employee_id AND lr.leave_type_id = lb.leave_type_id
            WHERE lr.status = 'PENDING' AND u.is_active = 1
              AND u.workspace_id = ?
            ORDER BY lr.created_at ASC
        """, (current_user["workspace_id"],))
    else:
        cursor.execute("""
            SELECT 
                lr.id,
                lr.employee_id,
                e.employee_code,
                e.full_name AS employee_name,
                e.designation,
                d.name AS department_name,
                lr.leave_type_id,
                lt.name AS leave_type_name,
                lr.start_date,
                lr.end_date,
                lr.requested_days,
                lr.reason,
                lr.status,
                lr.created_at,
                (lb.allocated_days - lb.used_days) AS available_balance
            FROM leave_requests lr
            JOIN employees e ON lr.employee_id = e.id
            JOIN users u ON u.id = e.user_id AND u.is_active = 1
            LEFT JOIN departments d ON e.department_id = d.id
                AND d.workspace_id = u.workspace_id
            JOIN leave_types lt ON lr.leave_type_id = lt.id
                AND lt.workspace_id = u.workspace_id
            LEFT JOIN leave_balances lb ON lr.employee_id = lb.employee_id AND lr.leave_type_id = lb.leave_type_id
            WHERE lr.status = 'PENDING' AND u.is_active = 1
              AND e.manager_id = ? AND u.workspace_id = ?
            ORDER BY lr.created_at ASC
        """, (manager_emp_id, current_user["workspace_id"]))

    rows = cursor.fetchall()
    conn.close()

    return {"pending_requests": [dict(r) for r in rows]}


@leaves_router.get("/manager/leaves/history")
def get_team_leave_history(
    current_user: dict = Depends(require_roles({"MANAGER", "HR", "ADMIN"}))
):
    """
    Returns full history of team leave requests (Approved, Rejected, Pending).
    """
    user_role = current_user.get("role")
    manager_emp_id = current_user.get("employee_id")

    conn = get_db_connection()
    cursor = conn.cursor()

    if user_role in {"ADMIN", "HR"}:
        cursor.execute("""
            SELECT 
                lr.id,
                lr.employee_id,
                e.employee_code,
                e.full_name AS employee_name,
                d.name AS department_name,
                lt.name AS leave_type_name,
                lr.start_date,
                lr.end_date,
                lr.requested_days,
                lr.reason,
                lr.status,
                lr.created_at,
                CASE
                    WHEN approver_user.id IS NULL THEN NULL
                    WHEN a.comment = 'Approved by manager.' THEN
                        'Approved by ' || CASE approver_user.role
                            WHEN 'HR' THEN 'HR'
                            WHEN 'ADMIN' THEN 'Admin'
                            ELSE 'Manager'
                        END || '.'
                    WHEN a.comment = 'Rejected by manager.' THEN
                        'Rejected by ' || CASE approver_user.role
                            WHEN 'HR' THEN 'HR'
                            WHEN 'ADMIN' THEN 'Admin'
                            ELSE 'Manager'
                        END || '.'
                    ELSE a.comment
                END AS approver_comment,
                CASE WHEN approver_user.id IS NULL THEN NULL ELSE a.decision_time END AS decision_time,
                CASE WHEN approver_user.id IS NULL THEN NULL ELSE m.full_name END AS approver_name
            FROM leave_requests lr
            JOIN employees e ON lr.employee_id = e.id
            JOIN users u ON u.id = e.user_id AND u.is_active = 1
            LEFT JOIN departments d ON e.department_id = d.id
                AND d.workspace_id = u.workspace_id
            JOIN leave_types lt ON lr.leave_type_id = lt.id
                AND lt.workspace_id = u.workspace_id
            LEFT JOIN approvals a ON lr.id = a.leave_request_id
            LEFT JOIN employees m ON a.approver_id = m.id
            LEFT JOIN users approver_user ON approver_user.id = m.user_id
                AND approver_user.workspace_id = u.workspace_id
            WHERE u.workspace_id = ?
            ORDER BY lr.created_at DESC
            LIMIT 100
        """, (current_user["workspace_id"],))
    else:
        cursor.execute("""
            SELECT 
                lr.id,
                lr.employee_id,
                e.employee_code,
                e.full_name AS employee_name,
                d.name AS department_name,
                lt.name AS leave_type_name,
                lr.start_date,
                lr.end_date,
                lr.requested_days,
                lr.reason,
                lr.status,
                lr.created_at,
                CASE
                    WHEN approver_user.id IS NULL THEN NULL
                    WHEN a.comment = 'Approved by manager.' THEN
                        'Approved by ' || CASE approver_user.role
                            WHEN 'HR' THEN 'HR'
                            WHEN 'ADMIN' THEN 'Admin'
                            ELSE 'Manager'
                        END || '.'
                    WHEN a.comment = 'Rejected by manager.' THEN
                        'Rejected by ' || CASE approver_user.role
                            WHEN 'HR' THEN 'HR'
                            WHEN 'ADMIN' THEN 'Admin'
                            ELSE 'Manager'
                        END || '.'
                    ELSE a.comment
                END AS approver_comment,
                CASE WHEN approver_user.id IS NULL THEN NULL ELSE a.decision_time END AS decision_time,
                CASE WHEN approver_user.id IS NULL THEN NULL ELSE m.full_name END AS approver_name
            FROM leave_requests lr
            JOIN employees e ON lr.employee_id = e.id
            JOIN users u ON u.id = e.user_id AND u.is_active = 1
            LEFT JOIN departments d ON e.department_id = d.id
                AND d.workspace_id = u.workspace_id
            JOIN leave_types lt ON lr.leave_type_id = lt.id
                AND lt.workspace_id = u.workspace_id
            LEFT JOIN approvals a ON lr.id = a.leave_request_id
            LEFT JOIN employees m ON a.approver_id = m.id
            LEFT JOIN users approver_user ON approver_user.id = m.user_id
                AND approver_user.workspace_id = u.workspace_id
            WHERE e.manager_id = ? AND u.workspace_id = ?
            ORDER BY lr.created_at DESC
            LIMIT 100
        """, (manager_emp_id, current_user["workspace_id"]))

    rows = cursor.fetchall()
    conn.close()

    return {"requests": [dict(r) for r in rows]}


@leaves_router.put("/manager/leaves/{request_id}/approve")
def approve_leave_request(
    request_id: int,
    decision: ApprovalDecisionRequest,
    current_user: dict = Depends(require_roles({"MANAGER", "HR", "ADMIN"}))
):
    """
    Approves a pending leave request in a single atomic database transaction:
    1. Verifies request exists and status is PENDING.
    2. Verifies manager is authorized to approve (subordinate or admin).
    3. Updates leave_requests status to APPROVED.
    4. Deducts balance by incrementing leave_balances.used_days.
    5. Inserts record into approvals table.
    6. Inserts record into audit_logs table.
    7. Commits or rolls back if any error occurs.
    """
    manager_emp_id = current_user.get("employee_id")
    user_role = current_user.get("role")

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # Fetch request details with employee info
        cursor.execute("""
            SELECT 
                lr.id,
                lr.employee_id,
                lr.leave_type_id,
                lr.requested_days,
                lr.status,
                e.manager_id,
                e.full_name AS employee_name
            FROM leave_requests lr
            JOIN employees e ON lr.employee_id = e.id
            JOIN users u ON u.id = e.user_id
            WHERE lr.id = ? AND u.workspace_id = ?
        """, (request_id, current_user["workspace_id"]))

        req = cursor.fetchone()

        if not req:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Leave request #{request_id} not found."
            )

        # Check authorization
        if user_role not in {"ADMIN", "HR"} and req["manager_id"] != manager_emp_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to approve leave requests for this employee."
            )

        # Check pending status
        if req["status"] != "PENDING":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot approve request with status '{req['status']}'. It has already been processed."
            )

        # 1. Update request status to APPROVED
        cursor.execute("""
            UPDATE leave_requests
            SET status = 'APPROVED', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (request_id,))

        # 2. Update leave balance: increase used_days
        cursor.execute("""
            UPDATE leave_balances
            SET used_days = used_days + ?
            WHERE employee_id = ? AND leave_type_id = ?
        """, (req["requested_days"], req["employee_id"], req["leave_type_id"]))

        # 3. Insert into approvals table
        approver_role = user_role.title() if user_role != "HR" else "HR"
        comment_text = (
            decision.comment.strip()
            if decision.comment and decision.comment.strip()
            else f"Approved by {approver_role}."
        )
        cursor.execute("""
            INSERT INTO approvals (
                leave_request_id, approver_id, approval_stage, decision, comment, decision_time
            )
            VALUES (?, ?, 1, 'APPROVED', ?, CURRENT_TIMESTAMP)
        """, (request_id, manager_emp_id, comment_text))

        # 4. Insert audit log
        create_audit_log(
            conn,
            current_user["user_id"],
            "LEAVE_APPROVE",
            f"leave_requests:{request_id}",
            f"Approved {req['requested_days']} days for {req['employee_name']}. Comment: {comment_text}"
        )

        # Commit transaction atomically
        conn.commit()

        return {
            "message": f"Leave request #{request_id} approved successfully.",
            "status": "APPROVED",
            "deducted_days": req["requested_days"]
        }

    except HTTPException:
        conn.rollback()
        raise
    except Exception as exc:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process approval: {str(exc)}"
        )
    finally:
        conn.close()


@leaves_router.put("/manager/leaves/{request_id}/reject")
def reject_leave_request(
    request_id: int,
    decision: ApprovalDecisionRequest,
    current_user: dict = Depends(require_roles({"MANAGER", "HR", "ADMIN"}))
):
    """
    Rejects a pending leave request:
    1. Verifies request is PENDING.
    2. Updates status to REJECTED.
    3. Records rejection decision and comment in approvals table.
    4. Leaves employee balance unchanged.
    5. Records audit log.
    """
    manager_emp_id = current_user.get("employee_id")
    user_role = current_user.get("role")

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT 
                lr.id,
                lr.employee_id,
                lr.requested_days,
                lr.status,
                e.manager_id,
                e.full_name AS employee_name
            FROM leave_requests lr
            JOIN employees e ON lr.employee_id = e.id
            JOIN users u ON u.id = e.user_id
            WHERE lr.id = ? AND u.workspace_id = ?
        """, (request_id, current_user["workspace_id"]))

        req = cursor.fetchone()

        if not req:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Leave request #{request_id} not found."
            )

        if user_role not in {"ADMIN", "HR"} and req["manager_id"] != manager_emp_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to reject leave requests for this employee."
            )

        if req["status"] != "PENDING":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot reject request with status '{req['status']}'. It has already been processed."
            )

        # 1. Update request status to REJECTED
        cursor.execute("""
            UPDATE leave_requests
            SET status = 'REJECTED', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (request_id,))

        # 2. Insert into approvals table (Balance is NOT reduced)
        approver_role = user_role.title() if user_role != "HR" else "HR"
        comment_text = (
            decision.comment.strip()
            if decision.comment and decision.comment.strip()
            else f"Rejected by {approver_role}."
        )
        cursor.execute("""
            INSERT INTO approvals (
                leave_request_id, approver_id, approval_stage, decision, comment, decision_time
            )
            VALUES (?, ?, 1, 'REJECTED', ?, CURRENT_TIMESTAMP)
        """, (request_id, manager_emp_id, comment_text))

        # 3. Insert audit log
        create_audit_log(
            conn,
            current_user["user_id"],
            "LEAVE_REJECT",
            f"leave_requests:{request_id}",
            f"Rejected leave request for {req['employee_name']}. Comment: {comment_text}"
        )

        conn.commit()

        return {
            "message": f"Leave request #{request_id} rejected.",
            "status": "REJECTED"
        }

    except HTTPException:
        conn.rollback()
        raise
    except Exception as exc:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process rejection: {str(exc)}"
        )
    finally:
        conn.close()
