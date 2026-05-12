'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export interface AnchorRecord {
  id: string;
  quote: string;
}

export interface PendingAnchor {
  quote: string;
}

interface AnchoredCommentsValue {
  anchors: AnchorRecord[];
  setAnchors: (anchors: AnchorRecord[]) => void;
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;
  pendingAnchor: PendingAnchor | null;
  setPendingAnchor: (anchor: PendingAnchor | null) => void;
  scrollToCommentId: string | null;
  requestScrollTo: (id: string) => void;
  clearScrollRequest: () => void;
}

const Ctx = createContext<AnchoredCommentsValue | null>(null);

export function AnchoredCommentsProvider({ children }: { children: ReactNode }) {
  const [anchors, setAnchors] = useState<AnchorRecord[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pendingAnchor, setPendingAnchor] = useState<PendingAnchor | null>(null);
  const [scrollToCommentId, setScrollToCommentId] = useState<string | null>(null);

  const requestScrollTo = useCallback((id: string) => setScrollToCommentId(id), []);
  const clearScrollRequest = useCallback(() => setScrollToCommentId(null), []);

  const value = useMemo<AnchoredCommentsValue>(
    () => ({
      anchors,
      setAnchors,
      hoveredId,
      setHoveredId,
      pendingAnchor,
      setPendingAnchor,
      scrollToCommentId,
      requestScrollTo,
      clearScrollRequest,
    }),
    [anchors, hoveredId, pendingAnchor, scrollToCommentId, requestScrollTo, clearScrollRequest],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAnchoredComments() {
  return useContext(Ctx);
}
