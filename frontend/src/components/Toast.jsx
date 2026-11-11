import React, { useEffect } from "react";
import { CheckCircle, AlertCircle, Info, X } from "lucide-react";

export default function Toast({ message, type = "info", onClose, duration = 4000 }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  if (!message) return null;

  const isSuccess = type === "success";
  const isError = type === "error";

  return (
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: 9999,
        maxWidth: "420px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "14px 18px",
        borderRadius: "10px",
        boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
        backgroundColor: isError ? "#FEE2E2" : isSuccess ? "#DCFCE7" : "#EFF6FF",
        color: isError ? "#991B1B" : isSuccess ? "#166534" : "#1E40AF",
        border: `1px solid ${isError ? "#FECACA" : isSuccess ? "#BBF7D0" : "#BFDBFE"}`,
        animation: "modalIn 0.2s ease-out",
      }}
    >
      {isSuccess && <CheckCircle size={20} />}
      {isError && <AlertCircle size={20} />}
      {!isSuccess && !isError && <Info size={20} />}
      <span style={{ fontSize: "0.88rem", fontWeight: 500, flex: 1 }}>{message}</span>
      <button
        onClick={onClose}
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "inherit",
          padding: "2px",
          display: "flex",
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
