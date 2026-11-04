"use client";

/* Temas por época (Navidad, Halloween, Carnaval…). Los controla Agustín desde
   su CRM: ahí decide si Cabane va normal, en automático según la fecha o con
   un tema fijo. Este módulo pide el tema vigente y lo reparte a la app.

   La idea es que el tema acompañe el diseño de Cabane, no que lo tape: cada
   pantalla usa estas piezas en su propio lugar (franja de temporada arriba de
   cada pantalla, encabezado y pestañas con el color de la época, marca de
   agua en mesas y comandas, botones principales, ventanas, listas vacías,
   festejo al enviar y al cobrar, comprobante). Nada queda encima de botones,
   logos ni textos. Sin tema, todo se ve exactamente como siempre.

   Con ?tema=<clave> en la URL se fuerza un tema para revisarlo. */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Tema = {
  key: string;
  name: string;
  colors: { accent: string; soft: string; background: string; text: string };
  banner: string;
  staffGreeting: string;
  emptyLine: string;
  countdown: string | null;
  decor: {
    icon: string;
    corner: { svg: string; size: number };
    hanging: Array<{ svg: string; size: number; drop: number }>;
    thread: string;
    garland: { svg: string; width: number; height: number };
    particles: { items: string[]; motion: "fall" | "drift"; size: [number, number]; count: number };
  };
};

const TEMAS_URL = process.env.NEXT_PUBLIC_TEMAS_URL || "https://automai-crm-os.vercel.app";
const CACHE_MS = 10 * 60 * 1000;
const TemaContext = createContext<Tema | null>(null);

export const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export function TemaProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema | null>(null);

  useEffect(() => {
    const forced = new URLSearchParams(location.search).get("tema");
    const cacheKey = `cabane_tema_${forced ?? "auto"}`;
    try {
      const cached = JSON.parse(sessionStorage.getItem(cacheKey) ?? "null");
      if (cached && Date.now() - cached.at < CACHE_MS) { setTema(cached.tema); return; }
    } catch {}
    const url = `${TEMAS_URL}/api/public/theme/cabane${forced ? `?preview=${encodeURIComponent(forced)}` : ""}`;
    fetch(url, { credentials: "omit" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const next = (data?.theme ?? null) as Tema | null;
        setTema(next);
        try { sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), tema: next })); } catch {}
      })
      .catch(() => {});
  }, []);

  // Variables CSS para los estilos de globals.css (botones, pestañas).
  useEffect(() => {
    const root = document.documentElement;
    if (!tema) { root.removeAttribute("data-tema"); return; }
    root.setAttribute("data-tema", tema.key);
    root.style.setProperty("--tema-acento", tema.colors.accent);
    root.style.setProperty("--tema-suave", tema.colors.soft);
    // Ilustraciones como variables, para usarlas desde globals.css.
    root.style.setProperty("--tema-icono", `url("${svgUrl(tema.decor.icon)}")`);
    root.style.setProperty("--tema-guirnalda", `url("${svgUrl(tema.decor.garland.svg)}")`);
    root.style.setProperty("--tema-guirnalda-w", `${Math.round(tema.decor.garland.width * 0.55)}px`);
    root.style.setProperty("--tema-guirnalda-h", `${Math.round(tema.decor.garland.height * 0.55)}px`);
    root.style.setProperty("--tema-patron", `url("${svgUrl(patternTile(tema))}")`);
  }, [tema]);

  return <TemaContext.Provider value={tema}>{children}</TemaContext.Provider>;
}

export const useTema = () => useContext(TemaContext);

/** Baldosa del papel tapiz: el ícono y dos partículas de la época, girados. */
function patternTile(tema: Tema) {
  const img = (svg: string, x: number, y: number, w: number, rot: number) =>
    `<image href="${svgUrl(svg).replace(/"/g, "&quot;")}" x="${x}" y="${y}" width="${w}" height="${w}" transform="rotate(${rot} ${x + w / 2} ${y + w / 2})"/>`;
  const [a, b = a] = tema.decor.particles.items;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">${img(tema.decor.icon, 18, 22, 44, -14)}${img(a, 112, 40, 20, 20)}${img(b, 70, 112, 16, -30)}${img(tema.decor.icon, 118, 118, 30, 12)}</svg>`;
}

/** Ícono de la época, en línea con el texto. */
export function TemaIcon({ tema, size = 20, title }: { tema: Tema; size?: number; title?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={svgUrl(tema.decor.icon)} alt="" title={title} aria-hidden={title ? undefined : true}
      style={{ width: size, height: size, objectFit: "contain", display: "inline-block", verticalAlign: "middle", flexShrink: 0 }} />
  );
}

/** Franja con la guirnalda de la época. Ocupa su propio espacio en el flujo. */
export function TemaStrip({ tema, background = "transparent", scale = 0.5 }: { tema: Tema; background?: string; scale?: number }) {
  const g = tema.decor.garland;
  const h = Math.round(g.height * scale * 0.72);
  return (
    <div aria-hidden style={{
      height: h, background, overflow: "hidden", pointerEvents: "none",
      backgroundImage: `url("${svgUrl(g.svg)}")`, backgroundRepeat: "repeat-x",
      backgroundSize: `${Math.round(g.width * scale)}px ${Math.round(g.height * scale)}px`, backgroundPosition: "0 -2px",
    }} />
  );
}

/** Partículas detrás del contenido de un contenedor (que debe ser position:relative). */
export function TemaParticles({ tema, count, zIndex = 0 }: { tema: Tema; count?: number; zIndex?: number }) {
  const [items, setItems] = useState<Array<{ src: string; cls: string; css: React.CSSProperties }>>([]);
  useEffect(() => {
    const p = tema.decor.particles;
    const n = count ?? Math.ceil(p.count * (window.innerWidth < 640 ? 0.5 : 0.8));
    const r = (a: number, b: number) => a + Math.random() * (b - a);
    setItems(Array.from({ length: n }, (_, i) => {
      const size = Math.round(r(p.size[0], p.size[1]));
      return {
        src: svgUrl(p.items[i % p.items.length]),
        cls: p.motion === "drift" ? "tema-p-volar" : "tema-p-caer",
        css: p.motion === "drift"
          ? { top: `${Math.round(r(8, 75))}%`, left: 0, width: size, animationDuration: `${r(16, 26).toFixed(1)}s`, animationDelay: `${(-r(0, 24)).toFixed(1)}s` }
          : { top: 0, left: `${r(0, 100).toFixed(1)}%`, width: size, opacity: r(0.55, 0.9), ["--dx" as string]: `${Math.round(r(-40, 40))}px`, animationDuration: `${r(10, 20).toFixed(1)}s`, animationDelay: `${(-r(0, 20)).toFixed(1)}s` },
      };
    }));
  }, [tema, count]);
  return (
    <div aria-hidden className="tema-particulas" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {items.map((it, i) => <img key={i} src={it.src} alt="" className={it.cls} style={{ position: "absolute", height: "auto", ...it.css }} />)}
    </div>
  );
}

/** Franja de temporada arriba de cada pantalla: saludo al equipo, cuenta
 *  regresiva, guirnalda y partículas dentro de la franja. Se puede cerrar por
 *  hoy (vuelve mañana). Ocupa su propio espacio: no tapa nada. */
export function TemaHero({ tema, compact = false }: { tema: Tema; compact?: boolean }) {
  const key = `cabane_tema_oculto_${tema.key}_${new Date().toISOString().slice(0, 10)}`;
  const [hidden, setHidden] = useState(true);
  useEffect(() => { try { setHidden(localStorage.getItem(key) === "1"); } catch { setHidden(false); } }, [key]);
  if (hidden) return null;
  const close = () => { setHidden(true); try { localStorage.setItem(key, "1"); } catch {} };
  return (
    <div className="tema-hero tema-asoma" data-compacto={compact || undefined}>
      <div className="tema-hero-guirnalda" aria-hidden />
      <TemaParticles tema={tema} count={compact ? 5 : 9} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="tema-hero-esquina" src={svgUrl(tema.decor.corner.svg)} alt="" aria-hidden />
      <div className="tema-hero-colgantes" aria-hidden>
        {tema.decor.hanging.slice(0, compact ? 2 : 3).map((h, i) => (
          <span key={i} className="tema-colgante" style={{ ["--hilo" as string]: `${Math.round(h.drop * (compact ? 0.45 : 0.7))}px`, ["--hilo-color" as string]: tema.decor.thread, animationDelay: `${-i * 1.1}s` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={svgUrl(h.svg)} alt="" style={{ width: Math.round(h.size * (compact ? 0.8 : 1.05)) }} />
          </span>
        ))}
      </div>
      <span className="tema-hero-icono" aria-hidden><TemaIcon tema={tema} size={compact ? 30 : 44} /></span>
      <div className="tema-hero-texto">
        <strong>{tema.staffGreeting}</strong>
        {tema.countdown && <span>{tema.countdown}</span>}
      </div>
      <button type="button" className="tema-hero-cerrar" onClick={close} aria-label="Ocultar por hoy" title="Ocultar por hoy">×</button>
    </div>
  );
}

/** Festejo corto (1,2 s) que sale desde un elemento, p. ej. al enviar un pedido. */
export function temaBurst(tema: Tema, from?: Element | null) {
  if (typeof window === "undefined" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const box = from?.getBoundingClientRect();
  const x = box ? box.left + box.width / 2 : innerWidth / 2;
  const y = box ? box.top + box.height / 2 : innerHeight * 0.7;
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden";
  const items = [tema.decor.icon, ...tema.decor.particles.items];
  for (let i = 0; i < 16; i++) {
    const img = document.createElement("img");
    img.alt = "";
    img.src = svgUrl(items[i % items.length]);
    const size = i % items.length === 0 ? 26 : 14 + Math.random() * 8;
    img.style.cssText = `position:absolute;left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:auto`;
    layer.appendChild(img);
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
    const dist = 90 + Math.random() * 110;
    img.animate([
      { transform: "translate(0,0) scale(.4) rotate(0)", opacity: 1 },
      { transform: `translate(${Math.cos(angle) * dist}px,${Math.sin(angle) * dist}px) scale(1) rotate(${Math.random() * 240 - 120}deg)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${Math.cos(angle) * dist * 1.1}px,${Math.sin(angle) * dist + 70}px) scale(.9)`, opacity: 0 },
    ], { duration: 1100 + Math.random() * 300, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" });
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 1500);
}
