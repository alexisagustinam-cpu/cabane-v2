// Comprobante como imagen (PNG) o PDF para mandarlo por WhatsApp.
// Se dibuja en un canvas con ancho de ticket térmico de 80 mm (576 px a
// 203 dpi), así la misma imagen sirve para compartir y para imprimir.
// Es un comprobante interno de consumo: no reemplaza la factura del SRI.

export interface ReceiptLine { qty: number; name: string; amount: number }
export interface ReceiptData {
  orderNumber: number;
  table: string;
  customer?: string | null;
  date: Date;
  lines: ReceiptLine[];
  total: number;
  payments: { method: string; amount: number }[];
  paid: boolean;
}

const W = 576, PAD = 36;
const INK = "#2A1A1F", MUTED = "#6B5647", WINE = "#7A1E3A", GREEN = "#2F7D32", GOLD = "#7A560E";
const money = (n: number) => `$${n.toFixed(2)}`;
const METHOD: Record<string, string> = { efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia" };

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Corta un texto largo en varias líneas que entren en el ancho dado.
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(" "); const out: string[] = []; let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > max && cur) { out.push(cur); cur = w; } else cur = test;
  }
  if (cur) out.push(cur);
  return out;
}

export async function renderReceiptCanvas(d: ReceiptData): Promise<HTMLCanvasElement> {
  try { await document.fonts?.load("900 30px Nunito"); await document.fonts?.load("700 22px Nunito"); } catch { /* usa la fuente del sistema */ }
  const logo = await loadImage("/logo.jpg");
  const font = (w: number, s: number) => `${w} ${s}px Nunito, system-ui, sans-serif`;

  // Primer pase para medir el alto; segundo pase dibuja.
  const draw = (ctx: CanvasRenderingContext2D, paint: boolean): number => {
    let y = PAD;
    const text = (t: string, x: number, size: number, weight: number, color: string, align: CanvasTextAlign = "left") => {
      if (!paint) return;
      ctx.font = font(weight, size); ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(t, x, y);
    };
    const dashed = () => {
      if (paint) { ctx.strokeStyle = "#C4A882"; ctx.lineWidth = 2; ctx.setLineDash([8, 7]); ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke(); ctx.setLineDash([]); }
      y += 26;
    };

    if (logo) { if (paint) ctx.drawImage(logo, (W - 120) / 2, y, 120, 120); y += 140; }
    y += 30; text("Cabane Sandwiches", W / 2, 36, 900, INK, "center");
    y += 34; text(d.date.toLocaleString("es-EC", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }), W / 2, 22, 700, MUTED, "center");
    y += 36; text(`Pedido #${d.orderNumber}`, W / 2, 26, 900, INK, "center");
    y += 32; text(`${d.table}${d.customer ? ` · ${d.customer}` : ""}`, W / 2, 24, 800, INK, "center");
    y += 30; dashed();

    ctx.font = font(700, 24);
    for (const l of d.lines) {
      const rows = wrap(ctx, `${l.qty}× ${l.name}`, W - PAD * 2 - 130);
      rows.forEach((r, i) => {
        y += i === 0 ? 8 : 30;
        text(r, PAD, 24, 700, INK);
        if (i === 0) text(money(l.amount), W - PAD, 24, 800, INK, "right");
      });
      y += 22;
    }
    y += 6; dashed();
    y += 14; text("Total", PAD, 34, 900, INK); text(money(d.total), W - PAD, 34, 900, INK, "right");
    y += 22;
    for (const p of d.payments) { y += 30; text(`Pagado · ${METHOD[p.method] || p.method}`, PAD, 21, 700, MUTED); text(money(p.amount), W - PAD, 21, 700, MUTED, "right"); }
    const paidSum = d.payments.reduce((s, p) => s + p.amount, 0);
    y += 40;
    text(d.paid ? "PAGADO" : paidSum > 0 ? `Falta por pagar ${money(d.total - paidSum)}` : "Pendiente de pago", PAD, 24, 900, d.paid ? GREEN : GOLD);
    y += 26; dashed();
    y += 10; text("¡Gracias por su visita!", W / 2, 24, 800, WINE, "center");
    y += 30; text("Comprobante interno de consumo — no es factura", W / 2, 17, 700, MUTED, "center");
    return y + PAD;
  };

  const probe = document.createElement("canvas").getContext("2d")!;
  const h = draw(probe, false);
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = Math.ceil(h);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, W, canvas.height);
  ctx.textBaseline = "alphabetic";
  draw(ctx, true);
  return canvas;
}

export async function receiptPng(d: ReceiptData): Promise<File> {
  const canvas = await renderReceiptCanvas(d);
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error("No se pudo generar la imagen"))), "image/png"));
  return new File([blob], `comprobante-cabane-${d.orderNumber}.png`, { type: "image/png" });
}

export async function receiptPdf(d: ReceiptData): Promise<File> {
  const canvas = await renderReceiptCanvas(d);
  const { jsPDF } = await import("jspdf"); // se carga solo al pedir un PDF
  const wMm = 80, hMm = (canvas.height / canvas.width) * wMm;
  const pdf = new jsPDF({ unit: "mm", format: [wMm, hMm] });
  // JPEG con fondo blanco: el PDF pesa ~10 veces menos que con PNG.
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, wMm, hMm);
  return new File([pdf.output("blob")], `comprobante-cabane-${d.orderNumber}.pdf`, { type: "application/pdf" });
}

// Abre el menú de compartir del teléfono (WhatsApp, etc.). Si el navegador
// no lo permite (computadora o http), descarga el archivo.
export async function shareOrDownload(file: File, title: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title }); return "shared"; }
    catch (e) { if ((e as Error)?.name === "AbortError") return "cancelled"; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}
