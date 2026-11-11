import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function PasswordInput({ style, ...inputProps }) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <input
        {...inputProps}
        type={isVisible ? "text" : "password"}
        style={{ ...style, paddingRight: "44px" }}
      />
      <button
        type="button"
        className="password-visibility-toggle"
        aria-label={isVisible ? "Hide password" : "Show password"}
        title={isVisible ? "Hide password" : "Show password"}
        onClick={() => setIsVisible((visible) => !visible)}
      >
        {isVisible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
