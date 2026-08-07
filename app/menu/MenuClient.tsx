"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { animate, stagger, spring } from "animejs";
import styles from "./menu.module.css";

interface Category { id: string; name: string; sort: number }
interface MenuProduct { id: string; name: string; category: string; price: number; description: string | null }

const $ = (n: number) => `$${n.toFixed(2)}`;

// Si la imagen ya está en caché, el navegador puede completarla antes de que
// React llegue a enganchar onLoad — sin esto, el fundido de entrada se queda
// trabado en opacity:0 para fotos que cargan casi instantáneo (como en local).
function fadeInImgRef(el: HTMLImageElement | null) {
  if (el?.complete && el.naturalWidth > 0) el.classList.add(styles.loaded);
}

// Foto "hero" + plato ancla por categoría — no hay foto por producto todavía
// (la tabla products no tiene esa columna), así que por ahora cada categoría
// muestra UNA foto real en su plato más representativo; el resto de los
// productos de esa categoría se listan solo con texto hasta tener más fotos.
const CATEGORY_MEDIA: Record<string, { image: string; anchor: string }> = {
  "Sánduches": { image: "/menu-cat-sanduches.jpg", anchor: "El de la Casa" },
  "Desayunos": { image: "/menu-cat-desayunos.jpg", anchor: "Campestre" },
  "Clásicos": { image: "/menu-cat-clasicos.jpg", anchor: "Chori-Lomo Cabane" },
  "Ensaladas": { image: "/menu-cat-ensaladas.jpg", anchor: "Cabane Salad" },
  "Tablitas": { image: "/menu-cat-tablitas.jpg", anchor: "Blita Cabane" },
  "Para Compartir": { image: "/menu-cat-compartir.jpg", anchor: "Mixta" },
  "Bebidas": { image: "/menu-cat-bebidas.jpg", anchor: "Mojito" },
  "Cafés": { image: "/menu-cat-cafes.jpg", anchor: "Latte Ferrero Rocher" },
  "Postres": { image: "/menu-cat-postres.jpg", anchor: "Chesscake Avellana y Ferrero Rocher" },
};

// Íconos de línea por categoría — coincidencia por palabra clave, con un
// genérico de respaldo (estrella) para categorías nuevas que el admin agregue después.
function CategoryIcon({ name, size = 22 }: { name: string; size?: number }) {
  const n = name.toLowerCase();
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (/caf[eé]/.test(n)) return (
    <svg {...common}><path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z"/><path d="M17 9.5h1.6a2.3 2.3 0 0 1 0 4.6H17"/><path d="M7.5 3.5c.6.9-.4 1.4.2 2.3M11 3.5c.6.9-.4 1.4.2 2.3M14.5 3.5c.6.9-.4 1.4.2 2.3"/></svg>
  );
  if (/bebida|jugo|gaseosa|cola|limonada/.test(n)) return (
    <svg {...common}><path d="M6 8h12l-1.3 11a2 2 0 0 1-2 1.8H9.3a2 2 0 0 1-2-1.8L6 8Z"/><path d="M5 8h14"/><path d="M9.5 4.5 12 2m0 2v3"/></svg>
  );
  if (/postre|dulce|torta|pay/.test(n)) return (
    <svg {...common}><path d="M4 20 12 6l8 14Z"/><path d="M4 20h16"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></svg>
  );
  if (/desayuno/.test(n)) return (
    <svg {...common}><ellipse cx="12" cy="13.5" rx="8" ry="5.5"/><circle cx="12" cy="13.5" r="2.6" fill="currentColor" stroke="none"/></svg>
  );
  if (/ensalada|verde|vegetal/.test(n)) return (
    <svg {...common}><path d="M5 19c0-8.8 6.5-15 15-15 0 8.8-6.5 15-15 15Z"/><path d="M5 19c2.7-3.6 6.3-6.4 11-8.4"/></svg>
  );
  if (/compartir|picar|grupo/.test(n)) return (
    <svg {...common}><circle cx="9" cy="12" r="5.2"/><circle cx="16" cy="12" r="5.2"/></svg>
  );
  if (/tablita|tabla|picoteo|queso/.test(n)) return (
    <svg {...common}><rect x="4" y="5" width="16" height="14" rx="2.5"/><circle cx="8.3" cy="10" r="0.9" fill="currentColor" stroke="none"/><circle cx="12" cy="10" r="0.9" fill="currentColor" stroke="none"/><circle cx="15.7" cy="10" r="0.9" fill="currentColor" stroke="none"/><circle cx="8.3" cy="15" r="0.9" fill="currentColor" stroke="none"/><circle cx="12" cy="15" r="0.9" fill="currentColor" stroke="none"/><circle cx="15.7" cy="15" r="0.9" fill="currentColor" stroke="none"/></svg>
  );
  if (/s[aá]nduche|sandwich|burger|hamburguesa/.test(n)) return (
    <svg {...common}><path d="M3.5 12 12 5l8.5 7"/><path d="M4.5 12h15l-1.6 6.3a2 2 0 0 1-1.9 1.5H8a2 2 0 0 1-1.9-1.5L4.5 12Z"/><path d="M4.5 12c1.2 1.4 2.3 1.4 3.5 0s2.3-1.4 3.5 0 2.3 1.4 3.5 0 2.3-1.4 3.5 0"/></svg>
  );
  return (
    <svg {...common}><path d="M12 3.5l1.9 5.9 6.1.1-4.9 3.7 1.9 5.9-5-3.6-5 3.6 1.9-5.9-4.9-3.7 6.1-.1Z"/></svg>
  );
}

export default function MenuClient({ categories, products }: { categories: Category[]; products: MenuProduct[] }) {
  const [revealed, setRevealed] = useState(false);
  const [splashGone, setSplashGone] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const catalogRef = useRef<HTMLDivElement>(null);
  const catalogInnerRef = useRef<HTMLDivElement>(null);

  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const xRef = useRef(0);

  const orderedCats = useMemo(() => [
    ...categories.map(c => c.name),
    ...[...new Set(products.map(p => p.category))].filter(c => !categories.some(cc => cc.name === c)),
  ].filter(cat => products.some(p => p.category === cat)), [categories, products]);

  const [active, setActive] = useState(() => orderedCats[0] || "");
  const items = products.filter(p => p.category === active);
  const media = CATEGORY_MEDIA[active];
  const featured = media ? items.find(p => p.name === media.anchor) || items[0] : null;
  const regular = featured ? items.filter(p => p.id !== featured.id) : items;

  function reveal() {
    setRevealed(true);
    setTimeout(() => setSplashGone(true), 550);
  }

  function maxSlide() {
    if (!trackRef.current || !knobRef.current) return 0;
    return Math.max(0, trackRef.current.clientWidth - knobRef.current.clientWidth - 8);
  }

  function updateKnob(x: number) {
    xRef.current = x;
    const max = maxSlide();
    if (knobRef.current) knobRef.current.style.transform = `translateX(${x}px)`;
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${max ? x / max : 0})`;
    if (labelRef.current) labelRef.current.style.opacity = String(1 - (max ? x / max : 0) * 1.3);
  }

  function onPointerDown(e: React.PointerEvent) {
    draggingRef.current = true;
    startXRef.current = e.clientX - xRef.current;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    updateKnob(Math.min(maxSlide(), Math.max(0, e.clientX - startXRef.current)));
  }
  function finishSlide() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const knob = knobRef.current, fill = fillRef.current, label = labelRef.current;
    if (!knob || !fill || !label) return;
    const max = maxSlide();
    if (xRef.current > max * 0.62) {
      animate(knob, { translateX: max, duration: 220, ease: "outExpo" });
      xRef.current = max;
      setTimeout(reveal, 160);
    } else {
      // único lugar con rebote real: es un gesto grande y poco frecuente,
      // a diferencia del riel de categorías (ahí un rebote se siente mal
      // porque se toca seguido — ver el efecto "outExpo" sin rebote abajo).
      const bounce = spring({ stiffness: 120, damping: 12 });
      animate(knob, { translateX: 0, duration: 650, ease: bounce });
      animate(fill, { scaleX: 0, duration: 500, ease: "outExpo" });
      animate(label, { opacity: 1, duration: 500, ease: "outExpo" });
      xRef.current = 0;
    }
  }
  function onTrackClick(e: React.MouseEvent) {
    const knob = knobRef.current;
    if (!knob || e.target === knob || draggingRef.current) return;
    const max = maxSlide();
    animate(knob, { translateX: max, duration: 220, ease: "outExpo" });
    xRef.current = max;
    setTimeout(reveal, 160);
  }

  // Entrada escalonada de la pantalla de bienvenida
  useEffect(() => {
    if (!rootRef.current) return;
    const els = rootRef.current.querySelectorAll("." + styles.rise);
    animate(els, {
      opacity: [0, 1],
      translateY: [16, 0],
      duration: 700,
      delay: stagger(90, { start: 60 }),
      ease: "outExpo",
    });
  }, []);

  // Indicador de categoría activa: se desliza a su posición SIN rebote
  // (con rebote se ve raro en un control que se toca seguido — a diferencia
  // del slider de arriba, que es un gesto grande y esporádico).
  useLayoutEffect(() => {
    const btn = btnRefs.current.get(active);
    const indicator = indicatorRef.current;
    if (!btn || !indicator) return;
    indicator.style.opacity = "1";
    animate(indicator, {
      translateY: btn.offsetTop,
      height: btn.offsetHeight,
      duration: 420,
      ease: "outExpo",
    });
  }, [active, switching]);

  // Entrada escalonada de las tarjetas del catálogo, en cada cambio de categoría
  useEffect(() => {
    if (switching || !catalogInnerRef.current) return;
    const els = catalogInnerRef.current.querySelectorAll("[data-anim-card]");
    animate(els, {
      opacity: [0, 1],
      translateY: [14, 0],
      duration: 480,
      delay: stagger(55, { start: 60 }),
      ease: "outExpo",
    });
  }, [active, switching]);

  function selectCategory(cat: string) {
    if (cat === active || switching) return;
    setSwitching(true);
    setTimeout(() => {
      setActive(cat);
      setSwitching(false);
      catalogRef.current?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }, 220);
  }

  return (
    <div ref={rootRef} className={styles.root}>
      {/* ── SPLASH ─────────────────────────────────────── */}
      {!splashGone && (
        <section className={`${styles.screen} ${styles.splash} ${revealed ? styles.screenHidden : ""}`}>
          <div className={styles.splashPhotoWrap}>
            <img
              src="/menu-hero.jpg"
              alt="Sánduche Cabane recién armado"
              className={styles.splashPhoto}
              ref={fadeInImgRef}
              onLoad={(e) => e.currentTarget.classList.add(styles.loaded)}
            />
          </div>
          <div className={styles.splashOverlay} />
          <div className={styles.splashContent}>
            <header className={`${styles.splashHead} ${styles.rise}`}>
              <div className={styles.brandLockup}>
                <div className={styles.brandLogo}>
                  <img src="/logo.jpg" alt="Cabane Sandwiches" />
                </div>
                <div className={styles.brandCopy}>
                  <strong>Cabane</strong>
                  <span>Sandwiches</span>
                </div>
              </div>
              <button className={styles.ghostBtn} aria-label="Información" onClick={() => setDrawerOpen(true)}>
                <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7h.01"/></svg>
              </button>
            </header>

            <div className={styles.heroCopy}>
              <div className={`${styles.kicker} ${styles.rise}`}>Menú visual</div>
              <h1 className={styles.rise}>Sánduches <em>con carácter.</em></h1>
              <p className={styles.rise}>Explorá el menú, conocé cada preparación y encontrá tu próximo favorito.</p>
            </div>

            <div className={`${styles.slideWrap} ${styles.rise}`}>
              <div ref={trackRef} className={styles.slideTrack} onClick={onTrackClick}>
                <div ref={fillRef} className={styles.slideFill} />
                <div ref={labelRef} className={styles.slideLabel}>Deslizá para ver el menú</div>
                <div
                  ref={knobRef}
                  className={styles.slideKnob}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={finishSlide}
                  onPointerCancel={finishSlide}
                  style={{ touchAction: "none" }}
                >
                  <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={2}><path d="M7 12h10M13 8l4 4-4 4"/></svg>
                </div>
              </div>
            </div>

            <div className={`${styles.quickLinks} ${styles.rise}`}>
              <button className={styles.quickLink} onClick={() => setDrawerOpen(true)}>
                <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.4"/></svg>
                Ubicación
              </button>
              <button className={styles.quickLink} onClick={() => setDrawerOpen(true)}>
                <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                Horarios
              </button>
              <button className={styles.quickLink} onClick={() => window.open("https://www.instagram.com/cabanesandwiches.ec/?hl=es", "_blank")}>
                <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor"/></svg>
                Instagram
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── MENÚ ───────────────────────────────────────── */}
      <section className={`${styles.screen} ${styles.menu} ${!revealed ? styles.screenHidden : ""}`}>
        <header className={styles.menuTop}>
          <div className={styles.menuBrand}>
            <div className={styles.menuLogo}><img src="/logo.jpg" alt="" /></div>
            <div className={styles.menuTitle}>
              <strong>Cabane Sandwiches</strong>
              <span>Menú del restaurante</span>
            </div>
          </div>
          <div className={styles.menuActions}>
            <button className={styles.roundBtn} aria-label="Inicio" onClick={() => setRevealed(false)}>
              <svg viewBox="0 0 24 24" width={19} height={19} fill="none" stroke="currentColor" strokeWidth={1.8}><path d="m4 11 8-7 8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1Z"/></svg>
            </button>
            <button className={styles.roundBtn} aria-label="Información" onClick={() => setDrawerOpen(true)}>
              <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M4 7h16M4 12h16M4 17h16"/></svg>
            </button>
          </div>
        </header>

        <div className={styles.menuBody}>
          <nav ref={railRef} className={styles.categoryRail}>
            <div ref={indicatorRef} className={styles.railIndicator} />
            {orderedCats.map(cat => (
              <button
                key={cat}
                ref={(el) => { if (el) btnRefs.current.set(cat, el); }}
                className={`${styles.categoryBtn} ${cat === active ? styles.categoryBtnActive : ""}`}
                onClick={() => selectCategory(cat)}
              >
                <CategoryIcon name={cat} />
                <span>{cat}</span>
              </button>
            ))}
          </nav>

          <section ref={catalogRef} className={styles.catalog}>
            <div ref={catalogInnerRef} style={{ opacity: switching ? 0 : 1, transform: switching ? "translateY(10px) scale(.985)" : "none", transition: "opacity .32s var(--ease,ease), transform .38s var(--ease,ease)" }}>
              <div className={styles.catalogHeading}>
                <div>
                  <h2>{active}</h2>
                  <p>Conocé nuestras preparaciones.</p>
                </div>
                <span className={styles.countPill}>{items.length} producto{items.length === 1 ? "" : "s"}</span>
              </div>

              {featured && (
                <article key={active} className={styles.featureCard} data-anim-card>
                  {media && (
                    <img
                      src={media.image}
                      alt={featured.name}
                      ref={fadeInImgRef}
                      onLoad={(e) => e.currentTarget.classList.add(styles.loaded)}
                    />
                  )}
                  <div className={styles.featureContent}>
                    <span className={styles.featureTag}>Recomendado</span>
                    <h3>{featured.name}</h3>
                    {featured.description && <p>{featured.description}</p>}
                    <div className={styles.featureBottom}>
                      <span className={styles.featurePrice}>{$(featured.price)}</span>
                    </div>
                  </div>
                </article>
              )}

              <div className={styles.productList}>
                {regular.map((p) => (
                  <div key={p.id} className={styles.productCard} data-anim-card>
                    <div className={styles.productCopy}>
                      <small>{p.category}</small>
                      <h3>{p.name}</h3>
                      {p.description && <p>{p.description}</p>}
                      <div className={styles.productMeta}>
                        <span className={styles.productPrice}>{$(p.price)}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {!items.length && <div className={styles.emptyState}>Sin productos en esta categoría por ahora.</div>}
              </div>
            </div>
          </section>
        </div>
      </section>

      {/* ── INFO DRAWER ────────────────────────────────── */}
      <div className={`${styles.drawerLayer} ${drawerOpen ? styles.drawerLayerOpen : ""}`} onClick={(e) => { if (e.target === e.currentTarget) setDrawerOpen(false); }}>
        <aside className={styles.drawer} aria-label="Información de Cabane">
          <div className={styles.drawerTop}>
            <div className={styles.brandCopy}><strong>Cabane</strong><span>Sandwiches</span></div>
            <button className={styles.closeBtn} aria-label="Cerrar" onClick={() => setDrawerOpen(false)}>
              <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.8}><path d="m6 6 12 12M18 6 6 18"/></svg>
            </button>
          </div>
          <h2>Visitanos y disfrutá.</h2>
          <p className={styles.drawerLead}>Un menú pensado para que explores cada preparación antes de ordenar en el local.</p>
          <div className={styles.infoBlock}><small>Ubicación</small><strong>Ibarra, Ecuador</strong></div>
          <div className={styles.infoBlock}><small>Horario</small><strong>Consultá el horario actualizado en Instagram.</strong></div>
          <div className={styles.infoBlock}><small>Cómo pedir</small><strong>Solicitá tu orden directamente al personal del restaurante.</strong></div>
          <div className={styles.socialRow}>
            <button className={styles.socialBtn} onClick={() => window.open("https://www.instagram.com/cabanesandwiches.ec/?hl=es", "_blank")}>
              <svg viewBox="0 0 24 24" width={17} height={17} fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor"/></svg>
              Instagram
            </button>
            <button className={styles.socialBtn} onClick={() => setDrawerOpen(false)}>
              <svg viewBox="0 0 24 24" width={17} height={17} fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M4 7h16M4 12h16M4 17h10"/></svg>
              Ver menú
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
