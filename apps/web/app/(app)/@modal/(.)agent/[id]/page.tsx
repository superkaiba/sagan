import AgentRunPage from '../../../agent/[id]/page';
import { RouteModal } from '@/components/RouteModal';

export const dynamic = 'force-dynamic';

export default function AgentRunModalPage(props: {
  params: Promise<{ id: string }>;
}) {
  return (
    <RouteModal>
      <AgentRunPage {...props} />
    </RouteModal>
  );
}
