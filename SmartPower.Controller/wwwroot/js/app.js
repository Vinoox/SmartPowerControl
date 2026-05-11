// --- UTILS ---
const Utils = {
    debounce: (func, delay) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func(...args), delay);
        };
    },
    formatTime: (date) => date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
};

// --- CONFIG & CONSTANTS ---
const CONFIG = {
    COLORS: {
        silent: { hex: '#2ed573', bg: 'rgba(46, 213, 115, 0.15)', glow: 'rgba(46, 213, 115, 0.4)' },
        balanced: { hex: '#ffa502', bg: 'rgba(255, 165, 2, 0.15)', glow: 'rgba(255, 165, 2, 0.4)' },
        turbo: { hex: '#ff4757', bg: 'rgba(255, 71, 87, 0.15)', glow: 'rgba(255, 71, 87, 0.4)' }
    },
    MAX_DATA_POINTS: 60,
    POLL_INTERVAL: 1000
};

// --- API SERVICE ---
class ApiService {
    static async fetchState() {
        try {
            const response = await fetch('/api/state');
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('[API] Błąd pobierania stanu:', error);
            throw error;
        }
    }

    static async saveConfig(config) {
        try {
            const response = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            if (!response.ok) throw new Error('Błąd zapisu konfiguracji');
        } catch (error) {
            console.error('[API] Błąd wysyłania konfiguracji:', error);
        }
    }
}

// --- CHART MANAGER ---
class ThermalChart {
    constructor(canvasId, onThresholdChange, onDragEnd) {
        this.ctx = document.getElementById(canvasId);
        this.container = this.ctx.parentElement;
        this.onThresholdChange = onThresholdChange;
        this.onDragEnd = onDragEnd;

        this.draggingLine = null;
        this.thresholdTurbo = 60;
        this.thresholdSilent = 80;

        this.initChart();
        this.attachEventListeners();
    }

    initChart() {
        Chart.register(window['chartjs-plugin-annotation']);

        this.chart = new Chart(this.ctx, {
            type: 'line',
            data: {
                labels: [], datasets: [{
                    label: 'CPU Temp',
                    data: [],
                    borderColor: 'rgba(255, 255, 255, 0.9)',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    pointHitRadius: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 0 },
                interaction: { intersect: false, mode: 'index' },
                scales: {
                    y: { min: 0, max: 120, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8a9bb2' } },
                    x: { display: false }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: true },
                    annotation: { animations: false, annotations: this.getAnnotationsDef() }
                }
            }
        });
    }

    getAnnotationsDef() {
        const createZone = (yMin, yMax, color) => ({ type: 'box', yMin, yMax, backgroundColor: color, borderWidth: 0 });
        const createLine = (id, y, color, label) => ({
            type: 'line', yMin: y, yMax: y, borderColor: color, borderWidth: 2, borderDash: [4, 4],
            enter: () => this.ctx.style.cursor = 'grab',
            leave: () => { if (!this.draggingLine) this.ctx.style.cursor = 'default'; },
            label: { display: true, content: label, position: 'start', backgroundColor: color, font: { weight: 'bold' } }
        });

        return {
            boxTurbo: createZone(0, 60, CONFIG.COLORS.turbo.bg),
            boxBalanced: createZone(60, 80, CONFIG.COLORS.balanced.bg),
            boxSilent: createZone(80, 120, CONFIG.COLORS.silent.bg),
            lineTurbo: createLine('turbo', 60, CONFIG.COLORS.turbo.hex, 'LIMIT TURBO: 60°C'),
            lineSilent: createLine('silent', 80, CONFIG.COLORS.silent.hex, 'LIMIT SILENT: 80°C')
        };
    }

    updateData(timeLabel, temperature) {
        const data = this.chart.data;
        data.labels.push(timeLabel);
        data.datasets[0].data.push(temperature);

        if (data.labels.length > CONFIG.MAX_DATA_POINTS) {
            data.labels.shift();
            data.datasets[0].data.shift();
        }
        this.chart.update('none');
    }

    updateThresholds(turbo, silent) {
        if (this.draggingLine) return;

        this.thresholdTurbo = turbo;
        this.thresholdSilent = silent;
        this.renderAnnotations();
    }

    renderAnnotations() {
        const ann = this.chart.options.plugins.annotation.annotations;

        ann.boxTurbo.yMax = this.thresholdTurbo;
        ann.boxBalanced.yMin = this.thresholdTurbo;
        ann.boxBalanced.yMax = this.thresholdSilent;
        ann.boxSilent.yMin = this.thresholdSilent;

        ann.lineTurbo.yMin = this.thresholdTurbo;
        ann.lineTurbo.yMax = this.thresholdTurbo;
        ann.lineTurbo.label.content = `LIMIT TURBO: ${Math.round(this.thresholdTurbo)}°C`;

        ann.lineSilent.yMin = this.thresholdSilent;
        ann.lineSilent.yMax = this.thresholdSilent;
        ann.lineSilent.label.content = `LIMIT SILENT: ${Math.round(this.thresholdSilent)}°C`;

        this.chart.update('none');
    }


    attachEventListeners() {
        this.ctx.addEventListener('mousedown', (e) => this.handleDragStart(e));
        window.addEventListener('mousemove', (e) => this.handleDragMove(e));
        window.addEventListener('mouseup', () => this.handleDragEnd());
    }

    getChartYValue(event) {
        const rect = this.ctx.getBoundingClientRect();
        return this.chart.scales.y.getValueForPixel(event.clientY - rect.top);
    }

    handleDragStart(e) {
        const yValue = this.getChartYValue(e);
        if (Math.abs(yValue - this.thresholdTurbo) < 8) this.draggingLine = 'turbo';
        else if (Math.abs(yValue - this.thresholdSilent) < 8) this.draggingLine = 'silent';

        if (this.draggingLine) {
            this.container.classList.add('grabbing');
            this.ctx.style.cursor = 'grabbing';
        }
    }

    handleDragMove(e) {
        if (!this.draggingLine) return;

        const yValue = this.getChartYValue(e);

        if (this.draggingLine === 'turbo') {
            this.thresholdTurbo = Math.max(0, Math.min(yValue, this.thresholdSilent - 5));
        } else {
            this.thresholdSilent = Math.min(120, Math.max(yValue, this.thresholdTurbo + 5));
        }

        this.renderAnnotations();
        this.onThresholdChange(this.thresholdTurbo, this.thresholdSilent);
    }

    handleDragEnd() {
        if (this.draggingLine) {
            this.draggingLine = null;
            this.container.classList.remove('grabbing');
            this.ctx.style.cursor = 'default';
            this.onDragEnd();
        }
    }
}

// --- APP CONTROLLER ---
class App {
    constructor() {
        this.state = {
            thresholdTurbo: 60,
            thresholdSilent: 80,
            hysteresis: 3,
            isOnline: false
        };

        this.elements = {
            temp: document.getElementById('currentTemp'),
            mode: document.getElementById('currentMode'),
            hysteresis: document.getElementById('inputHysteresis'),
            status: document.getElementById('systemStatus')
        };

        this.saveConfigDebounced = Utils.debounce(() => this.saveConfig(), 500);

        this.init();
    }

    init() {
        this.chartManager = new ThermalChart(
            'tempChart',
            (turbo, silent) => this.handleChartDrag(turbo, silent),
            () => this.saveConfig()
        );

        this.setupEventListeners();
        this.startPolling();
    }

    setupEventListeners() {
        this.elements.hysteresis.addEventListener('change', (e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val) && val >= 0 && val <= 15) {
                this.state.hysteresis = val;
                this.saveConfig();
            }
        });
    }

    handleChartDrag(turbo, silent) {
        this.state.thresholdTurbo = turbo;
        this.state.thresholdSilent = silent;
    }

    async saveConfig() {
        await ApiService.saveConfig({
            thresholdTurbo: this.state.thresholdTurbo,
            thresholdSilent: this.state.thresholdSilent,
            hysteresis: this.state.hysteresis
        });
    }

    updateUI(serverState) {
        if (!this.state.isOnline) {
            this.state.isOnline = true;
            this.elements.status.classList.remove('offline');
            this.elements.status.classList.add('online');
            this.elements.status.querySelector('.status-text').innerText = 'System Online';
        }

        const temp = Math.round(serverState.currentTemperature);
        this.elements.temp.innerText = temp;
        this.elements.temp.style.color = temp > 85 ? CONFIG.COLORS.turbo.hex : 'var(--text-primary)';

        this.updateModeBadge(serverState.currentMode);
        if (document.activeElement !== this.elements.hysteresis) {
            this.elements.hysteresis.value = serverState.hysteresis;
            this.state.hysteresis = serverState.hysteresis;
        }

        this.chartManager.updateThresholds(serverState.thresholdTurbo, serverState.thresholdSilent);
        this.chartManager.updateData(Utils.formatTime(new Date()), serverState.currentTemperature);
    }

    updateModeBadge(modeId) {
        const badge = this.elements.mode;
        const modes = [
            { text: 'BALANCED', color: CONFIG.COLORS.balanced.hex, bg: CONFIG.COLORS.balanced.glow },
            { text: 'TURBO', color: CONFIG.COLORS.turbo.hex, bg: CONFIG.COLORS.turbo.glow },
            { text: 'SILENT', color: CONFIG.COLORS.silent.hex, bg: CONFIG.COLORS.silent.glow }
        ];

        const mode = modes[modeId] || { text: 'NIEZNANY', color: '#fff', bg: 'rgba(255,255,255,0.1)' };

        badge.innerText = mode.text;
        badge.style.color = mode.color;
        badge.style.backgroundColor = mode.bg;
        badge.style.boxShadow = `0 0 10px ${mode.bg}`;
    }

    handleOffline() {
        this.state.isOnline = false;
        this.elements.status.classList.remove('online');
        this.elements.status.classList.add('offline');
        this.elements.status.querySelector('.status-text').innerText = 'Brak połączenia';
        this.elements.mode.innerText = 'OFFLINE';
        this.elements.mode.style.backgroundColor = 'rgba(255,255,255,0.1)';
        this.elements.mode.style.color = 'var(--text-secondary)';
        this.elements.mode.style.boxShadow = 'none';
    }

    async startPolling() {
        const poll = async () => {
            try {
                const state = await ApiService.fetchState();
                this.updateUI(state);
            } catch (error) {
                this.handleOffline();
            } finally {
                setTimeout(poll, CONFIG.POLL_INTERVAL);
            }
        };

        window.addEventListener('load', () => poll());
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.appInstance = new App();
});