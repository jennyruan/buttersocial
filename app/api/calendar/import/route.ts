import { NextResponse } from "next/server";
import {
  fetchCalendarFromUrls,
  isCalendarSubscriptionUrl,
  CalendarFetchError,
  type CalendarEvent,
} from "@/lib/calendar";
import { parseEventUrls, fetchLumaEventsFromUrls, LumaFetchError, type LumaEvent } from "@/lib/luma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Unified import. Accepts a mix (whitespace/comma/newline-separated) of:
 *   - calendar subscription URLs: webcal://..., Apple iCloud, Google
 *     Calendar secret iCal, Luma personal calendar
 *   - individual Luma event URLs (lu.ma/<slug>)
 *
 * POST { input: string }
 *   → { events: CalendarEvent[], count, errors: [{url, message}] }
 */
export async function POST(req: Request) {
  let body: { input?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = body.input?.trim();
  if (!input) {
    return NextResponse.json({ error: "Missing 'input'" }, { status: 400 });
  }

  const tokens = input.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
  const calendarUrls = tokens.filter(isCalendarSubscriptionUrl);
  const lumaEventTokens = tokens.filter(t => !isCalendarSubscriptionUrl(t));
  const lumaEventUrls = parseEventUrls(lumaEventTokens.join("\n"));

  if (calendarUrls.length === 0 && lumaEventUrls.length === 0) {
    return NextResponse.json(
      {
        error:
          "No calendar URLs found. Paste an Apple/Google/Luma calendar subscription URL (webcal:// or .ics) or one or more lu.ma/<event> URLs.",
      },
      { status: 400 },
    );
  }

  const allEvents: CalendarEvent[] = [];
  const errors: Array<{ url: string; message: string }> = [];

  if (calendarUrls.length > 0) {
    try {
      const result = await fetchCalendarFromUrls(calendarUrls);
      allEvents.push(...result.events);
      errors.push(...result.errors);
    } catch (err) {
      if (err instanceof CalendarFetchError) {
        return NextResponse.json(
          { error: err.message, url: err.url, status: err.status },
          { status: err.status ?? 502 },
        );
      }
      throw err;
    }
  }

  if (lumaEventUrls.length > 0) {
    try {
      const lumaEvents = await fetchLumaEventsFromUrls(lumaEventUrls);
      allEvents.push(...lumaEvents.map(lumaToCalendarEvent));
    } catch (err) {
      const msg = err instanceof LumaFetchError ? err.message : (err as Error).message;
      errors.push({ url: lumaEventUrls.join(", "), message: msg });
    }
  }

  const deduped = dedupeById(allEvents);
  return NextResponse.json({ events: deduped, count: deduped.length, errors });
}

function lumaToCalendarEvent(e: LumaEvent): CalendarEvent {
  return {
    id: e.id,
    title: e.title,
    host: e.host,
    datetime: e.datetime,
    endDatetime: e.endDatetime,
    url: e.url,
    description: e.description,
    location: e.location,
    source: "luma",
    sourceLabel: "Luma",
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
