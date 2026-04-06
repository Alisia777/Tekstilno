const SPREADSHEET_ID = ""; // Можно оставить пустым, если скрипт привязан к таблице.

const SHEETS = {
  managerSubmissions: "ManagerSubmissions",
  managerRows: "ManagerRows",
  clusterForms: "ClusterForms",
  clusterRows: "ClusterRows",
  eventLog: "EventLog"
};

function doGet(e) {
  const action = getParam_(e, "action");
  if (action === "getDashboard") {
    return getDashboard_(e);
  }

  return jsonOrJsonp_(e, {
    ok: true,
    message: "Apps Script is running"
  });
}

function doPost(e) {
  try {
    const wrapper = readPayload_(e);
    if (!wrapper || !wrapper.action) {
      return htmlResponse_("Пустой payload.");
    }

    if (wrapper.action === "submitManagerReport") {
      saveManagerReport_(wrapper.id || createId_("mgr"), wrapper.payload || {});
      return htmlResponse_("Пакет менеджера принят.");
    }

    if (wrapper.action === "submitClusterForm") {
      saveClusterForm_(wrapper.id || createId_("sup"), wrapper.payload || {});
      return htmlResponse_("Форма поставок принята.");
    }

    return htmlResponse_("Неизвестное действие.");
  } catch (error) {
    logEvent_("ERROR", "", error && error.stack ? error.stack : String(error));
    return htmlResponse_("Ошибка Apps Script: " + String(error));
  }
}

function getDashboard_(e) {
  const payload = {
    ok: true,
    generatedAt: new Date().toISOString(),
    managerSubmissions: readSheetObjects_(SHEETS.managerSubmissions),
    clusterForms: readSheetObjects_(SHEETS.clusterForms)
  };
  return jsonOrJsonp_(e, payload);
}

function saveManagerReport_(id, payload) {
  const sheet = ensureSheet_(SHEETS.managerSubmissions, [
    "id","submittedAt","reportDate","manager","channel","packLabel","articleCount","doneCount","blockedCount","helpCount","toSupplyCount","summary","dayComment","needHelp","payloadJson"
  ]);

  if (rowExistsById_(sheet, id)) {
    logEvent_("DUPLICATE_MANAGER", id, payload.manager || "");
    return;
  }

  sheet.appendRow([
    id,
    payload.submittedAt || new Date().toISOString(),
    payload.reportDate || "",
    payload.manager || "",
    payload.channel || "",
    payload.packLabel || "",
    num_(payload.articleCount),
    num_(payload.doneCount),
    num_(payload.blockedCount),
    num_(payload.helpCount),
    num_(payload.toSupplyCount),
    payload.sourceSummary || "",
    payload.dayComment || "",
    payload.needHelp || "",
    JSON.stringify(payload)
  ]);

  saveManagerRows_(id, payload);
  logEvent_("SUBMIT_MANAGER", id, payload.manager || "");
}

function saveManagerRows_(reportId, payload) {
  const rowsSheet = ensureSheet_(SHEETS.managerRows, [
    "reportId","reportDate","manager","channel","sellerArticle","platformArticle","name","priorityLabel","action","status","comment","planOrdersDay","factOrdersDay","planMarginIncomeDay","mpStock","coverageDays","supplyNeed"
  ]);
  const rows = payload.packArticles || [];
  if (!rows.length) return;

  const values = rows.map(function(row) {
    return [
      reportId,
      payload.reportDate || "",
      payload.manager || "",
      payload.channel || "",
      row.sellerArticle || "",
      row.platformArticle || "",
      row.name || "",
      row.priorityLabel || "",
      row.action || "",
      row.status || "",
      row.comment || "",
      num_(row.planOrdersDay),
      num_(row.factOrdersDay),
      num_(row.planMarginIncomeDay),
      num_(row.mpStock),
      num_(row.coverageDays),
      num_(row.supplyNeed)
    ];
  });
  appendRows_(rowsSheet, values);
}

function saveClusterForm_(id, payload) {
  const sheet = ensureSheet_(SHEETS.clusterForms, [
    "id","submittedAt","reportDate","coordinator","channel","sellerArticle","platformArticle","name","targetDays","mainWarehouseStock","platformStock","summary","blockersCount","payloadJson"
  ]);

  if (rowExistsById_(sheet, id)) {
    logEvent_("DUPLICATE_CLUSTER", id, payload.coordinator || "");
    return;
  }

  sheet.appendRow([
    id,
    payload.submittedAt || new Date().toISOString(),
    payload.reportDate || "",
    payload.coordinator || "",
    payload.channel || "",
    payload.sellerArticle || "",
    payload.platformArticle || "",
    payload.name || "",
    num_(payload.targetDays),
    num_(payload.mainWarehouseStock),
    num_(payload.platformStock),
    payload.sourceSummary || "",
    num_(payload.blockersCount),
    JSON.stringify(payload)
  ]);

  saveClusterRows_(id, payload);
  logEvent_("SUBMIT_CLUSTER", id, payload.coordinator || "");
}

function saveClusterRows_(formId, payload) {
  const rowsSheet = ensureSheet_(SHEETS.clusterRows, [
    "formId","reportDate","coordinator","channel","sellerArticle","platformArticle","clusterName","orders7d","avgDailyOrders","currentStock","recommendedShipQty","plannedShip","inTransit","inProduction","inPurchase","coverDaysTotal","eta","status","comment"
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
      num_(row.recommendedShipQty),
      num_(row.plannedShip),
      num_(row.inTransit),
      num_(row.inProduction),
      num_(row.inPurchase),
      num_(row.coverDaysTotal),
      row.eta || "",
      row.status || "",
      row.comment || ""
    ];
  });
  appendRows_(rowsSheet, values);
}

function jsonOrJsonp_(e, payload) {
  const callback = getParam_(e, "callback");
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

function readSheetObjects_(sheetName) {
  const sheet = openSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) return [];

  const values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) return [];

  const header = values[0];
  const rows = values.slice(1);
  return rows.map(function(row) {
    const obj = {};
    header.forEach(function(key, index) {
      obj[key] = row[index];
    });
    return obj;
  }).reverse();
}

function readPayload_(e) {
  if (!e || !e.postData || !e.postData.contents) return null;
  return JSON.parse(e.postData.contents);
}

function htmlResponse_(message) {
  return HtmlService
    .createHtmlOutput("<!doctype html><html><body style='font-family:Arial,sans-serif;padding:16px'>" + sanitize_(message) + "</body></html>")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function sanitize_(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getParam_(e, key) {
  return e && e.parameter ? e.parameter[key] : "";
}

function rowExistsById_(sheet, id) {
  if (!id || sheet.getLastRow() < 2) return false;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat();
  return values.indexOf(id) !== -1;
}

function ensureSheet_(name, header) {
  const spreadsheet = openSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
    sheet.appendRow(header);
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(header);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function appendRows_(sheet, rows) {
  if (!rows || !rows.length) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function openSpreadsheet_() {
  if (SPREADSHEET_ID) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function createId_(prefix) {
  return prefix + "_" + new Date().getTime() + "_" + Math.floor(Math.random() * 100000);
}

function num_(value) {
  const num = Number(value);
  return isFinite(num) ? num : "";
}

function logEvent_(type, entityId, message) {
  const sheet = ensureSheet_(SHEETS.eventLog, ["timestamp","type","entityId","message"]);
  sheet.appendRow([new Date().toISOString(), type, entityId || "", message || ""]);
}
