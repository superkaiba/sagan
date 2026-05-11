import CleanResultPage from '../../../clean-results/[id]/page';
import { RouteModal } from '@/components/RouteModal';

export const dynamic = 'force-dynamic';

export default function CleanResultModalPage(props: {
  params: Promise<{ id: string }>;
}) {
  return (
    <RouteModal>
      <CleanResultPage {...props} />
    </RouteModal>
  );
}
