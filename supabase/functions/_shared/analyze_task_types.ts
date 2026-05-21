export const ANALYZE_TASK_MIN_INPUT_LENGTH = 3;
export const ANALYZE_TASK_MAX_INPUT_LENGTH = 4000;

export type SelectedTemplate =
  | "cancel_subscription"
  | "request_refund"
  | "return_item"
  | "understand_bill"
  | "reply_to_message"
  | null;

export type AnalyzeTaskRequest = {
  input_text: string;
  selected_template?: SelectedTemplate | string;
  billing_source?: string | null;
};

export type ErrorCode =
  | "unauthorized"
  | "access_blocked"
  | "invalid_request"
  | "idempotency_conflict"
  | "idempotency_in_progress"
  | "processing_failed"
  | "internal_error";

export type ErrorResponse = {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
  };
};

export type ChecklistItem = {
  text: string;
};

export type DeterministicTaskAnalysis = {
  summary: string;
  current_next_step: string;
  checklist: ChecklistItem[];
};

export type ClarificationSuccessResponse = {
  ok: true;
  response_type: "clarification";
  idempotent_replay: boolean;
  task_id: string;
  task_status: "needs_clarification";
  access_state: string;
  clarification: {
    id: string;
    question: string;
    status: "open";
  };
  task_output_id: null;
  task_analysis: null;
};

export type TaskAnalysisSuccessResponse = {
  ok: true;
  response_type: "task_analysis";
  idempotent_replay: boolean;
  task_id: string;
  task_status: "in_progress";
  access_state: string;
  clarification: null;
  task_output_id: string;
  task_analysis: DeterministicTaskAnalysis;
};

export type AnalyzeTaskSuccessResponse =
  | ClarificationSuccessResponse
  | TaskAnalysisSuccessResponse;

export type AnalyzeTaskResponse = AnalyzeTaskSuccessResponse | ErrorResponse;
