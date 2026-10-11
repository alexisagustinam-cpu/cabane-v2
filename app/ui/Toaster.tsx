"use client";
// Avisos flotantes: se ven aunque la pantalla esté desplazada hacia abajo.
// Cualquier parte de la app llama toast("…") sin pasar estado por props.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { gsap, prefersReducedMotion } from "./motion";
import { IconCheck, IconInfo, IconClose } from "./icons";

export type ToastKind = "success" | "error" | "info" | "safe";
type Toast = { id: number; msg: string; kind: ToastKind };

let nextId = 1;
const listeners = new Set<(t: Toast) => void>();

export function toast(msg: string, kind: ToastKind = "success") {
  if (!msg) return;
  const t = { id: nextId++, msg, kind };
  listeners.forEach(l => l(t));
}

const COLORS: Record<ToastKind, { bg: string; fg: string }> = {
  success: { bg: "#1F5A23", fg: "#fff" },
  error: { bg: "#A61F1F", fg: "#fff" },
  info: { bg: "#2A1A1F", fg: "#F3E6D3" },
  safe: { bg: "#5B4410", fg: "#FFF3D6" },
};

function ToastItem({ t, onDone }: { t: Toast; onDone: (id: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const leaving = useRef(false);
  const leave = () => {
    if (leaving.current) return;
    leaving.current = true;
    if (!ref.current || prefersReducedMotion()) { onDone(t.id); return; }
    gsap.to(ref.current, { opacity: 0, y: -10, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, duration: 0.25, ease: "power2.in", onComplete: () => onDone(t.id) });
  };
  useLayoutEffect(() => {
    if (ref.current && !prefersReducedMotion()) gsap.fromTo(ref.current, { opacity: 0, y: -16, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.32, ease: "back.out(1.6)" });
  }, []);
  useEffect(() => {
    const ms = t.kind === "error" ? 7000 : t.kind === "safe" ? 3500 : 4500;
    const timer = setTimeout(leave, ms);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const c = COLORS[t.kind];
  const Icon = t.kind === "success" ? IconCheck : t.kind === "error" ? IconClose : IconInfo;
  return (
    <div ref={ref} role={t.kind === "error" ? "alert" : "status"} onClick={leave} className="cb-toast" style={{ background: c.bg, color: c.fg }}>
      <Icon size={18} strokeWidth={2.5} />
      <span style={{ flex: 1 }}>{t.msg}</span>
    </div>
  );
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const add = (t: Toast) => setItems(prev => {
      // Si llega el mismo aviso seguido (ej. varios guardados en modo prueba) no se apila.
      const rest = prev.filter(p => p.msg !== t.msg);
      return [...rest, t].slice(-3);
    });
    listeners.add(add);
    return () => { listeners.delete(add); };
  }, []);
  return (
    <div className="cb-toaster" aria-live="polite">
      {items.map(t => <ToastItem key={t.id} t={t} onDone={id => setItems(prev => prev.filter(p => p.id !== id))} />)}
    </div>
  );
}
