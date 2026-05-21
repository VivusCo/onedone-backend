import type {
  AnalyzeTaskRequest,
  TaskAnalysis,
  SelectedTemplate,
} from "./analyze_task_types.ts";

const CANCEL_SUBSCRIPTION_KEYWORDS = [
  "cancel subscription",
  "cancel my subscription",
  "unsubscribe",
  "stop subscription",
  "end subscription",
];

const TEMPLATE_TITLE_MAP: Record<string, string> = {
  cancel_subscription: "Cancel Subscription",
  request_refund: "Request Refund",
  return_item: "Return Item",
  understand_bill: "Understand Bill",
  reply_to_message: "Reply to Message",
};

export function normalizeSelectedTemplate(input: AnalyzeTaskRequest): SelectedTemplate {
  const value = input.selected_template;
  if (!value || typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (normalized in TEMPLATE_TITLE_MAP) return normalized as SelectedTemplate;
  return null;
}

export function detectCancelSubscription(inputText: string, selectedTemplate: SelectedTemplate): boolean {
  if (selectedTemplate === "cancel_subscription") return true;

  const normalized = inputText.toLowerCase();
  return CANCEL_SUBSCRIPTION_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function deriveTaskTitle(inputText: string, selectedTemplate: SelectedTemplate): string {
  if (selectedTemplate && TEMPLATE_TITLE_MAP[selectedTemplate]) {
    return TEMPLATE_TITLE_MAP[selectedTemplate];
  }

  const trimmed = inputText.trim().replace(/\s+/g, " ");
  if (!trimmed) return "Untitled Task";

  return trimmed.length <= 80 ? trimmed : `${trimmed.slice(0, 77)}...`;
}

function createCancelSubscriptionAnalysis(billingSource: string): TaskAnalysis {
  const sourceLabel = billingSource.trim();

  return {
    title: "Cancel Subscription",
    summary: `Prepared a cancellation plan for ${sourceLabel}.`,
    current_next_step: `Open ${sourceLabel} billing settings and locate the active subscription.`,
    checklist: [
      { text: `Confirm the subscription owner and billing source (${sourceLabel}).` },
      { text: "Open the cancellation flow and capture the cancellation confirmation." },
      { text: "Set a reminder to verify no renewal charge appears on the next cycle." },
    ],
    safety_note: null,
    risk_level: "low",
    assumptions: [],
    missing_information: [],
  };
}

function createGenericAnalysis(inputText: string): TaskAnalysis {
  const compact = inputText.trim().replace(/\s+/g, " ");

  return {
    title: "Task Plan",
    summary: "Created a deterministic first-pass task plan.",
    current_next_step: "Review the plan and complete checklist item 1.",
    checklist: [
      { text: "Identify the desired outcome in one sentence." },
      { text: "Gather the key details needed to take action." },
      { text: "Send or execute the first concrete action." },
      { text: `Reference note: ${compact.slice(0, 120)}` },
    ],
    safety_note: null,
    risk_level: "low",
    assumptions: [],
    missing_information: [],
  };
}

export function buildDeterministicAnalysis(
  inputText: string,
  selectedTemplate: SelectedTemplate,
  billingSource: string | null,
): TaskAnalysis {
  if (selectedTemplate === "cancel_subscription" && billingSource) {
    return createCancelSubscriptionAnalysis(billingSource);
  }

  return createGenericAnalysis(inputText);
}

export function buildClarificationQuestion(): string {
  return "Which billing source should be used (App Store, card, bank, or other)?";
}
