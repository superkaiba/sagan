import EntityPage from '../../../../e/[kind]/[id]/page';
import { RouteModal } from '@/components/RouteModal';

export const dynamic = 'force-dynamic';

export default function EntityModalPage(props: {
  params: Promise<{ kind: string; id: string }>;
}) {
  return (
    <RouteModal>
      <EntityPage {...props} />
    </RouteModal>
  );
}
