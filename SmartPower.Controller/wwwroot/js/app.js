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
// Dostosowane do nowej nowoczesnej palety kolorów
const CONFIG = {
    COLORS: {
        silent: { hex: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', glow: 'rgba(16, 185, 129, 0.3)' },
        balanced: { hex: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', glow: 'rgba(245, 158, 11, 0.3)' },
        turbo: { hex: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', glow: 'rgba(239, 68, 68, 0.3)' }
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
    constructor(canvasId, color, label, onThresholdChange, onDragEnd) {
        this.ctx = document.getElementById(canvasId);
        this.container = this.ctx.parentElement;
        this.color = color;
        this.label = label;
        this.onThresholdChange = onThresholdChange;
        this.onDragEnd = onDragEnd;
        this.hasInteraction = !!onThresholdChange;

        this.draggingLine = null;
        this.thresholdTurbo = 60;
        this.thresholdSilent = 80;

        this.initChart();
        if (this.hasInteraction) {
            this.attachEventListeners();
        }
    }

    initChart() {
        Chart.register(window['chartjs-plugin-annotation']);

        this.chart = new Chart(this.ctx, {
            type: 'line',
            data: {
                labels: [], datasets: [{
                    label: this.label,
                    data: [],
                    borderColor: this.color,
                    backgroundColor: this.color.replace('1)', '0.05)'), // Lepszy półprzezroczysty fill
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.4, // Zwiększone napięcie dla bardziej płynnych krzywych
                    pointRadius: 0,
                    pointHitRadius: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                // Włączenie płynnej animacji dodawania danych
                animation: { duration: 400, easing: 'easeOutQuart' },
                interaction: { intersect: false, mode: 'index' },
                layout: { padding: { top: 10, bottom: 10 } },
                scales: {
                    y: {
                        min: 0,
                        grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
                        ticks: { color: '#94a3b8', font: { family: 'Inter', size: 11 } },
                        beginAtZero: true
                    },
                    x: {
                        display: true,
                        grid: { display: false },
                        ticks: { maxTicksLimit: 6, color: '#64748b', font: { family: 'Inter', size: 10 } }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: true,
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleFont: { family: 'Inter' },
                        bodyFont: { family: 'Inter' },
                        padding: 10,
                        cornerRadius: 8
                    },
                    annotation: {
                        animations: false,
                        annotations: this.hasInteraction ? this.getAnnotationsDef() : {}
                    }
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
            label: {
                display: true,
                content: label,
                position: 'start',
                backgroundColor: color,
                font: { family: 'Inter', weight: 'bold', size: 10 },
                padding: 4,
                borderRadius: 4
            }
        });

        return {
            boxTurbo: createZone(0, 60, CONFIG.COLORS.turbo.bg),
            boxBalanced: createZone(60, 80, CONFIG.COLORS.balanced.bg),
            boxSilent: createZone(80, 150, CONFIG.COLORS.silent.bg),
            lineTurbo: createLine('turbo', 60, CONFIG.COLORS.turbo.hex, 'TURBO: 60°C'),
            lineSilent: createLine('silent', 80, CONFIG.COLORS.silent.hex, 'SILENT: 80°C')
        };
    }

    updateData(timeLabel, value) {
        const data = this.chart.data;
        data.labels.push(timeLabel);
        data.datasets[0].data.push(value);

        if (data.labels.length > CONFIG.MAX_DATA_POINTS) {
            data.labels.shift();
            data.datasets[0].data.shift();
        }
        this.chart.update('none'); // używamy 'none' do adnotacji, dodawanie punktów w chart.js samo się animuje
    }

    updateThresholds(turbo, silent) {
        if (this.draggingLine || !this.hasInteraction) return;

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
        ann.lineTurbo.label.content = `TURBO: ${Math.round(this.thresholdTurbo)}°C`;

        ann.lineSilent.yMin = this.thresholdSilent;
        ann.lineSilent.yMax = this.thresholdSilent;
        ann.lineSilent.label.content = `SILENT: ${Math.round(this.thresholdSilent)}°C`;

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
            power: document.getElementById('currentPower'),
            mode: document.getElementById('currentMode'),
            hysteresis: document.getElementById('inputHysteresis'),
            status: document.getElementById('systemStatus')
        };

        this.saveConfigDebounced = Utils.debounce(() => this.saveConfig(), 500);

        this.init();
    }

    init() {
        // Nowoczesne kolory dla wykresów
        this.tempChart = new ThermalChart(
            'tempChart',
            'rgba(14, 165, 233, 1)', // Light Blue / Cyan
            'CPU Temp (°C)',
            (turbo, silent) => this.handleChartDrag(turbo, silent),
            () => this.saveConfig()
        );

        this.powerChart = new ThermalChart(
            'powerChart',
            'rgba(139, 92, 246, 1)', // Fioletowy (dodaje urozmaicenia)
            'CPU Power (W)',
            null,
            null
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
            this.elements.status.querySelector('.status-text').innerText = 'Połączono';
        }

        const temp = Math.round(serverState.currentTemperature);
        this.elements.temp.innerText = temp;
        this.elements.temp.style.color = temp > 85 ? CONFIG.COLORS.turbo.hex : 'var(--text-primary)';

        const power = serverState.currentCpuPower.toFixed(1);
        this.elements.power.innerText = power;

        this.updateModeBadge(serverState.currentMode);

        if (document.activeElement !== this.elements.hysteresis) {
            this.elements.hysteresis.value = serverState.hysteresis;
            this.state.hysteresis = serverState.hysteresis;
        }

        const time = Utils.formatTime(new Date());
        this.tempChart.updateData(time, serverState.currentTemperature);
        this.powerChart.updateData(time, serverState.currentCpuPower);

        this.tempChart.updateThresholds(serverState.thresholdTurbo, serverState.thresholdSilent);
    }

    updateModeBadge(modeId) {
        const badge = this.elements.mode;
        const modes = [
            { text: 'BALANCED', color: CONFIG.COLORS.balanced.hex, bg: CONFIG.COLORS.balanced.bg, border: CONFIG.COLORS.balanced.hex },
            { text: 'TURBO', color: CONFIG.COLORS.turbo.hex, bg: CONFIG.COLORS.turbo.bg, border: CONFIG.COLORS.turbo.hex },
            { text: 'SILENT', color: CONFIG.COLORS.silent.hex, bg: CONFIG.COLORS.silent.bg, border: CONFIG.COLORS.silent.hex }
        ];

        const mode = modes[modeId] || { text: 'NIEZNANY', color: '#fff', bg: 'rgba(255,255,255,0.1)', border: 'transparent' };

        badge.innerText = mode.text;
        badge.style.color = mode.color;
        badge.style.backgroundColor = mode.bg;
        badge.style.border = `1px solid ${mode.border}`;
        badge.style.boxShadow = `0 0 15px ${mode.bg}`;
    }

    handleOffline() {
        this.state.isOnline = false;
        this.elements.status.classList.remove('online');
        this.elements.status.classList.add('offline');
        this.elements.status.querySelector('.status-text').innerText = 'Brak połączenia';
        this.elements.mode.innerText = 'OFFLINE';
        this.elements.mode.style.backgroundColor = 'rgba(255,255,255,0.05)';
        this.elements.mode.style.color = 'var(--text-secondary)';
        this.elements.mode.style.boxShadow = 'none';
        this.elements.mode.style.border = '1px solid rgba(255,255,255,0.1)';
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