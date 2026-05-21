import type { AnswerClarificationAnalysis } from "./answer_clarification_types.ts";

const NOT_SURE_PATTERNS = [
  "i'm not sure",
  "im not sure",
  "not sure",
  "don't know",
  "dont know",
  "unsure",
];

export function normalizeBillingSource(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  if (normalized === "app_store" || normalized === "app store") return "app_store";
  return normalized;
}

export function deriveBillingSource(answerText: string, billingSource: string | null): string | null {
  const normalized = normalizeBillingSource(billingSource);
  if (normalized) return normalized;

  const lower = answerText.toLowerCase();
  if (lower.includes("app store")) return "app_store";
  return null;
}

export function isNotSureAnswer(answerText: string): boolean {
  const lower = answerText.toLowerCase();
  return NOT_SURE_PATTERNS.some((pattern) => lower.includes(pattern));
}

export function buildAppStoreCancellationAnalysis(): AnswerClarificationAnalysis {
  return {
    title: "Cancel App Store Subscription",
    summary: "Here is a guided App Store cancellation checklist you can complete directly on your device.",
    current_next_step: "Open iPhone Settings, tap your name, then tap Subscriptions.",
    checklist: [
      { text: "Open Settings on your iPhone and tap your Apple ID (your name) at the top." },
      { text: "Tap Subscriptions, then select the subscription you want to cancel." },
      { text: "Tap Cancel Subscription (or Cancel Free Trial) and confirm the cancellation." },
      { text: "Verify the subscription now shows an expiration date and save a screenshot for your records." },
      { text: "If the subscription is missing, check whether it was purchased with a different Apple ID or directly with the provider." },
    ],
    safety_note: "OneDone guides the steps. It does not cancel subscriptions on your behalf.",
    risk_level: "low",
    assumptions: [],
    missing_information: [],
    path: "app_store_cancellation",
    autonomous_action: false,
  };
}

export function buildHelperPathAnalysis(): AnswerClarificationAnalysis {
  return {
    title: "Find Billing Source First",
    summary: "No problem. Use this helper path to identify the billing source, then continue cancellation safely.",
    current_next_step: "Check your recent receipt emails and locate the most recent subscription charge source.",
    checklist: [
      { text: "Search your email for subscription receipts from Apple, Google, Stripe, or the service provider." },
      { text: "Match the most recent charge date and amount with your bank or card statement." },
      { text: "If you find an Apple receipt, return and choose billing_source = app_store." },
      { text: "If no receipt is found, open the app account/billing page and capture a screenshot of the active plan source." },
    ],
    safety_note: "This path helps you verify billing source before taking cancellation steps.",
    risk_level: "low",
    assumptions: [],
    missing_information: ["Exact billing source and account owner are still unknown."],
    path: "helper",
    autonomous_action: false,
  };
}

export function buildGenericAnalysis(answerText: string): AnswerClarificationAnalysis {
  const compact = answerText.trim().replace(/\s+/g, " ");

  return {
    title: "Clarification Applied",
    summary: "Your clarification was applied and a deterministic next-step plan is ready.",
    current_next_step: "Start with checklist item 1 and update progress after each step.",
    checklist: [
      { text: "Confirm the clarified detail and expected outcome." },
      { text: "Prepare the exact message or action required." },
      { text: "Execute the first action and capture any confirmation output." },
      { text: `Reference detail: ${compact.slice(0, 120)}` },
    ],
    safety_note: null,
    risk_level: "low",
    assumptions: [],
    missing_information: [],
    path: "generic",
    autonomous_action: false,
  };
}
