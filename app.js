(() => {
  const config = Object.assign(
    {
      organizationName: "Команда",
      appsScriptUrl: "",
      googleSheetUrl: "",
      googleSheetEmbedUrl: "",
      clearAfterSubmit: true,
      maxLocalReports: 40
    },
    window.APP_CONFIG || {}
  );

  const storage = {
    profile: "mgr-reports.profile.v2",
    draft: "mgr-reports.draft.v2",
    reports: "mgr-reports.reports.v2"
  };

  const els = {
    siteTitle: document.getElementById("siteTitle"),
    setupBanner: document.getElementById("setupBanner"),
    modeBadge: document.getElementById("modeBadge"),
    endpointStatusText: document.getElementById("endpointStatusText"),
    sheetStatusText: document.getElementById("sheetStatusText"),
    statusEndpoint: document.getElementById("statusEndpoint"),
    statusSheet: document.getElementById("statusSheet"),
    statusLink: document.getElementById("statusLink"),
    reportForm: document.getElementById("reportForm"),
    reportDate: document.getElementById("reportDate"),
    managerName: document.getElementById("managerName"),
    department: document.getElementById("department"),
    shift: document.getElementById("shift"),
    dayGoal: document.getElementById("dayGoal"),
    status: document.getElementById("status"),
    submitBtn: document.getElementById("submitBtn"),
    copyLastReportBtn: document.getElementById("copyLastReportBtn"),
    clearDraftBtn: document.getElementById("clearDraftBtn"),
    copyLinkBtn: document.getElementById("copyLinkBtn"),
    openSheetBtn: document.getElementById("openSheetBtn"),
    openSheetTopBtn: document.getElementById("openSheetTopBtn"),
    openManagerLinkBtn: document.getElementById("openManagerLinkBtn"),
    managerLinkPreview: document.getElementById("managerLinkPreview"),
    progressFill: document.getElementById("progressFill"),
    progressText: document.getElementById("progressText"),
    formMessage: document.getElementById("formMessage"),
    localReportsList: document.getElementById("localReportsList"),
    exportLocalCsvBtn: document.getElementById("exportLocalCsvBtn"),
    loadDemoBtn: document.getElementById("loadDemoBtn"),
    embedWrap: document.getElementById("embedWrap"),
    sheetEmbedFrame: document.getElementById("sheetEmbedFrame")
  };

  const profileFields = ["managerName", "department", "shift"];
  const copyableFields = [
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
    "comment"
  ];
  const requiredSelectors = [
    "[name='reportDate']",
    "[name='managerName']",
    "[name='department']",
    "[name='status']"
  ];

  init();

  function init() {
    if (els.siteTitle) {
      els.siteTitle.textContent = `${config.organizationName} — ежедневные отчёты менеджеров`;
      document.title = `${config.organizationName} — ежедневные отчёты`;
    }

    setTodayIfEmpty();
    applyProfileFromStorage();
    applyDraftFromStorage();
    applyQueryPrefill();
    renderConfigStatus();
    bindEvents();
    updateProgress();
    updateManagerLinkPreview();
    renderLocalReports();

    if (config.googleSheetEmbedUrl) {
      els.embedWrap.classList.remove("hidden");
      els.sheetEmbedFrame.src = config.googleSheetEmbedUrl;
    }
  }

  function bindEvents() {
    els.reportForm.addEventListener("submit", onSubmit);
    els.reportForm.addEventListener("input", handleFormChange);
    els.reportForm.addEventListener("change", handleFormChange);

    els.copyLastReportBtn.addEventListener("click", copyLastReport);
    els.copyLinkBtn.addEventListener("click", copyManagerLink);
    els.openManagerLinkBtn.addEventListener("click", openOwnManagerLink);
    els.clearDraftBtn.addEventListener("click", clearDraft);
    els.openSheetBtn.addEventListener("click", openSheet);
    els.openSheetTopBtn.addEventListener("click", openSheet);
    els.exportLocalCsvBtn.addEventListener("click", exportLocalCsv);
    els.loadDemoBtn.addEventListener("click", loadDemoData);
  }

  function handleFormChange() {
    saveProfile();
    saveDraft();
    updateProgress();
    updateManagerLinkPreview();
  }

  function setTodayIfEmpty() {
    if (!els.reportDate.value) {
      els.reportDate.value = new Date().toISOString().slice(0, 10);
    }
  }

  function applyProfileFromStorage() {
    const profile = readJson(storage.profile, {});
    for (const key of profileFields) {
      const field = els.reportForm.elements[key];
      if (field && profile[key] && !field.value) {
        field.value = profile[key];
      }
    }
  }

  function applyDraftFromStorage() {
    const draft = readJson(storage.draft, {});
    Object.entries(draft).forEach(([key, value]) => {
      const field = els.reportForm.elements[key];
      if (!field || value == null || field.value) return;
      field.value = value;
    });
  }

  function applyQueryPrefill() {
    const params = new URLSearchParams(window.location.search);
    const mapping = {
      manager: "managerName",
      department: "department",
      shift: "shift",
      goal: "dayGoal",
      status: "status"
    };

    Object.entries(mapping).forEach(([paramKey, fieldKey]) => {
      const paramValue = params.get(paramKey);
      const field = els.reportForm.elements[fieldKey];
      if (paramValue && field) {
        field.value = paramValue;
      }
    });

    const dateParam = params.get("date");
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      els.reportDate.value = dateParam;
    }
  }

  function renderConfigStatus() {
    const hasEndpoint = Boolean(config.appsScriptUrl && config.appsScriptUrl.includes("script.google.com"));
    const hasSheet = Boolean(config.googleSheetUrl);

    els.modeBadge.textContent = hasEndpoint ? "Боевой" : "Демо";
    els.modeBadge.classList.toggle("live", hasEndpoint);

    els.endpointStatusText.textContent = hasEndpoint ? "подключена" : "не подключена";
    els.sheetStatusText.textContent = hasSheet ? "указана" : "не указана";

    els.statusEndpoint.textContent = hasEndpoint ? "Готово к записи" : "Нужен URL Apps Script";
    els.statusSheet.textContent = hasSheet ? "Ссылка добавлена" : "Нужна ссылка на таблицу";
    els.statusLink.textContent = "Работает";

    if (!hasEndpoint) {
      showBanner(
        "Сейчас включён демо-режим: форма сохраняет отчёт только локально в браузере. Чтобы отправка шла в общую таблицу, заполните appsScriptUrl в config.js.",
        "warning"
      );
    } else if (!hasSheet) {
      showBanner(
        "Форма уже может отправлять отчёты в Google Sheet. Осталось добавить googleSheetUrl в config.js, чтобы кнопка руководителя открывала таблицу.",
        "success"
      );
    } else {
      showBanner(
        "Боевой режим включён: форма готова писать в таблицу, а руководитель может открыть общую Google Sheet.",
        "success"
      );
    }

    const sheetDisabled = !hasSheet;
    els.openSheetBtn.disabled = sheetDisabled;
    els.openSheetTopBtn.disabled = sheetDisabled;
  }

  async function onSubmit(event) {
    event.preventDefault();

    if (!els.reportForm.reportValidity()) {
      els.reportForm.reportValidity();
      showFormMessage("Проверьте обязательные поля.", "warning");
      return;
    }

    const payload = collectPayload();
    saveProfile();
    const localId = saveLocalReport(Object.assign({}, payload, {
      syncStatus: config.appsScriptUrl ? "pending" : "local"
    }));

    disableSubmit(true);
    showFormMessage(
      config.appsScriptUrl
        ? "Отправляю отчёт в Google Sheet…"
        : "Сохраняю локально. Чтобы писать в общую таблицу, добавьте appsScriptUrl в config.js.",
      config.appsScriptUrl ? "success" : "warning"
    );

    try {
      if (config.appsScriptUrl) {
        await submitViaHiddenForm(payload);
        updateLocalSyncStatus(localId, "sent");
        showFormMessage("Отчёт отправлен. Проверьте строку в общей таблице.", "success");
      } else {
        showFormMessage("Отчёт сохранён локально в браузере. Общая отправка пока не настроена.", "warning");
      }

      dropDraft();
      if (config.clearAfterSubmit) {
        clearNonProfileFields();
      }
    } catch (error) {
      updateLocalSyncStatus(localId, "pending");
      showFormMessage(
        "Не удалось подтвердить отправку. Локальная копия сохранена, можно повторить позже.",
        "error"
      );
      console.error(error);
    } finally {
      disableSubmit(false);
      renderLocalReports();
      updateProgress();
      updateManagerLinkPreview();
      setTodayIfEmpty();
    }
  }

  function collectPayload() {
    const formData = new FormData(els.reportForm);
    const payload = Object.fromEntries(formData.entries());

    payload.reportDate = payload.reportDate || new Date().toISOString().slice(0, 10);
    payload.submittedAtLocal = new Date().toISOString();
    payload.source = "github-pages";
    payload.pageUrl = window.location.href.split("#")[0];
    payload.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    payload.userAgent = navigator.userAgent;

    return payload;
  }

  function submitViaHiddenForm(payload) {
    return new Promise((resolve, reject) => {
      const targetName = `submit-frame-${Date.now()}`;
      const iframe = document.createElement("iframe");
      iframe.name = targetName;
      iframe.style.display = "none";

      const form = document.createElement("form");
      form.method = "POST";
      form.action = config.appsScriptUrl;
      form.target = targetName;
      form.style.display = "none";

      Object.entries(payload).forEach(([key, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = value == null ? "" : String(value);
        form.appendChild(input);
      });

      let settled = false;
      let submitted = false;
      const cleanup = () => {
        iframe.remove();
        form.remove();
      };

      const finish = (fn) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn();
      };

      const timeout = window.setTimeout(() => {
        finish(() => resolve({ ok: true, mode: "timeout-assumed" }));
      }, 2200);

      iframe.addEventListener("load", () => {
        if (!submitted) return;
        window.clearTimeout(timeout);
        finish(() => resolve({ ok: true, mode: "iframe-load" }));
      });

      document.body.appendChild(iframe);
      document.body.appendChild(form);

      try {
        submitted = true;
        form.submit();
      } catch (error) {
        window.clearTimeout(timeout);
        finish(() => reject(error));
      }
    });
  }

  function saveProfile() {
    const profile = {};
    for (const key of profileFields) {
      const field = els.reportForm.elements[key];
      if (field) profile[key] = field.value.trim();
    }
    writeJson(storage.profile, profile);
  }

  function saveDraft() {
    const data = Object.fromEntries(new FormData(els.reportForm).entries());
    writeJson(storage.draft, data);
  }

  function dropDraft() {
    localStorage.removeItem(storage.draft);
  }

  function clearDraft(showMessage = true) {
    dropDraft();
    clearNonProfileFields();
    setTodayIfEmpty();
    updateProgress();
    updateManagerLinkPreview();

    if (showMessage) {
      showFormMessage("Черновик очищен.", "warning");
    }
  }

  function clearNonProfileFields() {
    const keep = new Set(["reportDate", "managerName", "department", "shift"]);
    for (const element of Array.from(els.reportForm.elements)) {
      if (!element.name || keep.has(element.name)) continue;
      if (element.tagName === "SELECT") {
        element.selectedIndex = 0;
      } else if (element.type === "checkbox" || element.type === "radio") {
        element.checked = false;
      } else {
        element.value = "";
      }
    }
    els.status.value = "green";
  }

  function saveLocalReport(report) {
    const reports = readJson(storage.reports, []);
    const id = `report_${Date.now()}`;
    reports.unshift(Object.assign({ id }, report));
    const cropped = reports.slice(0, Math.max(1, Number(config.maxLocalReports) || 40));
    writeJson(storage.reports, cropped);
    return id;
  }

  function updateLocalSyncStatus(id, syncStatus) {
    const reports = readJson(storage.reports, []);
    const updated = reports.map((item) => (item.id === id ? Object.assign({}, item, { syncStatus }) : item));
    writeJson(storage.reports, updated);
  }

  function renderLocalReports() {
    const reports = readJson(storage.reports, []);
    if (!reports.length) {
      els.localReportsList.className = "report-list empty-state";
      els.localReportsList.textContent =
        "Пока ничего нет. После первой отправки здесь появится локальная карточка отчёта.";
      return;
    }

    els.localReportsList.className = "report-list";
    els.localReportsList.innerHTML = reports
      .map((item) => {
        const status = item.status || "green";
        const statusLabel = statusMap()[status] || "Статус не указан";
        const syncClass = item.syncStatus || "local";
        const syncLabel = syncMap()[syncClass] || "Локально";
        const summary = [
          item.completedTasks,
          item.blockers ? `Блокеры: ${item.blockers}` : "",
          item.tomorrowPlan ? `Завтра: ${item.tomorrowPlan}` : ""
        ]
          .filter(Boolean)
          .join("\n\n");

        return `
          <article class="report-card">
            <div class="report-top">
              <div class="report-meta">
                <h3>${escapeHtml(item.managerName || "Без имени")} · ${escapeHtml(item.department || "Без отдела")}</h3>
                <p>${formatDate(item.reportDate)} · ${escapeHtml(item.shift || "смена не указана")}</p>
              </div>
              <div>
                <div class="status-pill ${status}">${escapeHtml(statusLabel)}</div>
                <div style="height:8px"></div>
                <div class="sync-pill ${syncClass}">${escapeHtml(syncLabel)}</div>
              </div>
            </div>

            <div class="metrics">
              ${metricChip("Заказы", item.orders)}
              ${metricChip("Выручка", formatMoney(item.revenue))}
              ${metricChip("Лиды", item.leads)}
              ${metricChip("Звонки", item.calls)}
            </div>

            <div class="report-snippet">${escapeHtml(summary || "Текстовых комментариев нет.")}</div>
          </article>
        `;
      })
      .join("");
  }

  function copyLastReport() {
    const reports = readJson(storage.reports, []);
    if (!reports.length) {
      showFormMessage("Сначала нужен хотя бы один локальный отчёт.", "warning");
      return;
    }

    const last = reports[0];
    for (const key of copyableFields) {
      const field = els.reportForm.elements[key];
      if (field && last[key] != null) {
        field.value = last[key];
      }
    }

    showFormMessage("Подтянул данные из последнего локального отчёта.", "success");
    saveDraft();
    updateProgress();
  }

  function updateProgress() {
    const total = requiredSelectors.length + 8;
    let filled = 0;

    requiredSelectors.forEach((selector) => {
      const field = els.reportForm.querySelector(selector);
      if (field && String(field.value || "").trim()) filled += 1;
    });

    const bonusFields = [
      "dayGoal",
      "plannedTasks",
      "completedTasks",
      "blockers",
      "helpNeeded",
      "tomorrowPlan",
      "orders",
      "revenue"
    ];

    bonusFields.forEach((name) => {
      const field = els.reportForm.elements[name];
      if (field && String(field.value || "").trim()) filled += 1;
    });

    const percent = Math.min(100, Math.round((filled / total) * 100));
    els.progressFill.style.width = `${percent}%`;
    els.progressText.textContent = `${percent}%`;
  }

  function updateManagerLinkPreview() {
    const params = new URLSearchParams();
    const managerName = els.managerName.value.trim();
    const department = els.department.value.trim();
    const shift = els.shift.value.trim();

    if (managerName) params.set("manager", managerName);
    if (department) params.set("department", department);
    if (shift) params.set("shift", shift);

    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const finalUrl = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
    els.managerLinkPreview.value = finalUrl;
  }

  async function copyManagerLink() {
    updateManagerLinkPreview();
    try {
      await navigator.clipboard.writeText(els.managerLinkPreview.value);
      showFormMessage("Личная ссылка скопирована.", "success");
    } catch (error) {
      showFormMessage("Не получилось скопировать автоматически. Ссылка уже показана справа.", "warning");
    }
  }

  function openOwnManagerLink() {
    updateManagerLinkPreview();
    window.open(els.managerLinkPreview.value, "_blank", "noopener");
  }

  function openSheet() {
    if (!config.googleSheetUrl) {
      showFormMessage("Сначала добавьте googleSheetUrl в config.js.", "warning");
      return;
    }
    window.open(config.googleSheetUrl, "_blank", "noopener");
  }

  function exportLocalCsv() {
    const reports = readJson(storage.reports, []);
    if (!reports.length) {
      showFormMessage("Локальных отчётов пока нет.", "warning");
      return;
    }

    const headers = [
      "reportDate",
      "managerName",
      "department",
      "shift",
      "status",
      "dayGoal",
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
      "syncStatus"
    ];

    const rows = [
      headers.join(";"),
      ...reports.map((report) =>
        headers
          .map((key) => csvEscape(report[key]))
          .join(";")
      )
    ];

    downloadFile(rows.join("\n"), `manager-reports-${todayStamp()}.csv`, "text/csv;charset=utf-8;");
  }

  function loadDemoData() {
    const existing = readJson(storage.reports, []);
    if (existing.length) {
      showFormMessage("Демо не загрузил: локальная история уже есть.", "warning");
      return;
    }

    const demo = [
      {
        id: "demo_1",
        reportDate: todayDateOffset(-1),
        managerName: "Анна Смирнова",
        department: "Продажи",
        shift: "09:00–18:00",
        status: "green",
        leads: "18",
        calls: "31",
        meetings: "7",
        orders: "5",
        revenue: "128400",
        completedTasks: "Закрыла 5 заказов, обновила карточки клиентов, добила 2 зависших лида.",
        blockers: "Нет",
        tomorrowPlan: "Повторные касания по горячим лидам и сбор КП для опта.",
        syncStatus: "sent"
      },
      {
        id: "demo_2",
        reportDate: todayDateOffset(-1),
        managerName: "Екатерина Лебедева",
        department: "Маркетплейсы",
        shift: "10:00–19:00",
        status: "yellow",
        leads: "0",
        calls: "6",
        meetings: "3",
        orders: "12",
        revenue: "76400",
        completedTasks: "Проверила остатки и цены, выгрузила фото на 8 SKU.",
        blockers: "Задержка по поставке ткани на новинки.",
        tomorrowPlan: "Пересчитать цены и добить SEO по 15 карточкам.",
        syncStatus: "local"
      }
    ];

    writeJson(storage.reports, demo);
    renderLocalReports();
    showFormMessage("Демо-данные загружены.", "success");
  }

  function showBanner(text, tone = "warning") {
    els.setupBanner.textContent = text;
    els.setupBanner.className = `banner ${tone}`;
  }

  function showFormMessage(text, tone = "success") {
    els.formMessage.textContent = text;
    els.formMessage.className = `form-message ${tone}`;
    els.formMessage.classList.remove("hidden");
  }

  function disableSubmit(flag) {
    els.submitBtn.disabled = flag;
    els.submitBtn.textContent = flag ? "Отправка…" : "Отправить отчёт";
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function metricChip(label, value) {
    if (value == null || value === "") return "";
    return `<span class="metric-chip">${escapeHtml(label)}: ${escapeHtml(String(value))}</span>`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDate(value) {
    if (!value) return "Дата не указана";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
  }

  function formatMoney(value) {
    if (value == null || value === "") return "";
    const number = Number(value);
    if (Number.isNaN(number)) return String(value);
    return new Intl.NumberFormat("ru-RU").format(number) + " ₽";
  }

  function csvEscape(value) {
    const raw = String(value == null ? "" : value).replaceAll('"', '""');
    return `"${raw}"`;
  }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function todayStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  function todayDateOffset(offsetDays) {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    return date.toISOString().slice(0, 10);
  }

  function statusMap() {
    return {
      green: "Зелёный",
      yellow: "Жёлтый",
      red: "Красный"
    };
  }

  function syncMap() {
    return {
      sent: "Отправлен в таблицу",
      local: "Только локально",
      pending: "Нужно проверить"
    };
  }
})();
