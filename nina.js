const ninaState = {
  config: window.APP_CONFIG || {},
  data: null,
  platform: "WB",
  page: "matrix",
  targetDays: loadStorage("tekstilno-nina-target-days-v16", { WB: 21, Ozon: 21 }),
  turnoverMode: loadStorage("tekstilno-nina-turnover-mode-v16", { WB: 14, Ozon: 14 }),
  filters: { search: "", showMode: "all", limit: 9999, sort: "need" },
  manualInputs: loadStorage("tekstilno-nina-manual-inputs-v16", {}),
  orderRequests: loadStorage("tekstilno-nina-order-requests-v16", []),
  selectedArticle: null
};

const ninaEls = {};
let toastTimer = null;

document.addEventListener("DOMContentLoaded", initNina);

async function initNina() {
  cacheElements();
  bindEvents();
  await loadData();
  syncUiState();
  renderAll();
}

function cacheElements() {
  [
    "exportExcelBtn", "exportNeedBtn", "exportAllBtn", "importAllInput", "reportMonthBadge", "targetDaysInput",
    "sumArticles", "sumClusters", "sumPlanMonth", "sumDaily", "sumDailyCaption", "sumStock", "sumMainStock", "sumNeed", "sumNeedCaption",
    "searchInput", "showModeSelect", "rowLimitSelect", "sortSelect", "matrixMeta", "matrixHead", "matrixBody", "matrixWrap",
    "selectedSubtitle", "selectedArticleCard", "topDeficitsList", "topDeficitsCaption", "clusterGuide", "formulaClusters",
    "orderForm", "orderArticleSelect", "orderClusterSelect", "orderRecommendedInput", "orderQtyInput", "orderSourceSelect",
    "orderPrioritySelect", "orderEtaInput", "orderCommentInput", "resetOrderBtn", "orderRecommendationMeta", "orderRecommendationBody", "ordersBody", "toast"
  ].forEach((id) => { ninaEls[id] = document.getElementById(id); });

  ninaEls.platformButtons = Array.from(document.querySelectorAll("[data-platform]"));
  ninaEls.pageButtons = Array.from(document.querySelectorAll("[data-page]"));
  ninaEls.turnoverButtons = Array.from(document.querySelectorAll("[data-turnover-mode]"));
  ninaEls.pagePanels = {
    matrix: document.getElementById("page-matrix"),
    orders: document.getElementById("page-orders"),
    formula: document.getElementById("page-formula")
  };
}

function bindEvents() {
  ninaEls.platformButtons.forEach((btn) => btn.addEventListener("click", () => switchPlatform(btn.dataset.platform)));
  ninaEls.pageButtons.forEach((btn) => btn.addEventListener("click", () => switchPage(btn.dataset.page)));
  ninaEls.turnoverButtons.forEach((btn) => btn.addEventListener("click", () => switchTurnover(Number(btn.dataset.turnoverMode))));

  ninaEls.targetDaysInput.addEventListener("change", handleTargetDaysChange);
  ninaEls.searchInput.addEventListener("input", () => { ninaState.filters.search = ninaEls.searchInput.value.trim().toLowerCase(); renderMatrix(); });
  ninaEls.showModeSelect.addEventListener("change", () => { ninaState.filters.showMode = ninaEls.showModeSelect.value; renderMatrix(); });
  ninaEls.rowLimitSelect.addEventListener("change", () => { ninaState.filters.limit = Number(ninaEls.rowLimitSelect.value || 9999); renderMatrix(); });
  ninaEls.sortSelect.addEventListener("change", () => { ninaState.filters.sort = ninaEls.sortSelect.value; renderMatrix(); });

  ninaEls.matrixBody.addEventListener("click", handleMatrixClick);
  ninaEls.matrixBody.addEventListener("change", handleMatrixChange);
  ninaEls.topDeficitsList.addEventListener("click", handleTopDeficitClick);

  ninaEls.orderForm.addEventListener("submit", saveOrderRequest);
  ninaEls.orderArticleSelect.addEventListener("change", () => populateOrderClusters());
  ninaEls.orderClusterSelect.addEventListener("change", fillOrderRecommendation);
  ninaEls.orderRecommendationBody.addEventListener("click", handleOrderRecommendationClick);
  ninaEls.resetOrderBtn.addEventListener("click", (event) => {
    event.preventDefault();
    resetOrderForm();
  });

  ninaEls.exportExcelBtn.addEventListener("click", exportExcelWorkbook);
  ninaEls.exportNeedBtn.addEventListener("click", exportNeedWorkbook);
  ninaEls.exportAllBtn.addEventListener("click", exportAllJson);
  ninaEls.importAllInput.addEventListener("change", importAllJson);
}

async function loadData() {
  try {
    const response = await fetch(versionedUrl("data/nina-cluster-dashboard.json"));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    ninaState.data = await response.json();
    ninaEls.reportMonthBadge.value = ninaState.data.reportMonth || "—";
  } catch (error) {
    console.error(error);
    showToast(`Не удалось загрузить data/nina-cluster-dashboard.json: ${error.message}`);
  }
}

function syncUiState() {
  ninaEls.targetDaysInput.value = getCurrentTargetDays();
}

function switchPlatform(platform) {
  ninaState.platform = platform;
  const rows = getPlatformData().rows;
  if (!rows.find((row) => row.sellerArticle === ninaState.selectedArticle)) {
    ninaState.selectedArticle = rows[0]?.sellerArticle || null;
  }
  syncUiState();
  renderAll();
}

function switchPage(page) {
  ninaState.page = page;
  updateToggleUi();
}

function switchTurnover(mode) {
  ninaState.turnoverMode[ninaState.platform] = mode;
  persistTurnoverMode();
  renderSummary();
  renderSelectedCard();
  renderTopDeficits();
  renderMatrix();
  renderOrderRecommendations();
}

function handleTargetDaysChange() {
  const value = clampNumber(Number(ninaEls.targetDaysInput.value || 21), 7, 90, 21);
  ninaState.targetDays[ninaState.platform] = value;
  persistTargetDays();
  ninaEls.targetDaysInput.value = value;
  renderSummary();
  renderSelectedCard();
  renderTopDeficits();
  renderMatrix();
  fillOrderRecommendation();
  renderOrderRecommendations();
}

function persistTargetDays() {
  localStorage.setItem("tekstilno-nina-target-days-v16", JSON.stringify(ninaState.targetDays));
}

function persistTurnoverMode() {
  localStorage.setItem("tekstilno-nina-turnover-mode-v16", JSON.stringify(ninaState.turnoverMode));
}

function persistManualInputs() {
  localStorage.setItem("tekstilno-nina-manual-inputs-v16", JSON.stringify(ninaState.manualInputs));
}

function persistOrderRequests() {
  localStorage.setItem("tekstilno-nina-order-requests-v16", JSON.stringify(ninaState.orderRequests));
}

function updateToggleUi() {
  ninaEls.platformButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.platform === ninaState.platform));
  ninaEls.pageButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.page === ninaState.page));
  ninaEls.turnoverButtons.forEach((btn) => btn.classList.toggle("active", Number(btn.dataset.turnoverMode) === getCurrentTurnoverMode()));
  Object.entries(ninaEls.pagePanels).forEach(([key, panel]) => panel.classList.toggle("active", key === ninaState.page));
}

function getCurrentTargetDays() {
  return ninaState.targetDays[ninaState.platform] || 21;
}

function getCurrentTurnoverMode() {
  return Number(ninaState.turnoverMode[ninaState.platform] || 14);
}

function getPlatformData(platform = ninaState.platform) {
  return ninaState.data?.platforms?.[platform] || { clusters: [], rows: [], summary: {}, topDeficits: [] };
}

function getRowMap(platform = ninaState.platform) {
  const map = new Map();
  getPlatformData(platform).rows.forEach((row) => map.set(row.sellerArticle, row));
  return map;
}

function getManualKey(platform, article, cluster) {
  return `${platform}__${article}__${cluster}`;
}

function getManualEntry(platform, article, cluster) {
  return ninaState.manualInputs[getManualKey(platform, article, cluster)] || null;
}

function setManualEntry(platform, article, cluster, payload) {
  const key = getManualKey(platform, article, cluster);
  if (!payload || isManualPayloadEmpty(payload)) {
    delete ninaState.manualInputs[key];
  } else {
    ninaState.manualInputs[key] = payload;
  }
  persistManualInputs();
}

function isManualPayloadEmpty(payload) {
  if (!payload) return true;
  const relevant = ["inTransit", "production", "procurement", "eta", "comment", "targetDays", "seasonalityOverride"];
  return relevant.every((field) => {
    const value = payload[field];
    return value === "" || value == null || value === 0;
  });
}

function getDemandForMode(metric, mode) {
  if (mode === 7) return Number(metric.dailyDemand7 || 0);
  if (mode === 28) return Number(metric.dailyDemand28 || 0);
  return Number(metric.dailyDemand14 || 0);
}

function computeRow(row, platform = ninaState.platform) {
  const targetDefault = getTargetDaysForPlatform(platform, row.targetDaysDefault || 21);
  const mode = getTurnoverModeForPlatform(platform);
  const seasonBase = Number(row.seasonalityCoef || 1) || 1;
  const workingDays = Number(row.workingDays || 22) || 22;

  const clusterMetricsCalc = (row.clusterMetrics || []).map((metric) => {
    const entry = getManualEntry(platform, row.sellerArticle, metric.cluster) || {};
    const targetDays = clampNumber(Number(entry.targetDays || targetDefault), 7, 90, targetDefault);
    const seasonOverride = entry.seasonalityOverride === "" || entry.seasonalityOverride == null ? null : Number(entry.seasonalityOverride);
    const seasonFactor = seasonOverride && seasonOverride > 0 ? seasonOverride : seasonBase;

    const actualDaily7 = roundNum(Number(metric.orders7d || 0) / 7, 2);
    const seasonalPlanDay = Number(metric.seasonalPlanDay || 0) || 0;
    const dailyDemand7 = actualDaily7;
    const dailyDemand14 = roundNum(Math.max(actualDaily7, seasonalPlanDay), 2);
    const dailyDemand28 = roundNum(Math.max(actualDaily7, seasonalPlanDay * Math.max(1, seasonFactor)), 2);

    const inTransit = Number(entry.inTransit || 0) || 0;
    const production = Number(entry.production || 0) || 0;
    const procurement = Number(entry.procurement || 0) || 0;
    const stock = Number(metric.stock || 0) || 0;
    const available = stock + inTransit + production + procurement;

    const coverage7DaysCalc = dailyDemand7 > 0 ? roundNum(available / dailyDemand7, 1) : null;
    const coverage14DaysCalc = dailyDemand14 > 0 ? roundNum(available / dailyDemand14, 1) : null;
    const coverage28DaysCalc = dailyDemand28 > 0 ? roundNum(available / dailyDemand28, 1) : null;

    const activeDailyDemand = getDemandForMode({ dailyDemand7, dailyDemand14, dailyDemand28 }, mode);
    const activeCoverage = activeDailyDemand > 0 ? roundNum(available / activeDailyDemand, 1) : null;
    const recommendedQtyCalc = Math.max(0, Math.ceil(activeDailyDemand * targetDays - available));

    const orders14dCalc = Math.round(actualDaily7 * 14);

    return {
      ...metric,
      monthlyPlanUnits: Math.round(seasonalPlanDay * workingDays),
      actualDaily7,
      orders14dCalc,
      dailyDemand7,
      dailyDemand14,
      dailyDemand28,
      activeDailyDemand: roundNum(activeDailyDemand, 2),
      stock,
      inTransit,
      production,
      procurement,
      available: roundNum(available, 2),
      coverage7DaysCalc,
      coverage14DaysCalc,
      coverage28DaysCalc,
      activeCoverage,
      recommendedQtyCalc,
      targetDays,
      seasonalityOverride: seasonOverride,
      eta: entry.eta || "",
      comment: entry.comment || "",
      updatedAt: entry.updatedAt || ""
    };
  });

  const totalOrders7d = clusterMetricsCalc.reduce((sum, item) => sum + Number(item.orders7d || 0), 0);
  const totalOrders14d = clusterMetricsCalc.reduce((sum, item) => sum + Number(item.orders14dCalc || 0), 0);
  const totalDemand7Calc = clusterMetricsCalc.reduce((sum, item) => sum + Number(item.dailyDemand7 || 0), 0);
  const totalDemand14Calc = clusterMetricsCalc.reduce((sum, item) => sum + Number(item.dailyDemand14 || 0), 0);
  const totalDemand28Calc = clusterMetricsCalc.reduce((sum, item) => sum + Number(item.dailyDemand28 || 0), 0);
  const totalStockCalc = clusterMetricsCalc.reduce((sum, item) => sum + Number(item.stock || 0), 0);
  const totalTransitCalc = clusterMetricsCalc.reduce((sum, item) => sum + Number(item.inTransit || 0), 0);
  const totalProductionCalc = clusterMetricsCalc.reduce((sum, item) => sum + Number(item.production || 0), 0);
  const totalProcurementCalc = clusterMetricsCalc.reduce((sum, item) => sum + Number(item.procurement || 0), 0);
  const totalAvailableCalc = totalStockCalc + totalTransitCalc + totalProductionCalc + totalProcurementCalc;

  const totalActiveDemand = mode === 7 ? totalDemand7Calc : mode === 28 ? totalDemand28Calc : totalDemand14Calc;
  const totalCoverage7Calc = totalDemand7Calc > 0 ? roundNum(totalAvailableCalc / totalDemand7Calc, 1) : null;
  const totalCoverage14Calc = totalDemand14Calc > 0 ? roundNum(totalAvailableCalc / totalDemand14Calc, 1) : null;
  const totalCoverage28Calc = totalDemand28Calc > 0 ? roundNum(totalAvailableCalc / totalDemand28Calc, 1) : null;
  const totalCoverageModeCalc = totalActiveDemand > 0 ? roundNum(totalAvailableCalc / totalActiveDemand, 1) : null;
  const totalNeedModeCalc = clusterMetricsCalc.reduce((sum, item) => sum + Number(item.recommendedQtyCalc || 0), 0);
  const monthPlanUnitsTotal = Math.round((Number(row.currentPlanDay || 0) || 0) * workingDays);

  return {
    ...row,
    workingDays,
    monthPlanUnitsTotal,
    clusterMetricsCalc,
    totalOrders7dCalc: Math.round(totalOrders7d),
    totalOrders14dCalc: Math.round(totalOrders14d),
    totalDemand7Calc: roundNum(totalDemand7Calc, 2),
    totalDemand14Calc: roundNum(totalDemand14Calc, 2),
    totalDemand28Calc: roundNum(totalDemand28Calc, 2),
    totalActiveDemand: roundNum(totalActiveDemand, 2),
    totalStockCalc: roundNum(totalStockCalc, 2),
    totalTransitCalc: roundNum(totalTransitCalc, 2),
    totalProductionCalc: roundNum(totalProductionCalc, 2),
    totalProcurementCalc: roundNum(totalProcurementCalc, 2),
    totalAvailableCalc: roundNum(totalAvailableCalc, 2),
    totalCoverage7Calc,
    totalCoverage14Calc,
    totalCoverage28Calc,
    totalCoverageModeCalc,
    totalNeedModeCalc
  };
}

function getTargetDaysForPlatform(platform, fallback = 21) {
  return Number(ninaState.targetDays[platform] || fallback || 21);
}

function getTurnoverModeForPlatform(platform) {
  return Number(ninaState.turnoverMode[platform] || 14);
}

function getAllComputedRows(platform = ninaState.platform) {
  return getPlatformData(platform).rows.map((row) => computeRow(row, platform));
}

function getClusterWarehouseMap(platform = ninaState.platform) {
  const map = new Map();
  getPlatformData(platform).rows.forEach((row) => {
    (row.clusterMetrics || []).forEach((metric) => {
      const cluster = String(metric.cluster || "").trim();
      if (!cluster) return;
      if (!map.has(cluster)) map.set(cluster, new Set());
      const warehouse = formatWarehouseLabel(metric.shippingWarehouse || metric.shippingCluster || "");
      if (warehouse) map.get(cluster).add(warehouse);
    });
  });
  return map;
}

function renderAll() {
  if (!ninaState.data) return;
  const rows = getPlatformData().rows;
  if (!ninaState.selectedArticle && rows.length) {
    ninaState.selectedArticle = rows[0].sellerArticle;
  }
  updateToggleUi();
  renderSummary();
  renderClusterGuides();
  populateOrderSelectors();
  renderSelectedCard();
  renderTopDeficits();
  renderMatrix();
  renderOrderRecommendations();
  renderOrdersTable();
}

function renderSummary() {
  const rows = getAllComputedRows();
  ninaEls.sumArticles.textContent = numberFormat(rows.length);
  ninaEls.sumClusters.textContent = numberFormat(getPlatformData().clusters.length);
  ninaEls.sumPlanMonth.textContent = numberFormat(rows.reduce((sum, row) => sum + Number(row.monthPlanUnitsTotal || 0), 0));
  ninaEls.sumDaily.textContent = numberFormat(rows.reduce((sum, row) => sum + Number(row.totalActiveDemand || 0), 0), 1);
  ninaEls.sumDailyCaption.textContent = `Спрос / день (${getCurrentTurnoverMode()} дн)`;
  ninaEls.sumStock.textContent = numberFormat(rows.reduce((sum, row) => sum + Number(row.totalStockCalc || 0), 0));
  ninaEls.sumMainStock.textContent = numberFormat(rows.reduce((sum, row) => sum + Number(row.mainWarehouseStock || 0), 0));
  ninaEls.sumNeed.textContent = numberFormat(rows.reduce((sum, row) => sum + Number(row.totalNeedModeCalc || 0), 0));
  ninaEls.sumNeedCaption.textContent = `Реком. к заказу (${getCurrentTurnoverMode()} дн)`;
  ninaEls.topDeficitsCaption.textContent = `Топ рекомендаций к заказу на горизонте ${getCurrentTurnoverMode()} дн. Потребность можно выгрузить отдельно.`;
}

function getFilteredRows() {
  const rows = getAllComputedRows();
  const search = ninaState.filters.search;
  const priorityRank = { critical: 4, high: 3, medium: 2, low: 1 };

  let filtered = rows.filter((row) => {
    const hay = `${row.sellerArticle} ${row.name || ""} ${row.category || ""} ${row.platformArticle || ""}`.toLowerCase();
    if (search && !hay.includes(search)) return false;
    if (ninaState.filters.showMode === "need" && row.totalNeedModeCalc <= 0) return false;
    if (ninaState.filters.showMode === "priority" && !["critical", "high"].includes(row.priorityBucket)) return false;
    if (ninaState.filters.showMode === "manual") {
      const hasManual = row.clusterMetricsCalc.some((metric) => !!getManualEntry(ninaState.platform, row.sellerArticle, metric.cluster));
      if (!hasManual) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (ninaState.filters.sort === "article") return String(a.sellerArticle).localeCompare(String(b.sellerArticle), "ru");
    if (ninaState.filters.sort === "daily") return (b.totalActiveDemand || 0) - (a.totalActiveDemand || 0);
    if (ninaState.filters.sort === "month") return (b.monthPlanUnitsTotal || 0) - (a.monthPlanUnitsTotal || 0);
    if (ninaState.filters.sort === "priority") {
      return (priorityRank[b.priorityBucket] || 0) - (priorityRank[a.priorityBucket] || 0) || (b.totalNeedModeCalc || 0) - (a.totalNeedModeCalc || 0);
    }
    return (b.totalNeedModeCalc || 0) - (a.totalNeedModeCalc || 0) || (b.totalActiveDemand || 0) - (a.totalActiveDemand || 0);
  });

  return filtered.slice(0, ninaState.filters.limit);
}

function renderMatrix() {
  const platformData = getPlatformData();
  const clusters = platformData.clusters || [];
  const rows = getFilteredRows();
  ninaEls.matrixMeta.textContent = `${ninaState.platform}: ${rows.length} строк на экране из ${platformData.rows.length}. Шапка таблицы: кластеры → склады → показатели. Вносить можно прямо в ячейках, рекомендацию к заказу выгружать кнопкой «Скачать потребность». Горизонт расчета: ${getCurrentTurnoverMode()} дн.`;
  ninaEls.matrixHead.innerHTML = buildMatrixHead(clusters);
  if (!rows.length) {
    ninaEls.matrixBody.innerHTML = `<tr><td colspan="${5 + 10 + clusters.length * 13}">По текущим фильтрам ничего не найдено.</td></tr>`;
    return;
  }
  ninaEls.matrixBody.innerHTML = rows.map((row) => buildMatrixRow(row, clusters)).join("");
}

function buildMatrixHead(clusters) {
  const warehouseMap = getClusterWarehouseMap();
  const totalLabels = ["Продажи 7д", "Продажи 14д", "План/д", "План/мес", "Запас", "В пути", "Пр-во", "Закуп", "Обор.", "Реком."];
  const clusterLabels = ["Продажи 7д", "Продажи 14д", "План/д", "План/мес", "Запас", "В пути", "Пр-во", "Закуп", "Обор.", "Реком.", "Дата прихода", "Коммент", "Заявка"];
  const top = [
    `<th class="sticky-col col-article" rowspan="3">Артикул / размер</th>`,
    `<th class="sticky-col-2 col-name" rowspan="3">Товар</th>`,
    `<th class="sticky-col-3 col-priority" rowspan="3">Приоритет</th>`,
    `<th class="sticky-col-4 col-planmonth" rowspan="3">План мес., шт</th>`,
    `<th class="sticky-col-5 col-main" rowspan="3">Осн. склад</th>`,
    `<th class="group-head" colspan="${totalLabels.length}">ИТОГО</th>`
  ];
  clusters.forEach((cluster) => {
    top.push(`<th class="group-head cluster-group" colspan="${clusterLabels.length}">${escapeHtml(cluster)}</th>`);
  });
  const middle = [
    `<th class="group-subhead" colspan="${totalLabels.length}">Сумма по всем кластерам</th>`
  ];
  clusters.forEach((cluster) => {
    middle.push(`<th class="warehouse-head" colspan="${clusterLabels.length}">${buildClusterWarehouses(cluster, warehouseMap)}</th>`);
  });
  const bottom = [
    ...totalLabels.map((label) => `<th class="metric-col">${label}</th>`),
    ...clusters.flatMap(() => clusterLabels.map((label) => `<th class="metric-col ${label === "Коммент" ? "col-comment" : ""} ${label === "Заявка" ? "col-order" : ""}">${label}</th>`))
  ];
  return `<tr>${top.join("")}</tr><tr>${middle.join("")}</tr><tr>${bottom.join("")}</tr>`;
}

function buildClusterWarehouses(cluster, warehouseMap) {
  const warehouses = Array.from(warehouseMap.get(cluster) || []);
  if (!warehouses.length) {
    return `<div class="warehouse-list"><span class="warehouse-note">по текущему источнику строка агрегирована без списка складов</span></div>`;
  }
  return `<div class="warehouse-list">${warehouses.map((warehouse) => `<span class="warehouse-chip">${escapeHtml(warehouse)}</span>`).join("")}</div>`;
}

function buildMatrixRow(row, clusters) {
  const byCluster = new Map(row.clusterMetricsCalc.map((metric) => [metric.cluster, metric]));
  const priorityClass = `priority-${row.priorityBucket || "low"}`;
  const totalNeedClass = row.totalNeedModeCalc > 100 ? "need-high" : row.totalNeedModeCalc > 0 ? "need-mid" : "need-zero";
  const totalCells = [
    formatNumericCell(row.totalOrders7dCalc, true),
    formatNumericCell(row.totalOrders14dCalc, true),
    formatNumericCell(row.totalActiveDemand, false, 1),
    formatNumericCell(row.monthPlanUnitsTotal, true),
    formatNumericCell(row.totalStockCalc, true),
    formatNumericCell(row.totalTransitCalc, true),
    formatNumericCell(row.totalProductionCalc, true),
    formatNumericCell(row.totalProcurementCalc, true),
    formatNumericCell(row.totalCoverageModeCalc, false, 1),
    `<td class="metric-col total-cell"><span class="need-pill ${totalNeedClass}">${numberFormat(row.totalNeedModeCalc || 0)}</span></td>`
  ].join("");

  const clusterCells = clusters.map((cluster) => {
    const metric = byCluster.get(cluster);
    const entry = metric || {
      cluster,
      orders7d: 0,
      activeDailyDemand: 0,
      monthlyPlanUnits: 0,
      stock: 0,
      inTransit: 0,
      production: 0,
      procurement: 0,
      activeCoverage: null,
      recommendedQtyCalc: 0,
      eta: "",
      comment: ""
    };
    const needClass = entry.recommendedQtyCalc > 100 ? "need-high" : entry.recommendedQtyCalc > 0 ? "need-mid" : "need-zero";
    const titleBits = [];
    const warehouse = formatWarehouseLabel(entry.shippingWarehouse || entry.shippingCluster || "");
    if (warehouse) titleBits.push(`Склад: ${warehouse}`);
    if (entry.source) titleBits.push(`Источник: ${entry.source}`);
    const titleAttr = titleBits.length ? ` title="${escapeHtmlAttr(titleBits.join(" · "))}"` : "";
    return `
      <td class="metric-col"${titleAttr}>${numberFormat(entry.orders7d || 0)}</td>
      <td class="metric-col"${titleAttr}>${numberFormat(entry.orders14dCalc || 0)}</td>
      <td class="metric-col"${titleAttr}>${numberFormat(entry.activeDailyDemand || 0, 1)}</td>
      <td class="metric-col"${titleAttr}>${numberFormat(entry.monthlyPlanUnits || 0)}</td>
      <td class="metric-col"${titleAttr}>${numberFormat(entry.stock || 0)}</td>
      <td class="metric-col">${buildInlineNumber(row.sellerArticle, cluster, "inTransit", entry.inTransit)}</td>
      <td class="metric-col">${buildInlineNumber(row.sellerArticle, cluster, "production", entry.production)}</td>
      <td class="metric-col">${buildInlineNumber(row.sellerArticle, cluster, "procurement", entry.procurement)}</td>
      <td class="metric-col"${titleAttr}>${numberOrDash(entry.activeCoverage)}</td>
      <td class="metric-col"${titleAttr}><span class="need-pill ${needClass}">${numberFormat(entry.recommendedQtyCalc || 0)}</span></td>
      <td class="metric-col">${buildInlineDate(row.sellerArticle, cluster, "eta", entry.eta)}</td>
      <td class="metric-col">${buildInlineText(row.sellerArticle, cluster, "comment", entry.comment)}</td>
      <td class="metric-col"><button type="button" class="order-btn" data-fill-order data-article="${escapeHtmlAttr(row.sellerArticle)}" data-cluster="${escapeHtmlAttr(cluster)}">В заявку</button></td>
    `;
  }).join("");

  return `
    <tr data-row-article="${escapeHtmlAttr(row.sellerArticle)}">
      <td class="sticky-col col-article"><button type="button" class="article-link" data-article-open="${escapeHtmlAttr(row.sellerArticle)}">${escapeHtml(row.sellerArticle)}</button></td>
      <td class="sticky-col-2 col-name"><strong>${escapeHtml(row.name || "")}</strong><br><span class="muted">${escapeHtml(row.category || "")}</span></td>
      <td class="sticky-col-3 col-priority"><span class="priority-pill ${priorityClass}">${escapeHtml(row.priorityLabel || "—")}</span></td>
      <td class="sticky-col-4 col-planmonth">${numberFormat(row.monthPlanUnitsTotal || 0)}</td>
      <td class="sticky-col-5 col-main">${numberFormat(row.mainWarehouseStock || 0)}</td>
      ${totalCells}
      ${clusterCells}
    </tr>
  `;
}

function formatNumericCell(value, integer = false, digits = 0) {
  const rendered = integer ? numberFormat(value || 0) : numberOrDashWithDigits(value, digits);
  return `<td class="metric-col total-cell">${rendered}</td>`;
}

function buildInlineNumber(article, cluster, field, value) {
  const filled = Number(value || 0) > 0 ? "inline-filled" : "";
  return `<input class="inline-input ${filled}" type="number" min="0" step="1" value="${escapeHtmlAttr(value || "")}" data-manual-field="${field}" data-article="${escapeHtmlAttr(article)}" data-cluster="${escapeHtmlAttr(cluster)}" />`;
}

function buildInlineDate(article, cluster, field, value) {
  const filled = value ? "inline-filled" : "";
  return `<input class="inline-date ${filled}" type="date" value="${escapeHtmlAttr(normalizeDateValue(value))}" data-manual-field="${field}" data-article="${escapeHtmlAttr(article)}" data-cluster="${escapeHtmlAttr(cluster)}" />`;
}

function buildInlineText(article, cluster, field, value) {
  const filled = value ? "inline-filled" : "";
  return `<input class="inline-text ${filled}" type="text" value="${escapeHtmlAttr(value || "")}" placeholder="коммент" data-manual-field="${field}" data-article="${escapeHtmlAttr(article)}" data-cluster="${escapeHtmlAttr(cluster)}" />`;
}

function handleMatrixClick(event) {
  const articleBtn = event.target.closest("[data-article-open]");
  if (articleBtn) {
    ninaState.selectedArticle = articleBtn.dataset.articleOpen;
    renderSelectedCard();
    return;
  }

  const orderBtn = event.target.closest("[data-fill-order]");
  if (orderBtn) {
    openOrderFromMatrix(orderBtn.dataset.article, orderBtn.dataset.cluster);
  }
}

function handleMatrixChange(event) {
  const control = event.target.closest("[data-manual-field]");
  if (!control) return;

  const article = control.dataset.article;
  const cluster = control.dataset.cluster;
  const field = control.dataset.manualField;
  if (!article || !cluster || !field) return;

  const previous = getManualEntry(ninaState.platform, article, cluster) || {};
  const payload = { ...previous };

  if (["inTransit", "production", "procurement"].includes(field)) {
    payload[field] = Number(control.value || 0) || 0;
  } else {
    payload[field] = String(control.value || "").trim();
  }
  payload.updatedAt = new Date().toISOString();

  preserveMatrixScroll(() => {
    setManualEntry(ninaState.platform, article, cluster, payload);
    renderSummary();
    renderSelectedCardIfNeeded(article);
    renderTopDeficits();
    renderMatrix();
    fillOrderRecommendationIfMatches(article, cluster);
  });

  showToast("Сохранено.");
}

function preserveMatrixScroll(callback) {
  const left = ninaEls.matrixWrap.scrollLeft;
  const top = ninaEls.matrixWrap.scrollTop;
  callback();
  ninaEls.matrixWrap.scrollLeft = left;
  ninaEls.matrixWrap.scrollTop = top;
}

function renderSelectedCardIfNeeded(article) {
  if (ninaState.selectedArticle === article) {
    renderSelectedCard();
  }
}

function fillOrderRecommendationIfMatches(article, cluster) {
  if (ninaEls.orderArticleSelect.value === article) {
    populateOrderClusters(cluster);
    fillOrderRecommendation();
  }
}

function renderSelectedCard() {
  const rowMap = getRowMap();
  const row = ninaState.selectedArticle && rowMap.has(ninaState.selectedArticle)
    ? computeRow(rowMap.get(ninaState.selectedArticle))
    : getAllComputedRows()[0];

  if (!row) {
    ninaEls.selectedSubtitle.textContent = "Выбери артикул из матрицы ниже.";
    ninaEls.selectedArticleCard.className = "selected-card empty";
    ninaEls.selectedArticleCard.textContent = "Пока ничего не выбрано.";
    return;
  }

  ninaState.selectedArticle = row.sellerArticle;
  ninaEls.selectedSubtitle.textContent = `${ninaState.platform} · ${row.sellerArticle}`;
  ninaEls.selectedArticleCard.className = "selected-card";

  const warehouseMap = getClusterWarehouseMap();
  const topClusters = [...row.clusterMetricsCalc]
    .sort((a, b) => (b.recommendedQtyCalc || 0) - (a.recommendedQtyCalc || 0))
    .slice(0, 5);

  ninaEls.selectedArticleCard.innerHTML = `
    <div class="article-head">
      <div>
        <h3>${escapeHtml(row.name || "")}</h3>
        <div class="article-meta">
          <span class="priority-pill priority-${row.priorityBucket || "low"}">${escapeHtml(row.priorityLabel || "—")}</span>
          <span class="tag-pill">План мес.: ${numberFormat(row.monthPlanUnitsTotal || 0)} шт</span>
          <span class="tag-pill">План/д: ${numberFormat(row.currentPlanDay || 0, 1)}</span>
          <span class="tag-pill">Осн. склад: ${numberFormat(row.mainWarehouseStock || 0)}</span>
        </div>
      </div>
      <div class="tag-pill">${escapeHtml(row.platformArticle || "без platformArticle")}</div>
    </div>

    <div class="article-summary">
      <div class="summary-block"><span>Продажи 7 дн</span><strong>${numberFormat(row.totalOrders7dCalc || 0)}</strong></div>
      <div class="summary-block"><span>Продажи 14 дн</span><strong>${numberFormat(row.totalOrders14dCalc || 0)}</strong></div>
      <div class="summary-block"><span>Оборач. 7 дн</span><strong>${numberOrDash(row.totalCoverage7Calc)}</strong></div>
      <div class="summary-block"><span>Оборач. 14 дн</span><strong>${numberOrDash(row.totalCoverage14Calc)}</strong></div>
      <div class="summary-block"><span>Оборач. 28 дн</span><strong>${numberOrDash(row.totalCoverage28Calc)}</strong></div>
      <div class="summary-block"><span>Запас на МП</span><strong>${numberFormat(row.totalStockCalc || 0)}</strong></div>
      <div class="summary-block"><span>В пути / пр-во / закуп</span><strong>${numberFormat(row.totalTransitCalc || 0)} / ${numberFormat(row.totalProductionCalc || 0)} / ${numberFormat(row.totalProcurementCalc || 0)}</strong></div>
      <div class="summary-block"><span>Реком. к заказу (${getCurrentTurnoverMode()} дн)</span><strong>${numberFormat(row.totalNeedModeCalc || 0)}</strong></div>
    </div>

    <div class="summary-block">
      <span>Что делать по артикулу</span>
      <strong style="font-size:16px; line-height:1.4;">${escapeHtml(row.action || "—")}</strong>
      <div class="muted" style="margin-top:8px;">${escapeHtml(row.reason || "")}</div>
    </div>

    <div>
      <span style="display:block; margin-bottom:8px; color:var(--muted); font-size:12px; font-weight:700;">Кластеры с наибольшей потребностью</span>
      <div class="cluster-mini-list">
        ${topClusters.map((metric) => {
          const warehouses = Array.from(warehouseMap.get(metric.cluster) || []).slice(0, 4);
          const more = Math.max(0, (warehouseMap.get(metric.cluster)?.size || 0) - warehouses.length);
          return `
            <div class="cluster-mini-item">
              <div>
                <strong>${escapeHtml(metric.cluster)}</strong>
                <div class="muted">План мес.: ${numberFormat(metric.monthlyPlanUnits || 0)} · Обор.: ${numberOrDash(metric.activeCoverage)}</div>
                <div class="cluster-mini-warehouses">
                  ${warehouses.length ? warehouses.map((warehouse) => `<span class="warehouse-chip">${escapeHtml(warehouse)}</span>`).join("") : `<span class="warehouse-note">агрегировано</span>`}
                  ${more > 0 ? `<span class="warehouse-note">+${more}</span>` : ""}
                </div>
              </div>
              <div><span class="need-chip ${(metric.recommendedQtyCalc || 0) > 100 ? "need-high" : (metric.recommendedQtyCalc || 0) > 0 ? "need-mid" : "need-zero"}">${numberFormat(metric.recommendedQtyCalc || 0)}</span></div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function handleTopDeficitClick(event) {
  const button = event.target.closest("[data-top-deficit]");
  if (!button) return;
  ninaState.selectedArticle = button.dataset.topDeficit;
  renderSelectedCard();
  switchPage("matrix");
  scrollToSelectedRow();
}

function scrollToSelectedRow() {
  const row = Array.from(ninaEls.matrixBody.querySelectorAll("tr[data-row-article]"))
    .find((item) => item.dataset.rowArticle === ninaState.selectedArticle);
  if (row) {
    row.scrollIntoView({ block: "nearest", inline: "start" });
  }
}

function renderTopDeficits() {
  const rows = getAllComputedRows()
    .filter((row) => row.totalNeedModeCalc > 0)
    .sort((a, b) => (b.totalNeedModeCalc || 0) - (a.totalNeedModeCalc || 0))
    .slice(0, 15);

  ninaEls.topDeficitsList.innerHTML = rows.length ? rows.map((row) => `
    <button type="button" class="deficit-item" data-top-deficit="${escapeHtmlAttr(row.sellerArticle)}">
      <strong>${escapeHtml(row.sellerArticle)}</strong>
      <div>${escapeHtml(row.name || "")}</div>
      <div class="deficit-meta">
        <span class="priority-pill priority-${row.priorityBucket || "low"}">${escapeHtml(row.priorityLabel || "—")}</span>
        <span class="tag-pill">Реком.: ${numberFormat(row.totalNeedModeCalc || 0)} шт</span>
        <span class="tag-pill">План мес.: ${numberFormat(row.monthPlanUnitsTotal || 0)} шт</span>
      </div>
    </button>
  `).join("") : `<div class="deficit-item">По текущему горизонту дефицитов нет.</div>`;
}

function renderClusterGuides() {
  const warehouseMap = getClusterWarehouseMap();
  const clusters = getPlatformData().clusters || [];
  const html = clusters.map((cluster) => {
    const warehouses = Array.from(warehouseMap.get(cluster) || []);
    return `
      <article class="cluster-guide-card">
        <strong>${escapeHtml(cluster)}</strong>
        ${warehouses.length
          ? `<div class="deficit-meta">${warehouses.map((warehouse) => `<span class="warehouse-chip">${escapeHtml(warehouse)}</span>`).join("")}</div>`
          : `<span class="muted">В исходной выгрузке эта зона дана агрегированно, без списка складов.</span>`}
      </article>
    `;
  }).join("");
  ninaEls.clusterGuide.innerHTML = html;
  ninaEls.formulaClusters.innerHTML = html;
}

function populateOrderSelectors() {
  const rows = getPlatformData().rows;
  const options = rows.map((row) => `<option value="${escapeHtmlAttr(row.sellerArticle)}">${escapeHtml(row.sellerArticle)} · ${escapeHtml(row.name || "")}</option>`).join("");
  ninaEls.orderArticleSelect.innerHTML = options;
  if (!ninaEls.orderArticleSelect.value && rows.length) {
    ninaEls.orderArticleSelect.value = rows[0].sellerArticle;
  }
  if (ninaState.selectedArticle) {
    ninaEls.orderArticleSelect.value = ninaState.selectedArticle;
  }
  populateOrderClusters();
}

function populateOrderClusters(selectedValue) {
  const row = getRowMap().get(ninaEls.orderArticleSelect.value);
  const clusters = (row?.clusterMetrics || []).map((metric) => metric.cluster).filter(Boolean);
  ninaEls.orderClusterSelect.innerHTML = clusters.map((cluster) => `<option value="${escapeHtmlAttr(cluster)}">${escapeHtml(cluster)}</option>`).join("");
  if (selectedValue) ninaEls.orderClusterSelect.value = selectedValue;
  fillOrderRecommendation();
  renderOrderRecommendations();
}

function openOrderFromMatrix(article, cluster) {
  ninaState.selectedArticle = article;
  ninaEls.orderArticleSelect.value = article;
  populateOrderClusters(cluster);
  ninaEls.orderClusterSelect.value = cluster;
  fillOrderRecommendation();
  switchPage("orders");
}

function fillOrderRecommendation() {
  const row = getRowMap().get(ninaEls.orderArticleSelect.value);
  if (!row) return;
  const computed = computeRow(row);
  const metric = computed.clusterMetricsCalc.find((item) => item.cluster === ninaEls.orderClusterSelect.value) || computed.clusterMetricsCalc[0];
  const recommended = metric?.recommendedQtyCalc || 0;
  ninaEls.orderRecommendedInput.value = recommended;
  if (!ninaEls.orderQtyInput.value || Number(ninaEls.orderQtyInput.value) === 0) {
    ninaEls.orderQtyInput.value = recommended;
  }
  ninaEls.orderPrioritySelect.value = computed.priorityBucket || "medium";
  ninaEls.orderEtaInput.value = normalizeDateValue(metric?.eta || "");
  if (!ninaEls.orderCommentInput.value) {
    ninaEls.orderCommentInput.value = metric?.comment || "";
  }
}

function saveOrderRequest(event) {
  event.preventDefault();
  const request = {
    id: `req-${Date.now()}`,
    createdAt: new Date().toISOString(),
    platform: ninaState.platform,
    sellerArticle: ninaEls.orderArticleSelect.value,
    cluster: ninaEls.orderClusterSelect.value,
    recommendedQty: Number(ninaEls.orderRecommendedInput.value || 0) || 0,
    qty: Number(ninaEls.orderQtyInput.value || 0) || 0,
    source: ninaEls.orderSourceSelect.value,
    priority: ninaEls.orderPrioritySelect.value,
    eta: ninaEls.orderEtaInput.value || "",
    comment: ninaEls.orderCommentInput.value.trim()
  };
  ninaState.orderRequests.unshift(request);
  persistOrderRequests();
  renderOrdersTable();
  showToast("Заявка сохранена.");
  resetOrderForm();
}

function resetOrderForm() {
  ninaEls.orderQtyInput.value = "";
  ninaEls.orderEtaInput.value = "";
  ninaEls.orderCommentInput.value = "";
  ninaEls.orderSourceSelect.value = "main-stock";
  fillOrderRecommendation();
}

function renderOrderRecommendations() {
  const row = getRowMap().get(ninaEls.orderArticleSelect.value || ninaState.selectedArticle);
  if (!row) {
    ninaEls.orderRecommendationMeta.textContent = "Выбери артикул, чтобы увидеть расчет по кластерам.";
    ninaEls.orderRecommendationBody.innerHTML = `<tr><td colspan="8">Нет данных по выбранному артикулу.</td></tr>`;
    return;
  }

  const computed = computeRow(row);
  const warehouseMap = getClusterWarehouseMap();
  const metrics = [...computed.clusterMetricsCalc].sort((a, b) => {
    return (b.recommendedQtyCalc || 0) - (a.recommendedQtyCalc || 0) || (b.activeDailyDemand || 0) - (a.activeDailyDemand || 0);
  });

  ninaEls.orderRecommendationMeta.textContent = `${ninaState.platform} · ${computed.sellerArticle}. Рекомендация считается по продажам, текущему горизонту ${getCurrentTurnoverMode()} дн и целевому покрытию ${getCurrentTargetDays()} дн.`;

  ninaEls.orderRecommendationBody.innerHTML = metrics.length ? metrics.map((metric) => {
    const needClass = metric.recommendedQtyCalc > 100 ? "need-high" : metric.recommendedQtyCalc > 0 ? "need-mid" : "need-zero";
    const warehouses = Array.from(warehouseMap.get(metric.cluster) || []);
    const warehouseLabel = warehouses.length ? warehouses.slice(0, 3).join(", ") : "агрегировано";
    return `
      <tr>
        <td class="reco-cluster-cell"><strong>${escapeHtml(metric.cluster)}</strong><div class="muted">${escapeHtml(warehouseLabel)}</div></td>
        <td class="num">${numberFormat(metric.orders7d || 0)}</td>
        <td class="num">${numberFormat(metric.orders14dCalc || 0)}</td>
        <td class="num">${numberFormat(metric.activeDailyDemand || 0, 1)}</td>
        <td class="num">${numberFormat(metric.available || 0)}</td>
        <td class="num">${numberOrDash(metric.activeCoverage)}</td>
        <td class="num"><span class="need-pill ${needClass}">${numberFormat(metric.recommendedQtyCalc || 0)}</span></td>
        <td><button type="button" class="order-btn" data-reco-article="${escapeHtmlAttr(computed.sellerArticle)}" data-reco-cluster="${escapeHtmlAttr(metric.cluster)}">В форму</button></td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="8">По выбранному артикулу нет кластерных строк.</td></tr>`;
}

function handleOrderRecommendationClick(event) {
  const button = event.target.closest("[data-reco-article][data-reco-cluster]");
  if (!button) return;
  const article = button.dataset.recoArticle;
  const cluster = button.dataset.recoCluster;
  ninaEls.orderArticleSelect.value = article;
  populateOrderClusters(cluster);
  ninaEls.orderClusterSelect.value = cluster;
  fillOrderRecommendation();
  showToast("Рекомендация подставлена в форму.");
}

function renderOrdersTable() {
  const rows = ninaState.orderRequests
    .filter((item) => item.platform === ninaState.platform)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  ninaEls.ordersBody.innerHTML = rows.length ? rows.map((item) => `
    <tr>
      <td>${escapeHtml(formatDateTime(item.createdAt))}</td>
      <td>${escapeHtml(item.platform)}</td>
      <td>${escapeHtml(item.sellerArticle)}</td>
      <td>${escapeHtml(item.cluster)}</td>
      <td class="num">${numberFormat(item.recommendedQty || 0)}</td>
      <td class="num">${numberFormat(item.qty || 0)}</td>
      <td>${escapeHtml(sourceLabel(item.source))}</td>
      <td>${escapeHtml(item.eta || "—")}</td>
      <td>${escapeHtml(item.comment || "—")}</td>
    </tr>
  `).join("") : `<tr><td colspan="9">Пока нет сохраненных заявок.</td></tr>`;
}

function exportAllJson() {
  const payload = {
    exportedAt: new Date().toISOString(),
    targetDays: ninaState.targetDays,
    turnoverMode: ninaState.turnoverMode,
    manualInputs: ninaState.manualInputs,
    orderRequests: ninaState.orderRequests
  };
  downloadBlob(JSON.stringify(payload, null, 2), `tekstilno-nina-backup-${Date.now()}.json`, "application/json");
}

function importAllJson(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(reader.result);
      ninaState.targetDays = payload.targetDays || ninaState.targetDays;
      ninaState.turnoverMode = payload.turnoverMode || ninaState.turnoverMode;
      ninaState.manualInputs = payload.manualInputs || {};
      ninaState.orderRequests = payload.orderRequests || [];
      persistTargetDays();
      persistTurnoverMode();
      persistManualInputs();
      persistOrderRequests();
      syncUiState();
      renderAll();
      showToast("JSON успешно импортирован.");
    } catch (error) {
      showToast(`Не удалось прочитать JSON: ${error.message}`);
    }
  };
  reader.readAsText(file, "utf-8");
  event.target.value = "";
}

function exportExcelWorkbook() {
  const sheets = [
    buildMatrixSheet("WB"),
    buildMatrixSheet("Ozon"),
    buildNeedSheet("WB"),
    buildNeedSheet("Ozon"),
    buildManualSheet(),
    buildOrdersSheet()
  ];
  const xml = buildWorkbookXml(sheets);
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(xml, `tekstilno-nina-${stamp}.xls`, "application/vnd.ms-excel");
  showToast("Excel-выгрузка скачана.");
}

function buildMatrixSheet(platform) {
  const warehouseMap = getClusterWarehouseMap(platform);
  const rows = [[
    "Платформа", "Артикул", "Товар", "Категория", "Приоритет", "План месяца, шт", "План/день",
    "Осн. склад", "Кластер", "Склады в кластере", "Продажи 7д", "Продажи 14д", "Спрос 7д", "Спрос 14д", "Спрос 28д",
    `Спрос активный (${getTurnoverModeForPlatform(platform)}д)`, "Запас", "В пути", "Производство", "Закупка", "Доступно",
    "Обор. 7д", "Обор. 14д", "Обор. 28д", `Обор. активная (${getTurnoverModeForPlatform(platform)}д)`,
    `Реком. к заказу (${getTurnoverModeForPlatform(platform)}д)`, "Целевые дни", "Дата прихода", "Комментарий", "Источник"
  ]];

  getAllComputedRows(platform).forEach((row) => {
    row.clusterMetricsCalc.forEach((metric) => {
      rows.push([
        platform,
        row.sellerArticle,
        row.name || "",
        row.category || "",
        row.priorityLabel || "",
        row.monthPlanUnitsTotal || 0,
        row.currentPlanDay || 0,
        row.mainWarehouseStock || 0,
        metric.cluster,
        Array.from(warehouseMap.get(metric.cluster) || []).join(", "),
        metric.orders7d || 0,
        metric.orders14dCalc || 0,
        metric.dailyDemand7 || 0,
        metric.dailyDemand14 || 0,
        metric.dailyDemand28 || 0,
        metric.activeDailyDemand || 0,
        metric.stock || 0,
        metric.inTransit || 0,
        metric.production || 0,
        metric.procurement || 0,
        metric.available || 0,
        metric.coverage7DaysCalc ?? "",
        metric.coverage14DaysCalc ?? "",
        metric.coverage28DaysCalc ?? "",
        metric.activeCoverage ?? "",
        metric.recommendedQtyCalc || 0,
        metric.targetDays || getTargetDaysForPlatform(platform),
        metric.eta || "",
        metric.comment || "",
        metric.source || ""
      ]);
    });
  });

  return { name: `${platform}_матрица`, rows };
}

function buildManualSheet() {
  const rows = [[
    "Платформа", "Артикул", "Кластер", "В пути", "Производство", "Закупка", "Целевые дни", "Коэф. сезона", "Дата прихода", "Комментарий", "Обновлено"
  ]];
  Object.entries(ninaState.manualInputs)
    .sort((a, b) => String(b[1]?.updatedAt || "").localeCompare(String(a[1]?.updatedAt || "")))
    .forEach(([key, value]) => {
      const [platform, article, cluster] = key.split("__");
      rows.push([
        platform,
        article,
        cluster,
        value.inTransit || 0,
        value.production || 0,
        value.procurement || 0,
        value.targetDays || "",
        value.seasonalityOverride || "",
        value.eta || "",
        value.comment || "",
        value.updatedAt || ""
      ]);
    });
  return { name: "Внесено", rows };
}

function buildOrdersSheet() {
  const rows = [[
    "Дата", "Платформа", "Артикул", "Кластер", "Реком.", "Заказать", "Источник", "Приоритет", "Дата прихода", "Комментарий"
  ]];
  ninaState.orderRequests
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .forEach((item) => {
      rows.push([
        formatDateTime(item.createdAt),
        item.platform,
        item.sellerArticle,
        item.cluster,
        item.recommendedQty || 0,
        item.qty || 0,
        sourceLabel(item.source),
        item.priority || "",
        item.eta || "",
        item.comment || ""
      ]);
    });
  return { name: "Заявки", rows };
}

function buildNeedSheet(platform = ninaState.platform) {
  const warehouseMap = getClusterWarehouseMap(platform);
  const rows = [[
    "Платформа", "Артикул", "Товар", "Приоритет", "План месяца, шт", "Продажи 7д", "Продажи 14д", `Спрос/день (${getTurnoverModeForPlatform(platform)}д)`,
    "Кластер", "Склады", "Запас", "В пути", "Производство", "Закупка", "Доступно", `Оборачиваемость (${getTurnoverModeForPlatform(platform)}д)`,
    `Реком. к заказу (${getTurnoverModeForPlatform(platform)}д)`, "Целевые дни", "Дата прихода", "Комментарий"
  ]];
  getAllComputedRows(platform)
    .sort((a, b) => (b.totalNeedModeCalc || 0) - (a.totalNeedModeCalc || 0))
    .forEach((row) => {
      row.clusterMetricsCalc
        .filter((metric) => Number(metric.recommendedQtyCalc || 0) > 0)
        .forEach((metric) => {
          rows.push([
            platform,
            row.sellerArticle,
            row.name || "",
            row.priorityLabel || "",
            row.monthPlanUnitsTotal || 0,
            metric.orders7d || 0,
            metric.orders14dCalc || 0,
            row.totalActiveDemand || 0,
            metric.cluster,
            Array.from(warehouseMap.get(metric.cluster) || []).join(", "),
            metric.stock || 0,
            metric.inTransit || 0,
            metric.production || 0,
            metric.procurement || 0,
            metric.available || 0,
            metric.activeCoverage ?? "",
            metric.recommendedQtyCalc || 0,
            metric.targetDays || getTargetDaysForPlatform(platform),
            metric.eta || "",
            metric.comment || ""
          ]);
        });
    });
  return { name: `${platform}_потребность`, rows };
}

function exportNeedWorkbook() {
  const sheet = buildNeedSheet(ninaState.platform);
  const xml = buildWorkbookXml([sheet]);
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(xml, `tekstilno-${ninaState.platform.toLowerCase()}-need-${stamp}.xls`, "application/vnd.ms-excel");
  showToast(`Выгрузка потребности ${ninaState.platform} скачана.`);
}

function buildWorkbookXml(sheets) {
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Top" ss:WrapText="1"/>
      <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="10"/>
    </Style>
    <Style ss:ID="Header">
      <Font ss:Bold="1" ss:FontName="Calibri" x:Family="Swiss" ss:Size="10"/>
      <Interior ss:Color="#DDE7F8" ss:Pattern="Solid"/>
      <Alignment ss:Vertical="Top" ss:WrapText="1"/>
    </Style>
  </Styles>
  ${sheets.map((sheet) => {
    const safeName = xmlEscape(String(sheet.name || "Sheet")).slice(0, 31);
    const rowsXml = sheet.rows.map((row, rowIndex) => {
      return `<Row>${row.map((cell) => {
        const isNumber = typeof cell === "number" && Number.isFinite(cell);
        const type = isNumber ? "Number" : "String";
        const style = rowIndex === 0 ? ` ss:StyleID="Header"` : "";
        const value = isNumber ? String(cell).replace(",", ".") : xmlEscape(String(cell ?? ""));
        return `<Cell${style}><Data ss:Type="${type}">${value}</Data></Cell>`;
      }).join("")}</Row>`;
    }).join("");
    return `<Worksheet ss:Name="${safeName}"><Table>${rowsXml}</Table></Worksheet>`;
  }).join("")}
</Workbook>`;
}

function normalizeDateValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function formatWarehouseLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/_/g, " ");
}

function sourceLabel(value) {
  return ({
    "main-stock": "Осн. склад",
    production: "Производство",
    procurement: "Закупка",
    mix: "Комбинированно"
  })[value] || value;
}

function numberFormat(value, digits = 0) {
  if (value == null || value === "") return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return "—";
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(num);
}

function numberOrDash(value) {
  if (value == null || value === "") return "—";
  return numberFormat(value, 1);
}

function numberOrDashWithDigits(value, digits = 1) {
  if (value == null || value === "") return "—";
  return numberFormat(value, digits);
}

function roundNum(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function versionedUrl(url) {
  const version = ninaState.config?.siteVersion ? `v=${encodeURIComponent(ninaState.config.siteVersion)}` : "";
  return version ? `${url}${url.includes("?") ? "&" : "?"}${version}` : url;
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeHtmlAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function cssEscape(value) {
  return String(value).replace(/"/g, '\\"');
}

function downloadBlob(content, filename, mimeType) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function loadStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function showToast(message) {
  ninaEls.toast.hidden = false;
  ninaEls.toast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    ninaEls.toast.hidden = true;
  }, 2200);
}
