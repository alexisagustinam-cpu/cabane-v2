"use client";
// Deslizar hacia abajo desde arriba de la pantalla para actualizar (teléfono
// y tablet). Reemplaza la recarga nativa de Chrome, que recargaba toda la app.
import { useEffect, useRef } from "react";
import { gsap, haptic, prefersReducedMotion } from "./motion";
import { IconRefresh } from "./icons";

const TRIGGER = 72, MAX = 110;

export function PullToRefresh({ onRefresh, disabled = false }: { onRefresh: () => Promise<unknown> | void; disabled?: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const cb = useRef(onRefresh);
  useEffect(() => { cb.current = onRefresh; });

  useEffect(() => {
    if (disabled) return;
    let startY = 0, startX = 0, dist = 0, active = false, busy = false, armed = false;
    const box = boxRef.current, icon = iconRef.current, label = labelRef.current;
    if (!box || !icon || !label) return;
    const set = (d: number) => {
      gsap.set(box, { y: d - 56, opacity: Math.min(1, d / 40) });
      gsap.set(icon, { rotate: d * 3 });
      const ready = d >= TRIGGER;
      if (ready !== armed) { armed = ready; if (ready) haptic(8); }
      label.textContent = ready ? "Suelta para actualizar" : "Desliza para actualizar";
    };
    const reset = () => { gsap.to(box, { y: -56, opacity: 0, duration: prefersReducedMotion() ? 0 : 0.25, ease: "power2.out" }); };
    const blocked = (t: EventTarget | null) =>
      document.documentElement.classList.contains("cb-scroll-lock") ||
      (t instanceof Element && !!t.closest("input,textarea,select,.cb-pills,.cb-sheet"));

    const onStart = (e: TouchEvent) => {
      if (busy || e.touches.length !== 1 || window.scrollY > 0 || blocked(e.target)) { active = false; return; }
      startY = e.touches[0].clientY; startX = e.touches[0].clientX; dist = 0; active = true; armed = false;
    };
    const onMove = (e: TouchEvent) => {
      if (!active) return;
      const dy = e.touches[0].clientY - startY, dx = e.touches[0].clientX - startX;
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || window.scrollY > 0) { if (dist) { dist = 0; reset(); } return; }
      dist = Math.min(MAX, dy * 0.5);
      set(dist);
    };
    const onEnd = async () => {
      if (!active) return;
      active = false;
      if (dist < TRIGGER) { reset(); return; }
      busy = true;
      label.textContent = "Actualizando…";
      gsap.to(box, { y: TRIGGER - 56, duration: 0.15 });
      const spin = gsap.to(icon, { rotate: "+=360", duration: 0.7, repeat: -1, ease: "none" });
      try { await cb.current(); } catch { /* el aviso de error lo da cada pantalla */ }
      spin.kill();
      busy = false; dist = 0;
      reset();
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [disabled]);

  return (
    <div ref={boxRef} className="cb-ptr" aria-hidden="true">
      <span ref={iconRef} style={{ display: "flex" }}><IconRefresh size={18} strokeWidth={2.4} /></span>
      <span ref={labelRef}>Desliza para actualizar</span>
    </div>
  );
}
