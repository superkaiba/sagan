import { loadGraph } from '@/lib/graph-data';
import { GraphCanvas } from './GraphCanvas';

export const dynamic = 'force-dynamic';

export default async function KnowledgeGraphPage() {
  const data = await loadGraph();
  return (
    <div className="space-y-4 h-[calc(100vh-3rem)] flex flex-col">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge graph</h1>
        <p className="text-sm text-[--color-muted]">
          {data.nodes.length} nodes · {data.edges.length} edges
        </p>
      </header>
      <div className="flex-1 min-h-0 rounded-lg border border-[--color-border] overflow-hidden">
        <GraphCanvas nodes={data.nodes} edges={data.edges} />
      </div>
    </div>
  );
}
