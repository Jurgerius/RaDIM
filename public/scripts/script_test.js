// ===== Konfigurace a pomocné konstanty =====

// Definice směrových charakteristik (inspirováno script_app.js)
const patterns = {
  omni: { audio1: 0, audio2: 0, polarity: false },
  cardioid: { audio1: 0, audio2: -Infinity, polarity: false },
  wide_cardioid: { audio1: 0, audio2: -10, polarity: false },
  super_cardioid: { audio1: 0, audio2: -10, polarity: true },
  figure_8: { audio1: 0, audio2: 0, polarity: true }
};

// Mapování pro směrovou charakteristiku – české názvy
const patternDisplayNames = {
  omni: "Koule",
  cardioid: "Ledvina",
  wide_cardioid: "Široká ledvina",
  super_cardioid: "Úzká ledvina",
  figure_8: "Osmička"
};

// Mapování pro prostor – české názvy
const spaceDisplayNames = {
  studio: "Studio",
  church: "Kostel",
  anechoic_chamber: "Mrtvá komora",
  concert_hall: "Koncertní sál"
};
  
// Převod z dB na gain
function dBToGain(dB) {
  return dB === -Infinity ? 0 : Math.pow(10, dB / 20);
}

// ===== Globální proměnné =====
let audioContext = new (window.AudioContext || window.webkitAudioContext)();

let testAudio = {
  A: { audioBuffers: [], audioSources: [], gainNodes: [] },
  B: { audioBuffers: [], audioSources: [], gainNodes: [] }
};

let lastGainValues = { A: [], B: [] };

let currentActiveTest = 'A';
let isPlaying = false;
let startTime = 0;
let pausedTime = 0;
let audioSources = []; // Pole pro aktuální audio zdroje
let gainNodes = [];    // Pole pro odpovídající gainNodes
let isLoopEnabled = false;

// Podmínky testu – budou naplněny až po potvrzení nastavení
let conditionA = {};
let conditionB = {};
  
  
// ===== Funkce pro načítání dat prostorů =====
async function fetchSpaces() {
  try {
    const response = await fetch('/sources.json');
    const data = await response.json();
    if (!data.spaces || !Array.isArray(data.spaces)) {
      throw new Error('Data spaces nejsou pole nebo nejsou definována.');
    }
    return data.spaces;
  } catch (error) {
    console.error('Chyba při načítání JSON souboru:', error);
    return [];
  }
}
  
// ===== Funkce pro generování cest k audio souborům =====
function generateTestFilePaths(condition) {
  // Předpokládáme cestu: /AudioFiles/{space}-{instrument}-{technique}-{distance}{front/back}.wav
  const basePath = 'https://pub-38ebab133d1e4632ae5219e6e0f6cdd0.r2.dev/';
  const distance = Number(condition.distance);
  // V testu potřebujeme pouze jednu dvojici souborů (front a back) pro zadanou vzdálenost
  const filePaths = [
    `${basePath}${condition.space}-${condition.instrument}-${condition.technique}-${distance}front.wav`,
    `${basePath}${condition.space}-${condition.instrument}-${condition.technique}-${distance}back.wav`
  ];
  return filePaths;
}
  
  // ===== Funkce pro naplnění dropdownů fixních parametrů =====
  
  function populateFixedPatternSelect() {
    const select = document.getElementById("fixedPatternSelect");
    select.innerHTML = ""; // Vyčistit předchozí obsah
    
    const patternKeys = ["omni", "cardioid", "wide_cardioid", "supercardioid", "figure_8"];
    
    patternKeys.forEach(key => {
      const option = document.createElement("option");
      option.value = key;
      // Voláme překlad s defaultValue, který nastaví přímo požadovaný název, pokud by překlad nebyl nalezen.
      option.textContent = i18next.t("test.fixed_pattern_options." + key, { defaultValue: key });
      select.appendChild(option);
    });
  }
  
  function populateFixedSpaceSelect() {
    const select = document.getElementById("fixedSpaceSelect");
    select.innerHTML = "";
    
    const spaceKeys = ["studio", "church", "anechoic_chamber", "concert_hall"];
    
    spaceKeys.forEach(key => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = i18next.t("test.fixed_space_options." + key, { defaultValue: key });
      select.appendChild(option);
    });
  }
  
  // ===== Dynamický update výběru technik =====
  
  async function updateTechniqueSelect() {
    console.log('Aktualizuji výběr technik...');
    const instrumentSelect = document.getElementById('instrumentSelect');
    const techniqueSelect = document.getElementById('techniqueSelect');
    const selectedInstrument = instrumentSelect.value;
    if (!selectedInstrument) return;
  
    try {
      const spaces = await fetchSpaces();
      // Získáme unikátní techniky pro vybraný nástroj napříč prostory
      const uniqueTechniques = new Set();
      spaces.forEach(space => {
        if (space.instruments && Array.isArray(space.instruments)) {
          const inst = space.instruments.find(i => i.name === selectedInstrument);
          if (inst && Array.isArray(inst.techniques)) {
            inst.techniques.forEach(tech => uniqueTechniques.add(tech));
          }
        }
      });
  
      // Vyčistíme staré možnosti a přidáme nové
      techniqueSelect.innerHTML = '';
      if (uniqueTechniques.size > 0) {
        uniqueTechniques.forEach(tech => {
          const option = document.createElement('option');
          option.value = tech;
          // Nahrazení podtržítek mezerami a první písmeno velké
          option.textContent = tech.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
          techniqueSelect.appendChild(option);
        });
      } else {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Žádné techniky dostupné';
        techniqueSelect.appendChild(option);
      }
    } catch (error) {
      console.error('Chyba při aktualizaci technik:', error);
    }
  }
  
  // ===== Funkce pro nastavení viditelnosti fixních parametrů =====
  
  function updateFixedParamsDisplay() {
    const vary = document.getElementById('varyParameterSelect').value;
    const fixedDistanceDiv = document.getElementById('fixedDistanceDiv');
    const fixedPatternDiv = document.getElementById('fixedPatternDiv');
    const fixedSpaceDiv = document.getElementById('fixedSpaceDiv');
  
    // Skrýt všechny
    fixedDistanceDiv.style.display = 'none';
    fixedPatternDiv.style.display = 'none';
    fixedSpaceDiv.style.display = 'none';
  
    if (vary === 'distance') {
      fixedPatternDiv.style.display = 'block';
      fixedSpaceDiv.style.display = 'block';
    } else if (vary === 'pattern') {
      fixedDistanceDiv.style.display = 'block';
      fixedSpaceDiv.style.display = 'block';
    } else if (vary === 'space') {
      fixedDistanceDiv.style.display = 'block';
      fixedPatternDiv.style.display = 'block';
    }
  }
  
  // ===== Funkce pro přehrávání a nastavení gainů =====
  
  function startTestAudio(startFrom = 0) {
    console.log('[startTestAudio] Zahajuji přehrávání od:', startFrom);
    stopTestAudio(); // Zastavíme předchozí přehrávání
    // Pokud máme načtený alespoň jeden buffer (předpokládáme, že u aktivní ukázky jsou obě součásti stejné)
    if (testAudio.A.audioBuffers && testAudio.A.audioBuffers.length > 0) {
      const duration = testAudio.A.audioBuffers[0].duration;
      if (startFrom >= duration) {
        console.log(`[startTestAudio] startFrom (${startFrom}) >= duration (${duration}). Resetuji na začátek.`);
        startFrom = 0;
      }
    }
    startTime = audioContext.currentTime - startFrom;
  
    // Pro každou ukázku (A a B) vytvoříme zdroje a gainNodes
    ['A', 'B'].forEach(condKey => {
      audioSources = []; // Pro zjednodušení v této verzi budeme mít společné pole (můžete rozdělit pro A a B, pokud potřebujete)
      gainNodes = [];
      let buffers = testAudio[condKey].audioBuffers;
      if (!buffers || buffers.length === 0) {
        console.error(`[startTestAudio] Žádné audio buffery pro ${condKey}.`);
        return;
      }
      buffers.forEach((buffer, i) => {
        if (!buffer) return;
        const gainNode = audioContext.createGain();
        // Nastavíme počáteční gain na 0 (tedy ztlumené)
        gainNode.gain.value = 0;
        gainNode.connect(audioContext.destination);
        
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.loop = isLoopEnabled;  // nastavíme looping podle globálního příznaku
        source.connect(gainNode);
        source.start(0, startFrom);
        
        // Přidáme event listener, který zaznamená ukončení přehrávání
        source.onended = () => {
          console.log(`[startTestAudio] Audio zdroj skončil pro ${condKey}, index ${i}`);
          // Pokud je přehrávání dokončeno, nastavíme pausedTime na 0 a isPlaying na false
          isPlaying = false;
          pausedTime = 0;
        };
        
        // Ukládáme zdroje a gainNodes do objektu testAudio
        testAudio[condKey].audioSources.push(source);
        testAudio[condKey].gainNodes.push(gainNode);
      });
      console.log(`GainNodes pro ${condKey}: ${testAudio[condKey].gainNodes.length}`);
    });
    
    isPlaying = true;
    console.log('[startTestAudio] Přehrávání spuštěno.');
    // Po spuštění nezavoláme setAudioLevels – to se spustí při kliknutí na test-box.
  }
  
  // Zastavení přehrávání
  function stopTestAudio() {
    console.log('Zastavuji všechna audio...');
    ['A', 'B'].forEach(condKey => {
      testAudio[condKey].audioSources.forEach(source => {
        try {
          source.stop();
        } catch (e) {
          console.error(`Chyba při zastavení zdroje pro ${condKey}:`, e.message);
        }
      });
      testAudio[condKey].audioSources = [];
      testAudio[condKey].gainNodes.forEach(gainNode => gainNode.disconnect());
      testAudio[condKey].gainNodes = [];
    });
    isPlaying = false;
    pausedTime = 0;
    updateButtonState('play', false, 'active');
    console.log('Audio zastaveno.');
  }


  function toggleLoop() {
    isLoopEnabled = !isLoopEnabled;
    console.log(`Looping ${isLoopEnabled ? 'enabled' : 'disabled'}.`);
    updateButtonState('toggleLoop', isLoopEnabled, 'loop-active');
    if (isPlaying) {
      ['A', 'B'].forEach(condKey => {
        testAudio[condKey].audioSources.forEach(source => {
          source.loop = isLoopEnabled;
        });
      });
    }
  }
  
  // Okamžitá změna hlasitosti (bez přechodu)
  function updateActiveTestGain() {
    ['A', 'B'].forEach(condKey => {
      testAudio[condKey].gainNodes.forEach(gainNode => {
        let targetGain = (condKey === currentActiveTest) ? 1 : 0;
        // Nastavíme hodnotu přímo – okamžitě
        gainNode.gain.value = targetGain;
      });
    });
  }
  
  // Aktualizace vizuálního zvýraznění aktivní volby
  function updateActiveHighlight() {
    document.getElementById('testA').classList.toggle('active', currentActiveTest === 'A');
    document.getElementById('testB').classList.toggle('active', currentActiveTest === 'B');
  }

  // ===== Funkce pro aplikaci nových nastavení při potvrzení =====
  
  async function applySettings() {
    // Přečteme aktuální hodnoty z nastavení
    const instrument = document.getElementById('instrumentSelect').value;
    const technique = document.getElementById('techniqueSelect').value;
    const vary = document.getElementById('varyParameterSelect').value;
    const spaces = await fetchSpaces();
  
    if (vary === 'distance') {
      const fixedPattern = document.getElementById('fixedPatternSelect').value;
      const fixedSpace = document.getElementById('fixedSpaceSelect').value;
      const availableDistances = [1, 2, 3, 4];
      const [randomDistanceA, randomDistanceB] = getRandomDistinctValues(availableDistances, 2);
      conditionA = { instrument, technique, pattern: fixedPattern, space: fixedSpace, distance: randomDistanceA };
      conditionB = { instrument, technique, pattern: fixedPattern, space: fixedSpace, distance: randomDistanceB };
    } else if (vary === 'pattern') {
      const fixedDistance = document.getElementById('fixedDistanceSelect').value;
      const fixedSpace = document.getElementById('fixedSpaceSelect').value;
      const availablePatterns = Object.keys(patterns);
      const [randomPatternA, randomPatternB] = getRandomDistinctValues(availablePatterns, 2);
      conditionA = { instrument, technique, distance: fixedDistance, space: fixedSpace, pattern: randomPatternA };
      conditionB = { instrument, technique, distance: fixedDistance, space: fixedSpace, pattern: randomPatternB };
      console.log('ConditionA:', conditionA);
      console.log('ConditionB:', conditionB);
    } else if (vary === 'space') {
      const fixedDistance = document.getElementById('fixedDistanceSelect').value;
      const fixedPattern = document.getElementById('fixedPatternSelect').value;
      const availableSpaces = spaces.map(s => s.name);
      if (availableSpaces.length < 2) {
        conditionA = { instrument, technique, distance: fixedDistance, pattern: fixedPattern, space: availableSpaces[0] || 'studio' };
        conditionB = { instrument, technique, distance: fixedDistance, pattern: fixedPattern, space: availableSpaces[0] || 'room' };
      } else {
        const [randomSpaceA, randomSpaceB] = getRandomDistinctValues(availableSpaces, 2);
        conditionA = { instrument, technique, distance: fixedDistance, pattern: fixedPattern, space: randomSpaceA };
        conditionB = { instrument, technique, distance: fixedDistance, pattern: fixedPattern, space: randomSpaceB };
      }
    }
    console.log('Nové podmínky testu:', conditionA, conditionB);
  
    // Zastavíme předchozí přehrávání a načteme nové audio buffery
    stopTestAudio();
    await loadTestAudio('A', conditionA);
    await loadTestAudio('B', conditionB);
    pausedTime = 0;
    
    // Resetujeme aktivní ukázku, aby při prvním kliknutí na box se aktualizovaly gainNodes
    currentActiveTest = "";
    updateActiveTestGain();
    updateActiveHighlight();
    
    // Pozastavíme audioContext, takže i když jsou zdroje spuštěny, zvuk nebude slyšet.
    await audioContext.suspend();
  }
  
  // ===== DOMContentLoaded a event listenery =====
  
  document.addEventListener('DOMContentLoaded', async () => {
    // Zajistíme, že i18next je inicializován (můžete počkat, pokud je to potřeba)
    await i18next.init({
      lng: localStorage.getItem('i18nextLng') || 'cs',
      fallbackLng: 'en',
      debug: true,
      backend: {
        loadPath: '/locales/{{lng}}/translation.json'
      },
      interpolation: {
        escapeValue: false
      }
    });
    // Po načtení stránky aktualizujeme dropdown technik
    await updateTechniqueSelect();
    // Zobrazíme fixní parametry dle defaultní volby "Co chci hádat"
    updateFixedParamsDisplay();
    // Naplníme dropdowny pro fixní parametry (směrová charakteristika a prostor) pomocí mapování
    populateFixedPatternSelect();
    populateFixedSpaceSelect();
  
    // Při změně nástroje aktualizujeme jen seznam technik
    document.getElementById('instrumentSelect').addEventListener('change', async () => {
      await updateTechniqueSelect();
    });
  
    // Změny v nastaveních (např. "Co chci hádat") upravují pouze zobrazení fixních parametrů
    document.getElementById('varyParameterSelect').addEventListener('change', () => {
      updateFixedParamsDisplay();
    });
  
    // Potvrzení nastavení – při kliknutí se nová nastavení aplikují a výsledky se vymažou
    document.getElementById('confirmSettings').addEventListener('click', async () => {
      document.getElementById('results').innerHTML = "";
      await applySettings();
      // Po načtení nových nastavení deaktivujeme aktuální ukázku:
      currentActiveTest = "A"; // žádná ukázka není aktivní
      updateActiveTestGain(); // tím se nastaví gain na 0 pro obě ukázky
      updateActiveHighlight(); // vizuálně se zvýrazní, že nic není aktivní
      // Zobrazíme testovací oblast, aby byly viditelné volby A/B
      document.getElementById('testArea').style.display = 'block';
    });
  
    // Ovládací prvky přehrávání
    document.getElementById('play').addEventListener('click', async () => {
      if (!isPlaying) {
        console.log('[Play] Spouštím od:', pausedTime || 0);
        startTestAudio(pausedTime || 0);  // 🔥 Ujisti se, že se předává `pausedTime`
        updateActiveTestGain();
        updateButtonState('play', true, 'active');
        updateButtonState('pause', false, 'paused');
      }
    });

    document.getElementById('stop').addEventListener('click', () => {
      stopTestAudio();
      updateButtonState('play', false, 'active');
      updateButtonState('pause', false, 'paused');
    });

    document.getElementById('toggleLoop').addEventListener('click', () => {
      toggleLoop();
      updateButtonState('toggleLoop', isLoopEnabled, 'loop-active');
    });
  
    // Nastavení event listenerů pro tlačítka "Vybrat A" a "Vybrat B"
    document.querySelectorAll('.test-box').forEach(box => {
      box.addEventListener('click', async (e) => {
        const boxId = e.currentTarget.id; // např. "testA" nebo "testB"
        const newActive = boxId.replace('test', ''); // získáme "A" nebo "B"
        
        // Jednoduše aktualizujeme aktuální test-box bez restartování přehrávání
        currentActiveTest = newActive;
        
        if (audioContext.state !== "running") {
          await audioContext.resume();
        }
        // Aktualizace gainů a vizuálního zvýraznění aktivního test-boxu
        setAudioLevels();
        updateActiveHighlight();
      });
    });
  
    // Přidáme event listener pro tlačítko "Zobrazit výsledky"
    document.getElementById('showResults').addEventListener('click', showResults);

    document.getElementById("results").innerHTML = i18next.t("test.results_message");
  });
  
  // ===== Načítání audio souborů pro danou podmínku =====
  
  async function loadTestAudio(conditionKey, condition) {
    let filePaths = generateTestFilePaths(condition);
    
    const fetchPromises = filePaths.map(async (file) => {
      try {
        const response = await fetch(file);
        if (!response.ok) {
          console.warn(`[loadTestAudio] Soubor nenalezen: ${file}`);
          return null;
        }
        const arrayBuffer = await response.arrayBuffer();
        return await audioContext.decodeAudioData(arrayBuffer);
      } catch (error) {
        console.error(`[loadTestAudio] Chyba při načítání ${file}:`, error.message);
        return null;
      }
    });
  
    const results = await Promise.allSettled(fetchPromises);
    testAudio[conditionKey].audioBuffers = results.map(result => result.status === "fulfilled" ? result.value : null);
  }
  
  // ===== Pomocná funkce pro náhodný výběr unikátních hodnot =====
  
  function getRandomDistinctValues(arr, count) {
    let result = [];
    let copy = arr.slice();
    for (let i = 0; i < count && copy.length > 0; i++) {
      let index = Math.floor(Math.random() * copy.length);
      result.push(copy[index]);
      copy.splice(index, 1);
    }
    return result;
  }
  
  function showResults() {
    // Zjistíme, jaký parametr hádáme ("distance", "pattern" nebo "space")
    const vary = document.getElementById('varyParameterSelect').value;
    
    // Získáme překlad názvu parametru z JSON (např. "Vzdálenost", "Směrová charakteristika", "Prostor")
    const parameterLabel = i18next.t("test.results.parameter." + vary);
    
    // Získáme hodnoty z conditionA a conditionB
    const resultA = conditionA[vary];
    const resultB = conditionB[vary];
    
    // Použijeme překladové klíče s interpolací pro zobrazení textu
    const labelAudioA = i18next.t("test.results.label_audioA", { parameter: parameterLabel });
    const labelAudioB = i18next.t("test.results.label_audioB", { parameter: parameterLabel });
    
    // Zobrazíme výsledky
    const resultsDiv = document.getElementById('results');
    if (resultsDiv) {
      resultsDiv.innerHTML = `<p><strong>${labelAudioA}</strong> ${resultA}</p>
                              <p><strong>${labelAudioB}</strong> ${resultB}</p>`;
    }
  }

  function setAudioLevels() {
    ['A', 'B'].forEach(condKey => {
      testAudio[condKey].gainNodes.forEach((gainNode, index) => {
        const isFront = (index === 0);
        let targetGain = 0;
  
        if (condKey === currentActiveTest) {
          let currentPattern = conditionA.pattern;
          let patternObj = patterns[currentPattern];
  
          if (patternObj) {
            targetGain = isFront 
              ? dBToGain(patternObj.audio1)
              : dBToGain(patternObj.audio2);
            if (!isFront && patternObj.polarity) {
              targetGain = -targetGain;
            }
          }
        }
  
        if (lastGainValues[condKey][index] !== targetGain) {
          const now = audioContext.currentTime;
          gainNode.gain.cancelScheduledValues(now);
          gainNode.gain.setValueAtTime(gainNode.gain.value, now);
          gainNode.gain.setTargetAtTime(targetGain, now, 0.005);
          lastGainValues[condKey][index] = targetGain;
        }
      });
    });
  }

function updateButtonState(buttonId, isActive, activeClass) {
  const button = document.getElementById(buttonId);
  if (!button) return; // ✅ Pokud prvek neexistuje, funkce se ukončí
  if (isActive) {
      button.classList.add(activeClass);
  } else {
      button.classList.remove(activeClass);
  }
}
