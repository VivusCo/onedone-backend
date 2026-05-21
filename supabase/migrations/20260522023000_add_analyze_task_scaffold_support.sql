alter table public.tasks
  add column if not exists current_next_step text,
  add column if not exists current_output_id uuid;

alter table public.tasks
  drop constraint if exists tasks_status_check;

alter table public.tasks
  add constraint tasks_status_check
  check (status in ('pending', 'in_progress', 'needs_clarification', 'waiting_for_user', 'completed', 'canceled', 'failed'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_current_output_id_fkey'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_current_output_id_fkey
      foreign key (current_output_id)
      references public.task_outputs(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_tasks_current_output_id
  on public.tasks(current_output_id)
  where current_output_id is not null;

create table if not exists public.analyze_task_idempotency (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  request_fingerprint text not null,
  task_id uuid references public.tasks(id) on delete set null,
  response_type text
    check (response_type in ('clarification', 'task_analysis', 'error')),
  response_payload jsonb not null default '{}'::jsonb,
  processing_status text not null default 'in_progress'
    check (processing_status in ('in_progress', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists idx_analyze_task_idempotency_task_id
  on public.analyze_task_idempotency(task_id)
  where task_id is not null;

create index if not exists idx_analyze_task_idempotency_user_created_at
  on public.analyze_task_idempotency(user_id, created_at desc);

drop trigger if exists trg_analyze_task_idempotency_set_updated_at on public.analyze_task_idempotency;
create trigger trg_analyze_task_idempotency_set_updated_at
before update on public.analyze_task_idempotency
for each row execute function public.set_updated_at();

alter table public.analyze_task_idempotency enable row level security;

drop policy if exists analyze_task_idempotency_select_own on public.analyze_task_idempotency;
create policy analyze_task_idempotency_select_own
on public.analyze_task_idempotency
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists analyze_task_idempotency_insert_own on public.analyze_task_idempotency;
create policy analyze_task_idempotency_insert_own
on public.analyze_task_idempotency
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists analyze_task_idempotency_update_own on public.analyze_task_idempotency;
create policy analyze_task_idempotency_update_own
on public.analyze_task_idempotency
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists analyze_task_idempotency_delete_own on public.analyze_task_idempotency;
create policy analyze_task_idempotency_delete_own
on public.analyze_task_idempotency
for delete
to authenticated
using (auth.uid() = user_id);
