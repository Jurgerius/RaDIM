import { useEffect } from "react";

export default function App() {
  useEffect(() => {
    window.location.replace("/index.html"); // Přesměrování na původní statickou stránku
  }, []);

  return <p>Přesměrování...</p>;
}