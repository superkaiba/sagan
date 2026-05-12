import { Markdown } from './Markdown';

/**
 * Render a narrative body. If the body looks like raw HTML (starts with
 * an HTML tag after whitespace), inject it via dangerouslySetInnerHTML so
 * Claude-authored HTML artifacts render with their own inline styles +
 * SVG. Otherwise fall through to Markdown rendering.
 *
 * Trust model: project_narratives writes require an authenticated session
 * (see app/api/project-narratives/route.ts). Public viewers only read.
 * The author is trusted; XSS risk is equivalent to allowing raw HTML in
 * any authenticated CMS surface.
 */
export function NarrativeBody({ body }: { body: string }) {
  const trimmed = body.trimStart();
  const looksHtml =
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<div') ||
    trimmed.startsWith('<section') ||
    trimmed.startsWith('<article') ||
    trimmed.startsWith('<main') ||
    trimmed.startsWith('<style');

  if (looksHtml) {
    return (
      <div
        className="narrative-html"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: author is trusted (auth-gated write)
        dangerouslySetInnerHTML={{ __html: body }}
      />
    );
  }
  return <Markdown>{body}</Markdown>;
}
