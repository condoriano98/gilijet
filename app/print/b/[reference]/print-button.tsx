"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      style={{
        background: "#0369a1",
        color: "white",
        border: 0,
        borderRadius: 6,
        padding: "8px 14px",
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      Print / Save as PDF
    </button>
  );
}
