import { Header } from "./components/Header";
import { UserPortal } from "./components/UserPortal";

export default function App() {
  return (
    <div>
      <Header
        portal="citizen"
        title="Citizen Complaint Portal"
        description="Login, register complaints, and track updates."
      />
      <main className="page-wrap page-main">
        <UserPortal />
      </main>
    </div>
  );
}
