import React from "react";

export default function AlertBanner({ type = "info", message, onClose }) {
  if (!message) return null;

  return (
    <div className={`alert-banner alert-${type}`} role="alert">
      <div className="alert-text">{message}</div>
      {onClose && (
        <button
          type="button"
          className="alert-close"
          onClick={onClose}
          aria-label="Fermer le message"
        >
          ×
        </button>
      )}
    </div>
  );
}
