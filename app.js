(() => {
  "use strict";

  const CONFIG = Object.assign(
    {
      organizationName: "Команда",
      staticDataUrl: "data/daily-data.json",
      appsScriptUrl: "",
      googleSheetUrl: "",
      clearAfterRemoteSubmit: false,
      maxLocalReports: 60,
      storagePrefix: "manager_journal_site"
    },
    window.APP_CONFIG || {}
  );

  const STORAGE_KEYS = {
    draft: `${CONFIG.storagePrefix}:draft`,
    history: `${CONFIG.storagePrefix}:history`,
    profile: `${CONFIG.storagePrefix}:profile`
  };

  const STATUS_OPTIONS = [
    { value: "not_started", label: "Не начато" },
    { value: "in_progress", label: "В работе" },
    { value: "done", label: "Выполнено" },
    { value: "blocked", label: "Блокер" },
    { value: "moved", label: "Перенесено" }
  ];

  const ACTION_TYPES = [
    "Аналитика",
    "Карточки",
    "Цены / акции",
    "Реклама",
    "Остатки / поставки",
    "Отзывы / рейтинг",
    "Коммуникации",
    "Контроль маржи",
    "Прочее"
  ];

  const state = {
    tasks: [],
    actions: [],
    dailyData: null,
    contextKey: "",
    pendingRemoteReportId: "",
    autosaveTimer: null,
    reloadTimer: null,
    lastSavedAt: "",
    lastLoadedAt: "",
    currentPlanSourceText: "План не найден",
    currentTasksSourceText: "Задачи не найдены"
  };

  const refs = {};
  const numberFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
  const currencyFormatter = new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0
  });
  const percentFormatter = new Intl.NumberFormat("ru-RU", {
    style: "percent",
    maximumFractionDigits: 1
  });

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheRefs();
    applyBranding();
    setDefaultDate();
    applyProfileFromUrlAndStorage();
    bindEvents();
    updateManagerLinkPreview();
    updateSubmitModeUI();
    renderTasks();
    renderActions();
    renderHistory();
    loadDailyData()
      .catch((error) => {
        console.error(error);
        showBanner("warning", "Не удалось загрузить данные дня. Сайт продолжает работать в локальном режиме.");
      })
      .finally(() => {
        applyDraftIfMatches();
        if (!state.actions.length) {
          addActionEntry({ time: currentTimeValue() });
        }
        updateAllViews();
      });
  }

  function cacheRefs() {
    refs.siteTitle = document.getElementById("siteTitle");
    refs.statusBanner = document.getElementById("statusBanner");
    refs.dataSourceBadge = document.getElementById("dataSourceBadge");
    refs.planSourceBadge = document.getElementById("planSourceBadge");
    refs.submitSourceBadge = document.getElementById("submitSourceBadge");
    refs.autosaveBadge = document.getElementById("autosaveBadge");

    refs.reportForm = document.getElementById("reportForm");
    refs.reportDate = document.getElementById("reportDate");
    refs.managerName = document.getElementById("managerName");
    refs.department = document.getElementById("department");
    refs.channel = document.getElementById("channel");
    refs.shift = document.getElementById("shift");
    refs.dayFocus = document.getElementById("dayFocus");
    refs.overallStatus = document.getElementById("overallStatus");
    refs.managerLinkPreview = document.getElementById("managerLinkPreview");
    refs.sideManagerLinkPreview = document.getElementById("sideManagerLinkPreview");

    refs.ordersPlan = document.getElementById("ordersPlan");
    refs.ordersFact = document.getElementById("ordersFact");
    refs.marginPlan = document.getElementById("marginPlan");
    refs.marginFact = document.getElementById("marginFact");
    refs.revenuePlan = document.getElementById("revenuePlan");
    refs.revenueFact = document.getElementById("revenueFact");

    refs.ordersDeviation = document.getElementById("ordersDeviation");
    refs.marginDeviation = document.getElementById("marginDeviation");
    refs.revenueDeviation = document.getElementById("revenueDeviation");

    refs.ordersHeadline = document.getElementById("ordersHeadline");
    refs.marginHeadline = document.getElementById("marginHeadline");
    refs.revenueHeadline = document.getElementById("revenueHeadline");

    refs.ordersSubline = document.getElementById("ordersSubline");
    refs.marginSubline = document.getElementById("marginSubline");
    refs.revenueSubline = document.getElementById("revenueSubline");

    refs.tasksMatchBadge = document.getElementById("tasksMatchBadge");
    refs.planMatchBadge = document.getElementById("planMatchBadge");
    refs.tasksList = document.getElementById("tasksList");
    refs.actionsList = document.getElementById("actionsList");
    refs.historyList = document.getElementById("historyList");

    refs.numbersComment = document.getElementById("numbersComment");
    refs.mainResult = document.getElementById("mainResult");
    refs.completedSummary = document.getElementById("completedSummary");
    refs.blockers = document.getElementById("blockers");
    refs.helpNeeded = document.getElementById("helpNeeded");
    refs.tomorrowPlan = document.getElementById("tomorrowPlan");
    refs.riskComment = document.getElementById("riskComment");

    refs.formMessage = document.getElementById("formMessage");
    refs.submitBtn = document.getElementById("submitBtn");
    refs.submitFrame = document.getElementById("submitFrame");

    refs.summaryTasks = document.getElementById("summaryTasks");
    refs.summaryTasksNote = document.getElementById("summaryTasksNote");
    refs.summaryActions = document.getElementById("summaryActions");
    refs.summaryOrdersDelta = document.getElementById("summaryOrdersDelta");
    refs.summaryMarginDelta = document.getElementById("summaryMarginDelta");
    refs.lastSavedAt = document.getElementById("lastSavedAt");
  }

  function bindEvents() {
    document.addEventListener("click", handleDocumentClick);
    refs.reportForm.addEventListener("submit", handleSubmit);
    refs.reportForm.addEventListener("input", handleFormInput);
    refs.reportForm.addEventListener("change", handleFormInput);
    refs.submitFrame.addEventListener("load", handleSubmitFrameLoad);
  }

  function applyBranding() {
    if (refs.siteTitle) {
      refs.siteTitle.textContent = `${CONFIG.organizationName} — тетрадь менеджера`;
    }
  }

  function setDefaultDate() {
    if (!refs.reportDate.value) {
      refs.reportDate.value = formatDateForInput(new Date());
    }
  }

  function applyProfileFromUrlAndStorage() {
    const params = new URLSearchParams(window.location.search);
    const storedProfile = parseJson(localStorage.getItem(STORAGE_KEYS.profile), {});

    const profile = {
      managerName: params.get("manager") || storedProfile.managerName || "",
      department: params.get("department") || storedProfile.department || "",
      channel: params.get("channel") || storedProfile.channel || "",
      shift: params.get("shift") || storedProfile.shift || ""
    };

    if (profile.managerName) refs.managerName.value = profile.managerName;
    if (profile.department) refs.department.value = profile.department;
    if (profile.channel) refs.channel.value = profile.channel;
    if (profile.shift) refs.shift.value = profile.shift;
  }

  async function loadDailyData() {
    if (!CONFIG.staticDataUrl) {
      state.dailyData = { tasks: [], plans: [] };
      applyContextFromDailyData();
      return;
    }

    const response = await fetch(`${CONFIG.staticDataUrl}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Не удалось получить ${CONFIG.staticDataUrl}: ${response.status}`);
    }

    state.dailyData = await response.json();
    state.lastLoadedAt = new Date().toISOString();
    applyContextFromDailyData();
  }

  function applyContextFromDailyData() {
    const data = state.dailyData || { tasks: [], plans: [] };
    const contextKey = getCurrentContextKey();
    const sameContext = state.contextKey === contextKey;

    const matchedTasks = getMatchedTasks(data);
    const existingById = new Map(
      state.tasks
        .filter((task) => task.taskId)
        .map((task) => [task.taskId, task])
    );
    const manualTasks = sameContext ? state.tasks.filter((task) => task.manual) : [];

    const nextTasks = matchedTasks.map((task) => {
      const existing = existingById.get(task.taskId);
      return Object.assign({}, task, {
        status: existing ? existing.status : task.status || "not_started",
        comment: existing ? existing.comment : task.comment || "",
        manual: false
      });
    });

    state.tasks = nextTasks.concat(manualTasks);

    const matchedPlan = getMatchedPlan(data);
    if (matchedPlan) {
      refs.ordersPlan.value = matchedPlan.ordersPlan ?? "";
      refs.marginPlan.value = matchedPlan.marginPlan ?? "";
      refs.revenuePlan.value = matchedPlan.revenuePlan ?? "";
      state.currentPlanSourceText = matchedPlan.sourceLabel || "План из daily-data.json";
      refs.planMatchBadge.textContent = `план: ${matchedPlan.sourceLabel || "найден"}`;
      refs.planSourceBadge.textContent = "подгружен";
    } else {
      if (!sameContext) {
        refs.ordersPlan.value = "";
        refs.marginPlan.value = "";
        refs.revenuePlan.value = "";
      }
      state.currentPlanSourceText = "План не найден";
      refs.planMatchBadge.textContent = "план: нет записи на дату";
      refs.planSourceBadge.textContent = "не найден";
    }

    if (matchedTasks.length) {
      const taskSource = describeTaskSource(matchedTasks);
      state.currentTasksSourceText = taskSource;
      refs.tasksMatchBadge.textContent = `задачи: ${matchedTasks.length} шт`;
      refs.dataSourceBadge.textContent = taskSource;
    } else {
      state.currentTasksSourceText = "Задачи не найдены";
      refs.tasksMatchBadge.textContent = "задачи: нет записей";
      refs.dataSourceBadge.textContent = "нет задач";
    }

    refs.planSourceBadge.textContent = matchedPlan ? state.currentPlanSourceText : "не найден";
    state.contextKey = contextKey;

    const metaUpdated = data.meta && data.meta.updatedAt ? ` Последнее обновление: ${data.meta.updatedAt}.` : "";
    const planText = matchedPlan ? "План найден." : "План на выбранный день не найден.";
    const taskText = matchedTasks.length
      ? `Подобрано задач: ${matchedTasks.length}.`
      : "На этот день задач не найдено.";
    showBanner("info", `${taskText} ${planText}${metaUpdated}`);

    renderTasks();
    updateAllViews();
  }

  function describeTaskSource(tasks) {
    const exactManagerTasks = tasks.filter((task) => normalizeText(task.managerName) === normalizeText(refs.managerName.value));
    if (exactManagerTasks.length) {
      return `daily-data.json · ${exactManagerTasks.length} личн.`;
    }
    return "daily-data.json · общие";
  }

  function getMatchedTasks(data) {
    const tasks = Array.isArray(data.tasks) ? data.tasks : [];
    const byId = new Map();

    tasks
      .filter((task) => matchesContext(task))
      .sort((a, b) => scoreMatch(b) - scoreMatch(a))
      .forEach((task) => {
        const key = task.taskId || `${task.title || ""}|${task.note || ""}|${task.date || "*"}`;
        if (!byId.has(key)) {
          byId.set(
            key,
            Object.assign(
              {
                taskId: task.taskId || createId("task"),
                title: task.title || "Без названия",
                category: task.category || "Общее",
                priority: task.priority || "medium",
                note: task.note || "",
                expectedResult: task.expectedResult || "",
                managerName: task.managerName || "*",
                department: task.department || "*",
                channel: task.channel || "*",
                date: task.date || "*"
              },
              task
            )
          );
        }
      });

    return Array.from(byId.values());
  }

  function getMatchedPlan(data) {
    const plans = Array.isArray(data.plans) ? data.plans : [];
    const matched = plans
      .filter((plan) => matchesContext(plan))
      .sort((a, b) => scoreMatch(b) - scoreMatch(a));

    if (!matched.length) {
      return null;
    }

    const best = Object.assign({}, matched[0]);
    best.sourceLabel = buildPlanSourceLabel(best);
    return best;
  }

  function matchesContext(record) {
    const targetDate = refs.reportDate.value;
    const targetManager = refs.managerName.value;
    const targetDepartment = refs.department.value;
    const targetChannel = refs.channel.value;

    return (
      matchesRule(record.date, targetDate) &&
      matchesRule(record.managerName, targetManager) &&
      matchesRule(record.department, targetDepartment) &&
      matchesRule(record.channel, targetChannel)
    );
  }

  function scoreMatch(record) {
    const values = [
      { record: record.date, current: refs.reportDate.value, exact: 5, wildcard: 0 },
      { record: record.managerName, current: refs.managerName.value, exact: 4, wildcard: 1 },
      { record: record.department, current: refs.department.value, exact: 3, wildcard: 1 },
      { record: record.channel, current: refs.channel.value, exact: 2, wildcard: 1 }
    ];

    return values.reduce((total, entry) => {
      if (!entry.record || entry.record === "*") return total + entry.wildcard;
      return normalizeText(entry.record) === normalizeText(entry.current) ? total + entry.exact : total;
    }, 0);
  }

  function buildPlanSourceLabel(plan) {
    const chunks = ["daily-data.json"];
    if (plan.managerName && plan.managerName !== "*") {
      chunks.push(plan.managerName);
    } else {
      chunks.push("общий план");
    }
    return chunks.join(" · ");
  }

  function matchesRule(ruleValue, currentValue) {
    if (ruleValue === undefined || ruleValue === null || ruleValue === "" || ruleValue === "*") {
      return true;
    }
    return normalizeText(ruleValue) === normalizeText(currentValue);
  }

  function handleDocumentClick(event) {
    const commandButton = event.target.closest("[data-cmd]");
    if (commandButton) {
      const command = commandButton.dataset.cmd;
      if (command === "save-draft") saveDraftWithFeedback();
      if (command === "fill-last") fillFromLatestHistory();
      if (command === "open-sheet") openGoogleSheet();
      if (command === "copy-link") copyManagerLink();
      if (command === "reload-data") reloadDailyData();
      if (command === "add-task") addManualTask();
      if (command === "add-action") addActionEntry({ time: currentTimeValue() });
      if (command === "export-current") exportCurrentJson();
      if (command === "export-history") exportHistoryCsv();
      return;
    }

    const historyLoadButton = event.target.closest("[data-history-load]");
    if (historyLoadButton) {
      const reportId = historyLoadButton.dataset.historyLoad;
      loadSnapshotFromHistory(reportId);
      return;
    }

    const historyJsonButton = event.target.closest("[data-history-json]");
    if (historyJsonButton) {
      const reportId = historyJsonButton.dataset.historyJson;
      const report = getHistory().find((item) => item.reportId === reportId);
      if (report) {
        downloadTextFile(`report-${report.reportDate || "draft"}.json`, JSON.stringify(report, null, 2), "application/json");
      }
      return;
    }

    const deleteButton = event.target.closest("[data-delete-task]");
    if (deleteButton) {
      removeTask(deleteButton.dataset.deleteTask);
      return;
    }

    const deleteActionButton = event.target.closest("[data-delete-action]");
    if (deleteActionButton) {
      removeAction(deleteActionButton.dataset.deleteAction);
    }
  }

  function handleFormInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const id = target.id || "";
    const profileIds = ["reportDate", "managerName", "department", "channel", "shift"];
    const metricIds = ["ordersPlan", "ordersFact", "marginPlan", "marginFact", "revenuePlan", "revenueFact"];

    if (profileIds.includes(id)) {
      persistProfile();
      updateManagerLinkPreview();
      scheduleReloadDailyData();
    }

    if (metricIds.includes(id)) {
      updateMetrics();
    }

    if (
      [
        "reportDate",
        "managerName",
        "department",
        "channel",
        "shift",
        "dayFocus",
        "overallStatus",
        "numbersComment",
        "mainResult",
        "completedSummary",
        "blockers",
        "helpNeeded",
        "tomorrowPlan",
        "riskComment"
      ].includes(id)
    ) {
      updateAllViews();
      scheduleAutosave();
    } else {
      scheduleAutosave();
    }
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (!refs.reportForm.reportValidity()) {
      showFormMessage("warning", "Проверьте обязательные поля: дата, имя менеджера и отдел.");
      return;
    }

    const payload = buildPayload("submitted");
    saveSnapshotToHistory(payload);
    saveDraft(payload);
    renderHistory();

    if (!CONFIG.appsScriptUrl) {
      showFormMessage(
        "success",
        "Отчёт сохранён локально. Общая отправка пока не подключена — как только укажете Apps Script URL, эти же данные будут уходить и в Google Sheet."
      );
      showBanner("warning", "Локальная версия сохранена. Для общей отчётности нужно подключить Apps Script в config.js.");
      return;
    }

    submitPayloadToAppsScript(payload);
  }

  function handleSubmitFrameLoad() {
    if (!state.pendingRemoteReportId) {
      return;
    }

    const reportId = state.pendingRemoteReportId;
    state.pendingRemoteReportId = "";
    showFormMessage("success", "Отчёт отправлен в Google Sheet и сохранён локально.");
    showBanner("success", "Отправка в Google Sheet завершена.");
    updateSubmitModeUI();

    if (CONFIG.clearAfterRemoteSubmit) {
      clearNonProfileFields();
      saveDraft();
      renderTasks();
      renderActions();
      updateAllViews();
    }

    const history = getHistory();
    const match = history.find((item) => item.reportId === reportId);
    if (match) {
      match.remoteStatus = "sent";
      writeHistory(history);
      renderHistory();
    }
  }

  function submitPayloadToAppsScript(payload) {
    const transportForm = document.createElement("form");
    transportForm.method = "POST";
    transportForm.action = CONFIG.appsScriptUrl;
    transportForm.target = "submitFrame";
    transportForm.className = "hidden";

    const fields = {
      payloadJson: JSON.stringify(payload),
      reportId: payload.reportId,
      reportDate: payload.reportDate,
      managerName: payload.managerName,
      department: payload.department
    };

    Object.entries(fields).forEach(([name, value]) => {
      const input = document.createElement("textarea");
      input.name = name;
      input.value = value;
      transportForm.appendChild(input);
    });

    document.body.appendChild(transportForm);
    state.pendingRemoteReportId = payload.reportId;
    showFormMessage("info", "Пробую отправить отчёт в Google Sheet…");
    transportForm.submit();
    setTimeout(() => transportForm.remove(), 600);
  }

  function updateSubmitModeUI() {
    if (CONFIG.appsScriptUrl) {
      refs.submitSourceBadge.textContent = "Google Sheet + локальная копия";
      showFormMessage("info", "Apps Script подключён. После сдачи отчёт уйдёт в таблицу и останется в локальной истории.");
    } else {
      refs.submitSourceBadge.textContent = "только локально";
    }
  }

  function scheduleReloadDailyData() {
    window.clearTimeout(state.reloadTimer);
    state.reloadTimer = window.setTimeout(() => {
      reloadDailyData();
    }, 450);
  }

  function reloadDailyData() {
    loadDailyData().catch((error) => {
      console.error(error);
      showBanner("warning", "Не удалось обновить задачи и план из daily-data.json.");
    });
  }

  function addManualTask() {
    state.tasks.push({
      taskId: createId("task"),
      title: "",
      category: "Своя задача",
      priority: "medium",
      note: "",
      expectedResult: "",
      status: "not_started",
      comment: "",
      manual: true
    });
    renderTasks();
    scheduleAutosave();
    updateAllViews();
  }

  function removeTask(taskId) {
    state.tasks = state.tasks.filter((task) => task.taskId !== taskId);
    renderTasks();
    scheduleAutosave();
    updateAllViews();
  }

  function addActionEntry(seed = {}) {
    state.actions.push({
      actionId: createId("action"),
      time: seed.time || currentTimeValue(),
      type: seed.type || ACTION_TYPES[0],
      linkedTaskId: seed.linkedTaskId || "",
      description: seed.description || "",
      result: seed.result || "",
      nextStep: seed.nextStep || ""
    });
    renderActions();
    scheduleAutosave();
    updateAllViews();
  }

  function removeAction(actionId) {
    state.actions = state.actions.filter((action) => action.actionId !== actionId);
    renderActions();
    scheduleAutosave();
    updateAllViews();
  }

  function renderTasks() {
    refs.tasksList.innerHTML = "";

    if (!state.tasks.length) {
      refs.tasksList.innerHTML = '<div class="empty-state">На сегодня задачи ещё не загружены.</div>';
      return;
    }

    state.tasks.forEach((task) => {
      const card = document.createElement("article");
      card.className = "task-card";
      card.dataset.status = task.status || "not_started";

      const head = document.createElement("div");
      head.className = "task-head";

      const titleWrap = document.createElement("div");
      if (task.manual) {
        const titleField = createField("Задача", createInput("text", task.title || "", "Что нужно сделать"));
        titleField.querySelector("input").addEventListener("input", (event) => {
          task.title = event.target.value;
          scheduleAutosave();
        });

        const categoryField = createField("Категория", createInput("text", task.category || "", "Категория"));
        categoryField.querySelector("input").addEventListener("input", (event) => {
          task.category = event.target.value;
          scheduleAutosave();
        });

        const priorityField = createField("Приоритет", createPrioritySelect(task.priority || "medium"));
        priorityField.querySelector("select").addEventListener("change", (event) => {
          task.priority = event.target.value;
          scheduleAutosave();
        });

        titleWrap.appendChild(titleField);
        titleWrap.appendChild(categoryField);
        titleWrap.appendChild(priorityField);
      } else {
        const title = document.createElement("h3");
        title.className = "task-title";
        title.textContent = task.title || "Без названия";
        titleWrap.appendChild(title);

        const meta = document.createElement("div");
        meta.className = "task-meta";
        meta.appendChild(createBadge(task.category || "Общее", ""));
        meta.appendChild(createBadge(priorityLabel(task.priority), `priority-${task.priority || "medium"}`));
        titleWrap.appendChild(meta);
      }

      const right = document.createElement("div");
      if (task.manual) {
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "delete-btn";
        deleteButton.dataset.deleteTask = task.taskId;
        deleteButton.textContent = "Удалить";
        right.appendChild(deleteButton);
      } else {
        const statusBadge = createBadge(statusLabel(task.status), "");
        right.appendChild(statusBadge);
      }

      head.appendChild(titleWrap);
      head.appendChild(right);

      const body = document.createElement("div");
      body.className = "task-body";

      if (task.manual) {
        const noteField = createField("Пояснение / что проверить", createTextarea(task.note || "", "Короткое пояснение"));
        noteField.querySelector("textarea").addEventListener("input", (event) => {
          task.note = event.target.value;
          scheduleAutosave();
        });

        const resultField = createField("Ожидаемый результат", createTextarea(task.expectedResult || "", "Что должно получиться"));
        resultField.querySelector("textarea").addEventListener("input", (event) => {
          task.expectedResult = event.target.value;
          scheduleAutosave();
        });

        body.appendChild(noteField);
        body.appendChild(resultField);
      } else {
        if (task.note) {
          const note = document.createElement("div");
          note.className = "task-help";
          note.textContent = task.note;
          body.appendChild(note);
        }
        if (task.expectedResult) {
          const expected = document.createElement("div");
          expected.className = "task-help";
          expected.innerHTML = `<strong>Ожидаемый результат:</strong> ${escapeHtml(task.expectedResult)}`;
          body.appendChild(expected);
        }
      }

      const controls = document.createElement("div");
      controls.className = "task-controls";

      const statusField = createField("Статус", createStatusSelect(task.status));
      statusField.querySelector("select").addEventListener("change", (event) => {
        task.status = event.target.value;
        card.dataset.status = task.status;
        updateAllViews();
        renderTasks();
        scheduleAutosave();
      });

      const commentField = createField("Комментарий менеджера", createTextarea(task.comment || "", "Что сделано / почему не сделано / что мешает"));
      commentField.querySelector("textarea").addEventListener("input", (event) => {
        task.comment = event.target.value;
        scheduleAutosave();
      });

      controls.appendChild(statusField);
      controls.appendChild(commentField);
      body.appendChild(controls);

      card.appendChild(head);
      card.appendChild(body);
      refs.tasksList.appendChild(card);
    });
  }

  function renderActions() {
    refs.actionsList.innerHTML = "";

    if (!state.actions.length) {
      refs.actionsList.innerHTML = '<div class="empty-state">Пока нет ни одного действия. Добавьте запись, чтобы менеджер вёл дневник работы прямо на сайте.</div>';
      return;
    }

    state.actions.forEach((action) => {
      const card = document.createElement("article");
      card.className = "action-card";

      const head = document.createElement("div");
      head.className = "action-head";

      const title = document.createElement("div");
      title.innerHTML = `<h3 class="task-title">Действие</h3><div class="task-meta">${buildLinkedTaskBadge(action.linkedTaskId)}</div>`;

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "delete-btn";
      deleteButton.dataset.deleteAction = action.actionId;
      deleteButton.textContent = "Удалить";

      head.appendChild(title);
      head.appendChild(deleteButton);

      const body = document.createElement("div");
      body.className = "action-body";

      const topGrid = document.createElement("div");
      topGrid.className = "action-grid";

      const timeField = createField("Время", createInput("time", action.time || "", ""));
      timeField.querySelector("input").addEventListener("input", (event) => {
        action.time = event.target.value;
        scheduleAutosave();
      });

      const typeField = createField("Тип действия", createActionTypeSelect(action.type));
      typeField.querySelector("select").addEventListener("change", (event) => {
        action.type = event.target.value;
        scheduleAutosave();
      });

      const linkedField = createField("Связано с задачей", createTaskLinkSelect(action.linkedTaskId));
      linkedField.querySelector("select").addEventListener("change", (event) => {
        action.linkedTaskId = event.target.value;
        renderActions();
        scheduleAutosave();
      });

      topGrid.appendChild(timeField);
      topGrid.appendChild(typeField);
      topGrid.appendChild(linkedField);

      const secondaryGrid = document.createElement("div");
      secondaryGrid.className = "action-grid secondary";

      const descriptionField = createField("Что сделано", createTextarea(action.description || "", "Опишите конкретное действие"));
      descriptionField.querySelector("textarea").addEventListener("input", (event) => {
        action.description = event.target.value;
        scheduleAutosave();
        updateAllViews();
      });

      const resultField = createField("Результат", createTextarea(action.result || "", "Что получилось после действия"));
      resultField.querySelector("textarea").addEventListener("input", (event) => {
        action.result = event.target.value;
        scheduleAutosave();
      });

      const nextField = createField("Следующий шаг", createTextarea(action.nextStep || "", "Что дальше / что нужно дожать"));
      nextField.querySelector("textarea").addEventListener("input", (event) => {
        action.nextStep = event.target.value;
        scheduleAutosave();
      });

      secondaryGrid.appendChild(descriptionField);
      secondaryGrid.appendChild(resultField);
      body.appendChild(topGrid);
      body.appendChild(secondaryGrid);
      body.appendChild(nextField);

      card.appendChild(head);
      card.appendChild(body);
      refs.actionsList.appendChild(card);
    });
  }

  function buildLinkedTaskBadge(taskId) {
    const task = state.tasks.find((item) => item.taskId === taskId);
    if (!task) {
      return createBadgeHtml("Без привязки", "");
    }
    return createBadgeHtml(task.title || "Задача", "");
  }

  function updateAllViews() {
    updateMetrics();
    updateSummary();
    updateManagerLinkPreview();
  }

  function updateMetrics() {
    const metrics = collectMetricValues();

    updateDeviationElement(refs.ordersDeviation, metrics.orders);
    updateDeviationElement(refs.marginDeviation, metrics.margin, true);
    updateDeviationElement(refs.revenueDeviation, metrics.revenue, true);

    updateMetricHeadline(refs.ordersHeadline, refs.ordersSubline, metrics.orders, false);
    updateMetricHeadline(refs.marginHeadline, refs.marginSubline, metrics.margin, true);
    updateMetricHeadline(refs.revenueHeadline, refs.revenueSubline, metrics.revenue, true);

    refs.summaryOrdersDelta.textContent = formatDeviationShort(metrics.orders, false);
    refs.summaryMarginDelta.textContent = formatDeviationShort(metrics.margin, true);
  }

  function updateMetricHeadline(headlineEl, sublineEl, metric, isCurrency) {
    if (metric.plan === null && metric.fact === null) {
      headlineEl.textContent = "—";
      sublineEl.textContent = "План не загружен";
      return;
    }

    if (metric.plan !== null && metric.fact !== null) {
      headlineEl.textContent = `${formatMetric(metric.fact, isCurrency)} / ${formatMetric(metric.plan, isCurrency)}`;
      sublineEl.textContent = `Отклонение: ${formatDeviationShort(metric, isCurrency)}`;
      return;
    }

    if (metric.fact !== null) {
      headlineEl.textContent = formatMetric(metric.fact, isCurrency);
      sublineEl.textContent = "Факт заполнен, план не указан";
      return;
    }

    headlineEl.textContent = formatMetric(metric.plan, isCurrency);
    sublineEl.textContent = "План загружен, факт ещё не заполнен";
  }

  function collectMetricValues() {
    return {
      orders: calculateMetricValue(readNumber(refs.ordersPlan), readNumber(refs.ordersFact)),
      margin: calculateMetricValue(readNumber(refs.marginPlan), readNumber(refs.marginFact)),
      revenue: calculateMetricValue(readNumber(refs.revenuePlan), readNumber(refs.revenueFact))
    };
  }

  function calculateMetricValue(plan, fact) {
    const deviation = plan !== null && fact !== null ? fact - plan : null;
    const deviationPct = deviation !== null && plan !== 0 ? deviation / plan : null;
    return { plan, fact, deviation, deviationPct };
  }

  function updateDeviationElement(element, metric, isCurrency = false) {
    element.classList.remove("positive", "negative", "neutral");
    if (metric.deviation === null) {
      element.textContent = "—";
      return;
    }

    element.textContent = `${formatSigned(metric.deviation, isCurrency)}${metric.deviationPct !== null ? ` · ${formatSignedPercent(metric.deviationPct)}` : ""}`;

    if (metric.deviation > 0) element.classList.add("positive");
    if (metric.deviation < 0) element.classList.add("negative");
    if (metric.deviation === 0) element.classList.add("neutral");
  }

  function updateSummary() {
    const doneTasks = state.tasks.filter((task) => task.status === "done").length;
    const taskCount = state.tasks.length;
    refs.summaryTasks.textContent = `${doneTasks} / ${taskCount}`;
    refs.summaryTasksNote.textContent = taskCount ? "Статусы проставлены в карточках задач" : "Нет задач на сегодня";

    const filledActions = state.actions.filter((action) => isActionFilled(action)).length;
    refs.summaryActions.textContent = String(filledActions);

    refs.lastSavedAt.textContent = state.lastSavedAt
      ? new Date(state.lastSavedAt).toLocaleString("ru-RU")
      : "ещё не было";
  }

  function buildPayload(mode) {
    const metrics = collectMetricValues();
    return {
      version: 2,
      mode,
      reportId: createId("report"),
      reportDate: refs.reportDate.value,
      managerName: refs.managerName.value.trim(),
      department: refs.department.value.trim(),
      channel: refs.channel.value,
      shift: refs.shift.value.trim(),
      dayFocus: refs.dayFocus.value.trim(),
      overallStatus: refs.overallStatus.value,
      kpis: {
        orders: metrics.orders,
        margin: metrics.margin,
        revenue: metrics.revenue,
        numbersComment: refs.numbersComment.value.trim()
      },
      tasks: state.tasks.map((task) => ({
        taskId: task.taskId,
        title: task.title || "",
        category: task.category || "",
        priority: task.priority || "medium",
        note: task.note || "",
        expectedResult: task.expectedResult || "",
        status: task.status || "not_started",
        comment: task.comment || "",
        manual: Boolean(task.manual)
      })),
      actions: state.actions
        .filter((action) => isActionFilled(action))
        .map((action) => ({
          actionId: action.actionId,
          time: action.time || "",
          type: action.type || "",
          linkedTaskId: action.linkedTaskId || "",
          description: action.description || "",
          result: action.result || "",
          nextStep: action.nextStep || ""
        })),
      summary: {
        mainResult: refs.mainResult.value.trim(),
        completedSummary: refs.completedSummary.value.trim(),
        blockers: refs.blockers.value.trim(),
        helpNeeded: refs.helpNeeded.value.trim(),
        tomorrowPlan: refs.tomorrowPlan.value.trim(),
        riskComment: refs.riskComment.value.trim()
      },
      counters: {
        tasksDone: state.tasks.filter((task) => task.status === "done").length,
        tasksTotal: state.tasks.length,
        actionsCount: state.actions.filter((action) => isActionFilled(action)).length
      },
      context: {
        currentPlanSource: state.currentPlanSourceText,
        currentTasksSource: state.currentTasksSourceText,
        dataUpdatedAt: state.dailyData && state.dailyData.meta ? state.dailyData.meta.updatedAt || "" : ""
      },
      meta: {
        submittedAtLocal: new Date().toISOString(),
        pageUrl: window.location.href,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
        userAgent: navigator.userAgent,
        source: "github-pages"
      }
    };
  }

  function applyDraftIfMatches() {
    const draft = parseJson(localStorage.getItem(STORAGE_KEYS.draft), null);
    if (!draft) return;

    const currentKey = getCurrentContextKey();
    const draftKey = buildContextKey(draft.reportDate, draft.managerName, draft.department, draft.channel);
    if (draftKey && draftKey === currentKey) {
      loadSnapshotIntoForm(draft, true);
      showBanner("info", "Подтянул локальный черновик для этой даты и менеджера.");
    }
  }

  function saveDraftWithFeedback() {
    saveDraft();
    showFormMessage("success", "Черновик сохранён в браузере.");
  }

  function saveDraft(snapshot) {
    const draftSnapshot = snapshot || buildPayload("draft");
    localStorage.setItem(STORAGE_KEYS.draft, JSON.stringify(draftSnapshot));
    state.lastSavedAt = new Date().toISOString();
    refs.lastSavedAt.textContent = new Date(state.lastSavedAt).toLocaleString("ru-RU");
  }

  function scheduleAutosave() {
    window.clearTimeout(state.autosaveTimer);
    state.autosaveTimer = window.setTimeout(() => {
      saveDraft();
      updateSummary();
    }, 450);
  }

  function clearNonProfileFields() {
    [
      refs.dayFocus,
      refs.numbersComment,
      refs.ordersFact,
      refs.marginFact,
      refs.revenueFact,
      refs.mainResult,
      refs.completedSummary,
      refs.blockers,
      refs.helpNeeded,
      refs.tomorrowPlan,
      refs.riskComment
    ].forEach((input) => {
      input.value = "";
    });

    refs.overallStatus.value = "green";
    state.actions = [];
    state.tasks = state.tasks.map((task) => Object.assign({}, task, { status: "not_started", comment: "" }));
  }

  function fillFromLatestHistory() {
    const history = getHistory();
    const currentManager = normalizeText(refs.managerName.value);
    const currentDepartment = normalizeText(refs.department.value);

    const latest = history.find(
      (item) =>
        normalizeText(item.managerName) === currentManager &&
        normalizeText(item.department) === currentDepartment
    ) || history[0];

    if (!latest) {
      showFormMessage("warning", "Локальной истории пока нет — нечего подтянуть.");
      return;
    }

    loadSnapshotIntoForm(latest);
    showFormMessage("success", "Последний отчёт подставлен в форму. Проверьте цифры и задачи перед отправкой.");
  }

  function loadSnapshotFromHistory(reportId) {
    const history = getHistory();
    const found = history.find((item) => item.reportId === reportId);
    if (!found) return;
    loadSnapshotIntoForm(found);
    showBanner("info", "Исторический отчёт подставлен в форму.");
  }

  function loadSnapshotIntoForm(snapshot, preserveMeta = false) {
    refs.reportDate.value = snapshot.reportDate || refs.reportDate.value;
    refs.managerName.value = snapshot.managerName || refs.managerName.value;
    refs.department.value = snapshot.department || refs.department.value;
    refs.channel.value = snapshot.channel || refs.channel.value;
    refs.shift.value = snapshot.shift || refs.shift.value;
    refs.dayFocus.value = snapshot.dayFocus || "";
    refs.overallStatus.value = snapshot.overallStatus || "green";

    refs.ordersPlan.value = snapshot.kpis && snapshot.kpis.orders ? emptyIfNull(snapshot.kpis.orders.plan) : "";
    refs.ordersFact.value = snapshot.kpis && snapshot.kpis.orders ? emptyIfNull(snapshot.kpis.orders.fact) : "";
    refs.marginPlan.value = snapshot.kpis && snapshot.kpis.margin ? emptyIfNull(snapshot.kpis.margin.plan) : "";
    refs.marginFact.value = snapshot.kpis && snapshot.kpis.margin ? emptyIfNull(snapshot.kpis.margin.fact) : "";
    refs.revenuePlan.value = snapshot.kpis && snapshot.kpis.revenue ? emptyIfNull(snapshot.kpis.revenue.plan) : "";
    refs.revenueFact.value = snapshot.kpis && snapshot.kpis.revenue ? emptyIfNull(snapshot.kpis.revenue.fact) : "";
    refs.numbersComment.value = snapshot.kpis ? snapshot.kpis.numbersComment || "" : "";

    refs.mainResult.value = snapshot.summary ? snapshot.summary.mainResult || "" : "";
    refs.completedSummary.value = snapshot.summary ? snapshot.summary.completedSummary || "" : "";
    refs.blockers.value = snapshot.summary ? snapshot.summary.blockers || "" : "";
    refs.helpNeeded.value = snapshot.summary ? snapshot.summary.helpNeeded || "" : "";
    refs.tomorrowPlan.value = snapshot.summary ? snapshot.summary.tomorrowPlan || "" : "";
    refs.riskComment.value = snapshot.summary ? snapshot.summary.riskComment || "" : "";

    state.tasks = Array.isArray(snapshot.tasks)
      ? snapshot.tasks.map((task) => Object.assign({}, task))
      : [];
    state.actions = Array.isArray(snapshot.actions)
      ? snapshot.actions.map((action) => Object.assign({}, action))
      : [];

    persistProfile();
    updateManagerLinkPreview();
    renderTasks();
    renderActions();
    updateAllViews();

    if (!preserveMeta) {
      saveDraft();
    }
  }

  function saveSnapshotToHistory(snapshot) {
    const history = getHistory().filter((item) => item.reportId !== snapshot.reportId);
    history.unshift(snapshot);
    writeHistory(history.slice(0, CONFIG.maxLocalReports));
  }

  function getHistory() {
    return parseJson(localStorage.getItem(STORAGE_KEYS.history), []);
  }

  function writeHistory(history) {
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
  }

  function renderHistory() {
    const history = getHistory();
    refs.historyList.innerHTML = "";

    if (!history.length) {
      refs.historyList.innerHTML = '<div class="empty-state">Здесь появятся отправленные или сохранённые отчёты с этого устройства.</div>';
      return;
    }

    history.forEach((item) => {
      const card = document.createElement("article");
      card.className = "history-card";

      const head = document.createElement("div");
      head.className = "history-head";
      head.innerHTML = `
        <div>
          <strong>${escapeHtml(item.reportDate || "Без даты")} · ${escapeHtml(item.managerName || "Без имени")}</strong>
          <div class="history-meta">
            <span>${escapeHtml(item.department || "—")}</span>
            <span>${escapeHtml(item.channel || "—")}</span>
            <span>Задач: ${item.counters ? item.counters.tasksDone : 0}/${item.counters ? item.counters.tasksTotal : 0}</span>
            <span>Действий: ${item.counters ? item.counters.actionsCount : 0}</span>
          </div>
        </div>
      `;

      const statusBadge = createBadge(item.mode === "submitted" ? "Сдан" : "Черновик", "");
      head.appendChild(statusBadge);

      const actions = document.createElement("div");
      actions.className = "history-actions";
      actions.innerHTML = `
        <button type="button" class="small-btn" data-history-load="${escapeAttribute(item.reportId)}">Открыть в форме</button>
        <button type="button" class="small-btn" data-history-json="${escapeAttribute(item.reportId)}">JSON</button>
      `;

      card.appendChild(head);
      card.appendChild(actions);
      refs.historyList.appendChild(card);
    });
  }

  function exportHistoryCsv() {
    const history = getHistory();
    if (!history.length) {
      showFormMessage("warning", "Локальная история пуста — экспортировать пока нечего.");
      return;
    }

    const rows = [
      [
        "reportDate",
        "managerName",
        "department",
        "channel",
        "overallStatus",
        "tasksDone",
        "tasksTotal",
        "actionsCount",
        "ordersPlan",
        "ordersFact",
        "ordersDeviation",
        "marginPlan",
        "marginFact",
        "marginDeviation",
        "revenuePlan",
        "revenueFact",
        "revenueDeviation"
      ]
    ];

    history.forEach((item) => {
      rows.push([
        item.reportDate || "",
        item.managerName || "",
        item.department || "",
        item.channel || "",
        item.overallStatus || "",
        item.counters ? item.counters.tasksDone : "",
        item.counters ? item.counters.tasksTotal : "",
        item.counters ? item.counters.actionsCount : "",
        safeMetric(item, "orders", "plan"),
        safeMetric(item, "orders", "fact"),
        safeMetric(item, "orders", "deviation"),
        safeMetric(item, "margin", "plan"),
        safeMetric(item, "margin", "fact"),
        safeMetric(item, "margin", "deviation"),
        safeMetric(item, "revenue", "plan"),
        safeMetric(item, "revenue", "fact"),
        safeMetric(item, "revenue", "deviation")
      ]);
    });

    const csv = rows.map((row) => row.map(csvEscape).join(";")).join("\n");
    downloadTextFile("manager-history.csv", csv, "text/csv;charset=utf-8");
  }

  function exportCurrentJson() {
    const payload = buildPayload("export");
    downloadTextFile(`report-${payload.reportDate || "draft"}.json`, JSON.stringify(payload, null, 2), "application/json");
  }

  function openGoogleSheet() {
    if (!CONFIG.googleSheetUrl) {
      showFormMessage("warning", "Ссылка на таблицу руководителя ещё не указана в config.js.");
      return;
    }
    window.open(CONFIG.googleSheetUrl, "_blank", "noopener");
  }

  async function copyManagerLink() {
    const text = refs.sideManagerLinkPreview.value || refs.managerLinkPreview.value;
    if (!text) {
      showFormMessage("warning", "Ссылка ещё не сформирована.");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      showFormMessage("success", "Личная ссылка скопирована.");
    } catch (error) {
      showFormMessage("warning", "Не получилось скопировать автоматически. Ссылка уже показана в поле справа.");
    }
  }

  function updateManagerLinkPreview() {
    const params = new URLSearchParams();
    if (refs.managerName.value.trim()) params.set("manager", refs.managerName.value.trim());
    if (refs.department.value.trim()) params.set("department", refs.department.value.trim());
    if (refs.channel.value.trim()) params.set("channel", refs.channel.value.trim());
    if (refs.shift.value.trim()) params.set("shift", refs.shift.value.trim());

    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const link = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
    refs.managerLinkPreview.value = link;
    refs.sideManagerLinkPreview.value = link;
  }

  function persistProfile() {
    const profile = {
      managerName: refs.managerName.value.trim(),
      department: refs.department.value.trim(),
      channel: refs.channel.value.trim(),
      shift: refs.shift.value.trim()
    };
    localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile));
  }

  function showFormMessage(type, text) {
    refs.formMessage.className = `form-message ${type}`;
    refs.formMessage.innerHTML = text;
  }

  function showBanner(type, text) {
    refs.statusBanner.className = `banner ${type || "info"}`;
    refs.statusBanner.textContent = text;
  }

  function safeMetric(item, metricKey, field) {
    return item && item.kpis && item.kpis[metricKey] && item.kpis[metricKey][field] !== null && item.kpis[metricKey][field] !== undefined
      ? item.kpis[metricKey][field]
      : "";
  }

  function formatDateForInput(date) {
    const offsetMs = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
  }

  function getCurrentContextKey() {
    return buildContextKey(refs.reportDate.value, refs.managerName.value, refs.department.value, refs.channel.value);
  }

  function buildContextKey(date, managerName, department, channel) {
    return [date || "", normalizeText(managerName), normalizeText(department), normalizeText(channel)].join("|");
  }

  function createId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function createField(label, inputNode) {
    const wrapper = document.createElement("label");
    wrapper.className = "field";
    const caption = document.createElement("span");
    caption.textContent = label;
    wrapper.appendChild(caption);
    wrapper.appendChild(inputNode);
    return wrapper;
  }

  function createInput(type, value, placeholder) {
    const input = document.createElement("input");
    input.type = type;
    input.value = value;
    input.placeholder = placeholder || "";
    return input;
  }

  function createTextarea(value, placeholder) {
    const textarea = document.createElement("textarea");
    textarea.rows = 3;
    textarea.value = value;
    textarea.placeholder = placeholder || "";
    return textarea;
  }

  function createStatusSelect(value) {
    const select = document.createElement("select");
    STATUS_OPTIONS.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      if ((value || "not_started") === item.value) option.selected = true;
      select.appendChild(option);
    });
    return select;
  }

  function createActionTypeSelect(value) {
    const select = document.createElement("select");
    ACTION_TYPES.forEach((item) => {
      const option = document.createElement("option");
      option.value = item;
      option.textContent = item;
      if (item === value) option.selected = true;
      select.appendChild(option);
    });
    return select;
  }

  function createPrioritySelect(value) {
    const select = document.createElement("select");
    [
      { value: "high", label: "Высокий" },
      { value: "medium", label: "Средний" },
      { value: "low", label: "Низкий" }
    ].forEach((item) => {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      if (item.value === value) option.selected = true;
      select.appendChild(option);
    });
    return select;
  }

  function createTaskLinkSelect(selectedTaskId) {
    const select = document.createElement("select");
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Без привязки";
    select.appendChild(defaultOption);

    state.tasks.forEach((task) => {
      const option = document.createElement("option");
      option.value = task.taskId;
      option.textContent = task.title || "Без названия";
      if (task.taskId === selectedTaskId) option.selected = true;
      select.appendChild(option);
    });

    return select;
  }

  function createBadge(text, extraClass) {
    const badge = document.createElement("span");
    badge.className = `badge ${extraClass || ""}`.trim();
    badge.textContent = text;
    return badge;
  }

  function createBadgeHtml(text, extraClass) {
    return `<span class="badge ${escapeAttribute(extraClass || "")}">${escapeHtml(text)}</span>`;
  }

  function priorityLabel(priority) {
    const map = {
      high: "Высокий приоритет",
      medium: "Средний приоритет",
      low: "Низкий приоритет"
    };
    return map[priority] || "Средний приоритет";
  }

  function statusLabel(status) {
    const found = STATUS_OPTIONS.find((item) => item.value === status);
    return found ? found.label : "Не начато";
  }

  function readNumber(input) {
    const raw = input.value.trim();
    if (raw === "") return null;
    const value = Number(raw.replace(",", "."));
    return Number.isFinite(value) ? value : null;
  }

  function formatMetric(value, isCurrency) {
    if (value === null || value === undefined) return "—";
    return isCurrency ? currencyFormatter.format(value) : numberFormatter.format(value);
  }

  function formatSigned(value, isCurrency) {
    if (value === null || value === undefined) return "—";
    if (isCurrency) {
      return `${value > 0 ? "+" : value < 0 ? "−" : ""}${currencyFormatter.format(Math.abs(value))}`;
    }
    return `${value > 0 ? "+" : value < 0 ? "−" : ""}${numberFormatter.format(Math.abs(value))}`;
  }

  function formatSignedPercent(value) {
    if (value === null || value === undefined) return "—";
    return `${value > 0 ? "+" : value < 0 ? "−" : ""}${percentFormatter.format(Math.abs(value))}`;
  }

  function formatDeviationShort(metric, isCurrency) {
    if (metric.deviation === null) return "—";
    if (metric.deviationPct === null) {
      return formatSigned(metric.deviation, isCurrency);
    }
    return `${formatSigned(metric.deviation, isCurrency)} · ${formatSignedPercent(metric.deviationPct)}`;
  }

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function currentTimeValue() {
    return new Date().toTimeString().slice(0, 5);
  }

  function parseJson(value, fallback) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function isActionFilled(action) {
    return Boolean(
      (action.description && action.description.trim()) ||
      (action.result && action.result.trim()) ||
      (action.nextStep && action.nextStep.trim())
    );
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    if (/[;"\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function downloadTextFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll("'", "&#39;");
  }

  function emptyIfNull(value) {
    return value === null || value === undefined ? "" : value;
  }
})();
