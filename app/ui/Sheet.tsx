"use client";
// Ventana inferior (bottom sheet) para todas las ventanas de la app.
// En el teléfono sube desde abajo y se cierra arrastrando hacia abajo; en
// pantallas grandes se muestra centrada. Se cierra también con el fondo,
// la X, Escape y el botón "atrás" de Android: mientras haya ventanas
// abiertas existe UNA entrada extra en el historial ("guardia"); el botón
// atrás la consume y cierra la ventana de arriba.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { gsap, prefersReducedMotion } from "./motion";
import { IconClose } from "./icons";
import { DARK, MUTED } from "./tokens";

type Entry = { id: string; close: () => void };
const stack: Entry[] = [];
let ignorePops = 0;
let listening = false;
let locks = 0;
let guardActive = false;
let syncTimer: number | undefined;

// Se sincroniza en el siguiente tick: así el doble montaje de React en
// desarrollo (StrictMode) no agrega ni quita entradas de más.
function scheduleSync() {
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    const want = stack.length > 0;
    if (want && !guardActive) { window.history.pushState({ cabaneSheet: true }, ""); guardActive = true; }
    else if (!want && guardActive) { guardActive = false; ignorePops++; window.history.back(); }
  }, 0);
}

function onPopState() {
  if (ignorePops > 0) { ignorePops--; return; }
  if (!guardActive) return;
  guardActive = false; // el botón atrás ya consumió la guardia
  stack[stack.length - 1]?.close();
  scheduleSync(); // si quedan ventanas abiertas, se vuelve a poner la guardia
}

const isPhone = () => window.matchMedia("(max-width: 640px)").matches;

export interface SheetProps {
  onClose: () => void;
  eyebrow?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
  // "dialog" queda centrada también en el teléfono (confirmaciones cortas).
  variant?: "sheet" | "dialog";
  label?: string;
}

export function Sheet({ onClose, eyebrow, title, subtitle, children, footer, maxWidth = 480, variant = "sheet", label }: SheetProps) {
  const id = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  const animateOut = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const panel = panelRef.current, backdrop = backdropRef.current;
    const done = () => onCloseRef.current();
    if (!panel || !backdrop || prefersReducedMotion()) { done(); return; }
    gsap.to(backdrop, { opacity: 0, duration: 0.2 });
    if (variant === "sheet" && isPhone()) {
      gsap.to(panel, { yPercent: 100, duration: 0.24, ease: "power2.in", onComplete: done });
    } else {
      gsap.to(panel, { opacity: 0, scale: 0.96, y: 8, duration: 0.16, ease: "power2.in", onComplete: done });
    }
  }, [variant]);

  const requestClose = useCallback(() => { animateOut(); }, [animateOut]);

  useEffect(() => {
    if (!listening) { window.addEventListener("popstate", onPopState); listening = true; }
    stack.push({
      id,
      close: () => {
        const i = stack.findIndex(e => e.id === id);
        if (i >= 0) stack.splice(i, 1);
        animateOut();
      },
    });
    scheduleSync();

    locks++;
    document.documentElement.classList.add("cb-scroll-lock");

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && stack[stack.length - 1]?.id === id) requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const i = stack.findIndex(e => e.id === id);
      if (i >= 0) stack.splice(i, 1);
      // Si ya no quedan ventanas, se quita la guardia del historial.
      scheduleSync();
      locks--;
      if (!locks) document.documentElement.classList.remove("cb-scroll-lock");
    };
    // Una sola vez por ventana abierta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const panel = panelRef.current, backdrop = backdropRef.current;
    if (!panel || !backdrop) return;
    panel.focus({ preventScroll: true });
    if (prefersReducedMotion()) return;
    gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.22, ease: "power1.out" });
    if (variant === "sheet" && isPhone()) {
      gsap.fromTo(panel, { yPercent: 100 }, { yPercent: 0, duration: 0.36, ease: "power3.out" });
    } else {
      gsap.fromTo(panel, { opacity: 0, scale: 0.96, y: 12 }, { opacity: 1, scale: 1, y: 0, duration: 0.24, ease: "power2.out" });
    }
  }, [variant]);

  // Arrastrar hacia abajo desde la cabecera para cerrar (solo teléfono).
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (variant !== "sheet" || !isPhone() || (e.target as HTMLElement).closest("button,input,select,textarea,a")) return;
    drag.current = { y: e.clientY, t: performance.now(), dy: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    d.dy = Math.max(0, e.clientY - d.y);
    gsap.set(panelRef.current, { y: d.dy });
    gsap.set(backdropRef.current, { opacity: Math.max(0.2, 1 - d.dy / 500) });
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const velocity = d.dy / Math.max(1, performance.now() - d.t);
    if (d.dy > 110 || (velocity > 0.6 && d.dy > 30)) { requestClose(); return; }
    gsap.to(panelRef.current, { y: 0, duration: 0.28, ease: "power3.out" });
    gsap.to(backdropRef.current, { opacity: 1, duration: 0.2 });
  };

  const hasHeader = eyebrow || title || subtitle;
  return (
    <div ref={backdropRef} className={`cb-sheet-backdrop${variant === "dialog" ? " cb-dialog" : ""}`}
      onClick={e => { if (e.target === e.currentTarget) requestClose(); }}>
      <div ref={panelRef} className="cb-sheet" role="dialog" aria-modal="true" tabIndex={-1}
        aria-label={label || (typeof title === "string" ? title : undefined)} style={{ maxWidth }}>
        <div className="cb-sheet-head" onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          {variant === "sheet" && <div className="cb-sheet-grabber" aria-hidden="true" />}
          {hasHeader && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                {eyebrow && <p style={{ fontSize: 12, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{eyebrow}</p>}
                {title && <p style={{ fontSize: 22, fontWeight: 900, color: DARK, lineHeight: 1.15 }}>{title}</p>}
                {subtitle && <div style={{ fontSize: 13, fontWeight: 700, color: MUTED, marginTop: 4 }}>{subtitle}</div>}
              </div>
              <button type="button" className="cb-icon-btn" aria-label="Cerrar" onClick={requestClose}>
                <IconClose size={20} />
              </button>
            </div>
          )}
        </div>
        <div className="cb-sheet-body">{children}</div>
        {footer && <div className="cb-sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}
