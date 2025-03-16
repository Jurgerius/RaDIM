// Předdefinované směrové charakteristiky
const patterns = {
    omni: { audio1: 0, audio2: 0, polarity: false },  
    cardioid: { audio1: 0, audio2: -Infinity, polarity: false },
    wide_cardioid: { audio1: 0, audio2: -10, polarity: false }, // Široká ledvina, 2. audio o 10 dB slabší
    super_cardioid: { audio1: 0, audio2: -10, polarity: true }, // super cardioid, 2. audio o 10 dB slabší a otočená polarita
    figure_8: { audio1: 0, audio2: 0, polarity: true } // Osmička, stejná hlasitost, ale 2. audio má otočenou polaritu
};

const svgPaths = {
    clarinet: '/svg/clar_setup.svg',
    violin: '/svg/violin_setup.svg',
    violoncello: '/svg/vcl_setup.svg',
    snare: '/svg/snare_setup.svg',
    voice: '/svg/voc_setup.svg'
};

const waveSurferInstances = {}; // Každý prostor bude mít svou instanci

const DEBUG_MODE = false; // Přepnutím na true zobrazíš logy

const RegionsPlugin = WaveSurfer.Regions;

let audioPairs = []; 
let audioContext = new (window.AudioContext || window.webkitAudioContext)();
let audioBuffers = [];  // Pole dekódovaných audií
let sources = [];       // Pole AudioBufferSourceNode
let audioSources = [];  
let gainNodes = [];

let currentSpace = 'studio';
let spaceMapping = {}; // Globální proměnná pro mapování prostorů

let currentInstrument = 'violoncello';
let currentTechnique = 'detache'
let currentPattern = patterns.omni;

let isLoaded = false; // Indikátor, zda jsou soubory načteny
let isLoading = false; // Indikátor, zda právě probíhá načítání

/* let wavesurfer; // Globální proměnná pro WaveSurfer.js */
let isPlaying = false; // Globální proměnná pro sledování přehrávání
let isLoopEnabled = false; // Stav smyčkování (zapnuto/vypnuto)

let loopRegion = null;
// Přidáme flag pro detekci, zda už smyčka běží
let isLooping = false;

let startTime = 0;
let pausedTime = 0;
let lastCursorTime = 0; // Globální proměnná pro sledování aktuálního času přehrávání



// Načtení JSON souboru pro načtení Audio Files
async function fetchSpaces() {
    try {
        const response = await fetch('/sources.json'); // Cesta k JSON souboru
        const data = await response.json();
        logDebug('Načtená data prostorů:', data);

        if (!data.spaces || !Array.isArray(data.spaces)) {
            throw new Error('Data spaces nejsou pole nebo nejsou definována.');
        }

        // Dynamické vytvoření mapování prostorů
        spaceMapping = data.spaces.reduce((map, space, index) => {
            map[space.name] = index; // Přiřazení názvu prostoru k jeho indexu

            logDebug('[fetchSpaces] spaceMapping před inicializací:', spaceMapping);

            return map;
        }, {});

        return data.spaces;
    } catch (error) {
        console.error('Chyba při načítání JSON souboru:', error);
        return [];
    }
}

function generateFilePaths(spaces, instrument, technique) {
    logDebug('Spaces:', spaces);
    logDebug('Instrument:', instrument);
    logDebug('Technique:', technique);

    if (!Array.isArray(spaces)) {
        console.error('Očekávám pole, ale dostal jsem:', spaces);
        return [];
    }

    const spacesWithoutName = spaces.filter(space => !space.name);
    if (spacesWithoutName.length > 0) {
        console.error('Některé prostory nemají vlastnost "name".', spacesWithoutName);
        return [];
    }

    const basePath = 'https://pub-38ebab133d1e4632ae5219e6e0f6cdd0.r2.dev/';
    const filePaths = spaces.flatMap(space =>
        Array.from({ length: 4 }, (_, i) => {
            const index = i + 1;
            return [
                `${basePath}${space.name}-${instrument}-${technique}-${index}front.flac`,
                `${basePath}${space.name}-${instrument}-${technique}-${index}back.flac`
            ];
        }).flat()
    );

    logDebug('Generované cesty k souborům:', filePaths);
    return filePaths;
}

/* ======================================
   Funkce pro načtení/aktualizaci dat
====================================== */

async function applyInstrumentAndTechniqueSettings(instrument, technique) {
    logDebug('Aplikuji nastavení nástroje a techniky...');

    const selectedInstrument = instrument || document.getElementById('instrumentSelect')?.value || 'violoncello';
    const selectedTechnique = technique || document.getElementById('techniqueSelect')?.value || 'detache';


    if (!selectedInstrument || !selectedTechnique) {
        console.error('Nástroj nebo technika nebyla vybrána.');
        return;
    }

    currentInstrument = selectedInstrument;
    currentTechnique = selectedTechnique;

    try {
        const spaces = await fetchSpaces();
        if (!Array.isArray(spaces) || spaces.length === 0) {
            console.error('Nebyla nalezena žádná data prostorů:', spaces);
            return;
        }

        // Reset dat a načtení audio souborů
        resetAudioData();
        audioPairs = generateFilePaths(spaces, selectedInstrument, selectedTechnique);

        await loadAudioFiles();
        logDebug('Všechna audio soubory byla úspěšně načtena.');

        if (spaces && audioPairs.length > 0) {
            initializeWaveformsForSpaces(spaces, audioPairs);
        } else {
            console.error('Žádné prostory nebo audio soubory nejsou k dispozici pro inicializaci waveform.');
        }

    } catch (error) {
        console.error('Chyba při načítání dat prostorů nebo souborů:', error);
    }

    const svgUrl = svgPaths[currentInstrument];
    if (svgUrl) {
        loadSvgFile(svgUrl, () => {
            logDebug(`Načteno SVG: ${svgUrl}`);
            positionSlider(); 
        });
    } else {
        console.warn('Nebyla nalezena odpovídající cesta pro SVG:', currentInstrument);
    }


    logDebug('Aktuální audioPairs:', audioPairs);
}

// Aplikovat směrovou charakteristiku
function applyPatternSettings(selectedPattern) {
    if (!selectedPattern || !patterns[selectedPattern]) {
        console.error(`Směrová charakteristika "${selectedPattern}" není definována.`);
        return;
    }

    currentPattern = patterns[selectedPattern];

    updateSliderThumbImage(selectedPattern); // Změna obrázku na posuvníku
    setAudioLevels('distanceSlider'); // Aplikace úrovní audia
    logDebug(`Aplikována směrová charakteristika: ${selectedPattern}`);
}

function selectSpace(selectedSpace) {
    logDebug(`[selectSpace] Vybrán prostor: ${selectedSpace}`);
    currentSpace = selectedSpace; // Aktualizujeme aktuální prostor

    // Znovu aplikujeme hlasitost na základě aktuálního prostoru a slideru
    setAudioLevels('distanceSlider');

    // 2) Odeberete zvýraznění ze všech waveform divů
    const allWaveforms = document.querySelectorAll('.waveform');
    allWaveforms.forEach(wf => {
        wf.classList.remove('waveform-highlight');
    });

    // 3) Přidáte zvýraznění jen tomu, co odpovídá vybranému prostoru
    const activeWaveform = document.getElementById(`waveform-${selectedSpace}`);
    if (activeWaveform) {
        activeWaveform.classList.add('waveform-highlight');
    }

    logDebug(`[selectSpace] Hlasitosti aktualizovány pro prostor: ${selectedSpace}`);
}

/* ======================================
   Funkce pro načtení a přehrávání audia
====================================== */

async function loadAudioFiles() {
    console.log('[loadAudioFiles] Načítám audio soubory...');

    // Pokud už probíhá načítání nebo jsou soubory načtené, vrátíme se
    if (isLoading || isLoaded) return Promise.resolve();

    showSpinner(); // Zobrazíme indikátor načítání
    isLoading = true;
    audioBuffers = []; // Resetujeme pole bufferů

    // Ověření, že máme co načíst
    if (!audioPairs.length) {
        console.error('[loadAudioFiles] Žádné audio soubory nejsou k dispozici.');
        isLoading = false;
        hideSpinner();
        return Promise.reject('Žádné soubory.');
    }

    console.log(`[loadAudioFiles] Počet souborů k načtení: ${audioPairs.length}`);

    // **Stáhneme a dekódujeme všechna audia PŘEDEM**
    const fetchPromises = audioPairs.map(async (file, index) => {
        try {
            console.log(`[loadAudioFiles] 🔄 Stahuji soubor: ${file}`);

            const response = await fetch(file);
            if (!response.ok) throw new Error(`Soubor nenalezen: ${file}`);

            const arrayBuffer = await response.arrayBuffer();
            const decodedData = await audioContext.decodeAudioData(arrayBuffer);

            audioBuffers[index] = decodedData; // Uložíme do pole bufferů
            console.log(`[loadAudioFiles] ✅ Načteno: ${file}`);
        } catch (error) {
            console.warn(`[loadAudioFiles] ⚠️ Chyba při načítání: ${file}`, error.message);
            audioBuffers[index] = null; // Zabráníme chybám při přehrávání
        }
    });

    await Promise.allSettled(fetchPromises); // Počkáme na dokončení všech požadavků

    // Kontrola, zda jsme něco skutečně načetli
    isLoaded = audioBuffers.some(buffer => buffer !== null);
    isLoading = false;
    hideSpinner();

    if (!isLoaded) {
        console.error('[loadAudioFiles] ❌ Žádné zvukové soubory nebyly načteny.');
        return Promise.reject('Žádné zvukové soubory nebyly načteny.');
    }

    console.log('[loadAudioFiles] ✅ Všechna audia jsou nyní v paměti!');
    return audioBuffers;
}

function resetAudioData() {
    isLoaded = false; // Reset načteného stavu
    audioBuffers = []; // Vyprázdníme buffery
    logDebug('Audio data byla resetována.');
}

// Přehrání všech audio souborů
function startAudio(startFrom = 0) {
    logDebug('[startAudio] Zahajuji přehrávání od času:', startFrom);
    updateButtonState('play', true, 'active');
    
    const currentInstance = waveSurferInstances[`waveform-${currentSpace}`];
    if (!currentInstance) {
        console.error('WaveSurfer instance nebyla nalezena pro aktuální prostor.');
        return;
    }

    // Pokud je `pausedTime` definovaný a větší než 0, použijeme ho místo `startFrom`
    if (pausedTime > 0) {
        logDebug(`[startAudio] Přehrávám od pauzovaného času: ${pausedTime}`);
        startFrom = pausedTime;
        pausedTime = 0; // Resetujeme, protože přehrávání pokračuje
    }

    const duration = currentInstance.getDuration();
    if (startFrom >= duration) {
        startFrom = 0;
    }

    // Synchronizace kurzoru s počáteční pozicí
    const progress = startFrom / duration;
    currentInstance.seekTo(progress);

    // Reset isPlaying před restartem přehrávání při smyčkování
    if (isPlaying && isLoopEnabled) {
        logDebug('[startAudio] Smyčka aktivní. Znovu spouštím přehrávání.');
        stopAudioBuffers(); // Zastaví všechny buffery
        isPlaying = false; // Resetuje příznak
    }

    // Zabráníme duplicitnímu přehrávání
    if (isPlaying) {
        console.warn('[startAudio] Audio již hraje. Přeskakuji.');
        return;
    }

    // Inicializace zdrojů
    audioSources = [];
    gainNodes = [];
    startTime = audioContext.currentTime - startFrom;

    // Nejprve vytvoříme všechny zdroje a uložíme je do pole
    const sources = audioBuffers.map((buffer, index) => {
        if (!buffer) return null;

        const isFront = index % 2 === 0;  // Sudé indexy = přední signál, liché = zadní
        const spaceIndex = Math.floor(index / 8);  // Každý prostor má 8 souborů
        const pairIndex = Math.floor(index / 2);   // Každý pár tvoří 2 soubory (front/back)
        const audioType = isFront ? 'audio1' : 'audio2';  // Určení typu audia
        // const gainValue = isFront ? dBToGain(currentPattern.audio1) : dBToGain(currentPattern.audio2);
        
        // **Podmínky pro výběr správných souborů**
        if (spaceIndex !== spaceMapping[currentSpace]) return null;
        if (!(audioType in currentPattern)) return null;

        const baseGain = currentPattern[audioType];
        let gainValue = dBToGain(baseGain);
        if (!isFront && currentPattern.polarity) {
            gainValue = -gainValue;
        }


        const source = audioContext.createBufferSource();
        source.buffer = buffer;

        // 🎚 GainNode pro úpravu hlasitosti
        const gainNode = audioContext.createGain();
        gainNode.gain.value = currentPattern.polarity && !isFront ? -gainValue : gainValue;

        source.connect(gainNode);
        gainNode.connect(audioContext.destination);

        audioSources.push(source);
        gainNodes.push(gainNode);

        return source;
    }).filter(source => source !== null);  // Odstraníme `null` hodnoty (neplatné buffery)

    // **PŘESNÉ SPUŠTĚNÍ VŠECH ZVUKŮ SOUČASNĚ**  
    const startAt = audioContext.currentTime + 0.01; // Přidáme bezpečné zpoždění 100 ms  
    console.log(`[startAudio] Plánovaný čas spuštění: ${startAt.toFixed(6)}s`);

    // Pro debug: Měření časových rozdílů mezi spuštěním jednotlivých souborů
    let prevStartTime = null;

    sources.forEach((source, index) => {
        source.start(startAt, startFrom);
        
        const realStartTime = audioContext.currentTime;
        if (prevStartTime !== null) {
            console.log(`🔹 Rozdíl mezi ${index - 1} a ${index}: ${(realStartTime - prevStartTime).toFixed(6)}s`);
        }
        prevStartTime = realStartTime;

        console.log(`[DEBUG] Soubor ${index} spuštěn!`);
        console.log(`  🔹 Čas v audioContext: ${realStartTime.toFixed(6)}s`);
        console.log(`  🔹 Rozdíl oproti plánovanému času: ${(realStartTime - startAt).toFixed(6)}s`);
    });

    console.log(`[startAudio] Všechny zvuky spuštěny přesně v čase ${startAt}`);

    setAudioLevels('distanceSlider'); // Aktualizuje hlasitosti podle slideru

    isPlaying = true;

    // Aktualizace kurzoru a řízení smyčky
    const updateWaveform = setInterval(() => {
        if (!isPlaying) {
            clearInterval(updateWaveform);
            return;
        }

        const elapsedTime = audioContext.currentTime - startTime;

            // Pokud je rozdíl mezi zvukem a kurzorem větší než 5ms, upravíme ho
        const expectedWaveformPosition = elapsedTime / duration;
        const actualWaveformPosition = currentInstance.getCurrentTime() / duration;
        const drift = Math.abs(expectedWaveformPosition - actualWaveformPosition);

        if (drift > 0.005) {  // 5 ms tolerance
            currentInstance.seekTo(expectedWaveformPosition);
            console.log(`[SYNC] Oprava driftu kurzoru: ${drift.toFixed(6)}s`);
        }
    

        // Kontrola, zda jsme na konci regionu nebo délky souboru
        if (loopRegion && elapsedTime >= loopRegion.end) {
            if (isLoopEnabled) {
                logDebug('[startAudio] Smyčka aktivní. Restart přehrávání od začátku regionu.');
                clearInterval(updateWaveform);
                stopAudio(); // Zastaví všechny buffery
                startAudio(loopRegion.start); // Restartuje přehrávání od začátku regionu
            } else {
                logDebug('[startAudio] Konec přehrávání.');
                clearInterval(updateWaveform);
                stopAudio(); // Zastaví všechny buffery a přehrávání
                return;
            }
        }

        // Pokud smyčka není aktivní, zastavíme přehrávání na konci
        if (!isLoopEnabled && elapsedTime >= duration) {
            logDebug('[startAudio] Konec přehrávání.');
            clearInterval(updateWaveform);
            stopAudio();
            return;
        }

        // Aktualizace vizuálního kurzoru
        const waveformRelativePosition = elapsedTime / duration;
        Object.values(waveSurferInstances).forEach(instance => {
            instance.seekTo(waveformRelativePosition);
        });
    }, 5); // Aktualizace každých 5 ms
}

function stopAudioBuffers() {
    logDebug('Zastavuji všechny audio buffery...');

    // Projdeme všechny audio zdroje a zastavíme je
    if (audioSources.length > 0) {
        audioSources.forEach((source, index) => {
            try {
                source.stop();
                logDebug(`Audio buffer na indexu ${index} zastaven.`);
            } catch (error) {
                console.error(`Chyba při zastavení audio bufferu na indexu ${index}:`, error.message);
            }
        });
    } else {
        logDebug('Žádné audio buffery nejsou aktivní.');
    }

    // Vyčistíme pole audio zdrojů a gainů
    audioSources = [];
    gainNodes.forEach(gainNode => gainNode.disconnect());
    gainNodes = [];

}

function stopAudio() {
    logDebug('Zastavuji všechna audio...');
    stopAudioBuffers();

    // Zastaví všechny wavesurfer instance
    Object.values(waveSurferInstances).forEach(instance => {
        instance.pause();
        instance.seekTo(0);
    });
    
    isPlaying = false;
    isLooping = false; // Resetujeme flag smyčky

    if (loopRegion) {
        loopRegion.loop = false; // Vypne smyčkování pro region
    }

    lastCursorTime = 0;
    pausedTime = 0;

    updateButtonState('play', false, 'active'); // reset zelené barvy

    logDebug('Všechna audia zastavena.');
}

function pauseAudio() {
    logDebug('Pozastavuji přehrávání...');
    if (isPlaying) stopAudioBuffers();
    isPlaying = false;

    Object.values(waveSurferInstances).forEach(instance => {
        pausedTime = instance.getCurrentTime();
    });

    logDebug('Audio pozastaveno.');
}

function setAudioLevels(sliderId) {
    const sliderValue = parseFloat(document.getElementById(sliderId).value);
    const lowerIndex = Math.floor(sliderValue); // Dolní audiopár
    const upperIndex = Math.ceil(sliderValue); // Horní audiopár
    const blend = sliderValue - lowerIndex; // Poměr mezi audiopáry

    if (!currentPattern) {
        console.error('Směrová charakteristika není definována.');
        return;
    }

    if (!spaceMapping || Object.keys(spaceMapping).length === 0) {
        console.error('spaceMapping není definováno.');
        return;
    }

    const selectedSpaceIndex = spaceMapping[currentSpace];
    logDebug(`[setAudioLevels] Aktuální prostor: ${currentSpace} (index: ${selectedSpaceIndex})`);

    const numSpaces = audioBuffers.length / 8; // Počet prostorů (každý má 8 souborů)
    if (!Number.isInteger(numSpaces)) {
        console.error('Počet bufferů není dělitelný 8. Možná chybí některé soubory.');
        return;
    }

    gainNodes.forEach((gainNode, index) => {
        const spaceIndex = Math.floor(index / 8); // Index aktuálního prostoru
        const localIndex = index % 8; // Lokální index v rámci prostoru (0-7)
        const isFront = localIndex % 2 === 0; // Rozlišení front/back
        const pairIndex = Math.floor(localIndex / 2); // Index audiopáru (0-3)
        const audioType = isFront ? 'audio1' : 'audio2'; // Typ audia podle směru



        if (!(audioType in currentPattern)) {
            console.warn(`Směrová charakteristika neobsahuje ${audioType}.`);
            return;
        }

        // Základní hodnota zisku podle směrové charakteristiky
        const baseGain = currentPattern[audioType];
        let gainValue = 0;

        // Nastavení hlasitosti na základě slideru
        if (spaceIndex === selectedSpaceIndex) {
            if (pairIndex === lowerIndex || pairIndex === upperIndex) {
                const blendFactor = pairIndex === lowerIndex ? 1 - blend : blend;
                gainValue = dBToGain(baseGain) * blendFactor;
            }
        } else {
            gainValue = 0; // Ztišíme ostatní prostory
        }

        // Nastavení zisku na základě polarity
        if (!isFront && currentPattern.polarity) {
            gainValue = -gainValue; // Inverze polarity
        }

        gainNode.gain.setTargetAtTime(gainValue, audioContext.currentTime, 0.05);

        // Logování pro ladění
        logDebug(
            `Prostor ${spaceIndex}, Buffer ${localIndex} (${audioType}): Gain = ${gainValue.toFixed(3)}`
        );
    });

    logDebug('Hlasitosti aktualizovány pro všechny prostory.');
}

// Inicializace aplikace (při načtení stránky)
async function initializeApp() {
    logDebug('[initializeApp] Zahajuji inicializaci aplikace...');

    const instrumentSelect = document.getElementById('instrumentSelect');
    const techniqueSelect = document.getElementById('techniqueSelect');
    const patternSelect = document.getElementById('patternSelect');
    const spaceSelect = document.getElementById('spaceSelect')

    const defaultInstrument = instrumentSelect.value || 'violoncello';
    const defaultTechnique = techniqueSelect.value || 'detache';
    const defaultPattern = patternSelect.value || 'omni';
    const defaultSpace = spaceSelect.value || 'studio'; 

    currentInstrument = defaultInstrument;
    currentPattern = patterns[defaultPattern];

    await updateTechniqueSelect();

    // Nastavení výchozí zvýraznění obrázku
    const defaultImg = document.querySelector(`.pattern-options img[data-value="${defaultPattern}"]`);
    if (defaultImg) {
        defaultImg.classList.add('active');
    }

    // Nastavení výchozí zvýraznění obrázku pro prostor
    const defaultImgSpace = document.querySelector(`.space-options img[data-value="${currentSpace}"]`);
    if (defaultImgSpace) {
        defaultImgSpace.classList.add('active');
    }

    // Nastavení výchozí hodnoty posuvníku
    distanceSlider.value = 0; // Výchozí hodnota na první pozici
    setAudioLevels('distanceSlider'); // Aplikace úrovní audia podle posuvníku

    // Inicializace směrové charakteristiky
    updateSliderThumbImage(defaultPattern); // Nastavení výchozího obrázku

    try {
        await applyInstrumentAndTechniqueSettings(defaultInstrument, defaultTechnique);
        selectSpace(defaultSpace);
        logDebug('Všechna nastavení byla úspěšně aplikována.');
    } catch (error) {
        console.error('Chyba při inicializaci aplikace:', error);
    }

    // Inicializace regionu a posluchačů
    initRegionListenersForCurrentInstance();

    logDebug('[initializeApp] Inicializace dokončena.');

}

/* ======================================
   Funkce při spuštění stránky
====================================== */

window.onload = function () {

    // Inicializace aplikace
    initializeApp();

    // Povolení přichytávání pro slider
    enableSnapping("distanceSlider");

    // Přidání všech potřebných event listenerů
    addEventListeners();

};

/* ======================================
   Funkce pro event listenery
====================================== */

function addEventListeners() {

    // Listener pro "Použít nastavení"
    document.getElementById('applySettings').addEventListener('click', async () => {
        logDebug('Aplikuji všechna nastavení...');

        stopAudio();  

        // Reset loop, pokud je aktivní
        if (isLoopEnabled) {
            logDebug('[applySettings] Resetuji loop...');
            toggleLoop(); // Volání funkce toggleLoop vypne loop
            updateButtonState('toggleLoop', false, 'loop-active'); // Ujistíme se, že tlačítko se resetuje
        }

        await applyInstrumentAndTechniqueSettings(); // Načte všechny prostory pro vybraný nástroj a techniku

        logDebug('Všechna nastavení byla úspěšně aplikována.');
    });
    
    // Listener pro "Použít nastavení" (směrová charakteristika)
    document.getElementById('patternSelect').addEventListener('change', () => {
        applyPatternSettings();
        setAudioLevels('distanceSlider'); // Aktualizace úrovní audia
    });

    // Listener pro aktualizaci dropdownu technik při změně nástroje nebo prostoru
    document.getElementById('instrumentSelect').addEventListener('change', updateTechniqueSelect);

    // Listener pro posuvník vzdálenosti
    document.getElementById('distanceSlider').addEventListener('input', (event) => {
        const sliderId = 'distanceSlider';
        const sliderValue = parseFloat(event.target.value);

        logDebug(`Hodnota posuvníku změněna na: ${sliderValue}`);
        setAudioLevels(sliderId); // Aktualizuje úrovně audia
    });
    
    // Listener pro přehrání zvuku
    document.getElementById('play').addEventListener('click', () => {
        logDebug('Stisknuto tlačítko Play.');
    
        if (!audioPairs || audioPairs.length === 0) {
            console.error('audioPairs je prázdné. Není co přehrát.');
            return;
        }
    
        if (isPlaying) {
            logDebug('[Play] Audio již hraje. Restart přehrávání.');
            stopAudio(); // Zastaví aktuální přehrávání
        }
    
        loadAudioFiles()
            .then(() => {
                // Použijeme lastCursorTime, pokud je definovaný, jinak 0
                const startFrom = lastCursorTime || 0;
                logDebug(`Spouštím přehrávání od času: ${startFrom} sekund.`);
    
                startAudio(startFrom);
    
                // Aktualizace stavu tlačítek
                updateButtonState('play', isPlaying, 'active'); 
                updateButtonState('pause', false, 'paused'); 
            })
            .catch((error) => {
                console.error('Chyba při načítání zvukových souborů:', error);
            });
    });
    
    
    // Listener pro zastavení zvuku
    document.getElementById('stop').addEventListener('click', () => {
        stopAudio();

        // Reset barvy tlačítek Play a Pause
        updateButtonState('play', false, 'active'); // Reset zelené barvy
        updateButtonState('pause', false, 'paused'); // Reset modré barvy

        logDebug('Audio zastaveno.');
    });
    
    // Listener pro pozastavení zvuku
    document.getElementById('pause').addEventListener('click', () => {

        pauseAudio();

        updateButtonState('pause', true, 'paused'); // Změna na modrou
        updateButtonState('play', false, 'active'); // Reset Play

        logDebug('Audio pozastaveno.');
    });
    
    // Listener pro loop tlačítko
    document.getElementById('toggleLoop').addEventListener('click', () => {
        toggleLoop(); // Funkce pro smyčku
        updateButtonState('toggleLoop', isLoopEnabled, 'loop-active'); // Hnědá pro loop
    });

    // Listener na kliknutí na pattern-selector (pro otevření a zavření)
    document.getElementById('pattern-selector').addEventListener('click', function (event) {
        const patternSelector = this;

        // Přepínání mezi třídami expanded a collapsed
        if (patternSelector.classList.contains('collapsed')) {
            patternSelector.classList.remove('collapsed');
            patternSelector.classList.add('expanded');
            logDebug('Bublina otevřena');
        }
    });

    // Listener na kliknutí na waveform-selector (pro otevření a zavření)
    document.getElementById('space-selector').addEventListener('click', function (event) {
        const waveformSelector = this;

        // Přepínání mezi třídami expanded a collapsed
        if (waveformSelector.classList.contains('collapsed')) {
            waveformSelector.classList.remove('collapsed');
            waveformSelector.classList.add('expanded');
            logDebug('Bublina otevřena');
        }
    });

    // Zabráníme zavření, když uživatel klikne na obrázky
    document.querySelector('.pattern-options').addEventListener('click', function (event) {
        event.stopPropagation();
    });

    // Zabráníme zavření, když uživatel klikne na obrázky
    document.querySelector('.space-options').addEventListener('click', function (event) {
        event.stopPropagation();
    });

    // Listener na kliknutí na jednotlivé obrázky směr. charakteristiky
    document.querySelectorAll('.pattern-options img').forEach(img => {
        img.addEventListener('click', function () {
            // Odstranění aktivní třídy ze všech obrázků
            document.querySelectorAll('.pattern-options img').forEach(img => img.classList.remove('active'));

            // Přidání aktivní třídy na aktuální obrázek
            this.classList.add('active');

            // Získání hodnoty z data-value
            const selectedValue = this.getAttribute('data-value');
            logDebug(`Vybraná směrová charakteristika: ${selectedValue}`);

            // Zde můžete provést další akce, např. volání funkce applyPatternSettings
            applyPatternSettings(selectedValue);
        });
    });

    // Listener na kliknutí na jednotlivé obrázky prostoru
    document.querySelectorAll('.space-options img').forEach(img => {
        img.addEventListener('click', function () {
            // Získáme hodnotu z `data-value`
            const selectedSpace = this.getAttribute('data-value');
            logDebug(`[selectSpace] Kliknuto na prostor: ${selectedSpace}`);
    
            // Zavoláme funkci selectSpace
            selectSpace(selectedSpace);
    
            // Zvýrazníme aktivní prostor
            document.querySelectorAll('.space-options img').forEach(img => img.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // Listener na kliknutí na tlačítko šipky
    document.getElementById('collapseButtonRight').addEventListener('click', function (event) {
        const patternSelector = document.getElementById('pattern-selector');
        const micButtonImage = this.querySelector('img'); // Najdeme obrázek uvnitř tlačítka

        // Zavření bubliny
        if (patternSelector.classList.contains('expanded')) {
            patternSelector.classList.remove('expanded');
            patternSelector.classList.add('collapsed');
            micButtonImage.src = '/images/microphone-icon.png'; // Obrázek pro zavřený stav
            logDebug('Bublina zavřena pomocí šipky');
        } else if (patternSelector.classList.contains('collapsed')) {
            patternSelector.classList.remove('collapsed');
            patternSelector.classList.add('expanded');
            micButtonImage.src = '/images/arrow-left-icon.png'; // Obrázek pro rozbalený stav
            logDebug('Bublina otevřena pomocí šipky');
        }

        // Zabráníme propagaci kliknutí na rodičovský listener
        event.stopPropagation();
    });

    // Listener na kliknutí na tlačítko šipky
    document.getElementById('collapseButtonLeft').addEventListener('click', function (event) {
        const waveformSelector = document.getElementById('space-selector');
        const micButtonImage = this.querySelector('img'); // Najdeme obrázek uvnitř tlačítka

        // Zavření bubliny
        if (waveformSelector.classList.contains('expanded')) {
            waveformSelector.classList.remove('expanded');
            waveformSelector.classList.add('collapsed');
            micButtonImage.src = '/images/space-icon.png'; // Obrázek pro zavřený stav
            logDebug('Bublina zavřena pomocí šipky');
        } else if (waveformSelector.classList.contains('collapsed')) {
            waveformSelector.classList.remove('collapsed');
            waveformSelector.classList.add('expanded');
            micButtonImage.src = '/images/arrow-right-icon.png'; // Obrázek pro rozbalený stav
            logDebug('Bublina otevřena pomocí šipky');
        }

        // Zabráníme propagaci kliknutí na rodičovský listener
        event.stopPropagation();
    });
}

/* ======================================
   Pomocné funkce
====================================== */

// Funkce pro převod dB na gain
function dBToGain(dB) {
    return dB === -Infinity ? 0 : Math.pow(10, dB / 20);
}

// Funkce pro změnu obrázku na posuvníku
function updateSliderThumbImage(patternName) {
    let thumbImageUrl = '';

    // Na základě vybrané směrové charakteristiky přiřadíme obrázek
    switch (patternName) {
        case 'omni':
            thumbImageUrl = '/images/Directivity_patterns/omni.png'; // Obrázek pro kouli
            break;
        case 'cardioid':
            thumbImageUrl = '/images/Directivity_patterns/cardio.png'; // Obrázek pro ledvinu
            break;
        case 'wide_cardioid':
            thumbImageUrl = '/images/Directivity_patterns/wide_cardio.png'; // Obrázek pro širokou ledvinu
            break;
        case 'super_cardioid':
            thumbImageUrl = '/images/Directivity_patterns/super_cardio.png'; // Obrázek pro superkardioidu
            break;
        case 'figure_8':
            thumbImageUrl = '/images/Directivity_patterns/figure_8.png'; // Obrázek pro osmičku
            break;
        default:
            thumbImageUrl = '/images/Directivity_patterns/omni.png'; // Výchozí obrázek
    }

    // Změníme obrázek na slideru
    document.querySelector('input[type="range"]').style.setProperty('--slider-thumb-image', `url(${thumbImageUrl})`);
}

// Funkce pro přichycení posuvníku
function enableSnapping(sliderId, tolerance = 1) { // tolerance je nastavena na 0.2, můžete ji upravit podle potřeby
    let slider = document.getElementById(sliderId);
    
    // Zkontrolujeme, zda byl element nalezen
    if (!slider) {
        console.error(`Element s ID ${sliderId} nebyl nalezen.`);
        return;
    }

    slider.addEventListener("input", function () {
        let sliderValue = parseFloat(slider.value);
        let closestValue = Math.round(sliderValue);

        // Pokud je slider blízko nejbližšího bodu v rámci tolerance, přichytí se na tento bod
        if (Math.abs(sliderValue - closestValue) <= tolerance) {
            slider.value = closestValue;
            logDebug(`Slider se přichytil na: ${closestValue}`);
        } else {
            logDebug(`Slider na volné hodnotě: ${sliderValue}`);
        }

        setAudioLevels(sliderId);
    });
}

// Připojení výběru technik k nástrojům – výběr v menu (dropdown)
async function updateTechniqueSelect() {
    logDebug('Spouštím updateTechniqueSelect...');

    const selectedInstrument = document.getElementById('instrumentSelect').value;
    const techniqueSelect = document.getElementById('techniqueSelect');

    if (!selectedInstrument) {
        return Promise.reject('Není k dispozici nástroj.');
    }

    try {
        const spaces = await fetchSpaces();
        logDebug('Načtené prostory:', spaces);

        // Najdeme všechny unikátní techniky pro vybraný nástroj napříč prostory
        const uniqueTechniques = new Set();
        spaces.forEach(space => {
            const instrumentData = space.instruments.find(inst => inst.name === selectedInstrument);
            if (instrumentData && Array.isArray(instrumentData.techniques)) {
                instrumentData.techniques.forEach(technique => uniqueTechniques.add(technique));
            }
        });

        // Vymažeme staré možnosti
        techniqueSelect.innerHTML = '';

        // Přidáme nové možnosti technik
        if (uniqueTechniques.size > 0) {
            uniqueTechniques.forEach(technique => {
                const option = document.createElement('option');
                option.value = technique;

                // Odstranění podtržítek a změna prvního písmene na velké
                const formattedTechnique = technique.replace(/_/g, ' ');
                option.textContent = formattedTechnique.charAt(0).toUpperCase() + formattedTechnique.slice(1);

                techniqueSelect.appendChild(option);
            });
        } else {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Žádné techniky dostupné';
            techniqueSelect.appendChild(option);
        }

        logDebug(`Techniky pro "${selectedInstrument}":`, Array.from(uniqueTechniques));
        return Promise.resolve(); // Funkce skončila úspěšně
    } catch (error) {
        console.error('Chyba při aktualizaci výběru technik:', error);
        return Promise.reject(error);
    }
}

function initializeWaveformsForSpaces(spaces, audioPairs) {
    if (!Array.isArray(spaces) || spaces.length === 0) {
        console.error('Prostory nejsou dostupné nebo nejsou pole.');
        return;
    }

    spaces.forEach(space => {
        if (!space.name) {
            console.warn('Prostor nemá definovaný název:', space);
            return;
        }

        const containerId = `waveform-${space.name}`; // Generuje ID na základě názvu prostoru
        const audioFile = audioPairs.find(file => file.includes(space.name)); // Určuje cestu k audio souboru, který se má načíst do konkrétní instance WaveSurfer (viditelná waveforma)

        if (!audioFile) {
            console.warn(`[${containerId}] Audio soubor nebyl nalezen.`);
            return;
        }

        initializeWaveformForSpace(containerId, audioFile); // Inicializuje waveform pro daný prostor
    });
}

function initializeWaveformForSpace(containerId, audioFile) {

    logDebug(`[initializeWaveformForSpace] Inicializuji WaveSurfer pro ${containerId} s audio souborem: ${audioFile}`);

    logDebug(`[initializeWaveformForSpace] Inicializuji WaveSurfer pro ${containerId}`);
    logDebug(`[initializeWaveformForSpace] containerId: ${containerId}, audioFile: ${audioFile}`);

    if (!audioFile) {
        console.error(`[initializeWaveformForSpace][${containerId}] Žádný audio soubor není dostupný.`);
        return;
    }

    // Pokud instance již existuje, zničíme ji
    if (waveSurferInstances[containerId]) {
        logDebug(`[initializeWaveformForSpace] Ničím starou WaveSurfer instanci pro ${containerId}`);
        waveSurferInstances[containerId].destroy();
        delete waveSurferInstances[containerId];
    }

    logDebug(`[initializeWaveformForSpace] Načítám audio soubor: ${audioFile} pro ${containerId}`);

    const regionsPlugin = RegionsPlugin.create({
        regions: [],
        dragSelection: true,                
    });
    
    if (!regionsPlugin) {
        console.error(`[initializeWaveformForSpace] Nepodařilo se vytvořit RegionsPlugin pro ${containerId}`);
    } else {
        logDebug(`[initializeWaveformForSpace] RegionsPlugin vytvořen pro ${containerId}`);
    }


    logDebug(`[initializeWaveformForSpace] Vytvářím WaveSurfer pro kontejner: #${containerId}`);

    waveSurferInstances[containerId] = WaveSurfer.create({
        container: `#${containerId}`,
        waveColor: '#bbb',
        progressColor: '#fff',
        backend: 'MediaElement',
        height: 60,
        responsive: true,
        normalize: true,
        cursorWidth: 1,
        cursorColor: '#000',
        plugins: [regionsPlugin],
    });

    // Registrujeme plugin
    try {
        waveSurferInstances[containerId].registerPlugin(regionsPlugin);
        logDebug(`[initializeWaveformForSpace] RegionsPlugin registrován pro ${containerId}`);
    } catch (error) {
        console.error(`[initializeWaveformForSpace] Chyba při registraci RegionsPlugin pro ${containerId}:`, error);
        return;
    }

    waveSurferInstances[containerId].on('ready', () => {
        logDebug(`[${containerId}] WaveSurfer is ready.`);
        const activePlugins = waveSurferInstances[containerId].getActivePlugins();
        logDebug(`Active plugins for ${containerId}:`, activePlugins);
    });
    
    waveSurferInstances[containerId].on('interaction', () => {
        const progress = waveSurferInstances[containerId].getCurrentTime() / waveSurferInstances[containerId].getDuration();
        logDebug(`[${containerId}] interaction => progress: ${progress}`);

        // Synchronizace vizuálních kurzorů
        Object.values(waveSurferInstances).forEach((instance) => {
            if (instance !== waveSurferInstances[containerId]) {
                instance.seekTo(progress);
            }
        });

        // Uložení aktuálního času do lastCursorTime
        lastCursorTime = waveSurferInstances[containerId].getCurrentTime();
        logDebug(`[${containerId}] Aktualizovaný lastCursorTime: ${lastCursorTime}`);

        if (!isPlaying) {
            // Tzn. jsme pauznutí nebo zastavení
            logDebug(`[${containerId}] Kliknuto, ale audio je pauznuté/zastavené => nastavuji pausedTime na: ${lastCursorTime}`);
            pausedTime = lastCursorTime;
        }

        if (isPlaying) {
            logDebug(`[${containerId}] Kliknuto v průběhu přehrávání => skok na čas: ${lastCursorTime}`);
            
            // 1) Stopneme buffery
            stopAudioBuffers();
        
            // 2) Nastavíme isPlaying = false, abychom mohli obratem zavolat startAudio
            isPlaying = false;
        
            // 3) Teď už startAudio nebude „skipping“
            startAudio(lastCursorTime);
        }
    });
    
    logDebug(`[initializeWaveformForSpace] Aktivní pluginy pro ${containerId}:`, waveSurferInstances[containerId].getActivePlugins());

    waveSurferInstances[containerId].load(audioFile);

    logDebug("Aktuální instance WaveSurfer:", waveSurferInstances[containerId]);


    return waveSurferInstances[containerId];
}

function toggleLoop() {
    isLoopEnabled = !isLoopEnabled;
    logDebug(`Looping ${isLoopEnabled ? 'enabled' : 'disabled'}.`);

    const currentInstance = waveSurferInstances[`waveform-${currentSpace}`];
    if (!currentInstance) {
        console.error(`[toggleLoop] Instance pro ${currentSpace} není dostupná.`);
        return;
    }

    if (isLoopEnabled) {
        // Pokud je loop zapnutý, vytvoříme region
        initializeRegionForCurrentInstance();
    } else {
        // Pokud je loop vypnutý, odstraníme region
        if (loopRegion) {
            loopRegion.remove();
            loopRegion = null;
        }
    }

    // Aktualizace stavu tlačítka
    updateButtonState('toggleLoop', isLoopEnabled, 'loop-active');
}

function initializeRegionForCurrentInstance() {
    // Získáme aktuální instanci na základě currentSpace
    const currentInstance = waveSurferInstances[`waveform-${currentSpace}`];
    if (!currentInstance) {
        console.error(`[initializeRegionForCurrentInstance] Instance pro ${currentSpace} není dostupná.`);
        return;
    }

    logDebug(`[initializeRegionForCurrentInstance] Inicializuji region pro ${currentSpace}.`);

    // Získáme RegionsPlugin instance
    const regionsPluginInstance = currentInstance.getActivePlugins()[0];
    if (!regionsPluginInstance) {
        console.error(`[initializeRegionForCurrentInstance] Regions plugin není aktivní pro ${currentSpace}.`);
        return;
    }

    // Odstraníme starý region, pokud existuje
    if (loopRegion) {
        loopRegion.remove();
        loopRegion = null;
    }

    // Vytvoříme nový region pro aktuální instanci
    const duration = currentInstance.getDuration();
    loopRegion = regionsPluginInstance.addRegion({
        start: 0,
        end: duration || 10, // Výchozí délka smyčky, pokud není známa délka
        loop: true,
        drag: true,
        resize: true,
        color: 'rgba(0, 123, 255, 0.2)',
    });

    logDebug(`[initializeRegionForCurrentInstance] Region vytvořen od 0 do ${duration || 10}.`);
}

function initRegionListenersForCurrentInstance() {
    const currentInstance = waveSurferInstances[`waveform-${currentSpace}`];
    if (!currentInstance) {
        console.error(`[initRegionListenersForCurrentInstance] Instance pro ${currentSpace} není dostupná.`);
        return;
    }

    const regionsPluginInstance = currentInstance.getActivePlugins()[0];

    if (!regionsPluginInstance) {
        console.error(`[initRegionListenersForCurrentInstance] Regions plugin není aktivní pro ${currentSpace}.`);
        return;
    }

    logDebug('[initRegionListenersForCurrentInstance] Přidávám posluchače regionů.');


    // 1. region vytvořen
    regionsPluginInstance.on('region-created', (region) => {
        logDebug('[Region Event] Region created:', region);
        if (isLoopEnabled) {
            region.loop = true;
        }
    });

    // 2. region se během drag/resize mění
    regionsPluginInstance.on('region-updated', (region) => {
        logDebug('[Region Event] Region updated:', region);

        if (isLoopEnabled) {
            // Aktualizace globálních hodnot pro smyčku
            loopRegion.start = region.start;
            loopRegion.end = region.end;

            const currentTime = currentInstance.getCurrentTime();

            // Pokud kurzor není uvnitř nového regionu, restartujeme přehrávání
            if (currentTime < loopRegion.start || currentTime > loopRegion.end) {
                logDebug('[Region Event] Kurzoru mimo region, restartuji přehrávání.');
                stopAudio();
                /* startAudio(loopRegion.start); */
            }
        }
    });

    // 3. region změněn (drag/resize) – finální ukončení
    regionsPluginInstance.on('region-update-end', (region) => {
        logDebug('[Region Event] Region update ended:', region);

        if (isLoopEnabled) {
            loopRegion.start = region.start;
            loopRegion.end = region.end;

            // Pokud je audio aktivní, zkontrolujeme, zda je kurzor uvnitř regionu
            if (isPlaying) {
                const currentTime = currentInstance.getCurrentTime();
                if (currentTime < loopRegion.start || currentTime > loopRegion.end) {
                    logDebug('[Region Event] Kurzoru mimo region po ukončení aktualizace, restartuji přehrávání.');
                    stopAudio();
                    startAudio(loopRegion.start);
                }
            }
        }
    });

    // 4. Když přehrávání *opustí* region
    regionsPluginInstance.on('region-out', (region) => {
        if (isPlaying && isLoopEnabled && region.loop) {
            logDebug('[Region Event] Region-out triggered for looping.');

            // Reset kurzoru na začátek regionu a restart přehrávání
            currentInstance.seekTo(region.start / currentInstance.getDuration());
            stopAudio();
            startAudio(region.start);
        }
    });

}

// Funkce k logování detailů o audiosouborech
function logAudioFileDetails() {
    logDebug('=== Audio File Details ===');

    if (!audioBuffers || audioBuffers.length === 0) {
        console.error('Žádné audio soubory nejsou načteny.');
        return;
    }

    audioBuffers.forEach((buffer, index) => {
        if (!buffer) {
            console.warn(`Audio buffer pro index ${index} není načten.`);
            return;
        }

        const filePath = audioPairs[index] || 'N/A'; // Cesta k souboru
        const sampleRate = buffer.sampleRate; // Vzorkovací frekvence
        const numSamples = buffer.length; // Počet vzorků
        const durationInSeconds = (numSamples / sampleRate).toFixed(2); // Přesná délka v sekundách

        console.group(`File: ${filePath}`);
        logDebug(`Index: ${index}`);
        logDebug(`Sample Rate: ${sampleRate} [Hz]`);
        logDebug(`Number of Samples: ${numSamples} [smpl]`);
        logDebug(`Duration: ${durationInSeconds} [s]`);
        console.groupEnd();
    });

    logDebug('=== End of Audio File Details ===');
}

function updateButtonState(buttonId, isActive, activeClass) {
    const button = document.getElementById(buttonId);
    if (isActive) {
        button.classList.add(activeClass);
    } else {
        button.classList.remove(activeClass);
    }
}

/**
 * Načte externí SVG a vloží ho do .svg-container
 * @param {string} svgUrl - Cesta k SVG
 * @param {function} callback - Funkce, která se zavolá po vložení do DOM
 */
function loadSvgFile(svgUrl, callback) {
    fetch(svgUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Chyba při načítání ${svgUrl}: ${response.status}`);
        }
        return response.text();
      })
      .then(svgText => {
        // Vytvoříme DOM strukturu
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
        const newSvgElement = svgDoc.documentElement; // <svg> kořen
  
        // Najdeme kontejner a vyprázdníme ho
        const container = document.querySelector('.svg-container');
        container.innerHTML = ''; // odstraň staré svg, pokud tam něco bylo
  
        // Přidáme nové SVG do containeru
        container.appendChild(newSvgElement);
  
        // callback po vložení do DOM
        if (typeof callback === 'function') {
          callback();
        }
      })
      .catch(error => {
        console.error('Chyba:', error);
      });
  }

function positionSlider() {
    const distanceSlider = document.getElementById('distanceSlider');
    const container = document.querySelector('.slider-container');

    // 1) Najdeme `<svg>` uvnitř `.svg-container`
    const svg = document.querySelector('.svg-container svg');
    if (!svg) {
        console.warn('SVG nenalezeno. Nelze pozicovat slider.');
        return;
    }

    // 2) Najdeme čáru s id="asix"
    const asixLine = svg.querySelector('#asix');
    if (!asixLine) {
        console.warn('Line s ID "asix" nenalezena v aktuálním SVG.');
        return;
    }

    // 3) Přečteme souřadnice x1, y1, x2, y2 z <line>
    let x1 = parseFloat(asixLine.getAttribute('x1'));
    let y1 = parseFloat(asixLine.getAttribute('y1'));
    let x2 = parseFloat(asixLine.getAttribute('x2'));
    let y2 = parseFloat(asixLine.getAttribute('y2'));

    // 4) Vytvoříme body SVGPoint
    let pt1 = svg.createSVGPoint();
    pt1.x = x1;
    pt1.y = y1;

    let pt2 = svg.createSVGPoint();
    pt2.x = x2;
    pt2.y = y2;

    // 5) Aplikujeme screenCTM => získáme reálné souřadnice v px
    let matrix = asixLine.getScreenCTM();
    if (!matrix) {
        console.warn('screenCTM je null. Prohlížeč nebo SVG environment může dělat problémy.');
        return;
    }

    let screenPt1 = pt1.matrixTransform(matrix);
    let screenPt2 = pt2.matrixTransform(matrix);

    const halfSliderHeight = 10; // polovina výšky slideru (pokud je height=20px)

    // 6) Vypočítáme vzdálenost a úhel
    let dx = screenPt2.x - screenPt1.x;
    let dy = screenPt2.y - screenPt1.y;
    let length = Math.sqrt(dx * dx + dy * dy);
    let angleRad = Math.atan2(dy, dx);
    let angleDeg = angleRad * (180 / Math.PI);

    // 7) Zjistíme offset kontejneru vůči viewportu (top/left)
    const containerRect = container.getBoundingClientRect();

    // 8) Nastavíme slider
    distanceSlider.style.left = (screenPt1.x - containerRect.left) + 'px';
    distanceSlider.style.top  = (screenPt1.y - containerRect.top - halfSliderHeight) + 'px';
    distanceSlider.style.width = length + 'px';
    distanceSlider.style.transform = 'rotate(' + angleDeg + 'deg)';

    // **DŮLEŽITÉ:** Nastavte hodnotu slideru na střed (nebo požadovanou hodnotu),
    // aby se pseudo-element (slider thumb) vykreslil vždy ve stejné pozici.
    const minVal = parseFloat(distanceSlider.min);
    const maxVal = parseFloat(distanceSlider.max);
    distanceSlider.value = minVal;
}

window.toggleMenu = function() {
    // 1) Vybereme hamburger ikonku
    const hamburger = document.querySelector(".hamburger");
    // 2) Vybereme nav-links
    const navLinks = document.querySelector(".nav-links");
    
    // Přepínáme třídy "active" / "open"
    hamburger.classList.toggle("active");
    navLinks.classList.toggle("open");
}

window.addEventListener('resize', () => {
    // Mírné zpoždění může pomoci, aby se SVG opravdu přepočítalo
    setTimeout(positionSlider, 100);
});
window.addEventListener('load', positionSlider);

// Otevře modal
window.openModal = function () {
    document.getElementById("infoModal").style.display = "flex";
};

// Zavře modal
window.closeModal = function () {
    document.getElementById("infoModal").style.display = "none";
};

// Zavře modal pouze při kliknutí mimo modal-box
document.getElementById("infoModal").addEventListener("click", function (event) {
    const modalBox = document.querySelector(".modal-box");
    if (!modalBox.contains(event.target)) {
        closeModal();
    }
});

function logDebug(message, ...optionalParams) {
    if (DEBUG_MODE) {
        logDebug(message, ...optionalParams);
    }
}
function showSpinner() {
    document.getElementById('spinner').style.display = 'block';
  }
  
function hideSpinner() {
    document.getElementById('spinner').style.display = 'none';
}