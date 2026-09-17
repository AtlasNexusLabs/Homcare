/**
 * stock.js - Gestion de la vue Stock de HomeCare
 */

// Configuration des limites quotidiennes par défaut
const PRODUCT_LIMITS = {
    'Couches': 3,
    'Coto-couches': 3,
    'Carrés': 1,
    'Draps': 1,
    'Chemises': 1
};

// Seuels de stock minimum personnalisés par produit
const PRODUCT_THRESHOLDS = {
    'Couches': 5,
    'Coto-couches': 5,
    'Carrés': 3,
    'Draps': 2,
    'Chemises': 2,
    'Alcool': 2
};

// Catégories des produits
const PRODUCT_CATEGORIES = {
    'Couches': 'Essentiel',
    'Coto-couches': 'Essentiel',
    'Carrés': 'Essentiel',
    'Draps': 'Essentiel',
    'Chemises': 'Essentiel',
    'Alcool': 'Soin / Hygiène'
};

// État local de la page Stock
let stockState = {
    movements: [],      // Données issues de la feuille "Stock"
    inventory: [],      // Données issues de la feuille "Inventaire"
    selectedPeriod: '7jours', // 'aujourdhui', '7jours', '30jours', 'custom'
    selectedProductFilter: 'all',
    selectedCategoryFilter: 'Essentiel', // "Essentiel" par défaut selon les consignes
    selectedProductDetail: null
};

/**
 * Initialisation de la page Stock
 */
async function initStockPage() {
    await fetchStockData();
    setupEventListeners();
    renderStockView();
}

/**
 * Récupération des données backend (Google Sheets)
 */
async function fetchStockData() {
    try {
        // Appels vers votre backend existant (ex: webhooks n8n / Apps Script / API)
        const [movementsRes, inventoryRes] = await Promise.all([
            fetch('/api/stock-movements').then(res => res.json()),
            fetch('/api/inventory').then(res => res.json())
        ]);

        stockState.movements = movementsRes || [];
        stockState.inventory = inventoryRes || [];
    } catch (error) {
        console.error("Erreur lors de la récupération des données Stock :", error);
    }
}

/**
 * Rendu global de la page
 */
function renderStockView() {
    renderAlertsSection();
    renderConsumptionSection();
    renderRecentMovementsTable();
    if (stockState.selectedProductDetail) {
        renderProductDetailPanel(stockState.selectedProductDetail);
    }
}

/**
 * 1. Produits à surveiller
 */
function renderAlertsSection() {
    const alertsContainer = document.getElementById('alertsCardsContainer');
    if (!alertsContainer) return;

    alertsContainer.innerHTML = '';
    
    // Calcul du stock restant et filtrage des produits sous ou proches du seuil
    const alertProducts = stockState.inventory.filter(item => {
        const threshold = PRODUCT_THRESHOLDS[item.Produit] || 3;
        return item['Stock Restant'] <= threshold;
    });

    // Mise à jour du compteur
    const alertCountElem = document.getElementById('alertProductsCount');
    if (alertCountElem) alertCountElem.textContent = alertProducts.length;

    alertProducts.forEach(prod => {
        const remaining = prod['Stock Restant'];
        const threshold = PRODUCT_THRESHOLDS[prod.Produit] || 3;
        const limit = PRODUCT_LIMITS[prod.Produit];

        let badgeLabel = 'À surveiller';
        let badgeClass = 'badge-warning';

        if (remaining <= 1) {
            badgeLabel = 'À commander';
            badgeClass = 'badge-danger';
        } else if (remaining === threshold) {
            badgeLabel = 'À prévoir';
            badgeClass = 'badge-info';
        }

        const cardHTML = `
            <div class="card alert-card" onclick="openProductDetail('${prod.Produit}')">
                <div class="card-header">
                    <span class="product-name">${prod.Produit}</span>
                    <i class="fa-solid fa-chevron-right icon-next"></i>
                </div>
                <div class="card-body">
                    <div class="stock-value">${remaining} <span class="unit">restant${remaining > 1 ? 's' : ''}</span></div>
                    <div class="limit-subtext">${limit ? `Limite : ${limit}/jour` : 'Sans limite'}</div>
                </div>
                <div class="card-footer">
                    <span class="badge ${badgeClass}">${badgeLabel}</span>
                </div>
            </div>
        `;
        alertsContainer.insertAdjacentHTML('beforeend', cardHTML);
    });
}

/**
 * 2. Section Consommation (Sélection, Calculs et Cartes compactes)
 */
function renderConsumptionSection() {
    const gridContainer = document.getElementById('consumptionGrid');
    if (!gridContainer) return;

    gridContainer.innerHTML = '';

    // Filtrage des produits par sélecteur Produit & Catégorie
    let filteredProducts = stockState.inventory.filter(item => {
        const matchProduct = stockState.selectedProductFilter === 'all' || item.Produit === stockState.selectedProductFilter;
        const productCat = PRODUCT_CATEGORIES[item.Produit] || 'Général';
        const matchCategory = stockState.selectedCategoryFilter === 'all' || productCat === stockState.selectedCategoryFilter;
        return matchProduct && matchCategory;
    });

    const todayStr = new Date().toISOString().split('T')[0];
    const periodDays = getPeriodDaysCount(stockState.selectedPeriod);

    filteredProducts.forEach(prod => {
        const productName = prod.Produit;
        const dailyLimit = PRODUCT_LIMITS[productName];

        // Calcul consommation d'aujourd'hui (UNIQUEMENT les mouvements "Sortie")
        const consumedToday = stockState.movements
            .filter(m => m.PRODUIT === productName && m.MOUVEMENT === 'Sortie' && isSameDay(m.DATE, todayStr))
            .reduce((sum, m) => sum + Math.abs(Number(m.QUANTITÉ) || 0), 0);

        // Calcul consommation sur la période sélectionnée (Sorties uniquement)
        const consumedPeriod = stockState.movements
            .filter(m => m.PRODUIT === productName && m.MOUVEMENT === 'Sortie' && isWithinPeriod(m.DATE, stockState.selectedPeriod))
            .reduce((sum, m) => sum + Math.abs(Number(m.QUANTITÉ) || 0), 0);

        // Période max théorique
        const periodLimit = dailyLimit ? dailyLimit * periodDays : null;

        // Pourcentage pour la barre de progression (basé sur le jour)
        const progressPercent = dailyLimit ? Math.min((consumedToday / dailyLimit) * 100, 100) : 0;
        let progressClass = 'progress-normal';
        if (dailyLimit && consumedToday >= dailyLimit) progressClass = 'progress-max';

        const cardHTML = `
            <div class="card consumption-card" onclick="openProductDetail('${productName}')">
                <div class="card-header">
                    <div class="product-title-group">
                        <span class="product-icon"><i class="fa-solid fa-box"></i></span>
                        <span class="product-name">${productName}</span>
                    </div>
                </div>
                <div class="card-metrics">
                    <div class="metric-block">
                        <div class="metric-val">${consumedToday}${dailyLimit ? ` / ${dailyLimit}` : ''}</div>
                        <div class="metric-label">aujourd'hui</div>
                    </div>
                    <div class="metric-block align-right">
                        <div class="metric-val">${consumedPeriod}${periodLimit ? ` / ${periodLimit}` : ''}</div>
                        <div class="metric-label">${getPeriodLabel(stockState.selectedPeriod)}</div>
                    </div>
                </div>
                ${dailyLimit ? `
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill ${progressClass}" style="width: ${progressPercent}%;"></div>
                </div>` : ''}
            </div>
        `;
        gridContainer.insertAdjacentHTML('beforeend', cardHTML);
    });
}

/**
 * 3. Tableau des mouvements récents
 */
function renderRecentMovementsTable() {
    const tableBody = document.getElementById('recentMovementsTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    
    // Tri par date décroissante (derniers mouvements en premier)
    const sortedMovements = [...stockState.movements].sort((a, b) => new Date(b.DATE) - new Date(a.DATE)).slice(0, 5);

    sortedMovements.forEach(mvt => {
        const isEntry = mvt.MOUVEMENT === 'Entrée';
        const qtyDisplay = isEntry ? `+${mvt.QUANTITÉ}` : `-${Math.abs(mvt.QUANTITÉ)}`;
        const qtyClass = isEntry ? 'text-green' : 'text-red';

        const rowHTML = `
            <tr>
                <td>${formatShortDate(mvt.DATE)}</td>
                <td><span class="product-tag">${mvt.PRODUIT}</span></td>
                <td><span class="type-badge ${isEntry ? 'badge-entry' : 'badge-exit'}">${mvt.MOUVEMENT}</span></td>
                <td class="${qtyClass} font-bold">${qtyDisplay}</td>
                <td>${mvt.INTERVENANT || '—'}</td>
                <td class="text-muted">${mvt['NOTE / REMARQUE'] || '—'}</td>
            </tr>
        `;
        tableBody.insertAdjacentHTML('beforeend', rowHTML);
    });
}

/**
 * 4. Panneau / Fenêtre de détail produit
 */
function openProductDetail(productName) {
    stockState.selectedProductDetail = productName;
    const panel = document.getElementById('productDetailPanel');
    if (panel) panel.classList.remove('hidden');

    const invItem = stockState.inventory.find(i => i.Produit === productName) || {};
    const dailyLimit = PRODUCT_LIMITS[productName];
    const category = PRODUCT_CATEGORIES[productName] || 'Général';
    const threshold = PRODUCT_THRESHOLDS[productName] || 3;
    const currentStock = invItem['Stock Restant'] || 0;

    // Calculs de consommation pour le volet de détail
    const todayStr = new Date().toISOString().split('T')[0];
    const consumedToday = stockState.movements
        .filter(m => m.PRODUIT === productName && m.MOUVEMENT === 'Sortie' && isSameDay(m.DATE, todayStr))
        .reduce((sum, m) => sum + Math.abs(Number(m.QUANTITÉ) || 0), 0);

    const consumedWeek = stockState.movements
        .filter(m => m.PRODUIT === productName && m.MOUVEMENT === 'Sortie' && isWithinPeriod(m.DATE, '7jours'))
        .reduce((sum, m) => sum + Math.abs(Number(m.QUANTITÉ) || 0), 0);

    // Mouvements filtrés pour ce produit spécifique
    const productMovements = stockState.movements
        .filter(m => m.PRODUIT === productName)
        .sort((a, b) => new Date(b.DATE) - new Date(a.DATE));

    // Injection dans le DOM
    document.getElementById('detailProductName').textContent = productName;
    document.getElementById('detailCategoryBadge').textContent = category;
    document.getElementById('detailCurrentStock').textContent = currentStock;
    document.getElementById('detailStockThreshold').textContent = `${threshold} (${currentStock <= threshold ? 'À surveiller' : 'OK'})`;
    
    document.getElementById('detailDailyLimit').textContent = dailyLimit ? `${consumedToday} / ${dailyLimit}` : `${consumedToday}`;
    document.getElementById('detailWeeklyLimit').textContent = dailyLimit ? `${consumedWeek} / ${dailyLimit * 7}` : `${consumedWeek}`;

    // Rendu de l'historique du produit
    const detailHistoryBody = document.getElementById('detailHistoryTableBody');
    if (detailHistoryBody) {
        detailHistoryBody.innerHTML = '';
        productMovements.forEach(mvt => {
            const isEntry = mvt.MOUVEMENT === 'Entrée';
            const qtyDisplay = isEntry ? `+${mvt.QUANTITÉ}` : `-${Math.abs(mvt.QUANTITÉ)}`;
            
            const row = `
                <tr>
                    <td>${formatShortDate(mvt.DATE)}</td>
                    <td><span class="${isEntry ? 'text-green' : 'text-red'}">${mvt.MOUVEMENT}</span></td>
                    <td class="font-bold">${qtyDisplay}</td>
                    <td>${mvt.INTERVENANT || '—'}</td>
                    <td class="text-muted">${mvt['NOTE / REMARQUE'] || '—'}</td>
                </tr>
            `;
            detailHistoryBody.insertAdjacentHTML('beforeend', row);
        });
    }
}

function closeProductDetail() {
    stockState.selectedProductDetail = null;
    const panel = document.getElementById('productDetailPanel');
    if (panel) panel.classList.add('hidden');
}

/**
 * Événements et Filtres
 */
function setupEventListeners() {
    // Boutons de période (Aujourd'hui, 7 jours, 30 jours, Personnalisé)
    const periodButtons = document.querySelectorAll('.period-btn');
    periodButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            periodButtons.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            stockState.selectedPeriod = e.target.dataset.period;
            renderConsumptionSection();
        });
    });

    // Filtre Produit
    const productSelect = document.getElementById('productFilterSelect');
    if (productSelect) {
        productSelect.addEventListener('change', (e) => {
            stockState.selectedProductFilter = e.target.value;
            renderConsumptionSection();
        });
    }

    // Filtre Catégorie
    const categorySelect = document.getElementById('categoryFilterSelect');
    if (categorySelect) {
        categorySelect.value = 'Essentiel'; // Valeur par défaut
        categorySelect.addEventListener('change', (e) => {
            stockState.selectedCategoryFilter = e.target.value;
            renderConsumptionSection();
        });
    }

    // Bouton fermer le détail
    const closeBtn = document.getElementById('closeDetailBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeProductDetail);
}

/**
 * Utilitaires de Dates et Périodes
 */
function isSameDay(dateStr1, dateStr2) {
    if (!dateStr1 || !dateStr2) return false;
    return new Date(dateStr1).toISOString().split('T')[0] === new Date(dateStr2).toISOString().split('T')[0];
}

function isWithinPeriod(dateStr, period) {
    if (!dateStr) return false;
    const mvtDate = new Date(dateStr);
    const now = new Date();
    
    if (period === 'aujourdhui') {
        return isSameDay(dateStr, now.toISOString().split('T')[0]);
    } else if (period === '7jours') {
        const diffDays = (now - mvtDate) / (1000 * 60 * 60 * 24);
        return diffDays >= 0 && diffDays <= 7;
    } else if (period === '30jours') {
        const diffDays = (now - mvtDate) / (1000 * 60 * 60 * 24);
        return diffDays >= 0 && diffDays <= 30;
    }
    return true;
}

function getPeriodDaysCount(period) {
    if (period === 'aujourdhui') return 1;
    if (period === '7jours') return 7;
    if (period === '30jours') return 30;
    return 7;
}

function getPeriodLabel(period) {
    if (period === 'aujourdhui') return "aujourd'hui";
    if (period === '7jours') return 'par semaine';
    if (period === '30jours') return 'par mois';
    return 'sur la période';
}

function formatShortDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Lancement au chargement du DOM
document.addEventListener('DOMContentLoaded', initStockPage);