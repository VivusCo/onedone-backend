alter table public.task_outputs
  add column if not exists prompt_version text,
  add column if not exists schema_version text;
