-- Последние 30 дней по задачам менеджеров
select
  work_date,
  platform,
  count(*) as tasks_total,
  count(*) filter (where status = 'done') as done_count,
  count(*) filter (where status = 'in_progress') as in_progress_count,
  count(*) filter (where status = 'need_help') as need_help_count,
  count(*) filter (where status = 'todo') as todo_count
from public.portal_task_state
where work_date >= current_date - interval '30 days'
group by work_date, platform
order by work_date desc, platform;

-- История по одной дате и площадке
select
  work_date,
  platform,
  seller_article,
  wb_article,
  manager_name,
  status,
  leader_comment,
  manager_comment,
  updated_at,
  updated_by
from public.portal_task_state
where work_date = current_date
  and platform = 'WB'
order by updated_at desc;
