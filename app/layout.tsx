import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cabane Sandwiches · Sistema de Pedidos",
  description: "Sistema de pedidos para Cabane Sandwiches",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, background: "#FFF4E3", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
