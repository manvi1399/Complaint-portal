import { AdminPortal } from "./components/AdminPortal";
import { Header } from "./components/Header";

export default function AdminApp() {
  return (
    <div>
      <Header
        portal="admin"
        title="Admin Complaint Portal"
        description="View complaints, route manual cases, and update status."
      />
      <main className="page-wrap page-main">
        <AdminPortal />
      </main>
    </div>
  );
}
