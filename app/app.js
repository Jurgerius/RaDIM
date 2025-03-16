import { useEffect } from "react";
import { Analytics } from "@vercel/analytics/react";

export default function App() {
  useEffect(() => {
    console.log("✅ useEffect byl spuštěn.");
    console.log("🌐 Aktuální URL:", window.location.href);
    alert("🔍 Vercel Analytics aktivní?"); // Zobrazí popup okno
    console.log("🔍 Vercel Analytics aktivní?");
    window.location.replace("/index.html"); 
  }, []);

  return (
    <>
      <p>Přesměrování...</p>
      <Analytics />
    </>
  );
}