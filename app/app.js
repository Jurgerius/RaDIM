import { useEffect } from "react";
import { Analytics } from "@vercel/analytics/react"

export default function App() {
  // Ruční načtení Vercel Analytics
  useEffect(() => {
    console.log("✅ useEffect byl spuštěn.");
    console.log("🌐 Aktuální URL:", window.location.href);
    
    // Přidání Vercel Analytics skriptu do stránky
    const script = document.createElement("script");
    script.src = "https://vercel.live/_analytics/script.js";
    script.async = true;
    script.onload = () => console.log("✅ Vercel Analytics se načetl!");
    script.onerror = () => console.error("❌ Chyba při načítání Vercel Analytics!");
    
    document.head.appendChild(script);
    
    // Přesměrování na index.html
    window.location.replace("/index.html"); 
  }, []);

  return <p>Přesměrování...</p>;
}