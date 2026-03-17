"use client";

import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

import {
  API_BASE_URL,
  API_KEY_STORAGE_KEY,
  defaultEndpointId,
  endpointDefinitions,
  getEndpointIdFromQueryParam,
  type EndpointDefinition,
  type EndpointId,
} from "@/lib/examples";
import {
  buildRequestExamples,
  type SnippetKind,
} from "@/lib/request-examples";

type ResponseState = {
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
  body: string;
  isJson: boolean;
};

function getEndpointDefinition(endpointId: EndpointId): EndpointDefinition {
  const endpoint = endpointDefinitions.find((item) => item.id === endpointId);

  if (!endpoint) {
    throw new Error(`Unknown endpoint: ${endpointId}`);
  }

  return endpoint;
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function getStatusBadgeTone(status: number): string {
  if (status >= 200 && status < 300) {
    return "border-keel-success/30 bg-keel-success/10 text-keel-success";
  }

  if (status === 400) {
    return "border-keel-warning/30 bg-keel-warning/10 text-keel-warning";
  }

  if (status >= 400) {
    return "border-destructive/30 bg-destructive/10 text-destructive";
  }

  return "border-border bg-secondary text-muted-foreground";
}

export function KeelPlayground() {
  const [selectedEndpointId, setSelectedEndpointId] =
    useState<EndpointId>(defaultEndpointId);
  const [apiKey, setApiKey] = useState("");
  const [requestBody, setRequestBody] = useState(
    getEndpointDefinition(defaultEndpointId).example,
  );
  const [activeSnippet, setActiveSnippet] = useState<SnippetKind>("curl");
  const [copiedSnippet, setCopiedSnippet] = useState<SnippetKind | null>(null);
  const [responseState, setResponseState] = useState<ResponseState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isStorageReady, setIsStorageReady] = useState(false);

  const selectedEndpoint = getEndpointDefinition(selectedEndpointId);
  const requestExamples = buildRequestExamples({
    endpoint: selectedEndpoint,
    apiKey,
    requestBody,
  });

  useEffect(() => {
    const endpointIdFromQuery = getEndpointIdFromQueryParam(
      new URLSearchParams(window.location.search).get("endpoint"),
    );

    if (endpointIdFromQuery) {
      setSelectedEndpointId(endpointIdFromQuery);
    }
  }, []);

  useEffect(() => {
    try {
      const storedApiKey = window.localStorage.getItem(API_KEY_STORAGE_KEY);
      if (storedApiKey) {
        setApiKey(storedApiKey);
      }
    } finally {
      setIsStorageReady(true);
    }
  }, []);

  useEffect(() => {
    setRequestBody(selectedEndpoint.example);
    setResponseState(null);
    setErrorMessage(null);
  }, [selectedEndpoint]);

  useEffect(() => {
    if (!isStorageReady) {
      return;
    }

    window.localStorage.setItem(API_KEY_STORAGE_KEY, apiKey.trim());
  }, [apiKey, isStorageReady]);

  async function handleSendRequest() {
    setErrorMessage(null);
    setResponseState(null);

    if (!apiKey.trim()) {
      setErrorMessage("Enter a Keel API key before sending a request.");
      return;
    }

    let parsedBody: unknown;

    try {
      parsedBody = JSON.parse(requestBody);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? `Request body is not valid JSON: ${error.message}`
          : "Request body is not valid JSON.",
      );
      return;
    }

    setIsSending(true);

    try {
      const response = await fetch(`${API_BASE_URL}${selectedEndpoint.path}`, {
        method: selectedEndpoint.method,
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parsedBody),
      });

      const rawBody = await response.text();
      let formattedBody = rawBody;
      let isJson = false;

      if (rawBody) {
        try {
          formattedBody = formatJson(JSON.parse(rawBody));
          isJson = true;
        } catch {
          formattedBody = rawBody;
        }
      }

      setResponseState({
        status: response.status,
        statusText: response.statusText,
        headers: Array.from(response.headers.entries()),
        body: formattedBody || "(empty response body)",
        isJson,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? `Request failed before a response was received: ${error.message}`
          : "Request failed before a response was received.",
      );
    } finally {
      setIsSending(false);
    }
  }

  function handleResetExample() {
    setRequestBody(selectedEndpoint.example);
    setErrorMessage(null);
  }

  async function handleCopySnippet(snippetKind: SnippetKind) {
    try {
      await navigator.clipboard.writeText(requestExamples[snippetKind]);
      setCopiedSnippet(snippetKind);
      window.setTimeout(() => {
        setCopiedSnippet((currentSnippet) =>
          currentSnippet === snippetKind ? null : currentSnippet,
        );
      }, 1800);
    } catch {
      setCopiedSnippet(null);
    }
  }

  const responseTone = responseState
    ? getStatusBadgeTone(responseState.status)
    : "border-border bg-secondary text-muted-foreground";
  const snippetLabels: Record<SnippetKind, string> = {
    curl: "curl",
    javascript: "JavaScript",
    python: "Python",
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 w-full max-w-[1120px] items-center justify-between gap-4 px-4 md:px-6">
          <div className="inline-flex items-center gap-3">
            <div className="rounded-lg bg-primary px-2 py-1 text-sm font-semibold text-primary-foreground">
              Keel
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium tracking-tight">Playground</span>
              <span className="text-xs text-muted-foreground">Interactive API testing</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="https://docs.keelapi.com/quickstart"
              target="_blank"
              rel="noreferrer"
              className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:inline-flex"
            >
              Quickstart
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1120px] flex-col px-4 py-6 md:px-6 md:py-8">
        <section className="mb-6 rounded-xl border border-border bg-card text-card-foreground shadow-sm">
          <div className="flex flex-col gap-6 p-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <div className="mb-4 inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-primary">
                  Keel API Surface
                </div>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Keel Playground
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Test Keel API requests interactively without leaving the governed Keel surface area.
                </p>
              </div>
              <div className="grid gap-3 text-sm sm:grid-cols-3">
                <Metric label="Base URL" value={API_BASE_URL} />
                <Metric label="Transport" value="Direct browser fetch" />
                <Metric label="Storage" value="Local API key only" />
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-xl border border-border bg-card text-card-foreground shadow-sm">
          <div className="grid gap-5 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="space-y-2">
              <label
                htmlFor="endpoint"
                className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
              >
                Endpoint
              </label>
              <select
                id="endpoint"
                value={selectedEndpointId}
                onChange={(event) =>
                  setSelectedEndpointId(event.target.value as EndpointId)
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
              >
                {endpointDefinitions.map((endpoint) => (
                  <option key={endpoint.id} value={endpoint.id}>
                    {endpoint.label} → {endpoint.method} {endpoint.path}
                  </option>
                ))}
              </select>
              <p className="text-sm text-muted-foreground">{selectedEndpoint.description}</p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="api-key"
                className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
              >
                API Key
              </label>
              <input
                id="api-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="keel_sk_live_xxxxxxxxx"
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
              <p className="text-xs text-muted-foreground">
                Need a key?{" "}
                <a
                  href="https://docs.keelapi.com/quickstart"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-foreground underline decoration-border underline-offset-4 transition hover:text-primary"
                >
                  Generate one in the Keel dashboard.
                </a>
              </p>
              <p className="text-sm text-muted-foreground">
                Stored in your browser via <code>localStorage</code>. The key is never
                hardcoded or written to project files.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium uppercase tracking-[0.14em] text-primary">
              {selectedEndpoint.group}
              </span>
              <code className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs text-foreground">
                {selectedEndpoint.method} {selectedEndpoint.path}
              </code>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{selectedEndpoint.note}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleResetExample}
              className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary hover:text-foreground"
            >
              Reset example
            </button>
            <button
              type="button"
              onClick={handleSendRequest}
              disabled={isSending}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSending ? "Sending..." : "Send request"}
            </button>
          </div>
        </section>

        {errorMessage ? (
          <section className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </section>
        ) : null}

        <section className="grid flex-1 gap-4 xl:grid-cols-2">
          <Panel
            title="Request Body"
            subtitle="Editable JSON payload"
            toolbar={
              <span className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
                JSON
              </span>
            }
          >
            <textarea
              value={requestBody}
              onChange={(event) => setRequestBody(event.target.value)}
              spellCheck={false}
              className="min-h-[520px] w-full resize-none rounded-lg border border-input bg-background p-4 text-sm leading-6 outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </Panel>

          <Panel
            title="Response"
            subtitle="Status, headers, and formatted body"
            toolbar={
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${responseTone}`}
              >
                {responseState
                  ? `${responseState.status} ${responseState.statusText}`
                  : "No response yet"}
              </span>
            }
          >
            {responseState ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/50 p-4">
                  <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Status
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${responseTone}`}
                  >
                    {responseState.status} {responseState.statusText}
                  </span>
                </div>

                {responseState.status === 401 ? (
                  <div className="rounded-lg border border-keel-warning/30 bg-keel-warning/10 px-4 py-3 text-sm leading-6 text-foreground">
                    <p className="font-medium">Missing or invalid API key.</p>
                    <p className="mt-1 text-muted-foreground">
                      Use a valid Keel API key. The playground does not create keys.
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      You can generate a key via the Keel dashboard or API.
                    </p>
                  </div>
                ) : null}

                <div className="rounded-lg border border-border bg-secondary/50 p-4">
                  <div className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Headers
                  </div>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                    {responseState.headers.length
                      ? formatJson(Object.fromEntries(responseState.headers))
                      : "(no response headers exposed)"}
                  </pre>
                </div>

                <div className="rounded-lg border border-border bg-secondary/50 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Body
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {responseState.isJson ? "Formatted JSON" : "Raw text"}
                    </div>
                  </div>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                    {responseState.body}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[520px] items-center justify-center rounded-lg border border-dashed border-border bg-secondary/30 p-8 text-center text-sm leading-6 text-muted-foreground">
                Send a request to inspect the status code, response headers, and body.
              </div>
            )}
          </Panel>
        </section>

        <section className="mt-4">
          <Panel
            title="Request Examples"
            subtitle="Copy the current request as curl, fetch, or Python requests"
            toolbar={
              <div className="inline-flex h-10 items-center rounded-md bg-secondary p-1 text-secondary-foreground">
                {(["curl", "javascript", "python"] as SnippetKind[]).map(
                  (snippetKind) => {
                    const isActive = activeSnippet === snippetKind;

                    return (
                      <button
                        key={snippetKind}
                        type="button"
                        onClick={() => setActiveSnippet(snippetKind)}
                        className={`inline-flex items-center justify-center rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
                          isActive
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {snippetLabels[snippetKind]}
                      </button>
                    );
                  },
                )}
              </div>
            }
          >
            <div className="rounded-lg border border-border bg-secondary/50">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {snippetLabels[activeSnippet]}
                </div>
                <button
                  type="button"
                  onClick={() => handleCopySnippet(activeSnippet)}
                  className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-secondary"
                >
                  {copiedSnippet === activeSnippet ? "Copied" : "Copy"}
                </button>
              </div>
              <pre className="overflow-x-auto p-4 text-sm leading-6 text-foreground">
                <code>{requestExamples[activeSnippet]}</code>
              </pre>
            </div>
          </Panel>
        </section>
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/50 px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 break-words text-sm text-foreground">{value}</div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  toolbar,
  children,
}: {
  title: string;
  subtitle: string;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-h-[620px] flex-col rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {toolbar}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}
