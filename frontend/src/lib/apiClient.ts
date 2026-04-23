import { ensureFreshAuthSession } from "@/lib/cognitoAuth";

function getApiBaseUrl() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, "");
  if (!apiBaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_API_BASE_URL for the authenticated Meridian API.");
  }

  return apiBaseUrl;
}

async function createAuthorizedHeaders(headers?: HeadersInit, body?: BodyInit | null) {
  const session = await ensureFreshAuthSession();
  if (!session?.accessToken) {
    throw new Error("Missing Cognito access token for the authenticated Meridian API.");
  }

  const resolvedHeaders = new Headers(headers);
  resolvedHeaders.set("Authorization", `Bearer ${session.accessToken}`);

  if (body && !(body instanceof FormData) && !resolvedHeaders.has("Content-Type")) {
    resolvedHeaders.set("Content-Type", "application/json");
  }

  return resolvedHeaders;
}

export async function apiFetchJson<T>(path: string, init: RequestInit = {}) {
  const body = init.body ?? null;
  const headers = await createAuthorizedHeaders(init.headers, body);
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Meridian API request failed with status ${response.status}.`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function listDigests<T>() {
  return apiFetchJson<T>("/digests", { method: "GET" });
}

export async function createRun<T>(topicName: string) {
  return apiFetchJson<T>("/runs", {
    method: "POST",
    body: JSON.stringify({ topic_name: topicName }),
  });
}

export async function resumeRun<T>(runId: string, answer: string, runAccessToken?: string | null) {
  return apiFetchJson<T>(`/runs/${runId}/resume`, {
    method: "POST",
    body: JSON.stringify({
      run_id: runId,
      answer,
      run_access_token: runAccessToken || undefined,
    }),
  });
}

export async function createStreamTicket<T>(runId: string) {
  return apiFetchJson<T>(`/runs/${runId}/stream-ticket`, {
    method: "POST",
  });
}