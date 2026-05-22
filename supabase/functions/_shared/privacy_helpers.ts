type Client = any;

export type TaskScopedDeletionCounts = {
  analyze_task_idempotency: number;
  reminders: number;
  user_notes: number;
  incoming_replies: number;
  attachments: number;
  task_feedback: number;
  checklist_items: number;
  clarifications: number;
  task_events: number;
  task_outputs: number;
  usage_events: number;
  tasks: number;
  attachment_storage_reference_count: number;
};

export type UserScopedDeletionCounts = {
  analyze_task_idempotency: number;
  reminders: number;
  user_notes: number;
  incoming_replies: number;
  attachments: number;
  task_feedback: number;
  checklist_items: number;
  clarifications: number;
  task_events: number;
  task_outputs: number;
  tasks: number;
  usage_events: number;
  subscription_events: number;
  subscriptions: number;
  attachment_storage_reference_count: number;
};

function deleteQueryWithCount(fromBuilder: any) {
  return fromBuilder.delete({ count: "exact" }).select("id", { head: true, count: "exact" });
}

async function countAttachmentStorageReferences(
  client: Client,
  filters: { userId: string; taskId?: string },
): Promise<number> {
  let query = client
    .from("attachments")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", filters.userId)
    .not("storage_path", "is", null);

  if (filters.taskId) {
    query = query.eq("task_id", filters.taskId);
  }

  const { count, error } = await query;
  if (error) {
    throw new Error("Failed to count attachment storage references");
  }

  return count ?? 0;
}

async function deleteAnalyzeTaskIdempotencyByTask(client: Client, userId: string, taskId: string): Promise<number> {
  const { count, error } = await deleteQueryWithCount(client.from("analyze_task_idempotency"))
    .eq("user_id", userId)
    .eq("task_id", taskId);
  if (error) throw new Error("Failed to delete analyze_task_idempotency rows");
  return count ?? 0;
}

async function deleteByUserAndTask(client: Client, table: string, userId: string, taskId: string, label: string): Promise<number> {
  const { count, error } = await deleteQueryWithCount(client.from(table))
    .eq("user_id", userId)
    .eq("task_id", taskId);
  if (error) throw new Error(`Failed to delete ${label}`);
  return count ?? 0;
}

async function deleteTaskById(client: Client, userId: string, taskId: string): Promise<number> {
  const { count, error } = await deleteQueryWithCount(client.from("tasks"))
    .eq("user_id", userId)
    .eq("id", taskId);
  if (error) throw new Error("Failed to delete task");
  return count ?? 0;
}

async function deleteAnalyzeTaskIdempotencyByUser(client: Client, userId: string): Promise<number> {
  const { count, error } = await deleteQueryWithCount(client.from("analyze_task_idempotency"))
    .eq("user_id", userId);
  if (error) throw new Error("Failed to delete analyze_task_idempotency rows");
  return count ?? 0;
}

async function deleteByUser(client: Client, table: string, userId: string, label: string): Promise<number> {
  const { count, error } = await deleteQueryWithCount(client.from(table)).eq("user_id", userId);
  if (error) throw new Error(`Failed to delete ${label}`);
  return count ?? 0;
}

async function deleteUsageEventsByUser(
  client: Client,
  userId: string,
  includeBillingUsageEvents: boolean,
): Promise<number> {
  let query = deleteQueryWithCount(client.from("usage_events")).eq("user_id", userId);
  if (!includeBillingUsageEvents) {
    query = query.neq("event_category", "billing");
  }

  const { count, error } = await query;
  if (error) throw new Error("Failed to delete usage events");
  return count ?? 0;
}

export function isLikelyUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function deleteTaskScopedUserData(params: {
  client: Client;
  userId: string;
  taskId: string;
}): Promise<TaskScopedDeletionCounts> {
  const { client, userId, taskId } = params;

  const attachmentStorageReferenceCount = await countAttachmentStorageReferences(client, {
    userId,
    taskId,
  });

  const analyzeTaskIdempotencyDeleted = await deleteAnalyzeTaskIdempotencyByTask(client, userId, taskId);
  const remindersDeleted = await deleteByUserAndTask(client, "reminders", userId, taskId, "reminders");
  const userNotesDeleted = await deleteByUserAndTask(client, "user_notes", userId, taskId, "user notes");
  const incomingRepliesDeleted = await deleteByUserAndTask(
    client,
    "incoming_replies",
    userId,
    taskId,
    "incoming replies",
  );
  const attachmentsDeleted = await deleteByUserAndTask(client, "attachments", userId, taskId, "attachment records");
  const taskFeedbackDeleted = await deleteByUserAndTask(client, "task_feedback", userId, taskId, "task feedback");
  const checklistItemsDeleted = await deleteByUserAndTask(
    client,
    "checklist_items",
    userId,
    taskId,
    "checklist items",
  );
  const clarificationsDeleted = await deleteByUserAndTask(
    client,
    "clarifications",
    userId,
    taskId,
    "clarifications",
  );
  const taskEventsDeleted = await deleteByUserAndTask(client, "task_events", userId, taskId, "task events");
  const taskOutputsDeleted = await deleteByUserAndTask(client, "task_outputs", userId, taskId, "task outputs");
  const taskUsageEventsDeleted = await deleteByUserAndTask(client, "usage_events", userId, taskId, "task usage events");
  const tasksDeleted = await deleteTaskById(client, userId, taskId);

  return {
    analyze_task_idempotency: analyzeTaskIdempotencyDeleted,
    reminders: remindersDeleted,
    user_notes: userNotesDeleted,
    incoming_replies: incomingRepliesDeleted,
    attachments: attachmentsDeleted,
    task_feedback: taskFeedbackDeleted,
    checklist_items: checklistItemsDeleted,
    clarifications: clarificationsDeleted,
    task_events: taskEventsDeleted,
    task_outputs: taskOutputsDeleted,
    usage_events: taskUsageEventsDeleted,
    tasks: tasksDeleted,
    attachment_storage_reference_count: attachmentStorageReferenceCount,
  };
}

export async function deleteAllUserData(params: {
  client: Client;
  userId: string;
  includeBillingUsageEvents?: boolean;
  includeSubscriptions?: boolean;
}): Promise<UserScopedDeletionCounts> {
  const { client, userId, includeBillingUsageEvents = false, includeSubscriptions = false } = params;

  const attachmentStorageReferenceCount = await countAttachmentStorageReferences(client, { userId });

  const analyzeTaskIdempotencyDeleted = await deleteAnalyzeTaskIdempotencyByUser(client, userId);
  const remindersDeleted = await deleteByUser(client, "reminders", userId, "reminders");
  const userNotesDeleted = await deleteByUser(client, "user_notes", userId, "user notes");
  const incomingRepliesDeleted = await deleteByUser(client, "incoming_replies", userId, "incoming replies");
  const attachmentsDeleted = await deleteByUser(client, "attachments", userId, "attachment records");
  const taskFeedbackDeleted = await deleteByUser(client, "task_feedback", userId, "task feedback");
  const checklistItemsDeleted = await deleteByUser(client, "checklist_items", userId, "checklist items");
  const clarificationsDeleted = await deleteByUser(client, "clarifications", userId, "clarifications");
  const taskEventsDeleted = await deleteByUser(client, "task_events", userId, "task events");
  const taskOutputsDeleted = await deleteByUser(client, "task_outputs", userId, "task outputs");
  const tasksDeleted = await deleteByUser(client, "tasks", userId, "tasks");
  const usageEventsDeleted = await deleteUsageEventsByUser(client, userId, includeBillingUsageEvents);

  let subscriptionEventsDeleted = 0;
  let subscriptionsDeleted = 0;

  if (includeSubscriptions) {
    subscriptionEventsDeleted = await deleteByUser(client, "subscription_events", userId, "subscription events");
    subscriptionsDeleted = await deleteByUser(client, "subscriptions", userId, "subscriptions");
  }

  return {
    analyze_task_idempotency: analyzeTaskIdempotencyDeleted,
    reminders: remindersDeleted,
    user_notes: userNotesDeleted,
    incoming_replies: incomingRepliesDeleted,
    attachments: attachmentsDeleted,
    task_feedback: taskFeedbackDeleted,
    checklist_items: checklistItemsDeleted,
    clarifications: clarificationsDeleted,
    task_events: taskEventsDeleted,
    task_outputs: taskOutputsDeleted,
    tasks: tasksDeleted,
    usage_events: usageEventsDeleted,
    subscription_events: subscriptionEventsDeleted,
    subscriptions: subscriptionsDeleted,
    attachment_storage_reference_count: attachmentStorageReferenceCount,
  };
}
