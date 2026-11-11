"""
LeaveFlow - Authentication & Authorization Module
Handles password hashing with bcrypt, JWT token generation with PyJWT,
role-based authorization, and user profile management.
"""

import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Set

import bcrypt
import jwt
from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from config import load_environment
from database import create_audit_log, create_workspace, get_db_connection

load_environment()

# Authentication router
auth_router = APIRouter(prefix="/auth", tags=["Authentication"])

SECRET_KEY = os.getenv("LEAVEFLOW_SECRET_KEY")
BOOTSTRAP_KEY = os.getenv("LEAVEFLOW_BOOTSTRAP_KEY")
if not SECRET_KEY or len(SECRET_KEY) < 32:
    raise RuntimeError("Set LEAVEFLOW_SECRET_KEY to a random value of at least 32 characters in backend/.env.")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24
bearer_scheme = HTTPBearer(auto_error=False)

# Regular expression for email format validation (Pedagogical Python re example)
EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")


# ---------------------------------------------------------
# Password Hashing Functions (using bcrypt)
# ---------------------------------------------------------

def hash_password(plain_password: str) -> str:
    """
    Hashes a plaintext password using bcrypt with a generated salt.
    """
    # bcrypt requires bytes
    password_bytes = plain_password.encode("utf-8")
    salt = bcrypt.gensalt()
    hashed_bytes = bcrypt.hashpw(password_bytes, salt)
    return hashed_bytes.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifies a plaintext password against the stored bcrypt hash.
    """
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8")
        )
    except Exception:
        return False


# ---------------------------------------------------------
# JWT Token Functions
# ---------------------------------------------------------

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Encodes payload data into a signed JSON Web Token (JWT).
    """
    payload = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)

    payload.update({"exp": expire})
    encoded_jwt = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> dict:
    """
    Decodes and validates a JWT token using our secret key.
    Raises HTTPException if expired or invalid.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token has expired. Please log in again."
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token."
        )


# ---------------------------------------------------------
# Authentication & Role Dependencies
# ---------------------------------------------------------

def get_current_user(
    authorization: Optional[str] = Header(None),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> dict:
    """
    Extracts the Bearer token from the Authorization header,
    validates the JWT, and loads the user and employee profile from SQLite.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header. Expected 'Bearer <token>'."
        )

    token = credentials.credentials if credentials else authorization.split(" ")[1]
    payload = decode_access_token(token)
    user_id = payload.get("sub")

    if not isinstance(user_id, str) or not user_id.isdigit():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload has an invalid user subject."
        )
    user_id = int(user_id)

    conn = get_db_connection()
    cursor = conn.cursor()

    # Join users with employees and departments to provide complete profile
    cursor.execute("""
        SELECT 
            u.id AS user_id,
            u.email,
            u.role,
            u.is_active,
            u.workspace_id,
            e.id AS employee_id,
            e.employee_code,
            e.full_name,
            e.department_id,
            d.name AS department_name,
            e.manager_id,
            CASE WHEN mu.id IS NULL THEN NULL ELSE m.full_name END AS manager_name,
            e.designation,
            e.joining_date
        FROM users u
        LEFT JOIN employees e ON u.id = e.user_id
        LEFT JOIN departments d ON e.department_id = d.id
            AND d.workspace_id = u.workspace_id
        LEFT JOIN employees m ON e.manager_id = m.id
        LEFT JOIN users mu ON mu.id = m.user_id AND mu.workspace_id = u.workspace_id
        WHERE u.id = ?
    """, (user_id,))

    user_row = cursor.fetchone()
    conn.close()

    if not user_row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account associated with this token no longer exists."
        )

    if not user_row["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This user account has been deactivated."
        )

    return dict(user_row)


def require_roles(allowed_roles: Set[str]):
    """
    Dependency factory returning a validator that ensures the current user's role
    is contained in the allowed set of roles. Demonstrates Python Set membership.
    """
    def role_checker(current_user: dict = Depends(get_current_user)) -> dict:
        user_role = current_user.get("role")
        # Check membership using set lookup O(1)
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Requires one of roles: {', '.join(sorted(allowed_roles))}."
            )
        return current_user

    return role_checker


# ---------------------------------------------------------
# Request Models
# ---------------------------------------------------------

class LoginRequest(BaseModel):
    email: str = Field(..., description="User email address")
    password: str = Field(..., description="Plaintext password")


class BootstrapAdminRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: str = Field(..., description="Administrator email address")
    password: str = Field(..., min_length=8, max_length=72)
    setup_key: Optional[str] = Field(None, description="Optional server-configured first-admin setup key")


class AdminRegistrationRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: str = Field(..., description="Administrator email address")
    password: str = Field(..., min_length=8, max_length=72)


class UpdateProfileRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=72)


# ---------------------------------------------------------
# Routes
# ---------------------------------------------------------

@auth_router.get("/bootstrap-status")
def get_bootstrap_status():
    """Indicates whether the first administrator still needs to be created."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT setting_value FROM system_settings
        WHERE setting_key = 'admin_bootstrap_completed'
    """)
    bootstrap_completed = cursor.fetchone()
    cursor.execute("""
        SELECT 1 FROM users
        WHERE role = 'ADMIN'
        LIMIT 1
    """)
    existing_admin = cursor.fetchone()
    setup_required = not bootstrap_completed and existing_admin is None
    cursor.close()
    conn.close()
    return {
        "setup_required": setup_required,
        "setup_key_required": bool(BOOTSTRAP_KEY),
    }


@auth_router.post("/bootstrap", status_code=status.HTTP_201_CREATED)
def bootstrap_admin(request: BootstrapAdminRequest):
    """Creates the first administrator exactly once, without public role selection."""
    if BOOTSTRAP_KEY and (
        not request.setup_key
        or not secrets.compare_digest(request.setup_key, BOOTSTRAP_KEY)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A valid initial setup key is required.",
        )

    email_clean = request.email.strip().lower()
    full_name = request.full_name.strip()
    if len(full_name) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Full name must contain at least two characters.",
        )
    if not EMAIL_REGEX.fullmatch(email_clean):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide a valid email address format.",
        )

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        conn.execute("BEGIN IMMEDIATE")
        cursor.execute("""
            SELECT setting_value FROM system_settings
            WHERE setting_key = 'admin_bootstrap_completed'
        """)
        bootstrap_completed = cursor.fetchone()
        cursor.execute("""
            SELECT 1 FROM users
            WHERE role = 'ADMIN'
            LIMIT 1
        """)
        existing_admin = cursor.fetchone()
        if bootstrap_completed or existing_admin:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The initial administrator has already been created.",
            )

        cursor.execute("SELECT 1 FROM users WHERE LOWER(email) = ?", (email_clean,))
        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists.",
            )

        workspace_id = create_workspace(conn, f"Workspace for {full_name}")
        cursor.execute("""
            INSERT INTO users (email, password_hash, role, is_active, workspace_id)
            VALUES (?, ?, 'ADMIN', 1, ?)
        """, (email_clean, hash_password(request.password), workspace_id))
        user_id = cursor.lastrowid
        cursor.execute("""
            SELECT COALESCE(MAX(CAST(SUBSTR(employee_code, 5) AS INTEGER)), 0) + 1
            FROM employees
            WHERE employee_code GLOB 'EMP-[0-9]*'
        """)
        employee_code = f"EMP-{cursor.fetchone()[0]:03d}"
        cursor.execute("""
            INSERT INTO employees (
                employee_code, user_id, full_name, department_id, designation, joining_date
            )
            VALUES (?, ?, ?, ?, 'Administrator', ?)
        """, (
            employee_code,
            user_id,
            full_name,
            None,
            datetime.now(timezone.utc).date().isoformat(),
        ))
        employee_id = cursor.lastrowid
        cursor.execute("""
            SELECT id, yearly_allowance
            FROM leave_types
            WHERE is_active = 1 AND workspace_id = ?
        """, (workspace_id,))
        for leave_type in cursor.fetchall():
            cursor.execute("""
                INSERT INTO leave_balances (employee_id, leave_type_id, allocated_days, used_days)
                VALUES (?, ?, ?, 0)
            """, (employee_id, leave_type["id"], leave_type["yearly_allowance"]))
        cursor.execute("""
            INSERT OR REPLACE INTO system_settings (setting_key, setting_value)
            VALUES ('admin_bootstrap_completed', 'true')
        """)
        create_audit_log(
            conn,
            user_id,
            "INITIAL_ADMIN_CREATE",
            f"users:{user_id}",
            f"Created initial administrator account for {email_clean} ({employee_code}).",
        )
        conn.commit()
        return {"message": "Administrator account created successfully. Please sign in."}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


@auth_router.post("/register-admin", status_code=status.HTTP_201_CREATED)
def register_admin(request: AdminRegistrationRequest):
    """Creates an administrator account through public registration."""
    email_clean = request.email.strip().lower()
    full_name = request.full_name.strip()
    if len(full_name) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Full name must contain at least two characters.",
        )
    if not EMAIL_REGEX.fullmatch(email_clean):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide a valid email address format.",
        )

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        conn.execute("BEGIN IMMEDIATE")
        cursor.execute("SELECT 1 FROM users WHERE LOWER(email) = ?", (email_clean,))
        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists.",
            )

        workspace_id = create_workspace(conn, f"Workspace for {full_name}")
        cursor.execute("""
            INSERT INTO users (email, password_hash, role, is_active, workspace_id)
            VALUES (?, ?, 'ADMIN', 1, ?)
        """, (email_clean, hash_password(request.password), workspace_id))
        user_id = cursor.lastrowid

        cursor.execute("""
            SELECT COALESCE(MAX(CAST(SUBSTR(employee_code, 5) AS INTEGER)), 0) + 1
            FROM employees
            WHERE employee_code GLOB 'EMP-[0-9]*'
        """)
        employee_code = f"EMP-{cursor.fetchone()[0]:03d}"
        cursor.execute("""
            INSERT INTO employees (
                employee_code, user_id, full_name, department_id, designation, joining_date
            )
            VALUES (?, ?, ?, NULL, 'Administrator', ?)
        """, (
            employee_code,
            user_id,
            full_name,
            datetime.now(timezone.utc).date().isoformat(),
        ))
        employee_id = cursor.lastrowid

        cursor.execute("""
            SELECT id, yearly_allowance
            FROM leave_types
            WHERE is_active = 1 AND workspace_id = ?
        """, (workspace_id,))
        for leave_type in cursor.fetchall():
            cursor.execute("""
                INSERT INTO leave_balances (employee_id, leave_type_id, allocated_days, used_days)
                VALUES (?, ?, ?, 0)
            """, (employee_id, leave_type["id"], leave_type["yearly_allowance"]))

        create_audit_log(
            conn,
            user_id,
            "PUBLIC_ADMIN_REGISTER",
            f"users:{user_id}",
            f"Created public administrator account {email_clean} ({employee_code}).",
        )
        conn.commit()
        return {"message": "Admin account created successfully. Please sign in."}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


@auth_router.post("/login")
def login(request: LoginRequest):
    """
    Authenticates a user by email and password.
    Returns a JWT access token and user profile on success.
    """
    email_clean = request.email.strip().lower()

    # Pedagogical regex validation example
    if not EMAIL_REGEX.match(email_clean):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide a valid email address format."
        )

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT 
            u.id AS user_id,
            u.email,
            u.password_hash,
            u.role,
            u.is_active,
            e.id AS employee_id,
            e.employee_code,
            e.full_name,
            e.department_id,
            d.name AS department_name,
            e.manager_id,
            e.designation
        FROM users u
        LEFT JOIN employees e ON u.id = e.user_id
        LEFT JOIN departments d ON e.department_id = d.id
            AND d.workspace_id = u.workspace_id
        WHERE LOWER(u.email) = ?
    """, (email_clean,))

    user_row = cursor.fetchone()

    if not user_row:
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

    if not user_row["is_active"]:
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is deactivated. Please contact HR."
        )

    # Verify password hash
    if not verify_password(request.password, user_row["password_hash"]):
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

    # Generate JWT token
    token_payload = {
        "sub": str(user_row["user_id"]),
        "email": user_row["email"],
        "role": user_row["role"]
    }
    access_token = create_access_token(token_payload)

    # Log successful login in audit_logs
    create_audit_log(
        conn,
        user_row["user_id"],
        "USER_LOGIN",
        f"users:{user_row['user_id']}",
        f"User logged in with role {user_row['role']}"
    )
    conn.commit()
    conn.close()

    user_profile = {
        "id": user_row["user_id"],
        "email": user_row["email"],
        "role": user_row["role"],
        "employee_id": user_row["employee_id"],
        "employee_code": user_row["employee_code"],
        "full_name": user_row["full_name"],
        "department_id": user_row["department_id"],
        "department_name": user_row["department_name"],
        "designation": user_row["designation"]
    }

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_profile
    }


@auth_router.get("/me")
def get_me(current_user: dict = Depends(get_current_user)):
    """
    Returns current authenticated user details and connected employee record.
    """
    user_profile = dict(current_user)
    user_profile["id"] = current_user["user_id"]
    return {"user": user_profile}


@auth_router.put("/me")
def update_profile(
    request: UpdateProfileRequest,
    current_user: dict = Depends(get_current_user),
):
    """Updates the authenticated user's own profile name."""
    full_name = request.full_name.strip()
    if len(full_name) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Full name must contain at least two characters.",
        )

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE employees SET full_name = ? WHERE user_id = ?",
            (full_name, current_user["user_id"]),
        )
        if cursor.rowcount != 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This account does not have an employee profile to update.",
            )
        create_audit_log(
            conn,
            current_user["user_id"],
            "PROFILE_UPDATE",
            f"users:{current_user['user_id']}",
            "Updated profile name.",
        )
        conn.commit()
        updated_user = dict(current_user)
        updated_user["id"] = current_user["user_id"]
        updated_user["full_name"] = full_name
        return {"user": updated_user}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


@auth_router.post("/change-password")
def change_password(
    request: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
):
    """Changes the authenticated user's password after verifying the current one."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT password_hash FROM users WHERE id = ?",
            (current_user["user_id"],),
        )
        account = cursor.fetchone()
        if not account or not verify_password(
            request.current_password, account["password_hash"]
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect.",
            )
        if request.current_password == request.new_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New password must be different from the current password.",
            )

        cursor.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(request.new_password), current_user["user_id"]),
        )
        create_audit_log(
            conn,
            current_user["user_id"],
            "PASSWORD_CHANGE",
            f"users:{current_user['user_id']}",
            "Changed account password.",
        )
        conn.commit()
        return {"message": "Password changed successfully."}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()
