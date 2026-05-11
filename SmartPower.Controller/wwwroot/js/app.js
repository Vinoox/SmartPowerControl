const colors = {
    silent: 'rgba(46, 213, 115, 0.1)',   
    balanced: 'rgba(255, 165, 2, 0.1)',   
    turbo: 'rgba(255, 71, 87, 0.1)'       
};

let appState = {
    thresholdTurbo: 60,
    thresholdSilent: 80,
    hysteresis: 3
};

let draggingLine = null;

function updateModeUI(modeId) {
    const el = document.getElementById('currentMode');
    switch (modeId) {
        case 0:
            el.innerText = "BALANCED";
            el.style.backgroundColor = 'rgba(255, 165, 2, 0.2)'; el.style.color = 'var(--color-balanced)'; break;
        case 1:
            el.innerText = "TURBO";
            el.style.backgroundColor = 'rgba(255, 71, 87, 0.2)'; el.style.color = 'var(--color-turbo)'; break;
        case 2:
            el.innerText = "SILENT";
            el.style.backgroundColor = 'rgba(46, 213, 115, 0.2)'; el.style.color = 'var(--color-silent)'; break;
        default:
            el.innerText = "OFFLINE";
            el.style.backgroundColor = '#333'; el.style.color = 'var(--text-muted)';
    }
}

Chart.register(window['chartjs-plugin-annotation']);

const ctx = document.getElementById('tempChart');
const tempChart = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Temperatura CPU',
            data: [],
            borderColor: 'rgba(255, 255, 255, 0.8)',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 0
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: { min: 0, max: 120, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888', stepSize: 20 } },
            x: { display: false }
        },
        animation: { duration: 0 },
        plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
            annotation: {
                annotations: {
                    boxTurbo: { type: 'box', yMin: 0, yMax: 60, backgroundColor: colors.turbo, borderWidth: 0 },
                    boxBalanced: { type: 'box', yMin: 60, yMax: 80, backgroundColor: colors.balanced, borderWidth: 0 },
                    boxSilent: { type: 'box', yMin: 80, yMax: 120, backgroundColor: colors.silent, borderWidth: 0 },

                    lineTurbo: {
                        type: 'line', yMin: 60, yMax: 60, borderColor: 'var(--color-turbo)', borderWidth: 2, borderDash: [5, 5],
                        label: { display: true, content: 'LIMIT TURBO: 60°C', position: 'start', backgroundColor: 'var(--color-turbo)', font: { size: 11 } }
                    },
                    lineSilent: {
                        type: 'line', yMin: 80, yMax: 80, borderColor: 'var(--color-silent)', borderWidth: 2, borderDash: [5, 5],
                        label: { display: true, content: 'LIMIT SILENT: 80°C', position: 'start', backgroundColor: 'var(--color-silent)', font: { size: 11 } }
                    }
                }
            }
        }
    }
});

function renderAnnotations() {
    const ann = tempChart.options.plugins.annotation.annotations;

    ann.boxTurbo.yMax = appState.thresholdTurbo;
    ann.boxBalanced.yMin = appState.thresholdTurbo;
    ann.boxBalanced.yMax = appState.thresholdSilent;
    ann.boxSilent.yMin = appState.thresholdSilent;

    ann.lineTurbo.yMin = appState.thresholdTurbo;
    ann.lineTurbo.yMax = appState.thresholdTurbo;
    ann.lineTurbo.label.content = `LIMIT TURBO: ${Math.round(appState.thresholdTurbo)}°C`;

    ann.lineSilent.yMin = appState.thresholdSilent;
    ann.lineSilent.yMax = appState.thresholdSilent;
    ann.lineSilent.label.content = `LIMIT SILENT: ${Math.round(appState.thresholdSilent)}°C`;

    tempChart.update();
}

ctx.addEventListener('mousedown', (e) => {
    const rect = ctx.getBoundingClientRect();
    const yValue = tempChart.scales.y.getValueForPixel(e.clientY - rect.top);

    if (Math.abs(yValue - appState.thresholdTurbo) < 5) {
        draggingLine = 'turbo'; ctx.classList.add('grabbing');
    } else if (Math.abs(yValue - appState.thresholdSilent) < 5) {
        draggingLine = 'silent'; ctx.classList.add('grabbing');
    }
});

ctx.addEventListener('mousemove', (e) => {
    const yValue = tempChart.scales.y.getValueForPixel(e.clientY - ctx.getBoundingClientRect().top);

    if (draggingLine) {
        if (draggingLine === 'turbo') {
            appState.thresholdTurbo = Math.max(0, Math.min(yValue, appState.thresholdSilent - 2));
        } else if (draggingLine === 'silent') {
            appState.thresholdSilent = Math.min(120, Math.max(yValue, appState.thresholdTurbo + 2));
        }
        renderAnnotations();
    } else {
        ctx.style.cursor = (Math.abs(yValue - appState.thresholdTurbo) < 5 || Math.abs(yValue - appState.thresholdSilent) < 5) ? 'grab' : 'default';
    }
});

ctx.addEventListener('mouseup', async () => {
    if (draggingLine) { draggingLine = null; ctx.classList.remove('grabbing'); await saveConfigToAPI(); }
});
ctx.addEventListener('mouseleave', () => {
    if (draggingLine) { draggingLine = null; ctx.classList.remove('grabbing'); saveConfigToAPI(); }
});

document.getElementById('inputHysteresis').addEventListener('change', async (e) => {
    appState.hysteresis = parseFloat(e.target.value);
    await saveConfigToAPI();
});

async function fetchState() {
    try {
        const response = await fetch('/api/state');
        const state = await response.json();

        const tempEl = document.getElementById('currentTemp');
        tempEl.innerText = Math.round(state.currentTemperature) + " °C";
        tempEl.style.color = state.currentTemperature > 85 ? 'var(--color-turbo)' : 'var(--text-main)';

        updateModeUI(state.currentMode);

        if (!draggingLine) {
            appState.thresholdTurbo = state.thresholdTurbo;
            appState.thresholdSilent = state.thresholdSilent;
            appState.hysteresis = state.hysteresis;

            document.getElementById('inputHysteresis').value = state.hysteresis;
            renderAnnotations();
        }

        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        tempChart.data.labels.push(now);
        tempChart.data.datasets[0].data.push(state.currentTemperature);

        if (tempChart.data.labels.length > 60) {
            tempChart.data.labels.shift();
            tempChart.data.datasets[0].data.shift();
        }
        tempChart.update();

    } catch (error) {
        console.error("Błąd API:", error);
    }
}

async function saveConfigToAPI() {
    const newConfig = {
        thresholdTurbo: appState.thresholdTurbo,
        thresholdSilent: appState.thresholdSilent,
        hysteresis: appState.hysteresis
    };
    await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
    });
}

setInterval(fetchState, 1000);
fetchState();