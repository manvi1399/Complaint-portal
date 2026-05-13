import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import type { AdminSessionUser, BlockPortalDefinition, ComplaintRecord, ComplaintStatus, MunicipalityDefinition } from "../types";
import { formatDateTime, roleLabels, severityStyles, statusStyles } from "./complaintStyles";

const ADMIN_TOKEN_KEY = "admin-token";
const ADMIN_NAME_KEY = "admin-name";
const STATUS_OPTIONS: ComplaintStatus[] = ["Received", "Under Review", "Assigned", "In Progress", "Resolved"];

interface AdminResponse {
  municipalities: MunicipalityDefinition[];
  blockPortals: BlockPortalDefinition[];
  complaints: ComplaintRecord[];
}

interface OtpChallengeResponse {
  challengeId: string;
  otpPreview?: string;
  destination: string;
  channel: "phone" | "email";
  message: string;
}

export function AdminPortal() {
  const [token, setToken] = useState(() => window.localStorage.getItem(ADMIN_TOKEN_KEY) ?? "");
  const [adminUser, setAdminUser] = useState<AdminSessionUser | null>(() => {
    const name = window.localStorage.getItem(ADMIN_NAME_KEY);
    return name ? { id: "persisted", name, username: "admin@chandigarh.gov.in" } : null;
  });
  const [loginMode, setLoginMode] = useState<"password" | "otp">("password");
  const [username, setUsername] = useState("admin@chandigarh.gov.in");
  const [password, setPassword] = useState("Admin@123");
  const [pendingChallenge, setPendingChallenge] = useState<OtpChallengeResponse | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [municipalities, setMunicipalities] = useState<MunicipalityDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, { municipalityId: string; blockId: string; remark: string }>>({});
  const [updateDrafts, setUpdateDrafts] = useState<Record<string, { status: ComplaintStatus; remark: string; workDone: boolean }>>({});

  async function fetchDashboard(activeToken: string, showLoader: boolean) {
    if (showLoader) setLoading(true);

    try {
      const response = await fetch("/api/admin/complaints", { headers: { Authorization: `Bearer ${activeToken}` } });
      const payload = (await response.json().catch(() => ({}))) as Partial<AdminResponse> & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load admin dashboard.");
      }

      setComplaints(payload.complaints ?? []);
      setMunicipalities(payload.municipalities ?? []);
    } catch (dashboardError) {
      setError(dashboardError instanceof Error ? dashboardError.message : "Unable to load admin dashboard.");
    } finally {
      if (showLoader) setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    void fetchDashboard(token, true);
    const intervalId = window.setInterval(() => void fetchDashboard(token, false), 15000);
    return () => window.clearInterval(intervalId);
  }, [token]);

  const manualComplaints = useMemo(() => complaints.filter((complaint) => complaint.routingStatus === "Needs Manual Review"), [complaints]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSigningIn(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; token?: string; user?: AdminSessionUser };

      if (!response.ok || !payload.token || !payload.user) {
        throw new Error(payload.error ?? "Admin login failed.");
      }

      window.localStorage.setItem(ADMIN_TOKEN_KEY, payload.token);
      window.localStorage.setItem(ADMIN_NAME_KEY, payload.user.name);
      setToken(payload.token);
      setAdminUser(payload.user);
      setSuccess(`Welcome, ${payload.user.name}.`);
      setPendingChallenge(null);
      setOtpCode("");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to sign in.");
    } finally {
      setSigningIn(false);
    }
  }

  async function requestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSigningIn(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/admin/login/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const payload = (await response.json().catch(() => ({}))) as OtpChallengeResponse & { error?: string };

      if (!response.ok || !payload.challengeId) {
        throw new Error(payload.error ?? "Unable to generate admin OTP.");
      }

      setPendingChallenge(payload);
      setSuccess(`${payload.message} Use the code shown below.`);
    } catch (otpError) {
      setError(otpError instanceof Error ? otpError.message : "Unable to generate admin OTP.");
    } finally {
      setSigningIn(false);
    }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingChallenge) return;

    setSigningIn(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/login/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: pendingChallenge.challengeId, otp: otpCode }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; token?: string; user?: AdminSessionUser };

      if (!response.ok || !payload.token || !payload.user) {
        throw new Error(payload.error ?? "Admin OTP verification failed.");
      }

      window.localStorage.setItem(ADMIN_TOKEN_KEY, payload.token);
      window.localStorage.setItem(ADMIN_NAME_KEY, payload.user.name);
      setToken(payload.token);
      setAdminUser(payload.user);
      setPendingChallenge(null);
      setOtpCode("");
      setSuccess(`Welcome, ${payload.user.name}.`);
    } catch (verificationError) {
      setError(verificationError instanceof Error ? verificationError.message : "Admin OTP verification failed.");
    } finally {
      setSigningIn(false);
    }
  }

  function handleLogout() {
    window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    window.localStorage.removeItem(ADMIN_NAME_KEY);
    setToken("");
    setAdminUser(null);
    setComplaints([]);
    setPendingChallenge(null);
    setOtpCode("");
  }

  async function assignComplaint(complaintId: string) {
    const draft = assignmentDrafts[complaintId];
    if (!draft || !draft.municipalityId || !draft.blockId || !token) {
      setError("Choose a municipality and block before directing the complaint.");
      return;
    }

    const response = await fetch(`/api/admin/complaints/${complaintId}/assign`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(draft),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string; complaint?: ComplaintRecord };

    if (!response.ok || !payload.complaint) {
      setError(payload.error ?? "Unable to direct complaint.");
      return;
    }

    setComplaints((current) => current.map((item) => (item.id === payload.complaint!.id ? payload.complaint! : item)));
    setSuccess(`Complaint ${payload.complaint.id} directed successfully.`);
  }

  async function updateComplaint(complaint: ComplaintRecord) {
    const draft = updateDrafts[complaint.id] ?? { status: complaint.status, remark: "", workDone: complaint.workDone };
    if (!token) return;

    const response = await fetch(`/api/admin/complaints/${complaint.id}/update`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(draft),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string; complaint?: ComplaintRecord };

    if (!response.ok || !payload.complaint) {
      setError(payload.error ?? "Unable to update complaint.");
      return;
    }

    setComplaints((current) => current.map((item) => (item.id === payload.complaint!.id ? payload.complaint! : item)));
    setSuccess(`Complaint ${payload.complaint.id} updated.`);
  }

  if (!token) {
    return (
      <section className="stack">
        <Panel title="Admin Login">
          <div className="button-row auth-switch">
            <button className={loginMode === "otp" ? "active" : ""} type="button" onClick={() => setLoginMode("otp")}>Email OTP</button>
            <button className={loginMode === "password" ? "active" : ""} type="button" onClick={() => setLoginMode("password")}>Password</button>
          </div>
          <form className="form-stack" onSubmit={loginMode === "password" ? handleLogin : requestOtp}>
            <input type="email" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Admin email" />
            {loginMode === "password" ? (
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" />
            ) : null}
            {error ? <Feedback text={error} tone="error" /> : null}
            {success ? <Feedback text={success} tone="success" /> : null}
            <button disabled={signingIn}>{signingIn ? "Please wait..." : loginMode === "password" ? "Sign in" : "Send OTP"}</button>
          </form>
          {loginMode === "otp" && pendingChallenge ? (
            <form className="form-stack otp-box" onSubmit={verifyOtp}>
              <div className="message message-success">
                {pendingChallenge.otpPreview ? (
                  <>Demo OTP for {pendingChallenge.destination}: <strong>{pendingChallenge.otpPreview}</strong></>
                ) : (
                  <>OTP sent to {pendingChallenge.destination}.</>
                )}
              </div>
              <input value={otpCode} onChange={(event) => setOtpCode(event.target.value)} placeholder="Enter OTP" />
              <button disabled={signingIn}>{signingIn ? "Verifying..." : "Verify OTP"}</button>
            </form>
          ) : null}
        </Panel>
      </section>
    );
  }

  return (
    <section className="stack">
      <Panel title="Admin Dashboard">
        <div className="row-wrap">
          <span className="muted">{adminUser?.name ?? "Admin"}</span>
          <div className="button-row">
            <button type="button" onClick={() => void fetchDashboard(token, true)}>Refresh</button>
            <button type="button" onClick={handleLogout}>Logout</button>
          </div>
        </div>
        <div className="simple-stats">
          <div><strong>{complaints.length}</strong><span>Total</span></div>
          <div><strong>{manualComplaints.length}</strong><span>Manual queue</span></div>
          <div><strong>{complaints.filter((item) => item.workDone).length}</strong><span>Resolved</span></div>
        </div>
      </Panel>

      {error ? <Feedback text={error} tone="error" /> : null}
      {success ? <Feedback text={success} tone="success" /> : null}

      <Panel title="Manual Routing">
        <div className="stack">
          {manualComplaints.length === 0 ? <div className="message message-success">Manual queue is clear.</div> : manualComplaints.map((complaint) => {
            const draft = assignmentDrafts[complaint.id] ?? { municipalityId: "", blockId: "", remark: "" };
            const selectedMunicipality = municipalities.find((item) => item.id === draft.municipalityId);
            return (
              <div key={complaint.id} className="simple-box">
                <strong>#{complaint.id}</strong>
                <div>{complaint.text}</div>
                <div className="three-col">
                  <select value={draft.municipalityId} onChange={(event) => setAssignmentDrafts((current) => ({ ...current, [complaint.id]: { municipalityId: event.target.value, blockId: "", remark: draft.remark } }))}>
                    <option value="">Select municipality</option>
                    {municipalities.map((municipality) => <option key={municipality.id} value={municipality.id}>{municipality.name}</option>)}
                  </select>
                  <select value={draft.blockId} onChange={(event) => setAssignmentDrafts((current) => ({ ...current, [complaint.id]: { ...draft, blockId: event.target.value } }))}>
                    <option value="">Select block</option>
                    {(selectedMunicipality?.blocks ?? []).map((block) => <option key={block.id} value={block.id}>{block.name}</option>)}
                  </select>
                  <input value={draft.remark} onChange={(event) => setAssignmentDrafts((current) => ({ ...current, [complaint.id]: { ...draft, remark: event.target.value } }))} placeholder="Remark" />
                </div>
                <button type="button" className="action-button" onClick={() => void assignComplaint(complaint.id)}>Direct Complaint</button>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="All Complaints">
        {loading ? <div className="message">Loading complaints...</div> : null}
        <div className="stack">
          {complaints.map((complaint) => {
            const draft = updateDrafts[complaint.id] ?? { status: complaint.status, remark: "", workDone: complaint.workDone };
            return (
              <div key={complaint.id} className="simple-box">
                <div className="row-wrap">
                  <strong>#{complaint.id}</strong>
                  <div className="row-wrap">
                    <span className={severityStyles[complaint.severity]}>{complaint.severity}</span>
                    <span className={statusStyles[complaint.status]}>{complaint.status}</span>
                  </div>
                </div>
                <div>{complaint.text}</div>
                <div className="muted">{complaint.citizenName} | {complaint.citizenPhone} | {complaint.blockName ?? "Unassigned"}</div>
                <div className="three-col">
                  <select value={draft.status} onChange={(event) => setUpdateDrafts((current) => ({ ...current, [complaint.id]: { ...draft, status: event.target.value as ComplaintStatus } }))}>
                    {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                  <input value={draft.remark} onChange={(event) => setUpdateDrafts((current) => ({ ...current, [complaint.id]: { ...draft, remark: event.target.value } }))} placeholder="Admin remark" />
                  <label className="checkbox-row"><input type="checkbox" checked={draft.workDone} onChange={(event) => setUpdateDrafts((current) => ({ ...current, [complaint.id]: { ...draft, workDone: event.target.checked, status: event.target.checked ? "Resolved" : draft.status } }))} />Work done</label>
                </div>
                <button type="button" className="action-button" onClick={() => void updateComplaint(complaint)}>Save Update</button>
                {complaint.remarks.slice(0, 2).map((remark) => (
                  <div key={remark.id} className="remark">
                    <strong>{roleLabels[remark.authorRole]} {remark.authorName}:</strong> {remark.message} <span className="muted">({formatDateTime(remark.createdAt)})</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </Panel>
    </section>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Feedback({ text, tone }: { text: string; tone: "error" | "success" }) {
  return <div className={`message ${tone === "error" ? "message-error" : "message-success"}`}>{text}</div>;
}
