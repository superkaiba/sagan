import ApprovalsPage from '../../approvals/page';
import { RouteModal } from '@/components/RouteModal';

export const dynamic = 'force-dynamic';

/**
 * Intercepting route — when navigating to /approvals from inside the app
 * shell (e.g. clicking the sidebar approvals card), render the page wrapped
 * in RouteModal instead of full-page-navigating.
 */
export default function ApprovalsModalPage() {
  return (
    <RouteModal>
      <ApprovalsPage />
    </RouteModal>
  );
}
