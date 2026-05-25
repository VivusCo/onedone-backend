-- Align reminders schema with deployed reminder sync endpoints.
-- Safe for partially applied or drifted environments.

alter table public.reminders
  add column if not exists ios_notification_id text;

alter table public.reminders
  add column if not exists local_notification_status text;

-- Backfill before NOT NULL/default enforcement.
update public.reminders
set local_notification_status = 'not_scheduled'
where local_notification_status is null;

alter table public.reminders
  alter column local_notification_status set default 'not_scheduled';

alter table public.reminders
  alter column local_notification_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.reminders'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%local_notification_status%'
  ) then
    alter table public.reminders
      add constraint reminders_local_notification_status_check
      check (local_notification_status in (
        'not_scheduled',
        'scheduled',
        'delivered',
        'opened',
        'canceled',
        'failed'
      ));
  end if;
end
$$;

create index if not exists idx_reminders_ios_notification_id
  on public.reminders(ios_notification_id)
  where ios_notification_id is not null;

create index if not exists idx_reminders_user_local_notification_status
  on public.reminders(user_id, local_notification_status);
