-- Последние ручные записи менеджеров
select
  created_at,
  work_date,
  platform,
  manager_name,
  wb_article,
  seller_article,
  comment_type,
  body,
  meta
from public.portal_task_comments
where comment_type = 'manager_worklog'
order by created_at desc
limit 300;

-- Сколько ручных записей сделал каждый менеджер по датам
select
  work_date,
  platform,
  manager_name,
  count(*) as worklog_rows
from public.portal_task_comments
where comment_type = 'manager_worklog'
group by 1,2,3
order by work_date desc, manager_name;

-- История по конкретному артикулу
select
  created_at,
  work_date,
  platform,
  manager_name,
  wb_article,
  seller_article,
  comment_type,
  body,
  meta
from public.portal_task_comments
where comment_type = 'manager_worklog'
  and seller_article = 'pjm013/sph/k1/005/p1*uкрасный,желтый'
order by created_at desc;
