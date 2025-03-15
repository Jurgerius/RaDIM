import { useEffect } from "react";

export default function Home() {
  useEffect(() => {
    window.location.replace("/index.html"); // Přesměrování na původní statickou stránku
  }, []);

  return <p>Přesměrování...</p>;
}