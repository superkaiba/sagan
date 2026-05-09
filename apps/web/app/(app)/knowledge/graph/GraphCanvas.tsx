'use client';

import { useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from '@xyflow/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';

interface GraphNode {
  kind: string;
  id: string;
  title: string;
  meta?: string | null;
}
interface GraphEdge {
  id: string;
  fromKind: string;
  fromId: string;
  toKind: string;
  toId: string;
  type: string;
}

const KIND_COLORS: Record<string, string> = {
  project: '#5b6cff',
  belief: '#16a34a',
  experiment: '#d97706',
  run: '#a855f7',
  todo: '#6b7280',
  lit_item: '#0891b2',
  project_narrative: '#475569',
};

const NODE_WIDTH = 200;
const NODE_HEIGHT = 56;

function layout(nodes: GraphNode[], edges: GraphEdge[]): { rfNodes: Node[]; rfEdges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', marginx: 20, marginy: 20, nodesep: 18, ranksep: 60 });
  g.setDefaultEdgeLabel(() => ({}));

  const nodeId = (kind: string, id: string) => `${kind}:${id}`;
  for (const n of nodes) {
    g.setNode(nodeId(n.kind, n.id), { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const e of edges) {
    g.setEdge(nodeId(e.fromKind, e.fromId), nodeId(e.toKind, e.toId));
  }
  dagre.layout(g);

  const rfNodes: Node[] = nodes.map((n) => {
    const id = nodeId(n.kind, n.id);
    const pos = g.node(id);
    const color = KIND_COLORS[n.kind] ?? '#6b7280';
    return {
      id,
      type: 'default',
      position: { x: pos?.x ? pos.x - NODE_WIDTH / 2 : 0, y: pos?.y ? pos.y - NODE_HEIGHT / 2 : 0 },
      data: {
        label: (
          <div style={{ width: NODE_WIDTH - 24, textAlign: 'left' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color }}>
              {n.kind}
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 500,
                lineHeight: 1.2,
                marginTop: 2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {n.title}
            </div>
          </div>
        ),
      },
      style: {
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        background: '#fff',
        border: `1px solid ${color}`,
        borderRadius: 6,
        padding: 8,
      },
    };
  });

  const rfEdges: Edge[] = edges.map((e) => ({
    id: e.id,
    source: nodeId(e.fromKind, e.fromId),
    target: nodeId(e.toKind, e.toId),
    label: e.type,
    labelStyle: { fontSize: 9, fill: '#6b7280' },
    style: { stroke: '#9ca3af', strokeWidth: 1 },
  }));

  return { rfNodes, rfEdges };
}

export function GraphCanvas({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const router = useRouter();
  const { rfNodes, rfEdges } = useMemo(() => layout(nodes, edges), [nodes, edges]);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_e, node) => {
      const [kind, id] = node.id.split(':');
      if (kind && id) router.push(`/e/${kind}/${id}`);
    },
    [router],
  );

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      onNodeClick={onNodeClick}
      fitView
      minZoom={0.1}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={24} />
      <Controls position="bottom-right" />
    </ReactFlow>
  );
}
