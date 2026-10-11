type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry<unknown>>();
const pending = new Map<string, Promise<unknown>>();

let budgetDay = "";
let requestsToday = 0;

const MAX_DAILY_REQUESTS = 90;

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function resetBudgetIfNeeded() {
  const today = utcDay();

  if (today !== budgetDay) {
    budgetDay = today;
    requestsToday = 0;
  }
}

export function getRequestUsage() {
  resetBudgetIfNeeded();

  return {
    used: requestsToday,
    budget: MAX_DAILY_REQUESTS,
    remaining: Math.max(0, MAX_DAILY_REQUESTS - requestsToday),
    resetsAt: "00:00 UTC",
  };
}

export function recordApiRequest() {
  resetBudgetIfNeeded();

  if (requestsToday >= MAX_DAILY_REQUESTS) {
    throw new Error(
      "Local daily API budget reached. Cached data remains available."
    );
  }

  requestsToday += 1;
}

export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  const existing = cache.get(key) as CacheEntry<T> | undefined;

  if (existing && existing.expiresAt > Date.now()) {
    return existing.value;
  }

  const existingRequest = pending.get(key) as Promise<T> | undefined;

  if (existingRequest) {
    return existingRequest;
  }

  const request = loader()
    .then((value) => {
      cache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
      });

      return value;
    })
    .finally(() => {
      pending.delete(key);
    });

  pending.set(key, request);
  return request;
}