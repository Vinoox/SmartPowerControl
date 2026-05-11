const colors = {
    silent: 'rgba(16, 185, 129, 0.1)',
    balanced: 'rgba(245, 158, 11, 0.1)',
    turbo: 'rgba(239, 68, 68, 0.1)'
};

let appState = { thresholdTurbo: 60, thresholdSilent: 80, hysteresis: 3 };
let draggingLine = null;

function updateModeUI(modeId) {
    const el = document.getElementById('currentMode');
    switch (modeId) {
        case 0:
            el.innerHTML = 'BALANCED';
            el.style.backgroundColor = 'rgba(245, 158, 11, 0.1)';
            el.style.color = 'var(--color-balanced)';
            el.style.borderColor = 'rgba(245, 158, 11, 0.3)'; break;
        case 1:
            el.innerHTML = 'TURBO';
            el.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
            el.style.color = 'var(--color-turbo)';
            el.style.borderColor = 'rgba(239, 68, 68, 0.3)'; break;
        case 2:
            el.innerHTML = 'SILENT';
            el.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
            el.style.color = 'var(--color-silent)';
            el.style.borderColor = 'rgba(16, 185, 129, 0.3)'; break;
        default:
            el.innerHTML = 'OFFLINE';
            el.style.backgroundColor = 'rgba(255,255,255,0.05)';
            el.style.color = 'var(--text-muted)'; break;
    }
}

Chart.register(window['chartjs-plugin-annotation']);
const ctx = document.getElementById('tempChart');

let gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 800);
gradient.addColorStop(0, 'rgba(56, 189, 248, 0.8)');
gradient.addColorStop(1, 'rgba(56, 189, 248, 0)');

const tempChart = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            data: [],
            borderColor: '#38bdf8',
            backgroundColor: gradient,
            borderWidth: 3,
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            shadowOffsetX: 0, shadowOffsetY: 10, shadowBlur: 15, shadowColor: 'rgba(56, 189, 248, 0.5)'
        }]
    },
    options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { left: 10, right: 30, top: 20, bottom: 10 } },
        scales: {
            y: {
                min: 20, max: 110,
                grid: { color: 'rgba(255,255,255,0.05)', borderDash: [5, 5] },
                ticks: { color: '#94a3b8', font: { size: 13, family: 'Inter' } },
                border: { display: false }
            },
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

                    /* --- ZDECYDOWANIE POPRAWIONA CZYTELNOŚĆ PASKÓW --- */
                    lineTurbo: {
                        type: 'line', yMin: 60, yMax: 60,
                        borderColor: '#ef4444', borderWidth: 2, borderDash: [4, 4],
                        label: {
                            display: true,
                            content: 'TURBO 60°C',
                            position: 'start',
                            backgroundColor: 'rgba(239, 68, 68, 0.95)', // Solidne tło etykiety
                            color: '#ffffff', // Czysty biały tekst
                            padding: { top: 4, bottom: 4, left: 10, right: 10 },
                            borderRadius: 6,
                            font: { size: 13, weight: 'bold', family: 'Inter, sans-serif' },
                            xAdjust: 15,  // Odsunięcie od lewej
                            yAdjust: -14  // MAGIA: Wypchnięcie napisu NAD linię!
                        }
                    },
                    lineSilent: {
                        type: 'line', yMin: 80, yMax: 80,
                        borderColor: '#10b981', borderWidth: 2, borderDash: [4, 4],
                        label: {
                            display: true,
                            content: 'SILENT 80°C',
                            position: 'start',
                            backgroundColor: 'rgba(16, 185, 129, 0.95)',
                            color: '#ffffff',
                            padding: { top: 4, bottom: 4, left: 10, right: 10 },
                            borderRadius: 6,
                            font: { size: 13, weight: 'bold', family: 'Inter, sans-serif' },
                            xAdjust: 15,
                            yAdjust: -14  // MAGIA: Wypchnięcie napisu NAD linię!
                        }
                    }
                    /* ------------------------------------------------ */
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
    // Skrócony, bardzo czytelny tekst
    ann.lineTurbo.label.content = `TURBO  ${Math.round(appState.thresholdTurbo)}°C`;

    ann.lineSilent.yMin = appState.thresholdSilent;
    ann.lineSilent.yMax = appState.thresholdSilent;
    // Skrócony, bardzo czytelny tekst
    ann.lineSilent.label.content = `SILENT  ${Math.round(appState.thresholdSilent)}°C`;

    tempChart.update();
}

ctx.addEventListener('mousedown', (e) => {
    const yValue = tempChart.scales.y.getValueForPixel(e.clientY - ctx.getBoundingClientRect().top);
    if (Math.abs(yValue - appState.thresholdTurbo) < 5) { draggingLine = 'turbo'; ctx.classList.add('grabbing'); }
    else if (Math.abs(yValue - appState.thresholdSilent) < 5) { draggingLine = 'silent'; ctx.classList.add('grabbing'); }
});

ctx.addEventListener('mousemove', (e) => {
    const yValue = tempChart.scales.y.getValueForPixel(e.clientY - ctx.getBoundingClientRect().top);
    if (draggingLine) {
        if (draggingLine === 'turbo') appState.thresholdTurbo = Math.max(20, Math.min(yValue, appState.thresholdSilent - 2));
        else if (draggingLine === 'silent') appState.thresholdSilent = Math.min(110, Math.max(yValue, appState.thresholdTurbo + 2));
        renderAnnotations();
    } else {
        ctx.style.cursor = (Math.abs(yValue - appState.thresholdTurbo) < 5 || Math.abs(yValue - appState.thresholdSilent) < 5) ? 'grab' : 'default';
    }
});

ctx.addEventListener('mouseup', async () => { if (draggingLine) { draggingLine = null; ctx.classList.remove('grabbing'); await saveConfigToAPI(); } });
ctx.addEventListener('mouseleave', () => { if (draggingLine) { draggingLine = null; ctx.classList.remove('grabbing'); saveConfigToAPI(); } });

const hystInput = document.getElementById('inputHysteresis');
const hystDisplay = document.getElementById('hysteresisVal');
hystInput.addEventListener('input', (e) => { hystDisplay.innerText = parseFloat(e.target.value).toFixed(1) + " °C"; });
hystInput.addEventListener('change', async (e) => { appState.hysteresis = parseFloat(e.target.value); await saveConfigToAPI(); });

async function fetchState() {
    try {
        const response = await fetch('/api/state');
        const state = await response.json();

        document.getElementById('currentTemp').innerHTML = `${Math.round(state.currentTemperature)}<span class="unit">°C</span>`;
        updateModeUI(state.currentMode);

        if (!draggingLine) {
            appState.thresholdTurbo = state.thresholdTurbo;
            appState.thresholdSilent = state.thresholdSilent;
            appState.hysteresis = state.hysteresis;

            hystInput.value = state.hysteresis;
            hystDisplay.innerText = state.hysteresis.toFixed(1) + " °C";
            renderAnnotations();
        }

        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        tempChart.data.labels.push(now);
        tempChart.data.datasets[0].data.push(state.currentTemperature);

        if (tempChart.data.labels.length > 50) { tempChart.data.labels.shift(); tempChart.data.datasets[0].data.shift(); }
        tempChart.update();
    } catch (error) { console.error("API Error:", error); }
}

async function saveConfigToAPI() {
    await fetch('/api/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thresholdTurbo: appState.thresholdTurbo, thresholdSilent: appState.thresholdSilent, hysteresis: appState.hysteresis })
    });
}

setInterval(fetchState, 1000);
fetchState();