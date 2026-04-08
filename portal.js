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
  localTaskState: {},
  localReports: [],
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
    title: 'Обзор',
    subtitle: 'Сводка дня по людям, красной зоне, поставкам и видимости отчетности.'
  },
  tasks: {
    title: 'Задачи',
    subtitle: 'Фиксированный пакет из 20 артикулов на день. Менеджеру остаются только статус и комментарий.'
  },
  supply: {
    title: 'Поставки',
    subtitle: 'Кластерная потребность и путь в полную матрицу, без перегруза на первом экране.'
  },
  control: {
    title: 'Контроль продаж',
    subtitle: 'План, факт, маржа и решение, куда выгоднее направить ограниченный остаток.'
  },
  reports: {
    title: 'Отчеты',
    subtitle: 'Ключевой экран для проверки: кто, что, когда и по какому контуру сохранил.'
  }
};

const STORAGE_KEYS = {
  taskState: 'tekstilno_portal_v22_task_state',
  reports: 'tekstilno_portal_v22_reports',
  prefs: 'tekstilno_portal_v22_prefs'
};

const els = {};

document.addEventListener('DOMContentLoaded', initPortal);

async function initPortal() {
  cacheElements();
  hydrateLocalState();
  bindEvents();
  await loadData();
  applyRolePreset(appState.role, false);
  renderAll();
}

function cacheElements() {
  const ids = [
    'roleSelect','mainNav','storageModeLabel','currentDateLabel','pageTitle','pageSubtitle','workDateInput','platformToggle','syncBanner',
    'dashboardCards','peopleFocus','activityFeed','dashboardDeviations','dashboardSupply',
    'taskPackMeta','taskManagerCard','tasksTableWrap','taskStatusFilter','taskSearchInput','saveDailySummaryBtn',
    'supplyCards','supplyDeficitsTable','clusterNeedTable',
    'chartArticleSelect','metricToggle','chartMeta','lineChart','marginCompareTable','controlDeviationTable',
    'reportSummary','reportsTable','exportReportsBtn','importReportsInput'
  ];
  ids.forEach((id) => { els[id] = document.getElementById(id); });
  els.views = Object.fromEntries([...document.querySelectorAll('.view')].map((node) => [node.id.replace('view-', ''), node]));
}

function hydrateLocalState() {
  try {
    appState.localTaskState = JSON.parse(localStorage.getItem(STORAGE_KEYS.taskState) || '{}');
  } catch { appState.localTaskState = {}; }
  try {
    appState.localReports = JSON.parse(localStorage.getItem(STORAGE_KEYS.reports) || '[]');
  } catch { appState.localReports = []; }
  try {
    const prefs = JSON.parse(localStorage.getItem(STORAGE_KEYS.prefs) || '{}');
    if (prefs.role && ROLE_PRESETS[prefs.role]) appState.role = prefs.role;
    if (prefs.platform) appState.platform = prefs.platform;
    if (prefs.view && VIEW_META[prefs.view]) appState.view = prefs.view;
    if (prefs.workDate) appState.workDate = prefs.workDate;
    if (prefs.metric) appState.metric = prefs.metric;
  } catch {}
}

function persistPrefs() {
  localStorage.setItem(STORAGE_KEYS.prefs, JSON.stringify({
    role: appState.role,
    platform: appState.platform,
    view: appState.view,
    workDate: appState.workDate,
    metric: appState.metric
  }));
}

function persistTaskState() {
  localStorage.setItem(STORAGE_KEYS.taskState, JSON.stringify(appState.localTaskState));
}

function persistReports() {
  localStorage.setItem(STORAGE_KEYS.reports, JSON.stringify(appState.localReports));
}

function bindEvents() {
  els.roleSelect.addEventListener('change', (e) => applyRolePreset(e.target.value));
  els.mainNav.addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-link');
    if (!btn) return;
    appState.view = btn.dataset.view;
    persistPrefs();
    renderViewState();
    renderCurrentView();
  });
  els.workDateInput.addEventListener('change', (e) => {
    appState.workDate = e.target.value;
    persistPrefs();
    renderAll();
  });
  els.platformToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    appState.platform = btn.dataset.platform;
    persistPrefs();
    renderAll();
  });
  els.metricToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    appState.metric = btn.dataset.metric;
    persistPrefs();
    renderControlView();
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
}

async function fetchJson(url) {
  const version = appState.config?.siteVersion ? `?v=${encodeURIComponent(appState.config.siteVersion)}` : '';
  const res = await fetch(`${url}${version}`);
  if (!res.ok) throw new Error(`Не загрузился ${url}`);
  return res.json();
}

function applyRolePreset(role, rerender = true) {
  appState.role = role;
  const preset = ROLE_PRESETS[role] || ROLE_PRESETS.leader;
  if (role === 'manager_wb' || role === 'manager_ozon') {
    appState.platform = preset.defaultPlatform;
  }
  appState.view = preset.defaultView;
  els.roleSelect.value = role;
  persistPrefs();
  if (rerender) renderAll();
}

function renderAll() {
  els.workDateInput.value = appState.workDate;
  els.storageModeLabel.textContent = appState.config.storageMode === 'demo-local' ? 'demo-local' : (appState.config.storageMode || 'local');
  els.currentDateLabel.textContent = formatDate(appState.workDate);
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
  [...els.platformToggle.querySelectorAll('.seg-btn')].forEach((node) => node.classList.toggle('active', node.dataset.platform === appState.platform));
}

function renderPageMeta() {
  const meta = VIEW_META[appState.view];
  const roleLabel = ROLE_PRESETS[appState.role]?.label || 'Режим';
  els.pageTitle.textContent = `${meta.title}`;
  els.pageSubtitle.textContent = `${meta.subtitle} Сейчас смотришь как: ${roleLabel}.`;
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

function getPackForManager(managerName) {
  const manager = getManagers()[managerName];
  if (!manager || !Array.isArray(manager.articles)) return { managerName, manager, packArticles: [], packNumber: 1, totalPacks: 1 };
  const packSize = Number(manager.packSize || appState.data.plan.packSizeDefault || 20);
  const totalPacks = Math.max(1, Math.ceil(manager.articles.length / packSize));
  const offset = getBusinessDayOffset(appState.data.plan.cycleAnchorDate, appState.workDate);
  const packNumber = ((offset % totalPacks) + totalPacks) % totalPacks + 1;
  const packArticles = manager.articles.filter((article) => Number(article.packNumber || 1) === packNumber);
  return { managerName, manager, packArticles, packNumber, totalPacks };
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
  return appState.localTaskState[getTaskStorageKey(article)] || { status: 'todo', comment: '' };
}

function saveTaskRow(article, status, comment) {
  appState.localTaskState[getTaskStorageKey(article)] = { status, comment };
  persistTaskState();
  upsertLocalReport({
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    author: article.channel === 'WB' ? 'Анастасия' : 'Ирина Паламарук',
    role: article.channel === 'WB' ? 'manager_wb' : 'manager_ozon',
    platform: article.channel,
    contour: 'tasks',
    title: `${article.channel} · ${article.sellerArticle}`,
    status,
    storage: 'browser-local',
    itemsCount: 1,
    note: comment || 'Изменен статус по артикулу',
    route: `${article.channel} задачи`
  }, { replaceBy: ['author', 'platform', 'title'] });
  renderReportsView();
}

function upsertLocalReport(entry, options = {}) {
  let list = [...appState.localReports];
  if (options.replaceBy) {
    const idx = list.findIndex((item) => options.replaceBy.every((key) => item[key] === entry[key]));
    if (idx >= 0) list[idx] = entry;
    else list.unshift(entry);
  } else {
    list.unshift(entry);
  }
  appState.localReports = list.slice(0, 200);
  persistReports();
}

function saveDailySummary() {
  const taskInfo = getTaskRowsForCurrentSelection();
  const statusCounts = countTaskStatuses(taskInfo.rows);
  const author = taskInfo.channel === 'WB' ? 'Анастасия' : 'Ирина Паламарук';
  upsertLocalReport({
    id: `summary-${Date.now()}`,
    createdAt: new Date().toISOString(),
    author,
    role: taskInfo.channel === 'WB' ? 'manager_wb' : 'manager_ozon',
    platform: taskInfo.channel,
    contour: 'tasks',
    title: `${taskInfo.channel} · дневной срез`,
    status: 'saved',
    storage: 'browser-local',
    itemsCount: taskInfo.rows.length,
    note: `Пакет ${taskInfo.packNumber}/${taskInfo.totalPacks}. Готово: ${statusCounts.done}, в работе: ${statusCounts.in_progress}, нужна помощь: ${statusCounts.need_help}.`,
    route: `${taskInfo.channel} задачи`
  }, { replaceBy: ['author', 'platform', 'title'] });
  renderReportsView();
  alert('Срез дня сохранен в журнал review-версии.');
}

function countTaskStatuses(rows) {
  return rows.reduce((acc, row) => {
    const state = getTaskState(row);
    acc[state.status] = (acc[state.status] || 0) + 1;
    return acc;
  }, { todo: 0, in_progress: 0, done: 0, need_help: 0 });
}

function getAllReports() {
  return [...appState.localReports, ...appState.data.reportsDemo].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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
      <p><strong>${escapeHtml(item.author)}</strong> · ${escapeHtml(item.route)} · ${formatDateTime(item.createdAt)}</p>
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
    article: `<strong>${escapeHtml(row.sellerArticle)}</strong><span class="muted">${escapeHtml(row.name)}</span>`,
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
    article: `<strong>${escapeHtml(row.sellerArticle)}</strong><span class="muted">${escapeHtml(row.name)}</span>`,
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
    const hay = `${row.sellerArticle} ${row.name} ${row.action} ${row.reason}`.toLowerCase();
    const matchesQuery = !query || hay.includes(query);
    return matchesStatus && matchesQuery;
  });
  const statusCounts = countTaskStatuses(taskInfo.rows);
  els.taskPackMeta.textContent = `Зафиксирован пакет ${taskInfo.packNumber}/${taskInfo.totalPacks} на ${formatDate(appState.workDate)}. Всего в пакете: ${taskInfo.rows.length}.`;
  els.taskManagerCard.innerHTML = `
    <h3>${escapeHtml(taskInfo.managerName || '—')} · ${escapeHtml(taskInfo.channel)}</h3>
    <p>${escapeHtml(taskInfo.manager?.responsibility || '')}</p>
    <p class="help-text">Статусы: не начато — ${statusCounts.todo}, в работе — ${statusCounts.in_progress}, готово — ${statusCounts.done}, нужна помощь — ${statusCounts.need_help}.</p>
  `;
  els.tasksTableWrap.innerHTML = `
    <table class="tasks-table">
      <thead>
        <tr>
          <th>Артикул</th>
          <th>Товар</th>
          <th>Приоритет</th>
          <th>План/д</th>
          <th>Факт/д</th>
          <th>Маржа/д</th>
          <th>Что сделать</th>
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
    btn.addEventListener('click', () => {
      const article = taskInfo.rows.find((item) => item.sellerArticle === btn.dataset.article);
      if (!article) return;
      const tr = btn.closest('tr');
      const status = tr.querySelector('.task-status-input').value;
      const comment = tr.querySelector('.task-comment-input').value.trim();
      saveTaskRow(article, status, comment);
      btn.textContent = 'Сохранено';
      setTimeout(() => { btn.textContent = 'Сохранить'; renderTasksView(); }, 700);
    });
  });
}

function renderTaskRow(row) {
  const state = getTaskState(row);
  return `
    <tr>
      <td><strong>${escapeHtml(row.sellerArticle)}</strong><div class="help-text">${escapeHtml(row.platformArticleLabel || row.channel + ' артикул')}: ${escapeHtml(String(row.platformArticle || '—'))}</div></td>
      <td><strong>${escapeHtml(row.name || '—')}</strong><div class="help-text">${escapeHtml(row.category || '')}</div></td>
      <td><span class="badge ${row.priorityBucket}">${escapeHtml(row.priorityLabel || '—')}</span></td>
      <td>${formatNum(getRowPlanDay(row), 1)}</td>
      <td>${formatNum(getRowFactDay(row), 1)}</td>
      <td>${formatMoney(getRowPlanMarginDay(row))}</td>
      <td><strong>${escapeHtml((row.action || '').split('. ')[0] || '—')}</strong><div class="help-text">${escapeHtml(row.reason || '')}</div></td>
      <td>
        <select class="inline-select task-status-input">
          ${['todo','in_progress','done','need_help'].map((key) => `<option value="${key}" ${state.status === key ? 'selected' : ''}>${statusLabel(key)}</option>`).join('')}
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
  cards.push({ label: 'Топ дефицитов', value: supplyRows.length, note: 'Артикулы с потребностью > 0' });
  cards.push({ label: 'Реком. к заказу', value: formatNum(sum(supplyRows.map((row) => row.totalNeed))), note: 'Суммарно по выбранным площадкам', highlight: true });
  cards.push({ label: 'Кластеры в фокусе', value: clusterAgg.length, note: 'Есть потребность или риск' });
  cards.push({ label: 'Матрица Нины', value: 'Full', note: 'Глубокий экран остается отдельным маршрутом' });
  els.supplyCards.innerHTML = cards.map((card) => `
    <article class="kpi-card ${card.highlight ? 'highlight' : ''}">
      <span>${card.label}</span>
      <strong>${card.value}</strong>
      <small>${card.note}</small>
    </article>
  `).join('');

  els.supplyDeficitsTable.innerHTML = renderSimpleTable([
    { key: 'article', label: 'Артикул' },
    { key: 'platform', label: 'Площадка' },
    { key: 'need', label: 'Нужно' },
    { key: 'main', label: 'Осн. склад' },
    { key: 'cluster', label: 'Кластер' },
    { key: 'action', label: 'Действие' }
  ], supplyRows.slice(0, 12).map((row) => ({
    article: `<strong>${escapeHtml(row.sellerArticle)}</strong><span class="muted">${escapeHtml(row.name)}</span>`,
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
  populateChartSelector(deviations);
  const selected = deviations.find((row) => row.sellerArticle === appState.selectedChartArticle) || deviations[0] || null;
  if (selected) appState.selectedChartArticle = selected.sellerArticle;
  els.chartMeta.textContent = selected ? `${selected.channel} · ${selected.sellerArticle} · план/д ${formatNum(selected.planDay,1)} · факт/д ${formatNum(selected.factDay,1)} · Δ ${formatPct(selected.deltaPct)}` : 'Нет данных для графика';
  els.lineChart.innerHTML = selected ? buildLineChart(selected) : '<div class="muted">Нет данных</div>';
  els.controlDeviationTable.innerHTML = renderSimpleTable([
    { key: 'article', label: 'Артикул' },
    { key: 'platform', label: 'Площадка' },
    { key: 'plan', label: 'План/д' },
    { key: 'fact', label: 'Факт/д' },
    { key: 'delta', label: 'Δ' },
    { key: 'revenue', label: 'Выручка/д' },
    { key: 'margin', label: 'Маржа/д' }
  ], deviations.slice(0, 12).map((row) => ({
    article: `<strong>${escapeHtml(row.sellerArticle)}</strong><span class="muted">${escapeHtml(row.name)}</span>`,
    platform: row.channel,
    plan: formatNum(row.planDay, 1),
    fact: formatNum(row.factDay, 1),
    delta: `<span class="${row.deltaPct < 0 ? 'negative' : 'positive'}">${formatPct(row.deltaPct)}</span>`,
    revenue: formatMoney(row.revenueDay),
    margin: formatMoney(row.marginDay)
  })));
  els.marginCompareTable.innerHTML = renderSimpleTable([
    { key: 'article', label: 'Артикул' },
    { key: 'wb', label: 'WB' },
    { key: 'ozon', label: 'Ozon' },
    { key: 'margin', label: 'Маржа/д' },
    { key: 'decision', label: 'Куда смотреть' }
  ], compareRows.slice(0, 10).map((row) => ({
    article: `<strong>${escapeHtml(row.sellerArticle)}</strong><span class="muted">${escapeHtml(row.name)}</span>`,
    wb: `Факт ${formatNum(row.wbFact,1)} / План ${formatNum(row.wbPlan,1)}`,
    ozon: `Факт ${formatNum(row.ozonFact,1)} / План ${formatNum(row.ozonPlan,1)}`,
    margin: `WB ${formatMoney(row.wbMargin)} · Ozon ${formatMoney(row.ozonMargin)}`,
    decision: `<strong>${escapeHtml(row.decision)}</strong><span class="muted">${escapeHtml(row.note)}</span>`
  })));
}

function populateChartSelector(deviations) {
  const rows = deviations.slice(0, 20);
  if (!appState.selectedChartArticle && rows[0]) appState.selectedChartArticle = rows[0].sellerArticle;
  els.chartArticleSelect.innerHTML = rows.map((row) => `<option value="${escapeAttr(row.sellerArticle)}" ${row.sellerArticle === appState.selectedChartArticle ? 'selected' : ''}>${escapeHtml(row.channel)} · ${escapeHtml(row.sellerArticle)}</option>`).join('');
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
        name: article.name,
        channel: platform,
        planDay,
        factDay,
        deltaPct,
        marginDay: getRowPlanMarginDay(article),
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
  const monthKey = getMonthKey();
  const wbMap = new Map((wbEntry[1].articles || []).map((item) => [item.sellerArticle, item]));
  const rows = [];
  (ozEntry[1].articles || []).forEach((ozItem) => {
    const wbItem = wbMap.get(ozItem.sellerArticle);
    if (!wbItem) return;
    const wbMargin = Number(wbItem.monthlyPlan?.[monthKey]?.planMarginIncomeDay || 0);
    const ozMargin = Number(ozItem.monthlyPlan?.[monthKey]?.planMarginIncomeDay || 0);
    const wbPlan = getRowPlanDay(wbItem);
    const ozonPlan = getRowPlanDay(ozItem);
    const wbFact = getRowFactDay(wbItem);
    const ozonFact = getRowFactDay(ozItem);
    const wbScore = wbMargin * (wbPlan ? Math.min(1.5, wbFact / wbPlan) : 1);
    const ozScore = ozMargin * (ozonPlan ? Math.min(1.5, ozonFact / ozonPlan) : 1);
    const decision = wbScore > ozScore ? 'Фокус на WB' : 'Фокус на Ozon';
    const note = wbScore > ozScore
      ? 'WB сейчас дает лучшую ожидаемую маржу с учетом темпа.'
      : 'Ozon сейчас выглядит выгоднее по марже и текущему темпу.';
    rows.push({
      sellerArticle: ozItem.sellerArticle,
      name: ozItem.name || wbItem.name || '—',
      wbMargin, ozonMargin: ozMargin,
      wbPlan, ozonPlan, wbFact, ozonFact,
      decision, note,
      scoreDiff: Math.abs(wbScore - ozScore)
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
  const planLevel = appState.metric === 'orders' ? row.planDay : getRowPlanRevenue(findArticle(row.channel, row.sellerArticle));
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
  const localCount = appState.localReports.length;
  const summary = [
    { label: 'Всего записей', value: reports.length },
    { label: 'Локально сохранено', value: localCount },
    { label: 'Demo shared', value: reports.filter((item) => item.storage === 'demo-shared').length },
    { label: 'Нужна централиз. синхронизация', value: localCount > 0 ? 'Да' : 'Подготовлено' }
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
    time: formatDateTime(item.createdAt),
    author: `<strong>${escapeHtml(item.author)}</strong><span class="muted">${escapeHtml(item.platform || '')}</span>`,
    route: escapeHtml(item.route || item.contour || '—'),
    status: `<span class="badge ${normalizeStatus(item.status)}">${statusLabel(item.status)}</span>`,
    storage: escapeHtml(item.storage || '—'),
    note: escapeHtml(item.note || '')
  })));
}

function exportReportsJson() {
  const blob = new Blob([JSON.stringify(appState.localReports, null, 2)], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tekstilno_portal_local_reports_v22.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function importReportsJson(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const rows = JSON.parse(reader.result);
      if (!Array.isArray(rows)) throw new Error('Ожидался массив');
      appState.localReports = rows;
      persistReports();
      renderReportsView();
      alert('Локальные записи импортированы.');
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
