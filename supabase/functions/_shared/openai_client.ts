type JsonSchemaFormat = {
  name: string;
  strict: boolean;
  schema: Record<string, unknown>;
};

type OpenAiChatCompletionRequest = {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  response_format: {
    type: "json_schema";
    json_schema: JsonSchemaFormat;
  };
  temperature?: number;
  safety_identifier?: string;
};

type OpenAiChatCompletionUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type OpenAiChatCompletionResponse = {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
      refusal?: string | null;
    };
  }>;
  usage?: OpenAiChatCompletionUsage;
  error?: {
    message?: string;
  };
};

export type OpenAiUsageDetails = {
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd_estimate: number | null;
};

export type OpenAiStructuredResult =
  | {
    ok: true;
    model: string;
    content: string;
    usage: OpenAiUsageDetails;
  }
  | {
    ok: false;
    code: "configuration_error" | "request_error" | "invalid_json";
    message: string;
    retryable: boolean;
    usage: OpenAiUsageDetails | null;
  };

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

type ModelCost = {
  inputPerMillion: number;
  outputPerMillion: number;
};

// Cost map is intentionally minimal and only used for lightweight telemetry estimates.
const MODEL_COSTS_USD_PER_MILLION_TOKENS: Record<string, ModelCost> = {
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "gpt-4o-mini-2024-07-18": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "gpt-4o-2024-08-06": { inputPerMillion: 2.5, outputPerMillion: 10.0 },
};

function toUsage(model: string, usage: OpenAiChatCompletionUsage | undefined): OpenAiUsageDetails {
  const promptTokens = usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.completion_tokens ?? 0;
  const totalTokens = usage?.total_tokens ?? promptTokens + completionTokens;

  const pricing = MODEL_COSTS_USD_PER_MILLION_TOKENS[model];
  const cost = pricing
    ? ((promptTokens / 1_000_000) * pricing.inputPerMillion) +
      ((completionTokens / 1_000_000) * pricing.outputPerMillion)
    : null;

  return {
    model,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    cost_usd_estimate: cost === null ? null : Number(cost.toFixed(8)),
  };
}

function getOpenAiConfig() {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  const modelFromEnv = Deno.env.get("OPENAI_MODEL")?.trim();
  const model = modelFromEnv && modelFromEnv.length > 0 ? modelFromEnv : DEFAULT_OPENAI_MODEL;

  if (!apiKey) {
    return { ok: false as const, message: "OPENAI_API_KEY is not configured for this environment." };
  }

  return { ok: true as const, apiKey, model };
}

export async function callOpenAiStructuredJson(params: {
  systemPrompt: string;
  userPrompt: string;
  schema: JsonSchemaFormat;
  safetyIdentifier: string;
  temperature?: number;
}): Promise<OpenAiStructuredResult> {
  const config = getOpenAiConfig();
  if (!config.ok) {
    return {
      ok: false,
      code: "configuration_error",
      message: config.message,
      retryable: false,
      usage: null,
    };
  }

  const requestBody: OpenAiChatCompletionRequest = {
    model: config.model,
    messages: [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: params.schema,
    },
    temperature: params.temperature ?? 0.2,
    safety_identifier: params.safetyIdentifier,
  };

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });
  } catch {
    return {
      ok: false,
      code: "request_error",
      message: "Failed to reach OpenAI.",
      retryable: true,
      usage: null,
    };
  }

  let payload: OpenAiChatCompletionResponse;
  try {
    payload = await response.json() as OpenAiChatCompletionResponse;
  } catch {
    return {
      ok: false,
      code: "invalid_json",
      message: "OpenAI returned a non-JSON response.",
      retryable: true,
      usage: toUsage(config.model, undefined),
    };
  }

  const model = payload.model ?? config.model;
  const usage = toUsage(model, payload.usage);

  if (!response.ok) {
    return {
      ok: false,
      code: "request_error",
      message: payload.error?.message ?? "OpenAI request failed.",
      retryable: response.status >= 500 || response.status === 429,
      usage,
    };
  }

  const choice = payload.choices?.[0];
  const content = choice?.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    return {
      ok: false,
      code: "invalid_json",
      message: choice?.message?.refusal
        ? "OpenAI refused this request."
        : "OpenAI returned an empty response payload.",
      retryable: true,
      usage,
    };
  }

  return {
    ok: true,
    model,
    content,
    usage,
  };
}
