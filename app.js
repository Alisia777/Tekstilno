const state = {
  config: window.APP_CONFIG || {},
  data: {
    plan: null,
    clusters: null,
    history: null,
    historyIndex: {}
  },
  date: "",
  activeTab: "wb",
  filters: {
    wb: { pack: "current", priority: "all", status: "all", search: "", historyMetric: "orders", historyRange: 14 },
    ozon: { pack: "current", priority: "all", status: "all", search: "", historyMetric: "orders", historyRange: 14 },
    leader: { date: "", type: "all", manager: "all", source: "all" },
    supplies: { channel: "WB", sellerArticle: "", targetDays: 21 }
  },
  managerDrafts: loadStorage("tekstilno-v9-manager-drafts", {}),
  suppliesDrafts: loadStorage("tekstilno-v9-supplies-drafts", {}),
  localSubmissions: loadStorage("tekstilno-v9-local-submissions", []),
  remoteDashboard: { managerSubmissions: [], clusterForms: [] },
  selectedLeaderId: null
};

const MANAGER_TABS = {
  wb: { prefix: "wb", manager: "Анастасия", channel: "WB" },
  ozon: { prefix: "ozon", manager: "Ирина Паламарук", channel: "Ozon" }
};

const MANAGER_STATUS_OPTIONS = [
  { value: "not-started", label: "Не начато" },
  { value: "in-progress", label: "В работе" },
  { value: "done", label: "Сделано" },
  { value: "to-supply", label: "Передано в поставки" },
  { value: "blocked", label: "Блокер" },
  { value: "need-help", label: "Нужна помощь" }
];

const SUPPLY_STATUS_OPTIONS = [
  { value: "draft", label: "Черновик" },
  { value: "approved", label: "Согласовано" },
  { value: "production", label: "В производстве" },
  { value: "procurement", label: "В закупке" },
  { value: "in-transit", label: "В поставке" },
  { value: "done", label: "Закрыто" },
  { value: "blocked", label: "Блокер" }
];

const els = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  bindEvents();
  hydrateStaticUi();
  setInitialDate();
  await loadData();
  renderAll();
  await loadRemoteDashboard(false);
  renderLeaderView();
}

function cacheElements() {
  const ids = [
    "heroTitle", "storageModeBadge", "planFactBadge", "clusterBadge", "packSizeBadge", "banner",
    "globalReportDate",
    "wbResponsibilityBadge", "wbSourceBadge", "wbPackCard", "wbCountCard", "wbCriticalCard", "wbPlanOrdersCard", "wbFactOrdersCard", "wbDeltaOrdersCard", "wbPlanMarginCard", "wbSupplyCard", "wbPackFilter", "wbPriorityFilter", "wbStatusFilter", "wbSearchFilter", "wbPlanNote", "wbArticlesBody", "wbDayComment", "wbNeedHelp", "wbSaveBtn", "wbExportBtn", "wbSubmitBtn", "wbTrendChart", "wbTrendCaption", "wbDeviationList",
    "ozonResponsibilityBadge", "ozonSourceBadge", "ozonPackCard", "ozonCountCard", "ozonCriticalCard", "ozonPlanOrdersCard", "ozonFactOrdersCard", "ozonDeltaOrdersCard", "ozonPlanMarginCard", "ozonSupplyCard", "ozonPackFilter", "ozonPriorityFilter", "ozonStatusFilter", "ozonSearchFilter", "ozonPlanNote", "ozonArticlesBody", "ozonDayComment", "ozonNeedHelp", "ozonSaveBtn", "ozonExportBtn", "ozonSubmitBtn", "ozonTrendChart", "ozonTrendCaption", "ozonDeviationList",
    "suppliesChannel", "suppliesArticleSelect", "suppliesTargetDays", "suppliesCoordinator", "suppliesTitleCard", "suppliesMainStockCard", "suppliesPlatformStockCard", "suppliesDemandCard", "suppliesRecommendedCard", "suppliesRowsCard", "suppliesReasonCard", "suppliesActionCard", "suppliesSummaryMeta", "suppliesSummaryArticlesCard", "suppliesSummaryRowsCard", "suppliesSummaryDemandCard", "suppliesSummaryStockCard", "suppliesSummaryMainCard", "suppliesSummaryNeedCard", "suppliesSummaryCriticalCard", "suppliesSummaryBlockedCard", "suppliesTopDeficits", "suppliesAttentionList", "suppliesHint", "suppliesRowsBody", "suppliesSaveBtn", "suppliesExportBtn", "suppliesSubmitBtn",
    "leaderDateFilter", "leaderTypeFilter", "leaderManagerFilter", "leaderSourceFilter", "leaderTotalCard", "leaderManagerCard", "leaderClusterCard", "leaderIssuesCard", "leaderFeedBody", "leaderDetails", "leaderRefreshBtn", "leaderExportAllBtn", "leaderImportInput", "openSheetBtn",
    "toast"
  ];
  ids.forEach((id) => { els[id] = document.getElementById(id); });
  els.tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
  els.tabPanels = {
    wb: document.getElementById("tab-wb"),
    ozon: document.getElementById("tab-ozon"),
    supplies: document.getElementById("tab-supplies"),
    leader: document.getElementById("tab-leader")
  };
  els.openTabButtons = Array.from(document.querySelectorAll("[data-open-tab]"));
  els.historyMetricButtons = Array.from(document.querySelectorAll("[data-history-metric-value]"));
  els.historyRangeButtons = Array.from(document.querySelectorAll("[data-history-range-value]"));
}

function bindEvents() {
  els.tabButtons.forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
  els.openTabButtons.forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.openTab)));
  els.globalReportDate.addEventListener("change", handleGlobalDateChange);

  Object.keys(MANAGER_TABS).forEach((tabKey) => {
    const prefix = MANAGER_TABS[tabKey].prefix;
    els[`${prefix}PackFilter`].addEventListener("change", () => {
      state.filters[tabKey].pack = els[`${prefix}PackFilter`].value;
      renderManagerTable(tabKey);
      updateManagerSummary(tabKey);
    });
    els[`${prefix}PriorityFilter`].addEventListener("change", () => {
      state.filters[tabKey].priority = els[`${prefix}PriorityFilter`].value;
      renderManagerTable(tabKey);
    });
    els[`${prefix}StatusFilter`].addEventListener("change", () => {
      state.filters[tabKey].status = els[`${prefix}StatusFilter`].value;
      renderManagerTable(tabKey);
    });
    els[`${prefix}SearchFilter`].addEventListener("input", () => {
      state.filters[tabKey].search = els[`${prefix}SearchFilter`].value;
      renderManagerTable(tabKey);
    });

    els[`${prefix}ArticlesBody`].addEventListener("change", (event) => handleManagerTableChange(tabKey, event));
    els[`${prefix}ArticlesBody`].addEventListener("input", (event) => handleManagerTableInput(tabKey, event));
    els[`${prefix}DayComment`].addEventListener("input", () => {
      getManagerDraft(tabKey).dayComment = els[`${prefix}DayComment`].value;
      persistManagerDrafts();
    });
    els[`${prefix}NeedHelp`].addEventListener("input", () => {
      getManagerDraft(tabKey).needHelp = els[`${prefix}NeedHelp`].value;
      persistManagerDrafts();
    });

    els[`${prefix}SaveBtn`].addEventListener("click", () => {
      persistManagerDrafts();
      showToast(`Черновик ${MANAGER_TABS[tabKey].channel} сохранён.`);
    });
    els[`${prefix}ExportBtn`].addEventListener("click", () => exportManagerCurrent(tabKey));
    els[`${prefix}SubmitBtn`].addEventListener("click", () => submitManager(tabKey));
    if (els[`${prefix}DeviationList`]) {
      els[`${prefix}DeviationList`].addEventListener("click", (event) => handleDeviationJump(tabKey, event));
    }
  });

  els.historyMetricButtons.forEach((btn) => btn.addEventListener("click", () => {
    const tabKey = btn.dataset.tabKey;
    state.filters[tabKey].historyMetric = btn.dataset.historyMetricValue || "orders";
    renderManagerInsights(tabKey);
  }));
  els.historyRangeButtons.forEach((btn) => btn.addEventListener("click", () => {
    const tabKey = btn.dataset.tabKey;
    state.filters[tabKey].historyRange = Number(btn.dataset.historyRangeValue || 14);
    renderManagerInsights(tabKey);
  }));

  els.suppliesChannel.addEventListener("change", () => {
    state.filters.supplies.channel = els.suppliesChannel.value;
    state.filters.supplies.sellerArticle = "";
    renderSuppliesControls();
    renderSuppliesView();
  });
  els.suppliesArticleSelect.addEventListener("change", () => {
    state.filters.supplies.sellerArticle = els.suppliesArticleSelect.value;
    renderSuppliesView();
  });
  els.suppliesTargetDays.addEventListener("change", () => {
    state.filters.supplies.targetDays = Number(els.suppliesTargetDays.value || 21);
    const draft = getSuppliesDraft();
    draft.targetDays = state.filters.supplies.targetDays;
    persistSuppliesDrafts();
    renderSuppliesView();
  });
  els.suppliesCoordinator.addEventListener("input", () => {
    const draft = getSuppliesDraft();
    draft.coordinator = els.suppliesCoordinator.value;
    persistSuppliesDrafts();
  });
  els.suppliesRowsBody.addEventListener("change", handleSuppliesRowsChange);
  els.suppliesRowsBody.addEventListener("input", handleSuppliesRowsInput);
  els.suppliesTopDeficits?.addEventListener("click", handleSuppliesArticleJump);
  els.suppliesAttentionList?.addEventListener("click", handleSuppliesArticleJump);
  els.suppliesSaveBtn.addEventListener("click", () => {
    persistSuppliesDrafts();
    showToast("Черновик поставок сохранён.");
  });
  els.suppliesExportBtn.addEventListener("click", exportSuppliesCurrent);
  els.suppliesSubmitBtn.addEventListener("click", submitSupplies);

  els.leaderDateFilter.addEventListener("change", () => {
    state.filters.leader.date = els.leaderDateFilter.value;
    renderLeaderView();
  });
  els.leaderTypeFilter.addEventListener("change", () => {
    state.filters.leader.type = els.leaderTypeFilter.value;
    renderLeaderView();
  });
  els.leaderManagerFilter.addEventListener("change", () => {
    state.filters.leader.manager = els.leaderManagerFilter.value;
    renderLeaderView();
  });
  els.leaderSourceFilter.addEventListener("change", () => {
    state.filters.leader.source = els.leaderSourceFilter.value;
    renderLeaderView();
  });
  els.leaderFeedBody.addEventListener("click", handleLeaderFeedClick);
  els.leaderRefreshBtn.addEventListener("click", async () => {
    await loadRemoteDashboard(true);
    renderLeaderView();
  });
  els.leaderExportAllBtn.addEventListener("click", exportAllData);
  els.leaderImportInput.addEventListener("change", importAllData);
  els.openSheetBtn.addEventListener("click", () => {
    if (state.config.googleSheetUrl) {
      window.open(state.config.googleSheetUrl, "_blank", "noopener");
    }
  });
}

function hydrateStaticUi() {
  els.heroTitle.textContent = `${state.config.organizationName || "Текстильно"} — прозрачные задачи по артикулам`;
  els.storageModeBadge.textContent = state.config.appsScriptUrl ? "Apps Script + локально" : "локально";
  els.packSizeBadge.textContent = `${state.config.packSize || 20} артикулов`;
  if (!state.config.googleSheetUrl) {
    els.openSheetBtn.classList.add("hidden");
  }
}

function setInitialDate() {
  const today = new Date();
  const value = formatDateInput(today);
  state.date = value;
  state.filters.leader.date = value;
  els.globalReportDate.value = value;
  els.leaderDateFilter.value = value;
  els.suppliesTargetDays.value = state.filters.supplies.targetDays;
}

async function loadData() {
  setBanner("Загружаю план/факт по артикулам, кластера и дневную историю…", "info");
  try {
    const historyPromise = state.config.historyDataUrl
      ? fetchJson(versionedUrl(state.config.historyDataUrl)).catch((error) => {
          console.warn("historyDataUrl:", error);
          return null;
        })
      : Promise.resolve(null);

    const [plan, clusters, history] = await Promise.all([
      fetchJson(versionedUrl(state.config.planDataUrl)),
      fetchJson(versionedUrl(state.config.clusterDataUrl)),
      historyPromise
    ]);

    state.data.plan = plan;
    state.data.clusters = clusters;
    state.data.history = history;
    state.data.historyIndex = history?.dates
      ? Object.fromEntries(history.dates.map((dateStr, index) => [dateStr, index]))
      : {};

    const wbStats = countMatchedPlan("wb");
    const ozonStats = countMatchedPlan("ozon");
    els.planFactBadge.textContent = `WB ${wbStats.matched}/${wbStats.total} · Ozon ${ozonStats.matched}/${ozonStats.total}`;
    els.clusterBadge.textContent = `${(clusters.wbRows || []).length} WB / ${(clusters.ozonRows || []).length} Ozon`;

    const historyNote = history
      ? ` Дневной график подключён: WB — ${history.wb?.sourceMode || "оценка"}, Ozon — ${history.ozon?.sourceMode || "факт"}.`
      : " График строится по текущему среднему, без отдельной дневной истории.";
    setBanner("Данные загружены. Менеджеры отмечают только статусы и комментарии, план/факт уже подставлен." + historyNote, "success");
  } catch (error) {
    console.error(error);
    setBanner(`Ошибка загрузки данных: ${error.message}`, "error");
  }
}

async function loadRemoteDashboard(showMessage) {
  if (!state.config.appsScriptUrl) {
    state.remoteDashboard = { managerSubmissions: [], clusterForms: [] };
    if (showMessage) {
      showToast("Apps Script пока не подключён. В журнале доступны локальные записи и импорт JSON.");
    }
    return;
  }

  try {
    const url = `${state.config.appsScriptUrl}?action=getDashboard&date=${encodeURIComponent(state.date)}&days=45`;
    const payload = await loadJsonp(url);
    state.remoteDashboard = {
      managerSubmissions: Array.isArray(payload.managerSubmissions) ? payload.managerSubmissions : [],
      clusterForms: Array.isArray(payload.clusterForms) ? payload.clusterForms : []
    };
    if (showMessage) {
      showToast("Журнал Apps Script обновлён.");
    }
  } catch (error) {
    console.error(error);
    if (showMessage) {
      showToast(`Не удалось обновить Apps Script: ${error.message}`);
    }
  }
}

function renderAll() {
  renderManagerPanel("wb");
  renderManagerPanel("ozon");
  renderSuppliesControls();
  renderSuppliesView();
  renderLeaderFilters();
  renderLeaderView();
}

function switchTab(tab) {
  state.activeTab = tab;
  els.tabButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
  Object.entries(els.tabPanels).forEach(([key, panel]) => panel.classList.toggle("active", key === tab));
}

function handleGlobalDateChange() {
  state.date = els.globalReportDate.value;
  state.filters.leader.date = state.date;
  els.leaderDateFilter.value = state.date;
  renderManagerPanel("wb");
  renderManagerPanel("ozon");
  renderSuppliesControls();
  renderSuppliesView();
  renderLeaderView();
}

function renderManagerPanel(tabKey) {
  if (!state.data.plan) return;
  const meta = MANAGER_TABS[tabKey];
  const managerData = getManagerData(tabKey);
  if (!managerData) return;

  els[`${meta.prefix}ResponsibilityBadge`].textContent = managerData.role || meta.manager;
  els[`${meta.prefix}SourceBadge`].textContent = managerData.sourceLabel ? `Источник: ${managerData.sourceLabel}` : `Источник: ${state.data.plan.sourceFiles.articleAnalysis}`;

  populatePackFilter(tabKey);
  const draft = getManagerDraft(tabKey);
  els[`${meta.prefix}DayComment`].value = draft.dayComment || "";
  els[`${meta.prefix}NeedHelp`].value = draft.needHelp || "";

  renderManagerTable(tabKey);
  updateManagerSummary(tabKey);
}

function populatePackFilter(tabKey) {
  const meta = MANAGER_TABS[tabKey];
  const select = els[`${meta.prefix}PackFilter`];
  const managerData = getManagerData(tabKey);
  const totalPacks = getTotalPacks(managerData);
  const currentPack = getCurrentPackNumber(managerData, state.date);
  const currentValue = state.filters[tabKey].pack || "current";

  const options = [
    { value: "current", label: `Текущий пакет: ${currentPack}` },
    { value: "all", label: "Все пакеты" }
  ];
  for (let i = 1; i <= totalPacks; i += 1) {
    options.push({ value: String(i), label: `Пакет ${i}` });
  }

  select.innerHTML = options.map((opt) => `<option value="${opt.value}">${escapeHtml(opt.label)}</option>`).join("");
  select.value = options.some((opt) => opt.value === currentValue) ? currentValue : "current";
  state.filters[tabKey].pack = select.value;
}

function renderManagerTable(tabKey) {
  const meta = MANAGER_TABS[tabKey];
  const body = els[`${meta.prefix}ArticlesBody`];
  const articles = getFilteredManagerArticles(tabKey);

  if (!articles.length) {
    body.innerHTML = `<tr><td colspan="6"><div class="empty-state">По текущим фильтрам ничего не найдено.</div></td></tr>`;
    return;
  }

  body.innerHTML = articles.map((article) => renderManagerRow(tabKey, article)).join("");
}

function renderManagerRow(tabKey, article) {
  const draftRow = getManagerDraftRow(tabKey, article.sellerArticle);
  const plan = getArticlePlan(article, state.date);
  const fact = article.metrics || {};
  const delta = getArticleDelta(article, state.date);
  const rowTone = delta !== null && delta < 0 ? "alert-row" : "";
  const priorityClass = priorityClassName(article.priorityBucket);
  const shortAction = firstSentence(article.action || "Задача не задана", 160);
  const shortReason = clipText(article.reason || "—", 180);
  const tags = Array.isArray(article.tags) ? article.tags.slice(0, 3) : [];
  const deltaClass = delta === null ? "" : delta < 0 ? "negative" : "positive";
  const factMoneyLabel = fact.factMoneyLabel || "Факт ₽ / день";

  const metricsHtml = `
    <div class="metrics-grid">
      <span class="metric-chip"><span>План</span><strong>${fmtNumber(plan?.planOrdersDay)}</strong></span>
      <span class="metric-chip"><span>Факт</span><strong>${fmtNumber(fact.factOrdersDay)}</strong></span>
      <span class="metric-chip ${deltaClass}"><span>Δ</span><strong>${fmtSignedNumber(delta)}</strong></span>
      <span class="metric-chip"><span>МП</span><strong>${fmtInt(fact.mpStock)}</strong></span>
      <span class="metric-chip ${isNumber(fact.coverageDays) && fact.coverageDays < 15 ? "warn" : ""}"><span>Покр.</span><strong>${fmtNumber(fact.coverageDays)} дн</strong></span>
      <span class="metric-chip"><span>Нужно</span><strong>${fmtInt(fact.supplyNeed)}</strong></span>
    </div>
    <div class="metric-footnote">${escapeHtml(factMoneyLabel)}: ${fmtMoney(fact.factMoneyDay)} · План выручки: ${fmtMoney(plan?.planRevenueDay)} · План маржи: ${fmtMoney(plan?.planMarginIncomeDay)}</div>
  `;

  return `
    <tr class="article-row ${rowTone}" data-seller-article="${escapeHtml(article.sellerArticle)}">
      <td><span class="priority-pill ${priorityClass}">${escapeHtml(article.priorityLabel || "—")}</span></td>
      <td class="article-cell">
        <strong>${escapeHtml(article.sellerArticle || "—")}</strong>
        <div class="article-meta">${escapeHtml(article.name || "Без названия")}</div>
        <div class="article-meta">${escapeHtml(article.platformArticleLabel || article.channel + " ID")}: ${escapeHtml(displayPlatformArticle(article) || "—")} · ${escapeHtml(article.category || "")}</div>
      </td>
      <td class="task-cell">
        <div class="task-title">${escapeHtml(shortAction)}</div>
        <div class="task-subline">${escapeHtml(shortReason)}</div>
        ${tags.length ? `<div class="tag-row">${tags.map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
        <details class="inline-details">
          <summary>подробнее</summary>
          <div>
            <div class="muted"><strong>Что сделать:</strong> ${escapeHtml(article.action || "—")}</div>
            <div class="muted" style="margin-top:6px"><strong>Почему:</strong> ${escapeHtml(article.reason || "—")}</div>
          </div>
        </details>
      </td>
      <td class="metrics-cell">${metricsHtml}</td>
      <td>
        <select class="status-select article-status" data-seller-article="${escapeHtml(article.sellerArticle)}">
          ${MANAGER_STATUS_OPTIONS.map((opt) => `<option value="${opt.value}" ${draftRow.status === opt.value ? "selected" : ""}>${escapeHtml(opt.label)}</option>`).join("")}
        </select>
      </td>
      <td>
        <textarea class="row-input article-comment" data-seller-article="${escapeHtml(article.sellerArticle)}" rows="3" placeholder="Что сделано / результат / что дальше">${escapeHtml(draftRow.comment || "")}</textarea>
      </td>
    </tr>
  `;
}

function updateManagerSummary(tabKey) {
  const meta = MANAGER_TABS[tabKey];
  const prefix = meta.prefix;
  const scopedArticles = getScopedManagerArticles(tabKey);
  const matched = scopedArticles.filter((article) => getArticlePlan(article, state.date)).length;
  const critical = scopedArticles.filter((article) => article.priorityBucket === "critical").length;
  const planOrders = sum(scopedArticles.map((article) => getArticlePlan(article, state.date)?.planOrdersDay));
  const factOrders = sum(scopedArticles.map((article) => article.metrics?.factOrdersDay));
  const planMargin = sum(scopedArticles.map((article) => getArticlePlan(article, state.date)?.planMarginIncomeDay));
  const supplyNeed = sum(scopedArticles.map((article) => article.metrics?.supplyNeed));
  const delta = isNumber(planOrders) && isNumber(factOrders) ? round2(factOrders - planOrders) : null;
  const packLabel = describePackSelection(tabKey);

  els[`${prefix}PackCard`].textContent = packLabel;
  els[`${prefix}CountCard`].textContent = String(scopedArticles.length);
  els[`${prefix}CriticalCard`].textContent = String(critical);
  els[`${prefix}PlanOrdersCard`].textContent = fmtNumber(planOrders);
  els[`${prefix}FactOrdersCard`].textContent = fmtNumber(factOrders);
  els[`${prefix}DeltaOrdersCard`].textContent = fmtSignedNumber(delta);
  els[`${prefix}PlanMarginCard`].textContent = fmtMoney(planMargin);
  els[`${prefix}SupplyCard`].textContent = `${fmtInt(supplyNeed)} шт`;
  els[`${prefix}PlanNote`].textContent = `План ${monthLabelFromDate(state.date)} найден по ${matched}/${scopedArticles.length} артикулам выбранного пакета.`;

  const deltaCard = els[`${prefix}DeltaOrdersCard`]?.closest('.delta-card') || els[`${prefix}DeltaOrdersCard`]?.closest('.card');
  if (deltaCard) {
    deltaCard.dataset.tone = delta === null ? 'neutral' : delta < 0 ? 'negative' : 'positive';
  }

  renderManagerInsights(tabKey);
}

function renderManagerInsights(tabKey) {
  syncHistoryControls(tabKey);
  renderTrendChart(tabKey);
  renderTopDeviationList(tabKey);
}

function syncHistoryControls(tabKey) {
  els.historyMetricButtons.forEach((btn) => {
    const active = btn.dataset.tabKey === tabKey && btn.dataset.historyMetricValue === String(state.filters[tabKey].historyMetric || "orders");
    btn.classList.toggle("active", active);
  });
  els.historyRangeButtons.forEach((btn) => {
    const active = btn.dataset.tabKey === tabKey && Number(btn.dataset.historyRangeValue || 14) === Number(state.filters[tabKey].historyRange || 14);
    btn.classList.toggle("active", active);
  });
}

function renderTrendChart(tabKey) {
  const meta = MANAGER_TABS[tabKey];
  const chartEl = els[`${meta.prefix}TrendChart`];
  const captionEl = els[`${meta.prefix}TrendCaption`];
  if (!chartEl || !captionEl) return;

  const metric = state.filters[tabKey].historyMetric || "orders";
  const range = Number(state.filters[tabKey].historyRange || 14);
  const series = buildDailySeries(tabKey, metric, range);

  if (!series || !series.points.length) {
    chartEl.innerHTML = `<div class="chart-empty">Недостаточно данных для графика.</div>`;
    captionEl.textContent = "Как только в истории появятся дневные данные, здесь будет линия план / факт по датам.";
    return;
  }

  chartEl.innerHTML = buildTrendSvg(series.points, { metric, sourceMode: series.sourceMode });

  const totalPlan = sum(series.points.map((point) => point.plan)) || 0;
  const totalFact = sum(series.points.map((point) => point.fact)) || 0;
  const delta = round2(totalFact - totalPlan);
  const diffText = delta === 0
    ? "на уровне плана"
    : `${delta < 0 ? "ниже" : "выше"} плана на ${formatMetric(metric, Math.abs(delta))}`;
  const sourceText = series.sourceMode === "actual-daily-orders"
    ? "факт по дням"
    : series.sourceMode === "rolling-7d-estimate"
      ? "факт по 7д среднему"
      : "факт по текущему среднему";
  const lagText = state.date > series.endDate ? ` Данные пока доступны до ${formatDateRuShort(series.endDate)}.` : "";
  captionEl.textContent = `${metric === "orders" ? "Заказы" : "Выручка"} за ${range} дн.: план ${formatMetric(metric, totalPlan)} · факт ${formatMetric(metric, totalFact)} · ${diffText}. Источник: ${sourceText}.${lagText}`;
}

function buildDailySeries(tabKey, metric, range) {
  const articles = getScopedManagerArticles(tabKey);
  const endDate = getEffectiveHistoryEndDate(tabKey);
  if (!articles.length || !endDate) return null;

  const dates = getDateWindow(endDate, range);
  const points = dates.map((dateStr) => {
    const dateObj = new Date(`${dateStr}T00:00:00`);
    const plan = round2(articles.reduce((acc, article) => acc + getDailyPlanMetric(article, dateStr, metric), 0));
    const fact = round2(articles.reduce((acc, article) => acc + getDailyFactMetric(tabKey, article, dateStr, metric), 0));
    return {
      label: dateShortLabel(dateStr),
      fullLabel: dateStr,
      plan,
      fact,
      weekend: !isBusinessDay(dateObj)
    };
  });

  const hasMeaningfulData = points.some((point) => point.plan > 0 || point.fact > 0);
  if (!hasMeaningfulData) return null;

  return {
    points,
    endDate,
    sourceMode: getHistoryTabData(tabKey)?.sourceMode || "fallback-average"
  };
}

function getHistoryTabData(tabKey) {
  return state.data.history?.[tabKey] || null;
}

function getEffectiveHistoryEndDate(tabKey) {
  const availableThrough = getHistoryTabData(tabKey)?.availableThrough || state.date;
  if (!state.date) return availableThrough || null;
  if (!availableThrough) return state.date;
  return state.date < availableThrough ? state.date : availableThrough;
}

function getDateWindow(endDateStr, count) {
  if (!endDateStr || !count) return [];
  const endDate = new Date(`${endDateStr}T00:00:00`);
  const dates = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const cursor = new Date(endDate);
    cursor.setDate(cursor.getDate() - offset);
    dates.push(formatDateInput(cursor));
  }
  return dates;
}

function getDailyPlanMetric(article, dateStr, metric) {
  const plan = getArticlePlan(article, dateStr);
  if (!plan) return 0;
  const dateObj = new Date(`${dateStr}T00:00:00`);
  if (!isBusinessDay(dateObj)) return 0;
  if (metric === "revenue") return asNumber(plan.planRevenueDay) || 0;
  return asNumber(plan.planOrdersDay) || 0;
}

function getDailyFactMetric(tabKey, article, dateStr, metric) {
  const historyValue = getHistoryValue(tabKey, article.sellerArticle, dateStr, metric);
  if (historyValue !== undefined) return historyValue;
  if (metric === "revenue") return asNumber(article.metrics?.factMoneyDay) || 0;
  return asNumber(article.metrics?.factOrdersDay) || 0;
}

function getHistoryValue(tabKey, sellerArticle, dateStr, metric) {
  const tabData = getHistoryTabData(tabKey);
  const historyIndex = state.data.historyIndex || {};
  const idx = historyIndex[dateStr];
  if (!tabData || idx === undefined) return undefined;
  const series = tabData.articles?.[sellerArticle]?.[metric];
  if (!Array.isArray(series)) return undefined;
  const raw = series[idx];
  const value = asNumber(raw);
  return value === null ? undefined : value;
}

function buildTrendSvg(points, options = {}) {
  if (!points.length) {
    return `<div class="chart-empty">Нет точек для графика.</div>`;
  }

  const metric = options.metric || "orders";
  const width = 760;
  const height = 250;
  const left = 56;
  const right = 20;
  const top = 18;
  const bottom = 34;
  const innerW = width - left - right;
  const innerH = height - top - bottom;
  const maxY = Math.max(...points.flatMap((point) => [point.plan, point.fact]), 1);
  const niceMax = metric === "revenue"
    ? Math.ceil(maxY / 5000) * 5000 || 5000
    : Math.ceil(maxY / 10) * 10 || 10;
  const yTicks = 4;
  const xStep = points.length > 1 ? innerW / (points.length - 1) : innerW;

  const scaleY = (value) => top + innerH - (value / niceMax) * innerH;
  const scaleX = (index) => left + index * xStep;
  const labelStep = points.length <= 10 ? 1 : points.length <= 18 ? 2 : 3;

  const planPath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${scaleX(index).toFixed(2)} ${scaleY(point.plan).toFixed(2)}`).join(" ");
  const factPath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${scaleX(index).toFixed(2)} ${scaleY(point.fact).toFixed(2)}`).join(" ");
  const factAreaPath = `${factPath} L ${scaleX(points.length - 1).toFixed(2)} ${height - bottom} L ${scaleX(0).toFixed(2)} ${height - bottom} Z`;

  const weekendBands = points.map((point, index) => {
    if (!point.weekend) return "";
    const bandWidth = points.length > 1 ? xStep : innerW;
    const x = scaleX(index) - bandWidth / 2;
    return `<rect class="trend-weekend" x="${x}" y="${top}" width="${bandWidth}" height="${innerH}" />`;
  }).join("");

  const gridLines = Array.from({ length: yTicks + 1 }, (_, idx) => {
    const value = niceMax * (idx / yTicks);
    const y = scaleY(value);
    return `<g><line class="trend-grid" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" /><text x="12" y="${y + 4}">${escapeHtml(formatAxisMetric(metric, value))}</text></g>`;
  }).join("");

  const xLabels = points.map((point, index) => {
    if (index % labelStep !== 0 && index !== points.length - 1) return "";
    const x = scaleX(index);
    return `<text x="${x}" y="${height - 12}" text-anchor="middle">${escapeHtml(point.label)}</text>`;
  }).join("");

  const factPoints = points.map((point, index) => {
    const x = scaleX(index);
    const y = scaleY(point.fact);
    return `<circle class="trend-point-fact" cx="${x}" cy="${y}" r="3.5"><title>${escapeHtml(`${point.fullLabel}: факт ${formatMetric(metric, point.fact)}`)}</title></circle>`;
  }).join("");
  const planPoints = points.map((point, index) => {
    const x = scaleX(index);
    const y = scaleY(point.plan);
    return `<circle class="trend-point-plan" cx="${x}" cy="${y}" r="3"><title>${escapeHtml(`${point.fullLabel}: план ${formatMetric(metric, point.plan)}`)}</title></circle>`;
  }).join("");

  return `
    <svg class="trend-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="План и факт по дням">
      <defs>
        <linearGradient id="factAreaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#d65f73" />
          <stop offset="100%" stop-color="#d65f73" stop-opacity="0" />
        </linearGradient>
      </defs>
      ${weekendBands}
      ${gridLines}
      <line class="trend-axis" x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}" />
      <path class="trend-fact-area" d="${factAreaPath}" />
      <path class="trend-plan" d="${planPath}" />
      <path class="trend-fact" d="${factPath}" />
      ${planPoints}
      ${factPoints}
      <g transform="translate(${left}, 16)">
        <line x1="0" y1="0" x2="20" y2="0" class="trend-plan"></line>
        <text class="legend-label" x="28" y="4">План</text>
        <line x1="92" y1="0" x2="112" y2="0" class="trend-fact"></line>
        <text class="legend-label" x="120" y="4">Факт</text>
      </g>
      ${xLabels}
    </svg>
  `;
}

function formatMetric(metric, value) {
  return metric === "revenue" ? fmtMoney(value) : fmtNumber(value);
}

function formatAxisMetric(metric, value) {
  const abs = Math.abs(value);
  if (metric === "revenue") {
    if (abs >= 1000000) return `${fmtNumber(round2(value / 1000000))}м`;
    if (abs >= 1000) return `${fmtNumber(round2(value / 1000))}к`;
    return fmtInt(value);
  }
  if (abs >= 1000) {
    return new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  }
  return fmtNumber(value);
}

function formatDateRuShort(dateStr) {
  if (!dateStr) return "";
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" }).format(date);
}

function renderTopDeviationList(tabKey) {
  const meta = MANAGER_TABS[tabKey];
  const listEl = els[`${meta.prefix}DeviationList`];
  if (!listEl) return;

  const managerData = getManagerData(tabKey);
  const currentPack = getCurrentPackNumber(managerData, state.date);
  const range = Number(state.filters[tabKey].historyRange || 14);
  const dates = getDateWindow(getEffectiveHistoryEndDate(tabKey), range);

  const rows = (managerData?.articles || [])
    .map((article) => {
      const planTotal = round2(dates.reduce((acc, dateStr) => acc + getDailyPlanMetric(article, dateStr, "orders"), 0));
      const factTotal = round2(dates.reduce((acc, dateStr) => acc + getDailyFactMetric(tabKey, article, dateStr, "orders"), 0));
      const gap = round2(planTotal - factTotal);
      if (!isNumber(planTotal) || planTotal <= 0 || !isNumber(gap) || gap <= 0) return null;

      return {
        article,
        gap,
        ratio: planTotal ? round2((gap / planTotal) * 100) : null,
        packLabel: Number(article.packNumber || 1) === Number(currentPack) ? "в текущем пакете" : `пакет ${article.packNumber || 1}`,
        current: Number(article.packNumber || 1) === Number(currentPack),
        planTotal,
        factTotal
      };
    })
    .filter(Boolean);

  const outsideCurrent = rows
    .filter((row) => !row.current)
    .sort((a, b) => b.gap - a.gap);
  const insideCurrent = rows
    .filter((row) => row.current)
    .sort((a, b) => b.gap - a.gap);
  const ranked = outsideCurrent.concat(insideCurrent).slice(0, 5);

  if (!ranked.length) {
    listEl.innerHTML = `<div class="empty-state">Сильных отклонений ниже плана не найдено.</div>`;
    return;
  }

  listEl.innerHTML = ranked.map((row, index) => `
    <button type="button" class="deviation-item" data-jump-article="${escapeAttr(row.article.sellerArticle)}" data-pack="${escapeAttr(row.article.packNumber || 1)}">
      <span class="rank-badge">${index + 1}</span>
      <div class="deviation-main">
        <strong>${escapeHtml(row.article.sellerArticle)}</strong>
        <small>${escapeHtml(row.article.name || "Без названия")}</small>
        <div class="deviation-meta">
          <span class="mini-chip">План ${range}д <b>${fmtNumber(row.planTotal)}</b></span>
          <span class="mini-chip">Факт ${range}д <b>${fmtNumber(row.factTotal)}</b></span>
          <span class="mini-chip negative">-${fmtNumber(row.gap)}</span>
          <span class="mini-chip">${fmtInt(row.article.metrics?.supplyNeed)} шт к допоставке</span>
        </div>
      </div>
      <span class="deviation-pack">${escapeHtml(row.packLabel)}</span>
    </button>
  `).join("");
}

function handleDeviationJump(tabKey, event) {
  const button = event.target.closest('[data-jump-article]');
  if (!button) return;
  const meta = MANAGER_TABS[tabKey];
  const article = button.dataset.jumpArticle;
  const pack = button.dataset.pack || 'current';
  state.filters[tabKey].pack = String(pack);
  state.filters[tabKey].search = article;
  if (els[`${meta.prefix}PackFilter`]) {
    populatePackFilter(tabKey);
    els[`${meta.prefix}PackFilter`].value = String(pack);
  }
  if (els[`${meta.prefix}SearchFilter`]) {
    els[`${meta.prefix}SearchFilter`].value = article;
  }
  renderManagerTable(tabKey);
  updateManagerSummary(tabKey);
  showToast(`Открыт артикул ${article}.`);
}

function getRecentBusinessDays(dateStr, count) {
  const result = [];
  const cursor = new Date(`${dateStr}T00:00:00`);
  while (result.length < count) {
    if (isBusinessDay(cursor)) {
      result.unshift(formatDateInput(cursor));
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return result;
}

function dateShortLabel(dateStr) {
  if (!dateStr) return '';
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' }).format(date);
}

function handleManagerTableChange(tabKey, event) {
  const sellerArticle = event.target.dataset.sellerArticle;
  if (!sellerArticle) return;
  const draftRow = getManagerDraftRow(tabKey, sellerArticle);

  if (event.target.classList.contains("article-status")) {
    draftRow.status = event.target.value;
    persistManagerDrafts();
    updateManagerSummary(tabKey);
  }
}

function handleManagerTableInput(tabKey, event) {
  const sellerArticle = event.target.dataset.sellerArticle;
  if (!sellerArticle) return;
  const draftRow = getManagerDraftRow(tabKey, sellerArticle);

  if (event.target.classList.contains("article-comment")) {
    draftRow.comment = event.target.value;
    persistManagerDrafts();
  }
}

function getManagerData(tabKey) {
  const managerName = MANAGER_TABS[tabKey].manager;
  return state.data.plan?.managers?.[managerName] || null;
}

function getTotalPacks(managerData) {
  const values = (managerData?.articles || []).map((item) => Number(item.packNumber || 1));
  return values.length ? Math.max(...values) : 1;
}

function getCurrentPackNumber(managerData, dateStr) {
  const totalPacks = getTotalPacks(managerData);
  if (!totalPacks) return 1;
  const anchor = state.data.plan?.cycleAnchorDate || dateStr;
  const diff = businessDaysDiff(anchor, dateStr);
  const mod = ((diff % totalPacks) + totalPacks) % totalPacks;
  return mod + 1;
}

function getScopedManagerArticles(tabKey) {
  const managerData = getManagerData(tabKey);
  const allArticles = managerData?.articles || [];
  const packValue = state.filters[tabKey].pack;
  const currentPack = getCurrentPackNumber(managerData, state.date);

  if (packValue === "all") return allArticles;
  const packNo = packValue === "current" ? currentPack : Number(packValue || currentPack);
  return allArticles.filter((item) => Number(item.packNumber || 1) === packNo);
}

function getFilteredManagerArticles(tabKey) {
  const filter = state.filters[tabKey];
  return getScopedManagerArticles(tabKey).filter((article) => {
    const draftRow = getManagerDraftRow(tabKey, article.sellerArticle);
    if (filter.priority !== "all" && article.priorityBucket !== filter.priority) return false;
    if (filter.status !== "all" && draftRow.status !== filter.status) return false;
    if (filter.search) {
      const haystack = `${article.sellerArticle} ${article.name} ${article.action}`.toLowerCase();
      if (!haystack.includes(filter.search.toLowerCase())) return false;
    }
    return true;
  });
}

function describePackSelection(tabKey) {
  const managerData = getManagerData(tabKey);
  const totalPacks = getTotalPacks(managerData);
  const currentPack = getCurrentPackNumber(managerData, state.date);
  const value = state.filters[tabKey].pack;
  if (value === "all") return `Все (${totalPacks})`;
  if (value === "current") return `${currentPack} / ${totalPacks}`;
  return `${value} / ${totalPacks}`;
}

function getArticlePlan(article, dateStr) {
  const ym = (dateStr || "").slice(0, 7);
  if (article?.monthlyPlan?.[ym]) return article.monthlyPlan[ym];
  if (article?.monthlyPlan?.["2026-04"]) return article.monthlyPlan["2026-04"];
  return null;
}

function getManagerDraft(tabKey) {
  const meta = MANAGER_TABS[tabKey];
  const key = `${meta.manager}|${state.date}`;
  if (!state.managerDrafts[key]) {
    state.managerDrafts[key] = {
      reportDate: state.date,
      manager: meta.manager,
      channel: meta.channel,
      dayComment: "",
      needHelp: "",
      articles: {}
    };
  }
  return state.managerDrafts[key];
}

function getManagerDraftRow(tabKey, sellerArticle) {
  const draft = getManagerDraft(tabKey);
  if (!draft.articles[sellerArticle]) {
    draft.articles[sellerArticle] = { status: "not-started", comment: "" };
  }
  return draft.articles[sellerArticle];
}

function persistManagerDrafts() {
  saveStorage("tekstilno-v9-manager-drafts", state.managerDrafts);
}

function exportManagerCurrent(tabKey) {
  const payload = buildManagerPayload(tabKey);
  downloadJson(payload, `manager-${payload.channel.toLowerCase()}-${payload.reportDate}.json`);
}

async function submitManager(tabKey) {
  const payload = buildManagerPayload(tabKey);
  const entry = {
    id: payload.id,
    type: "manager",
    manager: payload.manager,
    channel: payload.channel,
    reportDate: payload.reportDate,
    submittedAt: payload.submittedAt,
    summary: payload.sourceSummary,
    source: "local",
    payload
  };
  state.localSubmissions.unshift(entry);
  trimLocalSubmissions();
  persistLocalSubmissions();
  renderLeaderFilters();
  renderLeaderView();

  if (state.config.appsScriptUrl) {
    try {
      await postToAppsScript({ action: "submitManagerReport", id: payload.id, payload });
      showToast(`Пакет ${payload.channel} сдан и отправлен в Apps Script.`);
    } catch (error) {
      console.error(error);
      showToast(`Пакет сохранён локально, но Apps Script не ответил.`);
    }
  } else {
    showToast(`Пакет ${payload.channel} сохранён локально. Для общей видимости подключи Apps Script.`);
  }
}

function buildManagerPayload(tabKey) {
  const meta = MANAGER_TABS[tabKey];
  const draft = getManagerDraft(tabKey);
  const articles = getScopedManagerArticles(tabKey);
  const packLabel = describePackSelection(tabKey);
  const packCurrent = getCurrentPackNumber(getManagerData(tabKey), state.date);

  const packArticles = articles.map((article) => {
    const row = getManagerDraftRow(tabKey, article.sellerArticle);
    const plan = getArticlePlan(article, state.date);
    return {
      sellerArticle: article.sellerArticle,
      platformArticle: displayPlatformArticle(article),
      name: article.name,
      category: article.category,
      priorityLabel: article.priorityLabel,
      priorityBucket: article.priorityBucket,
      action: article.action,
      reason: article.reason,
      status: row.status,
      comment: row.comment,
      packNumber: article.packNumber,
      planOrdersDay: plan?.planOrdersDay ?? null,
      planRevenueDay: plan?.planRevenueDay ?? null,
      planMarginIncomeDay: plan?.planMarginIncomeDay ?? null,
      factOrdersDay: article.metrics?.factOrdersDay ?? null,
      factMoneyDay: article.metrics?.factMoneyDay ?? null,
      factMoneyLabel: article.metrics?.factMoneyLabel ?? null,
      mpStock: article.metrics?.mpStock ?? null,
      coverageDays: article.metrics?.coverageDays ?? null,
      supplyNeed: article.metrics?.supplyNeed ?? null
    };
  });

  const summary = summarizeManagerArticles(packArticles);
  const submittedAt = new Date().toISOString();

  return {
    id: createId("mgr"),
    type: "manager",
    submittedAt,
    reportDate: state.date,
    manager: meta.manager,
    channel: meta.channel,
    packSelection: state.filters[tabKey].pack,
    packLabel,
    currentPackNumber: packCurrent,
    articleCount: packArticles.length,
    doneCount: summary.doneCount,
    blockedCount: summary.blockedCount,
    helpCount: summary.helpCount,
    toSupplyCount: summary.toSupplyCount,
    dayComment: draft.dayComment || "",
    needHelp: draft.needHelp || "",
    summaryMetrics: summary.metrics,
    sourceSummary: `${summary.doneCount}/${packArticles.length} сделано · ${summary.toSupplyCount} в поставки · ${summary.blockedCount + summary.helpCount} требуют внимания`,
    packArticles
  };
}

function summarizeManagerArticles(packArticles) {
  const doneCount = packArticles.filter((item) => item.status === "done").length;
  const blockedCount = packArticles.filter((item) => item.status === "blocked").length;
  const helpCount = packArticles.filter((item) => item.status === "need-help").length;
  const toSupplyCount = packArticles.filter((item) => item.status === "to-supply").length;
  return {
    doneCount,
    blockedCount,
    helpCount,
    toSupplyCount,
    metrics: {
      planOrdersDay: sum(packArticles.map((item) => item.planOrdersDay)),
      factOrdersDay: sum(packArticles.map((item) => item.factOrdersDay)),
      planMarginIncomeDay: sum(packArticles.map((item) => item.planMarginIncomeDay)),
      supplyNeed: sum(packArticles.map((item) => item.supplyNeed))
    }
  };
}

function renderSuppliesControls() {
  if (!state.data.clusters) return;
  els.suppliesChannel.value = state.filters.supplies.channel;
  els.suppliesTargetDays.value = String(state.filters.supplies.targetDays || 21);
  populateSuppliesArticleSelect();
  const draft = getSuppliesDraft();
  els.suppliesCoordinator.value = draft.coordinator || "";
}

function populateSuppliesArticleSelect() {
  const channel = state.filters.supplies.channel;
  const options = getSupplyArticleOptions(channel);
  if (!options.length) {
    els.suppliesArticleSelect.innerHTML = `<option value="">Нет данных</option>`;
    state.filters.supplies.sellerArticle = "";
    return;
  }
  if (!state.filters.supplies.sellerArticle || !options.some((opt) => opt.value === state.filters.supplies.sellerArticle)) {
    state.filters.supplies.sellerArticle = options[0].value;
  }
  els.suppliesArticleSelect.innerHTML = options.map((opt) => `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>`).join("");
  els.suppliesArticleSelect.value = state.filters.supplies.sellerArticle;
}

function getSupplyArticleOptions(channel) {
  const rows = channel === "WB" ? (state.data.clusters?.wbRows || []) : (state.data.clusters?.ozonRows || []);
  const map = new Map();
  rows.forEach((row) => {
    const sellerArticle = row.sellerArticle;
    if (!sellerArticle) return;
    if (!map.has(sellerArticle)) {
      const articleName = row.name || row.title || sellerArticle;
      map.set(sellerArticle, {
        value: sellerArticle,
        label: `${sellerArticle} — ${articleName}`
      });
    }
  });
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "ru"));
}

function getSupplyRows(channel, sellerArticle) {
  if (!sellerArticle) return [];
  const rows = channel === "WB" ? (state.data.clusters?.wbRows || []) : (state.data.clusters?.ozonRows || []);
  return rows.filter((row) => row.sellerArticle === sellerArticle);
}

function getSupplyRowKey(channel, row) {
  if (channel === "WB") return `WB|${row.region || row.platformArticle || row.sellerArticle}`;
  return `Ozon|${row.shippingWarehouseKey || row.shippingWarehouse || row.deliveryCluster || row.platformArticle}`;
}

function getSupplyChannelRows(channel) {
  return channel === "WB" ? (state.data.clusters?.wbRows || []) : (state.data.clusters?.ozonRows || []);
}

function getPlanArticlesByChannel(channel) {
  const managers = state.data.plan?.managers || {};
  const manager = Object.values(managers).find((item) => item?.channel === channel);
  return manager?.articles || [];
}

function getPlanArticleByChannelAndSellerArticle(channel, sellerArticle) {
  if (!sellerArticle) return null;
  const articles = getPlanArticlesByChannel(channel);
  return articles.find((item) => item.sellerArticle === sellerArticle) || null;
}

function currentStockForSupplyRow(channel, row) {
  return channel === "WB"
    ? (asNumber(row.wbWarehouseStock) ?? asNumber(row.marketplaceStock) ?? 0)
    : (asNumber(row.warehouseStock) ?? asNumber(row.platformStock) ?? 0);
}

function highestPriorityBucket(values) {
  const rank = { critical: 4, high: 3, medium: 2, low: 1 };
  const buckets = values.filter(Boolean);
  if (!buckets.length) return "medium";
  return buckets.sort((a, b) => (rank[b] || 0) - (rank[a] || 0))[0] || "medium";
}

function buildSupplyReasonFallback(channel, rows, totalDaily, totalStock, mainWarehouseStock) {
  const first = rows[0] || {};
  const clusterText = rows.length ? `${rows.length} кл.` : "0 кл.";
  const stockText = `${fmtInt(totalStock)} шт`;
  const mainText = `${fmtInt(mainWarehouseStock)} шт`;
  const demandText = fmtNumber(totalDaily);
  if (channel === "WB") {
    return `${clusterText}; спрос/день ${demandText}; запас на МП ${stockText}; осн. склад ${mainText}.`;
  }
  return `${clusterText}; спрос/день ${demandText}; запас в кластерах ${stockText}; осн. склад ${mainText}; ключевой склад ${first.shippingWarehouse || first.deliveryCluster || "—"}.`;
}

function aggregateSupplyArticles(channel, targetDays) {
  const rows = getSupplyChannelRows(channel);
  const grouped = new Map();

  rows.forEach((row) => {
    const sellerArticle = row.sellerArticle;
    if (!sellerArticle) return;
    if (!grouped.has(sellerArticle)) grouped.set(sellerArticle, []);
    grouped.get(sellerArticle).push(row);
  });

  return Array.from(grouped.entries()).map(([sellerArticle, groupRows]) => {
    const normalizedRows = groupRows.map((row) => normalizeSupplyRow(channel, row, targetDays));
    const planArticle = getPlanArticleByChannelAndSellerArticle(channel, sellerArticle) || {};
    const totalCurrentStock = sum(normalizedRows.map((row) => row.currentStock)) || 0;
    const totalMainStock = maxValue(normalizedRows.map((row) => row.mainWarehouseStock)) ?? (asNumber(planArticle.mainWarehouseStock) || 0);
    const totalDaily = sum(normalizedRows.map((row) => row.avgDailyOrders)) || 0;
    const totalNeed = sum(normalizedRows.map((row) => row.recommendedShipQty)) || 0;
    const totalOrders7d = sum(normalizedRows.map((row) => row.orders7d)) || 0;
    const totalTransit = sum(normalizedRows.map((row) => row.inTransit)) || 0;
    const totalProduction = sum(normalizedRows.map((row) => row.inProduction)) || 0;
    const totalPurchase = sum(normalizedRows.map((row) => row.inPurchase)) || 0;
    const totalPlannedShip = sum(normalizedRows.map((row) => row.plannedShip)) || 0;
    const coverDays = totalDaily > 0 ? round2((totalCurrentStock + totalTransit + totalProduction + totalPurchase + totalPlannedShip) / totalDaily) : null;
    const priorityBucket = planArticle.priorityBucket || highestPriorityBucket(groupRows.map((row) => row.priorityBucket || row.priority)) || "medium";
    const priorityLabel = planArticle.priorityLabel || groupRows.find((row) => row.priorityLabel)?.priorityLabel || bucketLabel(priorityBucket);
    const action = planArticle.action || groupRows.find((row) => row.action)?.action || "—";
    const reason = planArticle.reason || buildSupplyReasonFallback(channel, groupRows, totalDaily, totalCurrentStock, totalMainStock);
    const blockers = normalizedRows.filter((row) => row.status === "blocked").length;
    const needsAttention = ["critical", "high"].includes(priorityBucket) && ((coverDays !== null && coverDays < targetDays * 0.7) || totalNeed > 0 || blockers > 0);

    return {
      sellerArticle,
      label: `${sellerArticle} — ${planArticle.name || groupRows[0]?.name || sellerArticle}`,
      name: planArticle.name || groupRows[0]?.name || sellerArticle,
      platformArticle: planArticle.platformArticle || groupRows[0]?.platformArticle || "",
      priorityBucket,
      priorityLabel,
      action,
      reason,
      totalCurrentStock,
      totalMainStock,
      totalDaily,
      totalNeed,
      totalOrders7d,
      clusterCount: normalizedRows.length,
      coverDays,
      blockers,
      totalTransit,
      totalProduction,
      totalPurchase,
      totalPlannedShip,
      rows: normalizedRows,
      needsAttention
    };
  }).sort((a, b) => {
    const pr = { critical: 4, high: 3, medium: 2, low: 1 };
    const diff = (pr[b.priorityBucket] || 0) - (pr[a.priorityBucket] || 0);
    if (diff !== 0) return diff;
    const needDiff = (b.totalNeed || 0) - (a.totalNeed || 0);
    if (needDiff !== 0) return needDiff;
    return (b.totalDaily || 0) - (a.totalDaily || 0);
  });
}

function bucketLabel(bucket) {
  return {
    critical: "Критично",
    high: "Высокий",
    medium: "Средний",
    low: "Низкий"
  }[bucket] || "Средний";
}

function buildSuppliesTotalRow(rows) {
  const totalOrders7d = sum(rows.map((row) => row.orders7d)) || 0;
  const totalDaily = sum(rows.map((row) => row.avgDailyOrders)) || 0;
  const totalStock = sum(rows.map((row) => row.currentStock)) || 0;
  const totalInTransit = sum(rows.map((row) => row.inTransit)) || 0;
  const totalInProduction = sum(rows.map((row) => row.inProduction)) || 0;
  const totalInPurchase = sum(rows.map((row) => row.inPurchase)) || 0;
  const totalNeed = sum(rows.map((row) => row.recommendedShipQty)) || 0;
  const totalPlannedShip = sum(rows.map((row) => row.plannedShip)) || 0;
  const turnoverDays = totalDaily > 0 ? round2(totalStock / totalDaily) : null;
  return { totalOrders7d, totalDaily, totalStock, totalInTransit, totalInProduction, totalInPurchase, totalNeed, totalPlannedShip, turnoverDays };
}

function renderSuppliesSummary(channel, targetDays) {
  const aggregates = aggregateSupplyArticles(channel, targetDays);
  const rows = getSupplyChannelRows(channel);
  const totalDaily = sum(aggregates.map((item) => item.totalDaily)) || 0;
  const totalStock = sum(aggregates.map((item) => item.totalCurrentStock)) || 0;
  const totalMain = sum(aggregates.map((item) => item.totalMainStock)) || 0;
  const totalNeed = sum(aggregates.map((item) => item.totalNeed)) || 0;
  const criticalCount = aggregates.filter((item) => ["critical", "high"].includes(item.priorityBucket)).length;
  const blockerCount = aggregates.filter((item) => item.blockers > 0).length;

  els.suppliesSummaryMeta.textContent = `${channel}: ${aggregates.length} артикулов · ${rows.length} кластерных строк · покрытие ${targetDays} дн.`;
  els.suppliesSummaryArticlesCard.textContent = String(aggregates.length);
  els.suppliesSummaryRowsCard.textContent = String(rows.length);
  els.suppliesSummaryDemandCard.textContent = fmtNumber(totalDaily);
  els.suppliesSummaryStockCard.textContent = `${fmtInt(totalStock)} шт`;
  els.suppliesSummaryMainCard.textContent = `${fmtInt(totalMain)} шт`;
  els.suppliesSummaryNeedCard.textContent = `${fmtInt(totalNeed)} шт`;
  els.suppliesSummaryCriticalCard.textContent = String(criticalCount);
  els.suppliesSummaryBlockedCard.textContent = String(blockerCount);

  const top = aggregates.filter((item) => item.totalNeed > 0 || item.totalDaily > 0).slice(0, 8);
  els.suppliesTopDeficits.innerHTML = top.length
    ? top.map((item, index) => renderSupplyAggregateCard(item, index + 1)).join("")
    : `<div class="empty-state">Нет артикулов с активной потребностью по ${escapeHtml(channel)}.</div>`;

  const attention = aggregates.filter((item) => item.needsAttention).slice(0, 8);
  els.suppliesAttentionList.innerHTML = attention.length
    ? attention.map((item) => renderSupplyAttentionItem(item)).join("")
    : `<div class="empty-state">Сегодня по ${escapeHtml(channel)} нет строк с низким покрытием в красной зоне.</div>`;
}

function renderSupplyAggregateCard(item, rank) {
  return `
    <button type="button" class="deviation-item supply-jump-btn" data-supply-article="${escapeAttr(item.sellerArticle)}">
      <span class="rank-badge">${rank}</span>
      <span class="deviation-main">
        <strong>${escapeHtml(item.sellerArticle)}</strong>
        <small>${escapeHtml(item.name || "—")}</small>
        <span class="deviation-meta">
          <span class="priority-pill ${priorityClassName(item.priorityBucket)}">${escapeHtml(item.priorityLabel)}</span>
          <span class="priority-pill neutral">нужно ${fmtInt(item.totalNeed)} шт</span>
          <span class="priority-pill neutral">спрос ${fmtNumber(item.totalDaily)}/д</span>
          <span class="priority-pill neutral">МП ${fmtInt(item.totalCurrentStock)} шт</span>
        </span>
      </span>
      <span class="deviation-pack">${item.clusterCount} кл.</span>
    </button>
  `;
}

function renderSupplyAttentionItem(item) {
  return `
    <button type="button" class="attention-item supply-jump-btn" data-supply-article="${escapeAttr(item.sellerArticle)}">
      <span class="attention-title">${escapeHtml(item.sellerArticle)}</span>
      <span class="attention-text">${escapeHtml(item.reason || item.action || "—")}</span>
      <span class="attention-meta">
        <span class="priority-pill ${priorityClassName(item.priorityBucket)}">${escapeHtml(item.priorityLabel)}</span>
        <span class="priority-pill neutral">покрытие ${fmtNumber(item.coverDays)} дн</span>
        <span class="priority-pill neutral">план отгр. ${fmtInt(item.totalPlannedShip)} шт</span>
      </span>
    </button>
  `;
}

function handleSuppliesArticleJump(event) {
  const target = event.target.closest("[data-supply-article]");
  if (!target) return;
  const sellerArticle = target.dataset.supplyArticle;
  if (!sellerArticle) return;
  state.filters.supplies.sellerArticle = sellerArticle;
  populateSuppliesArticleSelect();
  renderSuppliesView();
}

function getSuppliesDraft() {
  const key = `${state.date}|${state.filters.supplies.channel}|${state.filters.supplies.sellerArticle || "_"}`;
  if (!state.suppliesDrafts[key]) {
    state.suppliesDrafts[key] = {
      reportDate: state.date,
      channel: state.filters.supplies.channel,
      sellerArticle: state.filters.supplies.sellerArticle || "",
      targetDays: state.filters.supplies.targetDays,
      coordinator: "",
      rows: {}
    };
  }
  return state.suppliesDrafts[key];
}

function getSuppliesDraftRow(rowKey) {
  const draft = getSuppliesDraft();
  if (!draft.rows[rowKey]) {
    draft.rows[rowKey] = {
      inTransit: "",
      inProduction: "",
      inPurchase: "",
      plannedShip: "",
      eta: "",
      status: "draft",
      comment: ""
    };
  }
  return draft.rows[rowKey];
}

function persistSuppliesDrafts() {
  saveStorage("tekstilno-v9-supplies-drafts", state.suppliesDrafts);
}

function renderSuppliesView() {
  if (!state.data.clusters) return;
  const channel = state.filters.supplies.channel;
  const sellerArticle = state.filters.supplies.sellerArticle;
  const rows = getSupplyRows(channel, sellerArticle);
  const draft = getSuppliesDraft();
  draft.channel = channel;
  draft.sellerArticle = sellerArticle;
  draft.targetDays = Number(els.suppliesTargetDays.value || state.filters.supplies.targetDays || 21);
  els.suppliesCoordinator.value = draft.coordinator || "";

  renderSuppliesSummary(channel, draft.targetDays);

  if (!rows.length) {
    els.suppliesTitleCard.textContent = "—";
    els.suppliesMainStockCard.textContent = "—";
    els.suppliesPlatformStockCard.textContent = "—";
    els.suppliesDemandCard.textContent = "—";
    els.suppliesRecommendedCard.textContent = "—";
    els.suppliesRowsCard.textContent = "0";
    els.suppliesReasonCard.textContent = "—";
    els.suppliesActionCard.textContent = "—";
    els.suppliesRowsBody.innerHTML = `<tr><td colspan="13"><div class="empty-state">Нет строк по выбранному артикулу.</div></td></tr>`;
    els.suppliesHint.textContent = "Выбери площадку и артикул — сайт подтянет строки кластеров и покажет сводку справа.";
    return;
  }

  const normalizedRows = rows.map((row) => normalizeSupplyRow(channel, row, draft.targetDays));
  const totalRow = buildSuppliesTotalRow(normalizedRows);
  const totalMain = maxValue(normalizedRows.map((row) => row.mainWarehouseStock));
  const totalPlatform = sum(normalizedRows.map((row) => row.currentStock));
  const totalDemand = sum(normalizedRows.map((row) => row.avgDailyOrders));
  const totalRecommended = sum(normalizedRows.map((row) => row.recommendedShipQty));
  const planArticle = getPlanArticleByChannelAndSellerArticle(channel, sellerArticle) || {};
  const first = normalizedRows[0];

  els.suppliesTitleCard.textContent = first.name || sellerArticle;
  els.suppliesMainStockCard.textContent = `${fmtInt(totalMain)} шт`;
  els.suppliesPlatformStockCard.textContent = `${fmtInt(totalPlatform)} шт`;
  els.suppliesDemandCard.textContent = fmtNumber(totalDemand);
  els.suppliesRecommendedCard.textContent = `${fmtInt(totalRecommended)} шт`;
  els.suppliesRowsCard.textContent = String(normalizedRows.length);
  els.suppliesReasonCard.textContent = planArticle.reason || buildSupplyReasonFallback(channel, rows, totalDemand || 0, totalPlatform || 0, totalMain || 0);
  els.suppliesActionCard.textContent = planArticle.action || rows.find((row) => row.action)?.action || "—";
  els.suppliesHint.textContent = `${channel}: ${normalizedRows.length} строк по кластерам. Координатор заполняет поставку, производство, закупку, план отгрузки и ETA. Итого первой строкой уже посчитано.`;

  els.suppliesRowsBody.innerHTML = renderSuppliesTotalHtml(totalRow) + normalizedRows.map((row) => renderSuppliesRow(channel, row)).join("");
}

function normalizeSupplyRow(channel, row, targetDays) {
  const rowKey = getSupplyRowKey(channel, row);
  const draftRow = getSuppliesDraftRow(rowKey);
  const avgDailyOrders = asNumber(row.avgDailyOrders) ?? 0;
  const currentStock = channel === "WB"
    ? (asNumber(row.wbWarehouseStock) ?? asNumber(row.marketplaceStock) ?? 0)
    : (asNumber(row.warehouseStock) ?? asNumber(row.platformStock) ?? 0);
  const mainWarehouseStock = asNumber(row.mainWarehouseStock) ?? 0;
  const inTransit = asNumber(draftRow.inTransit) ?? 0;
  const inProduction = asNumber(draftRow.inProduction) ?? 0;
  const inPurchase = asNumber(draftRow.inPurchase) ?? 0;
  const plannedShip = asNumber(draftRow.plannedShip) ?? 0;
  const baseNeed = Math.max(0, Math.ceil(avgDailyOrders * targetDays - (currentStock + inTransit + inProduction + inPurchase)));
  const coverDaysTotal = avgDailyOrders > 0 ? round2((currentStock + inTransit + inProduction + inPurchase + plannedShip) / avgDailyOrders) : null;
  const turnoverDays = avgDailyOrders > 0 ? round2(currentStock / avgDailyOrders) : null;

  return {
    rowKey,
    channel,
    sellerArticle: row.sellerArticle,
    platformArticle: displayMaybeNumber(row.platformArticle),
    name: row.name || row.title || row.sellerArticle,
    clusterName: channel === "WB"
      ? (row.region || "WB кластер")
      : [row.deliveryCluster, row.shippingWarehouse].filter(Boolean).join(" · "),
    orders7d: asNumber(row.orders7d),
    avgDailyOrders,
    currentStock,
    mainWarehouseStock,
    recommendedShipQty: baseNeed,
    turnoverDays,
    coverDaysTotal,
    inTransit,
    inProduction,
    inPurchase,
    plannedShip,
    eta: draftRow.eta || "",
    status: draftRow.status || "draft",
    comment: draftRow.comment || ""
  };
}

function renderSuppliesRow(channel, row) {
  return `
    <tr data-row-key="${escapeHtml(row.rowKey)}">
      <td>${escapeHtml(row.clusterName || "—")}</td>
      <td>${fmtNumber(row.orders7d)}</td>
      <td>${fmtNumber(row.avgDailyOrders)}</td>
      <td>${fmtInt(row.currentStock)}</td>
      <td>${fmtNumber(row.turnoverDays)}</td>
      <td><input type="number" class="status-select small-input supply-num" data-field="inTransit" value="${escapeAttr(row.inTransit)}" min="0" step="1" /></td>
      <td><input type="number" class="status-select small-input supply-num" data-field="inProduction" value="${escapeAttr(row.inProduction)}" min="0" step="1" /></td>
      <td><input type="number" class="status-select small-input supply-num" data-field="inPurchase" value="${escapeAttr(row.inPurchase)}" min="0" step="1" /></td>
      <td>${fmtInt(row.recommendedShipQty)}</td>
      <td><input type="number" class="status-select small-input supply-num" data-field="plannedShip" value="${escapeAttr(row.plannedShip)}" min="0" step="1" /></td>
      <td><input type="text" class="status-select eta-input supply-text" data-field="eta" value="${escapeAttr(row.eta)}" placeholder="напр. 3 дня" /></td>
      <td>
        <select class="status-select supply-select" data-field="status">
          ${SUPPLY_STATUS_OPTIONS.map((opt) => `<option value="${opt.value}" ${row.status === opt.value ? "selected" : ""}>${escapeHtml(opt.label)}</option>`).join("")}
        </select>
      </td>
      <td><textarea class="row-input supply-text" data-field="comment" rows="3" placeholder="Что уже делаем по строке">${escapeHtml(row.comment)}</textarea></td>
    </tr>
  `;
}

function renderSuppliesTotalHtml(total) {
  return `
    <tr class="summary-row">
      <td><strong>ИТОГО</strong></td>
      <td><strong>${fmtNumber(total.totalOrders7d)}</strong></td>
      <td><strong>${fmtNumber(total.totalDaily)}</strong></td>
      <td><strong>${fmtInt(total.totalStock)}</strong></td>
      <td><strong>${fmtNumber(total.turnoverDays)}</strong></td>
      <td><strong>${fmtInt(total.totalInTransit)}</strong></td>
      <td><strong>${fmtInt(total.totalInProduction)}</strong></td>
      <td><strong>${fmtInt(total.totalInPurchase)}</strong></td>
      <td><strong>${fmtInt(total.totalNeed)}</strong></td>
      <td><strong>${fmtInt(total.totalPlannedShip)}</strong></td>
      <td colspan="3"><strong>Свод по выбранному артикулу</strong></td>
    </tr>
  `;
}

function handleSuppliesRowsChange(event) {
  const tr = event.target.closest("tr[data-row-key]");
  if (!tr) return;
  const rowKey = tr.dataset.rowKey;
  const draftRow = getSuppliesDraftRow(rowKey);
  const field = event.target.dataset.field;
  if (!field) return;

  draftRow[field] = event.target.value;
  persistSuppliesDrafts();

  if (["inTransit", "inProduction", "inPurchase", "plannedShip", "status", "eta"].includes(field)) {
    renderSuppliesView();
  }
}

function handleSuppliesRowsInput(event) {
  const tr = event.target.closest("tr[data-row-key]");
  if (!tr) return;
  const rowKey = tr.dataset.rowKey;
  const draftRow = getSuppliesDraftRow(rowKey);
  const field = event.target.dataset.field;
  if (!field) return;

  draftRow[field] = event.target.value;
  persistSuppliesDrafts();
}

function exportSuppliesCurrent() {
  const payload = buildSuppliesPayload();
  downloadJson(payload, `supplies-${payload.channel.toLowerCase()}-${payload.reportDate}.json`);
}

async function submitSupplies() {
  const payload = buildSuppliesPayload();
  const entry = {
    id: payload.id,
    type: "cluster",
    manager: payload.coordinator,
    channel: payload.channel,
    reportDate: payload.reportDate,
    submittedAt: payload.submittedAt,
    summary: payload.sourceSummary,
    source: "local",
    payload
  };
  state.localSubmissions.unshift(entry);
  trimLocalSubmissions();
  persistLocalSubmissions();
  renderLeaderFilters();
  renderLeaderView();

  if (state.config.appsScriptUrl) {
    try {
      await postToAppsScript({ action: "submitClusterForm", id: payload.id, payload });
      showToast(`Форма поставок ${payload.channel} сдана и отправлена в Apps Script.`);
    } catch (error) {
      console.error(error);
      showToast("Форма поставок сохранена локально, но Apps Script не ответил.");
    }
  } else {
    showToast("Форма поставок сохранена локально.");
  }
}

function buildSuppliesPayload() {
  const channel = state.filters.supplies.channel;
  const sellerArticle = state.filters.supplies.sellerArticle;
  const rows = getSupplyRows(channel, sellerArticle).map((row) => normalizeSupplyRow(channel, row, state.filters.supplies.targetDays));
  const draft = getSuppliesDraft();
  const first = rows[0] || {};
  const summary = {
    recommendedShipQty: sum(rows.map((row) => row.recommendedShipQty)),
    plannedShipQty: sum(rows.map((row) => asNumber(row.plannedShip))),
    blockers: rows.filter((row) => row.status === "blocked").length
  };
  const submittedAt = new Date().toISOString();

  return {
    id: createId("sup"),
    type: "cluster",
    submittedAt,
    reportDate: state.date,
    coordinator: draft.coordinator || "",
    channel,
    sellerArticle,
    platformArticle: first.platformArticle || "",
    name: first.name || sellerArticle,
    targetDays: draft.targetDays || state.filters.supplies.targetDays,
    mainWarehouseStock: maxValue(rows.map((row) => row.mainWarehouseStock)),
    platformStock: sum(rows.map((row) => row.currentStock)),
    sourceSummary: `${rows.length} строк · рекоменд. ${fmtInt(summary.recommendedShipQty)} шт · план ${fmtInt(summary.plannedShipQty)} шт`,
    blockersCount: summary.blockers,
    rows
  };
}

function persistLocalSubmissions() {
  saveStorage("tekstilno-v9-local-submissions", state.localSubmissions);
}

function trimLocalSubmissions() {
  const max = Number(state.config.maxLocalSubmissions || 500);
  if (state.localSubmissions.length > max) {
    state.localSubmissions = state.localSubmissions.slice(0, max);
  }
}

function renderLeaderFilters() {
  const options = getAllJournalEntries().map((entry) => entry.manager).filter(Boolean);
  const unique = Array.from(new Set(options)).sort((a, b) => a.localeCompare(b, "ru"));
  const current = state.filters.leader.manager || "all";
  els.leaderManagerFilter.innerHTML = `<option value="all">Все</option>` + unique.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
  els.leaderManagerFilter.value = unique.includes(current) ? current : "all";
  state.filters.leader.manager = els.leaderManagerFilter.value;
}

function renderLeaderView() {
  const entries = getFilteredJournalEntries();
  els.leaderTotalCard.textContent = String(entries.length);
  els.leaderManagerCard.textContent = String(entries.filter((item) => item.type === "manager").length);
  els.leaderClusterCard.textContent = String(entries.filter((item) => item.type === "cluster").length);
  els.leaderIssuesCard.textContent = String(entries.filter((item) => entryHasIssues(item)).length);

  if (!entries.length) {
    els.leaderFeedBody.innerHTML = `<tr><td colspan="6"><div class="empty-state">Пока нет записей по текущим фильтрам.</div></td></tr>`;
    if (!state.selectedLeaderId) {
      els.leaderDetails.innerHTML = `<h3>Детали записи</h3><p class="muted">Пока нечего показывать.</p>`;
    }
    return;
  }

  if (!state.selectedLeaderId || !entries.some((item) => item.id === state.selectedLeaderId)) {
    state.selectedLeaderId = entries[0].id;
  }

  els.leaderFeedBody.innerHTML = entries.map((entry) => renderLeaderRow(entry)).join("");
  const selected = entries.find((item) => item.id === state.selectedLeaderId);
  renderLeaderDetails(selected || entries[0]);
}

function renderLeaderRow(entry) {
  const activeClass = entry.id === state.selectedLeaderId ? "active" : "";
  const submittedAt = formatDateTime(entry.submittedAt);
  const sourceLabel = entry.source === "remote" ? "Apps Script" : "локально";
  const typeLabel = entry.type === "manager" ? "Пакет" : "Поставки";
  return `
    <tr class="leader-row ${activeClass}" data-entry-id="${escapeHtml(entry.id)}">
      <td>${escapeHtml(submittedAt)}</td>
      <td>${escapeHtml(entry.manager || "—")}</td>
      <td>${escapeHtml(typeLabel)}</td>
      <td>${escapeHtml(entry.channel || "—")}</td>
      <td>${escapeHtml(entry.summary || "—")}</td>
      <td>${escapeHtml(sourceLabel)}</td>
    </tr>
  `;
}

function handleLeaderFeedClick(event) {
  const tr = event.target.closest("tr[data-entry-id]");
  if (!tr) return;
  state.selectedLeaderId = tr.dataset.entryId;
  renderLeaderView();
}

function renderLeaderDetails(entry) {
  if (!entry) {
    els.leaderDetails.innerHTML = `<h3>Детали записи</h3><p class="muted">Выбери строку слева.</p>`;
    return;
  }

  if (entry.type === "manager") {
    const payload = entry.payload || {};
    const rows = Array.isArray(payload.packArticles) ? payload.packArticles : [];
    els.leaderDetails.innerHTML = `
      <h3>${escapeHtml(entry.channel)} · ${escapeHtml(entry.manager || "—")}</h3>
      <p class="muted">${escapeHtml(formatDateTime(entry.submittedAt))} · ${escapeHtml(entry.summary || "")}</p>
      <div class="detail-block">
        <h4>Комментарий по дню</h4>
        <p>${escapeHtml(payload.dayComment || "—")}</p>
      </div>
      <div class="detail-block">
        <h4>Нужна помощь</h4>
        <p>${escapeHtml(payload.needHelp || "—")}</p>
      </div>
      <div class="detail-block">
        <h4>Статусы по артикулу</h4>
        ${rows.length ? `
        <table>
          <thead><tr><th>Артикул</th><th>Приоритет</th><th>Статус</th><th>Комментарий</th></tr></thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${escapeHtml(row.sellerArticle || "")}</td>
                <td>${escapeHtml(row.priorityLabel || "")}</td>
                <td>${escapeHtml(statusLabel(row.status))}</td>
                <td>${escapeHtml(row.comment || "—")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>` : `<p class="muted">Внутри записи нет строк.</p>`}
      </div>
    `;
    return;
  }

  const payload = entry.payload || {};
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  els.leaderDetails.innerHTML = `
    <h3>${escapeHtml(entry.channel)} · Поставки</h3>
    <p class="muted">${escapeHtml(formatDateTime(entry.submittedAt))} · ${escapeHtml(entry.summary || "")}</p>
    <div class="detail-block">
      <h4>Координатор</h4>
      <p>${escapeHtml(payload.coordinator || "—")}</p>
    </div>
    <div class="detail-block">
      <h4>Артикул</h4>
      <p>${escapeHtml(payload.sellerArticle || "—")} · ${escapeHtml(payload.name || "—")}</p>
    </div>
    <div class="detail-block">
      <h4>Строки по кластерам</h4>
      ${rows.length ? `
      <table>
        <thead><tr><th>Кластер</th><th>Нужно</th><th>План</th><th>Статус</th><th>Комментарий</th></tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.clusterName || "—")}</td>
              <td>${fmtInt(row.recommendedShipQty)}</td>
              <td>${fmtInt(asNumber(row.plannedShip))}</td>
              <td>${escapeHtml(supplyStatusLabel(row.status))}</td>
              <td>${escapeHtml(row.comment || "—")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>` : `<p class="muted">Строки не заполнены.</p>`}
    </div>
  `;
}

function getFilteredJournalEntries() {
  const entries = getAllJournalEntries();
  return entries.filter((entry) => {
    if (state.filters.leader.date && entry.reportDate !== state.filters.leader.date) return false;
    if (state.filters.leader.type !== "all" && entry.type !== state.filters.leader.type) return false;
    if (state.filters.leader.manager !== "all" && entry.manager !== state.filters.leader.manager) return false;
    if (state.filters.leader.source !== "all" && entry.source !== state.filters.leader.source) return false;
    return true;
  });
}

function getAllJournalEntries() {
  const local = state.localSubmissions.map((entry) => ({
    ...entry,
    source: "local"
  }));

  const remoteManager = (state.remoteDashboard.managerSubmissions || []).map((row) => normalizeRemoteEntry(row, "manager"));
  const remoteClusters = (state.remoteDashboard.clusterForms || []).map((row) => normalizeRemoteEntry(row, "cluster"));
  const merged = [...remoteManager, ...remoteClusters, ...local];

  const byId = new Map();
  merged.forEach((entry) => {
    if (!entry || !entry.id) return;
    const existing = byId.get(entry.id);
    if (!existing || existing.source === "local") {
      byId.set(entry.id, entry);
    }
  });

  return Array.from(byId.values()).sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));
}

function normalizeRemoteEntry(row, type) {
  let payload = null;
  if (row && row.payloadJson) {
    try {
      payload = typeof row.payloadJson === "string" ? JSON.parse(row.payloadJson) : row.payloadJson;
    } catch (error) {
      payload = null;
    }
  }
  return {
    id: row.id,
    type,
    manager: row.manager || row.coordinator || "",
    channel: row.channel || "",
    reportDate: row.reportDate || "",
    submittedAt: row.submittedAt || "",
    summary: row.summary || row.sourceSummary || "",
    source: "remote",
    payload
  };
}

function entryHasIssues(entry) {
  if (entry.type === "manager") {
    const payload = entry.payload || {};
    return Number(payload.blockedCount || 0) > 0 || Number(payload.helpCount || 0) > 0;
  }
  const payload = entry.payload || {};
  return Number(payload.blockersCount || 0) > 0;
}

function exportAllData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    managerDrafts: state.managerDrafts,
    suppliesDrafts: state.suppliesDrafts,
    localSubmissions: state.localSubmissions
  };
  downloadJson(payload, `tekstilno-backup-${state.date}.json`);
}

function importAllData(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(String(reader.result || "{}"));
      if (payload.managerDrafts && typeof payload.managerDrafts === "object") {
        state.managerDrafts = { ...state.managerDrafts, ...payload.managerDrafts };
      }
      if (payload.suppliesDrafts && typeof payload.suppliesDrafts === "object") {
        state.suppliesDrafts = { ...state.suppliesDrafts, ...payload.suppliesDrafts };
      }
      if (Array.isArray(payload.localSubmissions)) {
        state.localSubmissions = [...payload.localSubmissions, ...state.localSubmissions];
      }
      trimLocalSubmissions();
      persistManagerDrafts();
      persistSuppliesDrafts();
      persistLocalSubmissions();
      renderAll();
      showToast("JSON импортирован.");
    } catch (error) {
      console.error(error);
      showToast("Не удалось импортировать JSON.");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file, "utf-8");
}

async function postToAppsScript(wrapper) {
  const response = await fetch(state.config.appsScriptUrl, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(wrapper)
  });
  return response;
}

function countMatchedPlan(tabKey) {
  const managerData = getManagerData(tabKey);
  const articles = managerData?.articles || [];
  return {
    matched: articles.filter((article) => article.planMatch?.matched).length,
    total: articles.length
  };
}

function normalizeRemoteDashboardPayload(payload) {
  return {
    managerSubmissions: Array.isArray(payload.managerSubmissions) ? payload.managerSubmissions : [],
    clusterForms: Array.isArray(payload.clusterForms) ? payload.clusterForms : []
  };
}

function loadJsonp(url) {
  return new Promise((resolve, reject) => {
    const callbackName = `__tekstilno_jsonp_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const script = document.createElement("script");
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("JSONP timeout"));
    }, 15000);

    function cleanup() {
      window.clearTimeout(timeoutId);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("JSONP error"));
    };
    script.src = `${url}${url.includes("?") ? "&" : "?"}callback=${callbackName}`;
    document.body.appendChild(script);
  });
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url} → ${response.status}`);
  }
  return response.json();
}

function versionedUrl(url) {
  const version = encodeURIComponent(state.config.siteVersion || Date.now());
  return `${url}${url.includes("?") ? "&" : "?"}v=${version}`;
}

function setBanner(text, kind) {
  els.banner.textContent = text;
  els.banner.className = `banner ${kind || ""}`.trim();
}

function showToast(text) {
  els.toast.textContent = text;
  els.toast.classList.add("show");
  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function saveStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function displayPlatformArticle(article) {
  return displayMaybeNumber(article.platformArticle || article.ozonProductId || article.wbArticle || "");
}

function displayMaybeNumber(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return text.endsWith(".0") ? text.slice(0, -2) : text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("\n", "&#10;");
}

function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function monthLabelFromDate(dateStr) {
  const ym = (dateStr || "").slice(0, 7);
  const [year, month] = ym.split("-");
  if (!year || !month) return ym || "";
  const label = new Intl.DateTimeFormat("ru-RU", { month: "long" }).format(new Date(`${ym}-01T00:00:00`));
  return `${label} ${year}`;
}

function isBusinessDay(date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function businessDaysDiff(anchorStr, targetStr) {
  if (!anchorStr || !targetStr) return 0;
  const anchor = new Date(`${anchorStr}T00:00:00`);
  const target = new Date(`${targetStr}T00:00:00`);
  if (anchor.getTime() === target.getTime()) return 0;

  let count = 0;
  const step = anchor < target ? 1 : -1;
  const cursor = new Date(anchor);
  while ((step > 0 && cursor < target) || (step < 0 && cursor > target)) {
    cursor.setDate(cursor.getDate() + step);
    if (isBusinessDay(cursor)) {
      count += step;
    }
  }
  return count;
}

function priorityClassName(bucket) {
  return bucket || "medium";
}

function statusLabel(value) {
  return MANAGER_STATUS_OPTIONS.find((opt) => opt.value === value)?.label || value || "—";
}

function supplyStatusLabel(value) {
  return SUPPLY_STATUS_OPTIONS.find((opt) => opt.value === value)?.label || value || "—";
}

function asNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function sum(values) {
  const filtered = values.filter((value) => isNumber(value));
  if (!filtered.length) return null;
  return round2(filtered.reduce((acc, value) => acc + Number(value), 0));
}

function maxValue(values) {
  const filtered = values.filter((value) => isNumber(value));
  if (!filtered.length) return null;
  return Math.max(...filtered);
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function getArticleDelta(article, dateStr) {
  const plan = getArticlePlan(article, dateStr);
  const fact = article?.metrics || {};
  if (!isNumber(plan?.planOrdersDay) || !isNumber(fact.factOrdersDay)) return null;
  return round2(fact.factOrdersDay - plan.planOrdersDay);
}

function fmtSignedNumber(value) {
  if (!isNumber(value)) return "—";
  return `${value >= 0 ? "+" : ""}${fmtNumber(value)}`;
}

function clipText(value, maxLength = 140) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}…` : text;
}

function firstSentence(value, maxLength = 160) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const match = text.match(/^[^.?!]+[.?!]?/);
  return clipText(match ? match[0] : text, maxLength);
}

function fmtNumber(value) {
  if (!isNumber(value)) return "—";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);
}

function fmtInt(value) {
  if (!isNumber(value)) return "—";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value);
}

function fmtMoney(value) {
  if (!isNumber(value)) return "—";
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value)} ₽`;
}
