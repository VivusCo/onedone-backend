create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text,
  onboarding_required boolean not null default true,
  starter_started_at timestamptz,
  starter_ends_at timestamptz,
  starter_status text not null default 'not_started'
    check (starter_status in ('not_started', 'active', 'expired', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starter_ends_at is null or starter_started_at is not null),
  check (starter_ends_at is null or starter_ends_at >= starter_started_at)
);

create index if not exists idx_profiles_starter_status
  on public.profiles(starter_status);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'app_store'
    check (provider in ('app_store', 'unknown')),
  product_id text,
  original_transaction_id text,
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'grace_period', 'expired', 'canceled', 'refunded')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  cancel_at timestamptz,
  canceled_at timestamptz,
  last_verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (current_period_end is null or current_period_start is null or current_period_end >= current_period_start),
  check (trial_ends_at is null or trial_started_at is null or trial_ends_at >= trial_started_at)
);

create unique index if not exists uq_subscriptions_original_transaction_id
  on public.subscriptions(original_transaction_id)
  where original_transaction_id is not null;

create index if not exists idx_subscriptions_user_status
  on public.subscriptions(user_id, status);

create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null
    check (event_type in (
      'initial_purchase',
      'renewal',
      'status_change',
      'expiration',
      'cancellation',
      'billing_retry',
      'grace_period_entered',
      'grace_period_exited',
      'refund',
      'manual_adjustment'
    )),
  event_source text not null default 'storekit'
    check (event_source in ('storekit', 'webhook', 'manual', 'system')),
  event_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_subscription_events_subscription_event_at
  on public.subscription_events(subscription_id, event_at desc);

create index if not exists idx_subscription_events_user_event_at
  on public.subscription_events(user_id, event_at desc);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_task_id uuid references public.tasks(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'waiting_for_user', 'completed', 'canceled', 'failed')),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high')),
  source text not null default 'manual'
    check (source in ('manual', 'analyze_task', 'split_child')),
  due_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (completed_at is null or completed_at >= created_at)
);

create index if not exists idx_tasks_user_created_at
  on public.tasks(user_id, created_at desc);

create index if not exists idx_tasks_user_status_created_at
  on public.tasks(user_id, status, created_at desc);

create index if not exists idx_tasks_parent_task_id
  on public.tasks(parent_task_id);

create index if not exists idx_tasks_due_at
  on public.tasks(due_at)
  where due_at is not null;

create table if not exists public.task_outputs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  output_type text not null
    check (output_type in ('analysis', 'generated_reply', 'task_split', 'checklist', 'summary', 'other')),
  content jsonb not null default '{}'::jsonb,
  is_current boolean not null default false,
  model text,
  tokens_prompt integer check (tokens_prompt is null or tokens_prompt >= 0),
  tokens_completion integer check (tokens_completion is null or tokens_completion >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_task_outputs_task_output_type_created_at
  on public.task_outputs(task_id, output_type, created_at desc);

create index if not exists idx_task_outputs_current
  on public.task_outputs(task_id, output_type)
  where is_current = true;

create index if not exists idx_task_outputs_user_created_at
  on public.task_outputs(user_id, created_at desc);

create table if not exists public.task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null
    check (event_type in (
      'task_created',
      'task_updated',
      'task_completed',
      'task_reopened',
      'task_split',
      'reply_generated',
      'clarification_requested',
      'clarification_answered',
      'checklist_updated',
      'reminder_set',
      'note_added'
    )),
  event_message text,
  event_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_task_events_task_created_at
  on public.task_events(task_id, created_at desc);

create index if not exists idx_task_events_user_created_at
  on public.task_events(user_id, created_at desc);

create table if not exists public.clarifications (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  question text not null,
  answer text,
  status text not null default 'open'
    check (status in ('open', 'answered', 'dismissed')),
  requested_at timestamptz not null default now(),
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (answered_at is null or answered_at >= requested_at)
);

create index if not exists idx_clarifications_task_status
  on public.clarifications(task_id, status);

create index if not exists idx_clarifications_user_status
  on public.clarifications(user_id, status);

create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  position integer not null default 0 check (position >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'done')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_checklist_items_task_position
  on public.checklist_items(task_id, position);

create index if not exists idx_checklist_items_user_status
  on public.checklist_items(user_id, status);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  remind_at timestamptz not null,
  ios_notification_id text,
  local_notification_status text not null default 'not_scheduled'
    check (local_notification_status in ('not_scheduled', 'scheduled', 'delivered', 'opened', 'canceled', 'failed')),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'sent', 'canceled', 'failed')),
  channel text not null default 'push'
    check (channel in ('push', 'email', 'in_app', 'sms')),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_reminders_user_remind_at
  on public.reminders(user_id, remind_at);

create index if not exists idx_reminders_task_remind_at
  on public.reminders(task_id, remind_at)
  where task_id is not null;

create index if not exists idx_reminders_ios_notification_id
  on public.reminders(ios_notification_id)
  where ios_notification_id is not null;

create index if not exists idx_reminders_user_local_notification_status
  on public.reminders(user_id, local_notification_status);

create table if not exists public.user_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  title text,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_notes_user_created_at
  on public.user_notes(user_id, created_at desc);

create index if not exists idx_user_notes_task_id
  on public.user_notes(task_id)
  where task_id is not null;

create table if not exists public.incoming_replies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  source text not null default 'in_app'
    check (source in ('in_app', 'email', 'sms', 'api', 'other')),
  message_id text,
  content text not null,
  parsed_payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists uq_incoming_replies_source_message_id
  on public.incoming_replies(source, message_id)
  where message_id is not null;

create index if not exists idx_incoming_replies_user_received_at
  on public.incoming_replies(user_id, received_at desc);

create index if not exists idx_incoming_replies_task_received_at
  on public.incoming_replies(task_id, received_at desc)
  where task_id is not null;

create table if not exists public.task_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  output_id uuid references public.task_outputs(id) on delete set null,
  rating smallint check (rating is null or rating between 1 and 5),
  feedback_type text not null default 'general'
    check (feedback_type in ('general', 'quality', 'accuracy', 'tone', 'other')),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_task_feedback_task_created_at
  on public.task_feedback(task_id, created_at desc);

create index if not exists idx_task_feedback_user_created_at
  on public.task_feedback(user_id, created_at desc);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  kind text not null default 'file'
    check (kind in ('file', 'image', 'audio', 'video', 'link', 'other')),
  storage_bucket text,
  storage_path text,
  file_name text,
  mime_type text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  external_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_attachments_user_created_at
  on public.attachments(user_id, created_at desc);

create index if not exists idx_attachments_task_id
  on public.attachments(task_id)
  where task_id is not null;

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  event_name text not null,
  event_category text not null default 'product'
    check (event_category in ('product', 'billing', 'system', 'ai')),
  event_source text not null default 'backend'
    check (event_source in ('ios', 'backend', 'edge_function', 'system', 'other')),
  quantity integer not null default 1 check (quantity > 0),
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_usage_events_user_created_at
  on public.usage_events(user_id, created_at desc);

create index if not exists idx_usage_events_event_name_created_at
  on public.usage_events(event_name, created_at desc);

create index if not exists idx_usage_events_task_created_at
  on public.usage_events(task_id, created_at desc)
  where task_id is not null;
