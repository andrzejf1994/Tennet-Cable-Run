/**
 * TenneT Cable Run - Gra zręcznościowa w pseudo-3D
 * Autor: Antigravity AI
 */

// Słownik kolorów dla retro-neonowej estetyki
const COLORS = {
    SKY_TOP: '#050B14',
    SKY_BOT: '#150624',
    SUN: '#FF5F00',
    SUN_GLOW: 'rgba(255, 95, 0, 0.4)',
    MOUNT_BACK: '#0B0A1A',
    MOUNT_FRONT: '#140D2B',
    ROAD_LIGHT: '#1E2530',
    ROAD_DARK: '#181E27',
    RUMBLE_RED: '#FF3E3E',
    RUMBLE_WHITE: '#EAEAEA',
    GRASS_LIGHT: '#0A1224',
    GRASS_DARK: '#070D1A',
    LANE_LINE: '#FFFFFF'
};

// Konfiguracja gry
const CONFIG = {
    segmentLength: 200,      // Długość jednego segmentu drogi
    drawDistance: 300,       // Ile segmentów w przód rysować
    roadWidth: 2000,         // Szerokość drogi
    roadWidthOnScreen: 0.625,// Współczynnik szerokości drogi na ekranie
    lanes: 3,                // Liczba pasów
    cameraHeight: 1000,      // Wysokość kamery nad drogą
    cameraDepth: 0.8,        // Zoom kamery (ogniskowa)
    maxSpeed: 2500,           // Maksymalna prędkość gracza (km/h, praktycznie bez limitu)
    accel: 120,              // Przyspieszenie (km/h na sekundy)
    breaking: 250,           // Siła hamowania
    decel: 40,               // Opór powietrza (naturalne zwalnianie)
    centrifugal: 0.3,        // Siła odśrodkowa na zakrętach
    playerBaseY: 0,          // Bazowa wysokość gracza
    truckBaseZ: 700,         // Początkowa odległość ciężarówki przed graczem
    shieldMax: 3,            // Maksymalna liczba żyć
    waveDuration: 20000,     // Czas trwania jednej fali (ms)
};

// Klasa zarządzająca dźwiękiem (Web Audio API)
class AudioManager {
    constructor() {
        this.ctx = null;
        this.musicInterval = null;
        this.musicPlaying = false;
        
        // Głośności (0.0 - 1.0)
        this.sfxVolume = 0.7;
        this.musicVolume = 0.5;
        
        // Węzeł główny
        this.masterVolumeNode = null;
        
        // Dźwięk silnika
        this.engineOsc = null;
        this.engineGain = null;
        this.engineFilter = null;
    }

    init() {
        if (this.ctx) return;
        
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;

        this.ctx = new AudioContextClass();
        this.masterVolumeNode = this.ctx.createGain();
        this.masterVolumeNode.gain.value = 1.0;
        this.masterVolumeNode.connect(this.ctx.destination);
        
        this.setupEngineSound();
    }

    setupEngineSound() {
        try {
            this.engineOsc = this.ctx.createOscillator();
            this.engineGain = this.ctx.createGain();
            this.engineFilter = this.ctx.createBiquadFilter();

            this.engineOsc.type = 'sawtooth';
            this.engineFilter.type = 'lowpass';
            this.engineFilter.frequency.value = 180;

            this.engineGain.gain.value = 0.0; // Wyciszony na starcie

            this.engineOsc.connect(this.engineFilter);
            this.engineFilter.connect(this.engineGain);
            this.engineGain.connect(this.masterVolumeNode);

            this.engineOsc.start(0);
        } catch (e) {
            console.error("Błąd podczas konfiguracji dźwięku silnika:", e);
        }
    }

    setEngineSpeed(speedRatio) {
        if (!this.ctx || !this.engineOsc) return;
        
        // Zapewniamy działanie kontekstu (przeglądarki blokują autoodtwarzanie)
        if (this.ctx.state === 'suspended') return;

        const volume = speedRatio > 0.05 ? 0.05 + speedRatio * 0.15 : 0;
        this.engineGain.gain.setTargetAtTime(volume * this.sfxVolume, this.ctx.currentTime, 0.1);
        
        const pitch = 45 + speedRatio * 130; // Hz
        this.engineOsc.frequency.setTargetAtTime(pitch, this.ctx.currentTime, 0.1);
        
        this.engineFilter.frequency.setTargetAtTime(150 + speedRatio * 500, this.ctx.currentTime, 0.2);
    }

    stopEngine() {
        if (this.engineGain) {
            this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
        }
    }

    playCrash() {
        if (!this.ctx || this.ctx.state === 'suspended') return;
        try {
            const now = this.ctx.currentTime;
            
            // Szum dla wybuchu
            const bufferSize = this.ctx.sampleRate * 0.5; // 0.5 sekundy
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(400, now);
            filter.frequency.exponentialRampToValueAtTime(10, now + 0.5);
            
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.5 * this.sfxVolume, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
            
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.masterVolumeNode);
            
            noise.start(now);
            
            // Dodatkowy niski basowy impuls
            const subOsc = this.ctx.createOscillator();
            const subGain = this.ctx.createGain();
            subOsc.type = 'sine';
            subOsc.frequency.setValueAtTime(120, now);
            subOsc.frequency.linearRampToValueAtTime(30, now + 0.3);
            
            subGain.gain.setValueAtTime(0.8 * this.sfxVolume, now);
            subGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            
            subOsc.connect(subGain);
            subGain.connect(this.masterVolumeNode);
            subOsc.start(now);
            subOsc.stop(now + 0.3);
        } catch (e) {
            console.error("Błąd podczas odtwarzania wybuchu:", e);
        }
    }

    playWarning() {
        if (!this.ctx || this.ctx.state === 'suspended') return;
        try {
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(980, now); // Wysoki ton ostrzegawczy
            
            gain.gain.setValueAtTime(0.15 * this.sfxVolume, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            
            osc.connect(gain);
            gain.connect(this.masterVolumeNode);
            osc.start(now);
            osc.stop(now + 0.15);
        } catch (e) {
            console.error("Błąd SFX:", e);
        }
    }

    playScoreSound() {
        if (!this.ctx || this.ctx.state === 'suspended') return;
        try {
            const now = this.ctx.currentTime;
            
            // Arpeggio / dwuton
            const osc1 = this.ctx.createOscillator();
            const osc2 = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc1.type = 'sine';
            osc2.type = 'sine';
            
            osc1.frequency.setValueAtTime(523.25, now); // C5
            osc2.frequency.setValueAtTime(659.25, now + 0.08); // E5
            
            gain.gain.setValueAtTime(0.12 * this.sfxVolume, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            
            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(this.masterVolumeNode);
            
            osc1.start(now);
            osc1.stop(now + 0.15);
            osc2.start(now + 0.08);
            osc2.stop(now + 0.3);
        } catch (e) {
            console.error("Błąd SFX:", e);
        }
    }

    startMusic() {
        if (!this.ctx || this.musicPlaying) return;
        this.musicPlaying = true;
        
        let beatCount = 0;
        
        // Prosta linia basowa Synthwave generowana proceduralnie
        // Akordy: A-moll, C-dur, G-dur, F-dur
        const bassNotes = [
            55.00, 55.00, 55.00, 55.00, // A1
            65.41, 65.41, 65.41, 65.41, // C2
            49.00, 49.00, 49.00, 49.00, // G1
            43.65, 43.65, 43.65, 43.65  // F1
        ];

        const melodyNotes = [
            220.00, 0, 261.63, 293.66, 329.63, 0, 261.63, 0, // A3, C4, D4, E4, C4
            261.63, 0, 329.63, 392.00, 329.63, 0, 293.66, 0, // C4, E4, G4, E4, D4
            196.00, 0, 246.94, 293.66, 246.94, 0, 220.00, 0, // G3, B3, D4, B3, A3
            174.61, 0, 220.00, 261.63, 220.00, 293.66, 261.63, 329.63 // F3, A3, C4, A3, D4, C4, E4
        ];
        
        const tempo = 135; // BPM
        const stepTime = 60 / tempo / 2; // 8-tki
        
        this.musicInterval = setInterval(() => {
            if (this.ctx.state === 'suspended' || this.musicVolume === 0) return;
            
            const now = this.ctx.currentTime;
            
            // Graj bas
            const bassIndex = Math.floor(beatCount / 2) % bassNotes.length;
            const bassFreq = bassNotes[bassIndex];
            
            // Tylko na parzystych krokach gramy bas (dla rytmu)
            if (beatCount % 2 === 0) {
                const bassOsc = this.ctx.createOscillator();
                const bassGain = this.ctx.createGain();
                bassOsc.type = 'triangle';
                bassOsc.frequency.setValueAtTime(bassFreq, now);
                
                bassGain.gain.setValueAtTime(0.25 * this.musicVolume, now);
                bassGain.gain.exponentialRampToValueAtTime(0.005, now + stepTime * 1.8);
                
                // Lowpass filter na basie
                const bassFilter = this.ctx.createBiquadFilter();
                bassFilter.type = 'lowpass';
                bassFilter.frequency.setValueAtTime(150, now);
                
                bassOsc.connect(bassFilter);
                bassFilter.connect(bassGain);
                bassGain.connect(this.masterVolumeNode);
                
                bassOsc.start(now);
                bassOsc.stop(now + stepTime * 1.8);
            }
            
            // Graj melodię co jakiś czas
            const melIndex = beatCount % melodyNotes.length;
            const melFreq = melodyNotes[melIndex];
            
            if (melFreq > 0 && Math.floor(beatCount / 32) % 2 === 1) { // Melodia gra co drugi cykl
                const melOsc = this.ctx.createOscillator();
                const melGain = this.ctx.createGain();
                melOsc.type = 'sawtooth';
                melOsc.frequency.setValueAtTime(melFreq, now);
                
                melGain.gain.setValueAtTime(0.06 * this.musicVolume, now);
                melGain.gain.exponentialRampToValueAtTime(0.002, now + stepTime * 1.2);
                
                const melFilter = this.ctx.createBiquadFilter();
                melFilter.type = 'lowpass';
                melFilter.frequency.setValueAtTime(600, now);
                
                melOsc.connect(melFilter);
                melFilter.connect(melGain);
                melGain.connect(this.masterVolumeNode);
                
                melOsc.start(now);
                melOsc.stop(now + stepTime * 1.2);
            }
            
            beatCount++;
        }, stepTime * 1000);
    }

    stopMusic() {
        if (this.musicInterval) {
            clearInterval(this.musicInterval);
            this.musicInterval = null;
        }
        this.musicPlaying = false;
    }
}

// Inicjalizacja instancji audio
const audio = new AudioManager();

// Glówne zmienne stanu gry
let canvas, ctx;
let lastTime = 0;
let gameState = 'START'; // START, PLAYING, PAUSED, GAMEOVER
let distanceTraveled = 0; // Odpowiednik wyniku (w metrach)
let gameWave = 1;
let waveTimer = 0;

// Lista polskich miast (poziomy gry)
const POLISH_CITIES = [
    'Skawina', 'Kraków', 'Wieliczka', 'Bochnia', 'Brzesko',
    'Tarnów', 'Dębica', 'Rzeszów', 'Łańcut', 'Przeworsk',
    'Jarosław', 'Przemyśl', 'Sanok', 'Krosno', 'Jaślo',
    'Gorlice', 'Nowy Sącz', 'Nowy Targ', 'Zakopane', 'Limanowa',
    'Wadowice', 'Oświęcim', 'Chłzow', 'Pszczyna', 'Tychy',
    'Katowice', 'Gliwice', 'Zabrze', 'Bytom', 'Sosnowiec',
    'Częstochowa', 'Rybnik', 'Bielsko-Biała', 'Cieszyn', 'Skoczow',
    'Kielce', 'Włoszczowa', 'Kozłów', 'Kielce', 'Ostrowiec',
    'Radom', 'Lublin', 'Puławy', 'Zamość', 'Chełm',
    'Warszawa', 'Piaseczno', 'Pruszków', 'Grójec', 'Mszczonów',
    'Łódź', 'Piotrków', 'Skierniewice', 'Sieradz', 'Wieluń',
    'Poznań', 'Gniezno', 'Konin', 'Kalisz', 'Ostrów',
    'Wrocław', 'Legnica', 'Jelenia Góra', 'Wałbrzych', 'Opole',
    'Gdańsk', 'Gdynia', 'Sopot', 'Tczew', 'Grudziądz',
    'Toruń', 'Bydgoszcz', 'Inowrocław', 'Znin', 'Piła',
    'Szczecin', 'Stargard', 'Kołobrzeg', 'Koszalin', 'Słupsk',
    'Olsztyn', 'Ostróda', 'Giżycko', 'Ełk', 'Sułki',
    'Białystok', 'Łomża', 'Suwałki', 'Augustow', 'Sejny',
    'Zielona Góra', 'Nowa Sól', 'Lubuskie', 'Środa', 'Gułbin',
    'Płock', 'Włocławek', 'Malbork', 'Kwidzyn', 'Starogard',
    'Nowy Dwor', 'Legionowo', 'Oświęcim', 'Andrychow', 'Sucha',
    'Zawiercie', 'Olkusz', 'Miechow', 'Proszowice', 'Brzesk'
];

// Stan tabliczek z nazwami miast (poziomy)
let citySignState = {
    nextCityIndex: 1,       // Indeks kolejnego miasta (0 = Skawina, start)
    signZ: 0,               // Pozycja Z tabliczki na trasie
    signPassed: false,      // Czy gracz minął tabliczkę
    pendingSignObj: null    // Referencja do obiektu znaku w roadsideObjects
};

// Statystyki trudności (dynamicznie skalowane z falami)
let drumSpawnInterval = 2200; // ms
let nextDrumSpawnTime = 0;
let baseDrumSpeedZ = 60; // Prędkość z jaką bębny poruszają się w stronę gracza
let maxDrumsInWave = 1; // Liczba bębnów zrzucanych na raz

// Informacje o grze i graczach
let player = {
    x: 0,            // Pozycja X na drodze (-1.0 to lewa krawędź, 1.0 to prawa)
    z: 0,            // Odległość wzdłuż drogi
    y: 0,            // Wysokość (np. podczas uderzenia / podskoku)
    speed: 0,        // Aktualna prędkość (km/h)
    targetX: 0,      // Cel dla płynnego skrętu (mysz/sterowanie dotykowe)
    shield: CONFIG.shieldMax,
    invincibleTime: 0, // Czas nieśmiertelności po zderzeniu
    steerAngle: 0,    // Kąt pochylenia samochodu przy skręcaniu
    isBraking: false,
    carColor: '#C0C0C0', // Domyślnie srebrny
    name: 'KIEROWCA',
    vehicleType: 'car'  // 'car' lub 'forklift'
};

let truck = {
    x: 0,
    z: CONFIG.truckBaseZ,
    y: 0,
    speed: 0,
    targetX: 0,
    laneChangeTimer: 0,
    indicatorBlinkTimer: 0,
    indicatorState: 0, // 0 = off, 1 = left, 2 = right
    indicatorActive: false
};

// Listy obiektów
let segments = [];
let drums = [];
let particles = [];
let roadsideObjects = [];

// Zmienne sterowania
let keys = {};
let mouseX = 0;
let isMouseDown = false;
let inputMode = 'keyboard'; // domyślny tryb sterowania ('keyboard' lub 'mouse')

// Kwalifikacja ustawień graficznych
let particleLimit = 300;

// Cykl dobowy i pobocze
let timeOfDay = 0;
let shoulderTimer = 0;

// Płótno i rozmiary
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // Obsługa wysokiej rozdzielczości Retina/DPI
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
}

// Inicjalizacja po załadowaniu okna
window.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');
    
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    
    // Wyczyść stare/testowe rekordy z localStorage przy aktualizacji wersji
    const SCORE_VERSION = 'v2'; // zmień przy każdym globalnym resecie rekordów
    if (localStorage.getItem('tennet_score_ver') !== SCORE_VERSION) {
        localStorage.removeItem('tennet_scores');
        localStorage.setItem('tennet_score_ver', SCORE_VERSION);
    }
    
    setupInputListeners();
    setupMenuListeners();
    loadLeaderboard();
    
    // Przywracanie zapisanego imienia gracza
    const savedName = localStorage.getItem('tennet_last_name');
    const nameInput = document.getElementById('player-name-start');
    if (savedName && nameInput) {
        nameInput.value = savedName;
    }
    
    // Utworzenie stałej trasy autostrady
    createRoad();
    
    // Rozpoczęcie pętli gry
    requestAnimationFrame(gameLoop);
});

// ==========================================================================
// GENERATOR DROGI (Pseudo-3D Segments)
// ==========================================================================
function createRoad() {
    segments = [];
    roadsideObjects = [];
    const numSegments = 1200; // Długość pętli drogi
    
    let curveAccum = 0;
    let hillAccum = 0;
    
    for (let i = 0; i < numSegments; i++) {
        let curve = 0;
        let hill = 0;
        
        // Projektowanie zakrętów
        if (i > 100 && i < 200) curve = 1.5;      // Łagodny w prawo
        else if (i > 250 && i < 400) curve = -2.5; // Ostry w lewo
        else if (i > 500 && i < 650) curve = 2.0;  // Średni w prawo
        else if (i > 750 && i < 900) curve = -1.5; // Łagodny w lewo
        else if (i > 950 && i < 1100) curve = 1.0; // Łagodny w prawo (powrót do centrum)
        
        // Projektowanie wzniesień (górki i doliny)
        if (i > 150 && i < 300) hill = Math.sin((i - 150) / 150 * Math.PI) * 1200;
        if (i > 600 && i < 800) hill = Math.sin((i - 600) / 200 * Math.PI) * -900;
        
        curveAccum += curve;
        hillAccum += hill;
        
        segments.push({
            index: i,
            world: {
                p1: { x: curveAccum, y: hillAccum, z: i * CONFIG.segmentLength },
                p2: { x: curveAccum + curve, y: hillAccum + hill, z: (i + 1) * CONFIG.segmentLength }
            },
            curve: curve,
            color: i % 4 < 2 ? COLORS.ROAD_LIGHT : COLORS.ROAD_DARK
        });

        // Generowanie dekoracji pobocza (drzewa, budynki, stacje)
        if (i % 6 === 0 && i > 5) {
            const isLeft = Math.random() > 0.5;
            const worldX = isLeft ? -1500 - Math.random() * 500 : 1500 + Math.random() * 500;
            const types = ['tree', 'building', 'gas_station', 'billboard'];
            const type = types[Math.floor(Math.random() * types.length)];
            roadsideObjects.push({
                x: worldX,
                z: i * CONFIG.segmentLength,
                y: 0,
                type: type,
                scale: 0.8 + Math.random() * 0.6
            });
        }
    }
}

// Funkcja pomocnicza do pobierania segmentu na podstawie pozycji Z
function findSegment(z) {
    const index = Math.floor(z / CONFIG.segmentLength);
    return segments[((index % segments.length) + segments.length) % segments.length];
}

// Projekcja 3D do 2D (Z-division)
function projectPoint(point, cameraX, cameraY, cameraZ, canvasWidth, canvasHeight, roadWidthOffset) {
    const transX = point.x - cameraX;
    const transY = point.y - cameraY;
    const transZ = point.z - cameraZ;
    
    if (transZ <= 0) return null; // Za kamerą
    
    // Rzutowanie Z: 200 to bazowy dystans Z, na którym scale = cameraDepth (0.8)
    const scale = (CONFIG.cameraDepth * 200) / transZ;
    
    // Normalizacja X względem połowy szerokości drogi (1000)
    const normX = transX / (CONFIG.roadWidth / 2);
    // Normalizacja Y względem wysokości kamery (1000)
    const normY = transY / CONFIG.cameraHeight;
    
    return {
        x: Math.round((canvasWidth / 2) + (scale * normX * CONFIG.roadWidthOnScreen * canvasWidth)),
        y: Math.round((canvasHeight * 0.45) - (scale * normY * (canvasHeight * 0.55))),
        w: Math.round(scale * CONFIG.roadWidthOnScreen * canvasWidth),
        scale: scale
    };
}

// ==========================================================================
// STEROWANIE I MYSZ
// ==========================================================================
function setupInputListeners() {
    // Klawiatura
    window.addEventListener('keydown', (e) => {
        keys[e.key] = true;
        keys[e.code] = true;
        
        // Przełączenie trybu sterowania na klawiaturę
        inputMode = 'keyboard';
        
        // Zapobieganie przewijaniu strony strzałkami i spacją
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
            e.preventDefault();
        }
        
        // Obsługa pauzy klawiszem Escape lub P
        if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
            if (gameState === 'PLAYING') {
                pauseGame();
            } else if (gameState === 'PAUSED') {
                resumeGame();
            }
        }
        
        // Aktywacja AudioContext przy pierwszym naciśnięciu
        audio.init();
    });
    
    window.addEventListener('keyup', (e) => {
        keys[e.key] = false;
        keys[e.code] = false;
    });

    // Sterowanie myszką/dotykiem na Canvas
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = (e.clientX - rect.left) / (rect.right - rect.left);
        // Mapowanie na przedział -0.95 do 0.95 (szerokość drogi)
        player.targetX = (clientX * 1.9) - 0.95;
        mouseX = e.clientX;
        inputMode = 'mouse';
    });

    canvas.addEventListener('mousedown', () => {
        isMouseDown = true;
        audio.init();
    });
    canvas.addEventListener('mouseup', () => isMouseDown = false);
    
    // Dotyk dla urządzeń mobilnych
    canvas.addEventListener('touchmove', (e) => {
        if (e.touches.length > 0) {
            const rect = canvas.getBoundingClientRect();
            const clientX = (e.touches[0].clientX - rect.left) / (rect.right - rect.left);
            player.targetX = (clientX * 1.9) - 0.95;
            audio.init();
            inputMode = 'mouse';
        }
    }, { passive: true });
}

// Obsługa interfejsów HTML (przyciski, suwaki)
function setupMenuListeners() {
    // Menu startowe
    document.getElementById('btn-start').addEventListener('click', () => {
        audio.init();
        startGame();
    });
    
    document.getElementById('btn-settings-open').addEventListener('click', () => {
        showModal('settings-modal');
    });

    // Ustawienia
    document.getElementById('btn-settings-close').addEventListener('click', () => {
        hideModal('settings-modal');
        applySettings();
    });
    
    // Menu pauzy
    document.getElementById('btn-resume').addEventListener('click', () => {
        resumeGame();
    });
    
    document.getElementById('btn-settings-pause').addEventListener('click', () => {
        showModal('settings-modal');
    });
    
    document.getElementById('btn-restart-pause').addEventListener('click', () => {
        hideMenu('menu-pause');
        startGame();
    });

    // Menu Game Over
    document.getElementById('btn-restart').addEventListener('click', () => {
        hideMenu('menu-gameover');
        startGame();
    });
    
    document.getElementById('btn-menu').addEventListener('click', () => {
        hideMenu('menu-gameover');
        showMenu('menu-start');
        gameState = 'START';
    });

    // Wybór pojazdu - przyciski na ekranie startowym i w ustawieniach
    function syncVehicleButtons(vehicleType) {
        // Start screen buttons
        document.querySelectorAll('#menu-start .vehicle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.vehicle === vehicleType);
        });
        // Modal buttons
        document.querySelectorAll('#settings-modal .vehicle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.vehicle === vehicleType);
        });
        player.vehicleType = vehicleType;
    }
    // Expose for applySettings
    window.syncVehicleButtons = syncVehicleButtons;
    
    document.querySelectorAll('.vehicle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            syncVehicleButtons(btn.dataset.vehicle);
        });
    });

}

function showMenu(id) {
    document.getElementById(id).classList.remove('hidden');
    document.getElementById(id).classList.add('active');
}

function hideMenu(id) {
    document.getElementById(id).classList.remove('active');
    document.getElementById(id).classList.add('hidden');
}

function showModal(id) {
    document.getElementById(id).classList.remove('hidden');
    document.getElementById(id).classList.add('active');
}

function hideModal(id) {
    document.getElementById(id).classList.remove('active');
    document.getElementById(id).classList.add('hidden');
}

function applySettings() {
    const volMusic = document.getElementById('vol-music').value;
    const volSfx = document.getElementById('vol-sfx').value;
    const gfx = document.getElementById('gfx-quality').value;
    const carColor = document.getElementById('car-color').value;
    
    audio.musicVolume = volMusic / 100;
    audio.sfxVolume = volSfx / 100;
    player.carColor = carColor;
    
    // Sync modal vehicle buttons back to main screen buttons
    const activeModalBtn = document.querySelector('#settings-modal .vehicle-btn.active');
    if (activeModalBtn) {
        const vt = activeModalBtn.dataset.vehicle;
        player.vehicleType = vt;
        syncVehicleButtons(vt);
    }
    
    // Aktualizacja głośności w czasie rzeczywistym
    if (audio.masterVolumeNode) {
        // master volume nie zmieniamy, zmieniamy music i sfx w audio managerze
    }
    
    if (gfx === 'high') particleLimit = 400;
    else if (gfx === 'medium') particleLimit = 150;
    else particleLimit = 50;
}

// ==========================================================================
// ROZGRYWKA (Pętla i Aktualizacja Fizyki)
// ==========================================================================
function startGame() {
    // Pobierz imię gracza z pola przed startem
    const nameInput = document.getElementById('player-name-start');
    if (nameInput) {
        let name = nameInput.value.trim().toUpperCase().substring(0, 8);
        if (!name) name = "KIEROWCA";
        player.name = name;
        localStorage.setItem('tennet_last_name', name);
    }
    
    // Pobierz wybrany pojazd z interfejsu
    const activeVehicleBtn = document.querySelector('#menu-start .vehicle-btn.active');
    if (activeVehicleBtn) {
        player.vehicleType = activeVehicleBtn.dataset.vehicle || 'car';
    }

    // Reset stanu
    player.x = 0;
    player.z = 0;
    player.y = 0;
    player.speed = 80; // Prędkość początkowa
    player.targetX = 0;
    player.shield = CONFIG.shieldMax;
    player.invincibleTime = 0;
    
    truck.x = 0;
    truck.z = CONFIG.truckBaseZ;
    truck.speed = 80;
    truck.targetX = 0;
    truck.laneChangeTimer = 0;
    
    drums = [];
    particles = [];
    distanceTraveled = 0;
    gameWave = 1;
    waveTimer = 0;
    timeOfDay = 0;
    shoulderTimer = 0;
    
    // Reset systemu znaków miast
    // Przemieszaj miasta (zachowaj Skawina na początku)
    const shuffled = POLISH_CITIES.slice(1);
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    window._cityOrder = ['Skawina', ...shuffled];
    
    citySignState.nextCityIndex = 1; // Pierwsze miasto do osiągnięcia to indeks 1
    citySignState.signPassed = false;
    citySignState.pendingSignObj = null;
    
    drumSpawnInterval = 7000; // Połowę mniej bębnów na start (odstęp 7 sekund)
    maxDrumsInWave = 1;
    baseDrumSpeedZ = 390; // Prędkość 3x większa niż poprzednio (130 * 3 = 390)
    
    hideMenu('menu-start');
    hideMenu('menu-pause');
    hideMenu('menu-gameover');
    document.getElementById('hud').classList.remove('hidden');
    
    gameState = 'PLAYING';
    lastTime = performance.now();
    
    // Inicjalizacja audio i pierwsza tabliczka
    audio.init();
    audio.startMusic();
    
    // Spawn pierwszej tabliczki z nazwą miasta - pojawi się ~800m przed graczem
    setTimeout(() => spawnNextCitySign(), 100);
}


function pauseGame() {
    if (gameState !== 'PLAYING') return;
    gameState = 'PAUSED';
    audio.stopEngine();
    showMenu('menu-pause');
    const warningEl = document.getElementById('shoulder-warning');
    if (warningEl) warningEl.classList.add('hidden');
}

function resumeGame() {
    if (gameState !== 'PAUSED') return;
    hideMenu('menu-pause');
    gameState = 'PLAYING';
    lastTime = performance.now();
}

function gameOver() {
    gameState = 'GAMEOVER';
    audio.stopEngine();
    audio.stopMusic();
    audio.playCrash();
    
    document.getElementById('hud').classList.add('hidden');
    
    const warningEl = document.getElementById('shoulder-warning');
    if (warningEl) warningEl.classList.add('hidden');
    
    // Ustalanie rekordów
    const finalDist = Math.floor(distanceTraveled);
    document.getElementById('final-distance').innerText = `${finalDist} m`;
    
    const isNewHigh = checkIsHighScore(finalDist);
    if (isNewHigh) {
        document.getElementById('new-record-banner').classList.remove('hidden');
    } else {
        document.getElementById('new-record-banner').classList.add('hidden');
    }
    
    // Automatyczny zapis wyniku pod imieniem wybranym przed startem
    saveHighScore(player.name, finalDist);
    
    showMenu('menu-gameover');
    
    // Efekt zniszczenia - mnóstwo iskier!
    createCrashExplosion(0, 0);
}

// Główna pętla gry (requestAnimationFrame)
function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    let dt = (timestamp - lastTime) / 1000;
    if (dt < 0) dt = 0; // Prevent negative dt
    dt = Math.min(dt, 0.1); // Guard against long lag frames (max 100ms)
    lastTime = timestamp;

    if (gameState === 'PLAYING') {
        updatePhysics(dt);
    }
    
    // Renderowanie sceny niezależnie od stanu (umożliwia pauzę)
    renderScene();
    
    requestAnimationFrame(gameLoop);
}

// Aktualizacja fizyki gry
function updatePhysics(dt) {
    // Współczynnik prędkości gry (zmiana prędkości auta zmienia prędkość całej gry)
    const speedFactor = player.speed / 120; // 120 km/h to baza (1.0x prędkości gry)

    // 1. Obsługa czasu i fali trudności
    waveTimer += dt * 1000 * speedFactor;
    timeOfDay += dt * 1000 * speedFactor;
    
    // Sprawdzenie czy gracz minął tabliczkę z nazwą miasta (awans na kolejny poziom)
    if (citySignState.pendingSignObj && !citySignState.signPassed) {
        const signWorldZ = citySignState.signZ;
        const playerWorldZ = player.z % (segments.length * CONFIG.segmentLength);
        const dist = signWorldZ - playerWorldZ;
        // Gracz minął tablicę (przekroczył jej pozycję Z)
        if (dist < 0 && dist > -CONFIG.segmentLength * 20) {
            citySignState.signPassed = true;
            advanceToNextCity();
        }
    }
    
    // 2. Sterowanie graczem i fizyka prędkości
    let isMovingX = false;
    let targetSpeed = 160; // Domyślna prędkość rejsowa
    
    // Sterowanie klawiaturą
    if (keys['ArrowUp'] || keys['w'] || keys['W']) {
        targetSpeed = CONFIG.maxSpeed;
    } else if (keys['ArrowDown'] || keys['s'] || keys['S']) {
        targetSpeed = 40;
        player.isBraking = true;
    } else {
        player.isBraking = false;
    }
    
    // Sterowanie w poziomie (zależne od trybu inputMode)
    const steerSpeed = 2.4; // Szybkość przemieszczania w poziomie
    if (inputMode === 'keyboard') {
        if (keys['ArrowLeft'] || keys['a'] || keys['A']) {
            player.x -= steerSpeed * dt;
            player.steerAngle = Math.max(-0.25, player.steerAngle - 2.5 * dt);
        } else if (keys['ArrowRight'] || keys['d'] || keys['D']) {
            player.x += steerSpeed * dt;
            player.steerAngle = Math.min(0.25, player.steerAngle + 2.5 * dt);
        } else {
            // Stabilizacja kąta pochylenia
            player.steerAngle += (0 - player.steerAngle) * 8 * dt;
        }
    } else if (inputMode === 'mouse') {
        if (Math.abs(player.targetX - player.x) > 0.02) {
            const dx = player.targetX - player.x;
            const speedMultiplier = Math.min(1.5, Math.abs(dx) * 4);
            player.x += Math.sign(dx) * steerSpeed * speedMultiplier * dt;
            player.steerAngle = Math.min(0.25, Math.max(-0.25, dx * 0.4));
        } else {
            // Stabilizacja kąta pochylenia
            player.steerAngle += (0 - player.steerAngle) * 8 * dt;
        }
    }
    
    // Ograniczenie ruchu gracza do szerokości asfaltu (nie wyjeżdża na trawę)
    player.x = Math.max(-0.95, Math.min(0.95, player.x));
    
    // Sprawdzanie jazdy na poboczu (pobocze zaczyna się przy |x| >= 0.85)
    if (Math.abs(player.x) >= 0.85) {
        shoulderTimer += dt * 1000;
        
        // Wyświetlanie ostrzeżenia w HUD
        const warningEl = document.getElementById('shoulder-warning');
        if (warningEl) {
            warningEl.classList.remove('hidden');
            const countdown = Math.max(0, Math.ceil((5000 - shoulderTimer) / 1000));
            document.getElementById('shoulder-countdown').innerText = countdown;
        }
        
        if (shoulderTimer >= 5000) {
            shoulderTimer = 0; // Zresetuj licznik
            
            if (player.invincibleTime <= 0) {
                player.shield--;
                player.invincibleTime = 1500; // Chwilowa nieśmiertelność
                
                audio.playCrash();
                triggerScreenShake();
                triggerDangerFlash();
                updateShieldUI();
                
                if (player.shield <= 0) {
                    gameOver();
                }
            }
        }
    } else {
        shoulderTimer = 0;
        const warningEl = document.getElementById('shoulder-warning');
        if (warningEl) {
            warningEl.classList.add('hidden');
        }
    }
    
    // Przyspieszanie i opór powietrza
    if (player.speed < targetSpeed) {
        player.speed += CONFIG.accel * dt;
    } else if (player.speed > targetSpeed) {
        const decelRate = player.isBraking ? CONFIG.breaking : CONFIG.decel;
        player.speed -= decelRate * dt;
    }
    
    // Ruch do przodu (zwiększanie odległości)
    player.z += (player.speed * 10 / 36) * dt; // Zamiana km/h na jednostki/s (skala gry)
    distanceTraveled = player.z / 15; // Przelicznik na metry do wyświetlenia
    
    // Siła odśrodkowa na zakrętach
    const currentSegment = findSegment(player.z);
    if (currentSegment && currentSegment.curve !== 0) {
        player.x -= currentSegment.curve * CONFIG.centrifugal * (player.speed / CONFIG.maxSpeed) * dt;
    }
    
    // Obsługa czasu nieśmiertelności (migotanie)
    if (player.invincibleTime > 0) {
        player.invincibleTime -= dt * 1000;
    }
    
    // Aktualizacja dźwięku silnika
    audio.setEngineSpeed(player.speed / CONFIG.maxSpeed);
    
    // 3. Logika ciężarówki TenneT (Truck)
    // Ciężarówka jedzie ze stałą prędkością dostosowaną do gracza, by nie uciec
    const idealTruckDist = 650; // Idealny dystans od gracza
    const actualDist = truck.z - player.z;
    
    // Dociąganie prędkości ciężarówki, by zachować bezpieczny dystans
    let desiredTruckSpeed = player.speed;
    if (actualDist > idealTruckDist + 100) desiredTruckSpeed = player.speed * 0.85;
    if (actualDist < idealTruckDist - 100) desiredTruckSpeed = player.speed * 1.15;
    
    truck.speed += (desiredTruckSpeed - truck.speed) * 2 * dt;
    truck.z += (truck.speed * 10 / 36) * dt;
    
    // Zmiany pasów przez ciężarówkę
    truck.laneChangeTimer -= dt * 1000 * speedFactor;
    if (truck.laneChangeTimer <= 0) {
        // Wybór losowego nowego pasa (-0.6, 0.0, 0.6)
        const lanes = [-0.6, 0, 0.6];
        const currentLaneIndex = lanes.indexOf(truck.targetX);
        let nextIndex;
        do {
            nextIndex = Math.floor(Math.random() * 3);
        } while (nextIndex === currentLaneIndex);
        
        truck.targetX = lanes[nextIndex];
        truck.laneChangeTimer = 3000 + Math.random() * 4000; // Zmiana co 3-7 sekund
        
        // Aktywacja kierunkowskazu
        truck.indicatorActive = true;
        truck.indicatorState = truck.targetX < truck.x ? 1 : 2; // 1 = lewy, 2 = prawy
        truck.indicatorBlinkTimer = 1800; // miga przez 1.8s
    }
    
    // Ruch ciężarówki w osi X do zadanego pasa
    if (Math.abs(truck.targetX - truck.x) > 0.01) {
        const dx = truck.targetX - truck.x;
        truck.x += Math.sign(dx) * 0.9 * dt; // Płynne przemieszczenie
    } else {
        truck.x = truck.targetX;
    }
    
    // Kierunkowskazy
    if (truck.indicatorActive) {
        truck.indicatorBlinkTimer -= dt * 1000;
        if (truck.indicatorBlinkTimer <= 0) {
            truck.indicatorActive = false;
            truck.indicatorState = 0;
        }
    }
    
    // Generowanie spalin ciężarówki
    if (Math.random() < 0.3) {
        createExhaustParticle(truck.x, truck.z);
    }
    
    // 4. Zrzucanie bębnów (Drums Spawning)
    nextDrumSpawnTime -= dt * 1000 * speedFactor;
    if (nextDrumSpawnTime <= 0) {
        // Zrzucamy bęben
        spawnDrums();
        nextDrumSpawnTime = drumSpawnInterval + Math.random() * 1000;
    }
    
    // 5. Fizyka bębnów
    for (let i = drums.length - 1; i >= 0; i--) {
        const drum = drums[i];
        
        // Ruch bębnów w osi Z (toczą się w stronę gracza - prędkość wsteczna)
        const drumSpeedUnits = (drum.speedZ * 10 / 36);
        drum.z -= drumSpeedUnits * dt * speedFactor;
        
        // Ruch w osi X (niektóre bębny toczą się lekko skośnie)
        drum.x += drum.driftX * dt;
        // Bębny nie mogą wypaść całkowicie poza pobocze
        if (drum.x < -1.2 || drum.x > 1.2) {
            drum.driftX = -drum.driftX; // Odbicie od krawędzi
        }
        
        // Fizyka spadania / odbijania się od drogi (Y) - skalowana prędkością gry
        if (drum.y > 0 || drum.velY !== 0) {
            drum.velY -= 15 * dt * speedFactor; // Grawitacja
            drum.y += drum.velY * 10 * dt * speedFactor;
            
            if (drum.y <= 0) {
                drum.y = 0;
                drum.velY = -drum.velY * drum.bounceCoeff; // Odbicie tłumione
                if (Math.abs(drum.velY) < 1.0) {
                    drum.velY = 0; // Zatrzymanie odbijania
                }
                
                // Tworzenie iskier/kurzu przy uderzeniu o asfalt
                createSparks(drum.x, drum.z, 8);
            }
        }
        
        // Obrót bębna wokół własnej osi
        drum.rotation += (4.0 + (player.speed / 100)) * dt;
        
        // Emisja pyłu spod toczącego się bębna na ziemi
        if (drum.y === 0 && Math.random() < 0.2) {
            createDustParticle(drum.x, drum.z);
        }
        
        // Usunięcie bębna, gdy minie kamerę gracza
        if (drum.z < player.z - 100) {
            drums.splice(i, 1);
            continue;
        }
        
        // 6. Detekcja kolizji z graczem
        // Bęben i auto muszą być blisko w osi Z i w osi X.
        // Jeśli bęben leci wysoko (drum.y > 30), gracz może przejechać pod nim!
        const collisionZThreshold = 45; // Odległość kolizji wzdłuż drogi
        const collisionXThreshold = 0.28; // Szerokość kolizji (dopasowana do obrysu pojazdu)
        
        if (Math.abs(drum.z - player.z) < collisionZThreshold && 
            Math.abs(drum.x - player.x) < collisionXThreshold &&
            drum.y < 35) {
            
            if (drum.color === 'green') {
                // Zielony bęben: zerowanie uszkodzeń (pełne uleczenie)
                player.shield = CONFIG.shieldMax;
                updateShieldUI();
                audio.playScoreSound();
                
                // Bęben znika po zderzeniu
                drums.splice(i, 1);
                continue; // Przejdź do kolejnego bębna
            }
            
            // Kolizja z niebieskim bębnem
            if (player.invincibleTime <= 0) {
                player.shield--;
                player.invincibleTime = 1500; // 1.5 sekundy nieśmiertelności
                
                audio.playCrash();
                triggerScreenShake();
                triggerDangerFlash();
                
                // Eksplozja cząsteczek w miejscu zderzenia
                createCrashExplosion((drum.x + player.x) / 2, player.z + 20);
                
                // Bęben znika po zderzeniu
                drums.splice(i, 1);
                
                // Aktualizacja paska tarcz w UI
                updateShieldUI();
                
                if (player.shield <= 0) {
                    gameOver();
                }
            } else {
                // Gracz jest chwilowo nieśmiertelny, ale bęben również znika po zderzeniu
                drums.splice(i, 1);
            }
            continue; // Przejdź do kolejnego bębna
        }
    }
    
    // 7. Aktualizacja cząsteczek
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.z -= (player.speed * 0.05) * dt; // Przesunięcie cząsteczek w tył wg prędkości gracza
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy -= (p.gravity || 0) * dt;
        p.life -= dt;
        
        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }
    
    // Generowanie drobnych cząsteczek prędkości w tle (efekt pędu)
    if (particles.length < particleLimit && player.speed > 50 && Math.random() < 0.15) {
        createSpeedLine();
    }
    
    // Aktualizacja wskaźników tekstowych HUD oraz licznika kilometrów (odometer)
    const currentDist = Math.floor(distanceTraveled);
    const odometerStr = String(currentDist).padStart(6, '0');
    const odometerCurrentEl = document.getElementById('odometer-current');
    if (odometerCurrentEl) {
        odometerCurrentEl.innerText = odometerStr;
    }
    
    // Pobranie i aktualizacja rekordu
    const hiScore = Math.max(currentDist, getHighScore());
    const hiStr = String(hiScore).padStart(6, '0');
    const odometerHiEl = document.getElementById('odometer-hi');
    if (odometerHiEl) {
        odometerHiEl.innerText = hiStr;
    }
    
    document.getElementById('speed-val').innerText = `${Math.floor(player.speed)} km/h`;
    document.getElementById('wave-val').innerText = gameWave;
}

// Zrzucanie bębna z ciężarówki
function spawnDrums() {
    // Liczba bębnów do zrzutu w tej fali (losowo do limitu fali)
    const count = Math.floor(Math.random() * maxDrumsInWave) + 1;
    
    // Ostrzeżenie dźwiękowe
    audio.playWarning();
    
    for (let i = 0; i < count; i++) {
        // Określamy przesunięcie X, aby bębny nie nachodziły na siebie w 100%
        const offsetMultiplier = i === 0 ? 0 : (Math.random() > 0.5 ? 1 : -1);
        const spawnX = truck.x + offsetMultiplier * 0.15;
        
        // Bębny mają jechać w linii prostej (driftX = 0) do fali 14
        // Dopiero od poziomu 15 mogą jeździć w lewo/prawo (dryfować)
        let driftX = 0;
        if (gameWave >= 15 && Math.random() < 0.5) {
            driftX = (Math.random() * 2 - 1) * 0.15; // Ograniczony dryf (bezpieczny i wymijalny)
        }
        
        // Zjawiskowy bounce na starcie
        const initialVelY = 4 + Math.random() * 3;
        
        // Szansa 5% na zielony bęben leczący, w innym wypadku błękitny/niebieski
        const isGreen = Math.random() < 0.05;
        
        drums.push({
            x: spawnX,
            z: truck.z - 20, // tuż za ciężarówką
            y: 45,            // wysokość platformy ciężarówki
            velY: initialVelY,
            speedZ: baseDrumSpeedZ, // prędkość toczenia w tył (szybko!)
            driftX: driftX,
            rotation: 0,
            bounceCoeff: 0.6, // współczynnik sprężystości
            color: isGreen ? 'green' : 'blue', // typ bębna (niebieski lub leczący zielony)
            scale: 1
        });
    }
}

// Aktualizacja paska życia w HUD
function updateShieldUI() {
    const bar = document.getElementById('shield-bar-inner');
    const percentage = (player.shield / CONFIG.shieldMax) * 100;
    bar.style.width = `${percentage}%`;
    
    if (player.shield === 3) {
        bar.style.background = 'linear-gradient(90deg, #00FF87 0%, #60EFFF 100%)';
        bar.style.boxShadow = '0 0 10px rgba(0, 255, 135, 0.5)';
    } else if (player.shield === 2) {
        bar.style.background = 'linear-gradient(90deg, #FF9F00 0%, #FFCC00 100%)';
        bar.style.boxShadow = '0 0 10px rgba(255, 159, 0, 0.5)';
    } else {
        bar.style.background = 'linear-gradient(90deg, #FF3E3E 0%, #FF6B6B 100%)';
        bar.style.boxShadow = '0 0 10px rgba(255, 62, 62, 0.5)';
    }
}

// Efekt powiadomienia o nowej fali
function showWaveNotification() {
    // Wywoływana teraz z advanceToNextCity - zachowana dla kompatybilności
}

// Awans na kolejny poziom po przejechaniu tabliczki z nazwą miasta
function advanceToNextCity() {
    gameWave++;
    audio.playScoreSound();
    
    // Zwiększanie trudności
    drumSpawnInterval = Math.max(900, 7000 - (gameWave * 800));
    baseDrumSpeedZ = Math.min(480, 390 + (gameWave * 20));
    if (gameWave <= 2) maxDrumsInWave = 1;
    else if (gameWave <= 4) maxDrumsInWave = 2;
    else maxDrumsInWave = 3;
    
    // Pokaż powiadomienie o nowym mieście
    const cityOrder = window._cityOrder || POLISH_CITIES;
    const arrivedCity = cityOrder[(citySignState.nextCityIndex - 1) % cityOrder.length];
    showCityLevelNotification(arrivedCity, gameWave);
    
    // Spawn kolejnego znaku
    citySignState.nextCityIndex++;
    citySignState.signPassed = false;
    citySignState.pendingSignObj = null;
    setTimeout(() => spawnNextCitySign(), 200);
}

// Umieść tabliczkę z nazwą następnego miasta ~800m przed graczem
function spawnNextCitySign() {
    if (gameState !== 'PLAYING') return;
    
    const cityOrder = window._cityOrder || POLISH_CITIES;
    const cityName = cityOrder[citySignState.nextCityIndex % cityOrder.length];
    
    // Pozycja Z ~600-900 segmentów przed graczem (w przestrzeni świata)
    const segmentsAhead = 180 + Math.floor(Math.random() * 60); // ~180-240 segmentów
    const playerSegIdx = Math.floor(player.z / CONFIG.segmentLength);
    const signSegIdx = (playerSegIdx + segmentsAhead) % segments.length;
    const signZ = signSegIdx * CONFIG.segmentLength + Math.floor(player.z / (segments.length * CONFIG.segmentLength)) * (segments.length * CONFIG.segmentLength);
    
    const signObj = {
        x: 1380,           // Po prawej stronie drogi
        z: signZ,
        y: 0,
        type: 'city_sign',
        cityName: cityName,
        scale: 1.4,        // Wyraźnie widoczna
        isLevelSign: true  // Oznaczenie że to tabliczka poziomu
    };
    
    roadsideObjects.push(signObj);
    // Dodaj lustrzaną tabliczkę po lewej stronie
    roadsideObjects.push({
        ...signObj,
        x: -1380
    });
    
    citySignState.signZ = signZ;
    citySignState.signPassed = false;
    citySignState.pendingSignObj = signObj;
}

// Powiadomienie o przyjeździe do miasta (ekranowe)
function showCityLevelNotification(cityName, wave) {
    const el = document.createElement('div');
    el.style.cssText = `
        position: absolute;
        top: 28%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 15;
        text-align: center;
        pointer-events: none;
        animation: cityArrivalFade 3.5s ease-out forwards;
    `;
    
    // Polska tabliczka drogowa (zielona)
    el.innerHTML = `
        <div style="
            background: #0F6938;
            border: 4px solid white;
            padding: 10px 32px 14px;
            border-radius: 4px;
            box-shadow: 0 0 30px rgba(0,0,0,0.8), 0 0 0 7px #0F6938, 0 0 0 10px white;
            display: inline-block;
            min-width: 260px;
        ">
            <div style="
                font-family: var(--font-heading);
                font-size: 13px;
                letter-spacing: 3px;
                color: rgba(255,255,255,0.7);
                margin-bottom: 4px;
            ">POZIOM ${wave}</div>
            <div style="
                font-family: 'Inter', sans-serif;
                font-size: 36px;
                font-weight: 800;
                color: #FFFFFF;
                letter-spacing: 1px;
                text-shadow: 0 2px 8px rgba(0,0,0,0.5);
            ">${cityName}</div>
            <div style="
                font-family: var(--font-heading);
                font-size: 11px;
                letter-spacing: 2px;
                color: rgba(255,255,255,0.6);
                margin-top: 4px;
            ">PRĘDKOŚĆ ++</div>
        </div>
    `;
    
    document.getElementById('game-container').appendChild(el);
    setTimeout(() => el.remove(), 3500);
}


// Potrząsanie ekranem (Screen Shake)
function triggerScreenShake() {
    const container = document.getElementById('game-container');
    container.classList.add('shake-animation');
    setTimeout(() => {
        container.classList.remove('shake-animation');
    }, 400);
}

// Czerwony błysk na ekranie
function triggerDangerFlash() {
    const flash = document.getElementById('danger-flash');
    flash.classList.remove('hidden');
    setTimeout(() => {
        flash.classList.add('hidden');
    }, 500);
}

// ==========================================================================
// SYSTEM CZĄSTECZEK (Visual FX Particles)
// ==========================================================================
function createSpeedLine() {
    const x = Math.random() * 3.0 - 1.5; // Losowy pas i okolice
    const z = player.z + 1000 + Math.random() * 1000;
    particles.push({
        type: 'speedline',
        x: x,
        z: z,
        y: Math.random() * 300,
        vx: 0,
        vy: 0,
        life: 1.5,
        color: 'rgba(255, 255, 255, 0.08)',
        w: 2,
        h: 150
    });
}

function createExhaustParticle(truckX, truckZ) {
    if (particles.length > particleLimit) return;
    particles.push({
        type: 'smoke',
        x: truckX - 0.2 + (Math.random() * 0.1), // Wylot z rury
        z: truckZ - 20,
        y: 10 + Math.random() * 5,
        vx: -0.1 + Math.random() * 0.2,
        vy: 1.0 + Math.random() * 2,
        life: 0.8 + Math.random() * 0.5,
        color: `rgba(80, 85, 95, ${0.15 + Math.random() * 0.15})`,
        size: 5 + Math.random() * 10
    });
}

function createDustParticle(drumX, drumZ) {
    if (particles.length > particleLimit) return;
    particles.push({
        type: 'dust',
        x: drumX + (Math.random() * 0.2 - 0.1),
        z: drumZ,
        y: 1,
        vx: (Math.random() * 2 - 1) * 0.5,
        vy: 0.5 + Math.random() * 1.5,
        life: 0.4 + Math.random() * 0.4,
        color: `rgba(240, 240, 240, ${0.1 + Math.random() * 0.15})`,
        size: 3 + Math.random() * 6
    });
}

function createSparks(x, z, count) {
    const actualCount = Math.min(count, particleLimit - particles.length);
    for (let i = 0; i < actualCount; i++) {
        particles.push({
            type: 'spark',
            x: x,
            z: z,
            y: 2,
            vx: (Math.random() * 2 - 1) * 2,
            vy: 3 + Math.random() * 5,
            gravity: 12,
            life: 0.3 + Math.random() * 0.4,
            color: Math.random() > 0.4 ? 'rgba(255, 140, 0, 0.9)' : 'rgba(255, 220, 100, 0.9)',
            size: 1 + Math.random() * 2
        });
    }
}

function createCrashExplosion(x, z) {
    // Dużo ognia, dymu i iskier
    const count = particleLimit === 400 ? 120 : (particleLimit === 150 ? 50 : 20);
    
    for (let i = 0; i < count; i++) {
        const isSpark = Math.random() > 0.4;
        
        particles.push({
            type: isSpark ? 'spark' : 'smoke',
            x: x + (Math.random() * 0.4 - 0.2),
            z: z + (Math.random() * 10 - 5),
            y: 5 + Math.random() * 15,
            vx: (Math.random() * 2 - 1) * 5,
            vy: (Math.random() * 2 - 1) * 4 + 4,
            gravity: isSpark ? 8 : -2,
            life: 0.5 + Math.random() * 1.2,
            color: isSpark 
                ? (Math.random() > 0.3 ? '#FF5F00' : '#FFDD00') 
                : `rgba(40, 40, 40, ${0.4 + Math.random() * 0.4})`,
            size: isSpark ? 2 + Math.random() * 3 : 15 + Math.random() * 25
        });
    }
}

// Helper to calculate blended colors for day-night cycle (2-minute cycle)
function getCycleColors(timeMs) {
    if (timeMs < 0) timeMs = 0;
    const CYCLE_DURATION = 120000; // 2 min
    const phase = (timeMs % CYCLE_DURATION) / CYCLE_DURATION;
    
    // Define palettes for the 4 states:
    // 0: Sunrise, 1: Day, 2: Sunset, 3: Night
    const palettes = [
        { // 0: Sunrise
            SKY_TOP: '#1E2942',
            SKY_BOT: '#FF7E5F',
            SUN: '#FFE066',
            MOUNT_BACK: '#2B1D38',
            MOUNT_FRONT: '#3A234C',
            GRASS_LIGHT: '#254E25', // Warm dawn green
            GRASS_DARK: '#1B3A1B',  // Darker dawn green
            ROAD_LIGHT: '#444D5A',  // Soft dawn gray
            ROAD_DARK: '#373F4B'   // Darker dawn gray
        },
        { // 1: Day
            SKY_TOP: '#00BFFF',
            SKY_BOT: '#87CEEB',
            SUN: '#FFFFFF',
            MOUNT_BACK: '#1C3B5E',
            MOUNT_FRONT: '#255280',
            GRASS_LIGHT: '#348C31', // Vibrant day green
            GRASS_DARK: '#276C25',  // Vibrant day green dark
            ROAD_LIGHT: '#647285',  // Clean asphalt gray
            ROAD_DARK: '#546172'   // Clean asphalt gray dark
        },
        { // 2: Sunset (cyberpunk)
            SKY_TOP: '#050B14',
            SKY_BOT: '#150624',
            SUN: '#FF5F00',
            MOUNT_BACK: '#0B0A1A',
            MOUNT_FRONT: '#140D2B',
            GRASS_LIGHT: '#1B3A1C', // Dark neon sunset green
            GRASS_DARK: '#122913',  // Dark neon sunset green dark
            ROAD_LIGHT: '#2F3642',  // Cool dark road gray
            ROAD_DARK: '#242A35'   // Cool dark road gray dark
        },
        { // 3: Night
            SKY_TOP: '#020408',
            SKY_BOT: '#050A15',
            SUN: '#000000',
            MOUNT_BACK: '#03050A',
            MOUNT_FRONT: '#070A12',
            GRASS_LIGHT: '#0D210F', // Moonlight dark green (visible!)
            GRASS_DARK: '#071408',  // Moonlight dark green dark
            ROAD_LIGHT: '#1C212B',  // Midnight visible road gray
            ROAD_DARK: '#13171F'   // Midnight visible road gray dark
        }
    ];
    
    const numStates = palettes.length;
    const scaledPhase = phase * numStates;
    const idx1 = Math.floor(scaledPhase) % numStates;
    const idx2 = (idx1 + 1) % numStates;
    const weight = scaledPhase - Math.floor(scaledPhase);
    
    const p1 = palettes[idx1];
    const p2 = palettes[idx2];
    
    const blended = {};
    for (const key in p1) {
        blended[key] = blendColors(p1[key], p2[key], weight);
    }
    
    if (!blended.SKY_TOP) {
        console.error("DEBUG: blended.SKY_TOP is undefined! details: " + JSON.stringify({
            timeMs,
            phase,
            idx1,
            idx2,
            weight,
            p1_defined: !!p1,
            p2_defined: !!p2,
            p1_keys: p1 ? Object.keys(p1) : [],
            p2_keys: p2 ? Object.keys(p2) : []
        }));
        // Fallback to prevent crash
        return {
            SKY_TOP: '#050B14',
            SKY_BOT: '#150624',
            SUN: '#FF5F00',
            MOUNT_BACK: '#0B0A1A',
            MOUNT_FRONT: '#140D2B',
            GRASS_LIGHT: '#1B3A1C',
            GRASS_DARK: '#122913',
            ROAD_LIGHT: '#2F3642',
            ROAD_DARK: '#242A35',
            phase: 0
        };
    }
    
    blended.phase = phase;
    return blended;
}

// ==========================================================================
// SILNIK RENDERUJĄCY (Canvas Draw Calls)
// ==========================================================================
function renderScene() {
    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);
    
    // Wyczyszczenie ekranu
    ctx.clearRect(0, 0, width, height);
    
    // Oblicz kolory cyklu dobowego
    const currentColors = getCycleColors(timeOfDay);
    
    // 1. Rysowanie nieba i tła
    const skyGrad = ctx.createLinearGradient(0, 0, 0, height * 0.45);
    skyGrad.addColorStop(0, currentColors.SKY_TOP);
    skyGrad.addColorStop(1, currentColors.SKY_BOT);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, height * 0.45);
    
    // 1.5 Rysowanie tła ziemi (trawa) jako płynny gradient (usuwa efekt poziomych pasków)
    const grassGrad = ctx.createLinearGradient(0, height * 0.45, 0, height);
    grassGrad.addColorStop(0, currentColors.GRASS_DARK);
    grassGrad.addColorStop(1, currentColors.GRASS_LIGHT);
    ctx.fillStyle = grassGrad;
    ctx.fillRect(0, height * 0.45, width, height * 0.55);
    
    // Słońce / Księżyc na horyzoncie
    const phase = currentColors.phase;
    
    if (phase >= 0.0 && phase < 0.75) {
        // Rysuj Słońce
        // Oblicz wysokość słońca na podstawie fazy
        let sunY = height * 0.45;
        if (phase < 0.25) { // Wschód
            const p = phase / 0.25;
            sunY = height * 0.45 - (height * 0.25) * p;
        } else if (phase >= 0.25 && phase < 0.50) { // Południe
            sunY = height * 0.2;
        } else { // Zachód
            const p = (phase - 0.5) / 0.25;
            sunY = height * 0.2 + (height * 0.25) * p;
        }
        
        const sunRadius = Math.min(width, height) * 0.10;
        ctx.beginPath();
        if (sunY < height * 0.4) {
            ctx.arc(width / 2, sunY, sunRadius, 0, 2 * Math.PI);
        } else {
            ctx.arc(width / 2, sunY, sunRadius, Math.PI, 2 * Math.PI);
        }
        
        const sunGrad = ctx.createRadialGradient(width/2, sunY, 5, width/2, sunY, sunRadius);
        sunGrad.addColorStop(0, '#FFE066');
        sunGrad.addColorStop(0.3, currentColors.SUN);
        sunGrad.addColorStop(1, 'rgba(21, 6, 36, 0)');
        ctx.fillStyle = sunGrad;
        ctx.fill();
    } else {
        // Rysuj Księżyc w nocy (wschodzi, góruje, zachodzi)
        let moonY = height * 0.45;
        const nightPhase = (phase - 0.75) / 0.25; // 0 do 1
        if (nightPhase < 0.5) {
            const p = nightPhase / 0.5;
            moonY = height * 0.45 - (height * 0.25) * p;
        } else {
            const p = (nightPhase - 0.5) / 0.5;
            moonY = height * 0.2 + (height * 0.25) * p;
        }
        
        const moonRadius = Math.min(width, height) * 0.05;
        ctx.save();
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#00F2FE';
        
        // Cienki świecący sierp księżyca
        ctx.fillStyle = '#E6F8FF';
        ctx.beginPath();
        ctx.arc(width / 2, moonY, moonRadius, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.shadowBlur = 0; // Wyłączamy cień na wycinanie
        ctx.fillStyle = currentColors.SKY_TOP;
        ctx.beginPath();
        ctx.arc(width / 2 - moonRadius * 0.35, moonY - moonRadius * 0.1, moonRadius * 0.95, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.restore();
    }
    
    // Góry w tle (Parallax) z dynamicznymi kolorami
    const cameraSegment = findSegment(player.z);
    const curveOffset = cameraSegment ? cameraSegment.world.p1.x : 0;
    
    drawParallaxMountains(width, height, curveOffset * 25, 0.45, currentColors);
    
    // 2. Przygotowanie kamery do projekcji
    const playerSegment = findSegment(player.z);
    const playerPercent = (player.z % CONFIG.segmentLength) / CONFIG.segmentLength;
    const playerY = playerSegment.world.p1.y + (playerSegment.world.p2.y - playerSegment.world.p1.y) * playerPercent;
    
    const cameraZ = player.z - 240; // 240 jednostek z tyłu za graczem
    const cameraY = playerY + CONFIG.cameraHeight;
    const cameraX = player.x * CONFIG.roadWidth * 0.4 + playerSegment.world.p1.x;
    
    // 3. Rysowanie drogi (od tyłu do przodu) - przycinamy do obszaru poniżej horyzontu
    const horizonY = height * 0.45;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, horizonY, width, height - horizonY);
    ctx.clip();
    
    const startSegmentIndex = Math.floor(cameraZ / CONFIG.segmentLength);
    const endSegmentIndex = startSegmentIndex + CONFIG.drawDistance;
    
    let maxSegments = segments.length;
    
    // Zbieramy punkty segmentów do narysowania
    const renderList = [];
    
    for (let i = startSegmentIndex; i < endSegmentIndex; i++) {
        const seg = segments[((i % maxSegments) + maxSegments) % maxSegments];
        const loopZ = Math.floor(i / maxSegments) * maxSegments * CONFIG.segmentLength;
        
        const p1World = {
            x: seg.world.p1.x,
            y: seg.world.p1.y,
            z: seg.world.p1.z + loopZ
        };
        const p2World = {
            x: seg.world.p2.x,
            y: seg.world.p2.y,
            z: seg.world.p2.z + loopZ
        };
        
        const p1Screen = projectPoint(p1World, cameraX, cameraY, cameraZ, width, height, 0);
        const p2Screen = projectPoint(p2World, cameraX, cameraY, cameraZ, width, height, 0);
        
        if (!p1Screen || !p2Screen || p2Screen.y >= p1Screen.y || p2Screen.y >= height) {
            continue;
        }
        
        renderList.push({
            segment: seg,
            p1: p1Screen,
            p2: p2Screen,
            z: p1World.z
        });
    }
    
    // Rysowanie segmentów drogi
    for (let i = renderList.length - 1; i >= 0; i--) {
        const item = renderList[i];
        const p1 = item.p1;
        const p2 = item.p2;
        const color = item.segment.color;
        
        // Oblicz współczynnik mgły (dla płynnego znikana na horyzoncie)
        const transZ = item.z - cameraZ;
        const maxDrawDist = CONFIG.drawDistance * CONFIG.segmentLength;
        const distancePercent = Math.max(0, Math.min(1, transZ / maxDrawDist));
        const fogFactor = Math.pow(distancePercent, 2.5); // Wykładnicza mgła dla naturalnego przejścia
        
        // B. Krawężnik (Rumble strips) z mgłą horyzontu
        const rumbleW1 = p1.w * 0.12;
        const rumbleW2 = p2.w * 0.12;
        const rumbleBaseColor = (item.segment.index % 6 < 3) ? COLORS.RUMBLE_WHITE : COLORS.RUMBLE_RED;
        ctx.fillStyle = blendColors(rumbleBaseColor, currentColors.SKY_BOT, fogFactor);
        
        drawPolygon(ctx, 
            p1.x - p1.w - rumbleW1, p1.y, 
            p1.x - p1.w, p1.y, 
            p2.x - p2.w, p2.y, 
            p2.x - p2.w - rumbleW2, p2.y
        );
        drawPolygon(ctx, 
            p1.x + p1.w, p1.y, 
            p1.x + p1.w + rumbleW1, p1.y, 
            p2.x + p2.w + rumbleW2, p2.y, 
            p2.x + p2.w, p2.y
        );
        
        // C. Nawierzchnia asfaltowa z dobowymi kolorami i mgłą horyzontu
        const roadBaseColor = (color === COLORS.ROAD_LIGHT) ? currentColors.ROAD_LIGHT : currentColors.ROAD_DARK;
        ctx.fillStyle = blendColors(roadBaseColor, currentColors.SKY_BOT, fogFactor);
        drawPolygon(ctx, 
            p1.x - p1.w, p1.y, 
            p1.x + p1.w, p1.y, 
            p2.x + p2.w, p2.y, 
            p2.x - p2.w, p2.y
        );
        
        // D. Linie wyznaczające pasy (dashed lines) z mgłą horyzontu
        if (item.segment.index % 6 < 3) {
            ctx.fillStyle = blendColors(COLORS.LANE_LINE, currentColors.SKY_BOT, fogFactor);
            const laneDiv = CONFIG.lanes;
            
            // Rysujemy linie przerywane między pasami
            for (let l = 1; l < laneDiv; l++) {
                // Przelicznik dla lewego i prawego pasa
                const ratio = -1 + (2 * l / laneDiv);
                
                const lineW1 = Math.max(1, p1.w * 0.015);
                const lineW2 = Math.max(1, p2.w * 0.015);
                
                drawPolygon(ctx,
                    p1.x + p1.w * ratio - lineW1, p1.y,
                    p1.x + p1.w * ratio + lineW1, p1.y,
                    p2.x + p2.w * ratio + lineW2, p2.y,
                    p2.x + p2.w * ratio - lineW2, p2.y
                );
            }
        }
    }
    
    // 4. Rysowanie obiektów w 3D (Cząsteczki prędkości w tle, Ciężarówka, Bębny)
    // Szykujemy tablicę obiektów do posortowania wg Z
    const spritesToRender = [];
    
    // Dodaj bębny
    drums.forEach(drum => {
        const seg = findSegment(drum.z);
        const yOffset = seg ? seg.world.p1.y : 0;
        
        const pt = {
            x: drum.x * CONFIG.roadWidth * 0.45 + (seg ? seg.world.p1.x : 0),
            y: yOffset,
            z: drum.z
        };
        const screen = projectPoint(pt, cameraX, cameraY, cameraZ, width, height, 0);
        if (screen) {
            spritesToRender.push({
                type: 'drum',
                z: drum.z,
                screen: screen,
                data: drum
            });
        }
    });
    
    // Dodaj ciężarówkę
    const truckSeg = findSegment(truck.z);
    const truckYWorld = truckSeg ? (truckSeg.world.p1.y + (truckSeg.world.p2.y - truckSeg.world.p1.y) * ((truck.z % CONFIG.segmentLength) / CONFIG.segmentLength)) : 0;
    const truckPt = {
        x: truck.x * CONFIG.roadWidth * 0.45 + (truckSeg ? truckSeg.world.p1.x : 0),
        y: truckYWorld + truck.y,
        z: truck.z
    };
    const truckScreen = projectPoint(truckPt, cameraX, cameraY, cameraZ, width, height, 0);
    if (truckScreen) {
        spritesToRender.push({
            type: 'truck',
            z: truck.z,
            screen: truckScreen,
            data: truck
        });
    }
    
    // Dodaj cząsteczki
    particles.forEach(p => {
        // Cząsteczki prędkości (speedline) są rysowane w 3D, inne (dym, iskry) też
        const seg = findSegment(p.z);
        const yBase = seg ? seg.world.p1.y : 0;
        const pt = {
            x: p.x * CONFIG.roadWidth * 0.45 + (seg ? seg.world.p1.x : 0),
            y: yBase + p.y,
            z: p.z
        };
        const screen = projectPoint(pt, cameraX, cameraY, cameraZ, width, height, 0);
        if (screen) {
            spritesToRender.push({
                type: 'particle',
                z: p.z,
                screen: screen,
                data: p
            });
        }
    });

    // Dodaj obiekty na poboczu (dekoracje) z obsługą nieskończonego zapętlenia drogi
    const maxZ = maxSegments * CONFIG.segmentLength;
    roadsideObjects.forEach(obj => {
        let objVirtualZ = obj.z + Math.floor((cameraZ - obj.z) / maxZ) * maxZ;
        if (objVirtualZ < cameraZ) objVirtualZ += maxZ;
        
        const transZ = objVirtualZ - cameraZ;
        if (transZ > 0 && transZ < CONFIG.drawDistance * CONFIG.segmentLength) {
            const seg = findSegment(objVirtualZ);
            const yOffset = seg ? seg.world.p1.y : 0;
            
            const pt = {
                x: obj.x + (seg ? seg.world.p1.x : 0),
                y: yOffset + obj.y,
                z: objVirtualZ
            };
            const screen = projectPoint(pt, cameraX, cameraY, cameraZ, width, height, 0);
            if (screen) {
                spritesToRender.push({
                    type: 'decoration',
                    z: objVirtualZ,
                    screen: screen,
                    data: obj
                });
            }
        }
    });
    
    // Sortowanie obiektów wg odległości (najpierw najdalsze z > najbliższe)
    spritesToRender.sort((a, b) => b.z - a.z);
    
    // Rysowanie posortowanych obiektów
    spritesToRender.forEach(sprite => {
        if (sprite.type === 'truck') {
            drawTenneTTruck(ctx, sprite.screen, sprite.data);
        } else if (sprite.type === 'drum') {
            drawCableDrum(ctx, sprite.screen, sprite.data);
        } else if (sprite.type === 'particle') {
            drawParticle(ctx, sprite.screen, sprite.data);
        } else if (sprite.type === 'decoration') {
            drawRoadsideObject(ctx, sprite.screen, sprite.data);
        }
    });
    
    // 5. Rysowanie gracza (na samym przodzie)
    // Gracz jest zawsze rysowany w dolnej części ekranu
    const playerScreenX = width / 2 + (player.x - (player.x * 0.1)) * (width * 0.15) * (CONFIG.cameraDepth / 0.8); 
    // Dodajemy lekkie podskakiwanie przy dużej prędkości
    const playerBounceY = Math.sin(player.z * 0.05) * (player.speed / CONFIG.maxSpeed) * 1.5;
    const playerScreenY = height * 0.88 + playerBounceY;
    
    // Kończymy przycinanie horyzontu przed rysowaniem pojazdu gracza
    ctx.restore();
    
    // Jeśli gracz jest po kolizji, migocze (invincibleTime)
    if (player.invincibleTime <= 0 || Math.floor(player.invincibleTime / 100) % 2 === 0) {
        if (player.vehicleType === 'forklift') {
            drawForklift(ctx, playerScreenX, playerScreenY, width * 0.198, player.steerAngle, player.isBraking);
        } else {
            drawPlayerCar(ctx, playerScreenX, playerScreenY, width * 0.198, player.steerAngle, player.isBraking);
        }
    }
}

// Rysowanie wielokątów drogi
function drawPolygon(ctx, x1, y1, x2, y2, x3, y3, x4, y4) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.lineTo(x4, y4);
    ctx.closePath();
    ctx.fill();
}

// Parallax góry w tle
function drawParallaxMountains(width, height, offset, horizonRatio, colors) {
    const horizon = height * horizonRatio;
    
    // Warstwa 1 (Dalsza)
    ctx.fillStyle = colors ? colors.MOUNT_BACK : COLORS.MOUNT_BACK;
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    for (let i = 0; i <= width; i += 20) {
        const xOffset = i + offset * 0.3;
        const mountainY = horizon - 40 - Math.sin(xOffset * 0.003) * 50 - Math.cos(xOffset * 0.008) * 20;
        ctx.lineTo(i, mountainY);
    }
    ctx.lineTo(width, horizon);
    ctx.closePath();
    ctx.fill();
    
    // Warstwa 2 (Bliższa)
    ctx.fillStyle = colors ? colors.MOUNT_FRONT : COLORS.MOUNT_FRONT;
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    for (let i = 0; i <= width; i += 15) {
        const xOffset = i + offset * 0.7;
        const mountainY = horizon - 20 - Math.sin(xOffset * 0.006) * 35 - Math.cos(xOffset * 0.012) * 15;
        ctx.lineTo(i, mountainY);
    }
    ctx.lineTo(width, horizon);
    ctx.closePath();
    ctx.fill();
}

// ==========================================================================
// RYSOWANIE AUTA GRACZA (Vector Art Rear View)
// ==========================================================================
function drawPlayerCar(ctx, x, y, width, steerAngle, isBraking) {
    const h = width * 0.52; // Camry sedan profile height ratio
    const carColor = player.carColor || '#C0C0C0';
    
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(steerAngle * 0.6); // Lean when steering
    
    // 1. Shadow underneath
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.ellipse(0, h * 0.02, width * 0.52, h * 0.16, 0, 0, 2 * Math.PI);
    ctx.fill();
    
    // 2. Tires (rear view, slightly visible under bumper)
    ctx.fillStyle = '#151515';
    ctx.fillRect(-width * 0.44, -h * 0.22, width * 0.13, h * 0.26);
    ctx.fillRect(width * 0.31, -h * 0.22, width * 0.13, h * 0.26);
    
    // Dual exhausts for sporty Camry look
    ctx.fillStyle = '#555';
    ctx.beginPath();
    ctx.arc(-width * 0.32, -h * 0.06, width * 0.03, 0, 2 * Math.PI);
    ctx.arc(width * 0.32, -h * 0.06, width * 0.03, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(-width * 0.32, -h * 0.06, width * 0.018, 0, 2 * Math.PI);
    ctx.arc(width * 0.32, -h * 0.06, width * 0.018, 0, 2 * Math.PI);
    ctx.fill();
    
    // 3. Lower Rear Bumper and Diffuser
    ctx.fillStyle = '#1e1e1e';
    ctx.beginPath();
    ctx.roundRect(-width * 0.45, -h * 0.32, width * 0.9, h * 0.28, 4);
    ctx.fill();
    
    // Red reflectors on bumper sides
    ctx.fillStyle = '#B30000';
    ctx.fillRect(-width * 0.42, -h * 0.22, width * 0.06, h * 0.04);
    ctx.fillRect(width * 0.36, -h * 0.22, width * 0.06, h * 0.04);
    
    // 4. Main Body Chassis (Camry metal panels)
    // Metallic lighting gradient
    const bodyGrad = ctx.createLinearGradient(0, -h * 0.9, 0, -h * 0.2);
    bodyGrad.addColorStop(0, carColor);
    // highlight on body creases
    bodyGrad.addColorStop(0.3, blendColors(carColor, '#FFFFFF', 0.25));
    bodyGrad.addColorStop(0.7, carColor);
    bodyGrad.addColorStop(1.0, blendColors(carColor, '#000000', 0.25));
    ctx.fillStyle = bodyGrad;
    
    ctx.beginPath();
    ctx.moveTo(-width * 0.46, -h * 0.32);
    ctx.quadraticCurveTo(-width * 0.47, -h * 0.65, -width * 0.40, -h * 0.72); // Trunk line
    ctx.lineTo(width * 0.40, -h * 0.72);
    ctx.quadraticCurveTo(width * 0.47, -h * 0.65, width * 0.46, -h * 0.32);
    ctx.closePath();
    ctx.fill();
    
    // 5. Sedan Roof and Rear Glass (windshield)
    ctx.fillStyle = '#0E131C';
    ctx.beginPath();
    ctx.moveTo(-width * 0.37, -h * 0.72);
    ctx.lineTo(-width * 0.28, -h * 1.12);
    ctx.quadraticCurveTo(0, -h * 1.15, width * 0.28, -h * 1.12);
    ctx.lineTo(width * 0.37, -h * 0.72);
    ctx.closePath();
    ctx.fill();
    
    // Windshield reflection highlight
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-width * 0.15, -h * 1.1);
    ctx.quadraticCurveTo(0, -h * 1.12, width * 0.22, -h * 1.1);
    ctx.stroke();
    
    // 6. Camry Taillights (Modern horizontal LED style)
    const ledGlowColor = isBraking ? 'rgba(255, 0, 0, 1)' : 'rgba(230, 20, 20, 0.6)';
    const ledInnerColor = isBraking ? '#FFAAAA' : '#FF3333';
    
    ctx.shadowBlur = isBraking ? 20 : 6;
    ctx.shadowColor = 'red';
    
    // Tail lights body shapes (Camry has wing-like taillights extending into the trunk)
    ctx.fillStyle = '#600505'; // Dark housing
    ctx.beginPath();
    // Left housing
    ctx.moveTo(-width * 0.45, -h * 0.62);
    ctx.lineTo(-width * 0.23, -h * 0.62);
    ctx.lineTo(-width * 0.21, -h * 0.50);
    ctx.lineTo(-width * 0.43, -h * 0.50);
    ctx.closePath();
    ctx.fill();
    // Right housing
    ctx.beginPath();
    ctx.moveTo(width * 0.45, -h * 0.62);
    ctx.lineTo(width * 0.23, -h * 0.62);
    ctx.lineTo(width * 0.21, -h * 0.50);
    ctx.lineTo(width * 0.43, -h * 0.50);
    ctx.closePath();
    ctx.fill();
    
    // LED light bar inside
    ctx.fillStyle = ledGlowColor;
    ctx.fillRect(-width * 0.42, -h * 0.59, width * 0.18, h * 0.06);
    ctx.fillRect(width * 0.24, -h * 0.59, width * 0.18, h * 0.06);
    
    ctx.fillStyle = ledInnerColor;
    ctx.fillRect(-width * 0.38, -h * 0.57, width * 0.13, h * 0.025);
    ctx.fillRect(width * 0.25, -h * 0.57, width * 0.13, h * 0.025);
    
    ctx.shadowBlur = 0; // Turn off shadows
    
    // Chrome center strip connecting the lights
    ctx.fillStyle = '#C0C0C0';
    ctx.fillRect(-width * 0.22, -h * 0.58, width * 0.44, h * 0.04);
    
    // Toyota logo (procedural drawing in center)
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.56, width * 0.03, h * 0.02, 0, 0, 2 * Math.PI);
    ctx.ellipse(0, -h * 0.56, width * 0.018, h * 0.02, 0, 0, 2 * Math.PI);
    ctx.stroke();
    
    // 7. License Plate
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-width * 0.09, -h * 0.38, width * 0.18, h * 0.1, 2);
    ctx.fill();
    ctx.stroke();
    
    ctx.fillStyle = '#000000';
    ctx.font = `bold ${Math.round(h * 0.07)}px Inter`;
    ctx.textAlign = 'center';
    ctx.fillText((player.name || "KIEROWCA").toUpperCase(), 0, -h * 0.30);
    
    ctx.restore();
    
    // Cones of light
    if (gameState === 'PLAYING') {
        const lightGradLeft = ctx.createLinearGradient(x - width * 0.3, y, x - width * 2, y - 250);
        lightGradLeft.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
        lightGradLeft.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.fillStyle = lightGradLeft;
        ctx.beginPath();
        ctx.moveTo(x - width * 0.35, y - 5);
        ctx.lineTo(x - width * 2.2, y - 220);
        ctx.lineTo(x - width * 0.1, y - 250);
        ctx.closePath();
        ctx.fill();

        const lightGradRight = ctx.createLinearGradient(x + width * 0.3, y, x + width * 2, y - 250);
        lightGradRight.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
        lightGradRight.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.fillStyle = lightGradRight;
        ctx.beginPath();
        ctx.moveTo(x + width * 0.35, y - 5);
        ctx.lineTo(x + width * 2.2, y - 220);
        ctx.lineTo(x + width * 0.1, y - 250);
        ctx.closePath();
        ctx.fill();
    }
}

// ==========================================================================
// RYSOWANIE WÓZKA WIDŁOWEGO GRACZA (Forklift - rear view)
// ==========================================================================
function drawForklift(ctx, x, y, width, steerAngle, isBraking) {
    const h = width * 0.70;
    const forkColor = '#F5A623';
    const bodyColor = '#E8821A';
    const cageColor = '#CC6600';

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(steerAngle * 0.4);

    // 1. Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, h * 0.03, width * 0.45, h * 0.10, 0, 0, 2 * Math.PI);
    ctx.fill();

    // 2. Large drive wheels (rear)
    ctx.fillStyle = '#101010';
    ctx.beginPath();
    ctx.roundRect(-width * 0.40, -h * 0.25, width * 0.14, h * 0.30, 4);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(width * 0.26, -h * 0.25, width * 0.14, h * 0.30, 4);
    ctx.fill();
    // Wheel rims
    ctx.fillStyle = '#444';
    ctx.beginPath();
    ctx.arc(-width * 0.33, -h * 0.10, width * 0.045, 0, 2 * Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(width * 0.33, -h * 0.10, width * 0.045, 0, 2 * Math.PI);
    ctx.fill();

    // 3. Main boxy body
    const bodyGrad = ctx.createLinearGradient(0, -h * 0.85, 0, -h * 0.20);
    bodyGrad.addColorStop(0, blendColors(bodyColor, '#FFFFFF', 0.25));
    bodyGrad.addColorStop(0.5, bodyColor);
    bodyGrad.addColorStop(1.0, blendColors(bodyColor, '#000000', 0.30));
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(-width * 0.38, -h * 0.85, width * 0.76, h * 0.65, 6);
    ctx.fill();

    // Body panel line
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-width * 0.38, -h * 0.55);
    ctx.lineTo(width * 0.38, -h * 0.55);
    ctx.stroke();

    // Black-yellow safety stripes on lower body
    ctx.save();
    ctx.beginPath();
    ctx.rect(-width * 0.38, -h * 0.38, width * 0.76, h * 0.18);
    ctx.clip();
    const stripeW = width * 0.10;
    for (let si = -width * 0.4; si < width * 0.5; si += stripeW * 2) {
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(si, -h * 0.38, stripeW, h * 0.18);
        ctx.fillStyle = '#1A1A1A';
        ctx.fillRect(si + stripeW, -h * 0.38, stripeW, h * 0.18);
    }
    ctx.restore();

    // 4. Roll cage (overhead guard)
    ctx.strokeStyle = cageColor;
    ctx.lineWidth = width * 0.045;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-width * 0.32, -h * 0.86);
    ctx.lineTo(-width * 0.32, -h * 1.28);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(width * 0.32, -h * 0.86);
    ctx.lineTo(width * 0.32, -h * 1.28);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-width * 0.32, -h * 1.28);
    ctx.lineTo(width * 0.32, -h * 1.28);
    ctx.stroke();
    // Diagonal braces
    ctx.lineWidth = width * 0.022;
    ctx.strokeStyle = blendColors(cageColor, '#000000', 0.15);
    ctx.beginPath();
    ctx.moveTo(-width * 0.32, -h * 1.28);
    ctx.lineTo(-width * 0.10, -h * 0.86);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(width * 0.32, -h * 1.28);
    ctx.lineTo(width * 0.10, -h * 0.86);
    ctx.stroke();

    // 5. Driver seat area
    ctx.fillStyle = '#1A1A1A';
    ctx.beginPath();
    ctx.roundRect(-width * 0.18, -h * 0.84, width * 0.36, h * 0.14, 4);
    ctx.fill();
    // Steering wheel
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -h * 0.80, width * 0.07, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.73);
    ctx.lineTo(0, -h * 0.87);
    ctx.stroke();

    // 6. Warning beacon on top of cage
    ctx.fillStyle = '#FFD700';
    ctx.shadowBlur = 14;
    ctx.shadowColor = '#FFD700';
    ctx.beginPath();
    ctx.arc(0, -h * 1.32, width * 0.055, 0, 2 * Math.PI);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#555';
    ctx.fillRect(-width * 0.015, -h * 1.28, width * 0.03, h * 0.05);

    // 7. Mast uprights (bottom/front of forklift)
    ctx.fillStyle = blendColors(bodyColor, '#000000', 0.40);
    ctx.fillRect(-width * 0.07, -h * 0.20, width * 0.04, h * 0.22);
    ctx.fillRect(width * 0.03, -h * 0.20, width * 0.04, h * 0.22);

    // 8. Forks (horizontal prongs)
    ctx.fillStyle = forkColor;
    ctx.fillRect(-width * 0.34, -h * 0.05, width * 0.16, h * 0.04);
    ctx.fillRect(width * 0.18, -h * 0.05, width * 0.16, h * 0.04);
    // Fork tips
    ctx.beginPath();
    ctx.moveTo(-width * 0.18, -h * 0.05);
    ctx.lineTo(-width * 0.14, -h * 0.03);
    ctx.lineTo(-width * 0.14, -h * 0.07);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(width * 0.34, -h * 0.05);
    ctx.lineTo(width * 0.30, -h * 0.03);
    ctx.lineTo(width * 0.30, -h * 0.07);
    ctx.closePath();
    ctx.fill();

    // 9. Brake / rear lights
    const brakeR = isBraking ? 'rgba(255,0,0,1)' : 'rgba(200,30,30,0.6)';
    ctx.shadowBlur = isBraking ? 18 : 4;
    ctx.shadowColor = 'red';
    ctx.fillStyle = brakeR;
    ctx.fillRect(-width * 0.37, -h * 0.45, width * 0.09, h * 0.07);
    ctx.fillRect(width * 0.28, -h * 0.45, width * 0.09, h * 0.07);
    ctx.shadowBlur = 0;

    // 10. License plate
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-width * 0.09, -h * 0.34, width * 0.18, h * 0.09, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#000000';
    ctx.font = `bold ${Math.round(h * 0.065)}px Inter`;
    ctx.textAlign = 'center';
    ctx.fillText((player.name || 'KIEROWCA').toUpperCase(), 0, -h * 0.27);

    ctx.restore();

    // Warning headlight cones (amber for forklift)
    if (gameState === 'PLAYING') {
        const lightGradL = ctx.createLinearGradient(x - width * 0.3, y, x - width * 1.5, y - 200);
        lightGradL.addColorStop(0, 'rgba(255,200,50,0.14)');
        lightGradL.addColorStop(1, 'rgba(255,200,50,0)');
        ctx.fillStyle = lightGradL;
        ctx.beginPath();
        ctx.moveTo(x - width * 0.32, y - 5);
        ctx.lineTo(x - width * 1.8, y - 200);
        ctx.lineTo(x - width * 0.05, y - 220);
        ctx.closePath();
        ctx.fill();

        const lightGradR = ctx.createLinearGradient(x + width * 0.3, y, x + width * 1.5, y - 200);
        lightGradR.addColorStop(0, 'rgba(255,200,50,0.14)');
        lightGradR.addColorStop(1, 'rgba(255,200,50,0)');
        ctx.fillStyle = lightGradR;
        ctx.beginPath();
        ctx.moveTo(x + width * 0.32, y - 5);
        ctx.lineTo(x + width * 1.8, y - 200);
        ctx.lineTo(x + width * 0.05, y - 220);
        ctx.closePath();
        ctx.fill();
    }
}

// ==========================================================================
// RYSOWANIE CIĘŻARÓWKI TENNET (Cargo Truck Rear View)
// ==========================================================================
function drawTenneTTruck(ctx, screen, data) {
    const scale = screen.scale;
    const w = screen.w * 0.26; // Skalowanie proporcjonalne do drogi
    const h = w * 0.95; // Wysokość proporcjonalna
    const x = screen.x;
    const y = screen.y;
    
    ctx.save();
    ctx.translate(x, y);
    
    // 1. Cień pod ciężarówką
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    ctx.ellipse(0, h * 0.05, w * 0.55, h * 0.12, 0, 0, 2 * Math.PI);
    ctx.fill();
    
    // 2. Koła bliźniacze (Tył)
    ctx.fillStyle = '#0F0F0F';
    // Lewe koła
    ctx.fillRect(-w * 0.47, -h * 0.18, w * 0.13, h * 0.22);
    ctx.fillRect(-w * 0.32, -h * 0.18, w * 0.11, h * 0.22);
    // Prawe koła
    ctx.fillRect(w * 0.21, -h * 0.18, w * 0.11, h * 0.22);
    ctx.fillRect(w * 0.34, -h * 0.18, w * 0.13, h * 0.22);
    
    // Felgi metalowe (hubs) na kołach
    ctx.fillStyle = '#555555';
    ctx.fillRect(-w * 0.43, -h * 0.12, w * 0.05, h * 0.1);
    ctx.fillRect(-w * 0.29, -h * 0.12, w * 0.05, h * 0.1);
    ctx.fillRect(w * 0.24, -h * 0.12, w * 0.05, h * 0.1);
    ctx.fillRect(w * 0.38, -h * 0.12, w * 0.05, h * 0.1);
    ctx.fillStyle = '#888888';
    ctx.fillRect(-w * 0.42, -h * 0.09, w * 0.03, h * 0.05);
    ctx.fillRect(-w * 0.28, -h * 0.09, w * 0.03, h * 0.05);
    ctx.fillRect(w * 0.25, -h * 0.09, w * 0.03, h * 0.05);
    ctx.fillRect(w * 0.39, -h * 0.09, w * 0.03, h * 0.05);
    
    // Fartuchy przeciwbłotne
    ctx.fillStyle = '#111111';
    ctx.fillRect(-w * 0.48, 0, w * 0.28, h * 0.08);
    ctx.fillRect(w * 0.2, 0, w * 0.28, h * 0.08);
    
    // Białe napisy "TenneT" na fartuchach
    ctx.fillStyle = '#888';
    ctx.font = `bold ${Math.round(h * 0.045)}px Orbitron`;
    ctx.textAlign = 'center';
    ctx.fillText("tennet", -w * 0.34, h * 0.055);
    ctx.fillText("tennet", w * 0.34, h * 0.055);
    
    // 3. Podwozie
    ctx.fillStyle = '#181E26';
    ctx.fillRect(-w * 0.42, -h * 0.28, w * 0.84, h * 0.15);
    
    // Rura wydechowa (po lewej stronie)
    ctx.fillStyle = '#444';
    ctx.fillRect(-w * 0.28, -h * 0.24, w * 0.04, h * 0.06);
    
    // 4. Skrzynia Ładunkowa / Kontener (Styl TenneT: Orange/Dark Blue)
    // Dolna część - metalowe burty (Pomarańcz TenneT)
    ctx.fillStyle = COLORS.SUN;
    ctx.beginPath();
    ctx.roundRect(-w * 0.48, -h * 0.9, w * 0.96, h * 0.65, 4 * scale);
    ctx.fill();
    
    // Pionowa linia podziału drzwi z tyłu (tylna klapa lub drzwi)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = Math.max(1, 2 * scale);
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.9);
    ctx.lineTo(0, -h * 0.35);
    ctx.stroke();
    
    // Rygle metalowe (srebrne pionowe pręty zamykające drzwi naczepy)
    ctx.fillStyle = '#CCCCCC'; // Silver/gray
    const barW = w * 0.025;
    ctx.fillRect(-w * 0.15, -h * 0.88, barW, h * 0.5);
    ctx.fillRect(w * 0.15 - barW, -h * 0.88, barW, h * 0.5);
    
    // Klamki/zamki rygli na dole
    ctx.fillStyle = '#222222';
    ctx.fillRect(-w * 0.17, -h * 0.42, w * 0.05, h * 0.03);
    ctx.fillRect(w * 0.12, -h * 0.42, w * 0.05, h * 0.03);
    
    // Zawiasy drzwi po lewej i prawej stronie (po 3 z każdej strony)
    ctx.fillStyle = '#333333';
    const hingeH = h * 0.04;
    const hingeW = w * 0.03;
    const hingeYPositions = [-h * 0.82, -h * 0.62, -h * 0.42];
    hingeYPositions.forEach(hy => {
        ctx.fillRect(-w * 0.49, hy, hingeW, hingeH);
        ctx.fillRect(w * 0.49 - hingeW, hy, hingeW, hingeH);
    });

    // Naklejki ograniczenia prędkości z lewej strony (80 i 90)
    const drawSpeedDecal = (cx, cy, number) => {
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(cx, cy, w * 0.045, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = '#D32F2F';
        ctx.lineWidth = Math.max(1, 1.5 * scale);
        ctx.stroke();
        
        ctx.fillStyle = '#000000';
        ctx.font = `bold ${Math.round(w * 0.055)}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(number, cx, cy);
    };
    drawSpeedDecal(-w * 0.36, -h * 0.42, "80");
    drawSpeedDecal(-w * 0.24, -h * 0.42, "90");
    
    // Odblaskowa taśma konturowa (żółto-czerwona linia na krawędzi)
    ctx.strokeStyle = '#FFCC00'; // Yellow tape
    ctx.lineWidth = Math.max(1, 1.5 * scale);
    ctx.setLineDash([4 * scale, 4 * scale]);
    ctx.beginPath();
    ctx.moveTo(-w * 0.46, -h * 0.88);
    ctx.lineTo(-w * 0.46, -h * 0.36);
    ctx.lineTo(w * 0.46, -h * 0.36);
    ctx.lineTo(w * 0.46, -h * 0.88);
    ctx.stroke();
    ctx.setLineDash([]); // Reset dash
    
    // Pasy ostrzegawcze na dole skrzyni
    ctx.fillStyle = '#111';
    ctx.fillRect(-w * 0.48, -h * 0.34, w * 0.96, h * 0.08);
    
    // Znaki chevron (żółto-czarne skośne pasy na zderzaku)
    const stripeW = w * 0.06;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-w * 0.45, -h * 0.15, w * 0.9, h * 0.1);
    ctx.clip();
    
    ctx.fillStyle = '#E5B800'; // Żółty zderzak
    ctx.fillRect(-w * 0.45, -h * 0.15, w * 0.9, h * 0.1);
    
    ctx.fillStyle = '#111'; // Czarne pasy
    for (let px = -w * 0.6; px < w * 0.6; px += stripeW * 2) {
        ctx.beginPath();
        ctx.moveTo(px, -h * 0.16);
        ctx.lineTo(px + stripeW, -h * 0.16);
        ctx.lineTo(px + stripeW * 2, -h * 0.04);
        ctx.lineTo(px + stripeW, -h * 0.04);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
    
    // Polska tablica rejestracyjna w środku zderzaka (KRA 7788)
    const plateW = w * 0.22;
    const plateH = h * 0.06;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-plateW / 2, -h * 0.12, plateW, plateH);
    // Unijny niebieski pasek po lewej
    ctx.fillStyle = '#003399';
    ctx.fillRect(-plateW / 2, -h * 0.12, plateW * 0.15, plateH);
    // Tekst rejestracji
    ctx.fillStyle = '#111111';
    ctx.font = `bold ${Math.round(plateH * 0.7)}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("KRA 7788", plateW * 0.08, -h * 0.09);
    
    // Górna plandeka / Kontener (Ciemny Granat)
    ctx.fillStyle = '#0B1E36';
    ctx.roundRect(-w * 0.48, -h * 1.15, w * 0.96, h * 0.3, [6 * scale, 6 * scale, 0, 0]);
    ctx.fill();
    
    // Logo / Napis TenneT na plandece
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${Math.round(h * 0.14)}px Orbitron`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("tennet", 0, -h * 1.02);
    
    // Dodatkowa pomarańczowa fala/krzywa z logo TenneT
    ctx.strokeStyle = COLORS.SUN;
    ctx.lineWidth = 4 * scale;
    ctx.beginPath();
    ctx.moveTo(-w * 0.28, -h * 0.94);
    ctx.bezierCurveTo(-w * 0.1, -h * 1.08, w * 0.1, -h * 0.88, w * 0.28, -h * 1.02);
    ctx.stroke();
    
    // 5. Ładunek: Bębny z przewodami widoczne z tyłu (Realistyczny model wektorowy)
    ctx.fillStyle = '#080D14'; // Bardzo ciemne wnętrze naczepy
    ctx.fillRect(-w * 0.43, -h * 0.82, w * 0.86, h * 0.44);
    
    // Rysujemy deski podłogi/ramy naczepy w środku
    ctx.strokeStyle = '#1F2937';
    ctx.lineWidth = 1;
    for (let lx = -w * 0.4; lx < w * 0.4; lx += w * 0.1) {
        ctx.beginPath();
        ctx.moveTo(lx, -h * 0.82);
        ctx.lineTo(lx, -h * 0.38);
        ctx.stroke();
    }
    
    // Dwa bębny - lewy i prawy
    const drawDrumInTrailer = (cx, cy, r) => {
        // Zewnętrzny kołnierz (drewno)
        ctx.fillStyle = '#5A301A';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.fill();
        
        // Słoje drewna / deski na kołnierzu
        ctx.strokeStyle = '#3D2011';
        ctx.lineWidth = Math.max(1, 1.5 * scale);
        for (let angle = 0; angle < 360; angle += 45) {
            const rad = angle * Math.PI / 180;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(rad) * r, cy + Math.sin(rad) * r);
            ctx.stroke();
        }
        
        // Zwoje kabli (niebieski/pomarańczowy)
        ctx.fillStyle = '#0070C0'; // Niebieski kabel
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.75, 0, 2 * Math.PI);
        ctx.fill();
        
        // Linie zwojów kabla
        ctx.strokeStyle = '#00A0FF';
        ctx.lineWidth = Math.max(1, 2 * scale);
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.6, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.45, 0, 2 * Math.PI);
        ctx.stroke();
        
        // Wewnętrzna tarcza drewniana
        ctx.fillStyle = '#5A301A';
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.3, 0, 2 * Math.PI);
        ctx.fill();
        
        // Otwór centralny (metalowy trzpień)
        ctx.fillStyle = '#111111';
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.1, 0, 2 * Math.PI);
        ctx.fill();
        
        // Metalowe śruby na kołnierzu
        ctx.fillStyle = '#999999';
        for (let angle = 22.5; angle < 360; angle += 45) {
            const rad = angle * Math.PI / 180;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(rad) * (r * 0.88), cy + Math.sin(rad) * (r * 0.88), r * 0.05, 0, 2 * Math.PI);
            ctx.fill();
        }
    };
    
    drawDrumInTrailer(-w * 0.2, -h * 0.6, w * 0.2);
    drawDrumInTrailer(w * 0.2, -h * 0.6, w * 0.2);
    
    // Klapa tyłu zderzaka (otwarta naczepa, skąd wypadają bębny)
    ctx.fillStyle = '#2D3748';
    ctx.fillRect(-w * 0.45, -h * 0.4, w * 0.9, h * 0.05);
    
    // 6. Światła i Kierunkowskazy
    // Czerwone światła pozycyjne
    ctx.fillStyle = 'rgba(200, 20, 20, 0.8)';
    ctx.fillRect(-w * 0.42, -h * 0.23, w * 0.08, h * 0.04);
    ctx.fillRect(w * 0.34, -h * 0.23, w * 0.08, h * 0.04);
    
    // Kierunkowskazy migające
    const isBlinkingOn = data.indicatorActive && Math.floor(data.indicatorBlinkTimer / 250) % 2 === 0;
    
    if (data.indicatorState === 1 && isBlinkingOn) { // Lewy
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#FF9900';
        ctx.fillStyle = '#FF9900';
        ctx.fillRect(-w * 0.46, -h * 0.23, w * 0.04, h * 0.04);
        ctx.shadowBlur = 0;
    } else {
        ctx.fillStyle = '#5F3F00';
        ctx.fillRect(-w * 0.46, -h * 0.23, w * 0.04, h * 0.04);
    }
    
    if (data.indicatorState === 2 && isBlinkingOn) { // Prawy
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#FF9900';
        ctx.fillStyle = '#FF9900';
        ctx.fillRect(w * 0.42, -h * 0.23, w * 0.04, h * 0.04);
        ctx.shadowBlur = 0;
    } else {
        ctx.fillStyle = '#5F3F00';
        ctx.fillRect(w * 0.42, -h * 0.23, w * 0.04, h * 0.04);
    }
    
    ctx.restore();
}

// ==========================================================================
// RYSOWANIE BĘBNA Z PRZEWODAMI (Cable Reel Obstacle)
// ==========================================================================
function drawCableDrum(ctx, screen, data) {
    const scale = screen.scale;
    const r = screen.w * 0.13; // Promień bębna proporcjonalny do drogi
    const x = screen.x;
    const y = screen.y;
    
    // Wysokość dopasowana bezpośrednio do wysokości paki ciężarówki
    const drumYOffset = (data.y / 45) * (screen.w * 0.26 * 0.28);
    const drawY = y - drumYOffset;
    
    ctx.save();
    
    // 1. Cień pod bębnem (zanika, gdy bęben leci w powietrzu)
    const shadowAlpha = Math.max(0, 0.45 * (1 - data.y / 70));
    ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.05, r * 1.1, r * 0.25, 0, 0, 2 * Math.PI);
    ctx.fill();
    
    ctx.translate(x, drawY);
    
    // Bęben toczy się w stronę ekranu, więc widzimy go lekko pod kątem (skos trójwymiarowy)
    // Modelujemy to rysując dwa koła (kołnierze boczne) przesunięte względem siebie,
    // a pomiędzy nimi miedziane uzwojenie kabla.
    const widthOffset = r * 0.45; // Szerokość bębna (rozstaw kołnierzy)
    
    // Rotacja bębna w radianach
    const rot = data.rotation;
    
    // Kolorystyka bębna (zielony leczący, niebieski standardowy)
    const flangeColor = data.color === 'green' ? '#00A86B' : '#00529B';
    const flangeBorder = data.color === 'green' ? '#00704A' : '#00396B';
    const cableColor = data.color === 'green' ? '#00FF87' : '#FF5F00';
    const coreColor = '#4E2C17';  // Ciemny środek bębna
    
    // A. Kołnierz Tylny (Dalszy boczny okrąg)
    drawFlange(ctx, -widthOffset * 0.6, 0, r * 0.95, flangeColor, flangeBorder, rot);
    
    // B. Środek z uzwojeniem kabla (Wąski wałek w centrum)
    const cableGrad = ctx.createLinearGradient(0, -r * 0.6, 0, r * 0.6);
    cableGrad.addColorStop(0, '#5A2A0D');
    cableGrad.addColorStop(0.3, cableColor);
    cableGrad.addColorStop(0.7, '#A0450A');
    cableGrad.addColorStop(1, '#3D1C09');
    
    ctx.fillStyle = cableGrad;
    ctx.beginPath();
    // Górny bok cylindra kabla
    ctx.moveTo(-widthOffset * 0.5, -r * 0.65);
    ctx.lineTo(widthOffset * 0.5, -r * 0.65);
    // Dolny bok
    ctx.lineTo(widthOffset * 0.5, r * 0.65);
    ctx.lineTo(-widthOffset * 0.5, r * 0.65);
    ctx.closePath();
    ctx.fill();
    
    // C. Kołnierz Przedni (Bliższy boczny okrąg, nakłada się na kabel)
    drawFlange(ctx, widthOffset * 0.4, 0, r, flangeColor, flangeBorder, rot);
    
    // D. Metalowa/drewniana piasta centralna bębna
    ctx.fillStyle = '#2C3E50';
    ctx.beginPath();
    ctx.arc(widthOffset * 0.4, 0, r * 0.15, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1 * scale;
    ctx.stroke();
    
    // Otwór osiowy
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.arc(widthOffset * 0.4, 0, r * 0.06, 0, 2 * Math.PI);
    ctx.fill();
    
    ctx.restore();
}

// Rysowanie bocznego kołnierza bębna ze szprychami do symulacji obrotu
function drawFlange(ctx, cx, cy, r, fillCol, strokeCol, rotation) {
    ctx.save();
    ctx.translate(cx, cy);
    
    // Rysowanie elipsy kołnierza (dla efektu 3D, bębny są lekko pod kątem)
    const aspect = 0.5; // Stosunek osi X do Y dla elipsy bocznej
    
    ctx.scale(aspect, 1.0);
    ctx.rotate(rotation);
    
    // Zewnętrzny dysk
    ctx.fillStyle = fillCol;
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = r * 0.08;
    
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    
    // Wewnętrzne koło (oznaczenie/piasta)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.75, 0, 2 * Math.PI);
    ctx.fill();
    
    // Szprychy (pokazujące obracanie się)
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = r * 0.05;
    
    const numSpokes = 8;
    for (let i = 0; i < numSpokes; i++) {
        const angle = (i * Math.PI * 2) / numSpokes;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle) * r * 0.9, Math.sin(angle) * r * 0.9);
        ctx.stroke();
    }
    
    // Tekst "TENNET" na bębnie (podpis wokół koła)
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${Math.round(r * 0.12)}px Inter`;
    ctx.textAlign = 'center';
    ctx.fillText("TENNET", 0, -r * 0.35);
    
    ctx.restore();
}

// ==========================================================================
// RYSOWANIE CZĄSTECZEK (Visual FX Draw)
// ==========================================================================
function drawParticle(ctx, screen, data) {
    const scale = screen.scale;
    const x = screen.x;
    const y = screen.y;
    
    ctx.save();
    
    if (data.type === 'speedline') {
        // Linie prędkości na horyzoncie (boczne paski)
        ctx.strokeStyle = data.color;
        ctx.lineWidth = data.w * scale;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + data.h * scale);
        ctx.stroke();
    } else if (data.type === 'smoke') {
        // Chmury dymu spalinowego / zderzenia
        const size = data.size * scale;
        ctx.fillStyle = data.color;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, 2 * Math.PI);
        ctx.fill();
    } else if (data.type === 'dust') {
        // Kurz spod kół i bębnów
        const size = data.size * scale;
        ctx.fillStyle = data.color;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, 2 * Math.PI);
        ctx.fill();
    } else if (data.type === 'spark') {
        // Czerwono-pomarańczowe iskry z kolizji/odbicia
        const size = Math.max(1, data.size * scale);
        ctx.fillStyle = data.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = data.color;
        ctx.fillRect(x - size/2, y - size/2, size * 2, size * 2);
    }
    
    ctx.restore();
}

// ==========================================================================
// ZAPISYWANIE I OBSŁUGA REKORDÓW (Leaderboard LocalStorage)
// ==========================================================================
function loadLeaderboard() {
    // 1. Spróbuj pobrać z globalnego API serwera
    fetch('/api/scores')
        .then(response => {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
        })
        .then(scores => {
            if (Array.isArray(scores)) {
                // Aktualizuj lokalny backup
                try { localStorage.setItem('tennet_scores', JSON.stringify(scores)); } catch(e) {}
                displayLeaderboard(scores);
            }
        })
        .catch(err => {
            console.warn('Nie można pobrać wyników z serwera, używam localStorage:', err);
            loadLeaderboardLocal();
        });
}

function loadLeaderboardLocal() {
    let scores;
    try {
        scores = JSON.parse(localStorage.getItem('tennet_scores'));
    } catch (e) {
        scores = null;
    }
    // Pokaż tylko prawdziwe wyniki – bez fake placeholderów
    if (!scores || !Array.isArray(scores)) scores = [];
    displayLeaderboard(scores);
}

function displayLeaderboard(scores) {
    scores = [...scores].sort((a, b) => b.score - a.score);
    const listEl = document.getElementById('leaderboard-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    if (scores.length === 0) {
        const li = document.createElement('li');
        li.style.cssText = 'color: var(--text-muted); font-style: italic; justify-content: center;';
        li.textContent = 'Brak wyników – bądź pierwszy!';
        listEl.appendChild(li);
        return;
    }
    // Medale dla top 3
    const medals = ['🥇', '🥈', '🥉'];
    scores.slice(0, 10).forEach((item, index) => {
        const li = document.createElement('li');
        const rank = index < 3
            ? `<span class="rank">${medals[index]}</span>`
            : `<span class="rank">${index + 1}.</span>`;
        li.innerHTML = `${rank} <span class="name">${item.name.toUpperCase()}</span> <span class="score">${item.score}m</span>`;
        if (index === 0) li.style.cssText = 'color: #FFD700;';
        listEl.appendChild(li);
    });
}

function checkIsHighScore(score) {
    let scores = [];
    try {
        scores = JSON.parse(localStorage.getItem('tennet_scores')) || [];
    } catch (e) {
        console.error("Failed to parse scores in checkIsHighScore:", e);
    }
    if (!Array.isArray(scores)) scores = [];
    if (scores.length < 5) return true;
    
    scores.sort((a, b) => b.score - a.score);
    return score > scores[scores.length - 1].score;
}

function saveHighScore(name, score) {
    // 1. Zapisz lokalnie (jako backup)
    let scores = [];
    try {
        scores = JSON.parse(localStorage.getItem('tennet_scores')) || [];
    } catch (e) {
        console.error("Failed to parse scores in saveHighScore:", e);
    }
    if (!Array.isArray(scores)) scores = [];
    scores.push({ name: name, score: score });
    scores.sort((a, b) => b.score - a.score);
    scores = scores.slice(0, 10); // Zachowaj top 10 lokalnie
    
    try {
        localStorage.setItem('tennet_scores', JSON.stringify(scores));
    } catch (e) {
        console.error("Failed to save high scores to localStorage:", e);
    }

    // 2. Wyślij do API serwera (zapis dla wszystkich)
    fetch('/api/scores', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: name, score: score })
    })
    .then(response => {
        if (!response.ok) throw new Error("HTTP error " + response.status);
        return response.json();
    })
    .then(data => {
        console.log("Score saved to server:", data);
        loadLeaderboard();
    })
    .catch(err => {
        console.error("Failed to save score to server API:", err);
        loadLeaderboard(); // Odśwież z lokalnego backupu
    });
}

// Helper to blend two hex colors with a weight (0 to 1)
function blendColors(c1, c2, weight) {
    const parse = (c) => {
        try {
            if (c && typeof c === 'string' && c.startsWith('#')) {
                if (c.length === 4) {
                    return [
                        parseInt(c[1] + c[1], 16),
                        parseInt(c[2] + c[2], 16),
                        parseInt(c[3] + c[3], 16)
                    ];
                }
                return [
                    parseInt(c.substring(1, 3), 16),
                    parseInt(c.substring(3, 5), 16),
                    parseInt(c.substring(5, 7), 16)
                ];
            }
        } catch (e) {
            console.error("Error parsing color:", c, e);
        }
        return [192, 192, 192];
    };
    
    try {
        const rgb1 = parse(c1);
        const rgb2 = parse(c2);
        const r = Math.round(rgb1[0] * (1 - weight) + rgb2[0] * weight);
        const g = Math.round(rgb1[1] * (1 - weight) + rgb2[1] * weight);
        const b = Math.round(rgb1[2] * (1 - weight) + rgb2[2] * weight);
        
        const toHex = (val) => {
            const hex = Math.max(0, Math.min(255, val)).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    } catch (e) {
        console.error("Error in blendColors:", c1, c2, weight, e);
        return '#C0C0C0';
    }
}

// Draws roadside obstacles (trees, buildings, gas stations, billboards) with custom vector art
function drawRoadsideObject(ctx, screen, data) {
    const scale = screen.scale;
    const w = screen.w * 0.25 * data.scale; // Base width of the object
    const x = screen.x;
    const y = screen.y;
    
    ctx.save();
    
    if (data.type === 'city_sign') {
        const isLevel = data.isLevelSign;
        const h = w * (isLevel ? 1.15 : 0.95);
        const boardH = h * (isLevel ? 0.52 : 0.45);
        const boardW = w * (isLevel ? 1.8 : 1.5);
        const poleW = w * 0.07;
        
        // Słupki (dwa dla znaku poziomu, jeden dla kierunkowego)
        ctx.fillStyle = '#8A9BAD';
        if (isLevel) {
            ctx.fillRect(x - boardW * 0.35, y - h, poleW, h);
            ctx.fillRect(x + boardW * 0.28, y - h, poleW, h);
        } else {
            ctx.fillRect(x - poleW / 2, y - h, poleW, h);
        }
        
        // Ciemna rama
        ctx.fillStyle = '#0A3D22';
        ctx.fillRect(x - boardW / 2 - 3 * scale, y - h - 3 * scale, boardW + 6 * scale, boardH + 6 * scale);
        
        // Główna zielona tablica
        ctx.fillStyle = '#0F6938';
        ctx.fillRect(x - boardW / 2, y - h, boardW, boardH);
        
        // Biała ramka wewnętrzna (podwójna dla znaku poziomu)
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = Math.max(1, 2 * scale);
        ctx.strokeRect(x - boardW / 2 + 3 * scale, y - h + 3 * scale, boardW - 6 * scale, boardH - 6 * scale);
        
        // Tekst (Nazwa miejscowości)
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${Math.round(boardH * 0.42)}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(data.cityName || "Skawina", x, y - h + boardH / 2);
    } else if (data.type === 'tree') {
        const h = w * 1.8;
        const trunkW = w * 0.18;
        const trunkH = h * 0.25;
        
        // Trunk
        ctx.fillStyle = '#4E2C17';
        ctx.fillRect(x - trunkW / 2, y - trunkH, trunkW, trunkH);
        
        // Foliage (triangles)
        const foliageGrad = ctx.createLinearGradient(x, y - h, x, y - trunkH);
        foliageGrad.addColorStop(0, '#00FF99'); // Neon mint
        foliageGrad.addColorStop(1, '#05472A'); // Forest green
        ctx.fillStyle = foliageGrad;
        
        // Bottom layer
        ctx.beginPath();
        ctx.moveTo(x - w / 2, y - trunkH);
        ctx.lineTo(x + w / 2, y - trunkH);
        ctx.lineTo(x, y - trunkH - h * 0.4);
        ctx.closePath();
        ctx.fill();
        
        // Middle layer
        ctx.beginPath();
        ctx.moveTo(x - w * 0.38, y - trunkH - h * 0.25);
        ctx.lineTo(x + w * 0.38, y - trunkH - h * 0.25);
        ctx.lineTo(x, y - trunkH - h * 0.7);
        ctx.closePath();
        ctx.fill();
        
        // Top layer
        ctx.beginPath();
        ctx.moveTo(x - w * 0.25, y - trunkH - h * 0.55);
        ctx.lineTo(x + w * 0.25, y - trunkH - h * 0.55);
        ctx.lineTo(x, y - h);
        ctx.closePath();
        ctx.fill();
    } else if (data.type === 'building') {
        const h = w * 2.5;
        
        // Shadow/Outline
        ctx.fillStyle = '#0b131e';
        ctx.fillRect(x - w / 2, y - h, w, h);
        
        // Main block
        const bGrad = ctx.createLinearGradient(x, y - h, x, y);
        bGrad.addColorStop(0, '#1E293B');
        bGrad.addColorStop(1, '#0F172A');
        ctx.fillStyle = bGrad;
        ctx.fillRect(x - w / 2 + 2, y - h + 2, w - 4, h - 2);
        
        // Windows
        const cols = 3;
        const rows = 8;
        const winW = (w - 12) / cols;
        const winH = (h - 20) / rows;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                // Procedural pseudo-random lighting based on z coordinate
                const randSeed = Math.sin(data.z + r * 17 + c * 23) * 10000;
                const isLit = (randSeed - Math.floor(randSeed)) > 0.45;
                if (isLit) {
                    ctx.fillStyle = (c % 2 === 0) ? '#00F2FE' : '#FF007F';
                    ctx.fillRect(x - w/2 + 6 + c * winW, y - h + 10 + r * winH, winW * 0.65, winH * 0.65);
                }
            }
        }
    } else if (data.type === 'gas_station') {
        const h = w * 0.7;
        
        // Pillars
        ctx.fillStyle = '#4A5568';
        ctx.fillRect(x - w * 0.38, y - h, w * 0.06, h);
        ctx.fillRect(x + w * 0.32, y - h, w * 0.06, h);
        
        // Fuel Pumps
        ctx.fillStyle = '#FF5F00'; // TenneT Orange
        ctx.fillRect(x - w * 0.18, y - h * 0.35, w * 0.08, h * 0.35);
        ctx.fillStyle = '#00D2C4'; // Cyan pump
        ctx.fillRect(x + w * 0.06, y - h * 0.35, w * 0.08, h * 0.35);
        
        // Pump display/hoses
        ctx.fillStyle = '#1A202C';
        ctx.fillRect(x - w * 0.16, y - h * 0.3, w * 0.04, h * 0.1);
        ctx.fillRect(x + w * 0.08, y - h * 0.3, w * 0.04, h * 0.1);
        
        // Canopy (roof)
        const roofGrad = ctx.createLinearGradient(x, y - h - h * 0.2, x, y - h);
        roofGrad.addColorStop(0, '#2D3748');
        roofGrad.addColorStop(1, '#1A202C');
        ctx.fillStyle = roofGrad;
        ctx.fillRect(x - w * 0.45, y - h - h * 0.25, w * 0.9, h * 0.35);
        
        // Orange neon line on canopy
        ctx.fillStyle = '#FF5F00';
        ctx.fillRect(x - w * 0.43, y - h - h * 0.08, w * 0.86, h * 0.08);
        
        // Logo / Text "TENNET"
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${Math.round(h * 0.18)}px Orbitron`;
        ctx.textAlign = 'center';
        ctx.fillText("TENNET", x, y - h - h * 0.05);
    } else if (data.type === 'billboard') {
        const h = w * 0.95;
        const boardH = h * 0.6;
        const poleW = w * 0.08;
        const poleH = h - boardH;
        
        // Support Pole
        ctx.fillStyle = '#2D3748';
        ctx.fillRect(x - poleW / 2, y - h, poleW, h);
        
        // Outer Frame
        ctx.fillStyle = '#1A202C';
        ctx.fillRect(x - w / 2, y - h, w, boardH);
        
        // Screen
        const screenGrad = ctx.createLinearGradient(x, y - h, x, y - h + boardH);
        screenGrad.addColorStop(0, '#0F172A');
        screenGrad.addColorStop(1, '#1E1B4B');
        ctx.fillStyle = screenGrad;
        ctx.fillRect(x - w / 2 + 3, y - h + 3, w - 6, boardH - 6);
        
        // Glowing Neon Text/Ad
        const msgIndex = Math.floor(data.z / 1200) % 4;
        let msg = "TENNET";
        let glowColor = '#00F2FE';
        if (msgIndex === 1) {
            msg = "DRIVE SAFE";
            glowColor = '#38BDF8';
        } else if (msgIndex === 2) {
            msg = "DODGE!";
            glowColor = '#F43F5E';
        } else if (msgIndex === 3) {
            msg = "SLOW DOWN";
            glowColor = '#F59E0B';
        }
        
        ctx.fillStyle = glowColor;
        ctx.shadowBlur = 10;
        ctx.shadowColor = glowColor;
        ctx.font = `bold ${Math.round(boardH * 0.18)}px Orbitron`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(msg, x, y - h + boardH / 2);
        ctx.shadowBlur = 0; // Reset shadow
    }
    
    ctx.restore();
}

// Retrieves the highest score currently recorded in localStorage
function getHighScore() {
    try {
        let scores = JSON.parse(localStorage.getItem('tennet_scores'));
        if (!scores || !Array.isArray(scores)) return 1200; // Domyślna wartość rekordu
        scores.sort((a, b) => b.score - a.score);
        return scores[0] ? scores[0].score : 1200;
    } catch (e) {
        console.error("Failed to read high score in getHighScore:", e);
        return 1200;
    }
}

