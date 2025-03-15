import { useEffect } from "react";

export default function Home() {
  useEffect(() => {
    window.location.href = "/index.html"; // Přesměrování na původní HTML
  }, []);

  return <p>Přesměrování...</p>;
}