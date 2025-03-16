import { Analytics } from "@vercel/analytics/react";

export default function RootLayout({ children }) {
  console.log("✅ layout.js se načetl!");

  return (
    <html lang="cs">
      <body>
        {children}
        <Analytics /> {/* Zajišťuje, že Analytics se načte správně */}
      </body>
    </html>
  );
}