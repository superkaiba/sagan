import IdeationSessionPage from '../../../ideation/[id]/page';
import { RouteModal } from '@/components/RouteModal';

export const dynamic = 'force-dynamic';

export default function IdeationSessionModalPage(props: {
  params: Promise<{ id: string }>;
}) {
  return (
    <RouteModal>
      <IdeationSessionPage {...props} />
    </RouteModal>
  );
}
