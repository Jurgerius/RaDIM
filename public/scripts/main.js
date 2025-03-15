const i18nElements = {
  text: document.querySelectorAll("[data-i18n]"),
  placeholder: document.querySelectorAll("[data-i18n-placeholder]"),
  value: document.querySelectorAll("[data-i18n-value]")
};

const hamburger = document.querySelector(".hamburger");
const navLinks = document.querySelector(".nav-links");

const header = document.querySelector("header");
let lastScrollY = 0;
let ticking = false;

i18next
  .use(i18nextHttpBackend) // Použij globální proměnnou místo importu
  .init({
    lng: localStorage.getItem('i18nextLng') || 'cs', // použije uložený jazyk nebo výchozí cs
    fallbackLng: 'en',
    debug: true,
    interpolation: {
      escapeValue: false
    },
    backend: {
      loadPath: '/locales/{{lng}}/translation.json',
    }
  }, function(err, t) {
    if (err) return console.error(err);
    updateContent();
  });


function updateContent() {
  i18nElements.text.forEach(el => {
    const key = el.getAttribute("data-i18n");
    el.innerHTML = i18next.t(key);  // Bezpečnější než innerHTML
  });

  i18nElements.placeholder.forEach(el => {
    const key = el.getAttribute("data-i18n-placeholder");
    el.setAttribute("placeholder", i18next.t(key));
  });

  i18nElements.value.forEach(el => {
    const key = el.getAttribute("data-i18n-value");
    el.setAttribute("value", i18next.t(key));
  });
}

function handleScroll() {
  if (!ticking) {
    requestAnimationFrame(() => {
      if (window.scrollY > 50 && lastScrollY <= 50) {
        header.classList.add("scrolled");
      } else if (window.scrollY <= 50 && lastScrollY > 50) {
        header.classList.remove("scrolled");
      }
      lastScrollY = window.scrollY;
      ticking = false;
    });
    ticking = true;
  }
}
  

// Přepínače jazyků
document.getElementById('btn-cs').addEventListener('click', () => {
  i18next.changeLanguage('cs', updateContent);
  localStorage.setItem('i18nextLng', 'cs');
});
document.getElementById('btn-en').addEventListener('click', () => {
  i18next.changeLanguage('en', updateContent);
  localStorage.setItem('i18nextLng', 'en');
});
document.getElementById('btn-de').addEventListener('click', () => {
  i18next.changeLanguage('de', updateContent);
  localStorage.setItem('i18nextLng', 'de');
});


window.toggleMenu = function() {
  hamburger.classList.toggle("active");
  navLinks.classList.toggle("open");
};


window.addEventListener("scroll", handleScroll);
