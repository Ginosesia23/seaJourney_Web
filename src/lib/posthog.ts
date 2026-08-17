type HogQLQueryResponse = {
  results?: unknown[][];
  columns?: string[];
  error?: string;
};

export type PostHogRange = '7d' | '30d' | '90d';

export type MatchedSeaJourneyUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  username: string;
};

export type PostHogRecentEvent = {
  timestamp: string;
  event: string;
  distinctId: string;
  email: string;
  path: string;
  browser: string;
  device: string;
  os: string;
  matchedUser: MatchedSeaJourneyUser | null;
};

export type PostHogExceptionEvent = {
  timestamp: string;
  distinctId: string;
  email: string;
  type: string;
  message: string;
  source: string;
  level: string;
  path: string;
  browser: string;
  os: string;
  stack: string;
  issueId: string;
  matchedUser: MatchedSeaJourneyUser | null;
};

export type PostHogExceptionGroup = {
  type: string;
  message: string;
  occurrences: number;
  users: number;
  lastSeen: string;
};

export type PostHogPerson = {
  distinctId: string;
  email: string;
  personRole: string;
  events: number;
  pageviews: number;
  exceptions: number;
  firstSeen: string;
  lastSeen: string;
  matchedUser: MatchedSeaJourneyUser | null;
};

export type PostHogLocatedPerson = {
  distinctId: string;
  email: string;
  city: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  events: number;
  lastSeen: string;
  matchedUser: MatchedSeaJourneyUser | null;
};

export type PostHogAnalytics = {
  range: PostHogRange;
  days: number;
  generatedAt: string;
  totals: {
    uniqueUsers: number;
    uniqueUsersPrev: number;
    pageviews: number;
    pageviewsPrev: number;
    events: number;
    eventsPrev: number;
    sessions: number;
    sessionsPrev: number;
    exceptions: number;
    exceptionsPrev: number;
  };
  trend: Array<{
    day: string;
    uniqueUsers: number;
    pageviews: number;
    events: number;
  }>;
  topPages: Array<{ path: string; views: number; users: number }>;
  topEvents: Array<{ event: string; count: number; users: number }>;
  devices: Array<{ device: string; users: number; events: number }>;
  recentEvents: PostHogRecentEvent[];
  people: PostHogPerson[];
  exceptions: PostHogExceptionEvent[];
  exceptionGroups: PostHogExceptionGroup[];
  countries: Array<{ country: string; countryCode: string; users: number; events: number }>;
  locations: Array<{
    lat: number;
    lng: number;
    city: string;
    country: string;
    countryCode: string;
    users: number;
    events: number;
  }>;
  locatedPeople: PostHogLocatedPerson[];
};

function posthogHost(): string {
  return (process.env.POSTHOG_HOST || 'https://us.posthog.com').replace(/\/$/, '');
}

function isConfigured(): boolean {
  return Boolean(process.env.POSTHOG_PERSONAL_API_KEY && process.env.POSTHOG_PROJECT_ID);
}

export function getPostHogConfigError(): string | null {
  const personalKey = (process.env.POSTHOG_PERSONAL_API_KEY || '').trim();
  if (!personalKey) {
    return 'POSTHOG_PERSONAL_API_KEY is not set. Create a personal API key in PostHog (Settings → Personal API keys) with query:read. It starts with phx_, not phc_.';
  }
  if (personalKey.startsWith('phc_')) {
    return 'POSTHOG_PERSONAL_API_KEY is a project API key (phc_). Put that in NEXT_PUBLIC_POSTHOG_KEY, and create a personal API key (phx_) for this field.';
  }
  if (!process.env.POSTHOG_PROJECT_ID) {
    return 'POSTHOG_PROJECT_ID is not set. Copy the project ID from PostHog project settings.';
  }
  return null;
}

function rangeDays(range: PostHogRange): number {
  if (range === '7d') return 7;
  if (range === '90d') return 90;
  return 30;
}

function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toStringValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return String(value);
}

function rowsToObjects(payload: HogQLQueryResponse): Record<string, unknown>[] {
  const columns = payload.columns ?? [];
  const results = payload.results ?? [];
  return results.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
}

async function runHogQL(sql: string, name: string): Promise<Record<string, unknown>[]> {
  const host = posthogHost();
  const projectId = process.env.POSTHOG_PROJECT_ID!;
  const key = (process.env.POSTHOG_PERSONAL_API_KEY || '').trim();

  const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: { kind: 'HogQLQuery', query: sql },
      name,
    }),
    cache: 'no-store',
  });

  const payload = (await res.json().catch(() => ({}))) as HogQLQueryResponse & {
    detail?: string | { detail?: string };
    type?: string;
  };

  if (!res.ok) {
    const detail =
      typeof payload.detail === 'string'
        ? payload.detail
        : payload.detail && typeof payload.detail === 'object'
          ? payload.detail.detail
          : payload.error;
    throw new Error(detail || `PostHog query failed (${res.status})`);
  }

  return rowsToObjects(payload);
}

async function runHogQLSafe(sql: string, name: string): Promise<Record<string, unknown>[]> {
  try {
    return await runHogQL(sql, name);
  } catch (err) {
    console.warn(`[posthog] ${name} failed:`, err);
    return [];
  }
}

function totalsSql(days: number, offsetDays: number): string {
  const start = days + offsetDays;
  const end = offsetDays;
  const endClause =
    end === 0
      ? ''
      : ` AND timestamp < now() - interval ${end} day`;
  return `
    SELECT
      uniq(person_id) AS unique_users,
      countIf(event = '$pageview') AS pageviews,
      count() AS events,
      uniq(properties.$session_id) AS sessions,
      countIf(event = '$exception') AS exceptions
    FROM events
    WHERE timestamp >= now() - interval ${start} day
      ${endClause}
  `;
}

export async function fetchPostHogAnalytics(range: PostHogRange): Promise<PostHogAnalytics> {
  if (!isConfigured()) {
    throw new Error(getPostHogConfigError() || 'PostHog is not configured');
  }

  const days = rangeDays(range);

  const [
    current,
    previous,
    trend,
    topPages,
    topEvents,
    devices,
    recentEvents,
    people,
    exceptions,
    exceptionGroups,
    countries,
    locations,
    locatedPeople,
  ] = await Promise.all([
    runHogQL(totalsSql(days, 0), `seajourney-admin-totals-${days}`),
    runHogQL(totalsSql(days, days), `seajourney-admin-totals-prev-${days}`),
    runHogQL(
      `
        SELECT
          toDate(timestamp) AS day,
          uniq(person_id) AS unique_users,
          countIf(event = '$pageview') AS pageviews,
          count() AS events
        FROM events
        WHERE timestamp >= now() - interval ${days} day
        GROUP BY day
        ORDER BY day ASC
      `,
      `seajourney-admin-trend-${days}`,
    ),
    runHogQL(
      `
        SELECT
          coalesce(nullIf(properties.$pathname, ''), properties.$current_url, '(unknown)') AS path,
          count() AS views,
          uniq(person_id) AS users
        FROM events
        WHERE event = '$pageview'
          AND timestamp >= now() - interval ${days} day
        GROUP BY path
        ORDER BY views DESC
        LIMIT 15
      `,
      `seajourney-admin-pages-${days}`,
    ),
    runHogQL(
      `
        SELECT
          event,
          count() AS count,
          uniq(person_id) AS users
        FROM events
        WHERE timestamp >= now() - interval ${days} day
        GROUP BY event
        ORDER BY count DESC
        LIMIT 15
      `,
      `seajourney-admin-events-${days}`,
    ),
    runHogQL(
      `
        SELECT
          coalesce(nullIf(toString(properties.$device_type), ''), 'Unknown') AS device,
          uniq(person_id) AS users,
          count() AS events
        FROM events
        WHERE timestamp >= now() - interval ${days} day
        GROUP BY device
        ORDER BY users DESC
      `,
      `seajourney-admin-devices-${days}`,
    ),
    runHogQLSafe(
      `
        SELECT
          timestamp,
          event,
          distinct_id,
          toString(person.properties.email) AS email,
          coalesce(nullIf(toString(properties.$pathname), ''), toString(properties.$current_url), '') AS path,
          toString(properties.$browser) AS browser,
          toString(properties.$device_type) AS device,
          toString(properties.$os) AS os
        FROM events
        WHERE timestamp >= now() - interval ${days} day
          AND event != '$pageleave'
        ORDER BY timestamp DESC
        LIMIT 80
      `,
      `seajourney-admin-recent-${days}`,
    ),
    runHogQLSafe(
      `
        SELECT
          distinct_id,
          any(toString(person.properties.email)) AS email,
          any(toString(person.properties.role)) AS person_role,
          count() AS events,
          countIf(event = '$pageview') AS pageviews,
          countIf(event = '$exception') AS exceptions,
          min(timestamp) AS first_seen,
          max(timestamp) AS last_seen
        FROM events
        WHERE timestamp >= now() - interval ${days} day
        GROUP BY distinct_id
        ORDER BY last_seen DESC
        LIMIT 60
      `,
      `seajourney-admin-people-${days}`,
    ),
    runHogQLSafe(
      `
        SELECT
          timestamp,
          distinct_id,
          toString(person.properties.email) AS email,
          coalesce(nullIf(toString(properties.$exception_type), ''), '(unknown)') AS exception_type,
          coalesce(
            nullIf(toString(properties.$exception_message), ''),
            nullIf(toString(properties.$exception_values), ''),
            '(no message)'
          ) AS exception_message,
          toString(properties.$exception_source) AS source,
          toString(properties.$exception_level) AS level,
          coalesce(nullIf(toString(properties.$pathname), ''), toString(properties.$current_url), '') AS path,
          toString(properties.$browser) AS browser,
          toString(properties.$os) AS os,
          left(toString(properties.$exception_stack_trace_raw), 4000) AS stack,
          toString(properties.$exception_fingerprint) AS issue_id
        FROM events
        WHERE event = '$exception'
          AND timestamp >= now() - interval ${days} day
        ORDER BY timestamp DESC
        LIMIT 50
      `,
      `seajourney-admin-exceptions-${days}`,
    ),
    runHogQLSafe(
      `
        SELECT
          coalesce(nullIf(toString(properties.$exception_type), ''), '(unknown)') AS exception_type,
          coalesce(
            nullIf(toString(properties.$exception_message), ''),
            '(no message)'
          ) AS exception_message,
          count() AS occurrences,
          uniq(person_id) AS users,
          max(timestamp) AS last_seen
        FROM events
        WHERE event = '$exception'
          AND timestamp >= now() - interval ${days} day
        GROUP BY exception_type, exception_message
        ORDER BY occurrences DESC
        LIMIT 20
      `,
      `seajourney-admin-exception-groups-${days}`,
    ),
    runHogQLSafe(
      `
        SELECT
          coalesce(nullIf(toString(properties.$geoip_country_code), ''), 'XX') AS country_code,
          coalesce(nullIf(toString(properties.$geoip_country_name), ''), 'Unknown') AS country,
          uniq(person_id) AS users,
          count() AS events
        FROM events
        WHERE timestamp >= now() - interval ${days} day
          AND isNotNull(properties.$geoip_country_code)
        GROUP BY country_code, country
        ORDER BY users DESC
        LIMIT 40
      `,
      `seajourney-admin-countries-${days}`,
    ),
    runHogQLSafe(
      `
        SELECT
          round(toFloat(properties.$geoip_latitude), 2) AS lat,
          round(toFloat(properties.$geoip_longitude), 2) AS lng,
          any(toString(properties.$geoip_city_name)) AS city,
          any(toString(properties.$geoip_country_name)) AS country,
          any(toString(properties.$geoip_country_code)) AS country_code,
          uniq(person_id) AS users,
          count() AS events
        FROM events
        WHERE timestamp >= now() - interval ${days} day
          AND isNotNull(properties.$geoip_latitude)
          AND isNotNull(properties.$geoip_longitude)
        GROUP BY lat, lng
        ORDER BY users DESC
        LIMIT 150
      `,
      `seajourney-admin-locations-${days}`,
    ),
    runHogQLSafe(
      `
        SELECT
          distinct_id,
          any(toString(person.properties.email)) AS email,
          argMax(toString(properties.$geoip_city_name), timestamp) AS city,
          argMax(toString(properties.$geoip_country_name), timestamp) AS country,
          argMax(toString(properties.$geoip_country_code), timestamp) AS country_code,
          argMax(toFloat(properties.$geoip_latitude), timestamp) AS lat,
          argMax(toFloat(properties.$geoip_longitude), timestamp) AS lng,
          count() AS events,
          max(timestamp) AS last_seen
        FROM events
        WHERE timestamp >= now() - interval ${days} day
          AND isNotNull(properties.$geoip_latitude)
          AND isNotNull(properties.$geoip_longitude)
        GROUP BY distinct_id
        ORDER BY last_seen DESC
        LIMIT 120
      `,
      `seajourney-admin-located-people-${days}`,
    ),
  ]);

  const cur = current[0] ?? {};
  const prev = previous[0] ?? {};

  return {
    range,
    days,
    generatedAt: new Date().toISOString(),
    totals: {
      uniqueUsers: toNumber(cur.unique_users),
      uniqueUsersPrev: toNumber(prev.unique_users),
      pageviews: toNumber(cur.pageviews),
      pageviewsPrev: toNumber(prev.pageviews),
      events: toNumber(cur.events),
      eventsPrev: toNumber(prev.events),
      sessions: toNumber(cur.sessions),
      sessionsPrev: toNumber(prev.sessions),
      exceptions: toNumber(cur.exceptions),
      exceptionsPrev: toNumber(prev.exceptions),
    },
    trend: trend.map((row) => ({
      day: toStringValue(row.day).slice(0, 10),
      uniqueUsers: toNumber(row.unique_users),
      pageviews: toNumber(row.pageviews),
      events: toNumber(row.events),
    })),
    topPages: topPages.map((row) => ({
      path: toStringValue(row.path) || '(unknown)',
      views: toNumber(row.views),
      users: toNumber(row.users),
    })),
    topEvents: topEvents.map((row) => ({
      event: toStringValue(row.event) || '(unknown)',
      count: toNumber(row.count),
      users: toNumber(row.users),
    })),
    devices: devices.map((row) => ({
      device: toStringValue(row.device) || 'Unknown',
      users: toNumber(row.users),
      events: toNumber(row.events),
    })),
    recentEvents: recentEvents.map((row) => ({
      timestamp: toStringValue(row.timestamp),
      event: toStringValue(row.event) || '(unknown)',
      distinctId: toStringValue(row.distinct_id),
      email: toStringValue(row.email),
      path: toStringValue(row.path),
      browser: toStringValue(row.browser),
      device: toStringValue(row.device),
      os: toStringValue(row.os),
      matchedUser: null,
    })),
    people: people.map((row) => ({
      distinctId: toStringValue(row.distinct_id),
      email: toStringValue(row.email),
      personRole: toStringValue(row.person_role),
      events: toNumber(row.events),
      pageviews: toNumber(row.pageviews),
      exceptions: toNumber(row.exceptions),
      firstSeen: toStringValue(row.first_seen),
      lastSeen: toStringValue(row.last_seen),
      matchedUser: null,
    })),
    exceptions: exceptions.map((row) => ({
      timestamp: toStringValue(row.timestamp),
      distinctId: toStringValue(row.distinct_id),
      email: toStringValue(row.email),
      type: toStringValue(row.exception_type) || '(unknown)',
      message: toStringValue(row.exception_message) || '(no message)',
      source: toStringValue(row.source),
      level: toStringValue(row.level),
      path: toStringValue(row.path),
      browser: toStringValue(row.browser),
      os: toStringValue(row.os),
      stack: toStringValue(row.stack),
      issueId: toStringValue(row.issue_id),
      matchedUser: null,
    })),
    exceptionGroups: exceptionGroups.map((row) => ({
      type: toStringValue(row.exception_type) || '(unknown)',
      message: toStringValue(row.exception_message) || '(no message)',
      occurrences: toNumber(row.occurrences),
      users: toNumber(row.users),
      lastSeen: toStringValue(row.last_seen),
    })),
    countries: countries.map((row) => ({
      country: toStringValue(row.country) || 'Unknown',
      countryCode: toStringValue(row.country_code) || 'XX',
      users: toNumber(row.users),
      events: toNumber(row.events),
    })),
    locations: locations
      .map((row) => ({
        lat: toNumber(row.lat),
        lng: toNumber(row.lng),
        city: toStringValue(row.city),
        country: toStringValue(row.country),
        countryCode: toStringValue(row.country_code),
        users: toNumber(row.users),
        events: toNumber(row.events),
      }))
      .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng)),
    locatedPeople: locatedPeople
      .map((row) => ({
        distinctId: toStringValue(row.distinct_id),
        email: toStringValue(row.email),
        city: toStringValue(row.city),
        country: toStringValue(row.country),
        countryCode: toStringValue(row.country_code),
        lat: toNumber(row.lat),
        lng: toNumber(row.lng),
        events: toNumber(row.events),
        lastSeen: toStringValue(row.last_seen),
        matchedUser: null,
      }))
      .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng)),
  };
}
