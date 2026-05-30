// Multi-source calendar fetcher.
//
// Detects whether a subscription URL is Luma, Apple iCloud, Google Calendar,
// or a generic ICS feed, fetches it, and returns events normalized to a
// single CalendarEvent shape. No OAuth — relies on the same signed
// subscription URLs each provider already gives users.
//
// Apple Calendar:  System Settings → Apple Account → iCloud → Calendar
//                  Share Calendar → Public Calendar → copy webcal:// URL.
// Google Calendar: Settings → [calendar] → Integrate calendar → Secret
//                  address in iCal format.
// Luma:            Settings → Calendar → api.lu.ma/ics/... URL.
//
// No mocks anywhere (CLAUDE.md §2).

import { fetchIcs, parseIcs, normalizeIcsUrl, IcsFetchError, type IcsEvent } from "./ics";

export type CalendarSource = "luma" | "apple" | "google" | "ics";

export interface CalendarEvent {
  id: string;
  title: string;
  host: string;
  datetime: string;        // ISO 8601 start
  endDatetime?: string;
  url?: string;
  description?: string;
  location?: string;
  source: CalendarSource;
  /** Domain the ICS feed came from — for citing the source in UI/agent output. */
  sourceLabel: string;
  raw?: Record<string, string>;
}

export class CalendarFetchError extends Error {
  constructor(message: string, public readonly url: string, public readonly status?: number) {
    super(message);
    this.name = "CalendarFetchError";
  }
}

// --- Source detection ----------------------------------------------------

/**
 * Classify a subscription URL by host. Falls back to generic "ics" when the
 * URL looks like a calendar feed (webcal:// or path ending in .ics) but the
 * host isn't one we recognize.
 */
export function detectSource(rawUrl: string): { source: CalendarSource; sourceLabel: string } | null {
  const url = normalizeIcsUrl(rawUrl);
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();

  if (host === "api.lu.ma" || host === "lu.ma") {
    return { source: "luma", sourceLabel: "Luma" };
  }
  if (host.endsWith(".icloud.com") || host === "icloud.com") {
    return { source: "apple", sourceLabel: "Apple Calendar" };
  }
  if (host === "calendar.google.com") {
    return { source: "google", sourceLabel: "Google Calendar" };
  }
  // Last-resort: looks like an ICS feed by shape
  if (/^webcal:/i.test(rawUrl.trim()) || u.pathname.toLowerCase().endsWith(".ics")) {
    return { source: "ics", sourceLabel: host };
  }
  return null;
}

export function isCalendarSubscriptionUrl(input: string): boolean {
  return detectSource(input) !== null;
}

// --- Fetch + normalize ---------------------------------------------------

/**
 * Fetch any supported calendar subscription URL and normalize to CalendarEvent[].
 * Throws CalendarFetchError on detection failure; surfaces fetch errors as
 * CalendarFetchError too (originating IcsFetchError is wrapped for one error type).
 */
export async function fetchCalendarFromUrl(rawUrl: string): Promise<CalendarEvent[]> {
  const detected = detectSource(rawUrl);
  if (!detected) {
    throw new CalendarFetchError(
      "URL doesn't look like a calendar subscription. Expected a webcal:// URL or an https URL ending in .ics (Apple, Google, or Luma).",
      rawUrl,
    );
  }
  const normalized = normalizeIcsUrl(rawUrl);
  let ics: string;
  try {
    ics = await fetchIcs(normalized);
  } catch (err) {
    if (err instanceof IcsFetchError) {
      throw new CalendarFetchError(err.message, err.url, err.status);
    }
    throw err;
  }
  const parsed = parseIcs(ics);
  return parsed.map(e => icsToCalendarEvent(e, detected.source, detected.sourceLabel));
}

/**
 * Fetch many calendar URLs in parallel. Surfaces per-URL errors but returns
 * events from any that succeeded.
 */
export async function fetchCalendarFromUrls(urls: string[]): Promise<{
  events: CalendarEvent[];
  errors: Array<{ url: string; message: string }>;
}> {
  const settled = await Promise.allSettled(urls.map(u => fetchCalendarFromUrl(u)));
  const events: CalendarEvent[] = [];
  const errors: Array<{ url: string; message: string }> = [];
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === "fulfilled") {
      events.push(...r.value);
    } else {
      const reason = r.reason;
      errors.push({
        url: urls[i],
        message: reason instanceof Error ? reason.message : String(reason),
      });
    }
  }
  return { events: dedupeById(events), errors };
}

function icsToCalendarEvent(
  e: IcsEvent,
  source: CalendarSource,
  sourceLabel: string,
): CalendarEvent {
  // Source-specific host extraction
  let host = e.organizer ?? "Unknown";
  if (source === "luma") {
    const m = (e.description ?? "").match(/Hosted by ([^\n]+)/i);
    if (m) host = m[1].trim();
  }

  return {
    id: e.uid,
    title: e.summary,
    host,
    datetime: e.dtstart,
    endDatetime: e.dtend,
    url: e.url,
    description: e.description,
    location: e.location,
    source,
    sourceLabel,
    raw: e.raw,
  };
}

function dedupeById(items: CalendarEvent[]): CalendarEvent[] {
  const seen = new Set<string>();
  const out: CalendarEvent[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

// --- Conflict detection (used by agent ranking) --------------------------

export interface TimeRange { start: number; end: number }

/** Convert events to numeric ms ranges; skip events without a parseable start. */
export function eventsToBusySlots(events: CalendarEvent[]): TimeRange[] {
  const slots: TimeRange[] = [];
  for (const e of events) {
    const start = Date.parse(e.datetime);
    if (Number.isNaN(start)) continue;
    const end = e.endDatetime ? Date.parse(e.endDatetime) : start + 60 * 60 * 1000; // assume 1hr
    slots.push({ start, end: Number.isNaN(end) ? start + 60 * 60 * 1000 : end });
  }
  return slots;
}

/** Find the first busy slot that overlaps the candidate event's time window. */
export function findConflict(
  candidate: { datetime: string; endDatetime?: string },
  busy: TimeRange[],
  busyEvents: CalendarEvent[],
): CalendarEvent | null {
  const start = Date.parse(candidate.datetime);
  if (Number.isNaN(start)) return null;
  const end = candidate.endDatetime ? Date.parse(candidate.endDatetime) : start + 60 * 60 * 1000;
  for (let i = 0; i < busy.length; i++) {
    const slot = busy[i];
    if (start < slot.end && end > slot.start) {
      return busyEvents[i] ?? null;
    }
  }
  return null;
}
