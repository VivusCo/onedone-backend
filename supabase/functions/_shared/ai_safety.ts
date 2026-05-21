import type { AiTaskAnalysis, AiRiskLevel } from "./ai_task_analysis_schema.ts";

export type SensitiveCategory = "none" | "legal" | "medical" | "financial";

const LEGAL_KEYWORDS = [
  "legal",
  "lawsuit",
  "sue",
  "court",
  "attorney",
  "lawyer",
  "contract",
  "terms of service",
];

const MEDICAL_KEYWORDS = [
  "medical",
  "doctor",
  "diagnosis",
  "diagnose",
  "symptom",
  "treatment",
  "prescription",
  "hospital",
  "health",
];

const FINANCIAL_KEYWORDS = [
  "financial",
  "investment",
  "invest",
  "tax",
  "loan",
  "debt",
  "mortgage",
  "interest rate",
  "bankruptcy",
];

export function detectSensitiveCategory(text: string): SensitiveCategory {
  const normalized = text.toLowerCase();

  if (LEGAL_KEYWORDS.some((keyword) => normalized.includes(keyword))) return "legal";
  if (MEDICAL_KEYWORDS.some((keyword) => normalized.includes(keyword))) return "medical";
  if (FINANCIAL_KEYWORDS.some((keyword) => normalized.includes(keyword))) return "financial";
  return "none";
}

export function buildSafetyInstruction(category: SensitiveCategory): string {
  if (category === "none") {
    return "Use practical and concise guidance. Avoid claiming actions are completed unless user must do them manually.";
  }

  return [
    "This request can involve high-stakes decisions.",
    "Do not provide definitive professional advice.",
    "Provide educational guidance with cautious next steps.",
    "Encourage the user to verify details with qualified professionals when needed.",
    "Include safety_note, assumptions, and missing_information fields with actionable content.",
  ].join(" ");
}

function ensureList(values: string[], fallback: string): string[] {
  if (values.length > 0) return values;
  return [fallback];
}

function getSensitiveDefaults(category: Exclude<SensitiveCategory, "none">): {
  note: string;
  riskLevel: AiRiskLevel;
  assumptionFallback: string;
  missingInfoFallback: string;
} {
  switch (category) {
    case "legal":
      return {
        note: "This is informational guidance, not legal advice.",
        riskLevel: "high",
        assumptionFallback: "Applicable laws and contract terms may vary by jurisdiction.",
        missingInfoFallback: "Jurisdiction, contract details, and deadlines are needed for legal certainty.",
      };
    case "medical":
      return {
        note: "This is informational guidance, not medical advice.",
        riskLevel: "high",
        assumptionFallback: "Symptoms, diagnosis, and care history are not fully known.",
        missingInfoFallback: "Current symptoms, medication list, and clinician advice are needed.",
      };
    case "financial":
      return {
        note: "This is informational guidance, not financial advice.",
        riskLevel: "medium",
        assumptionFallback: "Account terms, fees, and local regulations can change outcomes.",
        missingInfoFallback: "Account type, balances, deadlines, and policy terms are needed.",
      };
  }
}

export function applySafetyGuardrails(
  analysis: AiTaskAnalysis,
  category: SensitiveCategory,
): AiTaskAnalysis {
  if (category === "none") {
    return analysis;
  }

  const defaults = getSensitiveDefaults(category);
  const mergedRisk: AiRiskLevel = analysis.risk_level === "high"
    ? "high"
    : defaults.riskLevel === "high"
    ? "high"
    : analysis.risk_level === "medium" || defaults.riskLevel === "medium"
    ? "medium"
    : "low";

  const note = analysis.safety_note && analysis.safety_note.trim().length > 0
    ? analysis.safety_note.trim()
    : defaults.note;

  return {
    ...analysis,
    safety_note: note,
    risk_level: mergedRisk,
    assumptions: ensureList(analysis.assumptions, defaults.assumptionFallback),
    missing_information: ensureList(analysis.missing_information, defaults.missingInfoFallback),
  };
}
