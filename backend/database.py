"""
LeaveFlow - Database Configuration & Initialization
Uses Python's built-in sqlite3 library with foreign keys enabled.
"""

import os
import sqlite3

from config import load_environment

load_environment()

# Path to the SQLite database file
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
SQLITE_BUSY_TIMEOUT_MS = 30_000
DATABASE_PATH = os.getenv(
    "LEAVEFLOW_DATABASE_PATH",
    os.path.join(BACKEND_DIR, "employee_leave.db"),
)
if not os.path.isabs(DATABASE_PATH):
    DATABASE_PATH = os.path.join(BACKEND_DIR, DATABASE_PATH)


def get_db_connection():
    """
    Creates and returns a SQLite connection with foreign keys enabled
    and rows accessible like dictionaries (sqlite3.Row).
    """
    connection = sqlite3.connect(
        DATABASE_PATH,
        timeout=SQLITE_BUSY_TIMEOUT_MS / 1000,
    )
    connection.execute(f"PRAGMA busy_timeout = {SQLITE_BUSY_TIMEOUT_MS};")
    # Enable foreign key constraint enforcement in SQLite
    connection.execute("PRAGMA foreign_keys = ON;")
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    """
    Creates the nine core tables if they do not exist:
    1. users
    2. departments
    3. employees
    4. leave_types
    5. leave_balances
    6. attendance
    7. leave_requests
    8. approvals
    9. audit_logs
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    # WAL lets readers continue while a writer is active. SQLite still serializes
    # writers, so the busy timeout above gives brief concurrent writes time to finish.
    cursor.execute("PRAGMA journal_mode = WAL;")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS workspaces (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # SQLite cannot alter a CHECK constraint in place, so rebuild the users
    # table when upgrading databases created before HR accounts were added.
    cursor.execute("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    users_schema = cursor.fetchone()
    if users_schema and "'HR'" not in users_schema["sql"]:
        conn.execute("PRAGMA foreign_keys = OFF")
        try:
            conn.execute("BEGIN")
            conn.execute("""
                CREATE TABLE users_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL CHECK(role IN ('ADMIN', 'HR', 'MANAGER', 'EMPLOYEE')),
                    is_active INTEGER DEFAULT 1,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                INSERT INTO users_new (id, email, password_hash, role, is_active, created_at)
                SELECT id, email, password_hash, role, is_active, created_at FROM users
            """)
            conn.execute("DROP TABLE users")
            conn.execute("ALTER TABLE users_new RENAME TO users")
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.execute("PRAGMA foreign_keys = ON")

    # 1. users table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('ADMIN', 'HR', 'MANAGER', 'EMPLOYEE')),
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            workspace_id INTEGER REFERENCES workspaces(id)
        );
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS system_settings (
            setting_key TEXT PRIMARY KEY,
            setting_value TEXT NOT NULL
        );
    """)
    cursor.execute("""
        INSERT OR IGNORE INTO system_settings (setting_key, setting_value)
        SELECT 'admin_bootstrap_completed', 'true'
        WHERE EXISTS (
            SELECT 1 FROM users
            WHERE role = 'ADMIN'
        )
    """)

    # 2. departments table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS departments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            workspace_id INTEGER REFERENCES workspaces(id)
        );
    """)

    # 3. employees table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_code TEXT UNIQUE NOT NULL,
            user_id INTEGER UNIQUE NOT NULL,
            full_name TEXT NOT NULL,
            department_id INTEGER,
            manager_id INTEGER,
            designation TEXT,
            joining_date TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
            FOREIGN KEY (manager_id) REFERENCES employees(id) ON DELETE SET NULL
        );
    """)

    # 4. leave_types table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS leave_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            yearly_allowance INTEGER NOT NULL,
            is_active INTEGER DEFAULT 1,
            workspace_id INTEGER REFERENCES workspaces(id)
        );
    """)

    # 5. leave_balances table (one balance record per employee and leave type)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS leave_balances (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            leave_type_id INTEGER NOT NULL,
            allocated_days INTEGER NOT NULL,
            used_days INTEGER DEFAULT 0,
            FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
            FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE,
            UNIQUE(employee_id, leave_type_id)
        );
    """)

    # 6. attendance table (one attendance record per employee per date)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            attendance_date TEXT NOT NULL,
            check_in_time TEXT,
            check_out_time TEXT,
            FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
            UNIQUE(employee_id, attendance_date)
        );
    """)

    # 7. leave_requests table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS leave_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            leave_type_id INTEGER NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            requested_days INTEGER NOT NULL,
            reason TEXT NOT NULL,
            status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
            FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE
        );
    """)

    # 8. approvals table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS approvals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            leave_request_id INTEGER NOT NULL,
            approver_id INTEGER NOT NULL,
            approval_stage INTEGER DEFAULT 1,
            decision TEXT NOT NULL CHECK(decision IN ('APPROVED', 'REJECTED')),
            comment TEXT,
            decision_time TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (leave_request_id) REFERENCES leave_requests(id) ON DELETE CASCADE,
            FOREIGN KEY (approver_id) REFERENCES employees(id) ON DELETE CASCADE
        );
    """)

    # 9. audit_logs table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT NOT NULL,
            affected_record TEXT,
            details TEXT,
            timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
            workspace_id INTEGER REFERENCES workspaces(id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        );
    """)

    for table in ("users", "departments", "leave_types", "audit_logs"):
        cursor.execute(f"PRAGMA table_info({table})")
        columns = {row["name"] for row in cursor.fetchall()}
        if "workspace_id" not in columns:
            cursor.execute(
                f"ALTER TABLE {table} ADD COLUMN workspace_id INTEGER REFERENCES workspaces(id)"
            )

    for table, columns in (
        (
            "departments",
            "id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, "
            "description TEXT, workspace_id INTEGER REFERENCES workspaces(id)",
        ),
        (
            "leave_types",
            "id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, "
            "description TEXT, yearly_allowance INTEGER NOT NULL, "
            "is_active INTEGER DEFAULT 1, workspace_id INTEGER REFERENCES workspaces(id)",
        ),
    ):
        cursor.execute(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
            (table,),
        )
        table_sql = cursor.fetchone()["sql"]
        if "UNIQUE" in table_sql.upper() and "NAME" in table_sql.upper():
            conn.commit()
            conn.execute("PRAGMA foreign_keys = OFF")
            try:
                conn.execute("BEGIN")
                conn.execute(f"CREATE TABLE {table}_new ({columns})")
                if table == "departments":
                    conn.execute("""
                        INSERT INTO departments_new (id, name, description, workspace_id)
                        SELECT id, name, description, workspace_id FROM departments
                    """)
                else:
                    conn.execute("""
                        INSERT INTO leave_types_new (
                            id, name, description, yearly_allowance, is_active, workspace_id
                        )
                        SELECT id, name, description, yearly_allowance, is_active, workspace_id
                        FROM leave_types
                    """)
                conn.execute(f"DROP TABLE {table}")
                conn.execute(f"ALTER TABLE {table}_new RENAME TO {table}")
                conn.commit()
            except Exception:
                conn.rollback()
                raise
            finally:
                conn.execute("PRAGMA foreign_keys = ON")

    cursor.execute("""
        SELECT id FROM users
        WHERE role = 'ADMIN'
        ORDER BY id
    """)
    admin_rows = cursor.fetchall()
    for admin in admin_rows:
        cursor.execute("SELECT workspace_id FROM users WHERE id = ?", (admin["id"],))
        existing_workspace = cursor.fetchone()["workspace_id"]
        if existing_workspace is None:
            cursor.execute("""
                INSERT INTO workspaces (name)
                SELECT 'Workspace for ' || full_name
                FROM employees
                WHERE user_id = ?
            """, (admin["id"],))
            if cursor.rowcount == 0:
                cursor.execute(
                    "INSERT INTO workspaces (name) VALUES (?)",
                    (f"Workspace for Admin {admin['id']}",),
                )
            workspace_id = cursor.lastrowid
            cursor.execute(
                "UPDATE users SET workspace_id = ? WHERE id = ?",
                (workspace_id, admin["id"]),
            )

    cursor.execute("""
        SELECT id FROM workspaces
        ORDER BY id
        LIMIT 1
    """)
    default_workspace = cursor.fetchone()
    if default_workspace is None:
        cursor.execute("""
            SELECT EXISTS(SELECT 1 FROM users)
                OR EXISTS(SELECT 1 FROM departments)
                OR EXISTS(SELECT 1 FROM leave_types)
                OR EXISTS(SELECT 1 FROM audit_logs) AS has_legacy_data
        """)
        if cursor.fetchone()["has_legacy_data"]:
            cursor.execute("INSERT INTO workspaces (name) VALUES ('Legacy Workspace')")
            default_workspace_id = cursor.lastrowid
        else:
            default_workspace_id = None
    else:
        default_workspace_id = default_workspace["id"]

    for table in ("users", "departments", "leave_types", "audit_logs"):
        if default_workspace_id is None:
            break
        cursor.execute(
            f"UPDATE {table} SET workspace_id = ? WHERE workspace_id IS NULL",
            (default_workspace_id,),
        )

    cursor.execute("""
        SELECT DISTINCT a.workspace_id AS legacy_workspace_id,
            u.workspace_id AS admin_workspace_id, u.id AS admin_id
        FROM audit_logs a
        JOIN users u ON u.id = a.user_id
        WHERE a.action = 'ACCOUNT_CREATE'
            AND a.affected_record LIKE 'employees:%'
            AND u.role = 'ADMIN'
            AND u.is_active = 1
            AND a.workspace_id IS NOT NULL
            AND u.workspace_id IS NOT NULL
            AND a.workspace_id != u.workspace_id
    """)
    ownership_candidates = cursor.fetchall()
    if len(ownership_candidates) == 1:
        candidate = ownership_candidates[0]
        legacy_workspace_id = candidate["legacy_workspace_id"]
        admin_workspace_id = candidate["admin_workspace_id"]

        cursor.execute(
            "SELECT id FROM workspaces WHERE id = ?",
            (default_workspace_id,),
        )
        legacy_is_default_workspace = (
            default_workspace_id == legacy_workspace_id and cursor.fetchone() is not None
        )
        cursor.execute("""
            SELECT COUNT(*) AS count FROM users
            WHERE workspace_id = ? AND role = 'ADMIN' AND is_active = 1
        """, (legacy_workspace_id,))
        legacy_active_admins = cursor.fetchone()["count"]
        cursor.execute("""
            SELECT COUNT(*) AS count FROM users
            WHERE workspace_id = ? AND role != 'ADMIN'
        """, (admin_workspace_id,))
        target_non_admins = cursor.fetchone()["count"]
        cursor.execute(
            "SELECT COUNT(*) AS count FROM departments WHERE workspace_id = ?",
            (admin_workspace_id,),
        )
        target_departments = cursor.fetchone()["count"]
        cursor.execute(
            "SELECT COUNT(*) AS count FROM leave_types WHERE workspace_id = ?",
            (admin_workspace_id,),
        )
        target_leave_types = cursor.fetchone()["count"]

        if (
            legacy_is_default_workspace
            and legacy_active_admins == 0
            and target_non_admins == 0
            and target_departments == 0
            and target_leave_types == 0
        ):
            cursor.execute("""
                UPDATE users SET workspace_id = ?
                WHERE workspace_id = ? AND role != 'ADMIN'
            """, (admin_workspace_id, legacy_workspace_id))
            cursor.execute(
                "UPDATE departments SET workspace_id = ? WHERE workspace_id = ?",
                (admin_workspace_id, legacy_workspace_id),
            )
            cursor.execute(
                "UPDATE leave_types SET workspace_id = ? WHERE workspace_id = ?",
                (admin_workspace_id, legacy_workspace_id),
            )
            cursor.execute("""
                UPDATE audit_logs
                SET workspace_id = (
                    SELECT workspace_id FROM users WHERE users.id = audit_logs.user_id
                )
                WHERE workspace_id = ? AND user_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1 FROM users
                        WHERE users.id = audit_logs.user_id
                            AND users.workspace_id != audit_logs.workspace_id
                    )
            """, (legacy_workspace_id,))

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_users_workspace ON users(workspace_id, role, is_active);
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_departments_workspace ON departments(workspace_id, name);
    """)
    cursor.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_workspace_name
        ON departments(workspace_id, name);
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_leave_types_workspace ON leave_types(workspace_id, is_active);
    """)
    cursor.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_types_workspace_name
        ON leave_types(workspace_id, name);
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace ON audit_logs(workspace_id, timestamp);
    """)

    # Performance indexes for common lookups
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_attendance_emp ON attendance(employee_id, attendance_date);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_leave_requests_emp ON leave_requests(employee_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_leave_balances_emp ON leave_balances(employee_id);")

    conn.commit()
    conn.close()


def create_audit_log(conn, user_id, action, affected_record, details):
    """
    Inserts a security / activity audit record into the audit_logs table.
    Can be run within an existing database transaction.
    """
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO audit_logs (
            user_id, action, affected_record, details, timestamp, workspace_id
        )
        VALUES (
            ?, ?, ?, ?, CURRENT_TIMESTAMP,
            (SELECT workspace_id FROM users WHERE id = ?)
        )
        """,
        (user_id, action, affected_record, details, user_id)
    )


def create_workspace(conn, name):
    """Creates an isolated data workspace and returns its identifier."""
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO workspaces (name) VALUES (?)", (name.strip(),))
        return cursor.lastrowid
    finally:
        cursor.close()
