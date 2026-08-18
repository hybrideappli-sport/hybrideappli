import "server-only";

const STRAVA_API_BASE = "https://www.strava.com/api/v3";

export interface StravaRateLimit {
  shortLimit: number | null;
  shortUsage: number | null;
  dailyLimit: number | null;
  dailyUsage: number | null;
}

function parseRateLimit(headers: Headers): StravaRateLimit {
  const parsePair = (value: string | null): [number | null, number | null] => {
    if (!value) return [null, null];
    const [first, second] = value.split(",").map((v) => (v.trim() ? Number(v.trim()) : null));
    return [first ?? null, second ?? null];
  };
  const [shortLimit, dailyLimit] = parsePair(headers.get("x-ratelimit-limit"));
  const [shortUsage, dailyUsage] = parsePair(headers.get("x-ratelimit-usage"));
  return { shortLimit, dailyLimit, shortUsage, dailyUsage };
}

export class StravaRateLimitedError extends Error {
  rateLimit: StravaRateLimit;
  constructor(message: string, rateLimit: StravaRateLimit) {
    super(message);
    this.rateLimit = rateLimit;
  }
}

export interface StravaFetchResult<T> {
  data: T;
  rateLimit: StravaRateLimit;
}

async function stravaFetch<T>(accessToken: string, path: string): Promise<StravaFetchResult<T>> {
  const response = await fetch(`${STRAVA_API_BASE}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const rateLimit = parseRateLimit(response.headers);

  if (response.status === 429) {
    throw new StravaRateLimitedError(`stravaFetch: quota Strava dépassé sur ${path}.`, rateLimit);
  }
  if (!response.ok) {
    throw new Error(`stravaFetch: ${path} → ${response.status}.`);
  }
  return { data: (await response.json()) as T, rateLimit };
}

export interface StravaActivity {
  id: number;
  sport_type: string;
  start_date: string; // ISO
  elapsed_time: number; // secondes
  moving_time: number; // secondes
  distance: number; // mètres
  total_elevation_gain: number; // mètres
}

export async function fetchActivity(accessToken: string, activityId: string): Promise<StravaFetchResult<StravaActivity>> {
  return stravaFetch<StravaActivity>(accessToken, `/activities/${activityId}`);
}

/**
 * Rattrapage paginé (`strava_backfill`/`strava_reconcile`) — jamais une boucle synchrone non bornée
 * (ADR-013 §1 : « le rattrapage historique doit être paginé, borné et étalé »). `after` est un
 * epoch (secondes).
 */
export async function fetchActivitiesPage(
  accessToken: string,
  args: { after: number; page: number; perPage: number },
): Promise<StravaFetchResult<StravaActivity[]>> {
  return stravaFetch<StravaActivity[]>(accessToken, `/athlete/activities?after=${args.after}&page=${args.page}&per_page=${args.perPage}`);
}
