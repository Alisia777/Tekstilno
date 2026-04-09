window.APP_CONFIG = {
  organizationName: "Текстильно",
  siteVersion: "v33-task-calendar",
  leaderName: "Вартан Борисович",
  storageMode: "shared-supabase",
  planDataUrl: "data/article-plan.json",
  historyDataUrl: "data/history-data.json",
  ninaDataUrl: "data/nina-cluster-dashboard.json",
  demoReportsUrl: "data/demo-reports.json",
  backend: {
    provider: "supabase",
    supabaseUrl: "https://wqmttzkrykrlyhiksnmo.supabase.co",
    supabasePublishableKey: "sb_publishable_BxaJ4TjGZIE7iF9w0Jl15g_7hGw4tXc",
    supabaseAnonKey: "sb_publishable_BxaJ4TjGZIE7iF9w0Jl15g_7hGw4tXc",
    tables: {
      reports: "portal_activity_log",
      tasks: "portal_task_state",
      supplyManual: "portal_supply_manual",
      orders: "portal_order_requests",
      comments: "portal_task_comments",
      history: "portal_entity_history"
    }
  }
};
