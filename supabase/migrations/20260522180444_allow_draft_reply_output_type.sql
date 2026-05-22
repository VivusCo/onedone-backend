alter table public.task_outputs
  drop constraint if exists task_outputs_output_type_check;

alter table public.task_outputs
  add constraint task_outputs_output_type_check
  check (
    output_type in (
      'analysis',
      'generated_reply',
      'draft_reply',
      'task_split',
      'checklist',
      'summary',
      'other'
    )
  );
