/**
 * Быстрый backend для HTML-формы на GitHub Pages.
 *
 * Вариант 1 — проще всего:
 *   Откройте нужную Google Sheet → Extensions → Apps Script
 *   Вставьте этот код в проект, привязанный к таблице
 *   Тогда SpreadsheetApp.getActiveSpreadsheet() заработает сразу
 *
 * Вариант 2 — standalone script:
 *   Вставьте ID таблицы в SPREADSHEET_ID
 */

const SPREADSHEET_ID = ""; // можно оставить пустым, если скрипт привязан к таблице
const SHEET_NAME = "DailyReports";

const HEADERS = [
  "serverTimestamp",
  "reportDate",
  "managerName",
  "department",
  "shift",
  "dayGoal",
  "status",
  "leads",
  "calls",
  "meetings",
  "orders",
  "revenue",
  "conversion",
  "plannedTasks",
  "completedTasks",
  "blockers",
  "helpNeeded",
  "tomorrowPlan",
  "comment",
  "submittedAtLocal",
  "source",
  "pageUrl",
  "timezone",
  "userAgent"
];

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({
      ok: true,
      message: "Apps Script endpoint is alive",
      sheet: SHEET_NAME,
      timestamp: new Date().toISOString()
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const sheet = getSheet_();
    ensureHeaders_(sheet);

    const payload = normalizePayload_(e);
    const row = HEADERS.map((header) => payload[header] || "");
    row[0] = new Date();

    sheet.appendRow(row);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        ok: false,
        error: String(error)
      }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    try {
      lock.releaseLock();
    } catch (error) {}
  }
}

function getSheet_() {
  const spreadsheet = SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet) {
    throw new Error("Не удалось открыть таблицу. Проверьте SPREADSHEET_ID или привязку скрипта к Google Sheet.");
  }

  return spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
    sheet.autoResizeColumns(1, HEADERS.length);
  }
}

function normalizePayload_(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  return {
    serverTimestamp: "",
    reportDate: params.reportDate || "",
    managerName: params.managerName || "",
    department: params.department || "",
    shift: params.shift || "",
    dayGoal: params.dayGoal || "",
    status: params.status || "",
    leads: params.leads || "",
    calls: params.calls || "",
    meetings: params.meetings || "",
    orders: params.orders || "",
    revenue: params.revenue || "",
    conversion: params.conversion || "",
    plannedTasks: params.plannedTasks || "",
    completedTasks: params.completedTasks || "",
    blockers: params.blockers || "",
    helpNeeded: params.helpNeeded || "",
    tomorrowPlan: params.tomorrowPlan || "",
    comment: params.comment || "",
    submittedAtLocal: params.submittedAtLocal || "",
    source: params.source || "github-pages",
    pageUrl: params.pageUrl || "",
    timezone: params.timezone || "",
    userAgent: params.userAgent || ""
  };
}
