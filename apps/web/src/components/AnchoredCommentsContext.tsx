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

export interface AnchorPosition {
  id: string;
  top: number;
  height: number;
  found: boolean;
}

export interface PendingAnchor {
  quote: string;
}

interface AnchoredCommentsValue {
  anchors: AnchorRecord[];
  setAnchors: (anchors: AnchorRecord[]) => void;
  anchorPositions: AnchorPosition[];
  setAnchorPositions: (positions: AnchorPosition[]) => void;
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
  const [anchorPositions, setAnchorPositionRows] = useState<AnchorPosition[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pendingAnchor, setPendingAnchor] = useState<PendingAnchor | null>(null);
  const [scrollToCommentId, setScrollToCommentId] = useState<string | null>(null);

  const requestScrollTo = useCallback((id: string) => setScrollToCommentId(id), []);
  const clearScrollRequest = useCallback(() => setScrollToCommentId(null), []);
  const setAnchorPositions = useCallback((positions: AnchorPosition[]) => {
    setAnchorPositionRows((prev) => (sameAnchorPositions(prev, positions) ? prev : positions));
  }, []);

  const value = useMemo<AnchoredCommentsValue>(
    () => ({
      anchors,
      setAnchors,
      anchorPositions,
      setAnchorPositions,
      hoveredId,
      setHoveredId,
      pendingAnchor,
      setPendingAnchor,
      scrollToCommentId,
      requestScrollTo,
      clearScrollRequest,
    }),
    [anchors, anchorPositions, setAnchorPositions, hoveredId, pendingAnchor, scrollToCommentId, requestScrollTo, clearScrollRequest],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAnchoredComments() {
  return useContext(Ctx);
}

function sameAnchorPositions(a: AnchorPosition[], b: AnchorPosition[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i]!;
    const right = b[i]!;
    if (
      left.id !== right.id ||
      left.top !== right.top ||
      left.height !== right.height ||
      left.found !== right.found
    ) {
      return false;
    }
  }
  return true;
}
