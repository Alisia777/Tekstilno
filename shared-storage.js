(function (global) {
  const sessionStore = global.__TEKSTILNO_SESSION_STORE__ || (global.__TEKSTILNO_SESSION_STORE__ = {
    reports: [],
    tasks: [],
    supplyManual: [],
    orders: [],
    comments: [],
    history: []
  });

  function createSharedStorage(config) {
    const backend = config?.backend || {};
    const provider = String(backend.provider || 'session');
    const tables = Object.assign({
      reports: 'portal_activity_log',
      tasks: 'portal_task_state',
      supplyManual: 'portal_supply_manual',
      orders: 'portal_order_requests',
      comments: 'portal_task_comments',
      history: 'portal_entity_history'
    }, backend.tables || {});

    const publicKey = backend.supabasePublishableKey || backend.supabaseAnonKey || '';
    const remoteReady = provider === 'supabase' && Boolean(backend.supabaseUrl && publicKey);
    const restBase = remoteReady ? `${String(backend.supabaseUrl).replace(/\/$/, '')}/rest/v1` : '';
    const commonHeaders = remoteReady ? {
      apikey: publicKey,
      Authorization: `Bearer ${publicKey}`
    } : {};

    function descriptor() {
      if (remoteReady) {
        return {
          code: 'shared-supabase',
          label: 'shared-supabase',
          shared: true,
          note: 'Общий журнал, комментарии и история пишутся в Supabase.'
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
        return [...sessionStore.reports].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
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
        return [...sessionStore.orders].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
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
      },
      async listTaskComments(filter = {}) {
        if (remoteReady) {
          return restRequest(tables.comments, {
            params: {
              select: '*',
              work_date: filter.work_date ? `eq.${filter.work_date}` : undefined,
              platform: filter.platform ? `eq.${filter.platform}` : undefined,
              seller_article: filter.seller_article ? `eq.${filter.seller_article}` : undefined,
              order: 'created_at.desc',
              limit: String(filter.limit || 500)
            }
          });
        }
        return sessionStore.comments.filter((item) => {
          if (filter.work_date && item.work_date !== filter.work_date) return false;
          if (filter.platform && item.platform !== filter.platform) return false;
          if (filter.seller_article && item.seller_article !== filter.seller_article) return false;
          return true;
        });
      },
      async saveTaskComment(payload) {
        if (remoteReady) {
          const rows = await restRequest(tables.comments, {
            method: 'POST',
            body: [payload],
            prefer: 'return=representation'
          });
          return rows[0] || payload;
        }
        sessionStore.comments.unshift(payload);
        return payload;
      },
      async listHistory(filter = {}) {
        if (remoteReady) {
          return restRequest(tables.history, {
            params: {
              select: '*',
              work_date: filter.work_date ? `eq.${filter.work_date}` : undefined,
              platform: filter.platform ? `eq.${filter.platform}` : undefined,
              seller_article: filter.seller_article ? `eq.${filter.seller_article}` : undefined,
              manager_name: filter.manager_name ? `eq.${filter.manager_name}` : undefined,
              order: 'created_at.desc',
              limit: String(filter.limit || 500)
            }
          });
        }
        return sessionStore.history.filter((item) => {
          if (filter.work_date && item.work_date !== filter.work_date) return false;
          if (filter.platform && item.platform !== filter.platform) return false;
          if (filter.seller_article && item.seller_article !== filter.seller_article) return false;
          if (filter.manager_name && item.manager_name !== filter.manager_name) return false;
          return true;
        });
      }
    };
  }

  global.createSharedStorage = createSharedStorage;
})(window);
