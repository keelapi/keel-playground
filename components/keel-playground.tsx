"use client";

import { useEffect, useState } from "react";

import {
  API_BASE_URL,
  API_KEY_STORAGE_KEY,
  defaultEndpointId,
  endpointDefinitions,
  type EndpointDefinition,
  type EndpointId,
} from "@/lib/examples";

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

export function KeelPlayground() {
  const [selectedEndpointId, setSelectedEndpointId] =
    useState<EndpointId>(defaultEndpointId);
  const [apiKey, setApiKey] = useState("");
  const [requestBody, setRequestBody] = useState(
    getEndpointDefinition(defaultEndpointId).example,
  );
  const [responseState, setResponseState] = useState<ResponseState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isStorageReady, setIsStorageReady] = useState(false);

  const selectedEndpoint = getEndpointDefinition(selectedEndpointId);

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

  const responseTone = responseState
    ? responseState.status >= 200 && responseState.status < 300
      ? "border-success/40 bg-success/10 text-success"
      : "border-danger/40 bg-danger/10 text-danger"
    : "border-line bg-white/5 text-slate-300";

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <section className="mb-6 overflow-hidden rounded-3xl border border-white/10 bg-panel/80 p-6 shadow-panel backdrop-blur-xl">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center rounded-full border border-accent/30 bg-accentSoft px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-accent">
              Keel API Surface
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Keel Playground
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
              Test Keel API requests interactively.
            </p>
          </div>
          <div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
            <Metric label="Base URL" value={API_BASE_URL} />
            <Metric label="Transport" value="Direct browser fetch" />
            <Metric label="Storage" value="Local API key only" />
          </div>
        </div>
      </section>

      <section className="mb-6 rounded-3xl border border-white/10 bg-panel/70 p-5 shadow-panel backdrop-blur-xl">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="space-y-2">
            <label
              htmlFor="endpoint"
              className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400"
            >
              Endpoint
            </label>
            <select
              id="endpoint"
              value={selectedEndpointId}
              onChange={(event) =>
                setSelectedEndpointId(event.target.value as EndpointId)
              }
              className="w-full rounded-2xl border border-line bg-ink/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-accent"
            >
              {endpointDefinitions.map((endpoint) => (
                <option key={endpoint.id} value={endpoint.id}>
                  {endpoint.label} → {endpoint.method} {endpoint.path}
                </option>
              ))}
            </select>
            <p className="text-sm text-slate-400">{selectedEndpoint.description}</p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="api-key"
              className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400"
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
              placeholder="keel_sk_your_key_here"
              className="w-full rounded-2xl border border-line bg-ink/80 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-accent"
            />
            <p className="text-sm text-slate-400">
              Stored in your browser via <code>localStorage</code>. The key is never
              hardcoded or written to project files.
            </p>
          </div>
        </div>
      </section>

      <section className="mb-4 flex flex-col gap-3 rounded-3xl border border-white/10 bg-panel/60 p-4 shadow-panel backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
            <span className="rounded-full border border-accent/30 bg-accentSoft px-2.5 py-1 text-xs font-medium uppercase tracking-[0.18em] text-accent">
              {selectedEndpoint.group}
            </span>
            <code className="rounded-full border border-line bg-ink/70 px-2.5 py-1 text-xs text-slate-200">
              {selectedEndpoint.method} {selectedEndpoint.path}
            </code>
          </div>
          <p className="mt-2 text-sm text-slate-400">{selectedEndpoint.note}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleResetExample}
            className="rounded-2xl border border-line bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-slate-400 hover:bg-white/10"
          >
            Reset example
          </button>
          <button
            type="button"
            onClick={handleSendRequest}
            disabled={isSending}
            className="rounded-2xl border border-accent/40 bg-accent px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSending ? "Sending..." : "Send request"}
          </button>
        </div>
      </section>

      {errorMessage ? (
        <section className="mb-4 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {errorMessage}
        </section>
      ) : null}

      <section className="grid flex-1 gap-4 xl:grid-cols-2">
        <Panel
          title="Request Body"
          subtitle="Editable JSON payload"
          toolbar={
            <span className="rounded-full border border-line bg-white/5 px-2.5 py-1 text-xs text-slate-300">
              JSON
            </span>
          }
        >
          <textarea
            value={requestBody}
            onChange={(event) => setRequestBody(event.target.value)}
            spellCheck={false}
            className="min-h-[520px] w-full resize-none rounded-2xl border border-line bg-ink/90 p-4 text-sm leading-6 text-slate-100 outline-none transition focus:border-accent"
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
              <div className="rounded-2xl border border-line bg-ink/80 p-4">
                <div className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                  Headers
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">
                  {responseState.headers.length
                    ? formatJson(Object.fromEntries(responseState.headers))
                    : "(no response headers exposed)"}
                </pre>
              </div>

              <div className="rounded-2xl border border-line bg-ink/80 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                    Body
                  </div>
                  <div className="text-xs text-slate-500">
                    {responseState.isJson ? "Formatted JSON" : "Raw text"}
                  </div>
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-words text-sm leading-6 text-slate-100">
                  {responseState.body}
                </pre>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[520px] items-center justify-center rounded-2xl border border-dashed border-line bg-ink/55 p-8 text-center text-sm leading-6 text-slate-400">
              Send a request to inspect the status code, response headers, and body.
            </div>
          )}
        </Panel>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-ink/55 px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 break-words text-sm text-slate-200">{value}</div>
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
    <section className="flex min-h-[620px] flex-col rounded-3xl border border-white/10 bg-panel/75 p-4 shadow-panel backdrop-blur-xl">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
        </div>
        {toolbar}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}
