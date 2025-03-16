import { useEffect } from "react";

export default function App() {
  useEffect(() => {
    console.log("✅ useEffect byl spuštěn.");
    console.log("🌐 Aktuální URL:", window.location.href);

    // Přidání Vercel Analytics skriptu do stránky
    const script = document.createElement("script");
    script.src = "https://vercel.live/_analytics/script.js";
    script.async = true;

    script.onload = () => {
      console.log("✅ Vercel Analytics se načetl!");
      console.log("📊 Kontrola dostupnosti:", window.__VERCEL_ANALYTICS__);
    };

    script.onerror = () => console.error("❌ Chyba při načítání Vercel Analytics!");

    document.head.appendChild(script);

    // Počkej 1 sekundu, pak přesměruj na index.html (aby se Analytics stihl načíst)
    setTimeout(() => {
      console.log("➡️ Přesměrování na index.html");
      window.location.replace("/index.html");
    }, 1000);
  }, []);

  return <p>Přesměrování...</p>;
}