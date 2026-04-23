const AUTH_SESSION_KEY = "meridian:auth-session";
const AUTH_SESSION_EVENT = "meridian:auth-session-updated";
const OAUTH_STATE_KEY = "meridian:oauth-state";
const OAUTH_PKCE_VERIFIER_KEY = "meridian:oauth-pkce-verifier";
const OAUTH_RETURN_TO_KEY = "meridian:oauth-return-to";
const SESSION_REFRESH_WINDOW_SECONDS = 60;

type CognitoTokenResponse = {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
};

type CognitoIdTokenClaims = {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
};

type AuthConfig = {
  domain: string;
  clientId: string;
  redirectUri: string;
  logoutUri: string;
  scope: string;
};

export type AuthSession = {
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt: number;
  user: CognitoIdTokenClaims;
};

let cachedAuthSessionRaw: string | null = null;
let cachedAuthSession: AuthSession | null = null;

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage;
}

function notifyAuthSessionChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(AUTH_SESSION_EVENT));
}

function normalizeBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

function getBrowserRedirectUrl(pathname: string) {
  if (typeof window === "undefined") {
    return "";
  }

  return `${window.location.origin}${pathname}`;
}

export function getMissingAuthConfigKeys() {
  const missing: string[] = [];

  if (!process.env.NEXT_PUBLIC_COGNITO_DOMAIN?.trim()) {
    missing.push("NEXT_PUBLIC_COGNITO_DOMAIN");
  }

  if (!process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID?.trim()) {
    missing.push("NEXT_PUBLIC_COGNITO_CLIENT_ID");
  }

  return missing;
}

export function isAuthConfigured() {
  return getMissingAuthConfigKeys().length === 0;
}

function getAuthConfig(): AuthConfig {
  const missing = getMissingAuthConfigKeys();
  if (missing.length > 0) {
    throw new Error(`Missing auth configuration: ${missing.join(", ")}`);
  }

  return {
    domain: normalizeBaseUrl(process.env.NEXT_PUBLIC_COGNITO_DOMAIN || ""),
    clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || "",
    redirectUri: process.env.NEXT_PUBLIC_COGNITO_REDIRECT_URI || getBrowserRedirectUrl("/auth/callback"),
    logoutUri: process.env.NEXT_PUBLIC_COGNITO_LOGOUT_URI || getBrowserRedirectUrl("/"),
    scope: process.env.NEXT_PUBLIC_COGNITO_SCOPES || "openid email profile",
  };
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(`${normalized}${padding}`);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function parseIdTokenClaims(idToken: string): CognitoIdTokenClaims {
  const parts = idToken.split(".");
  if (parts.length < 2) {
    throw new Error("Invalid ID token received from Cognito.");
  }

  return JSON.parse(decodeBase64Url(parts[1])) as CognitoIdTokenClaims;
}

function buildSession(tokens: CognitoTokenResponse, existingRefreshToken?: string): AuthSession {
  const refreshToken = tokens.refresh_token || existingRefreshToken;

  return {
    accessToken: tokens.access_token,
    idToken: tokens.id_token,
    refreshToken,
    tokenType: tokens.token_type,
    expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
    user: parseIdTokenClaims(tokens.id_token),
  };
}

function createRandomString(size: number) {
  const values = new Uint8Array(size);
  crypto.getRandomValues(values);
  return encodeBase64Url(values);
}

async function createPkceChallenge(verifier: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return encodeBase64Url(new Uint8Array(hash));
}

function getStoredSessionValue() {
  const storage = getStorage();
  return storage?.getItem(AUTH_SESSION_KEY) || null;
}

export function getAuthSession() {
  const rawValue = getStoredSessionValue();
  if (!rawValue) {
    cachedAuthSessionRaw = null;
    cachedAuthSession = null;
    return null;
  }

  if (rawValue === cachedAuthSessionRaw) {
    return cachedAuthSession;
  }

  try {
    const parsedSession = JSON.parse(rawValue) as AuthSession;
    cachedAuthSessionRaw = rawValue;
    cachedAuthSession = parsedSession;
    return parsedSession;
  } catch {
    clearAuthSession();
    return null;
  }
}

export function getAccessToken() {
  return getAuthSession()?.accessToken || null;
}

function storeAuthSession(session: AuthSession) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const serializedSession = JSON.stringify(session);
  cachedAuthSessionRaw = serializedSession;
  cachedAuthSession = session;
  storage.setItem(AUTH_SESSION_KEY, serializedSession);
  notifyAuthSessionChanged();
}

export function clearAuthSession() {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  cachedAuthSessionRaw = null;
  cachedAuthSession = null;
  storage.removeItem(AUTH_SESSION_KEY);
  notifyAuthSessionChanged();
}

function clearPendingOAuthRequest() {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(OAUTH_STATE_KEY);
  storage.removeItem(OAUTH_PKCE_VERIFIER_KEY);
}

function getPendingOAuthRequest() {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const state = storage.getItem(OAUTH_STATE_KEY);
  const verifier = storage.getItem(OAUTH_PKCE_VERIFIER_KEY);
  if (!state || !verifier) {
    return null;
  }

  return { state, verifier };
}

function storeReturnPath(pathname: string) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.setItem(OAUTH_RETURN_TO_KEY, pathname || "/");
}

export function consumeReturnPath() {
  const storage = getStorage();
  if (!storage) {
    return "/";
  }

  const returnPath = storage.getItem(OAUTH_RETURN_TO_KEY) || "/";
  storage.removeItem(OAUTH_RETURN_TO_KEY);
  return returnPath;
}

async function requestTokens(params: URLSearchParams) {
  const config = getAuthConfig();
  const response = await fetch(`${config.domain}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Cognito token exchange failed with status ${response.status}.`);
  }

  return response.json() as Promise<CognitoTokenResponse>;
}

export async function startHostedUiSignIn(returnTo: string) {
  const storage = getStorage();
  if (!storage) {
    throw new Error("Browser session storage is unavailable.");
  }

  const config = getAuthConfig();
  const state = createRandomString(32);
  const verifier = createRandomString(64);
  const challenge = await createPkceChallenge(verifier);
  const authorizeUrl = new URL(`${config.domain}/oauth2/authorize`);

  storage.setItem(OAUTH_STATE_KEY, state);
  storage.setItem(OAUTH_PKCE_VERIFIER_KEY, verifier);
  storeReturnPath(returnTo);

  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizeUrl.searchParams.set("scope", config.scope);
  authorizeUrl.searchParams.set("identity_provider", "Google");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("code_challenge", challenge);

  window.location.assign(authorizeUrl.toString());
}

export async function completeHostedUiSignIn(code: string, state: string) {
  const pendingRequest = getPendingOAuthRequest();
  if (!pendingRequest) {
    throw new Error("Missing PKCE state for the Cognito sign-in flow.");
  }

  if (pendingRequest.state !== state) {
    clearPendingOAuthRequest();
    throw new Error("Invalid OAuth state received from Cognito.");
  }

  const config = getAuthConfig();
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    code,
    code_verifier: pendingRequest.verifier,
    redirect_uri: config.redirectUri,
  });

  const tokens = await requestTokens(params);
  const session = buildSession(tokens);
  clearPendingOAuthRequest();
  storeAuthSession(session);
  return session;
}

export async function ensureFreshAuthSession() {
  const session = getAuthSession();
  if (!session) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (session.expiresAt > now + SESSION_REFRESH_WINDOW_SECONDS) {
    return session;
  }

  if (!session.refreshToken) {
    clearAuthSession();
    return null;
  }

  const config = getAuthConfig();
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.clientId,
    refresh_token: session.refreshToken,
  });

  try {
    const refreshedTokens = await requestTokens(params);
    const refreshedSession = buildSession(refreshedTokens, session.refreshToken);
    storeAuthSession(refreshedSession);
    return refreshedSession;
  } catch {
    clearAuthSession();
    return null;
  }
}

export function subscribeToAuthSession(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (!event.key || event.key === AUTH_SESSION_KEY) {
      onStoreChange();
    }
  };

  const handleAuthUpdate = () => {
    onStoreChange();
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(AUTH_SESSION_EVENT, handleAuthUpdate);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(AUTH_SESSION_EVENT, handleAuthUpdate);
  };
}

export function signOutFromHostedUi() {
  clearAuthSession();
  clearPendingOAuthRequest();

  if (typeof window === "undefined" || !isAuthConfigured()) {
    return;
  }

  const config = getAuthConfig();
  const logoutUrl = new URL(`${config.domain}/logout`);
  logoutUrl.searchParams.set("client_id", config.clientId);
  logoutUrl.searchParams.set("logout_uri", config.logoutUri);
  window.location.assign(logoutUrl.toString());
}