const DEFAULT_CONFIG = {
  organizationName: "Текстильно",
  siteVersion: "v6",
  appsScriptUrl: "",
  googleSheetUrl: "",
  packSize: 20,
  cycleAnchorDate: "2026-04-02",
  clearAfterSubmit: false,
  maxLocalReports: 40,
  planDataUrl: "data/article-plan.json",
  tasksDataUrl: "data/daily-tasks.json",
  overridesDataUrl: "data/daily-article-overrides.json"
};

const STORAGE_PREFIX = "manager-journal-v6";
const HISTORY_KEY = `${STORAGE_PREFIX}:reports`;

const state = {
  config: { ...DEFAULT_CONFIG, ...(window.APP_CONFIG || {}) },
  planData: null,
  tasksData: null,
  overridesData: null,
  managerKey: "",
  managerData: null,
  currentChannel: "",
  dynamicTasks: [],
  articleStates: {},
  actions: [],
  packMeta: null,
  dailyPack: [],
  filteredPack: [],
  lastMessageTimeout: null,
  currentReportId: null,
  articleFilters: {
    priority: "all",
    status: "all",
    search: ""
  }
};

const els = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  bindEvents();
  setupStaticTexts();
  setDefaultDate();
  await loadData();
  hydrateManagers();
  applyQueryDefaults();
  refreshContext({ shouldRestoreDraft: true });
}


function cacheElements() {
  [
    "siteTitle","statusBanner","planStatusBadge","packStatusBadge","submitStatusBadge","channelFilter","managerSelect","reportDate","channel","department",
    "dayFocus","overallStatus","managerLinkPreview","packBadge","articlesCountBadge","sourceBadge","priorityBadge","headlineArticles","headlineArticlesSub",
    "headlineOrdersPlan","headlineMarginPlan","headlineRevenuePlan","headlineOrdersSub","headlineMarginSub","headlineRevenueSub",
    "ordersPlanCell","ordersFact","ordersDeviation","marginPlanCell","marginFact","marginDeviation","revenuePlanCell","revenueFact","revenueDeviation",
    "numbersComment","rowFactsHint","tasksList","articlesBody","actionsList","doneSummary","blockers","helpNeeded","tomorrowFocus",
    "formMessage","managerSummaryList","localHistoryList","openSheetBtn","openSheetBtnTop","downloadPackBtn","numbersPanel","articlesPanel",
    "articlePriorityFilter","articleStatusFilter","articleSearch"
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });

  els.saveDraftButtons = [document.getElementById("saveDraftBtn"), document.getElementById("saveDraftBtnTop")].filter(Boolean);
  els.fillLastButtons = [document.getElementById("fillLastBtn"), document.getElementById("fillLastBtnTop")].filter(Boolean);
  els.copyLinkBtn = document.getElementById("copyLinkBtn");
  els.reloadBtn = document.getElementById("reloadBtn");
  els.syncFactsBtn = document.getElementById("syncFactsBtn");
  els.addActionBtn = document.getElementById("addActionBtn");
  els.clearDraftBtn = document.getElementById("clearDraftBtn");
  els.exportJsonBtn = document.getElementById("exportJsonBtn");
  els.submitBtn = document.getElementById("submitBtn");
  els.submitFrame = document.getElementById("submitFrame");
}


function bindEvents() {
  els.channelFilter.addEventListener("change", handleChannelChange);
  els.managerSelect.addEventListener("change", handleManagerChange);
  els.reportDate.addEventListener("change", () => refreshContext({ shouldRestoreDraft: true }));
  els.dayFocus.addEventListener("input", handleScalarInput);
  els.department.addEventListener("input", handleScalarInput);
  els.overallStatus.addEventListener("change", handleScalarInput);
  els.ordersFact.addEventListener("input", handleScalarInput);
  els.marginFact.addEventListener("input", handleScalarInput);
  els.revenueFact.addEventListener("input", handleScalarInput);
  els.numbersComment.addEventListener("input", handleScalarInput);
  els.doneSummary.addEventListener("input", handleScalarInput);
  els.blockers.addEventListener("input", handleScalarInput);
  els.helpNeeded.addEventListener("input", handleScalarInput);
  els.tomorrowFocus.addEventListener("input", handleScalarInput);

  if (els.articlePriorityFilter) {
    els.articlePriorityFilter.addEventListener("change", handleArticleFilterChange);
  }
  if (els.articleStatusFilter) {
    els.articleStatusFilter.addEventListener("change", handleArticleFilterChange);
  }
  if (els.articleSearch) {
    els.articleSearch.addEventListener("input", handleArticleFilterChange);
  }

  els.tasksList.addEventListener("input", handleTaskInput);
  els.tasksList.addEventListener("change", handleTaskInput);

  els.articlesBody.addEventListener("input", handleArticleInput);
  els.articlesBody.addEventListener("change", handleArticleInput);

  els.actionsList.addEventListener("input", handleActionInput);
  els.actionsList.addEventListener("click", handleActionClick);

  els.saveDraftButtons.forEach((button) => button.addEventListener("click", () => saveDraft(true)));
  els.fillLastButtons.forEach((button) => button.addEventListener("click", fillFromLastReport));
  if (els.copyLinkBtn) {
    els.copyLinkBtn.addEventListener("click", copyManagerLink);
  }
  if (els.reloadBtn) {
    els.reloadBtn.addEventListener("click", async () => {
      await loadData();
      hydrateManagers();
      refreshContext({ shouldRestoreDraft: true });
    });
  }
  els.syncFactsBtn.addEventListener("click", syncFactsFromRows);
  els.addActionBtn.addEventListener("click", addActionRow);
  els.clearDraftBtn.addEventListener("click", clearCurrentDraft);
  els.exportJsonBtn.addEventListener("click", exportCurrentJson);
  els.submitBtn.addEventListener("click", submitReport);
  [els.openSheetBtn, els.openSheetBtnTop].forEach((button) => {
    if (button) {
      button.addEventListener("click", openSheet);
    }
  });
  if (els.downloadPackBtn) {
    els.downloadPackBtn.addEventListener("click", downloadCurrentPackCsv);
  }
}


function getVersionedUrl(url) {
  const value = state.config.siteVersion || Date.now();
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(value)}`;
}

function getManagerChannel(manager) {
  if (!manager) return "";
  if (manager.role === "supplyCoordinator") return "Поставки";
  return manager.channel || "";
}
function getPlatformArticleId(article) {
  const channel = article.channel || state.managerData?.channel || "";
  if (channel === "Ozon") return article.ozonArticle || article.wbArticle || "";
  return article.wbArticle || article.ozonArticle || "";
}

function getPlatformArticleLabel(article) {
  const channel = article.channel || state.managerData?.channel || "";
  return channel === "Ozon" ? "Ozon артикул" : "WB артикул";
}


function getChannelOptions() {
  const managers = (state.planData && state.planData.managers) || {};
  const channels = new Set(Object.values(managers).map(getManagerChannel).filter(Boolean));
  return ["WB", "Ozon", "Поставки"].filter((item) => channels.has(item));
}

function getManagerNamesForChannel(channel) {
  const managers = (state.planData && state.planData.managers) || {};
  return Object.keys(managers)
    .filter((name) => getManagerChannel(managers[name]) === channel)
    .sort((a, b) => a.localeCompare(b, "ru"));
}

function handleChannelChange() {
  state.currentChannel = els.channelFilter.value;
  hydrateManagers({ preserveManager: false });
  refreshContext({ shouldRestoreDraft: true });
}

function handleManagerChange() {
  const manager = state.planData?.managers?.[els.managerSelect.value];
  if (manager) {
    const channel = getManagerChannel(manager);
    state.currentChannel = channel;
    if (els.channelFilter.value !== channel) {
      els.channelFilter.value = channel;
    }
  }
  refreshContext({ shouldRestoreDraft: true });
}

function handleArticleFilterChange() {
  state.articleFilters.priority = els.articlePriorityFilter ? els.articlePriorityFilter.value : "all";
  state.articleFilters.status = els.articleStatusFilter ? els.articleStatusFilter.value : "all";
  state.articleFilters.search = els.articleSearch ? els.articleSearch.value.trim().toLowerCase() : "";
  renderArticles();
  saveDraft(false);
}


function resetArticleFilters() {
  state.articleFilters = { priority: "all", status: "all", search: "" };
  if (els.articlePriorityFilter) els.articlePriorityFilter.value = "all";
  if (els.articleStatusFilter) els.articleStatusFilter.value = "all";
  if (els.articleSearch) els.articleSearch.value = "";
}

function setupStaticTexts() {
  if (els.siteTitle) {
    els.siteTitle.textContent = `${state.config.organizationName} — тетрадь менеджеров и координатора`;
  }
  els.packStatusBadge.textContent = `${state.config.packSize} артикулов`;
  els.submitStatusBadge.textContent = state.config.appsScriptUrl ? "Google Apps Script" : "локально";
}

function setDefaultDate() {
  const today = new Date();
  els.reportDate.value = formatDateInput(today);
}


async function loadData() {
  try {
    const planUrl = getVersionedUrl(state.config.planDataUrl);
    const tasksUrl = getVersionedUrl(state.config.tasksDataUrl);
    const overridesUrl = getVersionedUrl(state.config.overridesDataUrl);

    const [planResponse, tasksResponse, overridesResponse] = await Promise.all([
      fetch(planUrl, { cache: "no-store" }),
      fetch(tasksUrl, { cache: "no-store" }),
      fetch(overridesUrl, { cache: "no-store" })
    ]);

    if (!planResponse.ok) {
      throw new Error(`Не удалось загрузить article-plan.json (${planResponse.status})`);
    }
    if (!tasksResponse.ok) {
      throw new Error(`Не удалось загрузить daily-tasks.json (${tasksResponse.status})`);
    }
    if (!overridesResponse.ok) {
      throw new Error(`Не удалось загрузить daily-article-overrides.json (${overridesResponse.status})`);
    }

    state.planData = await planResponse.json();
    state.tasksData = await tasksResponse.json();
    state.overridesData = await overridesResponse.json();

    const rolesCount = Object.keys(state.planData.managers || {}).length;
    els.planStatusBadge.textContent = `${rolesCount} роли`;
    setBanner("Данные загружены: площадки разделены, менеджеры отфильтрованы по каналу, инструкции по артикулам подтянуты из daily-article-overrides.json.", "success");
  } catch (error) {
    console.error(error);
    setBanner(`Не получилось загрузить данные сайта: ${error.message}. Проверьте файлы data/article-plan.json, data/daily-tasks.json и data/daily-article-overrides.json.`, "error");
    els.planStatusBadge.textContent = "ошибка";
  }
}

function hydrateManagers({ preserveManager = true } = {}) {
  const managers = (state.planData && state.planData.managers) || {};
  const channelOptions = getChannelOptions();

  if (!els.channelFilter) return;

  const previousChannel = state.currentChannel || els.channelFilter.value;
  if (!channelOptions.includes(els.channelFilter.value)) {
    els.channelFilter.innerHTML = channelOptions.map((channel) => `<option value="${escapeHtml(channel)}">${escapeHtml(channel)}</option>`).join("");
  }

  const desiredChannel = channelOptions.includes(previousChannel) ? previousChannel : channelOptions[0];
  state.currentChannel = desiredChannel || "";
  if (desiredChannel) {
    els.channelFilter.value = desiredChannel;
  }

  const managerNames = getManagerNamesForChannel(state.currentChannel);
  const previousManager = preserveManager ? els.managerSelect.value : "";
  els.managerSelect.innerHTML = managerNames.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");

  const keepManager = previousManager && managerNames.includes(previousManager);
  if (keepManager) {
    els.managerSelect.value = previousManager;
  } else if (managerNames.length) {
    els.managerSelect.selectedIndex = 0;
  }

  renderManagerSummary();
}

function renderManagerSummary() {
  const managers = (state.planData && state.planData.managers) || {};
  const names = Object.keys(managers).sort((a, b) => a.localeCompare(b, "ru"));
  if (!names.length) {
    els.managerSummaryList.innerHTML = "<li>Данные ещё не загружены.</li>";
    return;
  }

  els.managerSummaryList.innerHTML = names.map((name) => {
    const item = managers[name];
    const channel = getManagerChannel(item);
    const suffix = item.articleCount
      ? `${channel}, ${item.articleCount} артикулов, ${item.packCount} пакета`
      : `${channel}, без пакета артикулов`;
    return `<li><strong>${escapeHtml(name)}</strong> — ${escapeHtml(suffix)}</li>`;
  }).join("");
}

function applyQueryDefaults() {
  const params = new URLSearchParams(window.location.search);
  const managerFromQuery = params.get("manager");
  const channelFromQuery = params.get("channel");
  const dateFromQuery = params.get("date");

  if (dateFromQuery && /^\d{4}-\d{2}-\d{2}$/.test(dateFromQuery)) {
    els.reportDate.value = dateFromQuery;
  }

  const managers = state.planData?.managers || {};

  if (managerFromQuery && managers[managerFromQuery]) {
    const channel = getManagerChannel(managers[managerFromQuery]);
    state.currentChannel = channel;
    els.channelFilter.value = channel;
    hydrateManagers({ preserveManager: false });
    els.managerSelect.value = managerFromQuery;
    return;
  }

  if (channelFromQuery && getChannelOptions().includes(channelFromQuery)) {
    state.currentChannel = channelFromQuery;
    els.channelFilter.value = channelFromQuery;
    hydrateManagers({ preserveManager: false });
    return;
  }

  hydrateManagers({ preserveManager: true });
}

function refreshContext({ shouldRestoreDraft = false } = {}) {
  if (!state.planData || !state.planData.managers) {
    return;
  }

  if (!els.managerSelect.value) {
    const managerNames = getManagerNamesForChannel(els.channelFilter.value || state.currentChannel || "");
    if (managerNames.length) {
      els.managerSelect.value = managerNames[0];
    } else {
      return;
    }
  }

  state.managerKey = els.managerSelect.value;
  state.managerData = state.planData.managers[state.managerKey];

  if (!state.managerData) {
    return;
  }

  state.currentChannel = getManagerChannel(state.managerData);
  if (els.channelFilter.value !== state.currentChannel) {
    els.channelFilter.value = state.currentChannel;
  }

  state.currentReportId = cryptoRandomId();

  els.channel.value = getManagerChannel(state.managerData) || "";
  if (!els.department.value || shouldRestoreDraft) {
    els.department.value = state.managerData.department || "";
  }

  updateManagerLinkPreview();
  buildTasksForContext();
  buildPackForContext();
  resetArticleFilters();

  if (state.managerData.role !== "supplyCoordinator") {
    const packText = state.dailyPack.length ? `Пакет ${state.packMeta.packNo} из ${state.packMeta.packCount} готов.` : "Пакет пустой.";
    setBanner(`${state.currentChannel} · ${state.managerKey}: ${packText}`, "success");
  }

  toggleRoleSections();

  if (shouldRestoreDraft) {
    restoreDraft();
  } else if (!state.actions.length) {
    state.actions = [makeEmptyAction()];
  }

  renderAll();
}

function buildTasksForContext() {
  const dateKey = els.reportDate.value;
  const managerName = state.managerKey;
  const taskSources = [];
  const tasksData = state.tasksData || {};
  const previousById = Object.fromEntries((state.dynamicTasks || []).map((task) => [task.id, task]));

  taskSources.push(...(tasksData.defaultTasks || []));
  taskSources.push(...(((tasksData.managerDefaults || {})[managerName]) || []));

  const byDate = (tasksData.byDate || {})[dateKey] || {};
  taskSources.push(...(byDate.all || []));
  taskSources.push(...(((byDate.managers || {})[managerName]) || []));

  state.dynamicTasks = taskSources.map((task, index) => {
    const id = task.id || slugify(`${managerName}-${dateKey}-${task.title || index}`);
    return {
      id,
      title: task.title || `Задача ${index + 1}`,
      type: task.type || "task",
      status: previousById[id]?.status || "",
      comment: previousById[id]?.comment || ""
    };
  });
}

function buildPackForContext() {
  const packSize = state.config.packSize || state.planData.packSizeDefault || 20;
  const reportDate = parseReportDate();
  const monthKey = `${reportDate.getFullYear()}-${String(reportDate.getMonth() + 1).padStart(2, "0")}`;

  const orderedArticles = [...(state.managerData?.articles || [])].sort((a, b) => {
    return getPriorityScore(b, monthKey) - getPriorityScore(a, monthKey);
  });

  if (!orderedArticles.length) {
    state.articleStates = {};
    state.dailyPack = [];
    state.filteredPack = [];
    state.packMeta = {
      packNo: 0,
      packCount: 0,
      packSize: 0,
      workingDays: getWorkingDaysInMonth(reportDate),
      monthKey,
      anchorDate: formatDateInput(getCycleAnchorDate(reportDate)),
      totalPlan: { orders: 0, margin: 0, revenue: 0 },
      bucketCounts: { critical: 0, high: 0, medium: 0, low: 0 }
    };
    els.packBadge.textContent = "Пакет — не используется";
    els.articlesCountBadge.textContent = "Артикулы: 0";
    els.sourceBadge.textContent = `Источник: ${getManagerChannel(state.managerData) || "—"}`;
    if (els.priorityBadge) {
      els.priorityBadge.textContent = "Приоритеты: нет пакета";
    }
    return;
  }

  const packCount = Math.max(1, Math.ceil(orderedArticles.length / packSize));
  const anchorDate = getCycleAnchorDate(reportDate);
  const packIndex = orderedArticles.length ? (getBusinessDayIndex(reportDate, anchorDate) % packCount) : 0;
  const desiredLength = Math.min(packSize, orderedArticles.length);

  let dailyPack = orderedArticles.slice(packIndex * packSize, packIndex * packSize + desiredLength);
  if (dailyPack.length < desiredLength) {
    dailyPack = dailyPack.concat(orderedArticles.slice(0, desiredLength - dailyPack.length));
  }

  const workingDays = getWorkingDaysInMonth(reportDate);
  const totalPlan = { orders: 0, margin: 0, revenue: 0 };
  const previousArticleState = { ...state.articleStates };
  state.articleStates = {};

  dailyPack.forEach((article, index) => {
    const key = getArticleKey(article);
    const merged = getMergedArticleView(article);
    const metrics = getMonthMetrics(article, monthKey);
    const dailyPlan = {
      orders: safeDivide(metrics.orders, workingDays),
      margin: safeDivide(metrics.marginIncome, workingDays),
      revenue: safeDivide(metrics.revenue, workingDays)
    };

    totalPlan.orders += dailyPlan.orders;
    totalPlan.margin += dailyPlan.margin;
    totalPlan.revenue += dailyPlan.revenue;

    state.articleStates[key] = {
      key,
      priority: index + 1,
      priorityBucket: merged.priorityBucket || getPriorityBucket(index, dailyPack.length),
      priorityReason: merged.priorityReason || "",
      managerTask: merged.managerTask || "",
      sourceComment: merged.sourceComment || "",
      status: previousArticleState[key]?.status || "",
      comment: previousArticleState[key]?.comment || "",
      factOrders: previousArticleState[key]?.factOrders || "",
      factMargin: previousArticleState[key]?.factMargin || "",
      factRevenue: previousArticleState[key]?.factRevenue || "",
      dailyPlan
    };
  });

  state.dailyPack = dailyPack;
  const bucketCounts = Object.values(state.articleStates).reduce((acc, item) => {
    const bucket = item.priorityBucket || "low";
    acc[bucket] = (acc[bucket] || 0) + 1;
    return acc;
  }, {});
  state.packMeta = {
    packNo: packIndex + 1,
    packCount,
    packSize: desiredLength,
    workingDays,
    monthKey,
    anchorDate: formatDateInput(anchorDate),
    totalPlan,
    bucketCounts
  };

  els.packBadge.textContent = `Пакет ${state.packMeta.packNo} из ${state.packMeta.packCount}`;
  els.articlesCountBadge.textContent = `Артикулы: ${desiredLength}`;
  els.sourceBadge.textContent = `Источник: ${getManagerChannel(state.managerData)}`;
  if (els.priorityBadge) {
    const c = bucketCounts.critical || 0;
    const h = bucketCounts.high || 0;
    const m = bucketCounts.medium || 0;
    const l = bucketCounts.low || 0;
    els.priorityBadge.textContent = `Приоритеты: критично ${c} · высокий ${h} · средний ${m} · низкий ${l}`;
  }
}


function renderAll() {
  updateArticleHeader();
  renderSummary();
  renderTasks();
  renderArticles();
  renderActions();
  renderLocalHistory();
  updateManagerLinkPreview();
  toggleRoleSections();
  updateSetupState();
}

function updateArticleHeader() {
  const header = document.getElementById("articleIdHeader");
  if (!header) return;
  header.textContent = state.managerData?.channel === "Ozon" ? "Ozon артикул" : "WB артикул";
}

function renderSummary() {
  const totalPlan = state.packMeta ? state.packMeta.totalPlan : { orders: 0, margin: 0, revenue: 0 };

  els.headlineArticles.textContent = `${state.dailyPack.length || 0}`;
  els.headlineArticlesSub.textContent = state.dailyPack.length ? `Пакет ${state.packMeta.packNo} из ${state.packMeta.packCount}` : "Пакет не используется";

  els.headlineOrdersPlan.textContent = formatNumber(totalPlan.orders);
  els.headlineMarginPlan.textContent = formatCurrency(totalPlan.margin);
  els.headlineRevenuePlan.textContent = formatCurrency(totalPlan.revenue);

  els.ordersPlanCell.textContent = formatNumber(totalPlan.orders);
  els.marginPlanCell.textContent = formatCurrency(totalPlan.margin);
  els.revenuePlanCell.textContent = formatCurrency(totalPlan.revenue);

  updateDeviationCell(els.ordersDeviation, totalPlan.orders, toNumber(els.ordersFact.value));
  updateDeviationCell(els.marginDeviation, totalPlan.margin, toNumber(els.marginFact.value));
  updateDeviationCell(els.revenueDeviation, totalPlan.revenue, toNumber(els.revenueFact.value));

  const rowTotals = getArticleFactTotals();
  els.rowFactsHint.textContent = rowTotals.orders || rowTotals.margin || rowTotals.revenue
    ? `По строкам сейчас: заказов ${formatNumber(rowTotals.orders)}, маржи ${formatCurrency(rowTotals.margin)}, выручки ${formatCurrency(rowTotals.revenue)}.`
    : "По строкам пока нет факта.";
}

function renderTasks() {
  if (!state.dynamicTasks.length) {
    els.tasksList.innerHTML = `<div class="empty-state">На эту дату задачи пока не заданы.</div>`;
    return;
  }

  els.tasksList.innerHTML = state.dynamicTasks.map((task) => `
    <article class="task-card" data-task-id="${escapeHtml(task.id)}">
      <div class="task-head">
        <div>
          <div class="task-title">${escapeHtml(task.title)}</div>
          <div class="task-meta">Тип: ${escapeHtml(task.type || "task")}</div>
        </div>
        <div class="row-select">
          <select data-task-field="status">
            ${renderStatusOptions(task.status)}
          </select>
        </div>
      </div>
      <label class="field">
        <span>Комментарий менеджера</span>
        <textarea rows="2" data-task-field="comment" placeholder="Что сделано, что мешает, какой итог">${escapeHtml(task.comment || "")}</textarea>
      </label>
    </article>
  `).join("");
}


function getFilteredPack() {
  const priority = state.articleFilters.priority || "all";
  const status = state.articleFilters.status || "all";
  const search = (state.articleFilters.search || "").trim().toLowerCase();

  return state.dailyPack.filter((article) => {
    const key = getArticleKey(article);
    const row = state.articleStates[key] || {};
    const merged = getMergedArticleView(article);
    const effectiveStatus = row.status || "not_started";

    if (priority !== "all" && (row.priorityBucket || merged.priorityBucket || "low") !== priority) {
      return false;
    }
    if (status !== "all" && effectiveStatus !== status) {
      return false;
    }
    if (search) {
      const haystack = [
        String(getPlatformArticleId(article) || ""),
        String(article.sellerArticle || ""),
        String(article.name || ""),
        String(merged.managerTask || ""),
        String(merged.sourceComment || "")
      ].join(" ").toLowerCase();
      if (!haystack.includes(search)) {
        return false;
      }
    }
    return true;
  });
}

function renderArticles() {
  if (!state.dailyPack.length) {
    const message = state.managerData?.role === "supplyCoordinator"
      ? "Для координатора поставок пакет артикулов не используется. Ниже доступны задачи, тетрадь действий и итог дня."
      : "На выбранную дату пакет пустой.";
    els.articlesBody.innerHTML = `<tr><td colspan="11" class="empty-state cell-empty">${message}</td></tr>`;
    return;
  }

  const filteredPack = getFilteredPack();
  state.filteredPack = filteredPack;

  if (!filteredPack.length) {
    els.articlesBody.innerHTML = `<tr><td colspan="11" class="empty-state cell-empty">По выбранному фильтру артикулы не найдены. Сбросьте фильтр по приоритету, статусу или поиску.</td></tr>`;
    return;
  }

  els.articlesBody.innerHTML = filteredPack.map((article) => {
    const key = getArticleKey(article);
    const articleState = state.articleStates[key] || {};
    const merged = getMergedArticleView(article);
    const metrics = getMonthMetrics(article, state.packMeta.monthKey);
    const dailyPlan = articleState.dailyPlan || { orders: 0, margin: 0, revenue: 0 };
    const monthBuyout = metrics.buyout ?? article.targetBuyout ?? article.baseBuyout;
    const metaBits = [
      article.category ? `Категория: ${article.category}` : "",
      article.status ? `Статус: ${article.status}` : "",
      monthBuyout !== null && monthBuyout !== undefined && monthBuyout !== "" ? `Выкуп: ${formatPercent(monthBuyout)}` : ""
    ].filter(Boolean).join(" · ");

    const sourceComment = articleState.sourceComment || merged.sourceComment || article.sourceComment || article.managerComment || "";
    const managerTask = articleState.managerTask || merged.managerTask || article.managerTask || "Проверить цену, рекламу, остатки и выполнить план дня по артикулу.";
    const priorityReason = articleState.priorityReason || merged.priorityReason || article.priorityReason || "";
    const priorityBucket = articleState.priorityBucket || merged.priorityBucket || "low";

    return `
      <tr data-article-key="${escapeHtml(key)}">
        <td><strong>${articleState.priority || "—"}</strong></td>
        <td><span class="pill ${priorityBucket}">${getPriorityLabel(priorityBucket)}</span></td>
        <td>
          <div class="product-title">${getPlatformArticleId(article) ? escapeHtml(String(getPlatformArticleId(article))) : "—"}</div>
          <div class="product-meta">${escapeHtml(article.sellerArticle || "")}</div>
        </td>
        <td>
          <div class="product-title">${escapeHtml(article.name || "Без названия")}</div>
          <div class="product-meta">${escapeHtml(metaBits)}</div>
        </td>
        <td class="work-cell">
          <div class="work-title">${escapeHtml(managerTask)}</div>
          ${sourceComment ? `<div class="product-note source-comment">Комментарий из анализа: ${escapeHtml(sourceComment)}</div>` : `<div class="product-note source-comment">Комментарий из анализа не указан.</div>`}
          ${priorityReason ? `<div class="small-text priority-reason">Почему в приоритете: ${escapeHtml(priorityReason)}</div>` : ""}
        </td>
        <td>
          <div class="metric-stack">
            <span><strong>${formatNumber(metrics.orders)}</strong> заказов / мес</span>
            <span><strong>${formatCurrency(metrics.marginIncome)}</strong> маржи / мес</span>
            <span><strong>${formatCurrency(metrics.revenue)}</strong> выручки / мес</span>
          </div>
        </td>
        <td>
          <div class="metric-stack">
            <span><strong>${formatNumber(dailyPlan.orders)}</strong> заказов / день</span>
            <span><strong>${formatCurrency(dailyPlan.margin)}</strong> маржи / день</span>
            <span><strong>${formatCurrency(dailyPlan.revenue)}</strong> выручки / день</span>
          </div>
        </td>
        <td class="row-input">
          <input type="number" min="0" step="0.01" data-article-field="factOrders" value="${escapeAttribute(articleState.factOrders || "")}" placeholder="0" />
        </td>
        <td class="row-input">
          <input type="number" min="0" step="0.01" data-article-field="factMargin" value="${escapeAttribute(articleState.factMargin || "")}" placeholder="0" />
        </td>
        <td class="row-select">
          <select data-article-field="status">
            ${renderWorkStatusOptions(articleState.status || "not_started")}
          </select>
        </td>
        <td class="row-comment">
          <textarea rows="3" data-article-field="comment" placeholder="Что сделал по артикулу, какой вывод, что дальше">${escapeHtml(articleState.comment || "")}</textarea>
        </td>
      </tr>
    `;
  }).join("");
}


function renderActions() {
  if (!state.actions.length) {
    els.actionsList.innerHTML = `<div class="empty-state">Пока нет записей. Добавьте действие, чтобы вести тетрадь с сайта.</div>`;
    return;
  }

  els.actionsList.innerHTML = state.actions.map((action) => {
    const articleOptions = [`<option value="" ${!action.articleKey ? "selected" : ""}>Не привязано</option>`].concat(
      state.dailyPack.map((article) => {
        const key = getArticleKey(article);
        const label = `${getPlatformArticleId(article) || "—"} · ${article.name || article.sellerArticle || "артикул"}`;
        return `<option value="${escapeAttribute(key)}" ${action.articleKey === key ? "selected" : ""}>${escapeHtml(label)}</option>`;
      })
    ).join("");

    return `
    <article class="action-card" data-action-id="${escapeHtml(action.id)}">
      <div class="action-head">
        <div>
          <div class="task-title">${escapeHtml(action.title || "Действие менеджера")}</div>
          <div class="action-meta">Фиксируем, что сделали и что дальше</div>
        </div>
        <button type="button" class="btn btn-danger small" data-action-cmd="remove">Удалить</button>
      </div>

      <div class="action-grid">
        <label class="field">
          <span>Время</span>
          <input type="time" data-action-field="time" value="${escapeAttribute(action.time || "")}" />
        </label>

        <label class="field">
          <span>Артикул</span>
          <select data-action-field="articleKey">
            ${articleOptions}
          </select>
        </label>

        <label class="field">
          <span>Что сделал</span>
          <input type="text" data-action-field="action" value="${escapeAttribute(action.action || "")}" placeholder="Изменил ставку, проверил цену, отработал остатки…" />
        </label>

        <label class="field">
          <span>Результат</span>
          <input type="text" data-action-field="result" value="${escapeAttribute(action.result || "")}" placeholder="Что получилось на выходе" />
        </label>

        <label class="field">
          <span>Следующий шаг</span>
          <input type="text" data-action-field="nextStep" value="${escapeAttribute(action.nextStep || "")}" placeholder="Что надо сделать дальше" />
        </label>

        <label class="field">
          <span>Комментарий</span>
          <input type="text" data-action-field="comment" value="${escapeAttribute(action.comment || "")}" placeholder="Любая полезная пометка" />
        </label>
      </div>
    </article>
  `;
  }).join("");
}

function renderLocalHistory() {
  const reports = getLocalReports().slice(0, 8);
  if (!reports.length) {
    els.localHistoryList.innerHTML = `<div class="empty-state">После сохранения отчётов здесь появится локальная история браузера.</div>`;
    return;
  }

  els.localHistoryList.innerHTML = reports.map((report) => `
    <article class="history-card">
      <div>
        <div class="history-title">${escapeHtml(report.managerName || "Менеджер")} · ${escapeHtml(report.reportDate || "")}</div>
        <div class="history-meta">${escapeHtml(report.channel || "")} · заказов факт ${formatNumber(report.fact?.orders)} · маржи факт ${formatCurrency(report.fact?.margin)}</div>
      </div>
      <div class="history-actions">
        <button type="button" class="btn btn-secondary small" data-history-fill="${escapeAttribute(report.id)}">Вставить</button>
      </div>
    </article>
  `).join("");

  els.localHistoryList.querySelectorAll("[data-history-fill]").forEach((button) => {
    button.addEventListener("click", () => {
      const reportId = button.getAttribute("data-history-fill");
      const report = getLocalReports().find((item) => item.id === reportId);
      if (report) {
        applySavedReport(report, { keepContext: true });
        renderAll();
        saveDraft(false);
        showMessage("Локальный отчёт подставлен в форму.", "success");
      }
    });
  });
}

function updateManagerLinkPreview() {
  if (!state.managerKey) {
    els.managerLinkPreview.value = "";
    return;
  }
  const manager = state.managerData || {};
  els.managerLinkPreview.value = manager.responsibility || `${manager.channel || "Роль"}: ежедневные задачи и журнал работы.`;
}

function toggleRoleSections() {
  const isSupply = state.managerData?.role === "supplyCoordinator";
  if (els.numbersPanel) {
    els.numbersPanel.classList.toggle("hidden", isSupply);
  }
  if (els.articlesPanel) {
    els.articlesPanel.classList.toggle("hidden", isSupply);
  }
  if (els.downloadPackBtn) {
    els.downloadPackBtn.disabled = isSupply || !state.dailyPack.length;
  }
  if (isSupply) {
    setBanner("Выбран координатор поставок: блок артикулов и план/факт скрыты, доступны задачи, тетрадь действий и итог дня.", "info");
  }
}

function updateSetupState() {
  els.submitStatusBadge.textContent = state.config.appsScriptUrl ? "Google Apps Script" : "локально";
  const hasSheet = Boolean(state.config.googleSheetUrl);
  if (els.openSheetBtn) {
    els.openSheetBtn.disabled = !hasSheet;
    els.openSheetBtn.classList.toggle("hidden", !hasSheet);
    els.openSheetBtn.textContent = "Открыть общую таблицу";
  }
  if (els.openSheetBtnTop) {
    els.openSheetBtnTop.disabled = !hasSheet;
    els.openSheetBtnTop.classList.toggle("hidden", !hasSheet);
  }
  if (els.downloadPackBtn) {
    els.downloadPackBtn.textContent = state.dailyPack.length
      ? `Скачать пакет CSV · ${state.managerKey}`
      : "Скачать текущий пакет CSV";
  }
}

function handleScalarInput() {
  renderSummary();
  saveDraft(false);
}

function handleTaskInput(event) {
  const card = event.target.closest("[data-task-id]");
  if (!card) return;
  const id = card.getAttribute("data-task-id");
  const task = state.dynamicTasks.find((item) => item.id === id);
  if (!task) return;

  const field = event.target.getAttribute("data-task-field");
  if (!field) return;
  task[field] = event.target.value;
  saveDraft(false);
}

function handleArticleInput(event) {
  const row = event.target.closest("[data-article-key]");
  if (!row) return;
  const key = row.getAttribute("data-article-key");
  const field = event.target.getAttribute("data-article-field");
  if (!field || !state.articleStates[key]) return;

  state.articleStates[key][field] = event.target.value;
  renderSummary();
  saveDraft(false);
}

function handleActionInput(event) {
  const card = event.target.closest("[data-action-id]");
  if (!card) return;
  const id = card.getAttribute("data-action-id");
  const action = state.actions.find((item) => item.id === id);
  if (!action) return;
  const field = event.target.getAttribute("data-action-field");
  if (!field) return;
  action[field] = event.target.value;
  saveDraft(false);
}

function handleActionClick(event) {
  const button = event.target.closest("[data-action-cmd]");
  if (!button) return;
  const card = button.closest("[data-action-id]");
  if (!card) return;
  const id = card.getAttribute("data-action-id");

  if (button.getAttribute("data-action-cmd") === "remove") {
    state.actions = state.actions.filter((item) => item.id !== id);
    if (!state.actions.length) {
      state.actions = [];
    }
    renderActions();
    saveDraft(false);
  }
}

function addActionRow() {
  state.actions.push(makeEmptyAction());
  renderActions();
  saveDraft(false);
}

function makeEmptyAction() {
  return {
    id: cryptoRandomId(),
    title: "Действие менеджера",
    time: "",
    articleKey: "",
    action: "",
    result: "",
    nextStep: "",
    comment: ""
  };
}

function saveDraft(showFeedback = false) {
  const payload = serializeCurrentReport();
  const key = getDraftKey();
  try {
    localStorage.setItem(key, JSON.stringify(payload));
    if (showFeedback) {
      showMessage("Черновик сохранён в браузере.", "success");
    }
  } catch (error) {
    console.error(error);
    if (showFeedback) {
      showMessage("Не удалось сохранить черновик в браузере.", "error");
    }
  }
}

function restoreDraft() {
  const key = getDraftKey();
  const raw = localStorage.getItem(key);
  if (raw) {
    try {
      const payload = JSON.parse(raw);
      applySavedReport(payload, { keepContext: true });
      showMessage("Подтянула черновик для текущего сотрудника и даты.", "success");
      return;
    } catch (error) {
      console.error(error);
    }
  }

  resetFieldsForFreshContext();
  state.currentReportId = cryptoRandomId();
}

function resetFieldsForFreshContext() {
  els.dayFocus.value = "";
  els.overallStatus.value = "green";
  els.ordersFact.value = "";
  els.marginFact.value = "";
  els.revenueFact.value = "";
  els.numbersComment.value = "";
  els.doneSummary.value = "";
  els.blockers.value = "";
  els.helpNeeded.value = "";
  els.tomorrowFocus.value = "";
  els.department.value = state.managerData ? (state.managerData.department || "") : "";

  state.dynamicTasks = state.dynamicTasks.map((task) => ({ ...task, status: "", comment: "" }));
  Object.keys(state.articleStates).forEach((key) => {
    state.articleStates[key] = {
      ...state.articleStates[key],
      status: "",
      comment: "",
      factOrders: "",
      factMargin: "",
      factRevenue: ""
    };
  });
  state.actions = [makeEmptyAction()];
}

function clearCurrentDraft() {
  localStorage.removeItem(getDraftKey());
  const keepManager = state.managerKey;
  const keepDate = els.reportDate.value;
  els.dayFocus.value = "";
  els.overallStatus.value = "green";
  els.ordersFact.value = "";
  els.marginFact.value = "";
  els.revenueFact.value = "";
  els.numbersComment.value = "";
  els.doneSummary.value = "";
  els.blockers.value = "";
  els.helpNeeded.value = "";
  els.tomorrowFocus.value = "";
  els.department.value = state.managerData ? (state.managerData.department || "") : "";
  state.dynamicTasks.forEach((task) => {
    task.status = "";
    task.comment = "";
  });
  Object.values(state.articleStates).forEach((article) => {
    article.status = "";
    article.comment = "";
    article.factOrders = "";
    article.factMargin = "";
    article.factRevenue = "";
  });
  state.actions = [makeEmptyAction()];
  state.currentReportId = cryptoRandomId();
  renderAll();
  showMessage(`Черновик для ${keepManager} на ${keepDate} очищен.`, "warn");
}

function fillFromLastReport() {
  const reports = getLocalReports().filter((report) => report.managerName === state.managerKey);
  if (!reports.length) {
    showMessage("Для этого менеджера ещё нет локально сохранённых отчётов.", "warn");
    return;
  }
  applySavedReport(reports[0], { keepContext: true });
  renderAll();
  saveDraft(false);
  showMessage("Последний локальный отчёт подставлен в форму.", "success");
}

function syncFactsFromRows() {
  const totals = getArticleFactTotals();
  els.ordersFact.value = totals.orders ? roundForInput(totals.orders) : "";
  els.marginFact.value = totals.margin ? roundForInput(totals.margin) : "";
  els.revenueFact.value = totals.revenue ? roundForInput(totals.revenue) : "";
  renderSummary();
  saveDraft(false);
  showMessage("Факт по заказам, марже и выручке подтянут из строк артикулов.", "success");
}

function exportCurrentJson() {
  const payload = serializeCurrentReport();
  const fileName = `manager-report-${payload.managerName || "manager"}-${payload.reportDate || "date"}.json`;
  downloadText(fileName, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
}

function asyncFormSubmit(url, fields) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = url;
  form.target = "submitFrame";
  form.style.display = "none";

  Object.entries(fields).forEach(([name, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = typeof value === "string" ? value : JSON.stringify(value);
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);
}

function submitReport() {
  const payload = serializeCurrentReport();
  saveReportToLocalHistory(payload);
  saveDraft(false);

  if (state.config.appsScriptUrl) {
    asyncFormSubmit(state.config.appsScriptUrl, {
      reportId: payload.id,
      reportDate: payload.reportDate,
      managerName: payload.managerName,
      channel: payload.channel,
      department: payload.department,
      overallStatus: payload.overallStatus,
      dayFocus: payload.dayFocus,
      packNo: String(payload.pack.packNo || ""),
      packCount: String(payload.pack.packCount || ""),
      packSize: String(payload.pack.packSize || ""),
      monthKey: payload.pack.monthKey || "",
      planOrders: String(payload.plan.orders || ""),
      factOrders: String(payload.fact.orders || ""),
      planMargin: String(payload.plan.margin || ""),
      factMargin: String(payload.fact.margin || ""),
      planRevenue: String(payload.plan.revenue || ""),
      factRevenue: String(payload.fact.revenue || ""),
      numbersComment: payload.numbersComment || "",
      doneSummary: payload.doneSummary || "",
      blockers: payload.blockers || "",
      helpNeeded: payload.helpNeeded || "",
      tomorrowFocus: payload.tomorrowFocus || "",
      tasksJson: JSON.stringify(payload.tasks),
      articleFactsJson: JSON.stringify(payload.articles),
      actionJournalJson: JSON.stringify(payload.actions),
      rawJson: JSON.stringify(payload),
      source: "github-pages",
      pageUrl: window.location.href,
      submittedAtLocal: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      userAgent: navigator.userAgent || ""
    });
    showMessage("Отчёт сохранён локально и отправлен в Apps Script.", "success");
  } else {
    showMessage("Отчёт сохранён локально. Чтобы отчёты стекались в одну таблицу, позже добавьте appsScriptUrl и googleSheetUrl в config.js.", "warn");
  }

  if (state.config.clearAfterSubmit) {
    clearCurrentDraft();
  } else {
    renderLocalHistory();
  }
}

function saveReportToLocalHistory(payload) {
  const reports = getLocalReports();
  const next = [payload, ...reports.filter((item) => item.id !== payload.id)].slice(0, state.config.maxLocalReports || 40);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
}

function getLocalReports() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch (error) {
    console.error(error);
    return [];
  }
}


function applySavedReport(report, { keepContext = false } = {}) {
  if (!keepContext) {
    if (report.managerName && state.planData.managers[report.managerName]) {
      const manager = state.planData.managers[report.managerName];
      const channel = getManagerChannel(manager);
      state.currentChannel = channel;
      els.channelFilter.value = channel;
      hydrateManagers({ preserveManager: false });
      els.managerSelect.value = report.managerName;
    }
    if (report.reportDate) {
      els.reportDate.value = report.reportDate;
    }
    refreshContext({ shouldRestoreDraft: false });
  }

  els.department.value = report.department || (state.managerData?.department || "");
  els.dayFocus.value = report.dayFocus || "";
  els.overallStatus.value = report.overallStatus || "green";
  els.ordersFact.value = report.fact?.orders ?? "";
  els.marginFact.value = report.fact?.margin ?? "";
  els.revenueFact.value = report.fact?.revenue ?? "";
  els.numbersComment.value = report.numbersComment || "";
  els.doneSummary.value = report.doneSummary || "";
  els.blockers.value = report.blockers || "";
  els.helpNeeded.value = report.helpNeeded || "";
  els.tomorrowFocus.value = report.tomorrowFocus || "";

  const taskById = Object.fromEntries((report.tasks || []).map((task) => [task.id, task]));
  state.dynamicTasks = state.dynamicTasks.map((task) => ({
    ...task,
    status: taskById[task.id]?.status || "",
    comment: taskById[task.id]?.comment || ""
  }));

  const articleByKey = Object.fromEntries((report.articles || []).map((article) => [article.key, article]));
  Object.keys(state.articleStates).forEach((key) => {
    const saved = articleByKey[key];
    if (saved) {
      state.articleStates[key] = {
        ...state.articleStates[key],
        status: saved.status || "",
        comment: saved.comment || "",
        factOrders: saved.factOrders ?? "",
        factMargin: saved.factMargin ?? "",
        factRevenue: saved.factRevenue ?? ""
      };
    }
  });

  state.actions = (report.actions && report.actions.length)
    ? report.actions.map((action) => ({
        id: action.id || cryptoRandomId(),
        title: action.title || "Действие менеджера",
        time: action.time || "",
        articleKey: action.articleKey || "",
        action: action.action || "",
        result: action.result || "",
        nextStep: action.nextStep || "",
        comment: action.comment || ""
      }))
    : [makeEmptyAction()];
}


function serializeCurrentReport() {
  const totals = state.packMeta ? state.packMeta.totalPlan : { orders: 0, margin: 0, revenue: 0 };

  return {
    id: state.currentReportId || (state.currentReportId = cryptoRandomId()),
    reportDate: els.reportDate.value,
    managerName: state.managerKey,
    channel: getManagerChannel(state.managerData) || "",
    role: state.managerData?.role || "marketplaceManager",
    department: els.department.value || "",
    overallStatus: els.overallStatus.value || "green",
    dayFocus: els.dayFocus.value || "",
    pack: {
      packNo: state.packMeta?.packNo || 1,
      packCount: state.packMeta?.packCount || 1,
      packSize: state.dailyPack.length,
      monthKey: state.packMeta?.monthKey || "",
      anchorDate: state.packMeta?.anchorDate || "",
      workingDays: state.packMeta?.workingDays || 0
    },
    plan: {
      orders: roundTo2(totals.orders),
      margin: roundTo2(totals.margin),
      revenue: roundTo2(totals.revenue)
    },
    fact: {
      orders: roundTo2(toNumber(els.ordersFact.value)),
      margin: roundTo2(toNumber(els.marginFact.value)),
      revenue: roundTo2(toNumber(els.revenueFact.value))
    },
    numbersComment: els.numbersComment.value || "",
    doneSummary: els.doneSummary.value || "",
    blockers: els.blockers.value || "",
    helpNeeded: els.helpNeeded.value || "",
    tomorrowFocus: els.tomorrowFocus.value || "",
    tasks: state.dynamicTasks.map((task) => ({ id: task.id, title: task.title, type: task.type, status: task.status || "", comment: task.comment || "" })),
    articles: state.dailyPack.map((article) => {
      const key = getArticleKey(article);
      const row = state.articleStates[key] || {};
      const merged = getMergedArticleView(article);
      return {
        key,
        wbArticle: article.wbArticle || "",
        ozonArticle: article.ozonArticle || "",
        platformArticle: getPlatformArticleId(article) || "",
        sellerArticle: article.sellerArticle || "",
        name: article.name || "",
        statusSource: article.status || "",
        priorityBucket: row.priorityBucket || merged.priorityBucket || "",
        priorityReason: row.priorityReason || merged.priorityReason || article.priorityReason || "",
        managerTask: row.managerTask || merged.managerTask || article.managerTask || "",
        sourceComment: row.sourceComment || merged.sourceComment || article.sourceComment || article.managerComment || "",
        planDailyOrders: roundTo2(row.dailyPlan?.orders || 0),
        planDailyMargin: roundTo2(row.dailyPlan?.margin || 0),
        planDailyRevenue: roundTo2(row.dailyPlan?.revenue || 0),
        factOrders: row.factOrders ?? "",
        factMargin: row.factMargin ?? "",
        factRevenue: row.factRevenue ?? "",
        status: row.status || "not_started",
        comment: row.comment || ""
      };
    }),
    actions: state.actions.map((action) => ({ ...action })),
    createdAtLocal: new Date().toISOString()
  };
}


function getDraftKey() {
  return `${STORAGE_PREFIX}:draft:${state.managerKey}:${els.reportDate.value}`;
}


function getArticleFactTotals() {
  return Object.values(state.articleStates).reduce((acc, row) => {
    acc.orders += toNumber(row.factOrders);
    acc.margin += toNumber(row.factMargin);
    acc.revenue += toNumber(row.factRevenue);
    return acc;
  }, { orders: 0, margin: 0, revenue: 0 });
}

function getArticleOverride(article) {
  const managerName = state.managerKey;
  const dateKey = els.reportDate ? els.reportDate.value : "";
  const defaultByManager = state.overridesData?.defaultByManager?.[managerName] || {};
  const dateManager = state.overridesData?.byDate?.[dateKey]?.[managerName] || {};
  const candidates = [
    String(article.wbArticle || "").trim(),
    String(article.ozonArticle || "").trim(),
    String(getPlatformArticleId(article) || "").trim(),
    String(article.sellerArticle || "").trim(),
    getArticleKey(article)
  ].filter(Boolean);

  for (const key of candidates) {
    if (dateManager[key]) return dateManager[key];
  }
  for (const key of candidates) {
    if (defaultByManager[key]) return defaultByManager[key];
  }
  return {};
}

function getMergedArticleView(article) {
  const override = getArticleOverride(article);
  return {
    ...article,
    ...override,
    priorityBucket: override.priorityBucket || article.priorityBucket || "low",
    priorityReason: override.priorityReason || article.priorityReason || "",
    managerTask: override.managerTask || article.managerTask || "",
    sourceComment: override.sourceComment || article.sourceComment || article.managerComment || ""
  };
}

function getPriorityScore(article, monthKey) {
  const metrics = getMonthMetrics(article, monthKey);
  const merged = getMergedArticleView(article);
  const bucketScore = merged.priorityBucket === "critical" ? 3000000000000
    : merged.priorityBucket === "high" ? 2000000000000
    : merged.priorityBucket === "medium" ? 1000000000000
    : 500000000000;
  return bucketScore + Number(metrics.marginIncome || metrics.revenue || metrics.orders || 0);
}

function getMonthMetrics(article, monthKey) {
  const months = article.months || {};
  if (months[monthKey]) return months[monthKey];

  const keys = Object.keys(months).sort();
  const earlier = keys.filter((key) => key <= monthKey);
  if (earlier.length) return months[earlier[earlier.length - 1]];
  return keys.length ? months[keys[keys.length - 1]] : {};
}


function getCycleAnchorDate(date) {
  const configured = parseDateString(state.config.cycleAnchorDate || state.planData?.cycleAnchorDate || "");
  if (configured && configured.getFullYear() === date.getFullYear() && configured.getMonth() === date.getMonth()) {
    return configured;
  }
  return getFirstBusinessDay(date.getFullYear(), date.getMonth());
}

function getFirstBusinessDay(year, monthIndex) {
  for (let day = 1; day <= 31; day += 1) {
    const date = new Date(year, monthIndex, day);
    if (date.getMonth() !== monthIndex) break;
    if (date.getDay() !== 0 && date.getDay() !== 6) return date;
  }
  return new Date(year, monthIndex, 1);
}

function getBusinessDayIndex(date, anchor) {
  if (date < anchor) return 0;
  let count = 0;
  const cursor = new Date(anchor);
  while (cursor <= date) {
    if (cursor.getDay() !== 0 && cursor.getDay() !== 6) {
      count += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.max(count - 1, 0);
}

function getWorkingDaysInMonth(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  let count = 0;
  for (let day = 1; day <= lastDay; day += 1) {
    const item = new Date(year, month, day);
    if (item.getDay() !== 0 && item.getDay() !== 6) count += 1;
  }
  return count || 1;
}

function parseReportDate() {
  return parseDateString(els.reportDate.value) || new Date();
}

function parseDateString(value) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function renderStatusOptions(selectedValue) {
  const values = [
    ["", "Не отмечено"],
    ["done", "Сделано"],
    ["in_progress", "В работе"],
    ["blocked", "Блокер"],
    ["postponed", "Перенесено"]
  ];
  return values.map(([value, label]) => `<option value="${value}" ${selectedValue === value ? "selected" : ""}>${label}</option>`).join("");
}


function renderWorkStatusOptions(selectedValue) {
  const normalized = selectedValue || "not_started";
  const values = [
    ["not_started", "Не начато"],
    ["done", "Сделано"],
    ["in_progress", "В работе"],
    ["review", "Проверить повторно"],
    ["blocked", "Блокер"]
  ];
  return values.map(([value, label]) => `<option value="${value}" ${normalized === value ? "selected" : ""}>${label}</option>`).join("");
}

function getPriorityBucket(index, total) {
  const ratio = total ? (index + 1) / total : 1;
  if (ratio <= 0.1) return "critical";
  if (ratio <= 0.35) return "high";
  if (ratio <= 0.7) return "medium";
  return "low";
}

function getPriorityLabel(bucket) {
  if (bucket === "critical") return "Критично";
  if (bucket === "high") return "Высокий";
  if (bucket === "medium") return "Средний";
  return "Низкий";
}

function updateDeviationCell(element, plan, fact) {
  if (!element) return;
  if (!plan && !fact) {
    element.textContent = "—";
    element.className = "metric-deviation";
    return;
  }

  const delta = roundTo2((fact || 0) - (plan || 0));
  const ratio = plan ? `${delta >= 0 ? "+" : ""}${formatPercent(delta / plan)}` : "без плана";
  element.textContent = `${delta >= 0 ? "+" : ""}${formatNumber(delta)} · ${ratio}`;
  element.className = `metric-deviation ${delta >= 0 ? "positive" : "negative"}`;
}

function copyManagerLink() {
  if (!els.managerLinkPreview.value) return;
  navigator.clipboard.writeText(els.managerLinkPreview.value)
    .then(() => showMessage("Описание роли скопировано.", "success"))
    .catch(() => showMessage("Не удалось скопировать описание роли.", "error"));
}

function openSheet() {
  if (!state.config.googleSheetUrl) {
    showMessage("Общая таблица пока не подключена. Сайт уже работает локально; позже можно добавить googleSheetUrl в config.js.", "warn");
    return;
  }
  window.open(state.config.googleSheetUrl, "_blank", "noopener,noreferrer");
}


function downloadCurrentPackCsv() {
  if (!state.dailyPack.length) {
    showMessage("Для этой роли нет пакета артикулов на скачивание.", "warn");
    return;
  }

  const rows = [[
    "Дата", "Площадка", "Сотрудник", "Пакет", "Приоритет", "Причина приоритета", "Артикул", "SKU", "Товар", "Что сделать сегодня", "Комментарий из анализа", "План заказов/день", "План маржи/день", "План выручки/день"
  ]];

  state.dailyPack.forEach((article) => {
    const key = getArticleKey(article);
    const row = state.articleStates[key] || {};
    const merged = getMergedArticleView(article);
    rows.push([
      els.reportDate.value,
      getManagerChannel(state.managerData) || "",
      state.managerKey,
      `${state.packMeta?.packNo || 1}/${state.packMeta?.packCount || 1}`,
      getPriorityLabel(row.priorityBucket || merged.priorityBucket || "low"),
      row.priorityReason || merged.priorityReason || article.priorityReason || "",
      getPlatformArticleId(article) || "",
      article.sellerArticle || "",
      article.name || "",
      row.managerTask || merged.managerTask || article.managerTask || "",
      row.sourceComment || merged.sourceComment || article.sourceComment || article.managerComment || "",
      roundTo2(row.dailyPlan?.orders || 0),
      roundTo2(row.dailyPlan?.margin || 0),
      roundTo2(row.dailyPlan?.revenue || 0)
    ]);
  });

  const csv = rows.map((row) => row.map(csvEscape).join(";")).join("\n");
  const safeName = slugify(`${state.managerKey}-${els.reportDate.value}`) || "pack";
  downloadText(`pack-${safeName}.csv`, csv, "text/csv;charset=utf-8");
}


function csvEscape(value) {
  const text = String(value ?? "");
  if (/[";\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function setBanner(text, mode = "info") {
  els.statusBanner.textContent = text;
  els.statusBanner.className = "banner";
  if (mode === "error") {
    els.statusBanner.style.background = "#fff1f1";
    els.statusBanner.style.borderColor = "#f0c0c0";
    els.statusBanner.style.color = "#b13636";
  } else if (mode === "success") {
    els.statusBanner.style.background = "#ecfbf4";
    els.statusBanner.style.borderColor = "#bfe7d4";
    els.statusBanner.style.color = "#177a56";
  } else {
    els.statusBanner.style.background = "#edf2ff";
    els.statusBanner.style.borderColor = "#d7dfff";
    els.statusBanner.style.color = "#2940b5";
  }
}

function showMessage(text, mode = "success") {
  els.formMessage.textContent = text;
  els.formMessage.className = `form-message ${mode}`;
  els.formMessage.classList.remove("hidden");
  clearTimeout(state.lastMessageTimeout);
  state.lastMessageTimeout = window.setTimeout(() => {
    els.formMessage.classList.add("hidden");
  }, 4200);
}

function downloadText(fileName, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function cryptoRandomId() {
  if (window.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.round(Math.random() * 100000)}`;
}

function formatNumber(value) {
  const num = Number(value || 0);
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(num);
}

function formatCurrency(value) {
  const num = Number(value || 0);
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 }).format(num);
}

function formatPercent(value) {
  const num = Number(value || 0);
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(num * 100)}%`;
}

function roundTo2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function roundForInput(value) {
  return String(roundTo2(value));
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function safeDivide(value, divisor) {
  return divisor ? Number(value || 0) / divisor : 0;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/(^-|-$)/g, "");
}

function getArticleKey(article) {
  return `${article.channel || state.managerData?.channel || ""}::${article.sellerArticle || getPlatformArticleId(article) || article.name || "article"}`;
}
