"use client";
// Interruptor tipo iPhone (activo / inactivo). Área táctil de 44 px.
export function Switch({ checked, onChange, label, disabled = false }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean;
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{ width: 56, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", padding: 0, cursor: disabled ? "not-allowed" : "pointer", flexShrink: 0 }}>
      <span aria-hidden="true" style={{ position: "relative", width: 48, height: 28, borderRadius: 99, background: checked ? "#2F7D32" : "#CDBBA3", transition: "background-color .2s", opacity: disabled ? 0.5 : 1 }}>
        <span style={{ position: "absolute", top: 3, left: checked ? 23 : 3, width: 22, height: 22, borderRadius: "50%", background: "#fff", boxShadow: "0 2px 4px rgba(23,18,15,0.25)", transition: "left .2s ease" }} />
      </span>
    </button>
  );
}
