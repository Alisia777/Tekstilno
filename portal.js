
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
  taskStateRange: [],
  taskStateRangeMap: {},
  sharedReports: [],
  taskComments: [],
  entityHistory: [],
  selectedChartArticle: null,
  lastSharedRefreshAt: null,
  sharedRefreshTimer: null,
  taskCalendarAnchorDate: null,
  uiDrafts: {
    worklog: {}
  },
  suppressAutoSyncUntil: 0
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
    subtitle: 'WB и Ozon разведены по своим пакетам. Менеджер отмечает только статус и комментарий.'
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

const LEADER_NAME = (window.APP_CONFIG && window.APP_CONFIG.leaderName) || 'Вартан Борисович';

const WORK_TYPE_OPTIONS = [
  { value: 'seo', label: 'SEO' },
  { value: 'content', label: 'Контент' },
  { value: 'price', label: 'Цена / Маржа' },
  { value: 'localization', label: 'Локализация' },
  { value: 'ads', label: 'Реклама' },
  { value: 'analytics', label: 'Аналитика' },
  { value: 'supply', label: 'Поставка / остатки' },
  { value: 'other', label: 'Другое' }
];

const els = {};

document.addEventListener('DOMContentLoaded', initPortal);

async function initPortal() {
  cacheElements();
  bindEvents();
  appState.storage = createSharedStorage(appState.config);
  await loadData();
  enrichCrossReferences();
  appState.taskCalendarAnchorDate = appState.workDate;
  await refreshSharedState();
  applyRolePreset(appState.role, false);
  startSharedRefreshLoop();
  renderAll();
}

function cacheElements() {
  const ids = [
    'roleSelect','mainNav','contourStrip','storageModeLabel','currentDateLabel','pageTitle','pageSubtitle','workDateInput','platformToggle','syncBanner',
    'dashboardCards','peopleFocus','activityFeed','dashboardDeviations','dashboardSupply',
    'taskPackMeta','taskManagerCard','tasksTableWrap','taskStatusFilter','taskSearchInput','saveDailySummaryBtn',
    'supplyCards','supplyDeficitsTable','clusterNeedTable','supplyMatrixFrame','openSupplyFullLink',
    'chartArticleSelect','metricToggle','chartMeta','lineChart','marginCompareTable','controlDeviationTable','pnlCards','pnlFocusTable',
    'reportSummary','reportsTable','exportReportsBtn','importReportsInput','refreshSharedBtn','syncStatusNote'
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
    await setWorkDateAndRefresh(e.target.value, { forceCalendarAnchor: true });
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
  if (els.refreshSharedBtn) els.refreshSharedBtn.addEventListener('click', async () => {
    if (els.syncStatusNote) els.syncStatusNote.textContent = 'Обновляю…';
    await refreshSharedState({ force: true });
    renderAll();
  });
  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden && appState.storage?.isShared()) {
      if (shouldPauseAutoRefresh()) return;
      await refreshSharedState({ force: true });
      renderAll();
    }
  });
  window.addEventListener('focus', async () => {
    if (appState.storage?.isShared()) {
      if (shouldPauseAutoRefresh()) return;
      await refreshSharedState({ force: true });
      renderAll();
    }
  });
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

function buildTaskStateMap(rows = []) {
  return Object.fromEntries((rows || []).map((item) => {
    const article = item.seller_article || item.sellerArticle;
    return [`${item.work_date}__${item.platform}__${article}`, normalizeTaskStateRecord(item)];
  }));
}

function buildBusinessDateWindow(centerDate, before = 7, after = 7) {
  const dates = [];
  for (let i = before; i > 0; i -= 1) dates.push(shiftBusinessDate(centerDate, -i));
  dates.push(centerDate);
  for (let i = 1; i <= after; i += 1) dates.push(shiftBusinessDate(centerDate, i));
  return dates;
}

function getTaskCalendarCenterDate() {
  return appState.taskCalendarAnchorDate || appState.workDate;
}

function isDateInTaskCalendarWindow(dateStr, centerDate = getTaskCalendarCenterDate()) {
  return buildBusinessDateWindow(centerDate, 7, 7).includes(dateStr);
}

function syncTaskCalendarAnchor(dateStr, options = {}) {
  const force = !!options.force;
  if (!appState.taskCalendarAnchorDate || force || !isDateInTaskCalendarWindow(dateStr, appState.taskCalendarAnchorDate)) {
    appState.taskCalendarAnchorDate = dateStr;
  }
}

function getDefaultWorklogDraft(channel) {
  return {
    channel,
    date: appState.workDate,
    articleValue: '',
    type: 'other',
    status: 'in_progress',
    body: ''
  };
}

function getWorklogDraft(channel) {
  if (!appState.uiDrafts.worklog[channel]) {
    appState.uiDrafts.worklog[channel] = getDefaultWorklogDraft(channel);
  }
  return appState.uiDrafts.worklog[channel];
}

function isPristineWorklogDraft(draft) {
  if (!draft) return true;
  return !String(draft.articleValue || '').trim()
    && !String(draft.body || '').trim()
    && String(draft.type || 'other') === 'other'
    && String(draft.status || 'in_progress') === 'in_progress';
}

function syncWorklogDraftDates(dateStr, options = {}) {
  const onlyIfPristine = options.onlyIfPristine !== false;
  ['WB', 'Ozon'].forEach((channel) => {
    const draft = getWorklogDraft(channel);
    if (!onlyIfPristine || isPristineWorklogDraft(draft)) draft.date = dateStr;
  });
}

function updateWorklogDraft(channel, patch = {}, options = {}) {
  const current = getWorklogDraft(channel);
  appState.uiDrafts.worklog[channel] = {
    ...current,
    ...patch
  };
  if (options.markEditing !== false) appState.suppressAutoSyncUntil = Date.now() + 30000;
  return appState.uiDrafts.worklog[channel];
}

function clearWorklogDraft(channel, dateValue = appState.workDate) {
  appState.uiDrafts.worklog[channel] = {
    ...getDefaultWorklogDraft(channel),
    date: dateValue || appState.workDate
  };
  appState.suppressAutoSyncUntil = 0;
}

function shouldPauseAutoRefresh() {
  if (Date.now() < appState.suppressAutoSyncUntil) return true;
  const active = document.activeElement;
  if (!active) return false;
  return !!(
    active.closest('.worklog-panel') ||
    active.closest('.tasks-table') ||
    active.closest('.planner-toolbar')
  );
}

function formatTimeOnly(dateLike) {
  if (!dateLike) return '—';
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return '—';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

function startSharedRefreshLoop() {
  if (!appState.storage?.isShared()) return;
  if (appState.sharedRefreshTimer) clearInterval(appState.sharedRefreshTimer);
  appState.sharedRefreshTimer = setInterval(async () => {
    if (document.hidden || shouldPauseAutoRefresh()) return;
    try {
      await refreshSharedState({ force: true });
      if (appState.view === 'reports') renderReportsView();
      else renderAll();
    } catch (error) {
      console.error(error);
      if (els.syncStatusNote) els.syncStatusNote.textContent = 'Ошибка синхр.';
    }
  }, 12000);
}

async function refreshSharedState(options = {}) {
  const calendarWindow = buildBusinessDateWindow(getTaskCalendarCenterDate(), 7, 7);
  const rangeStart = calendarWindow[0];
  const rangeEnd = calendarWindow[calendarWindow.length - 1];
  if (els.syncStatusNote) els.syncStatusNote.textContent = appState.storage?.isShared() ? 'Синхронизация…' : 'Локальный режим';
  const [taskRows, taskRangeRows, reports, comments, history] = await Promise.all([
    appState.storage.listTaskStates(appState.workDate),
    appState.storage.listTaskStatesRange ? appState.storage.listTaskStatesRange(rangeStart, rangeEnd) : appState.storage.listTaskStates(appState.workDate),
    appState.storage.listReports(),
    appState.storage.listTaskComments
      ? appState.storage.listTaskComments({ work_date: appState.workDate, limit: 800 })
      : Promise.resolve([]),
    appState.storage.listHistory
      ? appState.storage.listHistory({ work_date: appState.workDate, limit: 800 })
      : Promise.resolve([])
  ]);
  appState.taskStateMap = buildTaskStateMap(taskRows || []);
  appState.taskStateRange = taskRangeRows || [];
  appState.taskStateRangeMap = buildTaskStateMap(taskRangeRows || []);
  appState.sharedReports = reports || [];
  appState.taskComments = comments || [];
  appState.entityHistory = history || [];
  appState.lastSharedRefreshAt = new Date().toISOString();
  if (els.syncStatusNote) els.syncStatusNote.textContent = appState.storage?.isShared()
    ? `Синхр.: ${formatTimeOnly(appState.lastSharedRefreshAt)}`
    : 'Локальный режим';
}

function applyRolePreset(role, rerender = true) {
  appState.role = role;
  const preset = ROLE_PRESETS[role] || ROLE_PRESETS.leader;
  if (role === 'manager_wb' || role === 'manager_ozon') appState.platform = preset.defaultPlatform;
  appState.view = preset.defaultView;
  els.roleSelect.value = role;
  syncTaskCalendarAnchor(appState.workDate);
  if (rerender) renderAll();
}

function renderAll() {
  const descriptor = appState.storage?.getDescriptor?.() || { label: 'session-preview', note: 'Backend не подключён.' };
  els.workDateInput.value = appState.workDate;
  els.storageModeLabel.textContent = descriptor.label;
  els.currentDateLabel.textContent = formatDate(appState.workDate);
  if (els.syncStatusNote) els.syncStatusNote.textContent = descriptor.shared && appState.lastSharedRefreshAt ? `Синхр.: ${formatTimeOnly(appState.lastSharedRefreshAt)}` : (descriptor.shared ? 'Жду данные…' : 'Локальный режим');
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

function getPackForManager(managerName, dateStr = appState.workDate) {
  const manager = getManagers()[managerName];
  if (!manager || !Array.isArray(manager.articles)) return { managerName, manager, packArticles: [], packNumber: 1, totalPacks: 1 };
  const packSize = Number(manager.packSize || appState.data.plan.packSizeDefault || 20);
  const totalPacks = Math.max(1, Math.ceil(manager.articles.length / packSize));
  const offset = getBusinessDayOffset(appState.data.plan.cycleAnchorDate, dateStr);
  const packNumber = ((offset % totalPacks) + totalPacks) % totalPacks + 1;
  const packArticles = manager.articles.filter((article) => Number(article.packNumber || 1) === packNumber);
  return { managerName, manager, packArticles, packNumber, totalPacks, workDate: dateStr };
}

function getTaskRowsForCurrentSelection() {
  let channel = appState.platform;
  if (appState.role === 'manager_wb') channel = 'WB';
  if (appState.role === 'manager_ozon') channel = 'Ozon';
  if (channel === 'All') channel = 'WB';
  const managerEntry = getManagerByChannel(channel);
  if (!managerEntry) return { channel, managerName: '', manager: null, rows: [], packNumber: 1, totalPacks: 1 };
  const [managerName] = managerEntry;
  const packInfo = getPackForManager(managerName);
  return { channel, ...packInfo, rows: packInfo.packArticles };
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
  const revenue = getRowFactRevenue(article);
  const pct = getRowPlanMarginPct(article);
  return revenue * pct / 100;
}

function getEstimatedFactPnlDay(article) {
  const revenue = getRowFactRevenue(article);
  const pct = getRowNetMarginPct(article);
  return revenue * pct / 100;
}

function getRowPlanPnlDay(article) {
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

function getTaskStorageKey(article, workDate = appState.workDate) {
  return `${workDate}__${article.channel}__${article.sellerArticle}`;
}

function extractDueDate(value) {
  if (!value) return appState.workDate || '';
  const raw = String(value);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : raw;
}

function normalizeTaskStateRecord(raw = {}, article = null) {
  const managerName = raw.manager_name || raw.assignee_name || (article ? (article.channel === 'WB' ? 'Анастасия' : 'Ирина Паламарук') : '');
  const leaderDefault = article?.focusAction || article?.focusComment || article?.action || raw.focus_comment || '';
  const dueSource = raw.due_at || raw.dueAt || raw.due_date || raw.dueDate || appState.workDate || '';
  return {
    status: raw.status || 'todo',
    comment: raw.comment || raw.manager_comment || raw.managerComment || '',
    manager_comment: raw.manager_comment || raw.managerComment || raw.comment || '',
    leader_comment: raw.leader_comment || raw.leaderComment || leaderDefault,
    due_at: raw.due_at || raw.dueAt || '',
    due_date: extractDueDate(dueSource),
    updated_at: raw.updated_at || raw.updatedAt || '',
    updated_by: raw.updated_by || raw.updatedBy || '',
    assignee_name: raw.assignee_name || raw.assigneeName || managerName || '',
    manager_name: raw.manager_name || raw.managerName || managerName || '',
    wb_article: raw.wb_article || raw.wbArticle || article?.wbArticle || '',
    ozon_article: raw.ozon_article || raw.ozonArticle || article?.ozonProductId || article?.ozonArticle || ''
  };
}

function getEmptyTaskState(article = null) {
  return normalizeTaskStateRecord({
    status: 'todo',
    comment: '',
    manager_comment: '',
    leader_comment: article?.focusAction || article?.focusComment || article?.action || '',
    due_date: appState.workDate,
    due_at: appState.workDate ? `${appState.workDate}T18:00:00` : '',
    updated_at: '',
    updated_by: '',
    assignee_name: article ? (article.channel === 'WB' ? 'Анастасия' : 'Ирина Паламарук') : '',
    manager_name: article ? (article.channel === 'WB' ? 'Анастасия' : 'Ирина Паламарук') : ''
  }, article);
}

function getTaskState(article) {
  return normalizeTaskStateRecord(appState.taskStateMap[getTaskStorageKey(article)] || getEmptyTaskState(article), article);
}

function shiftDate(dateStr, deltaDays) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function shiftBusinessDate(dateStr, deltaDays) {
  let current = dateStr;
  let left = Math.abs(deltaDays);
  const step = deltaDays >= 0 ? 1 : -1;
  while (left > 0) {
    current = shiftDate(current, step);
    const day = new Date(`${current}T00:00:00`).getDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return current;
}

async function setWorkDateAndRefresh(dateStr, options = {}) {
  appState.workDate = dateStr;
  syncTaskCalendarAnchor(dateStr, { force: !!options.forceCalendarAnchor });
  syncWorklogDraftDates(dateStr, { onlyIfPristine: true });
  els.workDateInput.value = dateStr;
  await refreshSharedState();
  renderAll();
}

async function fetchTaskStateMapForDate(workDate) {
  const rows = await appState.storage.listTaskStates(workDate);
  return buildTaskStateMap(rows || []);
}

function buildTaskStatePayload(article, patch = {}, previousState = getTaskState(article)) {
  const managerName = article.channel === 'WB' ? 'Анастасия' : 'Ирина Паламарук';
  const isLeader = appState.role === 'leader';
  const leaderComment = patch.leaderComment !== undefined ? patch.leaderComment : (previousState.leader_comment || article.focusAction || article.focusComment || article.action || '');
  const managerComment = patch.managerComment !== undefined ? patch.managerComment : (previousState.manager_comment || previousState.comment || '');
  const dueDate = patch.dueDate !== undefined ? patch.dueDate : (previousState.due_date || appState.workDate);
  const dueAt = dueDate ? `${dueDate}T18:00:00` : null;
  return {
    work_date: appState.workDate,
    platform: article.channel,
    seller_article: article.sellerArticle,
    manager_name: managerName,
    assignee_name: managerName,
    wb_article: article.wbArticle || '',
    ozon_article: article.ozonProductId || article.ozonArticle || '',
    item_name: article.name || '',
    status: patch.status || previousState.status || 'todo',
    comment: managerComment || leaderComment || '',
    manager_comment: managerComment || '',
    leader_comment: leaderComment || '',
    focus_comment: article.focusAction || article.focusComment || article.action || article.comment || '',
    priority: article.priority || '',
    due_at: dueAt,
    updated_by: isLeader ? LEADER_NAME : managerName,
    updated_at: new Date().toISOString(),
    metadata: {
      channel: article.channel,
      category: article.category || '',
      focusSignal: article.focusSignal || article.signal || '',
      planningDate: appState.workDate,
      editorRole: appState.role
    }
  };
}

function renderArticleIdentity(row, options = {}) {
  const wb = row.wbArticle || (row.platformArticleLabel === 'WB артикул' ? (row.platformArticle || '—') : '—');
  const ozon = row.ozonProductId || row.ozonArticle || (row.platformArticleLabel === 'Ozon артикул' ? row.platformArticle : '') || '—';
  const lines = [
    `<strong>${escapeHtml(row.sellerArticle || '—')}</strong>`
  ];
  if (options.showName && row.name) lines.push(`<span class="muted">${escapeHtml(row.name)}</span>`);
  lines.push(`<span class="muted">WB: ${escapeHtml(String(wb || '—'))}</span>`);
  lines.push(`<span class="muted">Ozon: ${escapeHtml(String(ozon || '—'))}</span>`);
  return lines.join('');
}

async function saveTaskRow(article, patch = {}) {
  const previousState = getTaskState(article);
  const managerName = article.channel === 'WB' ? 'Анастасия' : 'Ирина Паламарук';
  const actorName = appState.role === 'leader' ? LEADER_NAME : managerName;
  const actorRole = appState.role === 'leader' ? 'leader' : (article.channel === 'WB' ? 'manager_wb' : 'manager_ozon');
  const payload = buildTaskStatePayload(article, patch, previousState);
  const savedRow = await appState.storage.saveTaskState(payload);
  appState.taskStateMap[getTaskStorageKey(article)] = normalizeTaskStateRecord(savedRow || payload, article);

  const leaderCommentChanged = appState.role === 'leader' && payload.leader_comment && payload.leader_comment !== (previousState.leader_comment || '');
  const managerCommentChanged = appState.role !== 'leader' && payload.manager_comment && payload.manager_comment !== (previousState.manager_comment || previousState.comment || '');

  if (leaderCommentChanged && appState.storage.saveTaskComment) {
    await appState.storage.saveTaskComment({
      work_date: appState.workDate,
      platform: article.channel,
      seller_article: article.sellerArticle,
      wb_article: article.wbArticle || '',
      ozon_article: article.ozonProductId || article.ozonArticle || '',
      manager_name: managerName,
      author_name: actorName,
      author_role: actorRole,
      comment_type: 'leader_plan',
      body: payload.leader_comment,
      meta: {
        dueDate: payload.due_at,
        focusSignal: article.focusSignal || article.signal || '',
        focusAction: article.focusAction || article.focusComment || article.action || ''
      }
    });
  }

  if (managerCommentChanged && appState.storage.saveTaskComment) {
    await appState.storage.saveTaskComment({
      work_date: appState.workDate,
      platform: article.channel,
      seller_article: article.sellerArticle,
      wb_article: article.wbArticle || '',
      ozon_article: article.ozonProductId || article.ozonArticle || '',
      manager_name: managerName,
      author_name: actorName,
      author_role: actorRole,
      comment_type: 'manager_update',
      body: payload.manager_comment,
      meta: {
        status: payload.status,
        focusSignal: article.focusSignal || article.signal || '',
        focusAction: article.focusAction || article.focusComment || article.action || ''
      }
    });
  }

  const report = {
    work_date: appState.workDate,
    created_at: new Date().toISOString(),
    author_name: actorName,
    author_role: actorRole,
    platform: article.channel,
    contour: 'tasks',
    title: appState.role === 'leader' ? `${article.channel} · план ${article.sellerArticle}` : `${article.channel} · ${article.sellerArticle}`,
    route: appState.role === 'leader' ? `${article.channel} · задачи · план` : `${article.channel} · задачи`,
    status: payload.status || 'saved',
    items_count: 1,
    note: appState.role === 'leader'
      ? (payload.leader_comment || `План на ${formatDate(appState.workDate)} обновлён`)
      : (payload.manager_comment || 'Изменён статус по артикулу'),
    storage_label: appState.storage.getDescriptor().label,
    payload: {
      sellerArticle: article.sellerArticle,
      wbArticle: article.wbArticle || '',
      ozonArticle: article.ozonProductId || article.ozonArticle || '',
      dueDate: payload.due_at || ''
    }
  };
  await appState.storage.saveReport(report);
  await refreshSharedState();
  renderDashboardView();
  renderReportsView();
}

async function planTaskRowsForDate(copyFromDate = null) {
  const taskInfo = getTaskRowsForCurrentSelection();
  if (!taskInfo.rows.length) return;
  const sourceMap = copyFromDate ? await fetchTaskStateMapForDate(copyFromDate) : {};
  const tasks = taskInfo.rows.map(async (article) => {
    const currentState = getTaskState(article);
    const sourceState = copyFromDate ? (sourceMap[`${copyFromDate}__${article.channel}__${article.sellerArticle}`] || {}) : {};
    const payload = buildTaskStatePayload(article, {
      status: currentState.status && currentState.status !== 'todo' ? currentState.status : 'todo',
      managerComment: currentState.manager_comment || '',
      leaderComment: currentState.leader_comment || sourceState.leader_comment || article.focusAction || article.focusComment || article.action || '',
      dueDate: currentState.due_date || appState.workDate
    }, currentState);
    return appState.storage.saveTaskState(payload);
  });
  await Promise.all(tasks);
  await appState.storage.saveReport({
    work_date: appState.workDate,
    created_at: new Date().toISOString(),
    author_name: LEADER_NAME,
    author_role: 'leader',
    platform: taskInfo.channel,
    contour: 'tasks',
    title: `${taskInfo.channel} · план на дату`,
    route: `${taskInfo.channel} · задачи · план`,
    status: 'saved',
    items_count: taskInfo.rows.length,
    note: copyFromDate
      ? `План задач на ${formatDate(appState.workDate)} скопирован с ${formatDate(copyFromDate)}. SKU: ${taskInfo.rows.length}.`
      : `План задач на ${formatDate(appState.workDate)} зафиксирован. SKU: ${taskInfo.rows.length}.`,
    storage_label: appState.storage.getDescriptor().label,
    payload: {
      sourceDate: copyFromDate || null,
      assignee: taskInfo.managerName,
      platform: taskInfo.channel
    }
  });
  await refreshSharedState();
  renderAll();
  alert(copyFromDate ? 'План на выбранную дату скопирован.' : 'Задачи на выбранную дату зафиксированы.');
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
    title: `${taskInfo.channel} · дневной срез`,
    route: `${taskInfo.channel} · задачи`,
    status: 'saved',
    items_count: taskInfo.rows.length,
    note: `Пакет ${taskInfo.packNumber}/${taskInfo.totalPacks}. Готово: ${statusCounts.done}, в работе: ${statusCounts.in_progress}, нужна помощь: ${statusCounts.need_help}.`,
    storage_label: appState.storage.getDescriptor().label,
    payload: {
      packNumber: taskInfo.packNumber,
      totalPacks: taskInfo.totalPacks
    }
  };
  await appState.storage.saveReport(report);
  await refreshSharedState();
  renderDashboardView();
  renderReportsView();
  alert(appState.storage.isShared() ? 'Срез дня сохранён в общем журнале.' : 'Срез дня сохранён в текущей сессии. Чтобы его видели все, подключи backend.');
}

function countTaskStatuses(rows) {
  return rows.reduce((acc, row) => {
    const state = getTaskState(row);
    acc[state.status] = (acc[state.status] || 0) + 1;
    return acc;
  }, { todo: 0, in_progress: 0, done: 0, need_help: 0 });
}

function getTaskStateForDate(article, workDate, stateMap = appState.taskStateRangeMap) {
  const key = `${workDate}__${article.channel}__${article.sellerArticle}`;
  return normalizeTaskStateRecord(stateMap[key] || getEmptyTaskState(article), article);
}

function formatCalendarDateLabel(value) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', weekday: 'short' }).format(date);
}

function getTaskCalendarData(channel) {
  const managerEntry = getManagerByChannel(channel);
  if (!managerEntry) return [];
  const [managerName] = managerEntry;
  const dates = buildBusinessDateWindow(getTaskCalendarCenterDate(), 7, 7);
  const today = new Date().toISOString().slice(0, 10);
  return dates.map((date) => {
    const packInfo = getPackForManager(managerName, date);
    const rows = packInfo.packArticles || [];
    let existing = 0;
    let done = 0;
    let inProgress = 0;
    let needHelp = 0;
    let todo = 0;
    rows.forEach((article) => {
      const key = `${date}__${channel}__${article.sellerArticle}`;
      if (appState.taskStateRangeMap[key]) existing += 1;
      const state = getTaskStateForDate(article, date);
      if (state.status === 'done') done += 1;
      else if (state.status === 'in_progress') inProgress += 1;
      else if (state.status === 'need_help') needHelp += 1;
      else todo += 1;
    });
    const total = rows.length;
    const hasPlan = existing > 0;
    const overdue = date < today && hasPlan ? Math.max(0, total - done) : 0;
    let stateClass = 'empty';
    let stateLabel = date < today ? 'Нет плана' : 'Не запланировано';
    if (hasPlan && done === total && total > 0) {
      stateClass = 'done';
      stateLabel = 'Готово';
    } else if (needHelp > 0) {
      stateClass = 'need_help';
      stateLabel = 'Нужна помощь';
    } else if (date < today && hasPlan && done < total) {
      stateClass = 'overdue';
      stateLabel = 'Есть хвосты';
    } else if (hasPlan && (inProgress > 0 || done > 0)) {
      stateClass = 'in_progress';
      stateLabel = 'В работе';
    } else if (hasPlan) {
      stateClass = 'planned';
      stateLabel = 'План стоит';
    }
    const progressPct = total ? Math.round((done / total) * 100) : 0;
    return {
      date,
      label: formatCalendarDateLabel(date),
      total,
      done,
      inProgress,
      needHelp,
      todo,
      hasPlan,
      overdue,
      progressPct,
      stateClass,
      stateLabel,
      packNumber: packInfo.packNumber,
      totalPacks: packInfo.totalPacks,
      isSelected: date === appState.workDate,
      isToday: date === today
    };
  });
}

function renderTaskCalendar(calendarData) {
  return `
    <div class="task-calendar-block">
      <div class="task-calendar-head">
        <div>
          <strong>Календарь выполнения по датам</strong>
          <p class="help-text">Вартан видит прошлые, текущие и будущие даты: где план поставлен, где идёт работа, а где остались хвосты.</p>
        </div>
        <div class="task-calendar-legend">
          <span class="calendar-legend done">Готово</span>
          <span class="calendar-legend in_progress">В работе</span>
          <span class="calendar-legend planned">План</span>
          <span class="calendar-legend overdue">Хвосты</span>
          <span class="calendar-legend need_help">Нужна помощь</span>
        </div>
      </div>
      <div class="task-calendar-grid">
        ${calendarData.map((day) => `
          <button class="task-calendar-card ${day.stateClass} ${day.isSelected ? 'selected' : ''}" type="button" data-calendar-date="${day.date}">
            <div class="task-calendar-date-row">
              <span class="task-calendar-date">${escapeHtml(day.label)}</span>
              ${day.isToday ? '<span class="pill-note">сегодня</span>' : ''}
            </div>
            <strong>${escapeHtml(day.stateLabel)}</strong>
            <div class="task-calendar-meta">Пакет ${day.packNumber}/${day.totalPacks} · SKU ${day.total}</div>
            <div class="task-calendar-counts">
              <span>Г ${day.done}</span>
              <span>В ${day.inProgress}</span>
              <span>! ${day.needHelp}</span>
              <span>Х ${day.overdue}</span>
            </div>
            <div class="task-calendar-progress"><span style="width:${day.progressPct}%"></span></div>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function getArticleCatalog(channel) {
  const map = new Map();
  const addArticle = (raw = {}) => {
    const sellerArticle = String(raw.sellerArticle || raw.seller_article || '').trim();
    if (!sellerArticle) return;
    const current = map.get(sellerArticle) || {};
    map.set(sellerArticle, {
      sellerArticle,
      channel,
      name: raw.name || raw.item_name || current.name || '',
      category: raw.category || current.category || '',
      wbArticle: String(raw.wbArticle || raw.wb_article || raw.platformArticle || current.wbArticle || '').replace(/\.0$/, ''),
      ozonArticle: String(raw.ozonArticle || raw.ozon_article || raw.ozonProductId || current.ozonArticle || '').replace(/\.0$/, ''),
      action: raw.action || raw.focusAction || raw.focusComment || current.action || '',
      priorityLabel: raw.priorityLabel || current.priorityLabel || '',
      photoUrl: raw.photoUrl || current.photoUrl || ''
    });
  };
  const managerEntry = getManagerByChannel(channel);
  if (managerEntry) (managerEntry[1]?.articles || []).forEach(addArticle);
  (appState.data.nina?.platforms?.[channel]?.rows || []).forEach(addArticle);
  return [...map.values()].sort((a, b) => {
    const wbA = String(a.wbArticle || '').padStart(20, '0');
    const wbB = String(b.wbArticle || '').padStart(20, '0');
    if (wbA !== wbB) return wbA.localeCompare(wbB, 'ru');
    return String(a.sellerArticle || '').localeCompare(String(b.sellerArticle || ''), 'ru');
  });
}

function findCatalogArticle(channel, rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return null;
  const normalized = value.toLowerCase();
  const digits = value.replace(/\D+/g, '');
  return getArticleCatalog(channel).find((item) => {
    const seller = String(item.sellerArticle || '').trim().toLowerCase();
    const wb = String(item.wbArticle || '').replace(/\D+/g, '');
    const ozon = String(item.ozonArticle || '').replace(/\D+/g, '');
    return seller === normalized || (digits && wb === digits) || (digits && ozon === digits);
  }) || null;
}

function getWorklogEntries(channel = null) {
  return [...(appState.taskComments || [])]
    .filter((item) => item.comment_type === 'manager_worklog' && (!channel || item.platform === channel))
    .sort((a, b) => new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0));
}

function commentTypeLabel(type) {
  const map = {
    leader_plan: 'План руководителя',
    manager_update: 'Обновление менеджера',
    manager_worklog: 'Строка работы',
    comment: 'Комментарий'
  };
  return map[type] || type || 'Комментарий';
}

function workTypeLabel(type) {
  const found = WORK_TYPE_OPTIONS.find((item) => item.value === type);
  return found ? found.label : (type || 'Другое');
}

function renderWorklogArticleHint(article) {
  if (!article) {
    return '<div class="help-text">Выбери артикул из полной матрицы WB / Ozon. Новая запись не перезатрёт прошлую — каждая строка пишется отдельно в Supabase и видна Вартану в общей сводной.</div>';
  }
  return `
    <div class="worklog-hint-card">
      <strong>WB ${escapeHtml(String(article.wbArticle || '—'))}</strong>
      <span>${escapeHtml(article.sellerArticle || '—')}</span>
      <span>${escapeHtml(article.name || '—')}</span>
      <span>${escapeHtml(article.category || '')}</span>
    </div>
  `;
}

function renderTaskWorklogPanel(channel) {
  const draft = getWorklogDraft(channel);
  const entries = getWorklogEntries(channel).slice(0, 20);
  const selectedArticle = findCatalogArticle(channel, draft.articleValue || '');
  const table = renderSimpleTable([
    { key: 'time', label: 'Когда' },
    { key: 'article', label: 'Артикул' },
    { key: 'type', label: 'Тип работы' },
    { key: 'status', label: 'Статус' },
    { key: 'body', label: 'Что сделали' }
  ], entries.map((item) => ({
    time: formatDateTime(item.created_at || item.createdAt),
    article: `<strong>${escapeHtml(item.wb_article || item.wbArticle || '—')}</strong><span class="muted">${escapeHtml(item.seller_article || item.sellerArticle || '')}</span>`,
    type: escapeHtml(workTypeLabel(item.meta?.workType || item.meta?.work_type || 'other')),
    status: `<span class="badge ${normalizeStatus(item.meta?.status || 'saved')}">${statusLabel(item.meta?.status || 'saved')}</span>`,
    body: escapeHtml(item.body || '')
  })));
  const catalog = getArticleCatalog(channel);
  const datalistId = `worklog-article-list-${channel}`;
  return `
    <div class="worklog-panel">
      <div class="worklog-head">
        <div>
          <strong>Доп. строка работы по артикулу</strong>
          <p class="help-text">Если менеджер работал не по фиксированным 20 SKU, он выбирает артикул из полной матрицы, ставит дату и пишет, что сделал. Это append-only журнал: новая запись не стирает старую.</p>
        </div>
        <div class="pill-note">Дата записи по умолчанию = рабочая дата сверху, но её можно поменять прямо здесь. Черновик не слетит, даже если портал обновится.</div>
      </div>
      <div class="worklog-grid">
        <label class="worklog-field">
          <span>Дата работы</span>
          <input class="inline-input" id="worklogDateInput" type="date" value="${escapeAttr(draft.date || appState.workDate)}" />
        </label>
        <label class="worklog-field worklog-field-wide">
          <span>Артикул из полной матрицы</span>
          <input class="inline-input" id="worklogArticleInput" list="${datalistId}" placeholder="WB арт. или sellerArticle" value="${escapeAttr(draft.articleValue || '')}" />
          <datalist id="${datalistId}">
            ${catalog.map((item) => `<option value="${escapeAttr(item.sellerArticle)}" label="WB ${escapeAttr(String(item.wbArticle || '—'))} · ${escapeAttr(item.name || item.category || '')}"></option>`).join('')}
          </datalist>
        </label>
        <label class="worklog-field">
          <span>Тип работы</span>
          <select class="inline-select" id="worklogTypeInput">
            ${WORK_TYPE_OPTIONS.map((item) => `<option value="${item.value}" ${item.value === (draft.type || 'other') ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}
          </select>
        </label>
        <label class="worklog-field">
          <span>Статус</span>
          <select class="inline-select" id="worklogStatusInput">
            <option value="in_progress" ${String(draft.status || 'in_progress') === 'in_progress' ? 'selected' : ''}>В работе</option>
            <option value="done" ${String(draft.status || 'in_progress') === 'done' ? 'selected' : ''}>Готово</option>
            <option value="need_help" ${String(draft.status || 'in_progress') === 'need_help' ? 'selected' : ''}>Нужна помощь</option>
            <option value="saved" ${String(draft.status || 'in_progress') === 'saved' ? 'selected' : ''}>Сохранено</option>
          </select>
        </label>
      </div>
      <div id="worklogArticleHint" class="worklog-hint">${renderWorklogArticleHint(selectedArticle)}</div>
      <label class="worklog-field" style="margin-top:12px;">
        <span>Что сделали / на что обратить внимание</span>
        <textarea class="inline-input inline-textarea" id="worklogBodyInput" placeholder="Например: проверила карточку, отключила рекламу, обновила цену, проверила SEO, внесла изменения по контенту...">${escapeHtml(draft.body || '')}</textarea>
      </label>
      <div class="worklog-actions">
        <button class="btn btn-primary" id="saveWorklogBtn" type="button">Добавить строку в общую сводную</button>
        <span class="help-text">Строка сохранится в Supabase, появится внизу в журнале и не перетрёт предыдущие записи по этому артикулу.</span>
      </div>
      <div class="worklog-journal">
        <div class="worklog-journal-head">
          <strong>Уже сохранено за ${escapeHtml(formatDate(draft.date || appState.workDate))}</strong>
          <span class="pill-note">${entries.length} записей по ${escapeHtml(channel)}</span>
        </div>
        <div class="simple-table-wrap">${table}</div>
      </div>
    </div>
  `;
}

function bindTaskWorklogPanel(channel) {
  const articleInput = document.getElementById('worklogArticleInput');
  const dateInput = document.getElementById('worklogDateInput');
  const typeInput = document.getElementById('worklogTypeInput');
  const statusInput = document.getElementById('worklogStatusInput');
  const bodyInput = document.getElementById('worklogBodyInput');
  const hint = document.getElementById('worklogArticleHint');
  const markEditing = () => { appState.suppressAutoSyncUntil = Date.now() + 30000; };
  if (articleInput && hint) {
    const refreshHint = (markEditing = true) => {
      updateWorklogDraft(channel, { articleValue: articleInput.value }, { markEditing });
      hint.innerHTML = renderWorklogArticleHint(findCatalogArticle(channel, articleInput.value));
    };
    articleInput.addEventListener('input', () => refreshHint(true));
    articleInput.addEventListener('change', () => refreshHint(true));
    articleInput.addEventListener('focus', markEditing);
    refreshHint(false);
  }
  if (dateInput) {
    dateInput.addEventListener('change', () => updateWorklogDraft(channel, { date: dateInput.value || appState.workDate }));
    dateInput.addEventListener('focus', markEditing);
  }
  if (typeInput) {
    typeInput.addEventListener('change', () => updateWorklogDraft(channel, { type: typeInput.value || 'other' }));
    typeInput.addEventListener('focus', markEditing);
  }
  if (statusInput) {
    statusInput.addEventListener('change', () => updateWorklogDraft(channel, { status: statusInput.value || 'in_progress' }));
    statusInput.addEventListener('focus', markEditing);
  }
  if (bodyInput) {
    bodyInput.addEventListener('input', () => updateWorklogDraft(channel, { body: bodyInput.value }));
    bodyInput.addEventListener('focus', markEditing);
  }
  const saveBtn = document.getElementById('saveWorklogBtn');
  if (saveBtn) saveBtn.addEventListener('click', async () => saveManualWorklog(channel));
}

async function saveManualWorklog(channel) {
  const dateInput = document.getElementById('worklogDateInput');
  const articleInput = document.getElementById('worklogArticleInput');
  const typeInput = document.getElementById('worklogTypeInput');
  const statusInput = document.getElementById('worklogStatusInput');
  const bodyInput = document.getElementById('worklogBodyInput');
  const draft = getWorklogDraft(channel);
  const selectedDate = dateInput?.value || draft.date || appState.workDate;
  const articleValue = articleInput?.value || draft.articleValue || '';
  const article = findCatalogArticle(channel, articleValue);
  const body = (bodyInput?.value ?? draft.body ?? '').trim();
  if (!article) {
    alert('Выбери артикул из полной матрицы — можно вставить sellerArticle или WB артикул.');
    return;
  }
  if (!body) {
    alert('Добавь комментарий: что именно сделали по артикулу.');
    return;
  }
  const managerName = channel === 'WB' ? 'Анастасия' : 'Ирина Паламарук';
  const actorName = appState.role === 'leader' ? LEADER_NAME : managerName;
  const actorRole = appState.role === 'leader' ? 'leader' : (channel === 'WB' ? 'manager_wb' : 'manager_ozon');
  const status = statusInput?.value || draft.status || 'saved';
  const workType = typeInput?.value || draft.type || 'other';
  await appState.storage.saveTaskComment({
    work_date: selectedDate,
    platform: channel,
    seller_article: article.sellerArticle,
    wb_article: article.wbArticle || '',
    ozon_article: article.ozonArticle || '',
    manager_name: managerName,
    author_name: actorName,
    author_role: actorRole,
    comment_type: 'manager_worklog',
    body,
    meta: {
      workType,
      status,
      channel,
      category: article.category || '',
      itemName: article.name || '',
      source: 'manual_matrix_entry',
      selectedDate
    }
  });
  await appState.storage.saveReport({
    work_date: selectedDate,
    created_at: new Date().toISOString(),
    author_name: actorName,
    author_role: actorRole,
    platform: channel,
    contour: 'tasks',
    title: `${channel} · доп. запись ${article.sellerArticle}`,
    route: `${channel} · задачи · рабочий журнал`,
    status,
    items_count: 1,
    note: `${workTypeLabel(workType)} · ${body}`,
    storage_label: appState.storage.getDescriptor().label,
    payload: {
      sellerArticle: article.sellerArticle,
      wbArticle: article.wbArticle || '',
      ozonArticle: article.ozonArticle || '',
      manual: true
    }
  });
  if (selectedDate !== appState.workDate) {
    appState.workDate = selectedDate;
    syncTaskCalendarAnchor(selectedDate);
    syncWorklogDraftDates(selectedDate, { onlyIfPristine: true });
    if (els.workDateInput) els.workDateInput.value = selectedDate;
  }
  clearWorklogDraft(channel, selectedDate);
  await refreshSharedState({ force: true });
  renderAll();
  alert('Строка работы добавлена в общий журнал. Предыдущие записи не затёрты.');
}

function getAllReports() {
  const base = appState.storage?.isShared() ? [] : appState.data.reportsDemo;
  return [...appState.sharedReports, ...base].sort((a, b) => new Date((b.created_at || b.createdAt)) - new Date((a.created_at || a.createdAt)));
}

function renderDashboardView() {
  const wbPack = (() => { const wb = getManagerByChannel('WB'); return wb ? getPackForManager(wb[0]) : null; })();
  const ozonPack = (() => { const oz = getManagerByChannel('Ozon'); return oz ? getPackForManager(oz[0]) : null; })();
  const coordinator = getCoordinatorEntry();
  const reports = getAllReports();
  const deviations = getTopDeviations();
  const supplyRows = getTopSupplyRows();
  const dashboardCards = [
    { label: 'WB пакет сегодня', value: wbPack?.packArticles.length || 0, note: wbPack ? `Пакет ${wbPack.packNumber}/${wbPack.totalPacks}` : '—' },
    { label: 'Ozon пакет сегодня', value: ozonPack?.packArticles.length || 0, note: ozonPack ? `Пакет ${ozonPack.packNumber}/${ozonPack.totalPacks}` : '—' },
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
  if (wbPack) people.push(buildPersonCard('Анастасия', 'WB', wbPack));
  if (ozonPack) people.push(buildPersonCard('Ирина Паламарук', 'Ozon', ozonPack));
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
    { key: 'article', label: 'Артикул' },
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
    margin: formatMoney(row.marginDay)
  })));

  els.dashboardSupply.innerHTML = renderSimpleTable([
    { key: 'article', label: 'Артикул' },
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

function buildPersonCard(name, channel, packInfo) {
  const critical = packInfo.packArticles.filter((item) => item.priorityBucket === 'critical').length;
  const help = packInfo.packArticles.filter((item) => getTaskState(item).status === 'need_help').length;
  const plan = sum(packInfo.packArticles.map((item) => getRowPlanDay(item)));
  return {
    name,
    channel,
    text: `Сегодня открыт пакет ${packInfo.packNumber}/${packInfo.totalPacks}. Внутри ${packInfo.packArticles.length} артикулов. Критичных: ${critical}.`,
    stats: [`План/д: ${formatNum(plan, 1)}`, `Помощь: ${help}`]
  };
}

function renderTasksView() {
  const taskInfo = getTaskRowsForCurrentSelection();
  const statusFilter = els.taskStatusFilter.value || 'all';
  const query = (els.taskSearchInput.value || '').trim().toLowerCase();
  const rows = taskInfo.rows.filter((row) => {
    const state = getTaskState(row);
    const matchesStatus = statusFilter === 'all' || state.status === statusFilter;
    const hay = `${row.sellerArticle} ${row.name} ${row.action} ${row.reason} ${row.wbArticle || ''} ${row.ozonProductId || row.ozonArticle || ''}`.toLowerCase();
    const matchesQuery = !query || hay.includes(query);
    return matchesStatus && matchesQuery;
  });
  const statusCounts = countTaskStatuses(taskInfo.rows);
  const isLeader = appState.role === 'leader';
  const calendarData = getTaskCalendarData(taskInfo.channel);
  els.taskPackMeta.textContent = `Дата задач: ${formatDate(appState.workDate)}. В срезе ${taskInfo.rows.length} SKU. Ниже можно не только вести фиксированные задачи, но и добавить отдельную строку работы по любому артикулу из полной матрицы.`;
  els.taskManagerCard.innerHTML = `
    <div class="manager-card-grid">
      <div>
        <h3>${escapeHtml(taskInfo.managerName || '—')} · ${escapeHtml(taskInfo.channel)}</h3>
        <p>${escapeHtml(taskInfo.manager?.responsibility || '')}</p>
        <p class="help-text">Статусы на ${formatDate(appState.workDate)}: не начато — ${statusCounts.todo}, в работе — ${statusCounts.in_progress}, готово — ${statusCounts.done}, нужна помощь — ${statusCounts.need_help}.</p>
      </div>
      <div class="planner-toolbar">
        <button class="btn btn-ghost" id="taskPrevDateBtn" type="button">← Пред. раб. день</button>
        <button class="btn btn-ghost" id="taskNextDateBtn" type="button">След. раб. день →</button>
        ${isLeader ? `
          <button class="btn btn-ghost" id="taskCopyPrevBtn" type="button">Скопировать план с пред. даты</button>
          <button class="btn btn-primary" id="taskPlanDateBtn" type="button">Зафиксировать задачи на дату</button>
        ` : `<span class="planner-note">Руководитель задаёт комментарий и срок на любую дату, менеджер заполняет статус и свой комментарий. Доп. строки работы не перезаписывают старые записи.</span>`}
      </div>
    </div>
    ${renderTaskCalendar(calendarData)}
    ${renderTaskWorklogPanel(taskInfo.channel)}
  `;
  els.tasksTableWrap.innerHTML = `
    <table class="tasks-table tasks-table-wide">
      <thead>
        <tr>
          <th>Артикул / Ozon</th>
          <th>WB арт.</th>
          <th>Товар</th>
          <th>Приоритет</th>
          <th>План/д</th>
          <th>Факт/д</th>
          <th>Статус</th>
          <th>Срок</th>
          <th>Комментарий руководителя</th>
          <th>Комментарий менеджера</th>
          <th>Обновлено</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => renderTaskRow(row)).join('')}
      </tbody>
    </table>
  `;

  const prevBtn = document.getElementById('taskPrevDateBtn');
  if (prevBtn) prevBtn.addEventListener('click', async () => setWorkDateAndRefresh(shiftBusinessDate(appState.workDate, -1)));
  const nextBtn = document.getElementById('taskNextDateBtn');
  if (nextBtn) nextBtn.addEventListener('click', async () => setWorkDateAndRefresh(shiftBusinessDate(appState.workDate, 1)));
  const copyPrevBtn = document.getElementById('taskCopyPrevBtn');
  if (copyPrevBtn) copyPrevBtn.addEventListener('click', async () => planTaskRowsForDate(shiftBusinessDate(appState.workDate, -1)));
  const planBtn = document.getElementById('taskPlanDateBtn');
  if (planBtn) planBtn.addEventListener('click', async () => planTaskRowsForDate());
  document.querySelectorAll('[data-calendar-date]').forEach((btn) => {
    btn.addEventListener('click', async () => setWorkDateAndRefresh(btn.dataset.calendarDate));
  });
  bindTaskWorklogPanel(taskInfo.channel);

  els.tasksTableWrap.querySelectorAll('.save-row-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const article = taskInfo.rows.find((item) => item.sellerArticle === btn.dataset.article);
      if (!article) return;
      const tr = btn.closest('tr');
      const status = tr.querySelector('.task-status-input').value;
      const dueDate = tr.querySelector('.task-due-input')?.value || appState.workDate;
      const leaderComment = tr.querySelector('.task-leader-input')?.value?.trim() || '';
      const managerComment = tr.querySelector('.task-manager-input')?.value?.trim() || '';
      await saveTaskRow(article, { status, dueDate, leaderComment, managerComment });
      btn.textContent = 'Сохранено';
      setTimeout(() => { btn.textContent = 'Сохранить'; renderTasksView(); }, 700);
    });
  });
}

function renderTaskRow(row) {
  const state = getTaskState(row);
  const isLeader = appState.role === 'leader';
  return `
    <tr>
      <td><strong>${escapeHtml(row.sellerArticle || '—')}</strong><div class="help-text">Ozon: ${escapeHtml(String(row.ozonProductId || row.ozonArticle || '—'))}</div></td>
      <td><strong>${escapeHtml(String(row.wbArticle || '—'))}</strong></td>
      <td><strong>${escapeHtml(row.name || '—')}</strong><div class="help-text">${escapeHtml(row.category || '')}</div></td>
      <td><span class="badge ${row.priorityBucket}">${escapeHtml(row.priorityLabel || '—')}</span></td>
      <td>${formatNum(getRowPlanDay(row), 1)}</td>
      <td>${formatNum(getRowFactDay(row), 1)}</td>
      <td>
        <select class="inline-select task-status-input">
          ${['todo','in_progress','done','need_help'].map((key) => `<option value="${key}" ${state.status === key ? 'selected' : ''}>${statusLabel(key)}</option>`).join('')}
        </select>
      </td>
      <td>${isLeader
        ? `<input class="inline-input task-due-input" type="date" value="${escapeAttr(state.due_date || appState.workDate)}" />`
        : `<span class="inline-readonly">${escapeHtml(state.due_date || appState.workDate)}</span><input class="task-due-input" type="hidden" value="${escapeAttr(state.due_date || appState.workDate)}" />`}</td>
      <td>${isLeader
        ? `<input class="inline-input inline-note task-leader-input" value="${escapeAttr(state.leader_comment || row.action || '')}" placeholder="Что сделать / на что смотреть" />`
        : `<div class="inline-readonly inline-multiline">${escapeHtml(state.leader_comment || row.action || '—')}</div><input class="task-leader-input" type="hidden" value="${escapeAttr(state.leader_comment || row.action || '')}" />`}</td>
      <td>${isLeader
        ? `<div class="inline-readonly inline-multiline">${escapeHtml(state.manager_comment || state.comment || '—')}</div><input class="task-manager-input" type="hidden" value="${escapeAttr(state.manager_comment || state.comment || '')}" />`
        : `<input class="inline-input inline-note task-manager-input" value="${escapeAttr(state.manager_comment || state.comment || '')}" placeholder="Что сделано / что мешает" />`}</td>
      <td><span class="help-text">${escapeHtml(state.updated_at ? formatDateTime(state.updated_at) : '—')}</span><div class="help-text">${escapeHtml(state.updated_by || '')}</div></td>
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
  const rows = deviations.slice(0, 20);
  if (!appState.selectedChartArticle && rows[0]) appState.selectedChartArticle = rows[0].sellerArticle;
  els.chartArticleSelect.innerHTML = rows.map((row) => `<option value="${escapeAttr(row.sellerArticle)}" ${row.sellerArticle === appState.selectedChartArticle ? 'selected' : ''}>${escapeHtml(row.channel)} · ${escapeHtml(row.sellerArticle)} · WB ${escapeHtml(String(row.wbArticle || '—'))}</option>`).join('');
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
  const wbMap = new Map((wbEntry[1].articles || []).map((item) => [item.sellerArticle, item]));
  const rows = [];

  (ozEntry[1].articles || []).forEach((ozItem) => {
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
      note = wbGap > 0
        ? 'WB сейчас дает выше чистую прибыль и ещё не добирает план.'
        : 'WB сейчас прибыльнее по чистой прибыли, даже если темп уже близок к плану.';
    } else if (ozonPnlFact > wbPnlFact * 1.07) {
      decisionKey = 'ozon';
      decision = 'Фокус на Ozon';
      note = ozGap > 0
        ? 'Ozon сейчас дает выше чистую прибыль и ещё не добирает план.'
        : 'Ozon сейчас прибыльнее по чистой прибыли, даже если темп уже близок к плану.';
    } else if (wbMarginFact > ozonMarginFact) {
      decisionKey = 'wb';
      decision = 'WB чуть сильнее';
      note = 'По чистой прибыли площадки рядом, но у WB выше маржинальный эффект по факту.';
    } else if (ozonMarginFact > wbMarginFact) {
      decisionKey = 'ozon';
      decision = 'Ozon чуть сильнее';
      note = 'По чистой прибыли площадки рядом, но у Ozon выше маржинальный эффект по факту.';
    }

    rows.push({
      sellerArticle: ozItem.sellerArticle,
      wbArticle: wbItem.wbArticle || '',
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
  const comments = [...(appState.taskComments || [])].sort((a, b) => new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0));
  const worklogs = comments.filter((item) => item.comment_type === 'manager_worklog');
  const managerComments = comments.filter((item) => item.comment_type !== 'manager_worklog');
  const history = [...(appState.entityHistory || [])].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  const taskInfo = getTaskRowsForCurrentSelection();
  const statusCounts = countTaskStatuses(taskInfo.rows);
  const totalTasks = taskInfo.rows.length;
  const dateChannels = appState.platform === 'All' ? ['WB', 'Ozon'] : [taskInfo.channel];
  const dateProgressRows = dateChannels.flatMap((channel) => getTaskCalendarData(channel).map((day) => ({
    date: day.date,
    channel,
    pack: `${day.packNumber}/${day.totalPacks}`,
    total: day.total,
    done: day.done,
    progress: `${day.progressPct}%`,
    state: day.stateLabel
  })));
  const progressPct = totalTasks ? Math.round((statusCounts.done / totalTasks) * 100) : 0;
  const summary = [
    { label: 'Дата среза', value: formatDate(appState.workDate) },
    { label: 'Задач на дату', value: totalTasks },
    { label: 'Готово', value: statusCounts.done },
    { label: 'В работе', value: statusCounts.in_progress },
    { label: 'Нужна помощь', value: statusCounts.need_help },
    { label: 'Прогресс', value: `${progressPct}%` },
    { label: 'Рабочих записей за дату', value: worklogs.length },
    { label: 'Комментариев за дату', value: managerComments.length },
    { label: 'Изменений за дату', value: history.length },
    { label: 'Режим хранения', value: appState.storage.getDescriptor().label },
    { label: 'Общий журнал', value: shared ? 'Да' : 'Нет' },
    { label: 'Последняя синхронизация', value: appState.lastSharedRefreshAt ? formatTimeOnly(appState.lastSharedRefreshAt) : '—' },
    { label: 'Что делать дальше', value: shared ? 'Открыть другую дату сверху и проверить историю' : 'Подключить shared backend' }
  ];
  els.reportSummary.innerHTML = summary.map((item) => `
    <div class="summary-tile">
      <span>${item.label}</span>
      <strong>${item.value}</strong>
    </div>
  `).join('');

  const dateProgressTable = renderSimpleTable([
    { key: 'date', label: 'Дата' },
    { key: 'channel', label: 'Контур' },
    { key: 'pack', label: 'Пакет' },
    { key: 'total', label: 'SKU' },
    { key: 'done', label: 'Готово' },
    { key: 'progress', label: 'Прогресс' },
    { key: 'state', label: 'Состояние' }
  ], dateProgressRows.map((item) => ({
    date: formatDate(item.date),
    channel: item.channel,
    pack: item.pack,
    total: item.total,
    done: item.done,
    progress: item.progress,
    state: item.state
  })));

  const reportTable = renderSimpleTable([
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

  const worklogTable = renderSimpleTable([
    { key: 'time', label: 'Когда' },
    { key: 'who', label: 'Кто' },
    { key: 'article', label: 'Артикул' },
    { key: 'type', label: 'Тип работы' },
    { key: 'status', label: 'Статус' },
    { key: 'body', label: 'Что сделали' }
  ], worklogs.slice(0, 200).map((item) => ({
    time: formatDateTime(item.created_at || item.createdAt),
    who: `<strong>${escapeHtml(item.author_name || '—')}</strong><span class="muted">${escapeHtml(item.platform || '')}</span>`,
    article: `<strong>${escapeHtml(item.wb_article || item.wbArticle || '—')}</strong><span class="muted">${escapeHtml(item.seller_article || item.sellerArticle || '')}</span>`,
    type: escapeHtml(workTypeLabel(item.meta?.workType || item.meta?.work_type || 'other')),
    status: `<span class="badge ${normalizeStatus(item.meta?.status || 'saved')}">${statusLabel(item.meta?.status || 'saved')}</span>`,
    body: escapeHtml(item.body || '')
  })));

  const commentsTable = renderSimpleTable([
    { key: 'time', label: 'Когда' },
    { key: 'who', label: 'Кто' },
    { key: 'article', label: 'Артикул' },
    { key: 'type', label: 'Тип' },
    { key: 'body', label: 'Комментарий' }
  ], managerComments.slice(0, 200).map((item) => ({
    time: formatDateTime(item.created_at || item.createdAt),
    who: `<strong>${escapeHtml(item.author_name || '—')}</strong><span class="muted">${escapeHtml(item.platform || '')}</span>`,
    article: `<strong>${escapeHtml(item.wb_article || item.wbArticle || '—')}</strong><span class="muted">${escapeHtml(item.seller_article || item.sellerArticle || '')}</span>`,
    type: escapeHtml(commentTypeLabel(item.comment_type || 'comment')),
    body: escapeHtml(item.body || '')
  })));

  const historyTable = renderSimpleTable([
    { key: 'time', label: 'Когда' },
    { key: 'entity', label: 'Сущность' },
    { key: 'article', label: 'Артикул' },
    { key: 'actor', label: 'Кто изменил' },
    { key: 'event', label: 'Событие' },
    { key: 'fields', label: 'Что поменялось' },
    { key: 'note', label: 'Комментарий' }
  ], history.slice(0, 200).map((item) => ({
    time: formatDateTime(item.created_at),
    entity: escapeHtml(item.entity_type || '—'),
    article: `<strong>${escapeHtml(item.wb_article || '—')}</strong><span class="muted">${escapeHtml(item.seller_article || '')}</span>`,
    actor: `<strong>${escapeHtml(item.actor_name || '—')}</strong><span class="muted">${escapeHtml(item.actor_role || '')}</span>`,
    event: escapeHtml(item.event_type || '—'),
    fields: escapeHtml(Array.isArray(item.changed_fields) ? item.changed_fields.join(', ') : ''),
    note: escapeHtml(item.note || '')
  })));

  els.reportsTable.innerHTML = `
    <section class="report-section">
      <h3>Выполнение по датам</h3>
      <div class="simple-table-wrap">${dateProgressTable}</div>
    </section>
    <section class="report-section" style="margin-top:16px;">
      <h3>Журнал сохранений</h3>
      <div class="simple-table-wrap">${reportTable}</div>
    </section>
    <section class="report-section" style="margin-top:16px;">
      <h3>Журнал действий менеджеров</h3>
      <div class="simple-table-wrap">${worklogTable}</div>
    </section>
    <section class="report-section" style="margin-top:16px;">
      <h3>Комментарии менеджеров</h3>
      <div class="simple-table-wrap">${commentsTable}</div>
    </section>
    <section class="report-section" style="margin-top:16px;">
      <h3>История изменений</h3>
      <div class="simple-table-wrap">${historyTable}</div>
    </section>
  `;
}

function exportReportsJson() {
  const blob = new Blob([JSON.stringify(getAllReports(), null, 2)], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tekstilno_portal_reports_v32.json';
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

function formatNum(value, digits = 0) {
  const number = Number(value || 0);
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
