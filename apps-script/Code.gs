const SPREADSHEET_ID = ""; // можно оставить пустым, если скрипт привязан к Google Sheet

const SHEETS = {
  reports: "ManagerReports",
  tasks: "TaskStatuses",
  articles: "ArticleFacts",
  actions: "ActionJournal"
};

const REPORT_HEADERS = [
  "serverTimestamp",
  "reportId",
  "reportDate",
  "managerName",
  "channel",
  "department",
  "overallStatus",
  "dayFocus",
  "packNo",
  "packCount",
  "packSize",
  "monthKey",
  "planOrders",
  "factOrders",
  "planMargin",
  "factMargin",
  "planRevenue",
  "factRevenue",
  "numbersComment",
  "doneSummary",
  "blockers",
  "helpNeeded",
  "tomorrowFocus",
  "source",
  "pageUrl",
  "submittedAtLocal",
  "timezone",
  "userAgent",
  "rawJson"
];

const TASK_HEADERS = [
  "serverTimestamp",
  "reportId",
  "reportDate",
  "managerName",
  "taskId",
  "taskTitle",
  "taskType",
  "taskStatus",
  "taskComment"
];

const ARTICLE_HEADERS = [
  "serverTimestamp",
  "reportId",
  "reportDate",
  "managerName",
  "channel",
  "articleKey",
  "wbArticle",
  "sellerArticle",
  "name",
  "sourceStatus",
  "priorityBucket",
  "priorityReason",
  "managerTask",
  "sourceComment",
  "planDailyOrders",
  "planDailyMargin",
  "planDailyRevenue",
  "factOrders",
  "factMargin",
  "factRevenue",
  "workStatus",
  "comment"
];

const ACTION_HEADERS = [
  "serverTimestamp",
  "reportId",
  "reportDate",
  "managerName",
  "actionId",
  "time",
  "articleKey",
  "action",
  "result",
  "nextStep",
  "comment"
];

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({
      ok: true,
      service: "manager-journal-site-v6",
      timestamp: new Date().toISOString()
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);

    const payload = normalizePayload_(e);
    const spreadsheet = getSpreadsheet_();

    const reportsSheet = getOrCreateSheet_(spreadsheet, SHEETS.reports, REPORT_HEADERS);
    const tasksSheet = getOrCreateSheet_(spreadsheet, SHEETS.tasks, TASK_HEADERS);
    const articlesSheet = getOrCreateSheet_(spreadsheet, SHEETS.articles, ARTICLE_HEADERS);
    const actionsSheet = getOrCreateSheet_(spreadsheet, SHEETS.actions, ACTION_HEADERS);

    const timestamp = new Date();

    reportsSheet.appendRow([
      timestamp,
      payload.reportId,
      payload.reportDate,
      payload.managerName,
      payload.channel,
      payload.department,
      payload.overallStatus,
      payload.dayFocus,
      payload.packNo,
      payload.packCount,
      payload.packSize,
      payload.monthKey,
      payload.planOrders,
      payload.factOrders,
      payload.planMargin,
      payload.factMargin,
      payload.planRevenue,
      payload.factRevenue,
      payload.numbersComment,
      payload.doneSummary,
      payload.blockers,
      payload.helpNeeded,
      payload.tomorrowFocus,
      payload.source,
      payload.pageUrl,
      payload.submittedAtLocal,
      payload.timezone,
      payload.userAgent,
      payload.rawJson
    ]);

    payload.tasks.forEach(function(task) {
      tasksSheet.appendRow([
        timestamp,
        payload.reportId,
        payload.reportDate,
        payload.managerName,
        task.id || "",
        task.title || "",
        task.type || "",
        task.status || "",
        task.comment || ""
      ]);
    });

    payload.articles.forEach(function(article) {
      articlesSheet.appendRow([
        timestamp,
        payload.reportId,
        payload.reportDate,
        payload.managerName,
        payload.channel,
        article.key || "",
        article.wbArticle || "",
        article.sellerArticle || "",
        article.name || "",
        article.statusSource || "",
        article.priorityBucket || "",
        article.priorityReason || "",
        article.managerTask || "",
        article.sourceComment || "",
        article.planDailyOrders || "",
        article.planDailyMargin || "",
        article.planDailyRevenue || "",
        article.factOrders || "",
        article.factMargin || "",
        article.factRevenue || "",
        article.status || "",
        article.comment || ""
      ]);
    });

    payload.actions.forEach(function(action) {
      actionsSheet.appendRow([
        timestamp,
        payload.reportId,
        payload.reportDate,
        payload.managerName,
        action.id || "",
        action.time || "",
        action.articleKey || "",
        action.action || "",
        action.result || "",
        action.nextStep || "",
        action.comment || ""
      ]);
    });

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, reportId: payload.reportId }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(error) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    try {
      lock.releaseLock();
    } catch (error) {}
  }
}

function normalizePayload_(e) {
  const p = (e && e.parameter) ? e.parameter : {};

  return {
    reportId: p.reportId || Utilities.getUuid(),
    reportDate: p.reportDate || "",
    managerName: p.managerName || "",
    channel: p.channel || "",
    department: p.department || "",
    overallStatus: p.overallStatus || "",
    dayFocus: p.dayFocus || "",
    packNo: p.packNo || "",
    packCount: p.packCount || "",
    packSize: p.packSize || "",
    monthKey: p.monthKey || "",
    planOrders: p.planOrders || "",
    factOrders: p.factOrders || "",
    planMargin: p.planMargin || "",
    factMargin: p.factMargin || "",
    planRevenue: p.planRevenue || "",
    factRevenue: p.factRevenue || "",
    numbersComment: p.numbersComment || "",
    doneSummary: p.doneSummary || "",
    blockers: p.blockers || "",
    helpNeeded: p.helpNeeded || "",
    tomorrowFocus: p.tomorrowFocus || "",
    tasks: parseJsonSafe_(p.tasksJson, []),
    articles: parseJsonSafe_(p.articleFactsJson, []),
    actions: parseJsonSafe_(p.actionJournalJson, []),
    source: p.source || "",
    pageUrl: p.pageUrl || "",
    submittedAtLocal: p.submittedAtLocal || "",
    timezone: p.timezone || "",
    userAgent: p.userAgent || "",
    rawJson: p.rawJson || ""
  };
}

function getSpreadsheet_() {
  return SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

function getOrCreateSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }

  const hasHeaders = sheet.getLastRow() > 0;
  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function parseJsonSafe_(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}
