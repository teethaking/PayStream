import { Link } from 'react-router-dom';
import { Page } from '@/components/layout/Page';
import { EmptyState } from '@/components/ui/EmptyState';

export default function NotFound() {
  return (
    <Page title="Lost the stream">
      <EmptyState title="Page not found" body="This route does not exist." action={<Link className="text-cyan underline" to="/">Back home</Link>} />
    </Page>
  );
}
