/**
 * Backend для GitHub Pages -> Google Sheets.
 *
 * Как работает в этой версии:
 * 1) Фронт отправляет POST в скрытый iframe, чтобы не упираться в CORS.
 * 2) Скрипт принимает payloadJson, раскладывает данные в 3 листа:
 *    - DailyReports
 *    - TaskStatusLog
 *    - ManagerActionsLog
 * 3) В ответ возвращается простая HTML-страница с ALLOWALL, чтобы iframe не блокировался.
 *
 * Разворачивать как Web app:
 * - Execute as: Me
 * - Who has access: Anyone
 */

const SPREADSHEET_ID = ""; // Можно оставить пустым, если скрипт привязан к таблице

const SHEET_NAMES = {
  REPORTS: "DailyReports",
  TASKS: "TaskStatusLog",
  ACTIONS: "ManagerActionsLog"
};

const REPORT_HEADERS = [
  "serverTimestamp",
  "reportId",
  "mode",
  "reportDate",
  "managerName",
  "department",
  "channel",
  "shift",
  "dayFocus",
  "overallStatus",
  "ordersPlan",
  "ordersFact",
  "ordersDeviation",
  "ordersDeviationPct",
  "marginPlan",
  "marginFact",
  "marginDeviation",
  "marginDeviationPct",
  "revenuePlan",
  "revenueFact",
  "revenueDeviation",
  "revenueDeviationPct",
  "numbersComment",
  "mainResult",
  "completedSummary",
  "blockers",
  "helpNeeded",
  "tomorrowPlan",
  "riskComment",
  "tasksDone",
  "tasksTotal",
  "actionsCount",
  "currentPlanSource",
  "currentTasksSource",
  "submittedAtLocal",
  "timezone",
  "pageUrl",
  "userAgent",
  "rawJson"
];

const TASK_HEADERS = [
  "serverTimestamp",
  "reportId",
  "reportDate",
  "managerName",
  "department",
  "channel",
  "taskId",
  "title",
  "category",
  "priority",
  "note",
  "expectedResult",
  "status",
  "comment",
  "manual"
];

const ACTION_HEADERS = [
  "serverTimestamp",
  "reportId",
  "reportDate",
  "managerName",
  "department",
  "channel",
  "actionId",
  "time",
  "type",
  "linkedTaskId",
  "description",
  "result",
  "nextStep"
];

function doGet() {
  return buildHtmlResponse_(true, "Manager journal endpoint is alive");
}

function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);

    const payload = parsePayload_(e);
    validatePayload_(payload);

    const spreadsheet = getSpreadsheet_();
    const reportsSheet = getOrCreateSheet_(spreadsheet, SHEET_NAMES.REPORTS, REPORT_HEADERS);
    const tasksSheet = getOrCreateSheet_(spreadsheet, SHEET_NAMES.TASKS, TASK_HEADERS);
    const actionsSheet = getOrCreateSheet_(spreadsheet, SHEET_NAMES.ACTIONS, ACTION_HEADERS);

    appendReportRow_(reportsSheet, payload);
    appendTaskRows_(tasksSheet, payload);
    appendActionRows_(actionsSheet, payload);

    return buildHtmlResponse_(true, `Saved ${payload.reportId}`);
  } catch (error) {
    return buildHtmlResponse_(false, String(error));
  } finally {
    try {
      lock.releaseLock();
    } catch (error) {}
  }
}

function parsePayload_(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  if (params.payloadJson) {
    return JSON.parse(params.payloadJson);
  }

  if (e && e.postData && e.postData.contents) {
    const contents = e.postData.contents;
    if (contents && contents.trim().charAt(0) === "{") {
      return JSON.parse(contents);
    }
  }

  throw new Error("payloadJson не найден");
}

function validatePayload_(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Пустой payload");
  }

  if (!payload.reportDate) {
    throw new Error("Не передана reportDate");
  }

  if (!payload.managerName) {
    throw new Error("Не передан managerName");
  }

  if (!payload.department) {
    throw new Error("Не передан department");
  }

  if (!payload.reportId) {
    payload.reportId = Utilities.getUuid();
  }
}

function getSpreadsheet_() {
  if (SPREADSHEET_ID) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }

  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw new Error("Не удалось открыть таблицу. Укажите SPREADSHEET_ID или привяжите скрипт к Google Sheet.");
  }
  return active;
}

function getOrCreateSheet_(spreadsheet, sheetName, headers) {
  const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  ensureHeaders_(sheet, headers);
  return sheet;
}

function ensureHeaders_(sheet, headers) {
  if (sheet.getLastRow() > 0) {
    return;
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight("bold")
    .setBackground("#eaf0ff");
  sheet.autoResizeColumns(1, headers.length);
}

function appendReportRow_(sheet, payload) {
  const timestamp = new Date();
  const kpis = payload.kpis || {};
  const orders = kpis.orders || {};
  const margin = kpis.margin || {};
  const revenue = kpis.revenue || {};
  const summary = payload.summary || {};
  const counters = payload.counters || {};
  const context = payload.context || {};
  const meta = payload.meta || {};

  const row = [
    timestamp,
    payload.reportId || "",
    payload.mode || "",
    payload.reportDate || "",
    payload.managerName || "",
    payload.department || "",
    payload.channel || "",
    payload.shift || "",
    payload.dayFocus || "",
    payload.overallStatus || "",
    nullable_(orders.plan),
    nullable_(orders.fact),
    nullable_(orders.deviation),
    nullable_(orders.deviationPct),
    nullable_(margin.plan),
    nullable_(margin.fact),
    nullable_(margin.deviation),
    nullable_(margin.deviationPct),
    nullable_(revenue.plan),
    nullable_(revenue.fact),
    nullable_(revenue.deviation),
    nullable_(revenue.deviationPct),
    kpis.numbersComment || "",
    summary.mainResult || "",
    summary.completedSummary || "",
    summary.blockers || "",
    summary.helpNeeded || "",
    summary.tomorrowPlan || "",
    summary.riskComment || "",
    nullable_(counters.tasksDone),
    nullable_(counters.tasksTotal),
    nullable_(counters.actionsCount),
    context.currentPlanSource || "",
    context.currentTasksSource || "",
    meta.submittedAtLocal || "",
    meta.timezone || "",
    meta.pageUrl || "",
    meta.userAgent || "",
    JSON.stringify(payload)
  ];

  sheet.appendRow(row);
}

function appendTaskRows_(sheet, payload) {
  const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
  if (!tasks.length) {
    return;
  }

  const timestamp = new Date();
  const rows = tasks.map((task) => [
    timestamp,
    payload.reportId || "",
    payload.reportDate || "",
    payload.managerName || "",
    payload.department || "",
    payload.channel || "",
    task.taskId || "",
    task.title || "",
    task.category || "",
    task.priority || "",
    task.note || "",
    task.expectedResult || "",
    task.status || "",
    task.comment || "",
    Boolean(task.manual)
  ]);

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, TASK_HEADERS.length).setValues(rows);
}

function appendActionRows_(sheet, payload) {
  const actions = Array.isArray(payload.actions) ? payload.actions : [];
  if (!actions.length) {
    return;
  }

  const timestamp = new Date();
  const rows = actions.map((action) => [
    timestamp,
    payload.reportId || "",
    payload.reportDate || "",
    payload.managerName || "",
    payload.department || "",
    payload.channel || "",
    action.actionId || "",
    action.time || "",
    action.type || "",
    action.linkedTaskId || "",
    action.description || "",
    action.result || "",
    action.nextStep || ""
  ]);

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, ACTION_HEADERS.length).setValues(rows);
}

function buildHtmlResponse_(ok, message) {
  const color = ok ? "#0e8f5b" : "#cc3b3b";
  const status = ok ? "OK" : "ERROR";
  const html = HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
      <body style="font-family:Arial,sans-serif;padding:24px;color:#182230;">
        <div style="max-width:520px;margin:0 auto;border:1px solid #d8dfeb;border-radius:16px;padding:20px;">
          <div style="font-weight:700;color:${color};margin-bottom:8px;">${status}</div>
          <div>${escapeHtml_(message)}</div>
        </div>
      </body>
    </html>
  `);
  html.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return html;
}

function nullable_(value) {
  return value === null || value === undefined ? "" : value;
}

function escapeHtml_(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
