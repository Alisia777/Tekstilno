
const ninaState = {
  config: window.APP_CONFIG || {},
  data: null,
  platform: "WB",
  page: "matrix",
  targetDays: { WB: 21, Ozon: 21 },
  filters: { search: "", showMode: "all", limit: 50, sort: "need" },
  manualInputs: loadStorage("tekstilno-nina-manual-inputs-v1", {}),
  orderRequests: loadStorage("tekstilno-nina-order-requests-v1", []),
  selectedArticle: null
};

const ninaEls = {};
let toastTimer = null;

document.addEventListener("DOMContentLoaded", initNina);

async function initNina() {
  cacheElements();
  bindEvents();
  await loadData();
  syncTargetDaysUi();
  renderAll();
}

function cacheElements() {
  [
    "exportAllBtn","importAllInput","reportMonthBadge","targetDaysInput",
    "sumArticles","sumClusters","sumDaily","sumStock","sumMainStock","sumNeed",
    "searchInput","showModeSelect","rowLimitSelect","sortSelect","matrixMeta","matrixHead","matrixBody",
    "selectedSubtitle","selectedArticleCard","quickInputForm","quickArticleSelect","quickClusterSelect",
    "quickTransitInput","quickProductionInput","quickProcurementInput","quickTargetDaysInput","quickSeasonalityInput",
    "quickCommentInput","quickClearBtn","stockBody","exportStockBtn",
    "orderForm","orderArticleSelect","orderClusterSelect","orderRecommendedInput","orderQtyInput","orderSourceSelect",
    "orderPrioritySelect","orderEtaInput","orderCommentInput","resetOrderBtn","ordersBody","topDeficitsList",
    "inputsBody","exportInputsBtn","exportOrdersBtn","toast"
  ].forEach((id) => { ninaEls[id] = document.getElementById(id); });

  ninaEls.platformButtons = Array.from(document.querySelectorAll("[data-platform]"));
  ninaEls.pageButtons = Array.from(document.querySelectorAll("[data-page]"));
  ninaEls.pagePanels = {
    matrix: document.getElementById("page-matrix"),
    stock: document.getElementById("page-stock"),
    orders: document.getElementById("page-orders"),
    inputs: document.getElementById("page-inputs"),
    formula: document.getElementById("page-formula")
  };
}

function bindEvents() {
  ninaEls.platformButtons.forEach((btn) => btn.addEventListener("click", () => switchPlatform(btn.dataset.platform)));
  ninaEls.pageButtons.forEach((btn) => btn.addEventListener("click", () => switchPage(btn.dataset.page)));
  ninaEls.targetDaysInput.addEventListener("change", handleTargetDaysChange);
  ninaEls.searchInput.addEventListener("input", () => { ninaState.filters.search = ninaEls.searchInput.value.trim().toLowerCase(); renderMatrix(); });
  ninaEls.showModeSelect.addEventListener("change", () => { ninaState.filters.showMode = ninaEls.showModeSelect.value; renderMatrix(); });
  ninaEls.rowLimitSelect.addEventListener("change", () => { ninaState.filters.limit = Number(ninaEls.rowLimitSelect.value || 50); renderMatrix(); });
  ninaEls.sortSelect.addEventListener("change", () => { ninaState.filters.sort = ninaEls.sortSelect.value; renderMatrix(); });

  ninaEls.quickInputForm.addEventListener("submit", saveQuickInput);
  ninaEls.quickArticleSelect.addEventListener("change", () => { ninaState.selectedArticle = ninaEls.quickArticleSelect.value; populateQuickClusters(); renderSelectedCard(); });
  ninaEls.quickClusterSelect.addEventListener("change", fillQuickInputForm);
  ninaEls.quickClearBtn.addEventListener("click", clearQuickInput);

  ninaEls.orderForm.addEventListener("submit", saveOrderRequest);
  ninaEls.orderArticleSelect.addEventListener("change", () => populateOrderClusters());
  ninaEls.orderClusterSelect.addEventListener("change", fillOrderRecommendation);
  ninaEls.resetOrderBtn.addEventListener("click", (e) => { e.preventDefault(); resetOrderForm(); });

  ninaEls.exportStockBtn.addEventListener("click", exportStockCsv);
  ninaEls.exportOrdersBtn.addEventListener("click", exportOrdersCsv);
  ninaEls.exportInputsBtn.addEventListener("click", exportInputsCsv);
  ninaEls.exportAllBtn.addEventListener("click", exportAllJson);
  ninaEls.importAllInput.addEventListener("change", importAllJson);
}

async function loadData() {
  try {
    const response = await fetch(versionedUrl("data/nina-cluster-dashboard.json"));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    ninaState.data = await response.json();
    ninaEls.reportMonthBadge.value = ninaState.data.reportMonth || "2026-04";
  } catch (error) {
    console.error(error);
    showToast(`Не удалось загрузить data/nina-cluster-dashboard.json: ${error.message}`);
  }
}

function renderAll() {
  if (!ninaState.data) return;
  updateToggleUi();
  renderSummary();
  populateArticleSelectors();
  populateQuickClusters();
  populateOrderClusters();
  renderMatrix();
  renderSelectedCard();
  renderStockTable();
  renderTopDeficits();
  renderOrdersTable();
  renderInputsTable();
}

function switchPlatform(platform) {
  ninaState.platform = platform;
  ninaState.selectedArticle = null;
  syncTargetDaysUi();
  renderAll();
}

function switchPage(page) {
  ninaState.page = page;
  updateToggleUi();
}

function updateToggleUi() {
  ninaEls.platformButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.platform === ninaState.platform));
  ninaEls.pageButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.page === ninaState.page));
  Object.entries(ninaEls.pagePanels).forEach(([key, panel]) => panel.classList.toggle("active", key === ninaState.page));
}

function handleTargetDaysChange() {
  const value = clampNumber(Number(ninaEls.targetDaysInput.value || 21), 7, 60, 21);
  ninaState.targetDays[ninaState.platform] = value;
  ninaEls.targetDaysInput.value = value;
  renderSummary();
  renderMatrix();
  renderSelectedCard();
  renderStockTable();
  renderTopDeficits();
  fillOrderRecommendation();
}

function syncTargetDaysUi() {
  ninaEls.targetDaysInput.value = ninaState.targetDays[ninaState.platform] || 21;
}

function getPlatformData() {
  return ninaState.data?.platforms?.[ninaState.platform] || { clusters: [], rows: [], summary: {}, topDeficits: [] };
}

function getRowMap() {
  const map = new Map();
  getPlatformData().rows.forEach((row) => map.set(row.sellerArticle, row));
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
  if (!payload || Object.values(payload).every((v) => v === "" || v === 0 || v === null || v === undefined)) {
    delete ninaState.manualInputs[key];
  } else {
    ninaState.manualInputs[key] = payload;
  }
  localStorage.setItem("tekstilno-nina-manual-inputs-v1", JSON.stringify(ninaState.manualInputs));
}

function persistOrderRequests() {
  localStorage.setItem("tekstilno-nina-order-requests-v1", JSON.stringify(ninaState.orderRequests));
}

function computeRow(row) {
  const targetDefault = ninaState.targetDays[ninaState.platform] || row.targetDaysDefault || 21;
  const clusterMetricsCalc = row.clusterMetrics.map((metric) => {
    const entry = getManualEntry(ninaState.platform, row.sellerArticle, metric.cluster) || {};
    const targetDays = clampNumber(Number(entry.targetDays || targetDefault), 7, 60, targetDefault);
    const override = entry.seasonalityOverride === "" || entry.seasonalityOverride == null ? null : Number(entry.seasonalityOverride);
    const adjustedBase = override && override > 0
      ? Math.max(Number(metric.avgDaily || 0), Number(metric.seasonalPlanDay || 0) * override)
      : Number(metric.adjustedDaily || 0);
    const inTransit = Number(entry.inTransit || 0) || 0;
    const production = Number(entry.production || 0) || 0;
    const procurement = Number(entry.procurement || 0) || 0;
    const available = Number(metric.stock || 0) + inTransit + production + procurement;
    const turnover = adjustedBase > 0 ? roundNum(available / adjustedBase, 1) : null;
    const need = Math.max(0, Math.ceil(adjustedBase * targetDays - available));
    return {
      ...metric,
      adjustedDailyCalc: roundNum(adjustedBase, 2),
      inTransit,
      production,
      procurement,
      available: roundNum(available, 2),
      turnoverDaysCalc: turnover,
      recommendedQtyCalc: need,
      targetDays,
      seasonalityOverride: override,
      comment: entry.comment || ""
    };
  });

  const totalAdjusted = clusterMetricsCalc.reduce((sum, item) => sum + Number(item.adjustedDailyCalc || 0), 0);
  const totalStock = clusterMetricsCalc.reduce((sum, item) => sum + Number(item.stock || 0), 0);
  const totalTransit = clusterMetricsCalc.reduce((sum, item) => sum + Number(item.inTransit || 0), 0);
  const totalProduction = clusterMetricsCalc.reduce((sum, item) => sum + Number(item.production || 0), 0);
  const totalProcurement = clusterMetricsCalc.reduce((sum, item) => sum + Number(item.procurement || 0), 0);
  const totalAvailable = totalStock + totalTransit + totalProduction + totalProcurement;
  const totalNeed = clusterMetricsCalc.reduce((sum, item) => sum + Number(item.recommendedQtyCalc || 0), 0);
  const totalTurnover = totalAdjusted > 0 ? roundNum(totalAvailable / totalAdjusted, 1) : null;

  return {
    ...row,
    clusterMetricsCalc,
    totalAdjustedCalc: roundNum(totalAdjusted, 2),
    totalStockCalc: roundNum(totalStock, 2),
    totalTransitCalc: roundNum(totalTransit, 2),
    totalProductionCalc: roundNum(totalProduction, 2),
    totalProcurementCalc: roundNum(totalProcurement, 2),
    totalAvailableCalc: roundNum(totalAvailable, 2),
    totalNeedCalc: totalNeed,
    totalTurnoverCalc: totalTurnover
  };
}

function getAllComputedRows() {
  return getPlatformData().rows.map(computeRow);
}

function getFilteredRows() {
  const rows = getAllComputedRows();
  const search = ninaState.filters.search;
  const priorityRank = { critical: 4, high: 3, medium: 2, low: 1 };
  let filtered = rows.filter((row) => {
    const hay = `${row.sellerArticle} ${row.name || ""} ${row.category || ""}`.toLowerCase();
    if (search && !hay.includes(search)) return false;
    if (ninaState.filters.showMode === "need" && row.totalNeedCalc <= 0) return false;
    if (ninaState.filters.showMode === "priority" && !["critical", "high"].includes(row.priorityBucket)) return false;
    if (ninaState.filters.showMode === "manual") {
      const hasManual = row.clusterMetricsCalc.some((metric) => !!getManualEntry(ninaState.platform, row.sellerArticle, metric.cluster));
      if (!hasManual) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (ninaState.filters.sort === "article") return a.sellerArticle.localeCompare(b.sellerArticle, "ru");
    if (ninaState.filters.sort === "daily") return (b.totalAdjustedCalc || 0) - (a.totalAdjustedCalc || 0);
    if (ninaState.filters.sort === "priority") {
      return (priorityRank[b.priorityBucket] || 0) - (priorityRank[a.priorityBucket] || 0) || (b.totalNeedCalc || 0) - (a.totalNeedCalc || 0);
    }
    return (b.totalNeedCalc || 0) - (a.totalNeedCalc || 0) || (b.totalAdjustedCalc || 0) - (a.totalAdjustedCalc || 0);
  });

  return filtered.slice(0, ninaState.filters.limit);
}

function renderSummary() {
  const rows = getAllComputedRows();
  ninaEls.sumArticles.textContent = numberFormat(rows.length);
  ninaEls.sumClusters.textContent = numberFormat(getPlatformData().clusters.length);
  ninaEls.sumDaily.textContent = numberFormat(rows.reduce((sum, row) => sum + Number(row.totalAdjustedCalc || 0), 0), 1);
  ninaEls.sumStock.textContent = numberFormat(rows.reduce((sum, row) => sum + Number(row.totalStockCalc || 0), 0));
  ninaEls.sumMainStock.textContent = numberFormat(rows.reduce((sum, row) => sum + Number(row.mainWarehouseStock || 0), 0));
  ninaEls.sumNeed.textContent = numberFormat(rows.reduce((sum, row) => sum + Number(row.totalNeedCalc || 0), 0));
}

function renderMatrix() {
  const platformData = getPlatformData();
  const clusters = platformData.clusters;
  const rows = getFilteredRows();
  ninaEls.matrixMeta.textContent = `${ninaState.platform}: ${rows.length} строк на экране из ${platformData.rows.length}. ИТОГО — сумма по кластерам; “План/д” уже учитывает сезонность.`;
  ninaEls.matrixHead.innerHTML = buildMatrixHead(clusters);
  if (!rows.length) {
    ninaEls.matrixBody.innerHTML = `<tr><td colspan="${16 + clusters.length * 8}">По текущим фильтрам ничего не найдено.</td></tr>`;
    return;
  }
  ninaEls.matrixBody.innerHTML = rows.map((row) => buildMatrixRow(row, clusters)).join("");

  ninaEls.matrixBody.querySelectorAll("[data-article-open]").forEach((button) => {
    button.addEventListener("click", () => {
      ninaState.selectedArticle = button.dataset.articleOpen;
      renderSelectedCard();
      ninaEls.quickArticleSelect.value = ninaState.selectedArticle;
      populateQuickClusters();
    });
  });

  ninaEls.matrixBody.querySelectorAll("[data-fill-order]").forEach((button) => {
    button.addEventListener("click", () => {
      ninaState.selectedArticle = button.dataset.article;
      switchPage("orders");
      ninaEls.orderArticleSelect.value = button.dataset.article;
      populateOrderClusters(button.dataset.cluster);
      ninaEls.orderClusterSelect.value = button.dataset.cluster;
      fillOrderRecommendation();
    });
  });
}

function buildMatrixHead(clusters) {
  const top = [
    `<th class="sticky-col col-article" rowspan="2">Артикул / размер</th>`,
    `<th class="sticky-col-2 col-name" rowspan="2">Товар</th>`,
    `<th class="sticky-col-3 col-priority" rowspan="2">Приоритет</th>`,
    `<th class="sticky-col-4 col-main" rowspan="2">Осн. склад</th>`,
    `<th colspan="8">ИТОГО</th>`
  ];
  clusters.forEach((cluster) => top.push(`<th colspan="8">${escapeHtml(cluster)}</th>`));

  const labels = ["7д", "План/д", "Ост", "В пути", "Пр-во", "Закуп", "Об.", "Нужно"];
  const fixed = [
    `<th class="sticky-col col-article"></th>`,
    `<th class="sticky-col-2 col-name"></th>`,
    `<th class="sticky-col-3 col-priority"></th>`,
    `<th class="sticky-col-4 col-main"></th>`
  ];
  return `<tr>${top.join("")}</tr><tr>${fixed.join("")}${labels.map((l) => `<th class="metric-col">${l}</th>`).join("")}${clusters.map(() => labels.map((l) => `<th class="metric-col">${l}</th>`).join("")).join("")}</tr>`;
}

function buildMatrixRow(row, clusters) {
  const byCluster = new Map(row.clusterMetricsCalc.map((metric) => [metric.cluster, metric]));
  const priorityClass = `priority-${row.priorityBucket || "low"}`;
  const totalNeedClass = row.totalNeedCalc > 100 ? "need-high" : row.totalNeedCalc > 0 ? "need-mid" : "need-zero";
  const totalCells = [
    row.totalOrders7d || 0,
    row.totalAdjustedCalc || 0,
    row.totalStockCalc || 0,
    row.totalTransitCalc || 0,
    row.totalProductionCalc || 0,
    row.totalProcurementCalc || 0,
    row.totalTurnoverCalc,
    row.totalNeedCalc || 0
  ].map((value, idx) => {
    if (idx === 7) {
      return `<td class="metric-col"><span class="need-pill ${totalNeedClass}">${numberFormat(value)}</span></td>`;
    }
    return `<td class="metric-col">${numberOrDash(value)}</td>`;
  }).join("");

  const clusterCells = clusters.map((cluster) => {
    const metric = byCluster.get(cluster) || {
      orders7d: 0, adjustedDailyCalc: 0, stock: 0, inTransit: 0, production: 0, procurement: 0, turnoverDaysCalc: null, recommendedQtyCalc: 0, comment: ""
    };
    const needClass = metric.recommendedQtyCalc > 100 ? "need-high" : metric.recommendedQtyCalc > 0 ? "need-mid" : "need-zero";
    const values = [
      metric.orders7d || 0,
      metric.adjustedDailyCalc || 0,
      metric.stock || 0,
      metric.inTransit || 0,
      metric.production || 0,
      metric.procurement || 0,
      metric.turnoverDaysCalc,
      metric.recommendedQtyCalc || 0
    ];
    return values.map((value, idx) => {
      if (idx === 7) {
        return `<td class="metric-col" title="${escapeHtml(metric.comment || "")}"><button type="button" class="need-pill ${needClass}" data-fill-order data-article="${escapeHtmlAttr(row.sellerArticle)}" data-cluster="${escapeHtmlAttr(cluster)}">${numberFormat(value)}</button></td>`;
      }
      return `<td class="metric-col" title="${escapeHtml(metric.comment || "")}">${numberOrDash(value)}</td>`;
    }).join("");
  }).join("");

  return `
    <tr>
      <td class="sticky-col col-article"><button type="button" class="article-link" data-article-open="${escapeHtmlAttr(row.sellerArticle)}">${escapeHtml(row.sellerArticle)}</button></td>
      <td class="sticky-col-2 col-name"><strong>${escapeHtml(row.name || "")}</strong><br><span class="muted">${escapeHtml(row.category || "")}</span></td>
      <td class="sticky-col-3 col-priority"><span class="priority-pill ${priorityClass}">${escapeHtml(row.priorityLabel || "—")}</span></td>
      <td class="sticky-col-4 col-main">${numberFormat(row.mainWarehouseStock || 0)}</td>
      ${totalCells}
      ${clusterCells}
    </tr>`;
}

function renderSelectedCard() {
  const rowMap = getRowMap();
  const article = ninaState.selectedArticle && rowMap.has(ninaState.selectedArticle)
    ? computeRow(rowMap.get(ninaState.selectedArticle))
    : getAllComputedRows()[0];

  if (!article) {
    ninaEls.selectedSubtitle.textContent = "Выбери артикул из таблицы слева.";
    ninaEls.selectedArticleCard.className = "selected-card empty";
    ninaEls.selectedArticleCard.textContent = "Пока ничего не выбрано.";
    return;
  }

  ninaState.selectedArticle = article.sellerArticle;
  ninaEls.selectedSubtitle.textContent = `${ninaState.platform} · ${article.sellerArticle}`;
  ninaEls.selectedArticleCard.className = "selected-card";

  const topClusters = [...article.clusterMetricsCalc]
    .sort((a, b) => (b.recommendedQtyCalc || 0) - (a.recommendedQtyCalc || 0))
    .slice(0, 5);

  ninaEls.selectedArticleCard.innerHTML = `
    <div>
      <strong style="font-size:18px;">${escapeHtml(article.name || "")}</strong>
      <div class="deficit-meta">
        <span class="priority-pill priority-${article.priorityBucket || "low"}">${escapeHtml(article.priorityLabel || "—")}</span>
        <span class="tag-pill">Коэф. сезона: ${numberFormat(article.seasonalityCoef || 1, 2)}</span>
        <span class="tag-pill">Осн. склад: ${numberFormat(article.mainWarehouseStock || 0)}</span>
      </div>
    </div>
    <div class="article-summary">
      <div class="summary-block"><span>План / день</span><strong>${numberFormat(article.currentPlanDay || 0, 1)}</strong></div>
      <div class="summary-block"><span>Спрос / день</span><strong>${numberFormat(article.totalAdjustedCalc || 0, 1)}</strong></div>
      <div class="summary-block"><span>Запас в кластерах</span><strong>${numberFormat(article.totalStockCalc || 0)}</strong></div>
      <div class="summary-block"><span>Реком. отгрузка</span><strong>${numberFormat(article.totalNeedCalc || 0)}</strong></div>
    </div>
    <div class="summary-block">
      <span>Что сделать</span>
      <strong style="font-size:16px; line-height:1.35;">${escapeHtml(article.action || "—")}</strong>
      <div class="muted" style="margin-top:8px;">${escapeHtml(article.reason || "")}</div>
    </div>
    <div>
      <span style="display:block; margin-bottom:8px; color:var(--muted); font-size:12px; font-weight:700;">Топ кластеров по дефициту</span>
      <div class="cluster-mini-list">
        ${topClusters.map((metric) => `
          <div class="cluster-mini-item">
            <div>
              <strong>${escapeHtml(metric.cluster)}</strong>
              <div class="muted">Ост: ${numberFormat(metric.stock || 0)} · Об.: ${numberOrDash(metric.turnoverDaysCalc)}</div>
            </div>
            <div><span class="need-pill ${(metric.recommendedQtyCalc || 0) > 100 ? "need-high" : (metric.recommendedQtyCalc || 0) > 0 ? "need-mid" : "need-zero"}">${numberFormat(metric.recommendedQtyCalc || 0)}</span></div>
          </div>
        `).join("")}
      </div>
    </div>`;

  ninaEls.quickArticleSelect.value = article.sellerArticle;
  populateQuickClusters();
}

function populateArticleSelectors() {
  const rows = getPlatformData().rows;
  const options = rows.map((row) => `<option value="${escapeHtmlAttr(row.sellerArticle)}">${escapeHtml(row.sellerArticle)} · ${escapeHtml(row.name || "")}</option>`).join("");
  ninaEls.quickArticleSelect.innerHTML = options;
  ninaEls.orderArticleSelect.innerHTML = options;
  if (!ninaState.selectedArticle && rows.length) ninaState.selectedArticle = rows[0].sellerArticle;
  if (ninaState.selectedArticle) {
    ninaEls.quickArticleSelect.value = ninaState.selectedArticle;
    ninaEls.orderArticleSelect.value = ninaState.selectedArticle;
  }
}

function populateQuickClusters(selectedValue) {
  const row = getRowMap().get(ninaEls.quickArticleSelect.value);
  const clusters = (row?.clusterMetrics || []).map((metric) => metric.cluster).filter(Boolean);
  ninaEls.quickClusterSelect.innerHTML = clusters.map((cluster) => `<option value="${escapeHtmlAttr(cluster)}">${escapeHtml(cluster)}</option>`).join("");
  if (selectedValue) ninaEls.quickClusterSelect.value = selectedValue;
  fillQuickInputForm();
}

function fillQuickInputForm() {
  const article = ninaEls.quickArticleSelect.value;
  const cluster = ninaEls.quickClusterSelect.value;
  const entry = getManualEntry(ninaState.platform, article, cluster) || {};
  ninaEls.quickTransitInput.value = entry.inTransit ?? "";
  ninaEls.quickProductionInput.value = entry.production ?? "";
  ninaEls.quickProcurementInput.value = entry.procurement ?? "";
  ninaEls.quickTargetDaysInput.value = entry.targetDays ?? ninaState.targetDays[ninaState.platform] ?? 21;
  ninaEls.quickSeasonalityInput.value = entry.seasonalityOverride ?? "";
  ninaEls.quickCommentInput.value = entry.comment ?? "";
}

function saveQuickInput(event) {
  event.preventDefault();
  const article = ninaEls.quickArticleSelect.value;
  const cluster = ninaEls.quickClusterSelect.value;
  if (!article || !cluster) return;
  const payload = {
    inTransit: Number(ninaEls.quickTransitInput.value || 0) || 0,
    production: Number(ninaEls.quickProductionInput.value || 0) || 0,
    procurement: Number(ninaEls.quickProcurementInput.value || 0) || 0,
    targetDays: Number(ninaEls.quickTargetDaysInput.value || ninaState.targetDays[ninaState.platform] || 21) || 21,
    seasonalityOverride: ninaEls.quickSeasonalityInput.value === "" ? 0 : Number(ninaEls.quickSeasonalityInput.value || 0),
    comment: ninaEls.quickCommentInput.value.trim(),
    updatedAt: new Date().toISOString()
  };
  setManualEntry(ninaState.platform, article, cluster, payload);
  ninaState.selectedArticle = article;
  renderSummary();
  renderMatrix();
  renderSelectedCard();
  renderStockTable();
  renderTopDeficits();
  renderInputsTable();
  fillOrderRecommendation();
  showToast("Данные по кластеру сохранены.");
}

function clearQuickInput() {
  const article = ninaEls.quickArticleSelect.value;
  const cluster = ninaEls.quickClusterSelect.value;
  setManualEntry(ninaState.platform, article, cluster, null);
  fillQuickInputForm();
  renderSummary();
  renderMatrix();
  renderSelectedCard();
  renderStockTable();
  renderTopDeficits();
  renderInputsTable();
  fillOrderRecommendation();
  showToast("Данные по кластеру очищены.");
}

function renderStockTable() {
  const rows = getAllComputedRows();
  const flat = [];
  rows.forEach((row) => {
    row.clusterMetricsCalc.forEach((metric) => {
      flat.push({
        sellerArticle: row.sellerArticle,
        name: row.name,
        cluster: metric.cluster,
        orders7d: metric.orders7d,
        adjustedDailyCalc: metric.adjustedDailyCalc,
        stock: metric.stock,
        inTransit: metric.inTransit,
        production: metric.production,
        procurement: metric.procurement,
        turnover: metric.turnoverDaysCalc,
        need: metric.recommendedQtyCalc,
        mainWarehouseStock: row.mainWarehouseStock
      });
    });
  });
  flat.sort((a, b) => (b.need || 0) - (a.need || 0));
  ninaEls.stockBody.innerHTML = flat.length ? flat.map((item) => `
    <tr>
      <td>${escapeHtml(item.sellerArticle)}</td>
      <td>${escapeHtml(item.name || "")}</td>
      <td>${escapeHtml(item.cluster)}</td>
      <td class="num">${numberFormat(item.orders7d || 0, 1)}</td>
      <td class="num">${numberFormat(item.adjustedDailyCalc || 0, 1)}</td>
      <td class="num">${numberFormat(item.stock || 0)}</td>
      <td class="num">${numberFormat(item.inTransit || 0)}</td>
      <td class="num">${numberFormat(item.production || 0)}</td>
      <td class="num">${numberFormat(item.procurement || 0)}</td>
      <td class="num">${numberOrDash(item.turnover)}</td>
      <td class="num">${numberFormat(item.need || 0)}</td>
      <td class="num">${numberFormat(item.mainWarehouseStock || 0)}</td>
    </tr>`).join("") : `<tr><td colspan="12">Нет данных.</td></tr>`;
}

function populateOrderClusters(selectedValue) {
  const row = getRowMap().get(ninaEls.orderArticleSelect.value);
  const clusters = (row?.clusterMetrics || []).map((metric) => metric.cluster).filter(Boolean);
  ninaEls.orderClusterSelect.innerHTML = clusters.map((cluster) => `<option value="${escapeHtmlAttr(cluster)}">${escapeHtml(cluster)}</option>`).join("");
  if (selectedValue) ninaEls.orderClusterSelect.value = selectedValue;
  fillOrderRecommendation();
}

function fillOrderRecommendation() {
  const rowMap = getRowMap();
  const row = rowMap.get(ninaEls.orderArticleSelect.value);
  if (!row) return;
  const computed = computeRow(row);
  const metric = computed.clusterMetricsCalc.find((item) => item.cluster === ninaEls.orderClusterSelect.value) || computed.clusterMetricsCalc[0];
  const recommended = metric?.recommendedQtyCalc || 0;
  ninaEls.orderRecommendedInput.value = recommended;
  if (!ninaEls.orderQtyInput.value || Number(ninaEls.orderQtyInput.value) === 0) {
    ninaEls.orderQtyInput.value = recommended;
  }
  ninaEls.orderPrioritySelect.value = computed.priorityBucket || "medium";
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

function renderOrdersTable() {
  const rows = ninaState.orderRequests.filter((item) => item.platform === ninaState.platform);
  ninaEls.ordersBody.innerHTML = rows.length ? rows.map((item) => `
    <tr>
      <td>${escapeHtml(formatDateTime(item.createdAt))}</td>
      <td>${escapeHtml(item.platform)}</td>
      <td>${escapeHtml(item.sellerArticle)}</td>
      <td>${escapeHtml(item.cluster)}</td>
      <td class="num">${numberFormat(item.qty || 0)}</td>
      <td>${escapeHtml(sourceLabel(item.source))}</td>
      <td>${escapeHtml(item.eta || "—")}</td>
      <td>${escapeHtml(item.comment || "—")}</td>
    </tr>`).join("") : `<tr><td colspan="8">Пока нет сохраненных заявок.</td></tr>`;
}

function renderTopDeficits() {
  const rows = getAllComputedRows().filter((row) => row.totalNeedCalc > 0).sort((a, b) => (b.totalNeedCalc || 0) - (a.totalNeedCalc || 0)).slice(0, 20);
  ninaEls.topDeficitsList.innerHTML = rows.length ? rows.map((row) => `
    <button type="button" class="deficit-item" data-top-deficit="${escapeHtmlAttr(row.sellerArticle)}">
      <strong>${escapeHtml(row.sellerArticle)}</strong>
      <div>${escapeHtml(row.name || "")}</div>
      <div class="deficit-meta">
        <span class="priority-pill priority-${row.priorityBucket || "low"}">${escapeHtml(row.priorityLabel || "—")}</span>
        <span class="tag-pill">Нужно: ${numberFormat(row.totalNeedCalc || 0)}</span>
        <span class="tag-pill">Спрос/д: ${numberFormat(row.totalAdjustedCalc || 0, 1)}</span>
      </div>
    </button>`).join("") : `<div class="deficit-item">По текущим данным дефицитов нет.</div>`;

  ninaEls.topDeficitsList.querySelectorAll("[data-top-deficit]").forEach((button) => {
    button.addEventListener("click", () => {
      ninaState.selectedArticle = button.dataset.topDeficit;
      ninaEls.orderArticleSelect.value = ninaState.selectedArticle;
      populateOrderClusters();
      fillOrderRecommendation();
      switchPage("orders");
    });
  });
}

function renderInputsTable() {
  const rows = Object.entries(ninaState.manualInputs)
    .filter(([key]) => key.startsWith(`${ninaState.platform}__`))
    .map(([key, value]) => {
      const [, sellerArticle, cluster] = key.split("__");
      return { sellerArticle, cluster, ...value };
    })
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

  ninaEls.inputsBody.innerHTML = rows.length ? rows.map((item) => `
    <tr>
      <td>${escapeHtml(ninaState.platform)}</td>
      <td>${escapeHtml(item.sellerArticle)}</td>
      <td>${escapeHtml(item.cluster)}</td>
      <td class="num">${numberFormat(item.inTransit || 0)}</td>
      <td class="num">${numberFormat(item.production || 0)}</td>
      <td class="num">${numberFormat(item.procurement || 0)}</td>
      <td class="num">${numberFormat(item.targetDays || ninaState.targetDays[ninaState.platform] || 21)}</td>
      <td class="num">${numberFormat(item.seasonalityOverride || 0, 1)}</td>
      <td>${escapeHtml(item.comment || "—")}</td>
    </tr>`).join("") : `<tr><td colspan="9">Пока ручных данных нет.</td></tr>`;
}

function exportAllJson() {
  const payload = {
    exportedAt: new Date().toISOString(),
    manualInputs: ninaState.manualInputs,
    orderRequests: ninaState.orderRequests
  };
  downloadBlob(JSON.stringify(payload, null, 2), `tekstilno-nina-${Date.now()}.json`, "application/json");
}

function importAllJson(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(reader.result);
      ninaState.manualInputs = payload.manualInputs || {};
      ninaState.orderRequests = payload.orderRequests || [];
      localStorage.setItem("tekstilno-nina-manual-inputs-v1", JSON.stringify(ninaState.manualInputs));
      persistOrderRequests();
      renderAll();
      showToast("JSON успешно импортирован.");
    } catch (error) {
      showToast(`Не удалось прочитать JSON: ${error.message}`);
    }
  };
  reader.readAsText(file, "utf-8");
  event.target.value = "";
}

function exportStockCsv() {
  const rows = [];
  getAllComputedRows().forEach((row) => {
    row.clusterMetricsCalc.forEach((metric) => {
      rows.push([ninaState.platform, row.sellerArticle, row.name || "", metric.cluster, metric.orders7d || 0, metric.adjustedDailyCalc || 0, metric.stock || 0, metric.inTransit || 0, metric.production || 0, metric.procurement || 0, metric.turnoverDaysCalc || "", metric.recommendedQtyCalc || 0, row.mainWarehouseStock || 0]);
    });
  });
  downloadBlob(toCsv([["Платформа","Артикул","Товар","Кластер","7д","План/д","Запас","В пути","Производство","Закупка","Оборачиваемость","Нужно","Осн. склад"], ...rows]), `${slugify(ninaState.platform)}-cluster-stock.csv`, "text/csv;charset=utf-8");
}

function exportOrdersCsv() {
  const rows = ninaState.orderRequests.filter((item) => item.platform === ninaState.platform).map((item) => [formatDateTime(item.createdAt), item.platform, item.sellerArticle, item.cluster, item.recommendedQty || 0, item.qty || 0, sourceLabel(item.source), item.eta || "", item.comment || ""]);
  downloadBlob(toCsv([["Дата","Платформа","Артикул","Кластер","Реком.","Заказать","Источник","ETA","Комментарий"], ...rows]), `${slugify(ninaState.platform)}-orders.csv`, "text/csv;charset=utf-8");
}

function exportInputsCsv() {
  const rows = Object.entries(ninaState.manualInputs)
    .filter(([key]) => key.startsWith(`${ninaState.platform}__`))
    .map(([key, value]) => {
      const [, sellerArticle, cluster] = key.split("__");
      return [ninaState.platform, sellerArticle, cluster, value.inTransit || 0, value.production || 0, value.procurement || 0, value.targetDays || "", value.seasonalityOverride || 0, value.comment || ""];
    });
  downloadBlob(toCsv([["Платформа","Артикул","Кластер","В пути","Производство","Закупка","Целевые дни","Override","Комментарий"], ...rows]), `${slugify(ninaState.platform)}-inputs.csv`, "text/csv;charset=utf-8");
}

function toCsv(rows) {
  return rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
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
  return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(num);
}

function numberOrDash(value) {
  if (value == null || value === "") return "—";
  return numberFormat(value, 1);
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
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function slugify(value) {
  return String(value).toLowerCase().replace(/\s+/g, "-").replace(/[^a-zа-я0-9_-]+/gi, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeHtmlAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
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
  toastTimer = setTimeout(() => { ninaEls.toast.hidden = true; }, 2600);
}
