const DEFAULT_SETTINGS = {
    enableResp: true, minResp: 10, maxResp: 40,
    enablePulse: true, minPulse: 50, maxPulse: 120,
    enableSys: true, minSys: 90, maxSys: 140,
    enableDia: true, minDia: 60, maxDia: 90,
    enableUrine: true, minUrine: 1000, maxUrine: 2500,
    enablePoids: true, maxPoids: 125,
    enableSpo2: true, minSpo2: 90, maxSpo2: 100,
    enableDouleur: true, maxDouleur: 4
};

let settings = { ...DEFAULT_SETTINGS };

function loadSettings() {
    const saved = localStorage.getItem('homecare_settings');
    if (saved) {
        try { settings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) }; } 
        catch (e) { settings = { ...DEFAULT_SETTINGS }; }
    }
    applySettingsToForm();
}

function applySettingsToForm() {
    Object.keys(settings).forEach(key => {
        const elem = document.getElementById(key);
        if (elem) {
            if (elem.type === 'checkbox') elem.checked = settings[key];
            else elem.value = settings[key];
        }
    });
}

function readSettingsFromForm() {
    Object.keys(settings).forEach(key => {
        const elem = document.getElementById(key);
        if (elem) {
            if (elem.type === 'checkbox') settings[key] = elem.checked;
            else settings[key] = parseFloat(elem.value);
        }
    });
}

function saveSettings() {
    readSettingsFromForm();
    localStorage.setItem('homecare_settings', JSON.stringify(settings));
    alert('Paramètres enregistrés !');
    if (typeof renderDashboard === 'function') renderDashboard();
}

function resetDefaultSettings() {
    settings = { ...DEFAULT_SETTINGS };
    localStorage.removeItem('homecare_settings');
    applySettingsToForm();
    alert('Réinitialisé aux valeurs par défaut.');
    if (typeof renderDashboard === 'function') renderDashboard();
}
