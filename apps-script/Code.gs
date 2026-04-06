const SPREADSHEET_ID = ""; // Можно оставить пустым, если скрипт привязан к таблице.

const SHEETS = {
  managerReports: "ManagerReports",
  managerTasks: "ManagerTasks",
  managerArticles: "ManagerArticles",
  managerJournal: "ManagerJournal",
  clusterForms: "ClusterForms",
  clusterRows: "ClusterRows",
  eventLog: "EventLog"
};

function doGet(e) {
  const action = getParam_(e, "action");
  if (action === "getDashboard") {
    return handleGetDashboard_(e);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, message: "Apps Script is running" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const wrapper = readWrapper_(e);
    if (!wrapper || !wrapper.action) {
      return htmlResponse_("Пустой payload.");
    }

    if (wrapper.action === "submitManagerReport") {
      saveManagerReport_(wrapper.id || createId_("mr"), wrapper.payload || {});
      return htmlResponse_("Отчёт менеджера принят.");
    }

    if (wrapper.action === "submitClusterForm") {
      saveClusterForm_(wrapper.id || createId_("cf"), wrapper.payload || {});
      return htmlResponse_("Форма по кластерам принята.");
    }

    return htmlResponse_("Неизвестное действие.");
  } catch (error) {
    logEvent_("ERROR", "", error && error.stack ? error.stack : String(error));
    return htmlResponse_("Ошибка Apps Script: " + String(error));
  }
}

function handleGetDashboard_(e) {
  const callback = getParam_(e, "callback");
  const date = getParam_(e, "date");
  const days = Number(getParam_(e, "days") || 14);
  const payload = buildDashboardPayload_(date, days);
  const json = JSON.stringify(payload);

  if (callback) {
    return ContentService
      .createTextOutput(callback + "(" + json + ")")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function saveManagerReport_(id, payload) {
  const sheet = ensureSheet_(SHEETS.managerReports, [
    "id","submittedAt","reportDate","manager","channel","overallStatus","focus",
    "tasksDoneCount","tasksTotalCount","articleDoneCount","articleTotalCount","summary",
    "blockers","helpNeeded","tomorrowFocus","ordersFact","financeOrders","financeMargin",
    "financeRevenue","sourceSummary","payloadJson"
  ]);

  if (rowExistsById_(sheet, id)) {
    logEvent_("DUPLICATE_MANAGER_REPORT", id, payload.manager || "");
    return;
  }

  const submittedAt = new Date().toISOString();
  const summary = `${num_(payload.articleDoneCount)}/${num_(payload.articleTotalCount)} артикулов · ${num_(payload.tasksDoneCount)}/${num_(payload.tasksTotalCount)} задач`;
  const finance = payload.financeFact || {};

  sheet.appendRow([
    id,
    submittedAt,
    payload.reportDate || "",
    payload.manager || "",
    payload.channel || "",
    payload.overallStatus || "",
    payload.focus || "",
    num_(payload.tasksDoneCount),
    num_(payload.tasksTotalCount),
    num_(payload.articleDoneCount),
    num_(payload.articleTotalCount),
    summary,
    payload.blockers || "",
    payload.helpNeeded || "",
    payload.tomorrowFocus || "",
    num_(payload.ordersFact),
    num_(finance.orders),
    num_(finance.margin),
    num_(finance.revenue),
    payload.sourceSummary || "",
    JSON.stringify(payload)
  ]);

  saveManagerTasks_(id, payload);
  saveManagerArticles_(id, payload);
  saveManagerJournal_(id, payload);
  logEvent_("SUBMIT_MANAGER_REPORT", id, payload.manager || "");
}

function saveManagerTasks_(reportId, payload) {
  const tasksSheet = ensureSheet_(SHEETS.managerTasks, [
    "reportId","reportDate","manager","channel","taskKey","title","done","comment"
  ]);
  const tasks = payload.tasks || {};
  const keys = Object.keys(tasks);
  if (!keys.length) return;

  const rows = keys.map(function(taskKey) {
    const task = tasks[taskKey] || {};
    return [
      reportId,
      payload.reportDate || "",
      payload.manager || "",
      payload.channel || "",
      taskKey,
      task.title || "",
      truthyToText_(task.done),
      task.comment || ""
    ];
  });
  appendRows_(tasksSheet, rows);
}

function saveManagerArticles_(reportId, payload) {
  const articlesSheet = ensureSheet_(SHEETS.managerArticles, [
    "reportId","reportDate","manager","channel","sellerArticle","platformArticle","name",
    "priorityLabel","action","status","comment"
  ]);
  const articles = payload.packArticles || [];
  if (!articles.length) return;

  const rows = articles.map(function(article) {
    return [
      reportId,
      payload.reportDate || "",
      payload.manager || "",
      payload.channel || "",
      article.sellerArticle || "",
      article.platformArticle || "",
      article.name || "",
      article.priorityLabel || "",
      article.action || "",
      article.status || "",
      article.comment || ""
    ];
  });
  appendRows_(articlesSheet, rows);
}

function saveManagerJournal_(reportId, payload) {
  const journalSheet = ensureSheet_(SHEETS.managerJournal, [
    "reportId","reportDate","manager","channel","rowNo","article","action","result"
  ]);
  const journal = payload.journal || [];
  if (!journal.length) return;

  const rows = journal.map(function(row, index) {
    return [
      reportId,
      payload.reportDate || "",
      payload.manager || "",
      payload.channel || "",
      index + 1,
      row.article || "",
      row.action || "",
      row.result || ""
    ];
  });
  appendRows_(journalSheet, rows);
}

function saveClusterForm_(id, payload) {
  const sheet = ensureSheet_(SHEETS.clusterForms, [
    "id","submittedAt","reportDate","coordinator","channel","sellerArticle","platformArticle",
    "name","targetDays","mainWarehouseStock","platformStock","articleAction","rowCount",
    "summary","blockers","payloadJson"
  ]);

  if (rowExistsById_(sheet, id)) {
    logEvent_("DUPLICATE_CLUSTER_FORM", id, payload.coordinator || "");
    return;
  }

  const submittedAt = new Date().toISOString();
  const rows = payload.rows || [];
  const blockers = rows
    .filter(function(row) {
      return row.status === "draft" || row.status === "production" || row.status === "procurement";
    })
    .map(function(row) { return row.comment || ""; })
    .filter(String)
    .join("; ");
  const summary = `${rows.length} строк`;

  sheet.appendRow([
    id,
    submittedAt,
    payload.reportDate || "",
    payload.coordinator || "",
    payload.channel || "",
    payload.sellerArticle || "",
    payload.platformArticle || "",
    payload.name || "",
    num_(payload.targetDays),
    num_(payload.mainWarehouseStock),
    num_(payload.platformStock),
    payload.articleAction || "",
    rows.length,
    summary,
    blockers,
    JSON.stringify(payload)
  ]);

  saveClusterRows_(id, payload);
  logEvent_("SUBMIT_CLUSTER_FORM", id, payload.coordinator || "");
}

function saveClusterRows_(formId, payload) {
  const rowsSheet = ensureSheet_(SHEETS.clusterRows, [
    "formId","reportDate","coordinator","channel","sellerArticle","platformArticle","clusterName",
    "orders7d","avgDailyOrders","currentStock","inTransit","inProduction","inProcurement",
    "recommendedShipQty","plannedShipQty","turnoverDays","coverDaysTotal","eta","status","comment"
  ]);
  const rows = payload.rows || [];
  if (!rows.length) return;

  const values = rows.map(function(row) {
    return [
      formId,
      payload.reportDate || "",
      payload.coordinator || "",
      payload.channel || "",
      payload.sellerArticle || "",
      payload.platformArticle || "",
      row.clusterName || "",
      num_(row.orders7d),
      num_(row.avgDailyOrders),
      num_(row.currentStock),
      num_(row.inTransit),
      num_(row.inProduction),
      num_(row.inProcurement),
      num_(row.recommendedShipQty),
      num_(row.plannedShipQty),
      num_(row.turnoverDays),
      num_(row.coverDaysTotal),
      row.eta || "",
      row.status || "",
      row.comment || ""
    ];
  });
  appendRows_(rowsSheet, values);
}

function buildDashboardPayload_(targetDate, days) {
  const reportsSheet = ensureSheet_(SHEETS.managerReports, [
    "id","submittedAt","reportDate","manager","channel","overallStatus","focus",
    "tasksDoneCount","tasksTotalCount","articleDoneCount","articleTotalCount","summary",
    "blockers","helpNeeded","tomorrowFocus","ordersFact","financeOrders","financeMargin",
    "financeRevenue","sourceSummary","payloadJson"
  ]);
  const clustersSheet = ensureSheet_(SHEETS.clusterForms, [
    "id","submittedAt","reportDate","coordinator","channel","sellerArticle","platformArticle",
    "name","targetDays","mainWarehouseStock","platformStock","articleAction","rowCount",
    "summary","blockers","payloadJson"
  ]);

  const reports = readDashboardRows_(reportsSheet, "manager-report", targetDate, days, 21);
  const clusters = readDashboardRows_(clustersSheet, "cluster-form", targetDate, days, 16);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    reports: reports,
    clusters: clusters
  };
}

function readDashboardRows_(sheet, type, targetDate, days, payloadColumnIndexOneBased) {
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const rows = values.slice(1).map(function(row) {
    const payloadJson = row[payloadColumnIndexOneBased - 1] || "{}";
    let payload = {};
    try {
      payload = JSON.parse(payloadJson);
    } catch (error) {
      payload = {};
    }
    return {
      id: row[0] || "",
      submittedAt: row[1] || "",
      reportDate: row[2] || "",
      manager: type === "manager-report" ? (row[3] || "") : (row[3] || ""),
      channel: row[4] || "",
      summary: row[11] || row[13] || "",
      blockers: row[12] || row[14] || "",
      type: type,
      payload: payload
    };
  });

  const filtered = rows.filter(function(row) {
    return keepRowByDate_(row.reportDate, targetDate, days);
  });

  filtered.sort(function(a, b) {
    return String(b.submittedAt || "").localeCompare(String(a.submittedAt || ""));
  });
  return filtered.slice(0, 500);
}

function keepRowByDate_(reportDate, targetDate, days) {
  if (!reportDate) return true;
  if (targetDate && reportDate === targetDate) return true;
  if (!days) return true;

  const report = parseIsoDate_(reportDate);
  if (!report) return true;

  const base = targetDate ? parseIsoDate_(targetDate) : new Date();
  if (!base) return true;

  const diffMs = base.getTime() - report.getTime();
  const diffDays = diffMs / 86400000;
  return diffDays >= 0 && diffDays <= days;
}

function ensureSheet_(name, headers) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  } else {
    const existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    const same = headers.every(function(header, index) {
      return existing[index] === header;
    });
    if (!same) {
      sheet.clear();
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

function appendRows_(sheet, rows) {
  if (!rows || !rows.length) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function rowExistsById_(sheet, id) {
  if (!id || sheet.getLastRow() <= 1) return false;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat();
  return values.indexOf(id) !== -1;
}

function getSpreadsheet_() {
  if (SPREADSHEET_ID) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function readWrapper_(e) {
  if (!e) return null;
  const raw =
    (e.parameter && e.parameter.payload) ||
    (e.postData && e.postData.contents) ||
    "";

  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function htmlResponse_(message) {
  return HtmlService
    .createHtmlOutput(`<html><body style="font-family:Arial,sans-serif;font-size:14px;padding:12px;">${escapeHtml_(String(message || "OK"))}</body></html>`)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function logEvent_(action, id, meta) {
  const sheet = ensureSheet_(SHEETS.eventLog, ["timestamp","action","id","meta"]);
  sheet.appendRow([new Date().toISOString(), action || "", id || "", meta || ""]);
}

function getParam_(e, key) {
  return (e && e.parameter && e.parameter[key]) || "";
}

function num_(value) {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

function truthyToText_(value) {
  return value ? "Да" : "Нет";
}

function createId_(prefix) {
  return (prefix || "id") + "-" + new Date().getTime();
}

function parseIsoDate_(value) {
  if (!value) return null;
  const parts = String(value).split("-");
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function escapeHtml_(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
