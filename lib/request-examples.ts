import { API_BASE_URL, type EndpointDefinition } from "@/lib/examples";

export type SnippetKind = "curl" | "javascript" | "python";

export type RequestExamples = Record<SnippetKind, string>;

const API_KEY_PLACEHOLDER = "keel_sk_your_key_here";

function formatJsonBody(requestBody: string): string {
  try {
    return JSON.stringify(JSON.parse(requestBody), null, 2);
  } catch {
    return requestBody;
  }
}

function getApiKeyValue(apiKey: string): string {
  return apiKey.trim() || API_KEY_PLACEHOLDER;
}

function indentLines(value: string, spaces: number): string {
  const padding = " ".repeat(spaces);

  return value
    .split("\n")
    .map((line) => `${padding}${line}`)
    .join("\n");
}

export function buildRequestExamples({
  endpoint,
  apiKey,
  requestBody,
}: {
  endpoint: EndpointDefinition;
  apiKey: string;
  requestBody: string;
}): RequestExamples {
  const apiKeyValue = getApiKeyValue(apiKey);
  const formattedBody = formatJsonBody(requestBody);
  const url = `${API_BASE_URL}${endpoint.path}`;
  const bodyForCurl = formattedBody.replace(/'/g, "'\"'\"'");

  return {
    curl: `curl -X ${endpoint.method} "${url}" \\
  -H "Authorization: Bearer ${apiKeyValue}" \\
  -H "Content-Type: application/json" \\
  --data-raw '${bodyForCurl}'`,
    javascript: `const response = await fetch("${url}", {
  method: "${endpoint.method}",
  headers: {
    Authorization: "Bearer ${apiKeyValue}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify(
${indentLines(formattedBody, 4)}
  ),
});

const data = await response.json();
console.log(data);`,
    python: `import requests

url = "${url}"
headers = {
    "Authorization": "Bearer ${apiKeyValue}",
    "Content-Type": "application/json",
}
payload = ${formattedBody}

response = requests.post(url, headers=headers, json=payload)
print(response.json())`,
  };
}
