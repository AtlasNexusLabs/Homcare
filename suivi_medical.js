const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQXFBHQUxVsyt49ZiP1f2IsNoBsUxUCLDcllnVzF4rrMixHDtDVuCg-5vf5WbGtvpV6bpBep2O_2v7v/pub?gid=0&single=true&output=csv';

const thresholdLinesPlugin = {
    id: 'thresholdLines',
    afterDraw(chart, args, options) {
        if (!options || !options.lines) return;
        const { ctx, chartArea: { left, right }, scales: { y } } = chart;
        ctx.save();
        options.lines.forEach(line => {
            if (line.value === null || line.value === undefined || isNaN(line.value)) return;
            const yPos = y.getPixelForValue(line.value);
            ctx.beginPath();
            ctx.setLineDash(line.dash || [4, 4]);
            ctx.moveTo(left, yPos);
            ctx.lineTo(right, yPos);
            ctx.strokeStyle = line.color || 'rgba(56, 189, 248, 0.45)';
            ctx.lineWidth = line.width || 1;
            ctx.stroke();
        });
        ctx.restore();
    }
};

Chart.register(thresholdLinesPlugin);
Chart.defaults.color = '#727A8E';
Chart.defaults.borderColor = '#1E2435';

let chartInstances = {};
let rawMedicalData = [];
let currentPeriod = 'today';
let customBounds = { min: null, max: null };

function updateLiveDateTime() {
    const now = new Date();
    const optionsDate = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
    let dateStr = now.toLocaleDateString('fr-FR', optionsDate);
    document.getElementById('currentDate').innerText = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    document.getElementById('currentTime').innerText = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
updateLiveDateTime();
setInterval(updateLiveDateTime, 1000);

function switchTab(tab) {
    const viewSuivi = document.getElementById('viewSuivi');
    const viewParams = document.getElementById('viewParams');
    const navSuivi = document.getElementById('navSuivi');
    const navParams = document.getElementById('navParams');
    const periodSelector = document.getElementById('periodSelector');
    const title = document.getElementById('pageTitle');
    const subtitle = document.getElementById('pageSubtitle');

    if (tab === 'suivi') {
        viewSuivi.classList.remove('hidden');
        viewParams.classList.add('hidden');
        navSuivi.classList.add('active');
        navParams.classList.remove('active');
        periodSelector.style.display = 'flex';
        title.innerText = "Suivi Médical";
        subtitle.innerText = "Vos données de santé en un coup d'œil";
    } else {
        viewSuivi.classList.add('hidden');
        viewParams.classList.remove('hidden');
        navSuivi.classList.remove('active');
        navParams.classList.add('active');
        periodSelector.style.display = 'none';
        title.innerText = "Paramètres Médicaux";
        subtitle.innerText = "Configurez les seuils et limites de surveillance";
    }
}

function getTimeBounds(period) {
    const now = new Date();
    let min, max;

    if (period === 'today') {
        min = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 0, 0);
        if (now.getHours() < 6) min.setDate(min.getDate() - 1);
        max = new Date(min.getTime() + 24 * 60 * 60 * 1000 - 1000);
    } else if (period === '7d') {
        max = new Date(now);
        min = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === '30d') {
        max = new Date(now);
        min = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (period === '3m') {
        max = new Date(now);
        min = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    } else if (period === 'custom') {
        min = customBounds.min || new Date(now.getTime() - 24 * 60 * 60 * 1000);
        max = customBounds.max || now;
    }

    return { min: min.getTime(), max: max.getTime() };
}

function setPeriod(period, evt) {
    currentPeriod = period;
    const btns = document.querySelectorAll('.period-btn');
    btns.forEach(b => b.classList.remove('active'));
    if (evt && evt.target) evt.target.classList.add('active');

    const customPicker = document.getElementById('customRangePicker');
    if (period === 'custom') customPicker.classList.remove('hidden');
    else customPicker.classList.add('hidden');

    renderDashboard();
}

function applyCustomPeriod() {
    const startVal = document.getElementById('customStartDate').value;
    const endVal = document.getElementById('customEndDate').value;

    if (startVal && endVal) {
        customBounds.min = new Date(startVal + 'T00:00:00').getTime();
        customBounds.max = new Date(endVal + 'T23:59:59').getTime();
        renderDashboard();
    }
}

function parseFrenchDate(dateStr) {
    if (!dateStr) return null;
    dateStr = dateStr.trim();
    
    if (dateStr.includes('-')) {
        const parsed = Date.parse(dateStr);
        return isNaN(parsed) ? null : parsed;
    }

    const parts = dateStr.split(' ');
    const dateParts = parts[0].split('/');
    if (dateParts.length !== 3) return null;

    const day = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1;
    const year = parseInt(dateParts[2], 10);

    let hours = 12, minutes = 0;
    if (parts[1]) {
        const timeParts = parts[1].split(':');
        if (timeParts.length >= 2) {
            hours = parseInt(timeParts[0], 10);
            minutes = parseInt(timeParts[1], 10);
        }
    }

    const date = new Date(year, month, day, hours, minutes);
    return isNaN(date.getTime()) ? null : date.getTime();
}

function getTimeUnit(period) {
    if (period === 'today') return 'hour';
    if (period === '7d' || period === '30d') return 'day';
    return 'week';
}

function createTimeLineChart(id, dataPoints, color, minY, maxY, stepSize, bounds, thresholdLines = []) {
    if (chartInstances[id]) chartInstances[id].destroy();

    const timeConfig = {
        unit: getTimeUnit(currentPeriod),
        displayFormats: { hour: 'HH:mm', day: 'dd MMM', week: 'dd MMM' }
    };

    if (currentPeriod === 'today') timeConfig.stepSize = 2;

    chartInstances[id] = new Chart(document.getElementById(id).getContext('2d'), {
        type: 'line',
        data: {
            datasets: [{
                data: dataPoints,
                borderColor: color,
                borderWidth: 2,
                tension: 0.3,
                pointRadius: 3,
                pointBackgroundColor: color,
                fill: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                thresholdLines: { lines: thresholdLines }
            },
            scales: {
                x: {
                    type: 'time',
                    min: bounds.min,
                    max: bounds.max,
                    time: timeConfig,
                    grid: { display: false },
                    ticks: { font: { size: 9 }, maxRotation: 0 }
                },
                y: { min: minY, max: maxY, ticks: { stepSize: stepSize, font: { size: 9 } } }
            }
        }
    });
}

function createTimeBarChart(id, dataPoints, color, minY, maxY, stepSize, bounds, isDynamicColor = false, thresholdLines = []) {
    if (chartInstances[id]) chartInstances[id].destroy();

    const timeConfig = {
        unit: getTimeUnit(currentPeriod),
        displayFormats: { hour: 'HH:mm', day: 'dd MMM', week: 'dd MMM' }
    };

    if (currentPeriod === 'today') timeConfig.stepSize = 2;

    chartInstances[id] = new Chart(document.getElementById(id).getContext('2d'), {
        type: 'bar',
        data: {
            datasets: [{
                data: dataPoints,
                backgroundColor: isDynamicColor ? dataPoints.map(p => p.y >= 6 ? '#EF4444' : (p.y >= (settings.enableDouleur ? settings.maxDouleur : 4) ? '#F97316' : '#10B981')) : color,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                thresholdLines: { lines: thresholdLines }
            },
            scales: {
                x: {
                    type: 'time',
                    min: bounds.min,
                    max: bounds.max,
                    time: timeConfig,
                    grid: { display: false },
                    ticks: { font: { size: 9 }, maxRotation: 0 }
                },
                y: { min: minY, max: maxY, ticks: { stepSize: stepSize, font: { size: 9 } } }
            }
        }
    });
}

function updateMetaBadge(badgeId, subtextId, value, min, max, isSingleThreshold = false, singleType = 'max') {
    const badge = document.getElementById(badgeId);
    const subtext = document.getElementById(subtextId);

    const hasMin = min !== null && min !== undefined && !isNaN(min);
    const hasMax = max !== null && max !== undefined && !isNaN(max);

    let rangeText = '';
    if (isSingleThreshold) {
        if (singleType === 'max' && hasMax) rangeText = `Seuil : ${max}`;
        else if (singleType === 'min' && hasMin) rangeText = `Seuil : ${min}`;
    } else {
        if (hasMin && hasMax) rangeText = `Min ${min} | Max ${max}`;
        else if (hasMin) rangeText = `Min : ${min}`;
        else if (hasMax) rangeText = `Max : ${max}`;
    }
    if (subtext) subtext.innerText = rangeText;

    if (value === '--' || value === null || isNaN(value)) {
        badge.className = 'badge badge-normal';
        badge.innerText = 'Pas de donnée';
        return;
    }

    const val = parseFloat(value);
    let isNormal = true;

    if (isSingleThreshold) {
        if (singleType === 'max' && hasMax && val > max) isNormal = false;
        if (singleType === 'min' && hasMin && val < min) isNormal = false;
    } else {
        if (hasMin && val < min) isNormal = false;
        if (hasMax && val > max) isNormal = false;
    }

    if (isNormal) {
        badge.className = 'badge badge-normal';
        badge.innerText = 'Normale';
    } else {
        badge.className = 'badge badge-warning';
        badge.innerText = 'Hors norme';
    }
}

function updateObservationsBlock(dataList) {
    if (!dataList || !dataList.length) return;

    const latest = dataList[dataList.length - 1];

    const elemMed = document.getElementById('obsMedicaments');
    const valMed = (latest.Medicaments || '').trim();
    if (!valMed || valMed.toUpperCase() === 'OK') {
        elemMed.innerText = 'Traitement habituel';
        elemMed.classList.remove('notified');
    } else {
        elemMed.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="margin-right:4px;"></i>${valMed}`;
        elemMed.classList.add('notified');
    }

    const elemAli = document.getElementById('obsAlimentation');
    const valAli = (latest.Alimentation || '').trim();
    if (!valAli || valAli.toUpperCase() === 'OK') {
        elemAli.innerText = 'Normale';
        elemAli.classList.remove('notified');
    } else {
        elemAli.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="margin-right:4px;"></i>${valAli}`;
        elemAli.classList.add('notified');
    }

    const elemHyd = document.getElementById('obsHydratation');
    const valHyd = (latest.Hydratation || '').trim();
    if (!valHyd || valHyd.toUpperCase() === 'OK') {
        elemHyd.innerText = '1,5 L / jour';
        elemHyd.classList.remove('notified');
    } else {
        elemHyd.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="margin-right:4px;"></i>${valHyd}`;
        elemHyd.classList.add('notified');
    }

    const elemSel = document.getElementById('obsSelles');
    const valSel = (latest.Selles || '').trim();
    elemSel.innerText = (!valSel || valSel.toUpperCase() === 'RAS') ? 'RAS' : valSel.toUpperCase();

    const elemObs = document.getElementById('obsDerniereNote');
    const valObs = (latest.Observations || '').trim();
    elemObs.innerText = (!valObs || valObs.toUpperCase() === 'RAS') ? 'Bonne journée, rien à signaler.' : valObs;
}

function renderDashboard() {
    if (!rawMedicalData.length) return;

    updateObservationsBlock(rawMedicalData);

    const bounds = getTimeBounds(currentPeriod);
    const filteredData = rawMedicalData.filter(r => r.timestamp && r.timestamp >= bounds.min && r.timestamp <= bounds.max);

    const spo2Points = filteredData.filter(r => r.Oxygène !== null).map(r => ({ x: r.timestamp, y: r.Oxygène }));
    const pulsePoints = filteredData.filter(r => r.Bpm !== null).map(r => ({ x: r.timestamp, y: r.Bpm }));
    const poidsPoints = filteredData.filter(r => r.Poids !== null).map(r => ({ x: r.timestamp, y: r.Poids }));
    const urinePoints = filteredData.filter(r => r.Urine !== null).map(r => ({ x: r.timestamp, y: r.Urine }));
    const douleurPoints = filteredData.filter(r => r.Douleur !== null).map(r => ({ x: r.timestamp, y: r.Douleur }));
    const respPoints = filteredData.filter(r => r.Resp !== null).map(r => ({ x: r.timestamp, y: r.Resp }));
    const sysPoints = filteredData.filter(r => r.Sys !== null).map(r => ({ x: r.timestamp, y: r.Sys }));
    const diaPoints = filteredData.filter(r => r.Dia !== null).map(r => ({ x: r.timestamp, y: r.Dia }));

    const getAverageVal = (pts) => {
        if (!pts.length) return '--';
        const sum = pts.reduce((acc, curr) => acc + curr.y, 0);
        const avg = sum / pts.length;
        return Number.isInteger(avg) ? avg : avg.toFixed(1);
    };

    const avgSpo2 = getAverageVal(spo2Points);
    const avgPulse = getAverageVal(pulsePoints);
    const avgPoids = getAverageVal(poidsPoints);
    const avgResp = getAverageVal(respPoints);
    const avgDouleur = getAverageVal(douleurPoints);

    document.getElementById('valSpo2').innerText = avgSpo2;
    document.getElementById('valPulse').innerText = avgPulse;
    document.getElementById('valPoids').innerText = avgPoids;
    document.getElementById('valResp').innerText = avgResp;
    document.getElementById('valDouleur').innerText = avgDouleur;

    const avgSys = getAverageVal(sysPoints);
    const avgDia = getAverageVal(diaPoints);
    document.getElementById('valTension').innerText = (avgSys !== '--') ? `${avgSys} / ${avgDia}` : '-- / --';

    let valUrine = '--';
    const valUrineElem = document.getElementById('valUrine');
    const unitUrineElem = document.getElementById('unitUrine');

    if (!urinePoints.length) {
        valUrineElem.innerText = '--';
    } else if (currentPeriod === 'today') {
        const totalUrine = urinePoints.reduce((acc, curr) => acc + curr.y, 0);
        valUrine = Math.round(totalUrine);
        valUrineElem.innerText = valUrine;
        if (unitUrineElem) unitUrineElem.innerText = 'ml / jour';
    } else {
        const dailyTotals = {};
        filteredData.forEach(r => {
            if (r.Urine !== null) {
                const dateKey = new Date(r.timestamp).toISOString().split('T')[0];
                dailyTotals[dateKey] = (dailyTotals[dateKey] || 0) + r.Urine;
            }
        });

        const totalsArray = Object.values(dailyTotals);
        if (totalsArray.length > 0) {
            valUrine = Math.round(totalsArray.reduce((acc, curr) => acc + curr, 0) / totalsArray.length);
            valUrineElem.innerText = valUrine;
        } else {
            valUrineElem.innerText = '--';
        }
        if (unitUrineElem) unitUrineElem.innerText = 'ml / jour (moy)';
    }

    updateMetaBadge('badgeSpo2', 'subtextSpo2', avgSpo2, settings.minSpo2, settings.maxSpo2);
    updateMetaBadge('badgePulse', 'subtextPulse', avgPulse, settings.minPulse, settings.maxPulse);
    updateMetaBadge('badgeResp', 'subtextResp', avgResp, settings.minResp, settings.maxResp);
    updateMetaBadge('badgeUrine', 'subtextUrine', valUrine, settings.minUrine, settings.maxUrine);
    updateMetaBadge('badgePoids', 'subtextPoids', avgPoids, null, settings.maxPoids, true, 'max');
    updateMetaBadge('badgeDouleur', 'subtextDouleur', avgDouleur, null, settings.maxDouleur, true, 'max');

    let sysText = settings.enableSys ? `SYS ${settings.minSys}-${settings.maxSys}` : '';
    let diaText = settings.enableDia ? `DIA ${settings.minDia}-${settings.maxDia}` : '';
    document.getElementById('subtextTension').innerText = [sysText, diaText].filter(Boolean).join(' | ');

    if (avgSys === '--' || avgSys === null || isNaN(avgSys)) {
        document.getElementById('badgeTension').className = 'badge badge-normal';
        document.getElementById('badgeTension').innerText = 'Pas de donnée';
    } else {
        const valSysNum = parseFloat(avgSys);
        const valDiaNum = parseFloat(avgDia);
        let isTensionNormal = true;
        
        if (settings.enableSys && (valSysNum < settings.minSys || valSysNum > settings.maxSys)) isTensionNormal = false;
        if (settings.enableDia && (valDiaNum < settings.minDia || valDiaNum > settings.maxDia)) isTensionNormal = false;

        if (isTensionNormal) {
            document.getElementById('badgeTension').className = 'badge badge-normal';
            document.getElementById('badgeTension').innerText = 'Normale';
        } else {
            document.getElementById('badgeTension').className = 'badge badge-warning';
            document.getElementById('badgeTension').innerText = 'Hors norme';
        }
    }

    const linesSpo2 = settings.enableSpo2 ? [{ value: settings.minSpo2 }, { value: settings.maxSpo2 }] : [];
    const linesPulse = settings.enablePulse ? [{ value: settings.minPulse }, { value: settings.maxPulse }] : [];
    const linesResp = settings.enableResp ? [{ value: settings.minResp }, { value: settings.maxResp }] : [];
    const linesUrine = settings.enableUrine ? [{ value: settings.minUrine }, { value: settings.maxUrine }] : [];
    const linesPoids = settings.enablePoids ? [{ value: settings.maxPoids, color: 'rgba(249, 115, 22, 0.7)' }] : [];
    const linesDouleur = settings.enableDouleur ? [{ value: settings.maxDouleur, color: 'rgba(249, 115, 22, 0.7)' }] : [];
    
    const linesTension = [];
    if (settings.enableSys) {
        linesTension.push({ value: settings.minSys, color: 'rgba(236, 72, 153, 0.6)' });
        linesTension.push({ value: settings.maxSys, color: 'rgba(236, 72, 153, 0.6)' });
    }
    if (settings.enableDia) {
        linesTension.push({ value: settings.minDia, color: 'rgba(129, 140, 248, 0.6)' });
        linesTension.push({ value: settings.maxDia, color: 'rgba(129, 140, 248, 0.6)' });
    }

    createTimeLineChart('chartSpo2', spo2Points, '#38BDF8', 80, 100, 5, bounds, linesSpo2);
    createTimeLineChart('chartPulse', pulsePoints, '#A855F7', 40, 140, 20, bounds, linesPulse);
    createTimeLineChart('chartPoids', poidsPoints, '#818CF8', 100, 150, 10, bounds, linesPoids);
    createTimeLineChart('chartResp', respPoints, '#A78BFA', 0, 40, 10, bounds, linesResp);

    if (chartInstances['chartTension']) chartInstances['chartTension'].destroy();
    
    const tensionTimeConfig = {
        unit: getTimeUnit(currentPeriod),
        displayFormats: { hour: 'HH:mm', day: 'dd MMM', week: 'dd MMM' }
    };
    if (currentPeriod === 'today') tensionTimeConfig.stepSize = 2;

    chartInstances['chartTension'] = new Chart(document.getElementById('chartTension').getContext('2d'), {
        type: 'line',
        data: {
            datasets: [
                { data: sysPoints, borderColor: '#EC4899', backgroundColor: '#EC4899', pointBackgroundColor: '#EC4899', borderWidth: 2, tension: 0.3, pointRadius: 3 },
                { data: diaPoints, borderColor: '#818CF8', backgroundColor: '#818CF8', pointBackgroundColor: '#818CF8', borderWidth: 2, tension: 0.3, pointRadius: 3 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, thresholdLines: { lines: linesTension } },
            scales: {
                x: { type: 'time', min: bounds.min, max: bounds.max, time: tensionTimeConfig, grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 0 } },
                y: { min: 40, max: 180, ticks: { stepSize: 20, font: { size: 9 } } }
            }
        }
    });

    createTimeBarChart('chartUrine', urinePoints, '#60A5FA', 0, 6000, 1000, bounds, false, linesUrine);
    createTimeBarChart('chartDouleur', douleurPoints, null, 0, 10, 2, bounds, true, linesDouleur);
}

function findHeaderValue(row, possibleNames) {
    const keys = Object.keys(row);
    for (const name of possibleNames) {
        const target = name.toLowerCase();
        for (const key of keys) {
            const cleanKey = key.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const cleanTarget = target.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (cleanKey === cleanTarget) return row[key];
        }
    }
    return null;
}

Papa.parse(CSV_URL, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function(results) {
        const loader = document.getElementById('loading');
        if (loader) loader.style.display = 'none';

        rawMedicalData = results.data.map(r => {
            const dateRaw = findHeaderValue(r, ['DATE', 'Date']);
            const ts = parseFrenchDate(dateRaw);
            
            let sysVal = null, diaVal = null;
            const tension = findHeaderValue(r, ['Tension', 'TENSION']);
            if (tension && tension.includes('/')) {
                const p = tension.split('/');
                sysVal = parseFloat(p[0]) || null;
                diaVal = parseFloat(p[1]) || null;
            }

            const oxygeneRaw = findHeaderValue(r, ['Oxygène', 'Oxygene', 'OXYGENE', 'Spo2', 'SPO2', 'Oxygen']);
            const bpmRaw = findHeaderValue(r, ['Bpm', 'BPM', 'Pouls', 'Pulse']);
            const poidsRaw = findHeaderValue(r, ['Poids', 'POIDS', 'Weight']);
            const urineRaw = findHeaderValue(r, ['Urine', 'URINE', 'Diurese', 'Diurèse']);
            const douleurRaw = findHeaderValue(r, ['Douleur', 'DOULEUR', 'Pain']);
            const respRaw = findHeaderValue(r, ['Fréquence Respiratoire', 'Fréquence respiratoire', 'Respiration', 'Resp', 'RESP']);

            const medicamentsRaw = findHeaderValue(r, ['Médicaments', 'Medicaments', 'Médicament', 'Medicament']);
            const alimentationRaw = findHeaderValue(r, ['Alimentation', 'Repas']);
            const hydratationRaw = findHeaderValue(r, ['Hydratation', 'Boisson']);
            const sellesRaw = findHeaderValue(r, ['Selles', 'Selle']);
            const obsRaw = findHeaderValue(r, ['Observations', 'Observation', 'Notes', 'Remarques']);

            return {
                timestamp: ts,
                Oxygène: parseFloat(oxygeneRaw) || null,
                Bpm: parseFloat(bpmRaw) || null,
                Poids: parseFloat(poidsRaw) || null,
                Urine: parseFloat(urineRaw) || null,
                Douleur: parseFloat(douleurRaw) || null,
                Resp: parseFloat(respRaw) || null,
                Sys: sysVal,
                Dia: diaVal,
                Medicaments: medicamentsRaw || '',
                Alimentation: alimentationRaw || '',
                Hydratation: hydratationRaw || '',
                Selles: sellesRaw || '',
                Observations: obsRaw || ''
            };
        }).filter(r => r.timestamp !== null)
          .sort((a, b) => a.timestamp - b.timestamp);

        renderDashboard();
    },
    error: function(err) {
        console.error("Erreur PapaParse:", err);
        const loader = document.getElementById('loading');
        if (loader) loader.style.display = 'none';
    }
});
