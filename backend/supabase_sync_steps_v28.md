# Supabase sync steps v28

Ниже минимальная схема, чтобы уйти от session-preview и сделать отчётность общей для всех.

## 1. Создай проект Supabase

Нужны:
- Project URL
- anon public key

## 2. Выполни SQL

Открой в Supabase:
- `SQL Editor`
- вставь содержимое файла `portal_shared_storage_supabase.sql`
- нажми `Run`

Файл создаёт таблицы:

```sql
portal_activity_log
portal_task_state
portal_supply_manual
portal_order_requests
```

## 3. Вставь ключи в `config.js`

Замени блок `backend` на:

```js
backend: {
  provider: "supabase",
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_ANON_PUBLIC_KEY",
  tables: {
    reports: "portal_activity_log",
    tasks: "portal_task_state",
    supplyManual: "portal_supply_manual",
    orders: "portal_order_requests"
  }
}
```

## 4. Перезалей портал

После правки `config.js`:
1. закоммить изменения
2. дождись обновления GitHub Pages
3. сделай `Ctrl+F5`

## 5. Как проверить, что sync заработал

1. Открой портал с двух разных устройств / браузеров.
2. Измени статус любого артикула в задачах менеджеров.
3. Сохрани запись.
4. На втором устройстве открой `Журнал сдачи`.
5. Запись должна быть видна там же без экспорта / импорта JSON.

## Что уходит в общую базу

- статусы по артикулам менеджеров
- комментарии менеджеров
- журнал сохранений
- ручные данные по поставкам
- заявки на пополнение / заказ

## Что ещё остаётся файловым слоем

- `article-plan.json`
- `history-data.json`
- `nina-cluster-dashboard.json`

То есть источник расчётов пока файловый, а отчётность и ввод команды — уже общие.
