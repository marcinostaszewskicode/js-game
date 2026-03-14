/**
 * StepMania Game - Parser i logika gry
 * Odczytuje pliki .sm i emuluje grę DDR/StepMania
 */

class StepManiaParser {
    /**
     * Parsuje zawartość pliku .sm
     */
    static parse(fileContent) {
        const metadata = {};
        const charts = [];

        // Parsuj metadane
        const lines = fileContent.split('\n');
        let currentLine = 0;

        // Odczytaj metadane
        while (currentLine < lines.length) {
            const line = lines[currentLine].trim();
            currentLine++;

            if (line.startsWith('#')) {
                const match = line.match(/#([A-Z]+):(.*);/);
                if (match) {
                    const key = match[1];
                    const value = match[2].trim();
                    metadata[key] = value;
                }
            }

            if (line.startsWith('#NOTES:')) {
                // Znaleźliśmy sekcję #NOTES
                break;
            }
        }

        // Parsuj wszystkie sekcje #NOTES
        while (currentLine < lines.length) {
            if (lines[currentLine].trim().startsWith('#NOTES:')) {
                const chart = this.parseNotesSection(lines, currentLine);
                if (chart) {
                    charts.push(chart);
                }
                currentLine = chart.endLine;
            }
            currentLine++;
        }

        return {
            metadata,
            charts
        };
    }

    /**
     * Parsuje jedną sekcję #NOTES
     */
    static parseNotesSection(lines, startLine) {
        const chartData = {
            type: '',
            name: '',
            difficulty: '',
            level: '',
            notes: [],
            endLine: startLine
        };

        let currentLine = startLine + 1;
        let sectionContent = '';
        let foundNotes = false;

        // Odczytaj linię po linii aż do średnika
        while (currentLine < lines.length) {
            const line = lines[currentLine];
            currentLine++;

            // Linie z metadanymi
            if (!foundNotes && line.includes(':')) {
                const parts = line.split(':');
                const value = parts[parts.length - 1].trim();

                if (chartData.type === '') {
                    chartData.type = value;
                } else if (chartData.name === '') {
                    chartData.name = value;
                } else if (chartData.difficulty === '') {
                    chartData.difficulty = value;
                } else if (chartData.level === '') {
                    chartData.level = value;
                }
                continue;
            }

            if (line.includes(',') || /^\d/.test(line)) {
                foundNotes = true;
            }

            if (foundNotes) {
                sectionContent += line;
            }

            if (line.includes(';')) {
                break;
            }

            if (currentLine > startLine + 4000) break; // Zabezpieczenie
        }

        // Parsuj nuty z sectionContent
        chartData.notes = this.parseNotes(sectionContent);
        chartData.endLine = currentLine;

        console.log(`Parsed chart: ${chartData.name} (${chartData.difficulty}) with ${chartData.notes.length} notes`);

        return chartData;
    }

    /**
     * Parsuje nuty ze stringa
     */
    static parseNotes(content) {
        const notes = [];
        const measures = content.split(',');

        measures.forEach((measure, measureIdx) => {
            const lineSplit = measure.includes('\n') ? '\n' : '\r';
            const lines = measure.trim().split(lineSplit).filter(l => l.trim());

            lines.forEach((line, lineIdx) => {
                const cleanLine = line.trim();
                if (cleanLine.length === 4 && /^\d+$/.test(cleanLine)) {
                    for (let lane = 0; lane < 4; lane++) {
                        const noteType = cleanLine[lane];
                        if (noteType !== '0') {
                            notes.push({
                                time: (measureIdx * 4 + lineIdx) * 500,
                                lane: lane,
                                type: noteType
                            });
                        }
                    }
                }
            });
        });

        return notes;
    }
}

/**
 * Główna klasa gry
 */
class StepManiaGame {
    constructor() {
        this.isRunning = false;
        this.currentChart = null;
        this.audio = null;
        this.currentNotes = [];
        this.currentNoteIndex = 0;
        this.startTime = 0;
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.hits = { perfect: 0, good: 0, miss: 0 };

        this.bpm = 145;
        this.noteSpeed = 3; // Pikseli per ms
        this.hitWindowMs = 100; // Okno do trafienia
        this.laneWidth = 100;
        this.playFieldHeight = 500;
        this.hitZoneTop = 30;
        this.hitZoneHeight = 40;

        this.activeNotes = [];
        this.keyStates = {};

        this.initializePlayFieldStyles();
        this.initializeEventListeners();
        this.loadAvailableFiles();
    }

    initializePlayFieldStyles() {
        const hitZone = document.getElementById('hitZone');
        hitZone.style.top = `${this.hitZoneTop}px`;
        hitZone.style.height = `${this.hitZoneHeight}px`;
        const playField = document.getElementById('playField');
        playField.style.height = `${this.playFieldHeight}px`;
    }

    initializeEventListeners() {
        // Nasłuchuj klawisze
        const keyMap = {
            'z': 0,
            'x': 1,
            ',': 2,
            '.': 3,
            'arrowleft': 0,
            'arrowdown': 1,
            'arrowup': 2,
            'arrowright': 3
        };

        document.addEventListener('keydown', (e) => {
            const laneIndex = keyMap[e.key.toLowerCase()];
            if (laneIndex !== undefined) {
                e.preventDefault();
                this.onKeyDown(laneIndex);
            }
        });

        document.addEventListener('keyup', (e) => {
            const laneIndex = keyMap[e.key.toLowerCase()];
            if (laneIndex !== undefined) {
                this.onKeyUp(laneIndex);
            }
        });
    }

    loadAvailableFiles() {
        // Symulacja ładowania plików z folderu StepManiaFiles
        const fileSelector = document.getElementById('fileSelector');

        // Lista znanych plików
        const files = [
            'Adele Vs Eminem - Let Yourself Skyfall (Mashup)',
            'corook - Scooby',
            'MIRROR - Tetoris - Kasane Teto',
            'Silent Hill Dubstep',
            'Slop',
            'SPAGHETTI',
            'Who is going to Sleep with your Wife'
        ];

        files.forEach(file => {
            const option = document.createElement('option');
            option.value = file;
            option.textContent = file;
            fileSelector.appendChild(option);
        });

        fileSelector.addEventListener('change', (e) => {
            this.loadFiles(e.target.value);

        });

        // Załaduj pierwszy plik
        if (files.length > 0) {
            this.loadFiles(files[0]);
        }
    }

    async loadFiles(filename) {
        try {
            const response = await fetch(`StepManiaFiles/${filename}.sm`);
            const content = await response.text();
            const parsed = StepManiaParser.parse(content);
            this.audio = new Audio(`MusicFiles/${filename}.mp3`);
            this.audio.preload = 'auto';

            // Pokaż pierwszy dostępny chart (Medium difficulty)
            const chart = parsed.charts.find(c => c.difficulty === 'Medium') || parsed.charts[0];

            if (chart) {
                this.currentChart = chart;
                this.currentNotes = chart.notes.sort((a, b) => a.time - b.time);

                document.getElementById('songTitle').textContent = parsed.metadata.TITLE || 'Unknown';
                document.getElementById('songArtist').textContent = parsed.metadata.ARTIST || 'Unknown Artist';

                // Dostosuj szybkość nut
                this.adjustNoteSpeed();
            }
        } catch (error) {
            const errorMessage = 'Błąd podczas ładowania pliku';
            console.error(errorMessage + ': ', error);
            document.getElementById('songTitle').textContent = errorMessage;
        }
    }

    adjustNoteSpeed() {
        // Oblicz szybkość na podstawie BPM
        this.noteSpeed = (this.bpm / 60) / 10;
    }

    start() {
        if (!this.currentChart) {
            alert('Najpierw załaduj plik!');
            return;
        }

        this.isRunning = true;
        if (this.audio) {
            this.audio.currentTime = 0;
            this.audio.play().catch(() => {});
        }
        this.startTime = Date.now();
        this.currentNoteIndex = 0;
        this.score = 0;
        this.combo = 0;
        this.hits = { perfect: 0, good: 0, miss: 0 };
        this.activeNotes = [];

        this.updateScore();
        this.update();
    }

    reset() {
        this.isRunning = false;
        this.activeNotes = [];
        this.currentNoteIndex = 0;
        this.score = 0;
        this.combo = 0;
        this.hits = { perfect: 0, good: 0, miss: 0 };

        if (this.audio) {
            this.audio.pause();
            this.audio.currentTime = 0;
        }

        this.clearNotes();
        this.updateScore();
    }

    update() {
        if (!this.isRunning) return;

        const now = Date.now();
        const elapsed = now - this.startTime;

        // Dodaj nowe nuty jeśli są
        while (
            this.currentNoteIndex < this.currentNotes.length &&
            this.currentNotes[this.currentNoteIndex].time <= elapsed + 2000 // Pokaż 2s przed czasem
        ) {
            const note = this.currentNotes[this.currentNoteIndex];
            this.addActiveNote(note);
            this.currentNoteIndex++;
        }

        // Aktualizuj pozycje nut
        this.updateActiveNotes(elapsed);

        // Sprawdź czy gra się skończyła
        if (this.currentNoteIndex >= this.currentNotes.length && this.activeNotes.length === 0) {
            this.isRunning = false;
            alert(`Gra skończona!\nScore: ${this.score}\nMax Combo: ${this.maxCombo}\nPerfect: ${this.hits.perfect}\nGood: ${this.hits.good}\nMiss: ${this.hits.miss}`);
            return;
        }

        requestAnimationFrame(() => this.update());
    }

    addActiveNote(note) {
        const laneElement = document.querySelector(`.lane[data-lane="${note.lane}"] .notes-container`);
        const noteElement = document.createElement('div');
        noteElement.className = 'note';
        noteElement.dataset.time = note.time;
        noteElement.dataset.lane = note.lane;

        const arrows = ['←', '↓', '↑', '→'];
        noteElement.textContent = arrows[note.lane];
        noteElement.style.transform = `translateY(${this.playFieldHeight}px)`;

        laneElement.appendChild(noteElement);

        this.activeNotes.push({
            element: noteElement,
            time: note.time,
            lane: note.lane,
            hit: false
        });
    }

    updateActiveNotes(elapsed) {
        for (let i = this.activeNotes.length - 1; i >= 0; i--) {
            const activeNote = this.activeNotes[i];
            const timeDiff = elapsed - activeNote.time;
            const distanceFromHitZone = this.playFieldHeight - timeDiff * this.noteSpeed;

            // Przesuń notę
            activeNote.element.style.transform = `translateY(${distanceFromHitZone}px)`;

            // Sprawdź czy nota przeszła hit zone
            if (distanceFromHitZone < -50 && !activeNote.hit) {
                this.missNote(i);
            }

            // Usuń notę jeśli jest daleko poza hit zone
            if (distanceFromHitZone < -100) {
                activeNote.element.remove();
                this.activeNotes.splice(i, 1);
            }
        }
    }

    onKeyDown(laneIndex) {
        if (!this.isRunning) return;

        const hitZone = {
            top: this.hitZoneTop,
            bottom: this.hitZoneTop + this.hitZoneHeight
        };
        // Szukaj nut w tym lane, które są w hit zone
        let bestNote = null;
        let bestDiff = Infinity;

        for (let i = 0; i < this.activeNotes.length; i++) {
            const activeNote = this.activeNotes[i];
            if (activeNote.lane !== laneIndex || activeNote.hit) continue;

            const rect = activeNote.element.getBoundingClientRect();
            const playFieldRect = document.getElementById('playField').getBoundingClientRect();
            const noteY = rect.top - playFieldRect.top;

            if (noteY >= hitZone.top - 30 && noteY <= hitZone.bottom + 30) {
                const diff = Math.abs(noteY - (hitZone.top + hitZone.bottom) / 2);
                if (diff < bestDiff) {
                    bestDiff = diff;
                    bestNote = i;
                }
            }
        }

        if (bestNote !== null) {
            const activeNote = this.activeNotes[bestNote];
            const rect = activeNote.element.getBoundingClientRect();
            const playFieldRect = document.getElementById('playField').getBoundingClientRect();
            const noteY = rect.top - playFieldRect.top;
            const hitZoneCenter = (hitZone.top + hitZone.bottom) / 2;
            const diff = Math.abs(noteY - hitZoneCenter);

            let hitType = 'miss';
            let points = 0;

            if (diff < 15) {
                hitType = 'perfect';
                points = 300;
            } else if (diff < 50) {
                hitType = 'good';
                points = 100;
            }

            this.hitNote(bestNote, hitType, points);
        }
    }

    onKeyUp(laneIndex) {
        // Opcjonalnie: obsługa puszczenia klawisza
    }

    hitNote(noteIndex, hitType, points) {
        const activeNote = this.activeNotes[noteIndex];
        activeNote.hit = true;

        this.hits[hitType]++;
        this.score += points;
        this.combo++;
        if (this.combo > this.maxCombo) {
            this.maxCombo = this.combo;
        }

        // Wizualny feedback
        const colors = {
            perfect: '#00ff00',
            good: '#ffff00',
            miss: '#ff0000'
        };

        activeNote.element.style.background = colors[hitType];
        activeNote.element.style.opacity = '0.7';

        this.updateScore();
    }

    missNote(noteIndex) {
        const activeNote = this.activeNotes[noteIndex];
        activeNote.hit = true;

        this.hits.miss++;
        this.combo = 0;

        activeNote.element.style.background = '#ff0000';
        activeNote.element.style.opacity = '0.5';

        this.updateScore();
    }

    updateScore() {
        document.getElementById('points').textContent = `Punkty: ${this.score}`;
        document.getElementById('combo').textContent = `Combo: ${this.combo}`;
    }

    clearNotes() {
        document.querySelectorAll('.note').forEach(note => note.remove());
    }
}

// Inicjalizacja gry
let game;
document.addEventListener('DOMContentLoaded', () => {
    game = new StepManiaGame();
});
