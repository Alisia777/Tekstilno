window.APP_CONFIG = {
  organizationName: "Текстильно",
  siteVersion: "v24-supply-pnl",
  storageMode: "shared-ready-v24",
  planDataUrl: "data/article-plan.json",
  historyDataUrl: "data/history-data.json",
  ninaDataUrl: "data/nina-cluster-dashboard.json",
  demoReportsUrl: "data/demo-reports.json",
  backend: {
    provider: "session",
    supabaseUrl: "",
    supabaseAnonKey: "",
    tables: {
      reports: "portal_activity_log",
      tasks: "portal_task_state",
      supplyManual: "portal_supply_manual",
      orders: "portal_order_requests"
    }
  }
};
