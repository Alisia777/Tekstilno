const state = {
  dashboard: null,
  skus: [],
  launches: [],
  meetings: [],
  documents: null,
  repricer: null,
  storage: { comments: [], tasks: [], decisions: [], ownerOverrides: [] },
  filters: {
    search: '',
    segment: 'all',
    focus: 'all',
    market: 'all',
    owner: 'all',
    traffic: 'all',
    assignment: 'all'
  },
  controlFilters: {
    search: '',
    owner: 'all',
    status: 'active',
    type: 'all',
    platform: 'all',
    horizon: 'all',
    source: 'all'
  },
  docFilters: {
    search: '',
    group: 'all'
  },
  repricerFilters: {
    search: '',
    platform: 'all',
    mode: 'changes'
  },
  orderCalc: {
    articleKey: '',
    scope: 'all',
    salesSource: 'hybrid',
    manualDailySales: '',
    daysToNextReceipt: '',
    targetCoverAfter: '30',
    safetyDays: '7',
    inboundManual: '',
    packSize: '1',
    moq: '0'
  },
  activeView: 'dashboard',
  activeSku: null,
  team: {
    mode: 'local',
    ready: false,
    error: '',
    note: 'Локальный режим',
    member: { name: '', role: 'Команда' },
    lastSyncAt: '',
    userId: ''
  }
};

const STORAGE_KEY = 'brand-portal-local-v1';
const ACTIVE_TASK_STATUSES = new Set(['new', 'in_progress', 'waiting_team', 'waiting_decision']);

const TASK_STATUS_META = {
  new: { label: 'Новая', kind: 'warn' },
  in_progress: { label: 'В работе', kind: 'info' },
  waiting_team: { label: 'Ждёт другого отдела', kind: 'warn' },
  waiting_decision: { label: 'Ждёт решения', kind: 'danger' },
  done: { label: 'Сделано', kind: 'ok' },
  cancelled: { label: 'Отменено', kind: '' }
};

const TASK_TYPE_META = {
  price_margin: 'Цена / маржа',
  content: 'Контент / карточка',
  traffic: 'Трафик / продвижение',
  supply: 'Остатки / поставка',
  returns: 'Отзывы / возвраты',
  assignment: 'Закрепление',
  launch: 'Новинка',
  general: 'Общее'
};

const PRIORITY_META = {
  critical: { label: 'Критично', kind: 'danger', rank: 4 },
  high: { label: 'Высокий', kind: 'warn', rank: 3 },
  medium: { label: 'Средний', kind: 'info', rank: 2 },
  low: { label: 'Низкий', kind: '', rank: 1 }
};

const DEFAULT_APP_CONFIG = {
  brand: 'Алтея',
  teamMode: 'local',
  teamMember: { name: '', role: 'Команда' },
  supabase: { url: '', anonKey: '', auth: 'anonymous' }
};

const TEAM_TABLES = {
  tasks: 'portal_tasks',
  comments: 'portal_comments',
  decisions: 'portal_decisions',
  owners: 'portal_owner_assignments'
};

const fmt = {
  int(value) {
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(value));
  },
  money(value) {
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(value));
  },
  pct(value) {
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
    return `${(Number(value) * 100).toFixed(1)}%`;
  },
  num(value, digits = 1) {
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(Number(value));
  },
  date(value) {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return String(value);
    }
  }
};

function currentConfig() {
  return {
    ...DEFAULT_APP_CONFIG,
    ...(window.APP_CONFIG || {}),
    teamMember: { ...DEFAULT_APP_CONFIG.teamMember, ...((window.APP_CONFIG || {}).teamMember || {}) },
    supabase: { ...DEFAULT_APP_CONFIG.supabase, ...((window.APP_CONFIG || {}).supabase || {}) }
  };
}

function currentBrand() {
  return currentConfig().brand || 'Алтея';
}

function defaultStorage() {
  return { comments: [], tasks: [], decisions: [], ownerOverrides: [] };
}

function hashString(value) {
  const str = String(value || '');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function stableId(prefix, raw) {
  return `${prefix}-${hashString(raw)}`;
}

function normalizeComment(item = {}) {
  return {
    id: item.id || stableId('comment', `${item.articleKey || ''}|${item.author || ''}|${item.createdAt || ''}|${item.text || ''}`),
    articleKey: item.articleKey || '',
    author: String(item.author || 'Команда').trim() || 'Команда',
    team: String(item.team || 'Команда').trim() || 'Команда',
    createdAt: item.createdAt || new Date().toISOString(),
    text: String(item.text || '').trim(),
    type: String(item.type || 'signal')
  };
}

function normalizeDecision(item = {}) {
  return {
    id: item.id || stableId('decision', `${item.articleKey || ''}|${item.title || ''}|${item.createdAt || ''}|${item.decision || ''}`),
    articleKey: item.articleKey || '',
    title: String(item.title || 'Решение').trim() || 'Решение',
    decision: String(item.decision || '').trim(),
    owner: String(item.owner || '').trim(),
    status: mapTaskStatus(item.status || 'waiting_decision'),
    due: item.due || '',
    createdAt: item.createdAt || new Date().toISOString(),
    createdBy: String(item.createdBy || state.team.member.name || 'Команда').trim() || 'Команда'
  };
}

function normalizeOwnerOverride(item = {}) {
  return {
    articleKey: item.articleKey || '',
    ownerName: String(item.ownerName || item.owner || '').trim(),
    ownerRole: String(item.ownerRole || '').trim(),
    note: String(item.note || '').trim(),
    updatedAt: item.updatedAt || new Date().toISOString(),
    assignedBy: String(item.assignedBy || state.team.member.name || 'Команда').trim() || 'Команда'
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function badge(text, kind = '') {
  return `<span class="chip ${kind}">${escapeHtml(text)}</span>`;
}

function scoreChip(score) {
  if (score >= 5) return badge(`Фокус ${score}`, 'danger');
  if (score >= 4) return badge(`Фокус ${score}`, 'warn');
  if (score >= 2) return badge(`Наблюдать ${score}`, 'info');
  return badge(`База ${score || 0}`);
}

function linkToSku(articleKey, label) {
  return `<button class="link-btn sku-pill" data-open-sku="${escapeHtml(articleKey)}">${escapeHtml(label || articleKey)}</button>`;
}

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Не удалось загрузить ${path}`);
  return response.json();
}

function uid(prefix = 'item') {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function plusDays(days) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function loadLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultStorage();
    const parsed = JSON.parse(raw);
    return {
      comments: Array.isArray(parsed.comments) ? parsed.comments.map(normalizeComment) : [],
      tasks: Array.isArray(parsed.tasks) ? normalizeStorageTasks(parsed.tasks, 'manual') : [],
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions.map(normalizeDecision) : [],
      ownerOverrides: Array.isArray(parsed.ownerOverrides) ? parsed.ownerOverrides.map(normalizeOwnerOverride) : []
    };
  } catch {
    return defaultStorage();
  }
}

function saveLocalStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.storage));
}

function teamMemberLabel() {
  const member = state.team.member || {};
  if (!member.name) return member.role || 'Команда';
  return `${member.name}${member.role ? ` · ${member.role}` : ''}`;
}

function prepareSkuBaseState() {
  for (const sku of state.skus) {
    if (!sku.__baseOwner) sku.__baseOwner = JSON.parse(JSON.stringify(sku.owner || {}));
  }
}

function applyOwnerOverridesToSkus() {
  prepareSkuBaseState();
  const overrideMap = new Map((state.storage.ownerOverrides || []).map((item) => [item.articleKey, item]));
  for (const sku of state.skus) {
    const baseOwner = JSON.parse(JSON.stringify(sku.__baseOwner || {}));
    const override = overrideMap.get(sku.articleKey);
    if (override) {
      sku.owner = {
        ...baseOwner,
        name: override.ownerName || '',
        source: override.ownerName ? 'Командное закрепление' : (baseOwner.source || ''),
        registryStatus: override.ownerRole || baseOwner.registryStatus || ''
      };
      sku.flags = sku.flags || {};
      sku.flags.assigned = Boolean(override.ownerName);
    } else {
      sku.owner = baseOwner;
      sku.flags = sku.flags || {};
      sku.flags.assigned = Boolean(baseOwner?.name);
    }
  }
}

function getSku(articleKey) {
  return state.skus.find((sku) => sku.articleKey === articleKey || sku.article === articleKey) || null;
}

function ownerName(sku) {
  return sku?.owner?.name || '';
}

function ownerOptions() {
  const pool = new Set();
  for (const sku of state.skus) if (ownerName(sku)) pool.add(ownerName(sku));
  for (const item of state.storage.ownerOverrides || []) if (item.ownerName) pool.add(item.ownerName);
  for (const task of state.storage.tasks || []) if (task.owner) pool.add(task.owner);
  if (state.team.member?.name) pool.add(state.team.member.name);
  return [...pool].sort((a, b) => a.localeCompare(b, 'ru'));
}

function ownerCell(sku) {
  const owner = ownerName(sku);
  if (!owner) return `<div class="owner-cell"><strong>Не закреплён</strong><div class="muted small">Нужно назначить owner</div></div>`;
  return `<div class="owner-cell"><strong>${escapeHtml(owner)}</strong><div class="muted small">${escapeHtml(sku?.owner?.registryStatus || sku?.status || '—')}</div></div>`;
}

function trafficBadges(sku, emptyLabel = 'нет') {
  const chips = [];
  if (sku?.traffic?.kz) chips.push('<span class="chip info">🚀 КЗ</span>');
  if (sku?.traffic?.vk) chips.push('<span class="chip info">📣 VK</span>');
  return chips.length ? `<div class="badge-stack traffic-inline">${chips.join('')}</div>` : `<span class="muted small">${escapeHtml(emptyLabel)}</span>`;
}

function getSkuComments(articleKey) {
  return (state.storage.comments || [])
    .filter((comment) => comment.articleKey === articleKey)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function getSkuDecisions(articleKey) {
  return (state.storage.decisions || [])
    .filter((decision) => decision.articleKey === articleKey)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function mergeSeedStorage(seed) {
  const existingComments = new Set((state.storage.comments || []).map((item) => `${item.articleKey}|${item.author}|${item.createdAt}|${item.text}`));
  const existingTasks = new Set((state.storage.tasks || []).map((item) => `${item.articleKey}|${item.owner}|${item.due}|${item.title}`));

  for (const rawComment of seed.comments || []) {
    const comment = normalizeComment(rawComment);
    const key = `${comment.articleKey}|${comment.author}|${comment.createdAt}|${comment.text}`;
    if (!existingComments.has(key)) state.storage.comments.push(comment);
  }
  for (const task of seed.tasks || []) {
    const normalized = normalizeTask(task, 'seed');
    const key = `${normalized.articleKey}|${normalized.owner}|${normalized.due}|${normalized.title}`;
    if (!existingTasks.has(key)) state.storage.tasks.push(normalized);
  }
  saveLocalStorage();
}

function mergeImportedStorage(imported) {
  const seed = {
    comments: Array.isArray(imported.comments) ? imported.comments : [],
    tasks: Array.isArray(imported.tasks) ? imported.tasks : [],
    decisions: Array.isArray(imported.decisions) ? imported.decisions : [],
    ownerOverrides: Array.isArray(imported.ownerOverrides) ? imported.ownerOverrides : []
  };
  mergeSeedStorage(seed);
  for (const raw of seed.decisions) {
    const decision = normalizeDecision(raw);
    if (!state.storage.decisions.some((item) => item.id === decision.id)) state.storage.decisions.unshift(decision);
  }
  for (const raw of seed.ownerOverrides) {
    const override = normalizeOwnerOverride(raw);
    state.storage.ownerOverrides = (state.storage.ownerOverrides || []).filter((item) => item.articleKey !== override.articleKey);
    state.storage.ownerOverrides.unshift(override);
  }
  applyOwnerOverridesToSkus();
  saveLocalStorage();
}

function marginBadge(label, value) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return badge(`${label} —`);
  return badge(`${label} ${fmt.pct(value)}`, Number(value) < 0 ? 'danger' : 'ok');
}
function currentWorkLabel() {
  if (state.filters.market === 'wb') return 'В работу WB = план < 80% + маржа WB < 0';
  if (state.filters.market === 'ozon') return 'В работу Ozon = план < 80% + маржа Ozon < 0';
  return 'В работу = план < 80% + отрицательная маржа';
}

function priorityBadges(sku) {
  const parts = [];
  if (sku?.flags?.toWorkWB && sku?.flags?.toWorkOzon) parts.push('<span class="chip danger">В работу WB/Ozon</span>');
  else if (sku?.flags?.toWorkWB) parts.push('<span class="chip danger">В работу WB</span>');
  else if (sku?.flags?.toWorkOzon) parts.push('<span class="chip danger">В работу Ozon</span>');
  else if (sku?.flags?.toWork) parts.push('<span class="chip danger">В работу</span>');
  if (sku?.flags?.wbNegativeMargin) parts.push('<span class="chip danger">WB маржа < 0</span>');
  if (sku?.flags?.ozonNegativeMargin) parts.push('<span class="chip danger">Ozon маржа < 0</span>');
  if (!sku?.flags?.assigned) parts.push('<span class="chip warn">Без owner</span>');
  if (sku?.flags?.hasKZ) parts.push('<span class="chip info">🚀 КЗ</span>');
  if (sku?.flags?.hasVK) parts.push('<span class="chip info">📣 VK</span>');
  parts.push(scoreChip(sku?.focusScore || 0));
  return `<div class="badge-stack">${parts.join('')}</div>`;
}

function commentTypeChip(type) {
  const map = { signal: 'info', risk: 'danger', focus: 'warn', idea: 'ok' };
  return badge(type || 'comment', map[type] || '');
}

function mapTaskStatus(status) {
  const raw = String(status || '').trim().toLowerCase();
  if (['open', 'new'].includes(raw)) return 'new';
  if (['in_progress', 'in progress', 'progress', 'doing', 'work', 'в работе'].includes(raw)) return 'in_progress';
  if (['waiting_team', 'waiting-team', 'wait_team'].includes(raw)) return 'waiting_team';
  if (['blocked', 'waiting_decision', 'wait_decision', 'decision', 'waiting', 'ждёт', 'ждет'].includes(raw)) return 'waiting_decision';
  if (['done', 'complete', 'completed', 'сделано'].includes(raw)) return 'done';
  if (['cancelled', 'canceled', 'отменено'].includes(raw)) return 'cancelled';
  return 'new';
}

function inferTaskType(text = '') {
  const raw = String(text || '').toLowerCase();
  if (/марж|цен|min price|unit|убыт|цена/.test(raw)) return 'price_margin';
  if (/контент|карточ|фото|тз|креатив|описан/.test(raw)) return 'content';
  if (/трафик|кз|vk|вк|инфлю|реклама|рк|smm/.test(raw)) return 'traffic';
  if (/остат|постав|склад|supply|oos|логист/.test(raw)) return 'supply';
  if (/возврат|отзыв|рейтинг/.test(raw)) return 'returns';
  if (/owner|закреп|назнач/.test(raw)) return 'assignment';
  if (/новин|launch|gate|бриф/.test(raw)) return 'launch';
  return 'general';
}

function detectTaskPlatform(task, sku) {
  if (task?.platform) return task.platform;
  const text = `${task?.title || ''} ${task?.nextAction || ''}`.toLowerCase();
  if (text.includes('wb') && text.includes('ozon')) return 'wb+ozon';
  if (text.includes('wb')) return 'wb';
  if (text.includes('ozon')) return 'ozon';
  if (sku?.flags?.toWorkWB && sku?.flags?.toWorkOzon) return 'wb+ozon';
  if (sku?.flags?.toWorkWB) return 'wb';
  if (sku?.flags?.toWorkOzon) return 'ozon';
  if (sku?.flags?.hasWB && sku?.flags?.hasOzon) return 'wb+ozon';
  if (sku?.flags?.hasWB) return 'wb';
  if (sku?.flags?.hasOzon) return 'ozon';
  return 'all';
}

function normalizeTask(task, sourceHint = 'manual') {
  const sku = task?.articleKey ? getSku(task.articleKey) : null;
  const title = task?.title || 'Задача без названия';
  const type = task?.type || inferTaskType(`${title} ${task?.nextAction || ''}`);
  const priority = task?.priority || (type === 'price_margin' ? 'critical' : type === 'assignment' ? 'high' : 'medium');
  const createdAt = task?.createdAt || new Date().toISOString();
  return {
    id: task?.id || stableId(sourceHint === 'auto' ? 'auto' : 'task', `${task?.articleKey || ''}|${title}|${task?.due || ''}|${createdAt}|${sourceHint}`),
    source: task?.source || sourceHint,
    articleKey: task?.articleKey || '',
    title,
    nextAction: task?.nextAction || '',
    reason: task?.reason || '',
    owner: task?.owner || ownerName(sku) || '',
    due: task?.due || plusDays(type === 'assignment' ? 1 : 3),
    status: mapTaskStatus(task?.status),
    type,
    priority,
    platform: detectTaskPlatform(task, sku),
    createdAt,
    entityLabel: task?.entityLabel || sku?.name || title,
    autoCode: task?.autoCode || ''
  };
}

function normalizeStorageTasks(tasks, sourceHint = 'manual') {
  return (tasks || []).map((task) => normalizeTask(task, task?.source || sourceHint));
}

function isTaskActive(task) {
  return ACTIVE_TASK_STATUSES.has(task?.status);
}

function isTaskOverdue(task) {
  return Boolean(task?.due) && isTaskActive(task) && task.due < todayIso();
}

function taskStatusBadge(task) {
  const meta = isTaskOverdue(task) ? { label: 'Просрочено', kind: 'danger' } : (TASK_STATUS_META[task?.status] || TASK_STATUS_META.new);
  return badge(meta.label, meta.kind);
}

function taskPriorityBadge(task) {
  const meta = PRIORITY_META[task?.priority] || PRIORITY_META.medium;
  return badge(meta.label, meta.kind);
}

function taskTypeBadge(task) {
  const kind = task?.type === 'price_margin' ? 'danger' : task?.type === 'assignment' ? 'warn' : 'info';
  return badge(TASK_TYPE_META[task?.type] || TASK_TYPE_META.general, kind);
}

function taskSourceBadge(task) {
  if (task?.source === 'auto') return badge('авто-сигнал', 'info');
  if (task?.source === 'seed') return badge('seed');
  return badge('ручная', 'ok');
}

function taskPlatformBadge(task) {
  if (task?.platform === 'wb') return badge('WB');
  if (task?.platform === 'ozon') return badge('Ozon');
  if (task?.platform === 'wb+ozon') return badge('WB + Ozon');
  return badge('Все площадки');
}

function taskSortKey(task) {
  return [
    Number(isTaskOverdue(task)),
    Number(isTaskActive(task)),
    PRIORITY_META[task?.priority]?.rank || 1,
    task?.due || '9999-12-31',
    task?.title || ''
  ];
}

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const ka = taskSortKey(a);
    const kb = taskSortKey(b);
    return kb[0] - ka[0]
      || kb[1] - ka[1]
      || kb[2] - ka[2]
      || ka[3].localeCompare(kb[3])
      || ka[4].localeCompare(kb[4], 'ru');
  });
}

function storedTaskKeys() {
  return new Set(state.storage.tasks.filter(isTaskActive).map((task) => `${task.articleKey}|${task.type}`));
}

function buildAutoTasks() {
  const keys = storedTaskKeys();
  const tasks = [];

  for (const sku of state.skus) {
    const articleKey = sku.articleKey;
    const owner = ownerName(sku);
    const platform = sku?.flags?.toWorkWB && sku?.flags?.toWorkOzon ? 'wb+ozon' : sku?.flags?.toWorkWB ? 'wb' : sku?.flags?.toWorkOzon ? 'ozon' : detectTaskPlatform({}, sku);
    const exitSku = String(sku?.status || '').toLowerCase().includes('вывод');

    if ((sku?.flags?.toWorkWB || sku?.flags?.toWorkOzon || sku?.flags?.toWork) && !keys.has(`${articleKey}|price_margin`)) {
      tasks.push(normalizeTask({
        id: `auto-price-${articleKey}`,
        source: 'auto',
        autoCode: 'price_margin',
        articleKey,
        title: 'Разобрать цену и маржу',
        nextAction: 'Проверить цену, unit-экономику и дать план действий по SKU в работе.',
        reason: sku.focusReasons || 'Ниже плана и отрицательная маржа.',
        owner,
        due: plusDays(2),
        status: 'new',
        type: 'price_margin',
        priority: 'critical',
        platform
      }, 'auto'));
    } else if (sku?.flags?.negativeMargin && !keys.has(`${articleKey}|price_margin`)) {
      tasks.push(normalizeTask({
        id: `auto-neg-${articleKey}`,
        source: 'auto',
        autoCode: 'negative_margin',
        articleKey,
        title: 'Проверить отрицательную маржу',
        nextAction: 'Сверить комиссии, логистику, возвраты и min price.',
        reason: 'Есть отрицательная маржа хотя бы по одной из площадок.',
        owner,
        due: plusDays(3),
        status: 'new',
        type: 'price_margin',
        priority: 'high',
        platform
      }, 'auto'));
    }

    if (sku?.flags?.lowStock && !exitSku && !keys.has(`${articleKey}|supply`)) {
      tasks.push(normalizeTask({
        id: `auto-stock-${articleKey}`,
        source: 'auto',
        autoCode: 'low_stock',
        articleKey,
        title: 'Проверить остатки и поставку',
        nextAction: 'Подтвердить риск OOS, поставить срок и план отгрузки.',
        reason: 'Низкий остаток по SKU.',
        owner,
        due: plusDays(2),
        status: 'new',
        type: 'supply',
        priority: 'high',
        platform
      }, 'auto'));
    }

    if (!sku?.flags?.assigned && !keys.has(`${articleKey}|assignment`)) {
      tasks.push(normalizeTask({
        id: `auto-owner-${articleKey}`,
        source: 'auto',
        autoCode: 'assignment',
        articleKey,
        title: 'Назначить owner по SKU',
        nextAction: 'Закрепить ответственного и срок первого апдейта.',
        reason: 'SKU без закрепления.',
        owner: '',
        due: plusDays(1),
        status: 'new',
        type: 'assignment',
        priority: 'high',
        platform
      }, 'auto'));
    }

    if (sku?.flags?.highReturn && !keys.has(`${articleKey}|returns`)) {
      tasks.push(normalizeTask({
        id: `auto-returns-${articleKey}`,
        source: 'auto',
        autoCode: 'returns',
        articleKey,
        title: 'Разобрать возвраты и отзывы',
        nextAction: 'Проверить причины возвратов, отзывы и нужные правки карточки.',
        reason: sku?.returns?.topReason || 'Высокие возвраты по SKU.',
        owner,
        due: plusDays(3),
        status: 'new',
        type: 'returns',
        priority: 'medium',
        platform
      }, 'auto'));
    }

    if ((sku?.focusScore || 0) >= 4 && !sku?.flags?.hasExternalTraffic && !exitSku && !keys.has(`${articleKey}|traffic`)) {
      tasks.push(normalizeTask({
        id: `auto-traffic-${articleKey}`,
        source: 'auto',
        autoCode: 'traffic',
        articleKey,
        title: 'Проверить внешний трафик по фокусному SKU',
        nextAction: 'Решить, нужен ли КЗ / VK / инфлюенсеры и зафиксировать owner канала.',
        reason: 'Фокусный SKU без внешнего трафика.',
        owner,
        due: plusDays(4),
        status: 'new',
        type: 'traffic',
        priority: 'medium',
        platform
      }, 'auto'));
    }
  }

  return tasks;
}

function getAllTasks() {
  return sortTasks([...state.storage.tasks, ...buildAutoTasks()]);
}

function getSkuControlTasks(articleKey) {
  return sortTasks(getAllTasks().filter((task) => task.articleKey === articleKey));
}

function nextTaskForSku(articleKey) {
  const tasks = getSkuControlTasks(articleKey);
  return tasks.find(isTaskActive) || tasks[0] || null;
}

function getControlSnapshot() {
  const tasks = getAllTasks();
  const active = tasks.filter(isTaskActive);
  const overdue = active.filter(isTaskOverdue);
  const waitingDecision = active.filter((task) => task.status === 'waiting_decision');
  const noOwner = active.filter((task) => !task.owner);
  const dueThisWeek = active.filter((task) => task.due && task.due <= plusDays(7));
  const ownerMap = new Map();

  for (const task of active) {
    const key = task.owner || 'Без owner';
    const row = ownerMap.get(key) || { owner: key, total: 0, overdue: 0, critical: 0, waiting: 0 };
    row.total += 1;
    if (isTaskOverdue(task)) row.overdue += 1;
    if (task.priority === 'critical') row.critical += 1;
    if (task.status === 'waiting_decision') row.waiting += 1;
    ownerMap.set(key, row);
  }

  return {
    tasks,
    active,
    overdue,
    waitingDecision,
    noOwner,
    dueThisWeek,
    byOwner: [...ownerMap.values()].sort((a, b) => b.total - a.total || a.owner.localeCompare(b.owner, 'ru')),
    todayList: sortTasks(active).filter((task) => isTaskOverdue(task) || task.priority === 'critical' || (task.due && task.due <= plusDays(2))).slice(0, 12),
    autoCount: tasks.filter((task) => task.source === 'auto' && isTaskActive(task)).length,
    manualCount: tasks.filter((task) => task.source !== 'auto' && isTaskActive(task)).length
  };
}

async function initTeamStore() {
  const cfg = currentConfig();
  state.team.member = { ...DEFAULT_APP_CONFIG.teamMember, ...(cfg.teamMember || {}) };
  state.team.error = '';
  state.team.note = 'Локальный режим';
  state.team.mode = 'local';
  state.team.ready = false;
  updateSyncBadge();

  if (cfg.teamMode !== 'supabase' || !cfg.supabase?.url || !cfg.supabase?.anonKey || !window.supabase?.createClient) {
    applyOwnerOverridesToSkus();
    updateSyncBadge();
    return;
  }

  try {
    state.team.mode = 'pending';
    state.team.note = 'Подключаем командную базу…';
    updateSyncBadge();

    const client = window.supabase.createClient(cfg.supabase.url, cfg.supabase.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    state.team.client = client;

    if ((cfg.supabase.auth || 'anonymous') === 'anonymous') {
      const currentSession = await client.auth.getSession();
      if (!currentSession?.data?.session) {
        const signIn = await client.auth.signInAnonymously();
        if (signIn.error) throw signIn.error;
      }
      const session = await client.auth.getSession();
      state.team.userId = session?.data?.session?.user?.id || '';
    }

    state.team.mode = 'ready';
    state.team.ready = true;
    state.team.note = 'Командная база подключена';
    await pullRemoteState(false);
  } catch (error) {
    console.error(error);
    state.team.mode = 'error';
    state.team.ready = false;
    state.team.error = error.message || 'Ошибка подключения';
    state.team.note = 'Ошибка Supabase — работаем локально';
    applyOwnerOverridesToSkus();
    updateSyncBadge();
  }
}

function remoteTaskRow(task) {
  return {
    id: task.id,
    brand: currentBrand(),
    article_key: task.articleKey,
    title: task.title,
    next_action: task.nextAction || '',
    reason: task.reason || '',
    owner: task.owner || '',
    due: task.due || null,
    status: task.status,
    type: task.type,
    priority: task.priority,
    platform: task.platform,
    source: task.source,
    entity_label: task.entityLabel || '',
    auto_code: task.autoCode || '',
    created_at: task.createdAt || new Date().toISOString()
  };
}

function fromRemoteTask(row) {
  return {
    id: row.id,
    articleKey: row.article_key,
    title: row.title,
    nextAction: row.next_action,
    reason: row.reason,
    owner: row.owner,
    due: row.due,
    status: row.status,
    type: row.type,
    priority: row.priority,
    platform: row.platform,
    source: row.source || 'manual',
    entityLabel: row.entity_label,
    autoCode: row.auto_code,
    createdAt: row.created_at
  };
}

function remoteCommentRow(comment) {
  return {
    id: comment.id,
    brand: currentBrand(),
    article_key: comment.articleKey,
    author: comment.author,
    team: comment.team,
    text: comment.text,
    type: comment.type,
    created_at: comment.createdAt
  };
}

function fromRemoteComment(row) {
  return normalizeComment({
    id: row.id,
    articleKey: row.article_key,
    author: row.author,
    team: row.team,
    text: row.text,
    type: row.type,
    createdAt: row.created_at
  });
}

function remoteDecisionRow(decision) {
  return {
    id: decision.id,
    brand: currentBrand(),
    article_key: decision.articleKey,
    title: decision.title,
    decision: decision.decision,
    owner: decision.owner,
    status: decision.status,
    due: decision.due || null,
    created_at: decision.createdAt,
    created_by: decision.createdBy
  };
}

function fromRemoteDecision(row) {
  return normalizeDecision({
    id: row.id,
    articleKey: row.article_key,
    title: row.title,
    decision: row.decision,
    owner: row.owner,
    status: row.status,
    due: row.due,
    createdAt: row.created_at,
    createdBy: row.created_by
  });
}

function remoteOwnerRow(item) {
  return {
    brand: currentBrand(),
    article_key: item.articleKey,
    owner_name: item.ownerName,
    owner_role: item.ownerRole,
    note: item.note,
    updated_at: item.updatedAt,
    assigned_by: item.assignedBy
  };
}

function fromRemoteOwner(row) {
  return normalizeOwnerOverride({
    articleKey: row.article_key,
    ownerName: row.owner_name,
    ownerRole: row.owner_role,
    note: row.note,
    updatedAt: row.updated_at,
    assignedBy: row.assigned_by
  });
}

function hasRemoteStore() {
  return Boolean(state.team.ready && state.team.client);
}

async function queryRemote(table) {
  if (!hasRemoteStore()) return [];
  const response = await state.team.client.from(table).select('*').eq('brand', currentBrand());
  if (response.error) throw response.error;
  return response.data || [];
}

async function upsertRemote(table, rows, onConflict) {
  if (!hasRemoteStore() || !rows.length) return;
  const response = await state.team.client.from(table).upsert(rows, { onConflict });
  if (response.error) throw response.error;
}

async function pullRemoteState(rerender = true) {
  if (!hasRemoteStore()) return;
  try {
    state.team.mode = 'pending';
    state.team.note = 'Загружаем командные данные…';
    updateSyncBadge();
    const [taskRows, commentRows, decisionRows, ownerRows] = await Promise.all([
      queryRemote(TEAM_TABLES.tasks),
      queryRemote(TEAM_TABLES.comments),
      queryRemote(TEAM_TABLES.decisions),
      queryRemote(TEAM_TABLES.owners)
    ]);
    const remoteEmpty = !taskRows.length && !commentRows.length && !decisionRows.length && !ownerRows.length;
    if (!remoteEmpty) {
      state.storage.tasks = normalizeStorageTasks(taskRows.map(fromRemoteTask), 'manual');
      state.storage.comments = commentRows.map(fromRemoteComment);
      state.storage.decisions = decisionRows.map(fromRemoteDecision);
      state.storage.ownerOverrides = ownerRows.map(fromRemoteOwner);
      applyOwnerOverridesToSkus();
      saveLocalStorage();
    }
    state.team.mode = 'ready';
    state.team.lastSyncAt = new Date().toISOString();
    state.team.note = remoteEmpty
      ? 'Командная база пока пустая — локальные данные сохранены'
      : `Командная база синхронизирована · ${fmt.date(state.team.lastSyncAt)}`;
    updateSyncBadge();
    if (rerender) {
      rerenderCurrentView();
      if (state.activeSku) renderSkuModal(state.activeSku);
    }
  } catch (error) {
    console.error(error);
    state.team.mode = 'error';
    state.team.error = error.message || 'Не удалось загрузить данные';
    state.team.note = 'Ошибка загрузки из Supabase';
    updateSyncBadge();
  }
}

async function pushStateToRemote() {
  if (!hasRemoteStore()) return;
  try {
    state.team.mode = 'pending';
    state.team.note = 'Отправляем локальные данные в командную базу…';
    updateSyncBadge();
    await Promise.all([
      upsertRemote(TEAM_TABLES.tasks, (state.storage.tasks || []).map(remoteTaskRow), 'id'),
      upsertRemote(TEAM_TABLES.comments, (state.storage.comments || []).map(remoteCommentRow), 'id'),
      upsertRemote(TEAM_TABLES.decisions, (state.storage.decisions || []).map(remoteDecisionRow), 'id'),
      upsertRemote(TEAM_TABLES.owners, (state.storage.ownerOverrides || []).map(remoteOwnerRow), 'brand,article_key')
    ]);
    state.team.mode = 'ready';
    state.team.lastSyncAt = new Date().toISOString();
    state.team.note = `Данные отправлены в Supabase · ${fmt.date(state.team.lastSyncAt)}`;
    updateSyncBadge();
  } catch (error) {
    console.error(error);
    state.team.mode = 'error';
    state.team.error = error.message || 'Не удалось отправить данные';
    state.team.note = 'Ошибка выгрузки в Supabase';
    updateSyncBadge();
  }
}

async function persistTask(task) {
  if (!hasRemoteStore()) return;
  await upsertRemote(TEAM_TABLES.tasks, [remoteTaskRow(task)], 'id');
  state.team.lastSyncAt = new Date().toISOString();
  state.team.note = `Задача синхронизирована · ${fmt.date(state.team.lastSyncAt)}`;
  state.team.mode = 'ready';
  updateSyncBadge();
}

async function persistComment(comment) {
  if (!hasRemoteStore()) return;
  await upsertRemote(TEAM_TABLES.comments, [remoteCommentRow(comment)], 'id');
  state.team.lastSyncAt = new Date().toISOString();
  state.team.note = `Комментарий синхронизирован · ${fmt.date(state.team.lastSyncAt)}`;
  state.team.mode = 'ready';
  updateSyncBadge();
}

async function persistDecision(decision) {
  if (!hasRemoteStore()) return;
  await upsertRemote(TEAM_TABLES.decisions, [remoteDecisionRow(decision)], 'id');
  state.team.lastSyncAt = new Date().toISOString();
  state.team.note = `Решение синхронизировано · ${fmt.date(state.team.lastSyncAt)}`;
  state.team.mode = 'ready';
  updateSyncBadge();
}

async function persistOwnerOverride(item) {
  if (!hasRemoteStore()) return;
  await upsertRemote(TEAM_TABLES.owners, [remoteOwnerRow(item)], 'brand,article_key');
  state.team.lastSyncAt = new Date().toISOString();
  state.team.note = `Owner синхронизирован · ${fmt.date(state.team.lastSyncAt)}`;
  state.team.mode = 'ready';
  updateSyncBadge();
}

function updateSyncBadge() {
  const badgeEl = document.getElementById('syncStatusBadge');
  const pullBtn = document.getElementById('pullRemoteBtn');
  const pushBtn = document.getElementById('pushRemoteBtn');
  if (!badgeEl) return;
  badgeEl.className = 'sync-status';
  const mode = state.team.mode || 'local';
  if (mode === 'ready') badgeEl.classList.add('ready');
  else if (mode === 'pending') badgeEl.classList.add('pending');
  else if (mode === 'error') badgeEl.classList.add('error');
  else badgeEl.classList.add('local');
  const member = state.team.member?.name ? ` · ${state.team.member.name}` : '';
  badgeEl.textContent = `${state.team.note || 'Локальный режим'}${member}`;
  if (pullBtn) pullBtn.disabled = !hasRemoteStore();
  if (pushBtn) pushBtn.disabled = !hasRemoteStore();
}

function filteredControlTasks() {
  const f = state.controlFilters;
  const search = String(f.search || '').trim().toLowerCase();

  return getAllTasks().filter((task) => {
    const sku = getSku(task.articleKey);
    const hay = [task.title, task.nextAction, task.reason, task.owner, task.articleKey, sku?.article, sku?.name, sku?.category].filter(Boolean).join(' ').toLowerCase();
    if (search && !hay.includes(search)) return false;
    if (f.owner !== 'all' && (task.owner || 'Без owner') !== f.owner) return false;
    if (f.status === 'active' && !isTaskActive(task)) return false;
    if (f.status !== 'active' && f.status !== 'all' && task.status !== f.status) return false;
    if (f.type !== 'all' && task.type !== f.type) return false;
    if (f.platform !== 'all' && task.platform !== f.platform) return false;
    if (f.source === 'manual' && task.source === 'auto') return false;
    if (f.source === 'auto' && task.source !== 'auto') return false;
    if (f.horizon === 'overdue' && !isTaskOverdue(task)) return false;
    if (f.horizon === 'today' && task.due !== todayIso()) return false;
    if (f.horizon === 'week' && (!task.due || task.due > plusDays(7))) return false;
    if (f.horizon === 'no_owner' && task.owner) return false;
    return true;
  });
}

function renderTaskCard(task) {
  const sku = getSku(task.articleKey);
  const skuLabel = sku ? linkToSku(sku.articleKey, sku.article || sku.articleKey) : badge(task.articleKey || task.entityLabel || 'SKU');
  const controls = task.source === 'auto'
    ? `<button class="btn small-btn" data-take-task="${escapeHtml(task.id)}">Взять в работу</button>`
    : `<select class="inline-select task-status-select" data-task-id="${escapeHtml(task.id)}">${Object.entries(TASK_STATUS_META).map(([value, meta]) => `<option value="${value}" ${task.status === value ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select>`;

  return `
    <div class="task-card ${isTaskOverdue(task) ? 'overdue' : ''}">
      <div class="head">
        <div>
          <div class="title">${escapeHtml(task.title)}</div>
          <div class="muted small" style="margin-top:4px">${skuLabel}</div>
        </div>
        ${taskStatusBadge(task)}
      </div>
      <div class="meta">${taskPriorityBadge(task)}${taskTypeBadge(task)}${taskPlatformBadge(task)}${taskSourceBadge(task)}</div>
      ${task.reason ? `<div class="muted small">${escapeHtml(task.reason)}</div>` : ''}
      ${task.nextAction ? `<div><strong class="small">Следующее действие</strong><div class="muted small" style="margin-top:4px">${escapeHtml(task.nextAction)}</div></div>` : ''}
      <div class="foot">
        <div class="muted small">${escapeHtml(task.owner || 'Без owner')} · срок ${escapeHtml(task.due || '—')}</div>
        <div class="actions">${controls}</div>
      </div>
    </div>
  `;
}

function renderMiniTask(task) {
  const sku = getSku(task.articleKey);
  return `
    <div class="task-mini ${isTaskOverdue(task) ? 'overdue' : ''}">
      <div class="left">
        <strong>${escapeHtml(task.title)}</strong>
        <div class="muted small">${escapeHtml(sku?.article || task.articleKey || task.entityLabel || '—')} · ${escapeHtml(task.owner || 'Без owner')} · ${escapeHtml(task.due || '—')}</div>
      </div>
      <div class="badge-stack">${taskPriorityBadge(task)}${taskStatusBadge(task)}</div>
    </div>
  `;
}

function renderOwnerRow(row, max) {
  const width = Math.max(6, Math.round((row.total / Math.max(1, max)) * 100));
  return `
    <div class="owner-row">
      <div class="head">
        <strong>${escapeHtml(row.owner)}</strong>
        <div class="badge-stack">
          ${badge(`${fmt.int(row.total)} задач`)}
          ${row.overdue ? badge(`${fmt.int(row.overdue)} проср.`, 'danger') : ''}
          ${row.critical ? badge(`${fmt.int(row.critical)} крит.`, 'warn') : ''}
        </div>
      </div>
      <div class="owner-bar"><span style="width:${width}%"></span></div>
    </div>
  `;
}

function skuOperationalStatus(sku) {
  if (String(sku?.status || '').toLowerCase().includes('вывод')) return badge('Вывод');
  if (sku?.flags?.toWorkWB && sku?.flags?.toWorkOzon) return badge('В работу WB + Ozon', 'danger');
  if (sku?.flags?.toWorkWB) return badge('В работу WB', 'danger');
  if (sku?.flags?.toWorkOzon) return badge('В работу Ozon', 'danger');
  if (sku?.flags?.toWork) return badge('В работу', 'danger');
  if ((sku?.focusScore || 0) >= 4) return badge('Наблюдать', 'warn');
  return badge('Ок', 'ok');
}

function renderSkuTaskSummary(sku) {
  const task = nextTaskForSku(sku.articleKey);
  if (!task) return `<div class="muted small">Нет активной задачи</div>`;
  return `
    <div><strong>${escapeHtml(task.title)}</strong></div>
    <div class="muted small">${escapeHtml(task.nextAction || task.reason || 'Нужен апдейт')}</div>
    <div class="badge-stack" style="margin-top:6px">${taskStatusBadge(task)}${taskPriorityBadge(task)}</div>
  `;
}


function numberOrZero(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function avg(values) {
  const clean = values.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  if (!clean.length) return null;
  return clean.reduce((acc, value) => acc + value, 0) / clean.length;
}

function bestTurnoverDays(sku) {
  const values = [sku?.wb?.turnoverDays, sku?.ozon?.turnoverDays]
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);
  return values.length ? Math.min(...values) : null;
}

function totalSkuStock(sku) {
  return numberOrZero(sku?.wb?.stock) + numberOrZero(sku?.ozon?.stockProducts ?? sku?.ozon?.stock);
}

function monthRevenue(sku) {
  return numberOrZero(sku?.planFact?.factFeb26Revenue || sku?.orders?.value || sku?.planFact?.factTotalRevenue);
}

function monthNetRevenue(sku) {
  return numberOrZero(sku?.planFact?.factFeb26NetRevenue || sku?.orders?.value);
}

function monthUnits(sku) {
  return numberOrZero(sku?.planFact?.factFeb26Units || sku?.orders?.units);
}

function externalTrafficLabel(sku) {
  const parts = [];
  if (sku?.flags?.hasKZ) parts.push('🚀 КЗ');
  if (sku?.flags?.hasVK) parts.push('📣 VK');
  return parts.join(' · ') || 'без внешнего трафика';
}

function renderLeaderRow(item, index, maxValue, metricLabel, metaHtml = '') {
  const width = maxValue > 0 ? Math.max(6, Math.round((numberOrZero(item.metricValue) / maxValue) * 100)) : 12;
  return `
    <div class="leader-row">
      <div class="leader-rank">${index + 1}</div>
      <div class="leader-main">
        <div class="leader-headline">
          <div>
            <strong>${linkToSku(item.articleKey, item.article || item.articleKey)}</strong>
            <div class="muted small">${escapeHtml(item.title || 'Без названия')}</div>
          </div>
          <div class="leader-value">${escapeHtml(metricLabel(item.metricValue))}</div>
        </div>
        <div class="leader-bar"><span style="width:${width}%"></span></div>
        <div class="leader-meta">${metaHtml}</div>
      </div>
    </div>
  `;
}

function renderInverseLeaderRow(item, index, maxValue, metricLabel, metaHtml = '') {
  const rawValue = numberOrZero(item.metricValue);
  const width = maxValue > 0 ? Math.max(8, Math.round((1 - rawValue / maxValue) * 100)) : 12;
  return `
    <div class="leader-row">
      <div class="leader-rank">${index + 1}</div>
      <div class="leader-main">
        <div class="leader-headline">
          <div>
            <strong>${linkToSku(item.articleKey, item.article || item.articleKey)}</strong>
            <div class="muted small">${escapeHtml(item.title || 'Без названия')}</div>
          </div>
          <div class="leader-value">${escapeHtml(metricLabel(item.metricValue))}</div>
        </div>
        <div class="leader-bar inverse"><span style="width:${width}%"></span></div>
        <div class="leader-meta">${metaHtml}</div>
      </div>
    </div>
  `;
}

function buildVisualDashboardModel() {
  const control = getControlSnapshot();
  const activeSkus = state.skus.filter((sku) => !String(sku?.status || '').toLowerCase().includes('вывод'));
  const revenueTotal = activeSkus.reduce((acc, sku) => acc + monthRevenue(sku), 0);
  const netRevenueTotal = activeSkus.reduce((acc, sku) => acc + monthNetRevenue(sku), 0);
  const unitsTotal = activeSkus.reduce((acc, sku) => acc + monthUnits(sku), 0);
  const avgCompletion = avg(activeSkus.map((sku) => sku?.planFact?.completionFeb26Pct));
  const avgMargin = avg(activeSkus.map((sku) => sku?.planFact?.factFeb26MarginPct));
  const trafficCount = activeSkus.filter((sku) => sku?.flags?.hasExternalTraffic).length;
  const leadersSales = [...activeSkus]
    .filter((sku) => monthRevenue(sku) > 0)
    .sort((a, b) => monthRevenue(b) - monthRevenue(a))
    .slice(0, 8)
    .map((sku) => ({
      articleKey: sku.articleKey,
      article: sku.article,
      title: sku.name,
      metricValue: monthRevenue(sku),
      owner: ownerName(sku),
      marginPct: sku?.planFact?.factFeb26MarginPct,
      units: monthUnits(sku),
      traffic: externalTrafficLabel(sku)
    }));
  const turnoverCandidates = [...activeSkus]
    .map((sku) => ({
      sku,
      metricValue: bestTurnoverDays(sku)
    }))
    .filter((row) => row.metricValue && row.metricValue > 0 && totalSkuStock(row.sku) > 0)
    .sort((a, b) => a.metricValue - b.metricValue)
    .slice(0, 8)
    .map((row) => ({
      articleKey: row.sku.articleKey,
      article: row.sku.article,
      title: row.sku.name,
      metricValue: row.metricValue,
      stock: totalSkuStock(row.sku),
      target: avg([row.sku?.wb?.targetTurnoverDays, row.sku?.ozon?.targetTurnoverDays]),
      owner: ownerName(row.sku)
    }));
  const romiLeaders = [...activeSkus]
    .filter((sku) => numberOrZero(sku?.content?.romi) > 0)
    .sort((a, b) => numberOrZero(b?.content?.romi) - numberOrZero(a?.content?.romi))
    .slice(0, 6)
    .map((sku) => ({
      articleKey: sku.articleKey,
      article: sku.article,
      title: sku.name,
      metricValue: numberOrZero(sku?.content?.romi),
      posts: numberOrZero(sku?.content?.posts),
      clicks: numberOrZero(sku?.content?.clicks),
      orders: numberOrZero(sku?.content?.orders)
    }));
  const worklist = [...state.skus]
    .filter((sku) => sku?.flags?.toWork)
    .sort((a, b) => numberOrZero(b?.focusScore) - numberOrZero(a?.focusScore) || monthRevenue(b) - monthRevenue(a))
    .slice(0, 6);
  const freshness = state.dashboard?.dataFreshness || {};
  return {
    control,
    revenueTotal,
    netRevenueTotal,
    unitsTotal,
    avgCompletion,
    avgMargin,
    trafficCount,
    leadersSales,
    turnoverCandidates,
    romiLeaders,
    worklist,
    freshness
  };
}

function renderDashboard() {
  const root = document.getElementById('view-dashboard');
  const model = buildVisualDashboardModel();
  const control = model.control;
  const salesMax = Math.max(1, ...model.leadersSales.map((item) => numberOrZero(item.metricValue)));
  const turnoverMax = Math.max(1, ...model.turnoverCandidates.map((item) => numberOrZero(item.metricValue)));
  const romiMax = Math.max(1, ...model.romiLeaders.map((item) => numberOrZero(item.metricValue)));

  const heroCards = [
    { label: 'Выручка за срез', value: fmt.money(model.revenueTotal), hint: 'Сумма факта / order value по активным SKU.' },
    { label: 'Net revenue', value: fmt.money(model.netRevenueTotal), hint: 'Чистая выручка по доступному срезу.' },
    { label: 'Продано единиц', value: fmt.int(model.unitsTotal), hint: 'Факт units по SKU в текущем портале.' },
    { label: 'Среднее выполнение', value: fmt.pct(model.avgCompletion), hint: 'Средний completion по SKU с планом.' },
    { label: 'Средняя маржа', value: fmt.pct(model.avgMargin), hint: 'Средняя маржа по текущему месячному срезу.' },
    { label: 'SKU с внешним трафиком', value: fmt.int(model.trafficCount), hint: 'КЗ / VK уже отмечены в рабочем контуре.' }
  ].map((card) => `
    <div class="hero-kpi">
      <span>${escapeHtml(card.label)}</span>
      <strong>${escapeHtml(card.value)}</strong>
      <small>${escapeHtml(card.hint)}</small>
    </div>
  `).join('');

  const baseCards = (state.dashboard.cards || []).map((card) => `
    <div class="card kpi">
      <div class="label">${escapeHtml(card.label)}</div>
      <div class="value">${fmt.int(card.value)}</div>
      <div class="hint">${escapeHtml(card.hint)}</div>
    </div>
  `).join('');

  const salesRows = model.leadersSales.map((item, index) => renderLeaderRow(
    item,
    index,
    salesMax,
    (value) => fmt.money(value),
    `${badge(item.owner || 'Без owner', item.owner ? 'ok' : 'warn')}${marginBadge('Маржа', item.marginPct)}${badge(`${fmt.int(item.units)} шт.`)}${badge(item.traffic, item.traffic.includes('без') ? '' : 'info')}`
  )).join('');

  const turnoverRows = model.turnoverCandidates.map((item, index) => renderInverseLeaderRow(
    item,
    index,
    turnoverMax,
    (value) => `${fmt.num(value, 1)} дн.`,
    `${badge(`Цель ${fmt.num(item.target, 0)} дн.`, 'info')}${badge(`Остаток ${fmt.int(item.stock)} шт.`)}${badge(item.owner || 'Без owner', item.owner ? 'ok' : 'warn')}`
  )).join('');

  const romiRows = model.romiLeaders.map((item, index) => renderLeaderRow(
    item,
    index,
    romiMax,
    (value) => fmt.num(value, 1),
    `${badge(`${fmt.int(item.posts)} постов`)}${badge(`${fmt.int(item.clicks)} кликов`)}${badge(`${fmt.int(item.orders)} заказов`, 'info')}`
  )).join('');

  const workRows = model.worklist.map((sku) => `
    <div class="alert-row">
      <div>
        <strong>${linkToSku(sku.articleKey, sku.article || sku.articleKey)}</strong>
        <div class="muted small">${escapeHtml(sku.name || 'Без названия')}</div>
      </div>
      <div class="badge-stack">
        ${skuOperationalStatus(sku)}
        ${marginBadge('WB', sku?.wb?.marginPct)}
        ${marginBadge('Ozon', sku?.ozon?.marginPct)}
      </div>
      <div class="muted small">${escapeHtml(sku.focusReasons || 'Ниже плана и отрицательная маржа')}</div>
    </div>
  `).join('');

  root.innerHTML = `
    <section class="hero-panel">
      <div class="hero-copy">
        <div class="eyebrow">ALTEA · brand pulse</div>
        <h2>Красивый дашборд бренда</h2>
        <p>Отдельный визуальный слой для общего состояния бренда: сверху pulse, ниже лидеры продаж и оборачиваемости, а внизу — красные зоны, которые нельзя потерять.</p>
        <div class="badge-stack" style="margin-top:12px">
          ${badge(`План/факт: ${model.freshness.planFactMonth || '—'}`)}
          ${badge(`Лидерборд: ${(model.freshness.contentPeriods || []).join(' / ') || '—'}`, 'info')}
          ${badge(`Новинки: ${model.freshness.launchPlanHorizon || '—'}`)}
        </div>
      </div>
      <div class="hero-grid">${heroCards}</div>
    </section>

    <div class="section-title" style="margin-top:18px">
      <div>
        <h2>Общее состояние бренда</h2>
        <p>Крупные KPI, чтобы за минуту понять, где мы стоим по Алтея.</p>
      </div>
      <div class="quick-actions">
        <button class="quick-chip" data-view-control>Открыть задачи</button>
        <button class="quick-chip" data-control-preset="overdue">Просрочено</button>
        <button class="quick-chip" data-view-executive>Свод руководителя</button>
      </div>
    </div>

    <div class="grid cards">${baseCards}</div>

    <div class="dashboard-grid-3" style="margin-top:14px">
      <div class="card visual-card">
        <div class="section-subhead">
          <div>
            <h3>Лидеры продаж</h3>
            <p class="small muted">Берём текущую выручку по срезу и показываем сильнейшие SKU.</p>
          </div>
          ${badge(`${fmt.int(model.leadersSales.length)} SKU`, 'ok')}
        </div>
        <div class="leader-list">${salesRows || '<div class="empty">Нет данных по продажам</div>'}</div>
      </div>

      <div class="card visual-card">
        <div class="section-subhead">
          <div>
            <h3>Лидеры по оборачиваемости</h3>
            <p class="small muted">Чем меньше дней оборота, тем быстрее крутится SKU.</p>
          </div>
          ${badge('быстрее = лучше', 'info')}
        </div>
        <div class="leader-list">${turnoverRows || '<div class="empty">Нет данных по оборачиваемости</div>'}</div>
      </div>

      <div class="card visual-card">
        <div class="section-subhead">
          <div>
            <h3>Лидеры по контенту / ROMI</h3>
            <p class="small muted">Кого уже тащит контент и где есть наглядный сигнал для масштабирования.</p>
          </div>
          ${badge('контент-потенциал', 'info')}
        </div>
        <div class="leader-list">${romiRows || '<div class="empty">Нет ROMI в текущем срезе</div>'}</div>
      </div>
    </div>

    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Красные зоны</h3>
            <p class="small muted">SKU, которые уже просятся в работу из-за плана и маржи.</p>
          </div>
          ${badge(`${fmt.int(model.worklist.length)} в фокусе`, model.worklist.length ? 'danger' : 'ok')}
        </div>
        <div class="alert-stack">${workRows || '<div class="empty">Сейчас нет критичных SKU</div>'}</div>
      </div>

      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Операционный чек на сегодня</h3>
            <p class="small muted">Сразу видно, что показать на утреннем / weekly созвоне.</p>
          </div>
          ${badge(`${fmt.int(control.todayList.length)} в short-list`, 'warn')}
        </div>
        <div class="task-mini-grid">${control.todayList.slice(0, 8).map(renderMiniTask).join('') || '<div class="empty">Нет задач для экспресс-чека</div>'}</div>
      </div>
    </div>

    <div class="footer-note">Последняя генерация данных: ${escapeHtml(state.dashboard.generatedAt || '—')}. Этот экран теперь отвечает за визуальный pulse бренда, а не за канбан задач.</div>
  `;
}

function renderControlCenter() {
  const root = document.getElementById('view-control');
  const tasks = filteredControlTasks();
  const owners = [...new Set(getAllTasks().map((task) => task.owner || 'Без owner'))].sort((a, b) => a.localeCompare(b, 'ru'));
  const ownerSuggestions = ownerOptions();
  const unassignedSkus = [...state.skus]
    .filter((sku) => !sku?.flags?.assigned)
    .sort((a, b) => (b.focusScore || 0) - (a.focusScore || 0) || monthRevenue(b) - monthRevenue(a))
    .slice(0, 8);
  const waitingDecisions = [...(state.storage.decisions || [])]
    .filter((decision) => decision.status === 'waiting_decision' || decision.status === 'new')
    .sort((a, b) => (a.due || '9999-12-31').localeCompare(b.due || '9999-12-31'))
    .slice(0, 8);
  const columns = [
    ['new', 'Новые'],
    ['in_progress', 'В работе'],
    ['waiting_team', 'Ждёт другого отдела'],
    ['waiting_decision', 'Ждёт решения'],
    ['done', 'Сделано']
  ];

  const counts = {
    active: tasks.filter(isTaskActive).length,
    overdue: tasks.filter(isTaskOverdue).length,
    noOwner: tasks.filter((task) => isTaskActive(task) && !task.owner).length,
    waiting: tasks.filter((task) => task.status === 'waiting_decision').length,
    critical: tasks.filter((task) => isTaskActive(task) && task.priority === 'critical').length,
    auto: tasks.filter((task) => task.source === 'auto' && isTaskActive(task)).length
  };

  const board = columns.map(([status, label]) => {
    const columnTasks = tasks.filter((task) => task.status === status);
    return `
      <div class="board-col">
        <h3>${escapeHtml(label)} <span class="muted">· ${fmt.int(columnTasks.length)}</span></h3>
        <div class="stack">${columnTasks.length ? columnTasks.map(renderTaskCard).join('') : '<div class="empty">Пусто</div>'}</div>
      </div>
    `;
  }).join('');

  const assignHtml = unassignedSkus.length ? unassignedSkus.map((sku) => `
    <div class="assign-row">
      <div class="head">
        <div>
          <strong>${linkToSku(sku.articleKey, sku.article || sku.articleKey)}</strong>
          <div class="muted small">${escapeHtml(sku.name || 'Без названия')}</div>
        </div>
        <div class="badge-stack">${scoreChip(sku.focusScore || 0)}${skuOperationalStatus(sku)}</div>
      </div>
      <div class="team-note">${escapeHtml(sku.focusReasons || 'Нужно просто закрепить owner и первый срок апдейта.')}</div>
      <div class="inline-form" style="margin-top:10px">
        <input class="inline-input" list="ownerOptionsList" data-owner-assign-input="${escapeHtml(sku.articleKey)}" placeholder="Кто владелец SKU">
        <input class="inline-input" data-owner-assign-role="${escapeHtml(sku.articleKey)}" placeholder="Роль / зона" value="Owner SKU">
        <button class="btn small-btn" type="button" data-save-owner="${escapeHtml(sku.articleKey)}">Закрепить</button>
      </div>
    </div>
  `).join('') : '<div class="empty">Все SKU уже закреплены</div>';

  const decisionsHtml = waitingDecisions.length ? waitingDecisions.map((item) => {
    const sku = getSku(item.articleKey);
    return `
      <div class="decision-item">
        <div class="head">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <div class="muted small">${sku ? linkToSku(sku.articleKey, sku.article || sku.articleKey) : escapeHtml(item.articleKey)}</div>
          </div>
          <div class="badge-stack">${taskStatusBadge(item)}${item.owner ? badge(item.owner, 'info') : ''}</div>
        </div>
        <div class="muted small">${escapeHtml(item.decision || 'Нужно зафиксировать решение')}</div>
        <div class="meta-line" style="margin-top:8px"><span class="muted small">Срок ${escapeHtml(item.due || '—')}</span><span class="muted small">${escapeHtml(item.createdBy || 'Команда')}</span></div>
      </div>
    `;
  }).join('') : '<div class="empty">Нет решений в ожидании</div>';

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Контроль задач и визуальный чек</h2>
        <p>Один слой для weekly-задач, сигналов по марже, закрепления owner и решений по SKU.</p>
      </div>
      <div class="quick-actions">
        <button class="quick-chip" data-control-preset="active">Активные</button>
        <button class="quick-chip" data-control-preset="overdue">Просроченные</button>
        <button class="quick-chip" data-control-preset="critical">Критичные</button>
        <button class="quick-chip" data-control-preset="no_owner">Без owner</button>
      </div>
    </div>

    <div class="kpi-strip">
      <div class="mini-kpi"><span>Активно</span><strong>${fmt.int(counts.active)}</strong></div>
      <div class="mini-kpi danger"><span>Просрочено</span><strong>${fmt.int(counts.overdue)}</strong></div>
      <div class="mini-kpi warn"><span>Критично</span><strong>${fmt.int(counts.critical)}</strong></div>
      <div class="mini-kpi warn"><span>Без owner</span><strong>${fmt.int(counts.noOwner)}</strong></div>
      <div class="mini-kpi"><span>Ждёт решения</span><strong>${fmt.int(counts.waiting)}</strong></div>
      <div class="mini-kpi"><span>Авто-сигналы</span><strong>${fmt.int(counts.auto)}</strong></div>
    </div>

    <div class="control-filters">
      <input id="controlSearchInput" placeholder="Поиск по SKU, названию, owner, действию…" value="${escapeHtml(state.controlFilters.search)}">
      <select id="controlOwnerFilter">
        <option value="all">Все owner</option>
        ${owners.map((owner) => `<option value="${escapeHtml(owner)}" ${state.controlFilters.owner === owner ? 'selected' : ''}>${escapeHtml(owner)}</option>`).join('')}
      </select>
      <select id="controlStatusFilter">
        <option value="active" ${state.controlFilters.status === 'active' ? 'selected' : ''}>Только активные</option>
        <option value="all" ${state.controlFilters.status === 'all' ? 'selected' : ''}>Все статусы</option>
        ${Object.entries(TASK_STATUS_META).map(([value, meta]) => `<option value="${value}" ${state.controlFilters.status === value ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}
      </select>
      <select id="controlTypeFilter">
        <option value="all">Все типы</option>
        ${Object.entries(TASK_TYPE_META).map(([value, label]) => `<option value="${value}" ${state.controlFilters.type === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}
      </select>
      <select id="controlPlatformFilter">
        <option value="all">Все площадки</option>
        <option value="wb" ${state.controlFilters.platform === 'wb' ? 'selected' : ''}>WB</option>
        <option value="ozon" ${state.controlFilters.platform === 'ozon' ? 'selected' : ''}>Ozon</option>
        <option value="wb+ozon" ${state.controlFilters.platform === 'wb+ozon' ? 'selected' : ''}>WB + Ozon</option>
      </select>
      <select id="controlHorizonFilter">
        <option value="all">Весь горизонт</option>
        <option value="overdue" ${state.controlFilters.horizon === 'overdue' ? 'selected' : ''}>Просрочено</option>
        <option value="today" ${state.controlFilters.horizon === 'today' ? 'selected' : ''}>Срок сегодня</option>
        <option value="week" ${state.controlFilters.horizon === 'week' ? 'selected' : ''}>Срок на 7 дней</option>
        <option value="no_owner" ${state.controlFilters.horizon === 'no_owner' ? 'selected' : ''}>Без owner</option>
      </select>
      <select id="controlSourceFilter">
        <option value="all">Все источники</option>
        <option value="manual" ${state.controlFilters.source === 'manual' ? 'selected' : ''}>Ручные + seed</option>
        <option value="auto" ${state.controlFilters.source === 'auto' ? 'selected' : ''}>Только авто-сигналы</option>
      </select>
    </div>

    <div class="team-strip">
      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Командный контур и закрепление</h3>
            <p class="small muted">Отсюда быстро добиваем SKU без owner и держим общий контур в одном месте.</p>
          </div>
          ${badge(state.team.mode === 'ready' ? 'Supabase ready' : state.team.mode === 'local' ? 'local' : state.team.mode, state.team.mode === 'ready' ? 'ok' : state.team.mode === 'error' ? 'danger' : 'warn')}
        </div>
        <div class="team-note">${escapeHtml(state.team.note || 'Локальный режим')} · ${escapeHtml(teamMemberLabel())}</div>
        <datalist id="ownerOptionsList">${ownerSuggestions.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>
        <div class="assign-list" style="margin-top:12px">${assignHtml}</div>
      </div>
      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Решения ждут подтверждения</h3>
            <p class="small muted">То, что руководитель или бренд-лид должны быстро зафиксировать.</p>
          </div>
          ${badge(`${fmt.int(waitingDecisions.length)} шт.`, waitingDecisions.length ? 'warn' : 'ok')}
        </div>
        <div class="decision-list">${decisionsHtml}</div>
      </div>
    </div>

    <div class="check-grid" style="margin-bottom:14px">
      <div class="card">
        <h3>Чек-лист контроля</h3>
        <div class="check-list">
          <div class="check-item"><strong>1.</strong><span>Закрыть просрочки и перенести сроки, если реально ждём другой отдел.</span></div>
          <div class="check-item"><strong>2.</strong><span>Проверить все задачи без owner и закрепить их.</span></div>
          <div class="check-item"><strong>3.</strong><span>Отдельно посмотреть критичные задачи по марже и цене.</span></div>
          <div class="check-item"><strong>4.</strong><span>Пробежать новинки без внешнего трафика и задачи по запуску.</span></div>
        </div>
      </div>
      <div class="card">
        <h3>Что здесь уже контролируем</h3>
        <div class="task-mini-grid">
          ${getControlSnapshot().todayList.slice(0, 4).map(renderMiniTask).join('') || '<div class="empty">Нет задач для экспресс-чека</div>'}
        </div>
      </div>
    </div>

    <div class="board-columns">${board}</div>
  `;

  document.getElementById('controlSearchInput').addEventListener('input', (e) => { state.controlFilters.search = e.target.value; renderControlCenter(); });
  document.getElementById('controlOwnerFilter').addEventListener('change', (e) => { state.controlFilters.owner = e.target.value; renderControlCenter(); });
  document.getElementById('controlStatusFilter').addEventListener('change', (e) => { state.controlFilters.status = e.target.value; renderControlCenter(); });
  document.getElementById('controlTypeFilter').addEventListener('change', (e) => { state.controlFilters.type = e.target.value; renderControlCenter(); });
  document.getElementById('controlPlatformFilter').addEventListener('change', (e) => { state.controlFilters.platform = e.target.value; renderControlCenter(); });
  document.getElementById('controlHorizonFilter').addEventListener('change', (e) => { state.controlFilters.horizon = e.target.value; renderControlCenter(); });
  document.getElementById('controlSourceFilter').addEventListener('change', (e) => { state.controlFilters.source = e.target.value; renderControlCenter(); });

  root.querySelectorAll('[data-save-owner]').forEach((btn) => btn.addEventListener('click', async () => {
    const articleKey = btn.dataset.saveOwner;
    const ownerInput = root.querySelector(`[data-owner-assign-input="${articleKey}"]`);
    const roleInput = root.querySelector(`[data-owner-assign-role="${articleKey}"]`);
    await upsertOwnerAssignment({
      articleKey,
      ownerName: ownerInput?.value || '',
      ownerRole: roleInput?.value || 'Owner SKU',
      note: 'Закреплено из контрольного центра'
    });
    renderControlCenter();
    if (state.activeSku === articleKey) renderSkuModal(articleKey);
    rerenderCurrentView();
  }));
}

function filterSkuByMarket(sku) {
  if (state.filters.market === 'wb') return sku?.flags?.hasWB;
  if (state.filters.market === 'ozon') return sku?.flags?.hasOzon;
  return true;
}

function filterSkuByWorkLogic(sku) {
  if (state.filters.market === 'wb') return sku?.flags?.toWorkWB;
  if (state.filters.market === 'ozon') return sku?.flags?.toWorkOzon;
  return sku?.flags?.toWork;
}

function getFilteredSkus() {
  const q = String(state.filters.search || '').trim().toLowerCase();
  return state.skus.filter((sku) => {
    if (!filterSkuByMarket(sku)) return false;
    const hay = [sku.article, sku.articleKey, sku.name, sku.brand, sku.category, sku.segment, ownerName(sku), sku.status, sku.focusReasons].filter(Boolean).join(' ').toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (state.filters.owner !== 'all' && ownerName(sku) !== state.filters.owner) return false;
    if (state.filters.segment !== 'all' && sku.segment !== state.filters.segment) return false;
    if (state.filters.assignment === 'assigned' && !sku?.flags?.assigned) return false;
    if (state.filters.assignment === 'unassigned' && sku?.flags?.assigned) return false;
    if (state.filters.traffic === 'any' && !sku?.flags?.hasExternalTraffic) return false;
    if (state.filters.traffic === 'kz' && !sku?.flags?.hasKZ) return false;
    if (state.filters.traffic === 'vk' && !sku?.flags?.hasVK) return false;
    if (state.filters.traffic === 'none' && sku?.flags?.hasExternalTraffic) return false;

    switch (state.filters.focus) {
      case 'toWork':
        return filterSkuByWorkLogic(sku);
      case 'negativeMargin':
        return sku?.flags?.negativeMargin;
      case 'underPlan':
        return sku?.flags?.underPlan;
      case 'focus4':
        return (sku?.focusScore || 0) >= 4;
      case 'lowStock':
        return sku?.flags?.lowStock;
      case 'highReturn':
        return sku?.flags?.highReturn;
      case 'extAny':
        return sku?.flags?.hasExternalTraffic;
      case 'extKZ':
        return sku?.flags?.hasKZ;
      case 'extVK':
        return sku?.flags?.hasVK;
      case 'unassigned':
        return !sku?.flags?.assigned;
      default:
        return true;
    }
  }).sort((a, b) => {
    const aTask = nextTaskForSku(a.articleKey);
    const bTask = nextTaskForSku(b.articleKey);
    return Number(filterSkuByWorkLogic(b)) - Number(filterSkuByWorkLogic(a))
      || Number((b.focusScore || 0)) - Number((a.focusScore || 0))
      || Number(isTaskOverdue(bTask)) - Number(isTaskOverdue(aTask))
      || String(a.article || '').localeCompare(String(b.article || ''), 'ru');
  });
}

function renderSkuRegistry() {
  const root = document.getElementById('view-skus');
  const items = getFilteredSkus();
  const owners = [...new Set(state.skus.map((sku) => ownerName(sku)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const segments = [...new Set(state.skus.map((sku) => sku.segment).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const assignedCount = items.filter((sku) => sku?.flags?.assigned).length;
  const unassignedCount = items.length - assignedCount;
  const kzCount = items.filter((sku) => sku?.flags?.hasKZ).length;
  const vkCount = items.filter((sku) => sku?.flags?.hasVK).length;

  const rows = items.map((sku) => `
    <tr>
      <td>${linkToSku(sku.articleKey, sku.article || sku.articleKey)}</td>
      <td><div><strong>${escapeHtml(sku.name || 'Без названия')}</strong></div><div class="muted small">${escapeHtml(sku.category || sku.segment || '—')}</div></td>
      <td>${skuOperationalStatus(sku)}</td>
      <td>${ownerCell(sku)}</td>
      <td>${trafficBadges(sku, 'нет')}</td>
      <td>${renderSkuTaskSummary(sku)}</td>
      <td>${nextTaskForSku(sku.articleKey)?.due ? escapeHtml(nextTaskForSku(sku.articleKey).due) : '—'}</td>
    </tr>
  `).join('');

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Реестр SKU · Алтея</h2>
        <p>Сократила строку до операционного минимума: статус, owner, внешний трафик, следующее действие и срок.</p>
      </div>
      <div class="badge-stack">
        ${badge(`${fmt.int(items.length)} SKU`)}
        ${badge(`${fmt.int(assignedCount)} с owner`, 'ok')}
        ${badge(`${fmt.int(unassignedCount)} без owner`, unassignedCount ? 'warn' : 'ok')}
        ${badge(`🚀 КЗ ${fmt.int(kzCount)}`, kzCount ? 'info' : '')}
        ${badge(`📣 VK ${fmt.int(vkCount)}`, vkCount ? 'info' : '')}
      </div>
    </div>

    <div class="market-tabs">
      <button class="market-tab ${state.filters.market === 'all' ? 'active' : ''}" data-market-filter="all">Все площадки</button>
      <button class="market-tab ${state.filters.market === 'wb' ? 'active' : ''}" data-market-filter="wb">WB</button>
      <button class="market-tab ${state.filters.market === 'ozon' ? 'active' : ''}" data-market-filter="ozon">Ozon</button>
    </div>

    <div class="filters filters-advanced">
      <input id="skuSearchInput" placeholder="Поиск по артикулу, названию, категории, owner…" value="${escapeHtml(state.filters.search)}">
      <select id="skuOwnerFilter">
        <option value="all">Все owner</option>
        ${owners.map((owner) => `<option value="${escapeHtml(owner)}" ${state.filters.owner === owner ? 'selected' : ''}>${escapeHtml(owner)}</option>`).join('')}
      </select>
      <select id="skuSegmentFilter">
        <option value="all">Все сегменты</option>
        ${segments.map((segment) => `<option value="${escapeHtml(segment)}" ${state.filters.segment === segment ? 'selected' : ''}>${escapeHtml(segment)}</option>`).join('')}
      </select>
      <select id="skuFocusFilter">
        <option value="all" ${state.filters.focus === 'all' ? 'selected' : ''}>Все SKU</option>
        <option value="toWork" ${state.filters.focus === 'toWork' ? 'selected' : ''}>${currentWorkLabel()}</option>
        <option value="negativeMargin" ${state.filters.focus === 'negativeMargin' ? 'selected' : ''}>Отрицательная маржа</option>
        <option value="underPlan" ${state.filters.focus === 'underPlan' ? 'selected' : ''}>Ниже плана</option>
        <option value="focus4" ${state.filters.focus === 'focus4' ? 'selected' : ''}>Фокус score ≥ 4</option>
        <option value="lowStock" ${state.filters.focus === 'lowStock' ? 'selected' : ''}>Низкий остаток</option>
        <option value="highReturn" ${state.filters.focus === 'highReturn' ? 'selected' : ''}>Высокие возвраты</option>
        <option value="extAny" ${state.filters.focus === 'extAny' ? 'selected' : ''}>Есть внешний трафик</option>
        <option value="unassigned" ${state.filters.focus === 'unassigned' ? 'selected' : ''}>Без owner</option>
      </select>
      <select id="skuTrafficFilter">
        <option value="all" ${state.filters.traffic === 'all' ? 'selected' : ''}>Весь трафик</option>
        <option value="any" ${state.filters.traffic === 'any' ? 'selected' : ''}>Есть внешний трафик</option>
        <option value="kz" ${state.filters.traffic === 'kz' ? 'selected' : ''}>🚀 Только КЗ</option>
        <option value="vk" ${state.filters.traffic === 'vk' ? 'selected' : ''}>📣 Только VK</option>
        <option value="none" ${state.filters.traffic === 'none' ? 'selected' : ''}>Без внешнего трафика</option>
      </select>
      <select id="skuAssignmentFilter">
        <option value="all" ${state.filters.assignment === 'all' ? 'selected' : ''}>Все закрепления</option>
        <option value="assigned" ${state.filters.assignment === 'assigned' ? 'selected' : ''}>Закреплённые</option>
        <option value="unassigned" ${state.filters.assignment === 'unassigned' ? 'selected' : ''}>Незакреплённые</option>
      </select>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Артикул</th>
            <th>SKU</th>
            <th>Статус</th>
            <th>Owner</th>
            <th>Внешний трафик</th>
            <th>Следующее действие</th>
            <th>Дедлайн</th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="7" class="text-center muted">Ничего не найдено</td></tr>`}</tbody>
      </table>
    </div>

    <div class="footer-note">Белый бейдж артикулов оставила. Главная строка теперь читается как рабочий список, а не как длинный аналитический отчёт.</div>
  `;

  document.getElementById('skuSearchInput').addEventListener('input', (e) => { state.filters.search = e.target.value; renderSkuRegistry(); });
  document.getElementById('skuOwnerFilter').addEventListener('change', (e) => { state.filters.owner = e.target.value; renderSkuRegistry(); });
  document.getElementById('skuSegmentFilter').addEventListener('change', (e) => { state.filters.segment = e.target.value; renderSkuRegistry(); });
  document.getElementById('skuFocusFilter').addEventListener('change', (e) => { state.filters.focus = e.target.value; renderSkuRegistry(); });
  document.getElementById('skuTrafficFilter').addEventListener('change', (e) => { state.filters.traffic = e.target.value; renderSkuRegistry(); });
  document.getElementById('skuAssignmentFilter').addEventListener('change', (e) => { state.filters.assignment = e.target.value; renderSkuRegistry(); });
  root.querySelectorAll('[data-market-filter]').forEach((btn) => btn.addEventListener('click', (e) => { state.filters.market = e.currentTarget.dataset.marketFilter; renderSkuRegistry(); }));
}

function metricRow(label, value, kind = '') {
  return `<div class="metric-row"><span>${escapeHtml(label)}</span><strong class="${kind}">${value}</strong></div>`;
}

function renderSkuModal(articleKey) {
  const sku = getSku(articleKey);
  if (!sku) return;
  state.activeSku = articleKey;

  const body = document.getElementById('skuModalBody');
  const modal = document.getElementById('skuModal');
  const comments = getSkuComments(articleKey);
  const decisions = getSkuDecisions(articleKey);
  const tasks = getSkuControlTasks(articleKey);
  const activeTask = nextTaskForSku(articleKey);
  const owners = ownerOptions();

  body.innerHTML = `
    <div class="modal-head">
      <div>
        <div class="muted small">${escapeHtml(sku.brand || 'Алтея')} · ${escapeHtml(sku.segment || sku.category || '—')}</div>
        <h2>${escapeHtml(sku.name || 'Без названия')}</h2>
        <div class="badge-stack">${linkToSku(sku.articleKey, sku.article || sku.articleKey)}${skuOperationalStatus(sku)}${scoreChip(sku.focusScore || 0)}${trafficBadges(sku, 'нет')}</div>
      </div>
      <button class="btn ghost" data-close-modal>Закрыть</button>
    </div>

    <div class="kv-3">
      <div class="card subtle">
        <h3>Результат</h3>
        ${metricRow('План Feb 26', fmt.int(sku.planFact?.planFeb26Units))}
        ${metricRow('Факт Feb 26', fmt.int(sku.planFact?.factFeb26Units))}
        ${metricRow('Выполнение', fmt.pct(sku.planFact?.completionFeb26Pct), (sku.planFact?.completionFeb26Pct || 0) < 0.8 ? 'danger-text' : '')}
        ${metricRow('WB маржа', fmt.pct(sku.wb?.marginPct), (sku.wb?.marginPct || 0) < 0 ? 'danger-text' : '')}
        ${metricRow('Ozon маржа', fmt.pct(sku.ozon?.marginPct), (sku.ozon?.marginPct || 0) < 0 ? 'danger-text' : '')}
      </div>
      <div class="card subtle">
        <h3>Почему в фокусе</h3>
        ${metricRow('Owner', escapeHtml(ownerName(sku) || 'Не закреплён'))}
        ${metricRow('WB остаток', fmt.int(sku.wb?.stock), (sku.wb?.stock || 0) <= 50 ? 'warn-text' : '')}
        ${metricRow('Ozon остаток', fmt.int(sku.ozon?.stock), (sku.ozon?.stock || 0) <= 50 ? 'warn-text' : '')}
        ${metricRow('Возвраты WB', fmt.pct(sku.returns?.wbPct), (sku.returns?.wbPct || 0) >= 0.05 ? 'warn-text' : '')}
        ${metricRow('Возвраты Ozon', fmt.pct(sku.returns?.ozonPct), (sku.returns?.ozonPct || 0) >= 0.05 ? 'warn-text' : '')}
        <div class="note-box">${escapeHtml(sku.focusReasons || 'Нет явной причины в текущем срезе.')}</div>
      </div>
      <div class="card subtle">
        <h3>Что делаем</h3>
        <div class="badge-stack">${activeTask ? taskPriorityBadge(activeTask) : ''}${activeTask ? taskStatusBadge(activeTask) : ''}${activeTask ? taskTypeBadge(activeTask) : ''}</div>
        <div class="note-box">${escapeHtml(activeTask?.nextAction || 'Активной задачи пока нет.')}</div>
        <div class="metric-row"><span>Следующий срок</span><strong>${escapeHtml(activeTask?.due || '—')}</strong></div>
        <div class="metric-row"><span>Внешний трафик</span><strong>${sku?.flags?.hasExternalTraffic ? 'Есть' : 'Нет'}</strong></div>
      </div>
    </div>

    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <h3>Задачи по SKU</h3>
        <div class="list">${tasks.length ? tasks.map(renderTaskCard).join('') : '<div class="empty">По этому SKU задач ещё нет</div>'}</div>
      </div>
      <div class="card">
        <h3>Добавить задачу</h3>
        <form id="manualTaskForm" class="form-grid compact">
          <input type="hidden" name="articleKey" value="${escapeHtml(articleKey)}">
          <input name="title" placeholder="Что делаем" required>
          <select name="type">${Object.entries(TASK_TYPE_META).map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join('')}</select>
          <select name="priority">${Object.entries(PRIORITY_META).map(([value, meta]) => `<option value="${value}">${escapeHtml(meta.label)}</option>`).join('')}</select>
          <select name="platform">
            <option value="all">Все площадки</option>
            <option value="wb">WB</option>
            <option value="ozon">Ozon</option>
            <option value="wb+ozon">WB + Ozon</option>
          </select>
          <input name="owner" placeholder="Owner" value="${escapeHtml(ownerName(sku) || '')}">
          <input name="due" type="date" value="${plusDays(3)}">
          <textarea name="nextAction" rows="3" placeholder="Следующее действие и что считаем результатом"></textarea>
          <button class="btn primary" type="submit">Добавить задачу</button>
        </form>
      </div>
    </div>

    <div class="modal-grid-3">
      <div class="card">
        <div class="modal-section-title">
          <div>
            <h3>Owner и зона ответственности</h3>
            <p class="small muted">Закрепление по SKU и короткая пометка, если owner меняется.</p>
          </div>
          <span class="owner-badge">${escapeHtml(ownerName(sku) || 'Не закреплён')}</span>
        </div>
        <datalist id="skuOwnerList">${owners.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>
        <form id="ownerForm" class="form-grid compact">
          <input name="ownerName" list="skuOwnerList" placeholder="Кто owner" value="${escapeHtml(ownerName(sku) || '')}" required>
          <input name="ownerRole" placeholder="Роль / зона" value="${escapeHtml(sku?.owner?.registryStatus || 'Owner SKU')}">
          <textarea name="note" rows="3" placeholder="Что важно по закреплению / передаче SKU"></textarea>
          <button class="btn" type="submit">Сохранить owner</button>
        </form>
        <div class="team-note">Командный режим: ${escapeHtml(state.team.note || 'Локальный режим')}</div>
      </div>
      <div class="card">
        <div class="modal-section-title">
          <div>
            <h3>Журнал решений</h3>
            <p class="small muted">То, что уже согласовали или ждёт подтверждения руководителя.</p>
          </div>
          ${badge(`${fmt.int(decisions.length)} записей`, decisions.length ? 'info' : '')}
        </div>
        <div class="small-stack">${decisions.length ? decisions.map((item) => `
          <div class="decision-item">
            <div class="head">
              <strong>${escapeHtml(item.title)}</strong>
              <div class="badge-stack">${taskStatusBadge(item)}${item.owner ? badge(item.owner, 'info') : ''}</div>
            </div>
            <div class="muted small">${escapeHtml(item.decision || 'Решение не заполнено')}</div>
            <div class="meta-line" style="margin-top:8px"><span class="muted small">Срок ${escapeHtml(item.due || '—')}</span><span class="muted small">${escapeHtml(item.createdBy || 'Команда')}</span></div>
          </div>
        `).join('') : '<div class="empty">Решений пока нет</div>'}</div>
      </div>
      <div class="card">
        <div class="modal-section-title">
          <div>
            <h3>Добавить решение</h3>
            <p class="small muted">Фиксируем не обсуждение, а итог: что решили, кто owner, какой срок.</p>
          </div>
        </div>
        <form id="decisionForm" class="form-grid compact">
          <input name="title" placeholder="Короткий заголовок решения" required>
          <input name="owner" placeholder="Кто ведёт решение" value="${escapeHtml(ownerName(sku) || '')}">
          <select name="status">${Object.entries(TASK_STATUS_META).map(([value, meta]) => `<option value="${value}" ${value === 'waiting_decision' ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select>
          <input name="due" type="date" value="${plusDays(3)}">
          <textarea name="decision" rows="4" placeholder="Что именно решили / что ещё нужно подтвердить" required></textarea>
          <button class="btn" type="submit">Сохранить решение</button>
        </form>
      </div>
    </div>

    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <h3>Комментарии и апдейты</h3>
        <div class="list">${comments.length ? comments.map((comment) => `
          <div class="comment-item">
            <div class="head"><strong>${escapeHtml(comment.author || 'Команда')}</strong><div class="badge-stack">${commentTypeChip(comment.type)}${badge(comment.team || 'Команда')}</div></div>
            <div class="muted small">${fmt.date(comment.createdAt)}</div>
            <p>${escapeHtml(comment.text)}</p>
          </div>
        `).join('') : '<div class="empty">Комментариев пока нет</div>'}</div>
      </div>
      <div class="card">
        <h3>Добавить апдейт</h3>
        <form id="commentForm" class="form-grid compact">
          <input type="hidden" name="articleKey" value="${escapeHtml(articleKey)}">
          <input name="author" placeholder="Кто пишет" value="${escapeHtml(state.team.member.name || ownerName(sku) || 'Команда')}" required>
          <select name="type">
            <option value="signal">Сигнал</option>
            <option value="risk">Риск</option>
            <option value="focus">Фокус</option>
            <option value="idea">Идея</option>
          </select>
          <textarea name="text" rows="5" placeholder="Коротко: что случилось, что делаем, что нужно от других" required></textarea>
          <button class="btn" type="submit">Сохранить апдейт</button>
        </form>
      </div>
    </div>
  `;

  modal.classList.add('open');

  body.querySelector('#manualTaskForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await createManualTask({
      articleKey,
      title: form.get('title'),
      type: form.get('type'),
      priority: form.get('priority'),
      platform: form.get('platform'),
      owner: form.get('owner'),
      due: form.get('due'),
      nextAction: form.get('nextAction')
    });
    renderSkuModal(articleKey);
    rerenderCurrentView();
  });

  body.querySelector('#ownerForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await upsertOwnerAssignment({
      articleKey,
      ownerName: form.get('ownerName'),
      ownerRole: form.get('ownerRole'),
      note: form.get('note')
    });
    renderSkuModal(articleKey);
    rerenderCurrentView();
  });

  body.querySelector('#decisionForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await createDecision({
      articleKey,
      title: form.get('title'),
      decision: form.get('decision'),
      owner: form.get('owner'),
      status: form.get('status'),
      due: form.get('due')
    });
    renderSkuModal(articleKey);
    rerenderCurrentView();
  });

  body.querySelector('#commentForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await createComment({
      articleKey,
      author: form.get('author'),
      team: teamMemberLabel(),
      type: form.get('type'),
      text: form.get('text')
    });
    renderSkuModal(articleKey);
  });
}

function renderLaunches() {
  const root = document.getElementById('view-launches');
  const rows = (state.launches || []).map((item) => `
    <div class="list-item">
      <div class="head">
        <div>
          <strong>${escapeHtml(item.name || 'Новинка')}</strong>
          <div class="muted small">${escapeHtml(item.reportGroup || '—')} · ${escapeHtml(item.subCategory || '—')}</div>
        </div>
        ${badge(item.launchMonth || '—', 'info')}
      </div>
      <div class="badge-stack">${badge(item.tag || 'новинка')}${item.production ? badge(item.production) : ''}</div>
      <div class="muted small" style="margin-top:8px">${escapeHtml(item.status || 'Статус не указан')}</div>
      <div class="muted small" style="margin-top:8px">План выручки: ${fmt.money(item.plannedRevenue)} · Целевая себестоимость: ${fmt.money(item.targetCost)}</div>
    </div>
  `).join('');

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Новинки и pipeline</h2>
        <p>Отдельный слой под запуск, чтобы не терять связку карточка → контент → внешний трафик.</p>
      </div>
    </div>
    <div class="card">
      <div class="pipeline-strip">
        <span>Идея</span><span>PMR</span><span>Дизайн</span><span>Тест</span><span>Поставка</span><span>Карточка</span><span>Контент</span><span>Трафик</span>
      </div>
      <div class="list" style="margin-top:14px">${rows || '<div class="empty">Нет новинок в текущем срезе</div>'}</div>
    </div>
  `;
}

function renderMeetings() {
  const root = document.getElementById('view-meetings');
  const cards = (state.meetings || []).map((meeting) => {
    const level = String(meeting.id || '').startsWith('weekly') ? 'Weekly' : String(meeting.id || '').startsWith('monthly') ? 'Monthly' : 'PMR';
    const outputs = Array.isArray(meeting.outputs) ? meeting.outputs.join(' · ') : (meeting.outputs || '—');
    const participants = Array.isArray(meeting.participants) ? meeting.participants.join(', ') : '—';
    return `
      <div class="card meeting-card">
        <div class="head">
          <div>
            <h3>${escapeHtml(meeting.title || 'Встреча')}</h3>
            <div class="muted small">${escapeHtml(meeting.cadence || '—')} · ${escapeHtml(meeting.duration || '—')}</div>
          </div>
          ${badge(level)}
        </div>
        <p>${escapeHtml(meeting.question || '—')}</p>
        <div class="muted small"><strong>Участники:</strong> ${escapeHtml(participants)}</div>
        <div class="muted small" style="margin-top:8px"><strong>Выход:</strong> ${escapeHtml(outputs)}</div>
      </div>
    `;
  }).join('');

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Ритм работы</h2>
        <p>Weekly / Monthly / PMR должны рождать задачи с owner и сроком — без этого портал не будет живым.</p>
      </div>
    </div>
    <div class="grid cards-2">${cards || '<div class="empty">Нет карты встреч</div>'}</div>
  `;
}


function getDocumentGroupsFiltered() {
  const search = String(state.docFilters.search || '').trim().toLowerCase();
  return (state.documents?.groups || [])
    .map((group) => ({
      ...group,
      items: (group.items || []).filter((item) => {
        const hay = [group.title, item.title, item.description, item.type, item.filename].filter(Boolean).join(' ').toLowerCase();
        if (state.docFilters.group !== 'all' && group.title !== state.docFilters.group) return false;
        if (search && !hay.includes(search)) return false;
        return true;
      })
    }))
    .filter((group) => group.items.length);
}

function renderDocuments() {
  const root = document.getElementById('view-documents');
  const groups = state.documents?.groups || [];
  const filteredGroups = getDocumentGroupsFiltered();
  const totalDocs = groups.reduce((acc, group) => acc + (group.items || []).length, 0);
  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Центр документов</h2>
        <p>Портал должен быть порталом: ключевые файлы вынесены кнопками, чтобы команда не искала их по чатам и почте.</p>
      </div>
      <div class="badge-stack">${badge(`${fmt.int(totalDocs)} файлов`, 'ok')}${badge('кнопки → документы', 'info')}</div>
    </div>

    <div class="banner">
      <div>📎</div>
      <div><strong>Сейчас документы лежат прямо в папке portal / library.</strong> Для боевого публичного домена лучше перевести эти ссылки на Google Drive / SharePoint с доступом по ролям, чтобы не делать рабочие xlsx публичными.</div>
    </div>

    <div class="filters docs-filters">
      <input id="docSearchInput" placeholder="Поиск по названию документа, назначению или типу…" value="${escapeHtml(state.docFilters.search)}">
      <select id="docGroupFilter">
        <option value="all">Все группы</option>
        ${groups.map((group) => `<option value="${escapeHtml(group.title)}" ${state.docFilters.group === group.title ? 'selected' : ''}>${escapeHtml(group.title)}</option>`).join('')}
      </select>
    </div>

    <div class="doc-groups">
      ${filteredGroups.map((group) => `
        <div class="card">
          <div class="section-subhead">
            <div>
              <h3>${escapeHtml(group.title)}</h3>
              <p class="small muted">Кнопки открывают локальные demo-файлы или могут быть заменены на рабочие ссылки.</p>
            </div>
            ${badge(`${fmt.int(group.items.length)} шт.`)}
          </div>
          <div class="doc-grid">
            ${group.items.map((item) => `
              <a class="doc-card" href="${escapeHtml(item.href)}" target="_blank" rel="noopener">
                <div class="doc-top"><span class="doc-type">${escapeHtml(item.type)}</span><span class="muted small">${escapeHtml(String(item.sizeMb || '0'))} MB</span></div>
                <strong>${escapeHtml(item.title)}</strong>
                <p>${escapeHtml(item.description || 'Рабочий файл')}</p>
                <span class="doc-action">Открыть файл →</span>
              </a>
            `).join('')}
          </div>
        </div>
      `).join('') || '<div class="empty">Ничего не найдено по фильтрам документов.</div>'}
    </div>
  `;

  document.getElementById('docSearchInput').addEventListener('input', (event) => {
    state.docFilters.search = event.target.value;
    renderDocuments();
  });
  document.getElementById('docGroupFilter').addEventListener('change', (event) => {
    state.docFilters.group = event.target.value;
    renderDocuments();
  });
}

function repricerModeMatches(row, platform, mode) {
  const wbChanged = Math.abs(numberOrZero(row?.wb?.recPrice) - numberOrZero(row?.wb?.currentPrice)) >= 1;
  const ozonChanged = Math.abs(numberOrZero(row?.ozon?.recPrice) - numberOrZero(row?.ozon?.currentPrice)) >= 1;
  const wbBelow = numberOrZero(row?.wb?.currentPrice) > 0 && numberOrZero(row?.wb?.minPrice) > 0 && numberOrZero(row?.wb?.currentPrice) < numberOrZero(row?.wb?.minPrice);
  const ozonBelow = numberOrZero(row?.ozon?.currentPrice) > 0 && numberOrZero(row?.ozon?.minPrice) > 0 && numberOrZero(row?.ozon?.currentPrice) < numberOrZero(row?.ozon?.minPrice);
  const wbMarginRisk = row?.wb?.marginNoAdsCurrentPct != null && row?.wb?.marginNoAdsMinPct != null && numberOrZero(row?.wb?.marginNoAdsCurrentPct) < numberOrZero(row?.wb?.marginNoAdsMinPct);
  const ozonMarginRisk = row?.ozon?.marginNoAdsCurrentPct != null && row?.ozon?.marginNoAdsMinPct != null && numberOrZero(row?.ozon?.marginNoAdsCurrentPct) < numberOrZero(row?.ozon?.marginNoAdsMinPct);
  const byPlatform = {
    wb: { changed: wbChanged, below: wbBelow, margin: wbMarginRisk },
    ozon: { changed: ozonChanged, below: ozonBelow, margin: ozonMarginRisk },
    all: { changed: wbChanged || ozonChanged, below: wbBelow || ozonBelow, margin: wbMarginRisk || ozonMarginRisk }
  };
  if (mode === 'all') return true;
  if (mode === 'changes') return byPlatform[platform || 'all'].changed;
  if (mode === 'below_min') return byPlatform[platform || 'all'].below;
  if (mode === 'margin_risk') return byPlatform[platform || 'all'].margin;
  return true;
}

function getFilteredRepricerRows() {
  const search = String(state.repricerFilters.search || '').trim().toLowerCase();
  const platform = state.repricerFilters.platform || 'all';
  const mode = state.repricerFilters.mode || 'changes';
  return (state.repricer?.rows || []).filter((row) => {
    const hay = [row.article, row.articleKey, row.name, row.legalEntity, row.status, row.tag, row?.wb?.strategy, row?.ozon?.strategy].filter(Boolean).join(' ').toLowerCase();
    if (search && !hay.includes(search)) return false;
    if (platform === 'wb' && numberOrZero(row?.wb?.currentPrice) <= 0) return false;
    if (platform === 'ozon' && numberOrZero(row?.ozon?.currentPrice) <= 0) return false;
    if (!repricerModeMatches(row, platform, mode)) return false;
    return true;
  });
}

function renderRepricerSide(title, side, sideKey) {
  if (!side || (!side.currentPrice && !side.recPrice && !side.strategy)) {
    return `<div class="repricer-side"><div class="repricer-side-head">${escapeHtml(title)}</div><div class="muted small">Нет данных по площадке.</div></div>`;
  }
  const changed = Math.abs(numberOrZero(side.recPrice) - numberOrZero(side.currentPrice)) >= 1;
  const belowMin = numberOrZero(side.currentPrice) > 0 && numberOrZero(side.minPrice) > 0 && numberOrZero(side.currentPrice) < numberOrZero(side.minPrice);
  const marginRisk = side.marginNoAdsCurrentPct != null && side.marginNoAdsMinPct != null && numberOrZero(side.marginNoAdsCurrentPct) < numberOrZero(side.marginNoAdsMinPct);
  return `
    <div class="repricer-side ${changed ? 'changed' : ''}">
      <div class="repricer-side-head">${escapeHtml(title)} ${changed ? '<span class="chip info">есть изменение</span>' : ''}</div>
      <div class="repricer-prices">
        <div><span>Текущая</span><strong>${fmt.money(side.currentPrice)}</strong></div>
        <div><span>Реком.</span><strong>${fmt.money(side.recPrice)}</strong></div>
        <div><span>Δ</span><strong>${side.changePct == null ? '—' : fmt.pct(side.changePct)}</strong></div>
      </div>
      <div class="badge-stack" style="margin-top:8px">
        ${badge(`min ${fmt.money(side.minPrice)}`, belowMin ? 'danger' : '')}
        ${badge(`base ${fmt.money(side.basePrice)}`)}
        ${side.newMarginPct == null ? '' : badge(`нов. маржа ${fmt.pct(side.newMarginPct)}`, numberOrZero(side.newMarginPct) < 0 ? 'danger' : 'ok')}
        ${marginRisk ? badge('маржа без рекламы ниже порога', 'warn') : ''}
      </div>
      <div class="muted small" style="margin-top:8px"><strong>${escapeHtml(side.strategy || 'Стратегия не определена')}</strong></div>
      <div class="muted small" style="margin-top:6px">${escapeHtml(side.reason || 'Причина не указана')}</div>
    </div>
  `;
}

function renderRepricer() {
  const root = document.getElementById('view-repricer');
  const summary = state.repricer?.summary || {};
  const rows = getFilteredRepricerRows();
  const cards = [
    { label: 'SKU в модели', value: summary.skuCount, hint: 'Алтея внутри актуального xlsx-репрайсера.' },
    { label: 'Изменения WB', value: summary.wbChangeCount, hint: 'SKU, где WB рекомендует сдвиг цены.' },
    { label: 'Изменения Ozon', value: summary.ozonChangeCount, hint: 'SKU, где Ozon рекомендует сдвиг цены.' },
    { label: 'Ниже min price', value: numberOrZero(summary.wbBelowMinCount) + numberOrZero(summary.ozonBelowMinCount), hint: 'Нужен приоритетный разбор min price.' },
    { label: 'Риск маржи', value: numberOrZero(summary.wbMarginRiskCount) + numberOrZero(summary.ozonMarginRiskCount), hint: 'Маржа без рекламы ниже порога.' },
    { label: 'Выравнивание цен MP', value: numberOrZero(summary.wbEqualizeCount) + numberOrZero(summary.ozonEqualizeCount), hint: 'Сработала логика follow / equalize между MP.' }
  ].map((card) => `
    <div class="card kpi control-card">
      <div class="label">${escapeHtml(card.label)}</div>
      <div class="value">${fmt.int(card.value)}</div>
      <div class="hint">${escapeHtml(card.hint)}</div>
    </div>
  `).join('');

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Репрайсер</h2>
        <p>Интегрировала Excel-репрайсер в портал как понятную витрину: здесь видно рекомендации по ценам, стратегии и причины без ковыряния в формулах.</p>
      </div>
      <div class="quick-actions">
        <a class="quick-chip anchor-chip" href="library/repricer_2026_03_27.xlsx" target="_blank" rel="noopener">Скачать текущий xlsx</a>
        <a class="quick-chip anchor-chip" href="library/repricer_2026_03_20.xlsx" target="_blank" rel="noopener">Открыть прошлую версию</a>
      </div>
    </div>

    <div class="grid cards">${cards}</div>

    <div class="filters repricer-filters" style="margin-top:14px">
      <input id="repricerSearchInput" placeholder="Поиск по артикулу, названию, стратегии…" value="${escapeHtml(state.repricerFilters.search)}">
      <select id="repricerPlatformFilter">
        <option value="all" ${state.repricerFilters.platform === 'all' ? 'selected' : ''}>WB + Ozon</option>
        <option value="wb" ${state.repricerFilters.platform === 'wb' ? 'selected' : ''}>Только WB</option>
        <option value="ozon" ${state.repricerFilters.platform === 'ozon' ? 'selected' : ''}>Только Ozon</option>
      </select>
      <select id="repricerModeFilter">
        <option value="changes" ${state.repricerFilters.mode === 'changes' ? 'selected' : ''}>Только с изменением цены</option>
        <option value="below_min" ${state.repricerFilters.mode === 'below_min' ? 'selected' : ''}>Ниже min price</option>
        <option value="margin_risk" ${state.repricerFilters.mode === 'margin_risk' ? 'selected' : ''}>Риск маржи без рекламы</option>
        <option value="all" ${state.repricerFilters.mode === 'all' ? 'selected' : ''}>Все SKU в модели</option>
      </select>
    </div>

    <div class="repricer-stack">
      ${rows.slice(0, 24).map((row) => `
        <div class="card repricer-card">
          <div class="head">
            <div>
              <strong>${linkToSku(row.articleKey, row.article || row.articleKey)}</strong>
              <div class="muted small">${escapeHtml(row.name || 'Без названия')} · ${escapeHtml(row.legalEntity || '—')}</div>
            </div>
            <div class="badge-stack">${badge(row.status || '—')}${row.tag ? badge(row.tag, 'info') : ''}</div>
          </div>
          <div class="repricer-side-grid ${state.repricerFilters.platform !== 'all' ? 'single' : ''}">
            ${state.repricerFilters.platform !== 'ozon' ? renderRepricerSide('WB', row.wb, 'wb') : ''}
            ${state.repricerFilters.platform !== 'wb' ? renderRepricerSide('Ozon', row.ozon, 'ozon') : ''}
          </div>
        </div>
      `).join('') || '<div class="empty">По выбранным фильтрам репрайсер ничего не показал.</div>'}
    </div>
    ${rows.length > 24 ? `<div class="footer-note">Показаны первые 24 SKU из ${fmt.int(rows.length)}. Остальные доступны по фильтрам и поиску.</div>` : ''}
  `;

  document.getElementById('repricerSearchInput').addEventListener('input', (event) => {
    state.repricerFilters.search = event.target.value;
    renderRepricer();
  });
  document.getElementById('repricerPlatformFilter').addEventListener('change', (event) => {
    state.repricerFilters.platform = event.target.value;
    renderRepricer();
  });
  document.getElementById('repricerModeFilter').addEventListener('change', (event) => {
    state.repricerFilters.mode = event.target.value;
    renderRepricer();
  });
}

function getOrderCalcBase() {
  const sku = getSku(state.orderCalc.articleKey || state.skus[0]?.articleKey);
  if (!sku) return null;
  const scope = state.orderCalc.scope || 'all';
  const wbStock = numberOrZero(sku?.wb?.stock);
  const ozonStock = numberOrZero(sku?.ozon?.stockProducts ?? sku?.ozon?.stock);
  const autoInTransit = numberOrZero(sku?.ozon?.stockInTransit) + numberOrZero(sku?.ozon?.stockInSupplyRequest);
  const availableNow = scope === 'wb' ? wbStock : scope === 'ozon' ? ozonStock : wbStock + ozonStock;
  const ordersDaily = numberOrZero(sku?.orders?.units) / 27;
  const planDaily = Math.max(numberOrZero(sku?.planFact?.planApr26Units) / 30, numberOrZero(sku?.planFact?.planMar26Units) / 31);
  const factDaily = numberOrZero(sku?.planFact?.factFeb26Units) / 29;
  let dailySales = Math.max(ordersDaily, planDaily, factDaily);
  if (state.orderCalc.salesSource === 'orders') dailySales = ordersDaily;
  if (state.orderCalc.salesSource === 'plan') dailySales = Math.max(planDaily, factDaily);
  if (state.orderCalc.salesSource === 'manual') dailySales = numberOrZero(state.orderCalc.manualDailySales);

  const daysToNextReceipt = numberOrZero(state.orderCalc.daysToNextReceipt) || numberOrZero(sku?.leadTimeDays) || 30;
  const targetCoverAfter = numberOrZero(state.orderCalc.targetCoverAfter) || 30;
  const safetyDays = numberOrZero(state.orderCalc.safetyDays) || 7;
  const inbound = state.orderCalc.inboundManual === '' ? autoInTransit : numberOrZero(state.orderCalc.inboundManual);
  const totalHorizon = daysToNextReceipt + targetCoverAfter + safetyDays;
  const demandUnits = dailySales * totalHorizon;
  const rawOrderQty = Math.max(0, demandUnits - availableNow - inbound);
  const moq = Math.max(0, numberOrZero(state.orderCalc.moq));
  const packSize = Math.max(1, numberOrZero(state.orderCalc.packSize));
  let finalQty = rawOrderQty;
  if (finalQty > 0 && moq > 0) finalQty = Math.max(finalQty, moq);
  if (finalQty > 0) finalQty = Math.ceil(finalQty / packSize) * packSize;
  const coverageNowDays = dailySales > 0 ? availableNow / dailySales : null;
  const stockoutRisk = coverageNowDays != null && coverageNowDays < daysToNextReceipt;
  const summaryText = `${sku.article || sku.articleKey}: при скорости ${fmt.num(dailySales, 1)} шт./день, горизонте ${fmt.int(totalHorizon)} дн., наличии ${fmt.int(availableNow)} шт. и входящем запасе ${fmt.int(inbound)} шт. рекомендованный заказ = ${fmt.int(finalQty)} шт.`;
  return {
    sku,
    scope,
    availableNow,
    wbStock,
    ozonStock,
    autoInTransit,
    inbound,
    dailySales,
    ordersDaily,
    planDaily,
    factDaily,
    daysToNextReceipt,
    targetCoverAfter,
    safetyDays,
    totalHorizon,
    demandUnits,
    rawOrderQty,
    finalQty,
    coverageNowDays,
    stockoutRisk,
    summaryText
  };
}

function renderOrderCalculator() {
  const root = document.getElementById('view-order');
  const base = getOrderCalcBase();
  if (!base) {
    root.innerHTML = '<div class="empty">Нет SKU для расчёта заказа.</div>';
    return;
  }
  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Форма расчёта заказа товара</h2>
        <p>Здесь можно быстро прикинуть, сколько дозаказывать по SKU, чтобы дожить до следующего пополнения и ещё оставить целевой запас после прихода.</p>
      </div>
      <div class="badge-stack">${badge('формула = скорость × горизонт − наличие − входящие', 'info')}</div>
    </div>

    <div class="two-col order-layout">
      <div class="card">
        <h3>Параметры расчёта</h3>
        <form id="orderCalcForm" class="form-grid order-form">
          <label>
            <span>SKU</span>
            <select name="articleKey">
              ${state.skus.map((sku) => `<option value="${escapeHtml(sku.articleKey)}" ${base.sku.articleKey === sku.articleKey ? 'selected' : ''}>${escapeHtml(sku.article || sku.articleKey)} · ${escapeHtml((sku.name || '').slice(0, 80))}</option>`).join('')}
            </select>
          </label>
          <label>
            <span>Контур расчёта</span>
            <select name="scope">
              <option value="all" ${base.scope === 'all' ? 'selected' : ''}>Оба MP вместе</option>
              <option value="wb" ${base.scope === 'wb' ? 'selected' : ''}>Только WB shelf</option>
              <option value="ozon" ${base.scope === 'ozon' ? 'selected' : ''}>Только Ozon shelf</option>
            </select>
          </label>
          <label>
            <span>Источник скорости продаж</span>
            <select name="salesSource">
              <option value="hybrid" ${state.orderCalc.salesSource === 'hybrid' ? 'selected' : ''}>Авто = max(order rate, plan rate)</option>
              <option value="orders" ${state.orderCalc.salesSource === 'orders' ? 'selected' : ''}>Только заказы</option>
              <option value="plan" ${state.orderCalc.salesSource === 'plan' ? 'selected' : ''}>Только план</option>
              <option value="manual" ${state.orderCalc.salesSource === 'manual' ? 'selected' : ''}>Ввести вручную</option>
            </select>
          </label>
          <label>
            <span>Ручная скорость, шт./день</span>
            <input type="number" step="0.1" name="manualDailySales" value="${escapeHtml(state.orderCalc.manualDailySales)}" placeholder="Напр. 18.5">
          </label>
          <label>
            <span>Дней до следующего прихода</span>
            <input type="number" step="1" name="daysToNextReceipt" value="${escapeHtml(state.orderCalc.daysToNextReceipt)}" placeholder="По умолчанию lead time SKU">
          </label>
          <label>
            <span>Целевой запас после прихода, дней</span>
            <input type="number" step="1" name="targetCoverAfter" value="${escapeHtml(state.orderCalc.targetCoverAfter)}">
          </label>
          <label>
            <span>Safety stock, дней</span>
            <input type="number" step="1" name="safetyDays" value="${escapeHtml(state.orderCalc.safetyDays)}">
          </label>
          <label>
            <span>Входящий запас, шт.</span>
            <input type="number" step="1" name="inboundManual" value="${escapeHtml(state.orderCalc.inboundManual)}" placeholder="Пусто = подставить авто ${fmt.int(base.autoInTransit)}">
          </label>
          <label>
            <span>MOQ, шт.</span>
            <input type="number" step="1" name="moq" value="${escapeHtml(state.orderCalc.moq)}">
          </label>
          <label>
            <span>Кратность упаковки</span>
            <input type="number" step="1" name="packSize" value="${escapeHtml(state.orderCalc.packSize)}">
          </label>
          <button class="btn primary" type="submit">Пересчитать</button>
        </form>
        <div class="note-box">В этой версии скорость продаж считается по SKU в целом. Когда подключим раздельные daily sales WB/Ozon из рабочих файлов, добавим полноценный platform-level расчёт.</div>
      </div>

      <div class="card order-result-card">
        <h3>Результат</h3>
        <div class="order-result-grid">
          <div class="mini-kpi ${base.stockoutRisk ? 'danger' : ''}"><span>Наличие сейчас</span><strong>${fmt.int(base.availableNow)}</strong><span>WB ${fmt.int(base.wbStock)} · Ozon ${fmt.int(base.ozonStock)}</span></div>
          <div class="mini-kpi"><span>Скорость продаж</span><strong>${fmt.num(base.dailySales, 1)}</strong><span>шт./день</span></div>
          <div class="mini-kpi"><span>Горизонт</span><strong>${fmt.int(base.totalHorizon)}</strong><span>дней = приход + запас + safety</span></div>
          <div class="mini-kpi warn"><span>Рекомендованный заказ</span><strong>${fmt.int(base.finalQty)}</strong><span>шт. после MOQ и кратности</span></div>
        </div>
        <div class="metric-list" style="margin-top:14px">
          <div class="metric-row"><span>Order rate</span><strong>${fmt.num(base.ordersDaily, 1)} шт./день</strong></div>
          <div class="metric-row"><span>Plan rate</span><strong>${fmt.num(base.planDaily, 1)} шт./день</strong></div>
          <div class="metric-row"><span>Дней покрытия сейчас</span><strong>${base.coverageNowDays == null ? '—' : `${fmt.num(base.coverageNowDays, 1)} дн.`}</strong></div>
          <div class="metric-row"><span>Авто входящий запас</span><strong>${fmt.int(base.autoInTransit)} шт.</strong></div>
          <div class="metric-row"><span>Спрос на горизонт</span><strong>${fmt.int(base.demandUnits)} шт.</strong></div>
          <div class="metric-row"><span>Raw до округления</span><strong>${fmt.int(base.rawOrderQty)} шт.</strong></div>
        </div>
        <div class="note-box ${base.stockoutRisk ? 'warning-box' : ''}">${base.stockoutRisk ? 'Есть риск OOS до следующего прихода — текущего покрытия меньше, чем дней до пополнения.' : 'С текущими настройками SKU доживает до следующего прихода без явного OOS-риска.'}</div>
        <div class="copy-box">
          <strong>Короткое резюме:</strong>
          <div id="orderSummaryText" class="muted small" style="margin-top:6px">${escapeHtml(base.summaryText)}</div>
          <button class="btn small-btn" type="button" id="copyOrderSummaryBtn">Скопировать расчёт</button>
        </div>
      </div>
    </div>
  `;

  const form = document.getElementById('orderCalcForm');
  const sync = () => {
    const data = new FormData(form);
    state.orderCalc = {
      ...state.orderCalc,
      articleKey: String(data.get('articleKey') || ''),
      scope: String(data.get('scope') || 'all'),
      salesSource: String(data.get('salesSource') || 'hybrid'),
      manualDailySales: String(data.get('manualDailySales') || ''),
      daysToNextReceipt: String(data.get('daysToNextReceipt') || ''),
      targetCoverAfter: String(data.get('targetCoverAfter') || '30'),
      safetyDays: String(data.get('safetyDays') || '7'),
      inboundManual: String(data.get('inboundManual') || ''),
      packSize: String(data.get('packSize') || '1'),
      moq: String(data.get('moq') || '0')
    };
  };
  form.addEventListener('change', () => { sync(); renderOrderCalculator(); });
  form.addEventListener('submit', (event) => { event.preventDefault(); sync(); renderOrderCalculator(); });
  document.getElementById('copyOrderSummaryBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(base.summaryText);
      setAppError('Расчёт заказа скопирован в буфер обмена.');
      setTimeout(() => setAppError(''), 1600);
    } catch {
      setAppError('Не удалось скопировать расчёт. Скопируй текст вручную из блока резюме.');
    }
  });
}

function buildExecutiveModel() {
  const control = getControlSnapshot();
  const active = control.active;
  const overdue = control.overdue;
  const waiting = control.waitingDecision;
  const critical = active.filter((task) => task.priority === 'critical');
  const noOwnerTasks = active.filter((task) => !task.owner);
  const launchFocus = (state.launches || []).slice(0, 6);
  const unassignedSkus = state.skus.filter((sku) => !sku?.flags?.assigned).slice(0, 8);
  const categories = [
    { title: 'Цена / маржа', items: sortTasks(active.filter((task) => task.type === 'price_margin')).slice(0, 5), tone: 'danger' },
    { title: 'Supply / остатки', items: sortTasks(active.filter((task) => task.type === 'supply')).slice(0, 5), tone: 'warn' },
    { title: 'Внешний трафик', items: sortTasks(active.filter((task) => task.type === 'traffic')).slice(0, 5), tone: 'info' },
    { title: 'Закрепление / owner', items: sortTasks(active.filter((task) => task.type === 'assignment')).slice(0, 5), tone: 'warn' }
  ];
  return {
    control,
    active,
    overdue,
    waiting,
    critical,
    noOwnerTasks,
    launchFocus,
    unassignedSkus,
    categories,
    ceoList: sortTasks(active).filter((task) => isTaskOverdue(task) || task.status === 'waiting_decision' || task.priority === 'critical').slice(0, 12)
  };
}

function renderExecutive() {
  const root = document.getElementById('view-executive');
  const model = buildExecutiveModel();
  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Свод для руководителя</h2>
        <p>Финальный слой: сюда вынесены только задачи и алерты, которые реально требуют контроля, эскалации или решения по ресурсу.</p>
      </div>
      <div class="badge-stack">${badge(`${fmt.int(model.critical.length)} критично`, model.critical.length ? 'danger' : 'ok')}${badge(`${fmt.int(model.waiting.length)} ждут решения`, model.waiting.length ? 'warn' : 'ok')}</div>
    </div>

    <div class="kpi-strip">
      <div class="mini-kpi danger"><span>Активные задачи</span><strong>${fmt.int(model.active.length)}</strong><span>всего в контуре</span></div>
      <div class="mini-kpi danger"><span>Просрочено</span><strong>${fmt.int(model.overdue.length)}</strong><span>нужен апдейт / перенос</span></div>
      <div class="mini-kpi warn"><span>Критично по марже</span><strong>${fmt.int(model.critical.length)}</strong><span>цена и экономика</span></div>
      <div class="mini-kpi warn"><span>Ждут решения</span><strong>${fmt.int(model.waiting.length)}</strong><span>зависло на развилке</span></div>
      <div class="mini-kpi warn"><span>Без owner</span><strong>${fmt.int(model.noOwnerTasks.length)}</strong><span>в задачах</span></div>
      <div class="mini-kpi"><span>SKU без owner</span><strong>${fmt.int(model.unassignedSkus.length)}</strong><span>в бренде Алтея</span></div>
    </div>

    <div class="dashboard-grid-4" style="margin-top:14px">
      ${model.categories.map((group) => `
        <div class="card tone-${escapeHtml(group.tone)}">
          <div class="section-subhead">
            <div>
              <h3>${escapeHtml(group.title)}</h3>
              <p class="small muted">То, что нельзя терять из вида на уровне руководителя.</p>
            </div>
            ${badge(`${fmt.int(group.items.length)} шт.`, group.tone)}
          </div>
          <div class="list compact-list">
            ${group.items.length ? group.items.map((task) => renderMiniTask(task)).join('') : '<div class="empty">Нет активных алертов</div>'}
          </div>
        </div>
      `).join('')}
    </div>

    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>На личном контроле · 7 дней</h3>
            <p class="small muted">Просрочки, критичные задачи и вопросы, которые уже ждут решения.</p>
          </div>
          ${badge(`${fmt.int(model.ceoList.length)} в short-list`, 'danger')}
        </div>
        <div class="task-mini-grid">${model.ceoList.map(renderMiniTask).join('') || '<div class="empty">Нет эскалаций</div>'}</div>
      </div>

      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Новинки и незакреплённые SKU</h3>
            <p class="small muted">Два частых провала: запуск без сопровождения и товар без явного owner.</p>
          </div>
          ${badge(`${fmt.int(model.launchFocus.length)} новинок`, 'info')}
        </div>
        <div class="alert-stack">
          ${model.launchFocus.map((item) => `
            <div class="alert-row">
              <div>
                <strong>${escapeHtml(item.name || 'Новинка')}</strong>
                <div class="muted small">${escapeHtml(item.launchMonth || '—')} · ${escapeHtml(item.reportGroup || '—')}</div>
              </div>
              <div class="badge-stack">${badge(item.tag || 'новинка', 'info')}${item.production ? badge(item.production) : ''}</div>
              <div class="muted small">${escapeHtml(item.status || 'Статус не указан')}</div>
            </div>
          `).join('')}
          ${model.unassignedSkus.slice(0, 4).map((sku) => `
            <div class="alert-row">
              <div>
                <strong>${linkToSku(sku.articleKey, sku.article || sku.articleKey)}</strong>
                <div class="muted small">${escapeHtml(sku.name || 'Без названия')}</div>
              </div>
              <div class="badge-stack">${badge('Без owner', 'warn')}${skuOperationalStatus(sku)}</div>
              <div class="muted small">${escapeHtml(sku.focusReasons || 'Нужно закрепить ответственного и сценарий работы')}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

async function createComment(payload) {
  const comment = normalizeComment({
    id: uid('comment'),
    articleKey: payload.articleKey,
    author: String(payload.author || state.team.member.name || 'Команда').trim() || 'Команда',
    team: String(payload.team || teamMemberLabel()).trim() || 'Команда',
    createdAt: new Date().toISOString(),
    text: String(payload.text || '').trim(),
    type: String(payload.type || 'signal')
  });
  if (!comment.text) return;
  state.storage.comments.unshift(comment);
  saveLocalStorage();
  try {
    await persistComment(comment);
  } catch (error) {
    console.error(error);
  }
}

async function upsertOwnerAssignment(payload) {
  const override = normalizeOwnerOverride({
    articleKey: payload.articleKey,
    ownerName: payload.ownerName,
    ownerRole: payload.ownerRole,
    note: payload.note,
    updatedAt: new Date().toISOString(),
    assignedBy: state.team.member.name || 'Команда'
  });
  state.storage.ownerOverrides = (state.storage.ownerOverrides || []).filter((item) => item.articleKey !== override.articleKey);
  state.storage.ownerOverrides.unshift(override);
  applyOwnerOverridesToSkus();
  saveLocalStorage();
  try {
    await persistOwnerOverride(override);
  } catch (error) {
    console.error(error);
  }
}

async function createDecision(payload) {
  const decision = normalizeDecision({
    id: uid('decision'),
    articleKey: payload.articleKey,
    title: payload.title,
    decision: payload.decision,
    owner: payload.owner,
    status: payload.status,
    due: payload.due,
    createdAt: new Date().toISOString(),
    createdBy: state.team.member.name || 'Команда'
  });
  if (!decision.decision) return;
  state.storage.decisions.unshift(decision);
  saveLocalStorage();
  try {
    await persistDecision(decision);
  } catch (error) {
    console.error(error);
  }
}

async function createManualTask(payload) {
  const task = normalizeTask({
    id: uid('task'),
    source: 'manual',
    articleKey: payload.articleKey,
    title: String(payload.title || '').trim() || 'Новая задача',
    type: payload.type,
    priority: payload.priority,
    platform: payload.platform,
    owner: String(payload.owner || '').trim(),
    due: payload.due || plusDays(3),
    status: 'new',
    nextAction: String(payload.nextAction || '').trim()
  }, 'manual');
  state.storage.tasks.unshift(task);
  saveLocalStorage();
  try {
    await persistTask(task);
  } catch (error) {
    console.error(error);
  }
}

async function takeAutoTask(taskId) {
  const task = getAllTasks().find((item) => item.id === taskId);
  if (!task || task.source !== 'auto') return;
  const manual = normalizeTask({
    ...task,
    id: uid('task'),
    source: 'manual',
    status: 'in_progress',
    owner: task.owner || ownerName(getSku(task.articleKey)) || ''
  }, 'manual');
  state.storage.tasks.unshift(manual);
  saveLocalStorage();
  try {
    await persistTask(manual);
  } catch (error) {
    console.error(error);
  }
  rerenderCurrentView();
  if (state.activeSku === task.articleKey) renderSkuModal(task.articleKey);
}

async function updateTaskStatus(taskId, status) {
  const task = state.storage.tasks.find((item) => item.id === taskId);
  if (!task) return;
  task.status = mapTaskStatus(status);
  saveLocalStorage();
  try {
    await persistTask(task);
  } catch (error) {
    console.error(error);
  }
  rerenderCurrentView();
  if (state.activeSku === task.articleKey) renderSkuModal(task.articleKey);
}

function exportStorage() {
  const blob = new Blob([JSON.stringify(state.storage, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `altea-portal-storage-${todayIso()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importStorage(file) {
  if (!file) return;
  const text = await file.text();
  const data = JSON.parse(text);
  mergeImportedStorage(data);
  rerenderCurrentView();
  if (state.activeSku) renderSkuModal(state.activeSku);
}

function applyControlPreset(preset) {
  state.controlFilters.status = 'active';
  state.controlFilters.horizon = 'all';
  state.controlFilters.type = 'all';

  if (preset === 'overdue') {
    state.controlFilters.horizon = 'overdue';
  } else if (preset === 'no_owner') {
    state.controlFilters.horizon = 'no_owner';
  } else if (preset === 'critical') {
    state.controlFilters.type = 'price_margin';
  }
}

function closeSkuModal() {
  document.getElementById('skuModal').classList.remove('open');
  state.activeSku = null;
}

function openSkuModal(articleKey) {
  renderSkuModal(articleKey);
}

function setView(view) {
  state.activeView = view;
  document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === view));
  document.querySelectorAll('.view').forEach((section) => section.classList.toggle('active', section.id === `view-${view}`));
  rerenderCurrentView();
}

function rerenderCurrentView() {
  applyOwnerOverridesToSkus();
  renderDashboard();
  renderDocuments();
  renderRepricer();
  renderOrderCalculator();
  renderControlCenter();
  renderSkuRegistry();
  renderLaunches();
  renderMeetings();
  renderExecutive();
  updateSyncBadge();
}

function setAppError(message = '') {
  const banner = document.getElementById('appError');
  if (!message) {
    banner.classList.add('hidden');
    banner.textContent = '';
    return;
  }
  banner.textContent = message;
  banner.classList.remove('hidden');
}

function attachGlobalListeners() {
  document.querySelectorAll('.nav-btn').forEach((btn) => btn.addEventListener('click', () => setView(btn.dataset.view)));

  document.body.addEventListener('click', (event) => {
    const openBtn = event.target.closest('[data-open-sku]');
    if (openBtn) {
      openSkuModal(openBtn.dataset.openSku);
      return;
    }

    const closeBtn = event.target.closest('[data-close-modal]');
    if (closeBtn) {
      closeSkuModal();
      return;
    }

    const presetBtn = event.target.closest('[data-control-preset]');
    if (presetBtn) {
      applyControlPreset(presetBtn.dataset.controlPreset);
      setView('control');
      return;
    }

    if (event.target.closest('[data-view-control]')) {
      setView('control');
      return;
    }

    if (event.target.closest('[data-view-executive]')) {
      setView('executive');
      return;
    }

    const takeBtn = event.target.closest('[data-take-task]');
    if (takeBtn) {
      takeAutoTask(takeBtn.dataset.takeTask);
    }
  });

  document.body.addEventListener('change', (event) => {
    const statusSelect = event.target.closest('.task-status-select');
    if (statusSelect) {
      updateTaskStatus(statusSelect.dataset.taskId, statusSelect.value);
    }
  });

  document.getElementById('skuModal').addEventListener('click', (event) => {
    if (event.target.id === 'skuModal') closeSkuModal();
  });

  document.getElementById('exportStorageBtn').addEventListener('click', exportStorage);
  document.getElementById('pullRemoteBtn').addEventListener('click', async () => { await pullRemoteState(true); });
  document.getElementById('pushRemoteBtn').addEventListener('click', async () => { await pushStateToRemote(); });
  document.getElementById('importStorageInput').addEventListener('change', async (event) => {
    try {
      await importStorage(event.target.files?.[0]);
      event.target.value = '';
    } catch (error) {
      setAppError(`Не удалось импортировать JSON: ${error.message}`);
    }
  });
}

async function init() {
  try {
    const local = loadLocalStorage();
    const [dashboard, skus, launches, meetings, documents, repricer, seed] = await Promise.all([
      loadJson('data/dashboard.json'),
      loadJson('data/skus.json'),
      loadJson('data/launches.json'),
      loadJson('data/meetings.json'),
      loadJson('data/documents.json'),
      loadJson('data/repricer.json'),
      loadJson('data/seed_comments.json')
    ]);

    state.dashboard = dashboard;
    state.skus = skus;
    state.launches = launches;
    state.meetings = meetings;
    state.documents = documents;
    state.repricer = repricer;
    if (!state.orderCalc.articleKey) state.orderCalc.articleKey = skus[0]?.articleKey || '';
    if (!state.orderCalc.daysToNextReceipt) state.orderCalc.daysToNextReceipt = String(Math.round(numberOrZero(skus[0]?.leadTimeDays) || 30));
    state.storage = {
      comments: Array.isArray(local.comments) ? local.comments : [],
      tasks: Array.isArray(local.tasks) ? local.tasks : [],
      decisions: Array.isArray(local.decisions) ? local.decisions : [],
      ownerOverrides: Array.isArray(local.ownerOverrides) ? local.ownerOverrides : []
    };
    applyOwnerOverridesToSkus();
    mergeSeedStorage(seed);

    attachGlobalListeners();
    await initTeamStore();
    rerenderCurrentView();
    setView('dashboard');
    setAppError('');
  } catch (error) {
    console.error(error);
    setAppError(`Портал не смог загрузить данные: ${error.message}`);
  }
}

init();
