const RUN_ACCESS_PREFIX = "meridian:run-access:";
const RUN_ACCESS_EVENT_NAME = "meridian:run-access-updated";

type StoredRunAccess = {
  token: string;
  expiresAt: number;
};

function storageKey(runId: string) {
  return `${RUN_ACCESS_PREFIX}${runId}`;
}

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function notifyRunAccessChange(runId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(RUN_ACCESS_EVENT_NAME, { detail: { runId } }));
}

export function storeRunAccessToken(runId: string, token: string, expiresAt: number) {
  const storage = getStorage();
  if (!storage || !runId || !token || !Number.isFinite(expiresAt)) {
    return;
  }

  const value: StoredRunAccess = { token, expiresAt };
  storage.setItem(storageKey(runId), JSON.stringify(value));
  notifyRunAccessChange(runId);
}

export function getRunAccessToken(runId: string) {
  const storage = getStorage();
  if (!storage || !runId) {
    return null;
  }

  const rawValue = storage.getItem(storageKey(runId));
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as StoredRunAccess;
    if (!parsed.token || !Number.isFinite(parsed.expiresAt)) {
      storage.removeItem(storageKey(runId));
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (parsed.expiresAt <= now) {
      storage.removeItem(storageKey(runId));
      return null;
    }

    return parsed.token;
  } catch {
    storage.removeItem(storageKey(runId));
    return null;
  }
}

export function clearRunAccessToken(runId: string) {
  const storage = getStorage();
  if (!storage || !runId) {
    return;
  }

  storage.removeItem(storageKey(runId));
  notifyRunAccessChange(runId);
}

export function subscribeToRunAccessToken(runId: string, onChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (!event.key || event.key === storageKey(runId)) {
      onChange();
    }
  };

  const handleLocalUpdate = (event: Event) => {
    const customEvent = event as CustomEvent<{ runId?: string }>;
    if (!customEvent.detail?.runId || customEvent.detail.runId === runId) {
      onChange();
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(RUN_ACCESS_EVENT_NAME, handleLocalUpdate as EventListener);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(RUN_ACCESS_EVENT_NAME, handleLocalUpdate as EventListener);
  };
}