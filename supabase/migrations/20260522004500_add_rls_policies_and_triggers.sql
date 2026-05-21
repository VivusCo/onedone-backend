create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user_profile() from public;

drop trigger if exists trg_profiles_set_updated_at on public.profiles;
create trigger trg_profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_subscriptions_set_updated_at on public.subscriptions;
create trigger trg_subscriptions_set_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

drop trigger if exists trg_tasks_set_updated_at on public.tasks;
create trigger trg_tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

drop trigger if exists trg_task_outputs_set_updated_at on public.task_outputs;
create trigger trg_task_outputs_set_updated_at
before update on public.task_outputs
for each row execute function public.set_updated_at();

drop trigger if exists trg_clarifications_set_updated_at on public.clarifications;
create trigger trg_clarifications_set_updated_at
before update on public.clarifications
for each row execute function public.set_updated_at();

drop trigger if exists trg_checklist_items_set_updated_at on public.checklist_items;
create trigger trg_checklist_items_set_updated_at
before update on public.checklist_items
for each row execute function public.set_updated_at();

drop trigger if exists trg_reminders_set_updated_at on public.reminders;
create trigger trg_reminders_set_updated_at
before update on public.reminders
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_notes_set_updated_at on public.user_notes;
create trigger trg_user_notes_set_updated_at
before update on public.user_notes
for each row execute function public.set_updated_at();

drop trigger if exists trg_task_feedback_set_updated_at on public.task_feedback;
create trigger trg_task_feedback_set_updated_at
before update on public.task_feedback
for each row execute function public.set_updated_at();

drop trigger if exists trg_attachments_set_updated_at on public.attachments;
create trigger trg_attachments_set_updated_at
before update on public.attachments
for each row execute function public.set_updated_at();

drop trigger if exists trg_auth_users_create_profile on auth.users;
create trigger trg_auth_users_create_profile
after insert on auth.users
for each row execute function public.handle_new_user_profile();

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_events enable row level security;
alter table public.tasks enable row level security;
alter table public.task_outputs enable row level security;
alter table public.task_events enable row level security;
alter table public.clarifications enable row level security;
alter table public.checklist_items enable row level security;
alter table public.reminders enable row level security;
alter table public.user_notes enable row level security;
alter table public.incoming_replies enable row level security;
alter table public.task_feedback enable row level security;
alter table public.attachments enable row level security;
alter table public.usage_events enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own
on public.subscriptions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists subscriptions_insert_own on public.subscriptions;
create policy subscriptions_insert_own
on public.subscriptions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists subscriptions_update_own on public.subscriptions;
create policy subscriptions_update_own
on public.subscriptions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists subscriptions_delete_own on public.subscriptions;
create policy subscriptions_delete_own
on public.subscriptions
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists subscription_events_select_own on public.subscription_events;
create policy subscription_events_select_own
on public.subscription_events
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists subscription_events_insert_own on public.subscription_events;
create policy subscription_events_insert_own
on public.subscription_events
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists subscription_events_update_own on public.subscription_events;
create policy subscription_events_update_own
on public.subscription_events
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists subscription_events_delete_own on public.subscription_events;
create policy subscription_events_delete_own
on public.subscription_events
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists tasks_select_own on public.tasks;
create policy tasks_select_own
on public.tasks
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists tasks_insert_own on public.tasks;
create policy tasks_insert_own
on public.tasks
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists tasks_update_own on public.tasks;
create policy tasks_update_own
on public.tasks
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists tasks_delete_own on public.tasks;
create policy tasks_delete_own
on public.tasks
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists task_outputs_select_own on public.task_outputs;
create policy task_outputs_select_own
on public.task_outputs
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists task_outputs_insert_own on public.task_outputs;
create policy task_outputs_insert_own
on public.task_outputs
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists task_outputs_update_own on public.task_outputs;
create policy task_outputs_update_own
on public.task_outputs
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists task_outputs_delete_own on public.task_outputs;
create policy task_outputs_delete_own
on public.task_outputs
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists task_events_select_own on public.task_events;
create policy task_events_select_own
on public.task_events
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists task_events_insert_own on public.task_events;
create policy task_events_insert_own
on public.task_events
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists task_events_update_own on public.task_events;
create policy task_events_update_own
on public.task_events
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists task_events_delete_own on public.task_events;
create policy task_events_delete_own
on public.task_events
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists clarifications_select_own on public.clarifications;
create policy clarifications_select_own
on public.clarifications
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists clarifications_insert_own on public.clarifications;
create policy clarifications_insert_own
on public.clarifications
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists clarifications_update_own on public.clarifications;
create policy clarifications_update_own
on public.clarifications
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists clarifications_delete_own on public.clarifications;
create policy clarifications_delete_own
on public.clarifications
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists checklist_items_select_own on public.checklist_items;
create policy checklist_items_select_own
on public.checklist_items
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists checklist_items_insert_own on public.checklist_items;
create policy checklist_items_insert_own
on public.checklist_items
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists checklist_items_update_own on public.checklist_items;
create policy checklist_items_update_own
on public.checklist_items
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists checklist_items_delete_own on public.checklist_items;
create policy checklist_items_delete_own
on public.checklist_items
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists reminders_select_own on public.reminders;
create policy reminders_select_own
on public.reminders
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists reminders_insert_own on public.reminders;
create policy reminders_insert_own
on public.reminders
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists reminders_update_own on public.reminders;
create policy reminders_update_own
on public.reminders
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists reminders_delete_own on public.reminders;
create policy reminders_delete_own
on public.reminders
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists user_notes_select_own on public.user_notes;
create policy user_notes_select_own
on public.user_notes
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists user_notes_insert_own on public.user_notes;
create policy user_notes_insert_own
on public.user_notes
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists user_notes_update_own on public.user_notes;
create policy user_notes_update_own
on public.user_notes
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists user_notes_delete_own on public.user_notes;
create policy user_notes_delete_own
on public.user_notes
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists incoming_replies_select_own on public.incoming_replies;
create policy incoming_replies_select_own
on public.incoming_replies
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists incoming_replies_insert_own on public.incoming_replies;
create policy incoming_replies_insert_own
on public.incoming_replies
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists incoming_replies_update_own on public.incoming_replies;
create policy incoming_replies_update_own
on public.incoming_replies
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists incoming_replies_delete_own on public.incoming_replies;
create policy incoming_replies_delete_own
on public.incoming_replies
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists task_feedback_select_own on public.task_feedback;
create policy task_feedback_select_own
on public.task_feedback
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists task_feedback_insert_own on public.task_feedback;
create policy task_feedback_insert_own
on public.task_feedback
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists task_feedback_update_own on public.task_feedback;
create policy task_feedback_update_own
on public.task_feedback
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists task_feedback_delete_own on public.task_feedback;
create policy task_feedback_delete_own
on public.task_feedback
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists attachments_select_own on public.attachments;
create policy attachments_select_own
on public.attachments
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists attachments_insert_own on public.attachments;
create policy attachments_insert_own
on public.attachments
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists attachments_update_own on public.attachments;
create policy attachments_update_own
on public.attachments
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists attachments_delete_own on public.attachments;
create policy attachments_delete_own
on public.attachments
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists usage_events_select_own on public.usage_events;
create policy usage_events_select_own
on public.usage_events
for select
to authenticated
using (auth.uid() = user_id);
