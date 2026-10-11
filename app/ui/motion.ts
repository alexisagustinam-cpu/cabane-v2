"use client";
// Animaciones con GSAP. Regla de la casa: movimiento corto (150–350 ms) que
// explique qué cambió, nunca adorno. Con "reducir movimiento" activo en el
// teléfono todo queda instantáneo.
import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import { gsap } from "gsap";
import { Flip } from "gsap/Flip";

gsap.registerPlugin(Flip);
export { gsap, Flip };

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Vibración corta en Android al tocar acciones frecuentes (iPhone la ignora).
export function haptic(ms = 8) {
  try { navigator.vibrate?.(ms); } catch { /* sin soporte */ }
}

// "Salto" de un número o contador cuando cambia (total del carrito, badges).
export function bump(el: Element | null, scale = 1.14) {
  if (!el || prefersReducedMotion()) return;
  gsap.fromTo(el, { scale }, { scale: 1, duration: 0.35, ease: "back.out(3)", overwrite: true });
}

// Pulso de atención sobre una tarjeta que cambió por un evento de otra persona.
// Usa outline (no box-shadow) para no pisar las sombras inline de React.
export function attention(el: Element | null, color = "181,137,74") {
  if (!el || prefersReducedMotion()) return;
  gsap.fromTo(el,
    { outline: `3px solid rgba(${color},0.9)`, outlineOffset: 0, scale: 1.03 },
    { outlineColor: `rgba(${color},0)`, outlineOffset: 10, scale: 1, duration: 0.9, ease: "power2.out", clearProps: "outline,outlineOffset,transform" });
}

// Salida de una tarjeta antes de quitarla del estado (pedido marcado listo).
export function exitCard(el: Element | null): Promise<void> {
  if (!el || prefersReducedMotion()) return Promise.resolve();
  return new Promise(resolve => {
    gsap.to(el, { opacity: 0, scale: 0.94, y: -6, duration: 0.22, ease: "power2.in", onComplete: () => resolve() });
  });
}

// Reacomodo animado de listas (GSAP Flip). Se llama capture() justo antes de
// cambiar el estado; después del render los elementos con data-flip-id se
// deslizan a su nueva posición y los nuevos entran con un destello.
export function useFlip<T extends HTMLElement>(ref: RefObject<T | null>) {
  const pending = useRef<Flip.FlipState | null>(null);
  const capture = useCallback(() => {
    const root = ref.current;
    if (!root || prefersReducedMotion()) return;
    pending.current = Flip.getState(root.querySelectorAll("[data-flip-id]"));
  }, [ref]);

  useLayoutEffect(() => {
    const state = pending.current;
    const root = ref.current;
    if (!state || !root) return;
    pending.current = null;
    Flip.from(state, {
      targets: root.querySelectorAll("[data-flip-id]"),
      duration: 0.4,
      ease: "power2.inOut",
      nested: true,
      onEnter: els => gsap.fromTo(els,
        { opacity: 0, y: -12, scale: 0.97, outline: "3px solid rgba(122,30,58,0.85)", outlineOffset: 0 },
        { opacity: 1, y: 0, scale: 1, outlineColor: "rgba(122,30,58,0)", outlineOffset: 12, duration: 0.7, ease: "power3.out", clearProps: "outline,outlineOffset,transform,opacity" }),
    });
  });

  return capture;
}
