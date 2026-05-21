export const AI_TASK_PROMPT_VERSION = "be08_openai_task_analysis_v1";
export const AI_TASK_SCHEMA_VERSION = "task_analysis_schema_v1";

export type AiRiskLevel = "low" | "medium" | "high";

export type AiChecklistItem = {
  text: string;
};

export type AiTaskAnalysis = {
  title: string;
  summary: string;
  current_next_step: string;
  checklist: AiChecklistItem[];
  safety_note: string | null;
  risk_level: AiRiskLevel;
  assumptions: string[];
  missing_information: string[];
};

export const AI_TASK_ANALYSIS_JSON_SCHEMA = {
  name: "onedone_task_analysis_v1",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      summary: { type: "string" },
      current_next_step: { type: "string" },
      checklist: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            text: { type: "string" },
          },
          required: ["text"],
        },
      },
      safety_note: {
        type: ["string", "null"],
      },
      risk_level: {
        type: "string",
        enum: ["low", "medium", "high"],
      },
      assumptions: {
        type: "array",
        items: { type: "string" },
      },
      missing_information: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: [
      "title",
      "summary",
      "current_next_step",
      "checklist",
      "safety_note",
      "risk_level",
      "assumptions",
      "missing_information",
    ],
  },
} as const;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function isAiTaskAnalysis(value: unknown): value is AiTaskAnalysis {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;

  if (typeof candidate.title !== "string") return false;
  if (typeof candidate.summary !== "string") return false;
  if (typeof candidate.current_next_step !== "string") return false;
  if (!(candidate.safety_note === null || typeof candidate.safety_note === "string")) return false;
  if (candidate.risk_level !== "low" && candidate.risk_level !== "medium" && candidate.risk_level !== "high") return false;
  if (!isStringArray(candidate.assumptions)) return false;
  if (!isStringArray(candidate.missing_information)) return false;
  if (!Array.isArray(candidate.checklist)) return false;

  return candidate.checklist.every((item) =>
    item &&
    typeof item === "object" &&
    typeof (item as Record<string, unknown>).text === "string"
  );
}

function compactString(value: string, fallback: string): string {
  const compact = value.trim().replace(/\s+/g, " ");
  return compact ? compact : fallback;
}

function sanitizeStringList(value: string[]): string[] {
  return value
    .map((item) => compactString(item, ""))
    .filter((item) => item.length > 0)
    .slice(0, 6);
}

export function sanitizeAiTaskAnalysis(value: AiTaskAnalysis): AiTaskAnalysis {
  const checklist = value.checklist
    .map((item) => ({ text: compactString(item.text, "") }))
    .filter((item) => item.text.length > 0)
    .slice(0, 8);

  const safeChecklist = checklist.length > 0
    ? checklist
    : [{ text: "Review the task details and identify the first concrete action." }];

  const note = value.safety_note === null ? null : compactString(value.safety_note, "");

  return {
    title: compactString(value.title, "Task Plan"),
    summary: compactString(value.summary, "A task plan has been prepared."),
    current_next_step: compactString(value.current_next_step, "Start with checklist item 1."),
    checklist: safeChecklist,
    safety_note: note && note.length > 0 ? note : null,
    risk_level: value.risk_level,
    assumptions: sanitizeStringList(value.assumptions),
    missing_information: sanitizeStringList(value.missing_information),
  };
}

export function parseAiTaskAnalysis(rawContent: string): AiTaskAnalysis | null {
  try {
    const parsed = JSON.parse(rawContent);
    if (!isAiTaskAnalysis(parsed)) {
      return null;
    }
    return sanitizeAiTaskAnalysis(parsed);
  } catch {
    return null;
  }
}
