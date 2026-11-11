# LeaveFlow backend

New to this project? Start with the [Beginner's Guide](../BEGINNER_GUIDE.md)
from the project folder. It explains the Windows startup steps, Python and SQL
basics, Admin workspaces, and common errors in plain language.

## Local setup

1. From `backend`, install dependencies and start the API:

   ```powershell
   python -m pip install -r requirements.txt
   python -m uvicorn main:app --reload
   ```

2. From `frontend`, install the packages and start the React app:

   ```powershell
   npm install
   npm run dev
   ```

3. Open the Vite URL shown in the terminal (normally `http://localhost:5173`).

Run only one backend server for the same database at a time. If startup or
account registration reports `sqlite3.OperationalError: database is locked`,
close any other LeaveFlow backend terminal and database viewer that may be
writing to the same `.db` file, then start the backend again. SQLite now waits
up to 30 seconds for a short database lock and uses WAL mode so normal reads
can continue during writes; a lock held indefinitely still needs to be released
by closing the other program.

The backend reads `backend/.env`. On a fresh checkout, copy `.env.example` to
`.env` and set `LEAVEFLOW_SECRET_KEY` to a private random value of at least 32
characters. `LEAVEFLOW_DATABASE_PATH` can select another SQLite file. Do not
commit `.env` or share its values.

For a private local demo, initial Admin setup works without an extra key. For a
shared or internet-accessible deployment, set `LEAVEFLOW_BOOTSTRAP_KEY` to a
separate private value and enter it in the one-time setup form or send it as
`setup_key` to `POST /auth/bootstrap`.

## Initial Admin and demo credentials

The first startup creates the database tables only; it does not insert sample
departments, leave types, or demo users. There are no default demo usernames or
passwords. After setup, create departments and leave types from the Admin
screens; those records are stored in SQLite and then used by the account and
leave workflows. The current database file may already contain records from an
earlier run; startup preserves those records and does not recreate or delete
them.
When `/auth/bootstrap-status` returns `{"setup_required": true}`, use the
**Create Administrator** form on the login page, choosing the Admin's name,
email, and password (at least 8 characters). If `LEAVEFLOW_BOOTSTRAP_KEY` is
configured, enter that key too. Those chosen credentials are the local demo
Admin credentials; keep them private. Create departments and leave categories
in the app before provisioning other accounts so new employees receive their
initial leave balances from the database's active leave types.

The initial bootstrap endpoint is available only once. After initial setup,
the login page also offers public Admin registration at `POST
/auth/register-admin`; anyone who can reach the application can create an
Admin account with full privileges within its own workspace. This is
intentionally enabled for this local demo at the user's request and is unsafe
for an internet-accessible or shared deployment. Disable or protect public
Admin registration before deploying. Each registration creates a separate
workspace that is not visible to other Admins. Employees, HR, Managers,
departments, leave types, attendance, leave requests, balances, and audit
history are scoped to that workspace. A database marker still locks the initial
bootstrap after the first Admin is created.
Departments and leave types must be created separately inside each Admin's
workspace; they are not copied from another Admin's workspace.

## Roles and account creation

- **Admin:** The initial Admin is created only through first-time bootstrap.
  An existing Admin can create additional Admin, HR, Manager, and Employee
  accounts; each created Admin starts a separate empty workspace. The current
  Admin can manage accounts, departments, leave types, company data, and audit
  logs only in their own workspace.
- **HR:** Can create Employee accounts, assign departments and managers, and
  check in/out and view their own attendance, review company attendance and
  leave information, and approve or reject company-wide pending leave requests.
  HR cannot create Admin, HR, or Manager accounts.
- **Manager:** Can create Employee accounts only for their own department/team.
  Their employees are automatically assigned to that Manager. Admins must
  select a department when creating a Manager. HR/Admin can assign an employee
  to a Manager from **Employees**; if that Manager has no department yet, the
  assignment gives them the employee's department. Managers can check in/out
  and view their own attendance, plus view their team's attendance and approve
  or reject only their team's leave requests.
- When a Manager, HR, or Admin makes a leave decision without entering a
  comment, the employee's request history identifies the actual approver role.
  Older generic default comments are also displayed with the approver's role.
- **Employee:** Can view their own dashboard, attendance, balance, and requests;
  apply for leave; and check in/out.
- **Admin:** Can view company-wide attendance and leave information, including
  attendance for active employee, HR, Manager, and Admin accounts.
- All signed-in users can open **My Profile** to update their name or change
  their password.

Account creation is available from **Employees** after signing in with an
authorized role. An Admin selects Admin, Employee, Manager, or HR; HR and
Managers can create Employees only. This lets an existing Admin create
additional Admin accounts without making the bootstrap endpoint repeatable.
Employee codes are generated by the backend in sequence
(`EMP-001`, `EMP-002`, and so on), so they are not entered in the form or API
request. Each account receives a unique email and employee code, an employee
profile, and initial balances for active leave types in one transaction.
Manager team and department scope is checked by the API.
When an Admin or HR creates an Employee in a department with exactly one
active Manager, the API assigns that Manager automatically. If that department
has multiple active Managers, choose the reporting Manager in the form. Leave
requests appear in a Manager's approval list only after the employee is
assigned to that Manager.
Authorized users can return to **Employees** and create more accounts whenever
needed; the initial Admin bootstrap remains limited to one time per database,
while the separate login-page Admin registration can be used repeatedly.
Administrators can activate or deactivate accounts in **Manage Users**.
Passwords are bcrypt-hashed, and account create/deactivate events are audited.
Password hashes and setup credentials are never returned by the API.
Anyone may also create an Admin account directly from the login screen, and
multiple Admin accounts may be registered this way.

On the first startup after upgrading an existing database, each existing Admin
is assigned a workspace. Older records did not store their owner, so they are
initially associated with the lowest-ID Admin. If audit history unambiguously
shows that one active Admin created accounts in that legacy workspace, and
that Admin's new workspace is otherwise empty, startup restores the legacy team,
departments, leave types, and audit entries to that Admin's workspace. If the
audit history is ambiguous or the target workspace already contains data, the
migration does not guess; existing records remain in the legacy workspace.
HR and Admin can reassign an employee's reporting Manager in **Employees**.
Only active Managers in the employee's department can be selected. Managers
then see that employee's pending leave requests under **Pending Approvals**.

## Authentication and Postman

`POST /auth/login` returns an access token. Send it to protected endpoints with:

```http
Authorization: Bearer <access_token>
```

Import `../postman/LeaveFlow.postman_collection.json` into Postman. The
collection is self-contained; selecting an environment is not required. In the
collection's **Variables** tab, enter `adminName`, `adminEmail`, and
`adminPassword` (at least 8 characters). Enter `setupKey` only when the backend
has `LEAVEFLOW_BOOTSTRAP_KEY` configured. Run **Health**, **Bootstrap Status**,
then **Bootstrap First Admin** only when `setup_required` is true, followed by
**Login as Admin** using the same email and password. Follow the request
descriptions and send requests individually; do not run the entire collection
at once because requests depend on previously created accounts and IDs. Login
and account-creation scripts save the active token and generated values as
collection variables. The optional `LeaveFlow Local` environment only
overrides `baseUrl`. Interactive API docs are available at `/docs`.

The collection includes every registered API operation, separate Admin, HR,
Manager, and Employee login requests, the employee-to-Manager assignment route,
and scripts that save IDs and credentials returned by setup requests. Select
the local environment, enter the Admin credentials, and run the requests in
this order: Bootstrap Status; Bootstrap First Admin if setup is required; Login
as Admin; Create Department; Create Leave Type; create a Manager and HR with
the Account Role variable; then create an Employee with `managerId` set to the
created Manager. The collection fills `departmentId`, `managerId`, generated
employee codes, leave type IDs, and leave request IDs as requests succeed.
Use the corresponding role login before testing role-restricted routes.

Check In, Check Out, leave application/decisions, account status changes,
profile changes, and password changes modify data. Check In is limited to once
per day, and approvals/rejections process a pending request, so use a separate
test database when repeatedly exercising state-changing requests.

## Key API routes

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/health` | Public |
| GET | `/auth/bootstrap-status` | Public |
| POST | `/auth/bootstrap` | Public, one time; optional configured setup key |
| POST | `/auth/register-admin` | Public, repeatable Admin registration |
| POST | `/auth/login` | Public |
| GET / PUT | `/auth/me` | Authenticated |
| POST | `/auth/change-password` | Authenticated |
| GET | `/dashboard/summary` | Authenticated |
| GET / POST | `/employees` | Admin/HR/Manager; create-role rules apply |
| PATCH | `/employees/{employee_id}/manager` | Admin/HR; assign or clear reporting Manager |
| GET | `/admin/users` | Admin |
| PATCH | `/admin/users/{user_id}/status` | Admin |
| GET / POST | `/departments` | GET authenticated; POST Admin/HR |
| GET / POST | `/leave-types` | GET authenticated; POST Admin/HR |
| GET | `/leaves/balances` | Admin/HR |
| GET | `/admin/audit-logs` | Admin |
| `/attendance/*` | — | Own attendance; team/company view is role-scoped |
| `/leaves/*` | — | Own leave data; approval routes are team/company role-scoped |
