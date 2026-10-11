"use client";
// Navegación en una sola línea tipo carrusel: se desliza con el dedo, la
// opción activa queda centrada y un indicador se mueve hasta ella. Se usa
// para las secciones de Admin, las pantallas por rol, categorías y filtros.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { gsap, prefersReducedMotion } from "./motion";

export interface PillItem<K extends string> { key: K; label: ReactNode; icon?: ReactNode; badge?: ReactNode }

export function NavPills<K extends string>({ items, active, onChange, tone = "light", stretch = false, size = "md", ariaLabel }: {
  items: PillItem<K>[];
  active: K;
  onChange: (k: K) => void;
  tone?: "light" | "dark";
  stretch?: boolean;
  size?: "sm" | "md" | "lg";
  ariaLabel?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const btnRefs = useRef<Partial<Record<K, HTMLButtonElement | null>>>({});
  const placed = useRef(false);
  const [edges, setEdges] = useState({ l: false, r: false });

  const updateEdges = useCallback(() => {
    const s = scrollerRef.current;
    if (!s) return;
    const l = s.scrollLeft > 4, r = s.scrollLeft + s.clientWidth < s.scrollWidth - 4;
    setEdges(prev => (prev.l === l && prev.r === r ? prev : { l, r }));
  }, []);

  const moveIndicator = useCallback((animate: boolean) => {
    const btn = btnRefs.current[active], ind = indicatorRef.current, s = scrollerRef.current;
    if (!btn || !ind || !s) return;
    const to = { x: btn.offsetLeft, width: btn.offsetWidth, opacity: 1 };
    if (!animate || prefersReducedMotion()) gsap.set(ind, to);
    else gsap.to(ind, { ...to, duration: 0.38, ease: "power3.out", overwrite: true });
    const target = btn.offsetLeft - (s.clientWidth - btn.offsetWidth) / 2;
    s.scrollTo({ left: Math.max(0, target), behavior: animate && !prefersReducedMotion() ? "smooth" : "auto" });
  }, [active]);

  useLayoutEffect(() => {
    moveIndicator(placed.current);
    placed.current = true;
    updateEdges();
  }, [moveIndicator, updateEdges, items.length]);

  // Si cambia el ancho de alguna opción (ej. aparece un contador), el
  // indicador se reajusta a la opción activa.
  useEffect(() => {
    const track = scrollerRef.current?.firstElementChild;
    if (!track || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { moveIndicator(false); updateEdges(); });
    track.querySelectorAll(".cb-pill").forEach(el => ro.observe(el));
    return () => ro.disconnect();
  }, [moveIndicator, updateEdges, items]);

  useEffect(() => {
    const onResize = () => { moveIndicator(false); updateEdges(); };
    window.addEventListener("resize", onResize);
    // La fuente puede terminar de cargar después del primer render y cambiar anchos.
    document.fonts?.ready.then(onResize).catch(() => {});
    return () => window.removeEventListener("resize", onResize);
  }, [moveIndicator, updateEdges]);

  return (
    <div className={`cb-pills-wrap cb-pills-${tone}${edges.l ? " fade-l" : ""}${edges.r ? " fade-r" : ""}`}>
      <div ref={scrollerRef} className="cb-pills" role="tablist" aria-label={ariaLabel} onScroll={updateEdges}>
        <div className={`cb-pills-track cb-pills-${size}${stretch ? " cb-pills-stretch" : ""}`}>
          <span ref={indicatorRef} className="cb-pills-indicator" aria-hidden="true" />
          {items.map(it => (
            <button key={it.key} type="button" role="tab" aria-selected={it.key === active}
              ref={el => { btnRefs.current[it.key] = el; }}
              className={`cb-pill${it.key === active ? " is-active" : ""}`}
              onClick={() => onChange(it.key)}>
              {it.icon}
              <span>{it.label}</span>
              {it.badge !== undefined && it.badge !== null && it.badge !== 0 && <span className="cb-pill-badge">{it.badge}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
