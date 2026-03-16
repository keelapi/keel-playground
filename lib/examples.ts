export type EndpointId =
  | "permits"
  | "executions"
  | "execute"
  | "proxy-openai";

export type EndpointDefinition = {
  id: EndpointId;
  label: string;
  group: string;
  path: string;
  method: "POST";
  description: string;
  note: string;
  example: string;
};

export const API_BASE_URL = "https://api.keelapi.com";
export const API_KEY_STORAGE_KEY = "keel-playground-api-key";

export const endpointDefinitions: EndpointDefinition[] = [
  {
    id: "permits",
    label: "Permits",
    group: "Permits",
    path: "/v1/permits",
    method: "POST",
    description: "Canonical permit decision request.",
    note: "Replace project_id with the UUID that matches your project API key.",
    example: JSON.stringify(
      {
        project_id: "11111111-1111-1111-1111-111111111111",
        idempotency_key: "playground-permit-001",
        subject: {
          type: "user",
          id: "usr_demo",
        },
        action: {
          name: "ai.generate.summary",
        },
        resource: {
          type: "request",
          id: "req_playground_001",
          attributes: {
            provider: "openai",
            model: "gpt-4o-mini",
            operation: "generate.text",
            modality: "text",
            execution_mode: "sync",
            estimated_input_tokens: 120,
            estimated_output_tokens: 80,
            max_output_tokens_requested: 120,
          },
        },
      },
      null,
      2,
    ),
  },
  {
    id: "executions",
    label: "Executions",
    group: "Executions",
    path: "/v1/executions",
    method: "POST",
    description: "Provider-neutral governed execution contract.",
    note: "This example mirrors the public canonical text execution shape.",
    example: JSON.stringify(
      {
        operation: "generate.text",
        messages: [
          {
            role: "system",
            content: "Reply in one sentence.",
          },
          {
            role: "user",
            content: "What does Keel do before calling a model?",
          },
        ],
        routing: {
          provider: "openai",
          model: "gpt-4o-mini",
        },
        parameters: {
          max_output_tokens: 80,
          temperature: 0.2,
        },
      },
      null,
      2,
    ),
  },
  {
    id: "execute",
    label: "Execute",
    group: "Execute",
    path: "/v1/execute",
    method: "POST",
    description: "Provider-shaped execution input with normalized Keel output.",
    note: "Use this route when you already have provider-style request payloads.",
    example: JSON.stringify(
      {
        provider: "openai",
        model: "gpt-4o-mini",
        input: {
          messages: [
            {
              role: "user",
              content: "Summarize governed execution in one sentence.",
            },
          ],
          max_tokens: 80,
        },
      },
      null,
      2,
    ),
  },
  {
    id: "proxy-openai",
    label: "Proxy Execution",
    group: "Proxy",
    path: "/v1/proxy/openai",
    method: "POST",
    description: "Provider-native OpenAI-compatible proxy route.",
    note: "This route returns provider-native output rather than the normalized execution envelope.",
    example: JSON.stringify(
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: "Summarize this text in one sentence.",
          },
        ],
        max_tokens: 200,
      },
      null,
      2,
    ),
  },
];

export const defaultEndpointId: EndpointId = "permits";
