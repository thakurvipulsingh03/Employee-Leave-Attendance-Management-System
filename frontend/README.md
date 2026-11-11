# LeaveFlow frontend

This folder contains the React website. It uses Vite for local development.
The Python API must also be running for sign-in and application data to work.

## Run the website

Open PowerShell in this folder and run:

```powershell
npm install
npm run dev
```

Open the local address printed by Vite, usually `http://localhost:5173`.
Keep the terminal open while using the website. The backend should be running
separately from the `backend` folder:

```powershell
python -m uvicorn main:app --reload
```

See the project's [Beginner's Guide](../BEGINNER_GUIDE.md) for complete
Windows setup instructions, a plain-language explanation of Python and SQL,
account roles, workspace separation, and troubleshooting.
