'use client';

import { memo, useRef } from 'react';
import { RichBody } from './RichBody';
import { useAnchorBehaviors } from './NarrativeBody';

interface Props {
  body: string;
  className?: string;
}

export function CommentableBody({ body, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useAnchorBehaviors(ref);
  return (
    <div ref={ref} className="relative">
      <CommentableBodyInner body={body} className={className} />
    </div>
  );
}

const CommentableBodyInner = memo(function CommentableBodyInner({ body, className }: Props) {
  return <RichBody className={className}>{body}</RichBody>;
});
