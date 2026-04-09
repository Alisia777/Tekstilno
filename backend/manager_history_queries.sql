-- 1) Кто и что сделал сегодня
select *
from public.portal_manager_daily_summary
where work_date = current_date
order by platform, manager_name;

-- 2) Последние комментарии менеджеров и руководителя
select *
from public.portal_comment_feed
order by created_at desc
limit 200;

-- 3) История по конкретному артикулу
-- замени seller_article на нужный
select
  created_at,
  entity_type,
  event_type,
  platform,
  wb_article,
  ozon_article,
  seller_article,
  actor_name,
  changed_fields,
  note
from public.portal_entity_history
where seller_article = 'pjm001/sph/k1/032/p1*dмолочный,бордовый'
order by created_at desc;

-- 4) Что менеджеры меняли по статусам сегодня
select
  created_at,
  platform,
  manager_name,
  wb_article,
  seller_article,
  event_type,
  changed_fields,
  note,
  actor_name
from public.portal_entity_history
where entity_type = 'task'
  and work_date = current_date
order by created_at desc;
