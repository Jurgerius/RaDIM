import { Analytics } from "@vercel/analytics/react";

export default function RootLayout({ children }) {
  return (
    <html lang="cs">
      <body>
        {children}
        <Analytics /> {/* Zajišťuje, že Analytics se načte správně */}
      </body>
    </html>
  );
}