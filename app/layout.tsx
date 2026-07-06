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
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="theme-color" content="#2A1A1F" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Cabane" />
      </head>
      <body style={{ margin: 0, background: "#EDE0CE", fontFamily: "'Nunito', system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
