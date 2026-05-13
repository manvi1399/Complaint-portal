import { Header } from "./components/Header";
import { BlockPortal } from "./components/BlockPortal";

export default function BlockApp({
  title,
  description,
  portalId,
  defaultUsername,
}: {
  title: string;
  description: string;
  portalId: string;
  defaultUsername: string;
}) {
  return (
    <div>
      <Header portal="block" title={title} description={description} />
      <main className="page-wrap page-main">
        <BlockPortal portalId={portalId} title={title} defaultUsername={defaultUsername} />
      </main>
    </div>
  );
}
