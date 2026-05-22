alter table public.tasks
  drop constraint if exists tasks_status_check;

alter table public.tasks
  add constraint tasks_status_check
  check (
    status in (
      'pending',
      'in_progress',
      'needs_clarification',
      'waiting_for_user',
      'waiting_for_reply',
      'completed',
      'canceled',
      'failed'
    )
  );

create or replace function public.update_task_status_with_event(
  p_task_id uuid,
  p_new_status text,
  p_event_message text,
  p_event_metadata jsonb default '{}'::jsonb
)
returns table (
  task_id uuid,
  task_status text,
  completed_at timestamptz
)
language plpgsql
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_old_status text;
  v_completed_at timestamptz;
  v_event_type text;
begin
  if v_user_id is null then
    raise exception 'unauthorized';
  end if;

  if p_new_status not in (
    'pending',
    'in_progress',
    'needs_clarification',
    'waiting_for_user',
    'waiting_for_reply',
    'completed',
    'canceled',
    'failed'
  ) then
    raise exception 'invalid_status';
  end if;

  select t.status
  into v_old_status
  from public.tasks t
  where t.id = p_task_id
    and t.user_id = v_user_id
  for update;

  if not found then
    raise exception 'task_not_found';
  end if;

  update public.tasks t
  set
    status = p_new_status,
    completed_at = case
      when p_new_status = 'completed' then coalesce(t.completed_at, now())
      when p_new_status <> 'completed' and t.status = 'completed' then null
      else t.completed_at
    end
  where t.id = p_task_id
    and t.user_id = v_user_id
  returning t.completed_at into v_completed_at;

  v_event_type := case
    when p_new_status = 'completed' then 'task_completed'
    when v_old_status = 'completed' and p_new_status <> 'completed' then 'task_reopened'
    else 'task_updated'
  end;

  insert into public.task_events (
    user_id,
    task_id,
    event_type,
    event_message,
    event_metadata
  )
  values (
    v_user_id,
    p_task_id,
    v_event_type,
    p_event_message,
    coalesce(p_event_metadata, '{}'::jsonb)
  );

  return query
  select p_task_id, p_new_status, v_completed_at;
end;
$$;

revoke all on function public.update_task_status_with_event(uuid, text, text, jsonb) from public;
grant execute on function public.update_task_status_with_event(uuid, text, text, jsonb) to authenticated;
