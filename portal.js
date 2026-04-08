
const appState = {
  config: window.APP_CONFIG || {},
  role: 'leader',
  platform: 'All',
  view: 'dashboard',
  workDate: (() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  })(),
  metric: 'orders',
  data: {
    plan: null,
    history: null,
    nina: null,
    reportsDemo: []
  },
  storage: null,
  taskStateMap: {},
  sharedReports: [],
  selectedChartArticle: null
};

const ROLE_PRESETS = {
  leader: { label: 'Руководитель', defaultView: 'dashboard', defaultPlatform: 'All' },
  manager_wb: { label: 'Менеджер WB', defaultView: 'tasks', defaultPlatform: 'WB' },
  manager_ozon: { label: 'Менеджер Ozon', defaultView: 'tasks', defaultPlatform: 'Ozon' },
  coordinator_supply: { label: 'Координатор поставок', defaultView: 'supply', defaultPlatform: 'All' }
};

const VIEW_META = {
  dashboard: {
    title: 'Сегодня',
    subtitle: 'Один понятный экран: кто в работе, где красная зона и что уже реально сохранено.'
  },
  tasks: {
    title: 'Задачи менеджеров',
    subtitle: 'WB и Ozon разведены по своим спискам. В работу попадают только артикулы с красной заливкой Вартана из последних сводов маржинальности.'
  },
  supply: {
    title: 'Кластера и отгрузка',
    subtitle: 'Поставки снова полные: короткий срез сверху и вся матрица кластеров/складов прямо внутри портала.'
  },
  control: {
    title: 'Продажи и маржа',
    subtitle: 'План, факт, маржа, PnL и решение — куда выгоднее направить ограниченный остаток.'
  },
  reports: {
    title: 'Журнал сдачи',
    subtitle: 'Главный экран проверки: кто, что и когда сохранил. Без ощущения, что отчёт «куда-то ушёл».'
  }
};

const els = {};

document.addEventListener('DOMContentLoaded', initPortal);

async function initPortal() {
  cacheElements();
  bindEvents();
  appState.storage = createSharedStorage(appState.config);
  await loadData();
  enrichCrossReferences();
  await refreshSharedState();
  applyRolePreset(appState.role, false);
  renderAll();
}

function cacheElements() {
  const ids = [
    'roleSelect','mainNav','contourStrip','storageModeLabel','currentDateLabel','pageTitle','pageSubtitle','workDateInput','platformToggle','syncBanner',
    'dashboardCards','peopleFocus','activityFeed','dashboardDeviations','dashboardSupply',
    'taskPackMeta','taskManagerCard','tasksTableWrap','taskStatusFilter','taskSearchInput','saveDailySummaryBtn',
    'supplyCards','supplyDeficitsTable','clusterNeedTable','supplyMatrixFrame','openSupplyFullLink',
    'chartArticleSelect','metricToggle','chartMeta','lineChart','marginCompareTable','controlDeviationTable','pnlCards','pnlFocusTable',
    'reportSummary','reportsTable','exportReportsBtn','importReportsInput'
  ];
  ids.forEach((id) => { els[id] = document.getElementById(id); });
  els.views = Object.fromEntries([...document.querySelectorAll('.view')].map((node) => [node.id.replace('view-', ''), node]));
}

function bindViewSwitch(root) {
  if (!root) return;
  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-view]');
    if (!button) return;
    appState.view = button.dataset.view;
    renderViewState();
    renderCurrentView();
  });
}

function bindEvents() {
  els.roleSelect.addEventListener('change', (e) => applyRolePreset(e.target.value));
  bindViewSwitch(els.mainNav);
  bindViewSwitch(els.contourStrip);
  els.workDateInput.addEventListener('change', async (e) => {
    appState.workDate = e.target.value;
    await refreshSharedState();
    renderAll();
  });
  els.platformToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    appState.platform = btn.dataset.platform;
    renderAll();
  });
  els.metricToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    appState.metric = btn.dataset.metric;
    renderControlView();
    renderViewState();
  });
  els.taskStatusFilter.addEventListener('change', renderTasksView);
  els.taskSearchInput.addEventListener('input', renderTasksView);
  els.saveDailySummaryBtn.addEventListener('click', saveDailySummary);
  els.exportReportsBtn.addEventListener('click', exportReportsJson);
  els.importReportsInput.addEventListener('change', importReportsJson);
  els.chartArticleSelect.addEventListener('change', (e) => {
    appState.selectedChartArticle = e.target.value;
    renderControlView();
  });
}

async function loadData() {
  const { planDataUrl, historyDataUrl, ninaDataUrl, demoReportsUrl } = appState.config;
  try {
    const [plan, history, nina, reportsDemo] = await Promise.all([
      fetchJson(planDataUrl),
      fetchJson(historyDataUrl),
      fetchJson(ninaDataUrl),
      fetchJson(demoReportsUrl)
    ]);
    appState.data.plan = plan;
    appState.data.history = history;
    appState.data.nina = nina;
    appState.data.reportsDemo = reportsDemo;
  } catch (error) {
    console.error(error);
    appState.data.plan = { cycleAnchorDate: appState.workDate, managers: {} };
    appState.data.history = { wb: { articles: {} }, ozon: { articles: {} }, dates: [] };
    appState.data.nina = { platforms: { WB: { clusters: [], rows: [] }, Ozon: { clusters: [], rows: [] } } };
    appState.data.reportsDemo = [];
    if (els.syncBanner) {
      els.syncBanner.innerHTML = `<strong>Ошибка загрузки данных:</strong> ${escapeHtml(error.message)}. Проверь, что в архиве есть config.js и папка data.`;
    }
  }
}

async function fetchJson(url) {
  const version = appState.config?.siteVersion ? `?v=${encodeURIComponent(appState.config.siteVersion)}` : '';
  const res = await fetch(`${url}${version}`);
  if (!res.ok) throw new Error(`Не загрузился ${url}`);
  return res.json();
}

function buildArticleLookup() {
  const lookup = new Map();
  const managers = appState.data.plan?.managers || {};
  Object.values(managers).forEach((manager) => {
    (manager.articles || []).forEach((article) => {
      const key = String(article.sellerArticle || '').trim();
      if (!key) return;
      const prev = lookup.get(key) || {};
      lookup.set(key, {
        sellerArticle: key,
        wbArticle: article.wbArticle || prev.wbArticle || article.platformArticle || '',
        ozonArticle: article.ozonProductId || prev.ozonArticle || '',
        wbName: article.channel === 'WB' ? (article.name || prev.wbName || '') : (prev.wbName || ''),
        ozonName: article.channel === 'Ozon' ? (article.name || prev.ozonName || '') : (prev.ozonName || ''),
        photoUrl: article.photoUrl || prev.photoUrl || ''
      });
    });
  });
  return lookup;
}

function enrichCrossReferences() {
  const lookup = buildArticleLookup();
  const platforms = appState.data.nina?.platforms || {};
  Object.values(platforms).forEach((platformData) => {
    (platformData.rows || []).forEach((row) => {
      const meta = lookup.get(String(row.sellerArticle || '').trim()) || {};
      row.wbArticle = row.wbArticle || meta.wbArticle || (row.channel === 'WB' ? row.platformArticle : '');
      row.ozonArticle = row.ozonArticle || meta.ozonArticle || (row.channel === 'Ozon' ? row.platformArticle : '');
      row.wbName = row.wbName || meta.wbName || '';
      row.ozonName = row.ozonName || meta.ozonName || '';
      row.photoUrl = row.photoUrl || meta.photoUrl || '';
    });
  });
}

async function refreshSharedState() {
  const taskRows = await appState.storage.listTaskStates(appState.workDate);
  appState.taskStateMap = Object.fromEntries((taskRows || []).map((item) => {
    const article = item.seller_article || item.sellerArticle;
    return [`${item.work_date}__${item.platform}__${article}`, { status: item.status || 'todo', comment: item.comment || '' }];
  }));
  appState.sharedReports = await appState.storage.listReports();
}

function applyRolePreset(role, rerender = true) {
  appState.role = role;
  const preset = ROLE_PRESETS[role] || ROLE_PRESETS.leader;
  if (role === 'manager_wb' || role === 'manager_ozon') appState.platform = preset.defaultPlatform;
  appState.view = preset.defaultView;
  els.roleSelect.value = role;
  if (rerender) renderAll();
}

function renderAll() {
  const descriptor = appState.storage?.getDescriptor?.() || { label: 'session-preview', note: 'Backend не подключён.' };
  els.workDateInput.value = appState.workDate;
  els.storageModeLabel.textContent = descriptor.label;
  els.currentDateLabel.textContent = formatDate(appState.workDate);
  els.syncBanner.classList.toggle('shared', !!descriptor.shared);
  els.syncBanner.innerHTML = descriptor.shared
    ? `<strong>Общий журнал подключён.</strong> ${escapeHtml(descriptor.note)}`
    : `<strong>Внимание:</strong> ${escapeHtml(descriptor.note)} Подключи backend в config.js, чтобы отчёты и заявки были видны всем.`;
  renderViewState();
  renderPageMeta();
  renderDashboardView();
  renderTasksView();
  renderSupplyView();
  renderControlView();
  renderReportsView();
}

function renderCurrentView() {
  renderPageMeta();
  if (appState.view === 'dashboard') renderDashboardView();
  if (appState.view === 'tasks') renderTasksView();
  if (appState.view === 'supply') renderSupplyView();
  if (appState.view === 'control') renderControlView();
  if (appState.view === 'reports') renderReportsView();
}

function renderViewState() {
  Object.entries(els.views).forEach(([key, node]) => node.classList.toggle('active', key === appState.view));
  [...els.mainNav.querySelectorAll('.nav-link')].forEach((node) => node.classList.toggle('active', node.dataset.view === appState.view));
  if (els.contourStrip) [...els.contourStrip.querySelectorAll('[data-view]')].forEach((node) => node.classList.toggle('active', node.dataset.view === appState.view));
  [...els.platformToggle.querySelectorAll('.seg-btn')].forEach((node) => node.classList.toggle('active', node.dataset.platform === appState.platform));
}

function renderPageMeta() {
  const meta = VIEW_META[appState.view];
  const roleLabel = ROLE_PRESETS[appState.role]?.label || 'Режим';
  const platformLabel = appState.platform === 'All' ? 'Все площадки' : appState.platform;
  els.pageTitle.textContent = meta.title;
  els.pageSubtitle.textContent = `${meta.subtitle} Сейчас: ${roleLabel} · ${platformLabel}.`;
}

function getManagers() {
  return appState.data.plan?.managers || {};
}

function getManagerByChannel(channel) {
  return Object.entries(getManagers()).find(([, manager]) => manager.channel === channel);
}

function getCoordinatorEntry() {
  return Object.entries(getManagers()).find(([, manager]) => String(manager.role || '').toLowerCase().includes('координатор'));
}

function getTaskPool(manager) {
  if (!manager) return [];
  return Array.isArray(manager.focusArticles) && manager.focusArticles.length
    ? manager.focusArticles
    : (manager.articles || []);
}

function getFocusedRows(manager) {
  const rows = getTaskPool(manager);
  return rows.filter((item) => item?.focusMeta?.active || item?.focusPinned || !Array.isArray(manager?.focusArticles) || manager.focusArticles.includes(item));
}

function getTaskDueDate(rows) {
  const dates = rows.map((item) => item.focusDeadline || item.focusMeta?.dueDate).filter(Boolean).sort();
  return dates[0] || appState.workDate;
}

function getFocusViewByChannel(channel) {
  const entry = getManagerByChannel(channel);
  if (!entry) return null;
  const [managerName, manager] = entry;
  const rows = getFocusedRows(manager);
  return {
    channel,
    managerName,
    manager,
    rows,
    taskPoolCount: rows.length,
    dueDate: getTaskDueDate(rows),
    focusProgram: manager.focusProgram || null
  };
}

function isLatestMarginArticle(article) {
  return Boolean(article?.metrics?.latestMarginSource);
}

function summarizeTaskAttention(row) {
  const focus = row.focusMeta || {};
  const issueLabel = (focus.issueMetrics || []).length ? focus.issueMetrics.join(', ') : (focus.issueMetric || 'Красная зона');
  const plan = getRowPlanDay(row);
  const fact = getRowFactDay(row);
  const deltaPct = plan ? ((fact - plan) / plan) * 100 : 0;
  const bits = [`${issueLabel}: план ${formatNum(plan, 1)} / факт ${formatNum(fact, 1)} / Δ ${formatNum(deltaPct, 1)}%`];
  if (row.metrics?.factMarginDay) bits.push(`маржа ${formatMoney(row.metrics.factMarginDay)}/д`);
  if (row.metrics?.factMarginPct) bits.push(`марж. ${formatNum(row.metrics.factMarginPct, 1)}%`);
  if (row.metrics?.buyoutPct) bits.push(`выкуп ${formatNum(row.metrics.buyoutPct, 1)}%`);
  if (row.metrics?.cancelRatePct) bits.push(`отмены ${formatNum(row.metrics.cancelRatePct, 1)}%`);
  return bits.join(' · ');
}

function renderTaskWorkstreams(row) {
  const streams = row.focusMeta?.workstreams || [];
  if (!streams.length) return '';
  return `<div class="task-chip-row">${streams.map((item) => `<span class="task-mini-chip">${escapeHtml(item)}</span>`).join('')}</div>`;
}

function getFocusProgram(manager) {
  return manager?.focusProgram || null;
}

function getMonthKey() {
  return (appState.workDate || '').slice(0, 7);
}

function getBusinessDayOffset(anchorStr, dateStr) {
  const anchor = new Date(`${anchorStr}T00:00:00`);
  const target = new Date(`${dateStr}T00:00:00`);
  const step = target >= anchor ? 1 : -1;
  let count = 0;
  const cursor = new Date(anchor);
  while ((step > 0 && cursor < target) || (step < 0 && cursor > target)) {
    cursor.setDate(cursor.getDate() + step);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += step;
  }
  return count;
}

function businessDayShift(startStr, offset) {
  const cursor = new Date(`${startStr}T00:00:00`);
  if (!offset) return startStr;
  const step = offset > 0 ? 1 : -1;
  let left = Math.abs(offset);
  while (left > 0) {
    cursor.setDate(cursor.getDate() + step);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return cursor.toISOString().slice(0, 10);
}

function getPackForManager(managerName) {
  const manager = getManagers()[managerName];
  const taskPool = getTaskPool(manager);
  if (!manager || !Array.isArray(taskPool)) {
    return { managerName, manager, packArticles: [], packNumber: 1, totalPacks: 1, taskPoolCount: 0, packDate: appState.workDate, dueDate: appState.workDate, focusProgram: null };
  }
  const focusProgram = getFocusProgram(manager);
  const packSize = Number(manager.focusPackSize || manager.packSize || appState.data.plan.packSizeDefault || 20);
  const totalPacks = Math.max(1, Math.ceil(taskPool.length / packSize));
  const anchorDate = focusProgram?.startDate || appState.data.plan.cycleAnchorDate || appState.workDate;
  const offsetRaw = getBusinessDayOffset(anchorDate, appState.workDate);
  const offset = Math.max(0, offsetRaw);
  const packNumber = focusProgram?.locked
    ? Math.min(totalPacks, offset + 1)
    : (((offsetRaw % totalPacks) + totalPacks) % totalPacks + 1);
  const packArticles = taskPool.filter((article, index) => {
    const assignedPack = Number(article.focusMeta?.packNumber || article.packNumber || Math.ceil((index + 1) / packSize));
    return assignedPack === packNumber;
  });
  const packMeta = focusProgram?.packs?.find((item) => Number(item.packNumber) === packNumber) || null;
  const packDate = packMeta?.packDate || businessDayShift(anchorDate, packNumber - 1);
  const dueDate = packMeta?.dueDate || businessDayShift(packDate, 4);
  return { managerName, manager, packArticles, packNumber, totalPacks, taskPoolCount: taskPool.length, packDate, dueDate, focusProgram };
}

function getTaskRowsForCurrentSelection() {
  let channel = appState.platform;
  if (appState.role === 'manager_wb') channel = 'WB';
  if (appState.role === 'manager_ozon') channel = 'Ozon';
  if (channel === 'All') channel = 'WB';
  const focusView = getFocusViewByChannel(channel);
  if (!focusView) return { channel, managerName: '', manager: null, rows: [], taskPoolCount: 0, dueDate: appState.workDate, focusProgram: null };
  return focusView;
}

function getRowPlanDay(article) {
  const monthKey = getMonthKey();
  return Number(article.monthlyPlan?.[monthKey]?.planOrdersDay || article.metrics?.planOrdersDay || 0);
}

function getRowPlanMarginDay(article) {
  const monthKey = getMonthKey();
  return Number(article.monthlyPlan?.[monthKey]?.planMarginIncomeDay || article.monthlyPlan?.[monthKey]?.planMarginDay || 0);
}

function getRowPlanRevenueDay(article) {
  const monthKey = getMonthKey();
  return Number(article.monthlyPlan?.[monthKey]?.planRevenueDay || article.metrics?.planRevenueDay || 0);
}

function getRowPlanMarginPct(article) {
  const monthKey = getMonthKey();
  return Number(article.monthlyPlan?.[monthKey]?.planMarginPct || article.planMarginPct || 0);
}

function getRowNetMarginPct(article) {
  return Number(article.metrics?.netMarginPct || article.netMarginPct || getRowPlanMarginPct(article) || 0);
}

function getEstimatedFactMarginDay(article) {
  const direct = Number(article.metrics?.factMarginDay || 0);
  if (direct) return direct;
  const revenue = getRowFactRevenue(article);
  const pct = Number(article.metrics?.factMarginPct || getRowPlanMarginPct(article) || 0);
  return revenue * pct / 100;
}

function getEstimatedFactPnlDay(article) {
  const direct = Number(article.metrics?.factPnlDay || article.metrics?.factMarginDay || 0);
  if (direct) return direct;
  const revenue = getRowFactRevenue(article);
  const pct = getRowNetMarginPct(article);
  return revenue * pct / 100;
}

function getRowPlanPnlDay(article) {
  const monthKey = getMonthKey();
  const direct = Number(article.monthlyPlan?.[monthKey]?.planPnlDay || 0);
  if (direct) return direct;
  const revenuePlan = getRowPlanRevenueDay(article);
  const pct = getRowNetMarginPct(article);
  if (!revenuePlan) return getRowPlanMarginDay(article);
  return revenuePlan * pct / 100;
}

function getRowFactDay(article) {
  const platformKey = article.channel === 'WB' ? 'wb' : 'ozon';
  const series = appState.data.history?.[platformKey]?.articles?.[article.sellerArticle]?.orders || null;
  if (Array.isArray(series) && series.length) {
    const sample = series.slice(-7);
    return avg(sample);
  }
  return Number(article.metrics?.factOrdersDay || article.metrics?.avgDailyOrders || 0);
}

function getRowFactRevenue(article) {
  const platformKey = article.channel === 'WB' ? 'wb' : 'ozon';
  const series = appState.data.history?.[platformKey]?.articles?.[article.sellerArticle]?.revenue || null;
  if (Array.isArray(series) && series.length) {
    const sample = series.slice(-7);
    return avg(sample);
  }
  return Number(article.metrics?.factMoneyDay || 0);
}

function getTaskStorageKey(article) {
  return `${appState.workDate}__${article.channel}__${article.sellerArticle}`;
}

function getTaskState(article) {
  return appState.taskStateMap[getTaskStorageKey(article)] || { status: 'todo', comment: '' };
}

function renderArticleIdentity(row, options = {}) {
  const wb = row.wbArticle || (row.platformArticleLabel === 'WB артикул' ? (row.platformArticle || '—') : '—');
  const ozon = row.ozonProductId || row.ozonArticle || (row.platformArticleLabel === 'Ozon артикул' ? row.platformArticle : '') || '—';
  const lines = [
    `<div class="identity-stack">`,
    `<strong>WB ${escapeHtml(String(wb || '—'))}</strong>`,
    `<span class="muted">seller: ${escapeHtml(row.sellerArticle || '—')}</span>`
  ];
  if (options.showName && row.name) lines.push(`<span class="muted">${escapeHtml(row.name)}</span>`);
  lines.push(`<span class="muted">Ozon: ${escapeHtml(String(ozon || '—'))}</span>`);
  lines.push(`</div>`);
  return lines.join('');
}

async function saveTaskRow(article, status, comment) {
  const payload = {
    work_date: appState.workDate,
    platform: article.channel,
    seller_article: article.sellerArticle,
    manager_name: article.channel === 'WB' ? 'Анастасия' : 'Ирина Паламарук',
    wb_article: article.wbArticle || '',
    ozon_article: article.ozonProductId || '',
    item_name: article.name || '',
    status,
    comment,
    updated_at: new Date().toISOString()
  };
  await appState.storage.saveTaskState(payload);
  appState.taskStateMap[getTaskStorageKey(article)] = { status, comment };
  const report = {
    work_date: appState.workDate,
    created_at: new Date().toISOString(),
    author_name: payload.manager_name,
    author_role: article.channel === 'WB' ? 'manager_wb' : 'manager_ozon',
    platform: article.channel,
    contour: 'tasks',
    title: `${article.channel} · ${article.sellerArticle}`,
    route: `${article.channel} · задачи`,
    status,
    items_count: 1,
    note: comment || 'Изменён статус по артикулу',
    storage_label: appState.storage.getDescriptor().label,
    payload: {
      sellerArticle: article.sellerArticle,
      wbArticle: article.wbArticle || '',
      ozonArticle: article.ozonProductId || ''
    }
  };
  await appState.storage.saveReport(report);
  appState.sharedReports = [report, ...appState.sharedReports].slice(0, 200);
  renderDashboardView();
  renderReportsView();
}

function upsertLocalReport(entry) {
  return entry;
}

async function saveDailySummary() {
  const taskInfo = getTaskRowsForCurrentSelection();
  const statusCounts = countTaskStatuses(taskInfo.rows);
  const author = taskInfo.channel === 'WB' ? 'Анастасия' : 'Ирина Паламарук';
  const report = {
    work_date: appState.workDate,
    created_at: new Date().toISOString(),
    author_name: author,
    author_role: taskInfo.channel === 'WB' ? 'manager_wb' : 'manager_ozon',
    platform: taskInfo.channel,
    contour: 'tasks',
    title: `${taskInfo.channel} · закрепленный список`,
    route: `${taskInfo.channel} · задачи`,
    status: 'saved',
    items_count: taskInfo.rows.length,
    note: `Список ${taskInfo.rows.length} SKU. Готово: ${statusCounts.done}, в работе: ${statusCounts.in_progress}, нужна помощь: ${statusCounts.need_help}.`,
    storage_label: appState.storage.getDescriptor().label,
    payload: {
      focusedCount: taskInfo.rows.length
    }
  };
  await appState.storage.saveReport(report);
  appState.sharedReports = [report, ...appState.sharedReports].slice(0, 200);
  renderDashboardView();
  renderReportsView();
  alert(appState.storage.isShared() ? 'Список дня сохранён в общем журнале.' : 'Список дня сохранён в текущей сессии. Чтобы его видели все, подключи backend.');
}

function countTaskStatuses(rows) {
  return rows.reduce((acc, row) => {
    const state = getTaskState(row);
    acc[state.status] = (acc[state.status] || 0) + 1;
    return acc;
  }, { todo: 0, in_progress: 0, done: 0, need_help: 0 });
}

function getAllReports() {
  const base = appState.storage?.isShared() ? [] : appState.data.reportsDemo;
  return [...appState.sharedReports, ...base].sort((a, b) => new Date((b.created_at || b.createdAt)) - new Date((a.created_at || a.createdAt)));
}

function renderDashboardView() {
  const wbFocus = getFocusViewByChannel('WB');
  const ozonFocus = getFocusViewByChannel('Ozon');
  const coordinator = getCoordinatorEntry();
  const reports = getAllReports();
  const deviations = getTopDeviations();
  const supplyRows = getTopSupplyRows();
  const dashboardCards = [
    { label: 'WB в работе', value: wbFocus?.rows.length || 0, note: wbFocus ? `Закреплено за Анастасией` : '—' },
    { label: 'Ozon в работе', value: ozonFocus?.rows.length || 0, note: ozonFocus ? `Закреплено за Ириной` : '—' },
    { label: 'Сохранений видно', value: reports.length, note: 'В журнале review-версии', highlight: true },
    { label: 'Красная зона', value: deviations.filter((row) => row.deltaPct <= -0.3).length, note: 'Отклонение к плану ≤ -30%' },
    { label: 'Топ потребность', value: formatNum(sum(supplyRows.slice(0, 5).map((row) => row.totalNeed))), note: 'Сумма топ-5 дефицитов' },
    { label: 'Коорд. очередь', value: coordinator?.[1]?.articles?.length || 0, note: 'Фокус на поставки' }
  ];
  els.dashboardCards.innerHTML = dashboardCards.map((card) => `
    <article class="kpi-card ${card.highlight ? 'highlight' : ''}">
      <span>${card.label}</span>
      <strong>${card.value}</strong>
      <small>${card.note}</small>
    </article>
  `).join('');

  const people = [];
  if (wbFocus) people.push(buildPersonCard('Анастасия', 'WB', wbFocus));
  if (ozonFocus) people.push(buildPersonCard('Ирина Паламарук', 'Ozon', ozonFocus));
  if (coordinator) {
    const critical = coordinator[1].articles.filter((item) => item.priorityBucket === 'critical').length;
    people.push({
      name: coordinator[0],
      channel: 'Поставки',
      text: `В очереди ${coordinator[1].articles.length} строк. Критично: ${critical}. Основной экран — матрица кластеров и заявки.`,
      stats: [`Критично: ${critical}`, `Очередь: ${coordinator[1].articles.length}`]
    });
  }
  els.peopleFocus.innerHTML = people.map((card) => `
    <div class="person-card">
      <div>
        <strong>${card.name}</strong>
        <div class="pill-note">${card.channel}</div>
        <p>${card.text}</p>
      </div>
      <div class="person-stats">${card.stats.map((s) => `<span class="stat">${s}</span>`).join('')}</div>
    </div>
  `).join('');

  els.activityFeed.innerHTML = reports.slice(0, 6).map((item) => `
    <div class="activity-item">
      <div class="activity-head">
        <strong>${escapeHtml(item.title)}</strong>
        <span class="badge ${normalizeStatus(item.status)}">${statusLabel(item.status)}</span>
      </div>
      <p><strong>${escapeHtml(item.author_name || item.author)}</strong> · ${escapeHtml(item.route)} · ${formatDateTime(item.created_at || item.createdAt)}</p>
      <p>${escapeHtml(item.note || '')}</p>
    </div>
  `).join('');

  els.dashboardDeviations.innerHTML = renderSimpleTable([
    { key: 'article', label: 'WB арт. / seller' },
    { key: 'platform', label: 'Площадка' },
    { key: 'plan', label: 'План/д' },
    { key: 'fact', label: 'Факт/д' },
    { key: 'delta', label: 'Δ' },
    { key: 'margin', label: 'Маржа/д' }
  ], deviations.slice(0, 5).map((row) => ({
    article: renderArticleIdentity(row, { showName: true }),
    platform: row.channel,
    plan: formatNum(row.planDay, 1),
    fact: formatNum(row.factDay, 1),
    delta: `<span class="${row.deltaPct < 0 ? 'negative' : 'positive'}">${formatPct(row.deltaPct)}</span>`,
    margin: formatMoney(row.factMarginDay || row.marginDay)
  })));

  els.dashboardSupply.innerHTML = renderSimpleTable([
    { key: 'article', label: 'WB арт. / seller' },
    { key: 'platform', label: 'Площадка' },
    { key: 'need', label: 'Нужно' },
    { key: 'cluster', label: 'Главный кластер' },
    { key: 'action', label: 'Что делать' }
  ], supplyRows.slice(0, 5).map((row) => ({
    article: renderArticleIdentity(row, { showName: true }),
    platform: row.channel,
    need: formatNum(row.totalNeed),
    cluster: escapeHtml(row.topCluster || '—'),
    action: escapeHtml(row.action || '—')
  })));
}

function buildPersonCard(name, channel, focusInfo) {
  const critical = focusInfo.rows.filter((item) => item.priorityBucket === 'critical').length;
  const help = focusInfo.rows.filter((item) => getTaskState(item).status === 'need_help').length;
  const plan = sum(focusInfo.rows.map((item) => getRowPlanDay(item)));
  return {
    name,
    channel,
    text: `В работе закрепленный список ${focusInfo.rows.length} SKU. Ближайшая контрольная дата: ${formatShortDate(focusInfo.dueDate)}.`,
    stats: [`Закреплено: ${focusInfo.rows.length} SKU`, `План/д: ${formatNum(plan, 1)}`, `Помощь: ${help}`, `Критичных: ${critical}`]
  };
}

function renderTasksView() {
  const taskInfo = getTaskRowsForCurrentSelection();
  const statusFilter = els.taskStatusFilter.value || 'all';
  const query = (els.taskSearchInput.value || '').trim().toLowerCase();
  const rows = taskInfo.rows.filter((row) => {
    const state = getTaskState(row);
    const matchesStatus = statusFilter === 'all' || state.status === statusFilter;
    const hay = `${row.sellerArticle} ${row.wbArticle || ''} ${row.ozonProductId || row.ozonArticle || ''} ${row.name} ${row.action} ${row.reason} ${row.focusSummary || ''} ${row.attentionNote || ''}`.toLowerCase();
    const matchesQuery = !query || hay.includes(query);
    return matchesStatus && matchesQuery;
  });
  const statusCounts = countTaskStatuses(taskInfo.rows);
  const focusNotes = taskInfo.focusProgram?.notes || [];
  const sprint = taskInfo.focusProgram?.dailyTemplate || [];
  const managerTitle = taskInfo.managerName || '—';
  const channelLabel = taskInfo.channel || '—';
  els.taskPackMeta.textContent = `Закреплённый список на ${formatDate(appState.workDate)}. Внутри ${taskInfo.rows.length} SKU. Контрольная дата: ${formatDate(taskInfo.dueDate)}.`;
  els.taskManagerCard.innerHTML = `
    <div class="task-head-grid">
      <div>
        <h3>${escapeHtml(managerTitle)} · ${escapeHtml(channelLabel)}</h3>
        <p>${escapeHtml(taskInfo.manager?.responsibility || '')}</p>
      </div>
      <div class="task-meta-chips">
        <span class="tag-chip">Закреплено: ${taskInfo.rows.length} SKU</span>
        <span class="tag-chip danger">Контроль: ${formatDate(taskInfo.dueDate)}</span>
        <span class="tag-chip">Источник: последние своды маржинальности</span>
      </div>
    </div>
    <p class="help-text">Статусы: не начато — ${statusCounts.todo}, в работе — ${statusCounts.in_progress}, готово — ${statusCounts.done}, нужна помощь — ${statusCounts.need_help}.</p>
    ${focusNotes.length ? `<div class="manager-notes-list">${focusNotes.map((note) => `<div class="note-pill">${escapeHtml(note)}</div>`).join('')}</div>` : ''}
    ${sprint.length ? `<div class="sprint-grid">${sprint.map((item) => `<article class="sprint-step"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.task)}</span></article>`).join('')}</div>` : ''}
  `;
  els.tasksTableWrap.innerHTML = `
    <table class="tasks-table tasks-focus-table">
      <thead>
        <tr>
          <th>WB арт. / seller</th>
          <th>Ozon арт.</th>
          <th>Товар</th>
          <th>Приоритет</th>
          <th>Сигнал</th>
          <th>План/д</th>
          <th>Факт/д</th>
          <th>Маржа/д</th>
          <th>Срок</th>
          <th>На что смотреть / что сделать</th>
          <th>Статус</th>
          <th>Комментарий</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => renderTaskRow(row)).join('')}
      </tbody>
    </table>
  `;
  els.tasksTableWrap.querySelectorAll('.save-row-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const article = taskInfo.rows.find((item) => item.sellerArticle === btn.dataset.article);
      if (!article) return;
      const tr = btn.closest('tr');
      const status = tr.querySelector('.task-status-input').value;
      const comment = tr.querySelector('.task-comment-input').value.trim();
      await saveTaskRow(article, status, comment);
      btn.textContent = 'Сохранено';
      setTimeout(() => { btn.textContent = 'Сохранить'; renderTasksView(); }, 700);
    });
  });
}

function renderTaskRow(row) {
  const state = getTaskState(row);
  const focus = row.focusMeta || {};
  const issueMetric = focus.issueMetric || 'В работе';
  const metricMeta = summarizeTaskAttention(row);
  const deadline = formatShortDate(focus.dueDate || row.focusDeadline || appState.workDate);
  const starts = formatShortDate(row.focusStartDate || appState.workDate);
  const mainAction = row.action || 'Зафиксировать причину, что сделано и следующий шаг.';
  return `
    <tr>
      <td><strong>${escapeHtml(String(row.wbArticle || '—'))}</strong><div class="help-text">seller: ${escapeHtml(row.sellerArticle || '—')}</div></td>
      <td><strong>${escapeHtml(String(row.ozonProductId || row.ozonArticle || '—'))}</strong></td>
      <td><strong>${escapeHtml(row.name || '—')}</strong><div class="help-text">${escapeHtml(row.category || '')}</div></td>
      <td><span class="badge ${row.priorityBucket}">${escapeHtml(row.priorityLabel || '—')}</span></td>
      <td><span class="signal-pill">${escapeHtml(issueMetric)}</span><div class="help-text">${escapeHtml(metricMeta)}</div></td>
      <td>${formatNum(getRowPlanDay(row), 1)}</td>
      <td>${formatNum(getRowFactDay(row), 1)}</td>
      <td>${formatMoney(getEstimatedFactMarginDay(row))}</td>
      <td><strong>${deadline}</strong><div class="help-text">в работе с ${starts}</div></td>
      <td><strong>${escapeHtml(mainAction)}</strong><div class="help-text">${escapeHtml(row.reason || row.attentionNote || '')}</div>${renderTaskWorkstreams(row)}</td>
      <td>
        <select class="inline-select task-status-input">
          ${['todo','in_progress','done','need_help'].map((status) => `<option value="${status}" ${state.status === status ? 'selected' : ''}>${statusLabel(status)}</option>`).join('')}
        </select>
      </td>
      <td><input class="inline-input inline-note task-comment-input" value="${escapeAttr(state.comment || '')}" placeholder="Что сделано / что мешает" /></td>
      <td><button class="btn btn-ghost save-row-btn" data-article="${escapeAttr(row.sellerArticle)}" type="button">Сохранить</button></td>
    </tr>
  `;
}

function renderSupplyView() {
  const cards = [];
  const platforms = appState.platform === 'All' ? ['WB', 'Ozon'] : [appState.platform];
  const supplyRows = getTopSupplyRows(platforms);
  const clusterAgg = getClusterNeedRows(platforms);
  const matrixPlatform = appState.platform === 'Ozon' ? 'Ozon' : 'WB';
  const frameSrc = `nina.html?embed=1&platform=${encodeURIComponent(matrixPlatform)}`;

  cards.push({ label: 'Топ дефицитов', value: supplyRows.length, note: 'Артикулы с потребностью > 0' });
  cards.push({ label: 'Реком. к заказу', value: formatNum(sum(supplyRows.map((row) => row.totalNeed))), note: 'Суммарно по выбранным площадкам', highlight: true });
  cards.push({ label: 'Кластеры в фокусе', value: clusterAgg.length, note: 'Есть потребность или риск' });
  cards.push({ label: 'Полная матрица', value: matrixPlatform, note: 'Кластеры и склады снова встроены в раздел поставок' });
  els.supplyCards.innerHTML = cards.map((card) => `
    <article class="kpi-card ${card.highlight ? 'highlight' : ''}">
      <span>${card.label}</span>
      <strong>${card.value}</strong>
      <small>${card.note}</small>
    </article>
  `).join('');

  els.supplyDeficitsTable.innerHTML = renderSimpleTable([
    { key: 'article', label: 'Артикул / Ozon' },
    { key: 'wb', label: 'WB арт.' },
    { key: 'platform', label: 'Площадка' },
    { key: 'need', label: 'Нужно' },
    { key: 'main', label: 'Осн. склад' },
    { key: 'cluster', label: 'Кластер' },
    { key: 'action', label: 'Действие' }
  ], supplyRows.slice(0, 12).map((row) => ({
    article: `<strong>${escapeHtml(row.sellerArticle || '—')}</strong><div class="muted">Ozon: ${escapeHtml(String(row.ozonArticle || '—'))}</div>`,
    wb: `<strong>${escapeHtml(String(row.wbArticle || '—'))}</strong>`,
    platform: row.channel,
    need: formatNum(row.totalNeed),
    main: formatNum(row.mainWarehouseStock),
    cluster: escapeHtml(row.topCluster || '—'),
    action: escapeHtml((row.action || '').split('. ')[0] || '—')
  })));

  els.clusterNeedTable.innerHTML = renderSimpleTable([
    { key: 'cluster', label: 'Кластер' },
    { key: 'platform', label: 'Площадка' },
    { key: 'need', label: 'Нужно' },
    { key: 'stock', label: 'Запас' },
    { key: 'daily', label: 'Спрос/д' }
  ], clusterAgg.slice(0, 16).map((row) => ({
    cluster: `<strong>${escapeHtml(row.cluster)}</strong>`,
    platform: row.platform,
    need: formatNum(row.need),
    stock: formatNum(row.stock),
    daily: formatNum(row.daily, 1)
  })));

  if (els.supplyMatrixFrame?.dataset.src !== frameSrc) {
    els.supplyMatrixFrame.src = frameSrc;
    els.supplyMatrixFrame.dataset.src = frameSrc;
  }
  if (els.openSupplyFullLink) {
    els.openSupplyFullLink.href = `nina.html?platform=${encodeURIComponent(matrixPlatform)}`;
  }
}

function getTopSupplyRows(platforms = ['WB', 'Ozon']) {
  const platformMap = appState.data.nina?.platforms || {};
  const rows = [];
  platforms.forEach((platform) => {
    (platformMap[platform]?.rows || []).forEach((row) => {
      const topMetric = [...(row.clusterMetrics || [])].sort((a, b) => Number(b.recommendedQty || 0) - Number(a.recommendedQty || 0))[0] || null;
      rows.push({
        channel: platform,
        sellerArticle: row.sellerArticle,
        wbArticle: row.wbArticle || '',
        ozonArticle: row.ozonArticle || '',
        name: row.name,
        totalNeed: Number(row.totalNeed || 0),
        mainWarehouseStock: Number(row.mainWarehouseStock || 0),
        action: row.action,
        topCluster: topMetric?.cluster || null
      });
    });
  });
  return rows.filter((row) => row.totalNeed > 0).sort((a, b) => b.totalNeed - a.totalNeed);
}

function getClusterNeedRows(platforms = ['WB', 'Ozon']) {
  const platformMap = appState.data.nina?.platforms || {};
  const agg = new Map();
  platforms.forEach((platform) => {
    (platformMap[platform]?.rows || []).forEach((row) => {
      (row.clusterMetrics || []).forEach((metric) => {
        const key = `${platform}__${metric.cluster}`;
        const current = agg.get(key) || { platform, cluster: metric.cluster, need: 0, stock: 0, daily: 0 };
        current.need += Number(metric.recommendedQty || 0);
        current.stock += Number(metric.stock || 0);
        current.daily += Number(metric.adjustedDaily || metric.seasonalPlanDay || 0);
        agg.set(key, current);
      });
    });
  });
  return [...agg.values()].sort((a, b) => b.need - a.need);
}

function renderControlView() {
  const deviations = getTopDeviations();
  const compareRows = getMarginCompareRows();
  const pnlCards = [
    { label: 'План маржи / день', value: formatMoney(sum(deviations.map((row) => row.marginDay))), note: 'Сумма по текущему срезу' },
    { label: 'Факт маржи / день', value: formatMoney(sum(deviations.map((row) => row.factMarginDay))), note: 'Расчёт по фактической выручке', highlight: true },
    { label: 'План PnL / день', value: formatMoney(sum(deviations.map((row) => row.planPnlDay))), note: 'Плановая чистая прибыль' },
    { label: 'Факт PnL / день', value: formatMoney(sum(deviations.map((row) => row.factPnlDay))), note: 'Оценка по netMarginPct / planMarginPct' }
  ];
  els.pnlCards.innerHTML = pnlCards.map((card) => `
    <article class="kpi-card ${card.highlight ? 'highlight' : ''}">
      <span>${card.label}</span>
      <strong>${card.value}</strong>
      <small>${card.note}</small>
    </article>
  `).join('');

  populateChartSelector(deviations);
  const selected = deviations.find((row) => row.sellerArticle === appState.selectedChartArticle) || deviations[0] || null;
  if (selected) appState.selectedChartArticle = selected.sellerArticle;
  els.chartMeta.textContent = selected
    ? `${selected.channel} · ${selected.sellerArticle} · план/д ${formatNum(selected.planDay,1)} · факт/д ${formatNum(selected.factDay,1)} · Δ ${formatPct(selected.deltaPct)} · PnL ${formatMoney(selected.factPnlDay)}`
    : 'Нет данных для графика';
  els.lineChart.innerHTML = selected ? buildLineChart(selected) : '<div class="muted">Нет данных</div>';

  els.controlDeviationTable.innerHTML = renderSimpleTable([
    { key: 'article', label: 'Артикул' },
    { key: 'platform', label: 'Площадка' },
    { key: 'plan', label: 'План/д' },
    { key: 'fact', label: 'Факт/д' },
    { key: 'delta', label: 'Δ' },
    { key: 'revenue', label: 'Выручка/д' },
    { key: 'margin', label: 'Маржа/д' },
    { key: 'pnl', label: 'PnL/д' }
  ], deviations.slice(0, 12).map((row) => ({
    article: renderArticleIdentity(row, { showName: true }),
    platform: row.channel,
    plan: formatNum(row.planDay, 1),
    fact: formatNum(row.factDay, 1),
    delta: `<span class="${row.deltaPct < 0 ? 'negative' : 'positive'}">${formatPct(row.deltaPct)}</span>`,
    revenue: formatMoney(row.revenueDay),
    margin: `${formatMoney(row.factMarginDay)}<div class="muted">план ${formatMoney(row.marginDay)}</div>`,
    pnl: `${formatMoney(row.factPnlDay)}<div class="muted">план ${formatMoney(row.planPnlDay)}</div>`
  })));

  els.marginCompareTable.innerHTML = renderSimpleTable([
    { key: 'article', label: 'Артикул' },
    { key: 'wb', label: 'WB' },
    { key: 'ozon', label: 'Ozon' },
    { key: 'margin', label: 'Маржа/д' },
    { key: 'pnl', label: 'PnL/д' },
    { key: 'decision', label: 'Куда грузить' }
  ], compareRows.slice(0, 10).map((row) => ({
    article: renderArticleIdentity(row, { showName: true }),
    wb: `Факт ${formatNum(row.wbFact,1)} / План ${formatNum(row.wbPlan,1)}`,
    ozon: `Факт ${formatNum(row.ozonFact,1)} / План ${formatNum(row.ozonPlan,1)}`,
    margin: `WB ${formatMoney(row.wbMarginFact)}<div class="muted">план ${formatMoney(row.wbMarginPlan)}</div>Ozon ${formatMoney(row.ozonMarginFact)}<div class="muted">план ${formatMoney(row.ozonMarginPlan)}</div>`,
    pnl: `WB ${formatMoney(row.wbPnlFact)}<div class="muted">план ${formatMoney(row.wbPnlPlan)}</div>Ozon ${formatMoney(row.ozonPnlFact)}<div class="muted">план ${formatMoney(row.ozonPnlPlan)}</div>`,
    decision: `<strong>${escapeHtml(row.decision)}</strong><span class="muted">${escapeHtml(row.note)}</span>`
  })));

  els.pnlFocusTable.innerHTML = renderSimpleTable([
    { key: 'article', label: 'Артикул' },
    { key: 'wb_pnl', label: 'WB PnL/д' },
    { key: 'ozon_pnl', label: 'Ozon PnL/д' },
    { key: 'wb_margin', label: 'WB маржа/д' },
    { key: 'ozon_margin', label: 'Ozon маржа/д' },
    { key: 'focus', label: 'Фокус' }
  ], compareRows.slice(0, 12).map((row) => ({
    article: renderArticleIdentity(row, { showName: true }),
    wb_pnl: `${formatMoney(row.wbPnlFact)}<div class="muted">план ${formatMoney(row.wbPnlPlan)}</div>`,
    ozon_pnl: `${formatMoney(row.ozonPnlFact)}<div class="muted">план ${formatMoney(row.ozonPnlPlan)}</div>`,
    wb_margin: `${formatMoney(row.wbMarginFact)}<div class="muted">план ${formatMoney(row.wbMarginPlan)}</div>`,
    ozon_margin: `${formatMoney(row.ozonMarginFact)}<div class="muted">план ${formatMoney(row.ozonMarginPlan)}</div>`,
    focus: `<strong>${escapeHtml(row.decision)}</strong><span class="muted">${escapeHtml(row.note)}</span>`
  })));
}

function populateChartSelector(deviations) {
  const rows = deviations.slice(0, 30);
  if (!appState.selectedChartArticle && rows[0]) appState.selectedChartArticle = rows[0].sellerArticle;
  els.chartArticleSelect.innerHTML = rows.map((row) => `<option value="${escapeAttr(row.sellerArticle)}" ${row.sellerArticle === appState.selectedChartArticle ? 'selected' : ''}>WB ${escapeHtml(String(row.wbArticle || '—'))} · ${escapeHtml(row.sellerArticle)} · ${escapeHtml(row.channel)}</option>`).join('');
}

function getTopDeviations() {
  const monthKey = getMonthKey();
  const platforms = appState.platform === 'All' ? ['WB', 'Ozon'] : [appState.platform];
  const rows = [];
  platforms.forEach((platform) => {
    const managerEntry = getManagerByChannel(platform);
    if (!managerEntry) return;
    const [, manager] = managerEntry;
    (manager.articles || []).forEach((article) => {
      if (!isLatestMarginArticle(article)) return;
      const planDay = Number(article.monthlyPlan?.[monthKey]?.planOrdersDay || article.metrics?.planOrdersDay || 0);
      if (!planDay) return;
      const factDay = Number(getRowFactDay(article) || 0);
      const deltaPct = planDay ? (factDay - planDay) / planDay : 0;
      rows.push({
        sellerArticle: article.sellerArticle,
        wbArticle: article.wbArticle || '',
        ozonArticle: article.ozonProductId || '',
        name: article.name,
        channel: platform,
        planDay,
        factDay,
        deltaPct,
        marginDay: getRowPlanMarginDay(article),
        factMarginDay: getEstimatedFactMarginDay(article),
        planPnlDay: getRowPlanPnlDay(article),
        factPnlDay: getEstimatedFactPnlDay(article),
        revenueDay: getRowFactRevenue(article)
      });
    });
  });
  return rows.sort((a, b) => a.deltaPct - b.deltaPct);
}

function getMarginCompareRows() {
  const wbEntry = getManagerByChannel('WB');
  const ozEntry = getManagerByChannel('Ozon');
  if (!wbEntry || !ozEntry) return [];
  const wbMap = new Map((wbEntry[1].articles || []).filter(isLatestMarginArticle).map((item) => [item.sellerArticle, item]));
  const rows = [];

  (ozEntry[1].articles || []).filter(isLatestMarginArticle).forEach((ozItem) => {
    const wbItem = wbMap.get(ozItem.sellerArticle);
    if (!wbItem) return;

    const wbPlan = getRowPlanDay(wbItem);
    const ozonPlan = getRowPlanDay(ozItem);
    const wbFact = getRowFactDay(wbItem);
    const ozonFact = getRowFactDay(ozItem);
    const wbMarginPlan = getRowPlanMarginDay(wbItem);
    const ozonMarginPlan = getRowPlanMarginDay(ozItem);
    const wbMarginFact = getEstimatedFactMarginDay(wbItem);
    const ozonMarginFact = getEstimatedFactMarginDay(ozItem);
    const wbPnlPlan = getRowPlanPnlDay(wbItem);
    const ozonPnlPlan = getRowPlanPnlDay(ozItem);
    const wbPnlFact = getEstimatedFactPnlDay(wbItem);
    const ozonPnlFact = getEstimatedFactPnlDay(ozItem);
    const wbGap = wbPlan - wbFact;
    const ozGap = ozonPlan - ozonFact;

    let decisionKey = 'balanced';
    let decision = 'Смотреть обе площадки';
    let note = 'PnL и маржа близки: решение зависит от остатков и ограничений по поставке.';

    if (wbPnlFact > ozonPnlFact * 1.07) {
      decisionKey = 'wb';
      decision = 'Фокус на WB';
      note = wbGap > 0 ? 'WB сейчас дает выше чистую прибыль и ещё не добирает план.' : 'WB сейчас прибыльнее по чистой прибыли.';
    } else if (ozonPnlFact > wbPnlFact * 1.07) {
      decisionKey = 'ozon';
      decision = 'Фокус на Ozon';
      note = ozGap > 0 ? 'Ozon сейчас дает выше чистую прибыль и ещё не добирает план.' : 'Ozon сейчас прибыльнее по чистой прибыли.';
    } else if (wbMarginFact > ozonMarginFact) {
      decisionKey = 'wb';
      decision = 'WB чуть сильнее';
      note = 'По чистой прибыли площадки рядом, но у WB выше маржинальный эффект.';
    } else if (ozonMarginFact > wbMarginFact) {
      decisionKey = 'ozon';
      decision = 'Ozon чуть сильнее';
      note = 'По чистой прибыли площадки рядом, но у Ozon выше маржинальный эффект.';
    }

    rows.push({
      sellerArticle: ozItem.sellerArticle,
      wbArticle: wbItem.wbArticle || ozItem.wbArticle || '',
      ozonArticle: ozItem.ozonProductId || '',
      name: ozItem.name || wbItem.name || '—',
      wbPlan,
      ozonPlan,
      wbFact,
      ozonFact,
      wbMarginPlan,
      ozonMarginPlan,
      wbMarginFact,
      ozonMarginFact,
      wbPnlPlan,
      ozonPnlPlan,
      wbPnlFact,
      ozonPnlFact,
      decision,
      decisionKey,
      note,
      scoreDiff: Math.abs(wbPnlFact - ozonPnlFact) + Math.abs(wbMarginFact - ozonMarginFact) * 0.3
    });
  });

  return rows.sort((a, b) => b.scoreDiff - a.scoreDiff);
}

function buildLineChart(row) {
  const platformKey = row.channel === 'WB' ? 'wb' : 'ozon';
  const articleSeries = appState.data.history?.[platformKey]?.articles?.[row.sellerArticle]?.[appState.metric] || [];
  const dates = appState.data.history?.dates || [];
  if (!articleSeries.length || !dates.length) {
    return '<div class="muted">Для графика не хватает истории.</div>';
  }
  const planLevel = appState.metric === 'orders' ? row.planDay : getRowPlanRevenueDay(findArticle(row.channel, row.sellerArticle));
  const planSeries = articleSeries.map(() => planLevel || 0);
  const width = 900;
  const height = 260;
  const pad = { top: 20, right: 18, bottom: 32, left: 48 };
  const values = [...articleSeries, ...planSeries];
  const maxVal = Math.max(...values, 1);
  const minVal = 0;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const toX = (i) => pad.left + (innerW * i) / Math.max(articleSeries.length - 1, 1);
  const toY = (v) => pad.top + innerH - ((v - minVal) / (maxVal - minVal || 1)) * innerH;
  const planPath = planSeries.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(v)}`).join(' ');
  const factPath = articleSeries.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(v)}`).join(' ');
  const labels = [0, Math.floor(articleSeries.length / 2), articleSeries.length - 1].filter((v, i, arr) => arr.indexOf(v) === i);
  const labelLines = labels.map((i) => `
    <text x="${toX(i)}" y="${height - 10}" text-anchor="middle" font-size="11" fill="#6b7890">${escapeHtml(dates[i] || '')}</text>
  `).join('');
  const yTicks = [0, .33, .66, 1].map((ratio) => {
    const val = maxVal * ratio;
    const y = toY(val);
    return `
      <line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="#e8eef8" stroke-width="1" />
      <text x="${pad.left - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="#6b7890">${formatCompact(val)}</text>
    `;
  }).join('');
  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="100%" role="img" aria-label="График план факт">
      ${yTicks}
      <path d="${planPath}" fill="none" stroke="#2f6bff" stroke-width="3" stroke-linecap="round" />
      <path d="${factPath}" fill="none" stroke="#e35d5d" stroke-width="3" stroke-linecap="round" />
      ${labelLines}
      <g>
        <circle cx="${toX(articleSeries.length - 1)}" cy="${toY(planSeries[planSeries.length - 1])}" r="4" fill="#2f6bff"></circle>
        <circle cx="${toX(articleSeries.length - 1)}" cy="${toY(articleSeries[articleSeries.length - 1])}" r="4" fill="#e35d5d"></circle>
      </g>
      <g transform="translate(${pad.left}, 8)">
        <rect x="0" y="0" width="12" height="12" rx="6" fill="#2f6bff"></rect>
        <text x="18" y="10" font-size="12" fill="#18253a">План</text>
        <rect x="78" y="0" width="12" height="12" rx="6" fill="#e35d5d"></rect>
        <text x="96" y="10" font-size="12" fill="#18253a">Факт</text>
      </g>
    </svg>
  `;
}

function renderReportsView() {
  const reports = getAllReports();
  const shared = appState.storage?.isShared();
  const summary = [
    { label: 'Всего записей', value: reports.length },
    { label: 'Режим хранения', value: appState.storage.getDescriptor().label },
    { label: 'Общий журнал', value: shared ? 'Да' : 'Нет' },
    { label: 'Что делать дальше', value: shared ? 'Проверять' : 'Заполнить backend в config.js' }
  ];
  els.reportSummary.innerHTML = summary.map((item) => `
    <div class="summary-tile">
      <span>${item.label}</span>
      <strong>${item.value}</strong>
    </div>
  `).join('');
  els.reportsTable.innerHTML = renderSimpleTable([
    { key: 'time', label: 'Когда' },
    { key: 'author', label: 'Кто' },
    { key: 'route', label: 'Контур' },
    { key: 'status', label: 'Статус' },
    { key: 'storage', label: 'Хранилище' },
    { key: 'note', label: 'Что сохранили' }
  ], reports.map((item) => ({
    time: formatDateTime(item.created_at || item.createdAt),
    author: `<strong>${escapeHtml(item.author_name || item.author || '—')}</strong><span class="muted">${escapeHtml(item.platform || '')}</span>`,
    route: escapeHtml(item.route || item.contour || '—'),
    status: `<span class="badge ${normalizeStatus(item.status)}">${statusLabel(item.status)}</span>`,
    storage: escapeHtml(item.storage_label || item.storage || '—'),
    note: escapeHtml(item.note || '')
  })));
}

function exportReportsJson() {
  const blob = new Blob([JSON.stringify(getAllReports(), null, 2)], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tekstilno_portal_reports_v23.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function importReportsJson(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const rows = JSON.parse(reader.result);
      if (!Array.isArray(rows)) throw new Error('Ожидался массив');
      if (appState.storage.isShared()) {
        for (const row of rows) {
          await appState.storage.saveReport(row);
        }
        appState.sharedReports = await appState.storage.listReports();
      } else {
        appState.sharedReports = rows;
      }
      renderReportsView();
      alert(appState.storage.isShared() ? 'Журнал импортирован в общий backend.' : 'Журнал импортирован в текущую сессию.');
    } catch (error) {
      alert(`Не удалось импортировать JSON: ${error.message}`);
    }
  };
  reader.readAsText(file, 'utf-8');
}

function findArticle(channel, sellerArticle) {
  const managerEntry = getManagerByChannel(channel);
  return managerEntry?.[1]?.articles?.find((item) => item.sellerArticle === sellerArticle) || null;
}

function renderSimpleTable(columns, rows) {
  if (!rows.length) return '<div class="muted">Пока нет данных для этого среза.</div>';
  return `
    <table class="simple-table">
      <thead><tr>${columns.map((col) => `<th>${col.label}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows.map((row) => `<tr>${columns.map((col) => `<td>${row[col.key] ?? '—'}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
  `;
}

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function sum(values) {
  return values.reduce((acc, value) => acc + Number(value || 0), 0);
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }).format(date);
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(date);
}

function formatShortDate(value) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' }).format(date);
}

function formatNum(value, digits = 0) {
  const number = Number(value || 0);
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(number);
}

function formatMaybeNum(value, digits = 0) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (Number.isNaN(number)) return escapeHtml(String(value));
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(number);
}

function formatMoney(value) {
  const number = Number(value || 0);
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(number)} ₽`;
}

function formatPct(value) {
  const number = Number(value || 0) * 100;
  const sign = number > 0 ? '+' : '';
  return `${sign}${number.toFixed(0)}%`;
}

function formatCompact(value) {
  const num = Number(value || 0);
  if (num >= 1000) return `${Math.round(num / 100) / 10}k`;
  return `${Math.round(num)}`;
}

function normalizeStatus(status) {
  const map = { sent: 'done', reviewed: 'done', saved: 'in_progress', draft: 'todo', todo: 'todo', in_progress: 'in_progress', done: 'done', need_help: 'need_help' };
  return map[status] || 'todo';
}

function statusLabel(status) {
  const labels = {
    sent: 'Отправлено', reviewed: 'Проверено', saved: 'Сохранено', draft: 'Черновик',
    todo: 'Не начато', in_progress: 'В работе', done: 'Готово', need_help: 'Нужна помощь'
  };
  return labels[status] || status;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
