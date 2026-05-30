import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cabane Sandwiches · Sistema de Pedidos",
  description: "Sistema de pedidos para Cabane Sandwiches",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
