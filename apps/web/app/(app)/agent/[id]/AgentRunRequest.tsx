const AUTO_FOLLOWUP_MARKER_RE = /^\[(auto-(?:continuation|recovery))-for:([0-9a-f-]+)\]\s*/i;

const SECTION_HEADINGS = [
  'Original request:',
  'Stop reason:',
  'Failure or crash reason:',
  'Previous run transcript:',
];

type Section = { heading: string | null; body: string };

function splitSections(text: string): Section[] {
  const sections: Section[] = [];
  let remaining = text.trim();

  while (remaining.length > 0) {
    let nextIdx = -1;
    let nextHeading: string | null = null;
    for (const heading of SECTION_HEADINGS) {
      const idx = remaining.indexOf(heading);
      if (idx === -1) continue;
      if (nextIdx === -1 || idx < nextIdx) {
        nextIdx = idx;
        nextHeading = heading;
      }
    }

    if (nextIdx === -1) {
      sections.push({ heading: sections.length === 0 ? null : null, body: remaining.trim() });
      break;
    }

    if (nextIdx > 0) {
      const preface = remaining.slice(0, nextIdx).trim();
      if (preface) sections.push({ heading: null, body: preface });
    }

    const rest = remaining.slice(nextIdx + nextHeading!.length);
    let endIdx = rest.length;
    for (const heading of SECTION_HEADINGS) {
      const idx = rest.indexOf(heading);
      if (idx !== -1 && idx < endIdx) endIdx = idx;
    }
    sections.push({ heading: nextHeading!.replace(/:$/, ''), body: rest.slice(0, endIdx).trim() });
    remaining = rest.slice(endIdx);
  }

  return sections;
}

export function AgentRunRequest({ request }: { request: string }) {
  const markerMatch = request.match(AUTO_FOLLOWUP_MARKER_RE);
  const marker = markerMatch ? { mode: markerMatch[1]!, sourceId: markerMatch[2]! } : null;
  const body = markerMatch ? request.slice(markerMatch[0].length).trimStart() : request;
  const sections = splitSections(body);
  const isAutoFollowup = marker !== null;

  return (
    <div className="space-y-3">
      {marker ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-[--color-warning-border] bg-[--color-warning-bg] px-2 py-0.5 font-mono text-[--color-warning]">
            {marker.mode}
          </span>
          <span className="text-[--color-muted]">
            Follow-up of run <span className="font-mono">{marker.sourceId.slice(0, 8)}</span>
          </span>
        </div>
      ) : null}
      {sections.length === 0 ? (
        <p className="whitespace-pre-wrap text-sm text-[--color-muted]">{body}</p>
      ) : (
        <div className="space-y-3 text-sm">
          {sections.map((section, idx) => {
            const isTranscript = section.heading?.toLowerCase().includes('transcript');
            if (!section.heading) {
              return (
                <p key={idx} className="whitespace-pre-wrap leading-relaxed text-[--color-muted]">
                  {section.body}
                </p>
              );
            }
            return (
              <details
                key={idx}
                className="rounded-md border border-[--color-border] bg-[--color-muted-bg]"
                open={!isTranscript && (!isAutoFollowup || idx <= 1)}
              >
                <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[--color-muted]">
                  {section.heading}
                </summary>
                <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words border-t border-[--color-border] px-3 py-2 font-sans text-sm leading-relaxed text-[--color-fg]">
                  {section.body}
                </pre>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
