"use client";

import { useState } from "react";
import type { CalendarEvent } from "@/lib/calendar";

export default function ConnectPage() {
  const [input, setInput] = useState("");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<Array<{ url: string; message: string }>>([]);
  const [importedFrom, setImportedFrom] = useState<string | null>(null);

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setImportErrors([]);
    try {
      const res = await fetch("/api/calendar/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `Import failed (HTTP ${res.status})`);
      }
      setEvents(data.events ?? []);
      setImportErrors(data.errors ?? []);
      setImportedFrom(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  const sourceCounts = countBySource(events);

  return (
    <div className="sb-page">
      <header className="sb-header">
        <div className="sb-header-left">
          <span className="sb-header-greeting">SocialButter</span>
          <span className="sb-header-sub">
            Pick the events worth your time
          </span>
        </div>
      </header>

      <main className="sb-main">
        <section className="sb-card sb-connect-card">
          <h2 className="sb-section-title">Connect your calendars</h2>
          <p className="sb-help-text">
            Paste any combination of subscription URLs below — Apple, Google,
            Luma, or individual Luma event URLs. SocialButter pulls live on
            every load. No mocks.
          </p>

          <ul className="sb-source-list">
            <li>
              <strong>Apple Calendar</strong> —{" "}
              <span className="sb-help-text">
                System Settings → Apple Account → iCloud → Calendar → Share
                Calendar → Public Calendar → copy{" "}
                <code className="sb-mono">webcal://</code> URL.
              </span>
            </li>
            <li>
              <strong>Google Calendar</strong> —{" "}
              <span className="sb-help-text">
                <a
                  href="https://calendar.google.com/calendar/u/0/r/settings"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sb-link sb-link-inline"
                >
                  Settings
                </a>{" "}
                → pick a calendar → Integrate calendar → copy{" "}
                <em>Secret address in iCal format</em>.
              </span>
            </li>
            <li>
              <strong>Luma</strong> —{" "}
              <span className="sb-help-text">
                <a
                  href="https://lu.ma/settings/calendar"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sb-link sb-link-inline"
                >
                  Settings → Calendar
                </a>
                , or paste a single{" "}
                <code className="sb-mono">lu.ma/&lt;event&gt;</code> URL.
              </span>
            </li>
          </ul>

          <form onSubmit={handleImport} className="sb-form sb-form-vertical">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                "webcal://p52-caldav.icloud.com/published/2/...\nhttps://calendar.google.com/calendar/ical/.../basic.ics\nhttps://api.lu.ma/ics/get?entity=user&id=...\nhttps://lu.ma/abc123"
              }
              className="sb-input sb-textarea"
              disabled={loading}
              autoFocus
              spellCheck={false}
              rows={6}
            />
            <button
              type="submit"
              className="sb-btn-primary"
              disabled={loading || !input.trim()}
            >
              {loading ? "Connecting…" : "Connect calendars"}
            </button>
          </form>

          {error && (
            <div className="sb-error" role="alert">
              <strong>Couldn&apos;t import:</strong> {error}
            </div>
          )}
          {importErrors.length > 0 && (
            <div className="sb-error" role="alert">
              <strong>Some URLs failed:</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
                {importErrors.map((e, i) => (
                  <li key={i}>
                    <code className="sb-mono">{e.url.slice(0, 60)}{e.url.length > 60 ? "…" : ""}</code>
                    {" — "}{e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {events.length > 0 && (
          <section className="sb-events-section">
            <div className="sb-events-header">
              <h2 className="sb-section-title">
                {events.length} event{events.length === 1 ? "" : "s"}
              </h2>
              <span className="sb-mono sb-events-source">
                {sourceCounts.map(s => `${s.count} ${s.label}`).join(" · ")}
              </span>
            </div>
            <div className="sb-event-grid">
              {events
                .slice()
                .sort((a, b) => (a.datetime < b.datetime ? -1 : 1))
                .map((ev) => (
                  <EventCard key={ev.id} event={ev} />
                ))}
            </div>
          </section>
        )}

        {!loading && !error && events.length === 0 && importedFrom && (
          <div className="sb-empty">No events found for that input.</div>
        )}
      </main>
    </div>
  );
}

function EventCard({ event }: { event: CalendarEvent }) {
  const when = formatWhen(event.datetime);
  return (
    <article className="sb-card sb-event-card">
      <div className="sb-event-meta-row">
        <div className="sb-event-when sb-mono">{when}</div>
        <span className={`sb-source-chip sb-source-${event.source}`}>
          {event.sourceLabel}
        </span>
      </div>
      <h3 className="sb-event-title">{event.title}</h3>
      <div className="sb-event-host">by {event.host}</div>
      {event.location && (
        <div className="sb-event-location">{event.location}</div>
      )}
      {event.url && (
        <a
          href={event.url}
          target="_blank"
          rel="noopener noreferrer"
          className="sb-link"
        >
          Open →
        </a>
      )}
    </article>
  );
}

function countBySource(events: CalendarEvent[]): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.sourceLabel, (counts.get(e.sourceLabel) ?? 0) + 1);
  return Array.from(counts.entries()).map(([label, count]) => ({ label, count }));
}

function formatWhen(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
