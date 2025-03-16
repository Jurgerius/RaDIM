document.addEventListener("DOMContentLoaded", function () {
  console.log("✅ app.js byl načten správně.");

  // Přidání Vercel Analytics skriptu do stránky
  var script = document.createElement("script");
  script.src = "https://vercel.live/_analytics/script.js";
  script.async = true;

  script.onload = function () {
    console.log("✅ Vercel Analytics se načetl!");
    console.log("📊 Kontrola dostupnosti:", window.__VERCEL_ANALYTICS__);
  };

  script.onerror = function () {
    console.error("❌ Chyba při načítání Vercel Analytics!");
  };

  document.head.appendChild(script);
});