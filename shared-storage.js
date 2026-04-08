(function (global) {
  let rootWindow = global;
  try {
    if (global.top && global.top.location && global.top.location.origin === global.location.origin) {
      rootWindow = global.top;
    }
  } catch (error) {
    rootWindow = global;
  }

  const sessionStore = rootWindow.__TEKSTILNO_SESSION_STORE__ || (rootWindow.__TEKSTILNO_SESSION_STORE__ = {
    reports: [],
    tasks: [],
    supplyManual: [],
    orders: []
  });

  function createSharedStorage(config) {
    const backend = config?.backend || {};
    const provider = String(backend.provider || 'session');
    const tables = Object.assign({
      reports: 'portal_activity_log',
      tasks: 'portal_task_state',
      supplyManual: 'portal_supply_manual',
      orders: 'portal_order_requests'
    }, backend.tables || {});

    const remoteReady = provider === 'supabase' && Boolean(backend.supabaseUrl && backend.supabaseAnonKey);
    const restBase = remoteReady ? `${String(backend.supabaseUrl).replace(/\/$/, '')}/rest/v1` : '';
    const commonHeaders = remoteReady ? {
      apikey: backend.supabaseAnonKey,
      Authorization: `Bearer ${backend.supabaseAnonKey}`
    } : {};

    function descriptor() {
      if (remoteReady) {
        return {
          code: 'shared-supabase',
          label: 'shared-supabase',
          shared: true,
          note: 'Общий журнал и статусы пишутся в Supabase.'
        };
      }
      return {
        code: 'session-preview',
        label: 'session-preview',
        shared: false,
        note: 'Backend не подключён: записи живут только в текущей сессии браузера.'
      };
    }

    function buildQuery(params = {}) {
      const query = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        query.set(key, value);
      });
      const str = query.toString();
      return str ? `?${str}` : '';
    }

    async function restRequest(table, { method = 'GET', params = {}, body = null, prefer = null } = {}) {
      const headers = Object.assign({}, commonHeaders);
      if (method !== 'GET') headers['Content-Type'] = 'application/json';
      if (prefer) headers.Prefer = prefer;
      const response = await fetch(`${restBase}/${table}${buildQuery(params)}`, {
        method,
        headers,
        body: body == null ? undefined : JSON.stringify(body)
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(`Supabase ${response.status}: ${message.slice(0, 240)}`);
      }
      const text = await response.text();
      return text ? JSON.parse(text) : [];
    }

    function upsertSession(arrayName, item, keys) {
      const list = sessionStore[arrayName];
      const index = list.findIndex((entry) => keys.every((key) => String(entry[key] ?? '') === String(item[key] ?? '')));
      if (index >= 0) list[index] = Object.assign({}, list[index], item);
      else list.unshift(item);
      return item;
    }

    return {
      getDescriptor: descriptor,
      isShared() { return descriptor().shared; },
      async listTaskStates(workDate) {
        if (remoteReady) {
          return restRequest(tables.tasks, {
            params: {
              select: '*',
              work_date: `eq.${workDate}`,
              order: 'updated_at.desc'
            }
          });
        }
        return sessionStore.tasks.filter((item) => item.work_date === workDate);
      },
      async saveTaskState(payload) {
        if (remoteReady) {
          const rows = await restRequest(tables.tasks, {
            method: 'POST',
            params: { on_conflict: 'work_date,platform,seller_article' },
            body: [payload],
            prefer: 'resolution=merge-duplicates,return=representation'
          });
          return rows[0] || payload;
        }
        return upsertSession('tasks', payload, ['work_date', 'platform', 'seller_article']);
      },
      async listReports() {
        if (remoteReady) {
          return restRequest(tables.reports, {
            params: {
              select: '*',
              order: 'created_at.desc',
              limit: '200'
            }
          });
        }
        return [...sessionStore.reports].sort((a, b) => String(b.created_at || b.createdAt || '').localeCompare(String(a.created_at || a.createdAt || '')));
      },
      async saveReport(payload) {
        if (remoteReady) {
          const rows = await restRequest(tables.reports, {
            method: 'POST',
            body: [payload],
            prefer: 'return=representation'
          });
          return rows[0] || payload;
        }
        sessionStore.reports.unshift(payload);
        sessionStore.reports = sessionStore.reports.slice(0, 200);
        return payload;
      },
      async listSupplyManual() {
        if (remoteReady) {
          return restRequest(tables.supplyManual, {
            params: {
              select: '*',
              order: 'updated_at.desc',
              limit: '4000'
            }
          });
        }
        return [...sessionStore.supplyManual];
      },
      async saveSupplyManual(payload) {
        if (remoteReady) {
          const rows = await restRequest(tables.supplyManual, {
            method: 'POST',
            params: { on_conflict: 'snapshot_date,platform,seller_article,cluster_name' },
            body: [payload],
            prefer: 'resolution=merge-duplicates,return=representation'
          });
          return rows[0] || payload;
        }
        return upsertSession('supplyManual', payload, ['snapshot_date', 'platform', 'seller_article', 'cluster_name']);
      },
      async listOrderRequests() {
        if (remoteReady) {
          return restRequest(tables.orders, {
            params: {
              select: '*',
              order: 'created_at.desc',
              limit: '2000'
            }
          });
        }
        return [...sessionStore.orders].sort((a, b) => String(b.created_at || b.createdAt || '').localeCompare(String(a.created_at || a.createdAt || '')));
      },
      async saveOrderRequest(payload) {
        if (remoteReady) {
          const rows = await restRequest(tables.orders, {
            method: 'POST',
            body: [payload],
            prefer: 'return=representation'
          });
          return rows[0] || payload;
        }
        sessionStore.orders.unshift(payload);
        return payload;
      }
    };
  }

  global.createSharedStorage = createSharedStorage;
})(window);
