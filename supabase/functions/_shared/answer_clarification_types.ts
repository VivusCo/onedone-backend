export const ANSWER_CLARIFICATION_MIN_LENGTH = 1;
export const ANSWER_CLARIFICATION_MAX_LENGTH = 1000;

export type AnswerClarificationRequest = {
  task_id: string;
  clarification_id: string;
  answer_text: string;
  billing_source?: string | null;
};

export type AnswerClarificationErrorCode =
  | "unauthorized"
  | "access_blocked"
  | "invalid_request"
  | "not_found"
  | "ownership_mismatch"
  | "clarification_limit_reached"
  | "processing_failed"
  | "internal_error";

export type AnswerClarificationErrorResponse = {
  ok: false;
  error: {
    code: AnswerClarificationErrorCode;
    message: string;
    retryable: boolean;
  };
};

export type AnswerClarificationChecklistItem = {
  text: string;
};

export type AnswerClarificationAnalysis = {
  title: string;
  summary: string;
  current_next_step: string;
  checklist: AnswerClarificationChecklistItem[];
  path: "app_store_cancellation" | "helper" | "generic";
  autonomous_action: false;
};

export type AnswerClarificationSuccessResponse = {
  ok: true;
  response_type: "task_analysis";
  task_id: string;
  task_status: "in_progress";
  access_state: string;
  clarification: {
    id: string;
    status: "answered";
    answered_at: string;
  };
  task_output_id: string;
  task_analysis: AnswerClarificationAnalysis;
};

export type AnswerClarificationResponse =
  | AnswerClarificationSuccessResponse
  | AnswerClarificationErrorResponse;
