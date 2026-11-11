"""
LeaveFlow - Admin & HR Management Module
Endpoints for viewing and managing employees, departments, leave types,
leave balances, company-wide attendance, and audit logs.
Protected by require_roles({"ADMIN"}).
"""

import sqlite3
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from auth import EMAIL_REGEX, get_current_user, hash_password, require_roles
from database import create_audit_log, create_workspace, get_db_connection

admin_router = APIRouter(tags=["Admin & HR Management"])

# ---------------------------------------------------------
# Request Models
# ---------------------------------------------------------

class CreateEmployeeRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: str = Field(..., description="Corporate email address")
    role: str = Field("EMPLOYEE", description="ADMIN, HR, MANAGER, or EMPLOYEE; elevated roles are Admin-only")
    department_id: Optional[int] = None
    manager_id: Optional[int] = None
    designation: str = Field(..., min_length=2, max_length=100)
    joining_date: str = Field(..., description="YYYY-MM-DD")
    password: str = Field(..., min_length=8, max_length=72)


class CreateDepartmentRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    description: Optional[str] = Field(None, max_length=250)


class CreateLeaveTypeRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    description: Optional[str] = Field(None, max_length=250)
    yearly_allowance: int = Field(..., ge=1, le=100)


class UpdateUserStatusRequest(BaseModel):
    is_active: bool


class UpdateEmployeeManagerRequest(BaseModel):
    manager_id: Optional[int] = None


# ---------------------------------------------------------
# Admin Routes
# ---------------------------------------------------------

@admin_router.get("/employees")
def list_employees(current_user: dict = Depends(require_roles({"ADMIN", "HR", "MANAGER"}))):
    """
    Returns directory of all employees, including their department,
    manager name, role, and corporate email.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    manager_filter = "WHERE u.is_active = 1 AND u.workspace_id = ?"
    parameters = (current_user["workspace_id"],)
    if current_user["role"] == "MANAGER":
        manager_filter += " AND (e.manager_id = ? OR e.id = ?)"
        parameters = (
            current_user["workspace_id"],
            current_user["employee_id"],
            current_user["employee_id"],
        )

    cursor.execute(f"""
        SELECT 
            e.id,
            u.id AS user_id,
            e.employee_code,
            e.full_name,
            u.email,
            u.role,
            u.is_active,
            e.designation,
            e.joining_date,
            e.department_id,
            d.name AS department_name,
            e.manager_id,
            CASE WHEN mu.id IS NULL THEN NULL ELSE m.full_name END AS manager_name
        FROM employees e
        JOIN users u ON e.user_id = u.id
        LEFT JOIN departments d ON e.department_id = d.id
            AND d.workspace_id = u.workspace_id
        LEFT JOIN employees m ON e.manager_id = m.id
        LEFT JOIN users mu ON mu.id = m.user_id AND mu.workspace_id = u.workspace_id
        {manager_filter}
        ORDER BY e.employee_code ASC
    """, parameters)

    rows = cursor.fetchall()
    conn.close()

    return {"employees": [dict(r) for r in rows]}


@admin_router.get("/admin/users")
def list_users(current_user: dict = Depends(require_roles({"ADMIN"}))):
    """Returns all user accounts for Admin management without credential fields."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT
                u.id AS user_id,
                u.email,
                u.role,
                u.is_active,
                e.id,
                e.employee_code,
                e.full_name,
                e.designation,
                e.joining_date,
                e.department_id,
                d.name AS department_name,
                e.manager_id,
                CASE WHEN mu.id IS NULL THEN NULL ELSE m.full_name END AS manager_name
            FROM users u
            LEFT JOIN employees e ON e.user_id = u.id
            LEFT JOIN departments d ON d.id = e.department_id
                AND d.workspace_id = u.workspace_id
            LEFT JOIN employees m ON m.id = e.manager_id
            LEFT JOIN users mu ON mu.id = m.user_id AND mu.workspace_id = u.workspace_id
            WHERE u.workspace_id = ?
            ORDER BY u.role, u.email
        """, (current_user["workspace_id"],))
        return {"users": [dict(row) for row in cursor.fetchall()]}
    finally:
        cursor.close()
        conn.close()


@admin_router.post("/employees")
def create_employee(
    payload: CreateEmployeeRequest,
    current_user: dict = Depends(require_roles({"ADMIN", "HR", "MANAGER"}))
):
    """
    Creates a new employee and connected user account,
    then initializes leave balances for all active leave types.
    """
    email_clean = payload.email.strip().lower()
    full_name = payload.full_name.strip()
    designation = payload.designation.strip()
    if len(full_name) < 2 or len(designation) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Full name and designation must each contain at least two characters.",
        )

    if not EMAIL_REGEX.fullmatch(email_clean):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide a valid email address format.",
        )

    role_upper = payload.role.strip().upper()
    allowed_roles = (
        {"ADMIN", "HR", "MANAGER", "EMPLOYEE"}
        if current_user["role"] == "ADMIN"
        else {"EMPLOYEE"}
    )
    if role_upper not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{current_user['role']} accounts may only create: {', '.join(sorted(allowed_roles))}."
        )
    if role_upper == "MANAGER" and payload.department_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Select a department when creating a Manager account.",
        )

    try:
        date.fromisoformat(payload.joining_date.strip())
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Joining date must use YYYY-MM-DD format.",
        ) from exc

    department_id = payload.department_id
    manager_id = payload.manager_id
    if current_user["role"] == "MANAGER":
        manager_id = current_user["employee_id"]
        manager_department_id = current_user["department_id"]
        if department_id is not None and department_id != manager_department_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Managers may create employees only in their own department.",
            )
        department_id = manager_department_id
    workspace_id = current_user["workspace_id"]
    if current_user["role"] == "ADMIN" and role_upper == "ADMIN":
        workspace_id = None
        department_id = None
        manager_id = None

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        conn.execute("BEGIN IMMEDIATE")

        # Check email uniqueness
        cursor.execute("SELECT id FROM users WHERE LOWER(email) = ?", (email_clean,))
        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"User with email '{email_clean}' already exists."
            )

        cursor.execute("""
            SELECT COALESCE(MAX(CAST(SUBSTR(employee_code, 5) AS INTEGER)), 0) + 1
            FROM employees
            WHERE employee_code GLOB 'EMP-[0-9]*'
              AND SUBSTR(employee_code, 5) NOT GLOB '*[^0-9]*'
        """)
        next_employee_number = cursor.fetchone()[0]
        if next_employee_number > 99999:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="No employee codes remain in the supported EMP-000 to EMP-99999 range.",
            )
        employee_code = f"EMP-{next_employee_number:03d}"

        if department_id is not None:
            cursor.execute(
                "SELECT 1 FROM departments WHERE id = ? AND workspace_id = ?",
                (department_id, current_user["workspace_id"]),
            )
            if not cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The selected department does not exist.",
                )

        if (
            role_upper == "EMPLOYEE"
            and current_user["role"] in {"ADMIN", "HR"}
            and manager_id is None
            and department_id is not None
        ):
            cursor.execute("""
                SELECT e.id
                FROM employees e
                JOIN users u ON u.id = e.user_id
                WHERE e.department_id = ?
                    AND u.role = 'MANAGER'
                    AND u.is_active = 1
                    AND u.workspace_id = ?
            """, (department_id, current_user["workspace_id"]))
            department_managers = cursor.fetchall()
            if len(department_managers) == 1:
                manager_id = department_managers[0]["id"]
            elif len(department_managers) > 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Select a reporting Manager because this department has multiple active Managers.",
                )

        if manager_id is not None:
            cursor.execute("""
                SELECT 1 FROM employees e
                JOIN users u ON u.id = e.user_id
                WHERE e.id = ? AND u.is_active = 1
                  AND u.role = 'MANAGER' AND u.workspace_id = ?
            """, (manager_id, current_user["workspace_id"]))
            if not cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The selected reporting manager is invalid, inactive, or is not a Manager.",
                )
            cursor.execute("""
                SELECT e.department_id
                FROM employees e
                JOIN users u ON u.id = e.user_id
                WHERE e.id = ? AND u.workspace_id = ?
            """, (manager_id, current_user["workspace_id"]))
            manager_department_id = cursor.fetchone()["department_id"]
            if manager_department_id != department_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The employee and reporting manager must belong to the same department.",
                )

        if role_upper == "ADMIN" and current_user["role"] == "ADMIN":
            workspace_id = create_workspace(conn, f"Workspace for {full_name}")

        # 1. Create user account
        hashed_pwd = hash_password(payload.password)
        cursor.execute("""
                INSERT INTO users (email, password_hash, role, is_active, workspace_id)
                VALUES (?, ?, ?, 1, ?)
        """, (email_clean, hashed_pwd, role_upper, workspace_id))
        new_user_id = cursor.lastrowid

        # 2. Create employee record
        cursor.execute("""
            INSERT INTO employees (
                employee_code, user_id, full_name, department_id, manager_id, designation, joining_date
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            employee_code,
            new_user_id,
            full_name,
            department_id,
            manager_id,
            designation,
            payload.joining_date.strip()
        ))
        new_emp_id = cursor.lastrowid

        # 3. Seed leave balances for this new employee for all active leave types
        cursor.execute("""
            SELECT id, yearly_allowance
            FROM leave_types
            WHERE is_active = 1 AND workspace_id = ?
        """, (workspace_id,))
        leave_types = cursor.fetchall()
        for lt in leave_types:
            cursor.execute("""
                INSERT INTO leave_balances (employee_id, leave_type_id, allocated_days, used_days)
                VALUES (?, ?, ?, 0)
            """, (new_emp_id, lt["id"], lt["yearly_allowance"]))

        # 4. Log audit record
        create_audit_log(
            conn,
            current_user["user_id"],
            "ACCOUNT_CREATE",
            f"employees:{new_emp_id}",
            f"Created account {employee_code} ({full_name}) with role {role_upper}"
        )

        conn.commit()

        return {
            "message": f"{role_upper.title()} account {full_name} ({employee_code}) created successfully.",
            "employee_code": employee_code,
            "employee_id": new_emp_id,
            "user_id": new_user_id
        }

    except HTTPException:
        conn.rollback()
        raise
    except sqlite3.IntegrityError as exc:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The email address or employee code is already in use.",
        ) from exc
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


@admin_router.patch("/employees/{employee_id}/manager")
def update_employee_manager(
    employee_id: int,
    request: UpdateEmployeeManagerRequest,
    current_user: dict = Depends(require_roles({"ADMIN", "HR"})),
):
    """Assigns or clears an employee's reporting Manager."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        conn.execute("BEGIN IMMEDIATE")
        cursor.execute("""
            SELECT e.id, e.full_name, e.department_id
            FROM employees e
            JOIN users u ON u.id = e.user_id
            WHERE e.id = ? AND u.workspace_id = ?
        """, (employee_id, current_user["workspace_id"]))
        employee = cursor.fetchone()
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee record not found.",
            )

        manager = None
        if request.manager_id is not None:
            if request.manager_id == employee_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="An employee cannot report to themselves.",
                )
            cursor.execute("""
                SELECT e.id, e.department_id
                FROM employees e
                JOIN users u ON u.id = e.user_id
                WHERE e.id = ? AND u.role = 'MANAGER' AND u.is_active = 1
                  AND u.workspace_id = ?
            """, (request.manager_id, current_user["workspace_id"]))
            manager = cursor.fetchone()
            if not manager:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Select an active Manager account.",
                )
            if manager["department_id"] is None and employee["department_id"] is not None:
                cursor.execute(
                    "UPDATE employees SET department_id = ? WHERE id = ?",
                    (employee["department_id"], request.manager_id),
                )
            elif manager["department_id"] != employee["department_id"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The employee and Manager must belong to the same department.",
                )

        cursor.execute(
            "UPDATE employees SET manager_id = ? WHERE id = ?",
            (request.manager_id, employee_id),
        )
        create_audit_log(
            conn,
            current_user["user_id"],
            "EMPLOYEE_MANAGER_ASSIGNMENT",
            f"employees:{employee_id}",
            (
                f"Assigned {employee['full_name']} to Manager employee record "
                f"{request.manager_id}."
                if request.manager_id is not None
                else f"Cleared Manager assignment for {employee['full_name']}."
            ),
        )
        conn.commit()
        return {"message": "Employee reporting Manager updated successfully."}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


@admin_router.patch("/admin/users/{user_id}/status")
def update_user_status(
    user_id: int,
    request: UpdateUserStatusRequest,
    current_user: dict = Depends(require_roles({"ADMIN"})),
):
    """Activates or deactivates an account; Admin cannot deactivate their own login."""
    is_active = request.is_active
    if user_id == current_user["user_id"] and not is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own account.",
        )

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        conn.execute("BEGIN IMMEDIATE")
        cursor.execute(
            "SELECT id, email, role, is_active FROM users WHERE id = ? AND workspace_id = ?",
            (user_id, current_user["workspace_id"]),
        )
        account = cursor.fetchone()
        if not account:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User account not found.",
            )
        if not is_active and account["role"] == "ADMIN" and account["is_active"]:
            cursor.execute(
                "SELECT COUNT(*) AS count FROM users WHERE role = 'ADMIN' AND is_active = 1 AND workspace_id = ?",
                (current_user["workspace_id"],)
            )
            if cursor.fetchone()["count"] <= 1:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="The last active Admin account cannot be deactivated.",
                )

        cursor.execute(
            "UPDATE users SET is_active = ? WHERE id = ? AND workspace_id = ?",
            (int(is_active), user_id, current_user["workspace_id"]),
        )
        if bool(account["is_active"]) != is_active:
            create_audit_log(
                conn,
                current_user["user_id"],
                "ACCOUNT_ACTIVATE" if is_active else "ACCOUNT_DEACTIVATE",
                f"users:{user_id}",
                f"{'Activated' if is_active else 'Deactivated'} {account['role']} account {account['email']}.",
            )
        conn.commit()
        return {
            "message": f"Account {'activated' if is_active else 'deactivated'} successfully.",
            "user_id": user_id,
            "is_active": is_active,
        }
    except HTTPException:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


@admin_router.get("/departments")
def list_departments(current_user: dict = Depends(get_current_user)):
    """
    Lists all departments with count of assigned employees.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT 
            d.id,
            d.name,
            d.description,
            COUNT(u.id) AS employee_count
        FROM departments d
        LEFT JOIN employees e ON d.id = e.department_id
        LEFT JOIN users u ON u.id = e.user_id AND u.is_active = 1
          AND u.workspace_id = d.workspace_id
        WHERE d.workspace_id = ?
        GROUP BY d.id
        ORDER BY d.name ASC
    """, (current_user["workspace_id"],))

    rows = cursor.fetchall()
    conn.close()

    return {"departments": [dict(r) for r in rows]}


@admin_router.post("/departments")
def create_department(
    payload: CreateDepartmentRequest,
    current_user: dict = Depends(require_roles({"ADMIN", "HR"}))
):
    """
    Creates a new department.
    """
    name_clean = payload.name.strip()

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute(
            "SELECT id FROM departments WHERE LOWER(name) = ? AND workspace_id = ?",
            (name_clean.lower(), current_user["workspace_id"]),
        )
        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Department '{name_clean}' already exists."
            )

        cursor.execute("""
            INSERT INTO departments (name, description, workspace_id)
            VALUES (?, ?, ?)
        """, (
            name_clean,
            payload.description.strip() if payload.description else None,
            current_user["workspace_id"],
        ))

        dept_id = cursor.lastrowid

        create_audit_log(
            conn,
            current_user["user_id"],
            "DEPARTMENT_CREATE",
            f"departments:{dept_id}",
            f"Created department '{name_clean}'"
        )

        conn.commit()
        return {"message": f"Department '{name_clean}' created successfully.", "id": dept_id}
    finally:
        conn.close()


@admin_router.get("/leave-types")
def list_leave_types(current_user: dict = Depends(get_current_user)):
    """
    Returns all leave types (both active and inactive).
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id, name, description, yearly_allowance, is_active
        FROM leave_types
        WHERE workspace_id = ?
        ORDER BY name ASC
    """, (current_user["workspace_id"],))

    rows = cursor.fetchall()
    conn.close()

    return {"leave_types": [dict(r) for r in rows]}


@admin_router.post("/leave-types")
def create_leave_type(
    payload: CreateLeaveTypeRequest,
    current_user: dict = Depends(require_roles({"ADMIN", "HR"}))
):
    """
    Creates a new leave category and automatically creates balance records
    for all existing employees.
    """
    name_clean = payload.name.strip()

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute(
            "SELECT id FROM leave_types WHERE LOWER(name) = ? AND workspace_id = ?",
            (name_clean.lower(), current_user["workspace_id"]),
        )
        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Leave type '{name_clean}' already exists."
            )

        cursor.execute("""
            INSERT INTO leave_types (name, description, yearly_allowance, is_active, workspace_id)
            VALUES (?, ?, ?, 1, ?)
        """, (
            name_clean,
            payload.description.strip() if payload.description else None,
            payload.yearly_allowance,
            current_user["workspace_id"],
        ))

        lt_id = cursor.lastrowid

        # Allocate this new leave type to all active employees
        cursor.execute("""
            SELECT e.id
            FROM employees e
            JOIN users u ON u.id = e.user_id
            WHERE u.is_active = 1 AND u.workspace_id = ?
        """, (current_user["workspace_id"],))
        all_emps = cursor.fetchall()
        for emp in all_emps:
            cursor.execute("""
                INSERT OR IGNORE INTO leave_balances (employee_id, leave_type_id, allocated_days, used_days)
                VALUES (?, ?, ?, 0)
            """, (emp["id"], lt_id, payload.yearly_allowance))

        create_audit_log(
            conn,
            current_user["user_id"],
            "LEAVE_TYPE_CREATE",
            f"leave_types:{lt_id}",
            f"Created leave type '{name_clean}' with {payload.yearly_allowance} days allowance"
        )

        conn.commit()
        return {"message": f"Leave type '{name_clean}' created successfully.", "id": lt_id}
    finally:
        conn.close()


@admin_router.get("/leaves/balances")
def list_all_leave_balances(current_user: dict = Depends(require_roles({"ADMIN", "HR"}))):
    """
    Company-wide leave balances matrix for HR overview.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT 
            lb.id,
            e.id AS employee_id,
            e.employee_code,
            e.full_name AS employee_name,
            d.name AS department_name,
            lt.id AS leave_type_id,
            lt.name AS leave_type_name,
            lb.allocated_days,
            lb.used_days,
            (lb.allocated_days - lb.used_days) AS remaining_days
        FROM leave_balances lb
        JOIN employees e ON lb.employee_id = e.id
        JOIN users u ON u.id = e.user_id AND u.is_active = 1
        LEFT JOIN departments d ON e.department_id = d.id
            AND d.workspace_id = u.workspace_id
        JOIN leave_types lt ON lb.leave_type_id = lt.id
            AND lt.workspace_id = u.workspace_id
        WHERE u.workspace_id = ?
        ORDER BY e.employee_code ASC, lt.name ASC
    """, (current_user["workspace_id"],))

    rows = cursor.fetchall()
    conn.close()

    return {"balances": [dict(r) for r in rows]}


@admin_router.get("/admin/audit-logs")
def list_audit_logs(
    limit: int = 100,
    current_user: dict = Depends(require_roles({"ADMIN"}))
):
    """
    Returns security and system audit logs with user email, action, and timestamps.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT 
            a.id,
            a.user_id,
            audit_user.email AS user_email,
            audit_user.role AS user_role,
            a.action,
            a.affected_record,
            a.details,
            a.timestamp
        FROM audit_logs a
        LEFT JOIN users audit_user ON a.user_id = audit_user.id
            AND audit_user.workspace_id = a.workspace_id
        WHERE a.workspace_id = ?
        ORDER BY a.timestamp DESC
        LIMIT ?
    """, (current_user["workspace_id"], limit))

    rows = cursor.fetchall()
    conn.close()

    return {"audit_logs": [dict(r) for r in rows]}
