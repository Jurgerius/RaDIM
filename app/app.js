import { useEffect } from "react";
import { Analytics } from "@vercel/analytics/react";

export default function App() {
  useEffect(() => {
    console.log("🔍 Vercel Analytics aktivní?");
    window.location.replace("/index.html"); // Přesměrování na původní statickou stránku
  }, []);

  return (
    <>
      <p>Přesměrování...</p>
      <Analytics /> {/* Přidání Vercel Analytics */}
    </>
  );
}