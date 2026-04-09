# Supabase go-live for Tekstilno portal

Этот пакет уже переключён на Supabase.

## Что уже сделано
- SQL для таблиц и истории готов.
- `config.js` уже заполнен:
  - `provider: "supabase"`
  - URL проекта
  - publishable key
- `shared-storage.js` уже умеет писать:
  - статусы задач
  - комментарии менеджеров
  - журнал сохранений
  - ручные данные по поставкам
  - заявки
  - историю изменений

## Что нужно залить в репозиторий
Заменить файлы:
- `config.js`
- `shared-storage.js`
- `portal.js`
- папку `backend/`
- папку `docs/`

## Что проверить в Supabase
1. SQL уже должен быть выполнен.
2. В Table Editor должны появиться таблицы:
   - `portal_activity_log`
   - `portal_task_state`
   - `portal_supply_manual`
   - `portal_order_requests`
   - `portal_task_comments`
   - `portal_entity_history`
3. Если таблицы есть, больше ничего в dashboard переключать не нужно.

## Где именно был переключатель
Переключение делается **не в интерфейсе Supabase**, а в файле `config.js`.

Сейчас там уже стоит:
```js
backend: {
  provider: "supabase",
  supabaseUrl: "https://wqmttzkrykrlyhiksnmo.supabase.co",
  supabasePublishableKey: "sb_publishable_BxaJ4TjGZIE7iF9w0Jl15g_7hGw4tXc"
}
```

## Как проверить, что всё заработало
1. Открыть портал.
2. В задачах менеджера поменять статус и комментарий у одного артикула.
3. Нажать сохранить.
4. Открыть раздел `Журнал сдачи`.
5. Должны появиться:
   - запись в журнале сохранений
   - комментарий менеджера
   - история изменений

## Если запись не появляется
Проверь:
- правильность домена и что открылась свежая версия сайта
- `Ctrl+F5`
- есть ли таблицы в Supabase
- нет ли ошибки в браузерной консоли
