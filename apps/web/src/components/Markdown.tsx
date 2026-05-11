import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/cn';

const PROSE = [
  'prose prose-sm max-w-none',
  '[&_p]:my-2 [&_p]:leading-relaxed',
  '[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-semibold',
  '[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold',
  '[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-base [&_h3]:font-medium',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
  '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
  '[&_li]:my-0.5',
  '[&_pre]:my-2 [&_pre]:rounded-md [&_pre]:bg-[--color-muted-bg] [&_pre]:p-3 [&_pre]:text-xs [&_pre]:overflow-x-auto',
  '[&_code]:rounded [&_code]:bg-[--color-muted-bg] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_a]:text-[--color-accent] [&_a]:underline-offset-2 hover:[&_a]:underline',
  '[&_blockquote]:border-l-4 [&_blockquote]:border-[--color-border] [&_blockquote]:pl-3 [&_blockquote]:text-[--color-muted]',
  '[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse',
  '[&_th]:border [&_th]:border-[--color-border] [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium',
  '[&_td]:border [&_td]:border-[--color-border] [&_td]:px-2 [&_td]:py-1',
  '[&_hr]:my-3 [&_hr]:border-[--color-border]',
];

export function normalizeGitHubMarkdown(value: string) {
  return value
    .replace(
      /<details(?:\s+open)?\s*>\s*<summary>\s*([\s\S]*?)\s*<\/summary>/gi,
      (_, summary: string) => `\n\n${summary.replace(/<b>/gi, '**').replace(/<\/b>/gi, '**').trim()}\n\n`,
    )
    .replace(/<\/details>/gi, '\n\n')
    .replace(/<details(?:\s+open)?\s*>/gi, '\n\n')
    .replace(/<summary>\s*/gi, '\n\n')
    .replace(/\s*<\/summary>/gi, '\n\n');
}

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn(PROSE, className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...rest }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
              {children}
            </a>
          ),
        }}
      >
        {normalizeGitHubMarkdown(children)}
      </ReactMarkdown>
    </div>
  );
}
