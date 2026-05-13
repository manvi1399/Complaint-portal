import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import type { BlockPortalDefinition, BlockSessionUser, ComplaintRecord, ComplaintStatus } from "../types";
import { formatDateTime, roleLabels, severityStyles, statusStyles } from "./complaintStyles";

const STATUS_OPTIONS: ComplaintStatus[] = ["Assigned", "In Progress", "Resolved"];

interface OtpChallengeResponse {
  challengeId: string;
  otpPreview?: string;
  destination: string;
  channel: "phone" | "email";
  message: string;
}

export function BlockPortal({
  portalId,
  title,
  defaultUsername,
}: {
  portalId: string;
  title: string;
  defaultUsername: string;
}) {
  const tokenKey = `block-token-${portalId}`;
  const [token, setToken] = useState(() => window.localStorage.getItem(tokenKey) ?? "");
  const [user, setUser] = useState<BlockSessionUser | null>(null);
  const [portal, setPortal] = useState<BlockPortalDefinition | null>(null);
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [username, setUsername] = useState(defaultUsername);
  const [password, setPassword] = useState("Block@123");
  const [loginMode, setLoginMode] = useState<"password" | "otp">("password");
  const [pendingChallenge, setPendingChallenge] = useState<OtpChallengeResponse | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { status: ComplaintStatus; remark: string; workDone: boolean }>>({});

  async function fetchDashboard(activeToken: string, showLoader: boolean) {
    if (showLoader) setLoading(true);

    try {
      const response = await fetch("/api/block/dashboard", { headers: { Authorization: `Bearer ${activeToken}` } });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; user?: BlockSessionUser; portal?: BlockPortalDefinition; complaints?: ComplaintRecord[] };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load block dashboard.");
      }

      setUser(payload.user ?? null);
      setPortal(payload.portal ?? null);
      setComplaints(payload.complaints ?? []);
    } catch (dashboardError) {
      setError(dashboardError instanceof Error ? dashboardError.message : "Unable to load block dashboard.");
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

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSigningIn(true);
    setError(null);

    try {
      const response = await fetch("/api/block/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, portalId }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; token?: string; user?: BlockSessionUser; portal?: BlockPortalDefinition };

      if (!response.ok || !payload.token || !payload.user) {
        throw new Error(payload.error ?? "Unable to sign in.");
      }

      window.localStorage.setItem(tokenKey, payload.token);
      setToken(payload.token);
      setUser(payload.user);
      setPortal(payload.portal ?? null);
      setPendingChallenge(null);
      setOtpCode("");
      setSuccess(`Welcome, ${payload.user.name}.`);
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
      const response = await fetch("/api/block/login/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, portalId }),
      });
      const payload = (await response.json().catch(() => ({}))) as OtpChallengeResponse & { error?: string };

      if (!response.ok || !payload.challengeId) {
        throw new Error(payload.error ?? "Unable to generate block OTP.");
      }

      setPendingChallenge(payload);
      setSuccess(`${payload.message} Use the code shown below.`);
    } catch (otpError) {
      setError(otpError instanceof Error ? otpError.message : "Unable to generate block OTP.");
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
      const response = await fetch("/api/block/login/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: pendingChallenge.challengeId, otp: otpCode, portalId }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; token?: string; user?: BlockSessionUser; portal?: BlockPortalDefinition };

      if (!response.ok || !payload.token || !payload.user) {
        throw new Error(payload.error ?? "Block OTP verification failed.");
      }

      window.localStorage.setItem(tokenKey, payload.token);
      setToken(payload.token);
      setUser(payload.user);
      setPortal(payload.portal ?? null);
      setPendingChallenge(null);
      setOtpCode("");
      setSuccess(`Welcome, ${payload.user.name}.`);
    } catch (verificationError) {
      setError(verificationError instanceof Error ? verificationError.message : "Block OTP verification failed.");
    } finally {
      setSigningIn(false);
    }
  }

  function handleLogout() {
    window.localStorage.removeItem(tokenKey);
    setToken("");
    setUser(null);
    setComplaints([]);
    setPendingChallenge(null);
    setOtpCode("");
  }

  async function saveUpdate(complaint: ComplaintRecord) {
    if (!token) return;

    const draft = drafts[complaint.id] ?? { status: complaint.status, remark: "", workDone: complaint.workDone };
    const response = await fetch(`/api/block/complaints/${complaint.id}/update`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(draft),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string; complaint?: ComplaintRecord };

    if (!response.ok || !payload.complaint) {
      setError(payload.error ?? "Unable to save block update.");
      return;
    }

    setComplaints((current) => current.map((item) => (item.id === payload.complaint!.id ? payload.complaint! : item)));
    setSuccess(`Complaint ${payload.complaint.id} updated.`);
  }

  if (!token) {
    return (
      <section className="stack">
        <Panel title={title}>
          <p className="muted">Login: {defaultUsername} / Block@123</p>
          <div className="button-row auth-switch">
            <button className={loginMode === "otp" ? "active" : ""} type="button" onClick={() => setLoginMode("otp")}>Email OTP</button>
            <button className={loginMode === "password" ? "active" : ""} type="button" onClick={() => setLoginMode("password")}>Password</button>
          </div>
          <form className="form-stack" onSubmit={loginMode === "password" ? handleLogin : requestOtp}>
            <input type="email" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Block email" />
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
      <Panel title={portal?.title ?? title}>
        <div className="row-wrap">
          <span className="muted">{user?.name} | {portal?.municipalityName} | {portal?.blockName}</span>
          <div className="button-row">
            <button type="button" onClick={() => void fetchDashboard(token, true)}>Refresh</button>
            <button type="button" onClick={handleLogout}>Logout</button>
          </div>
        </div>
      </Panel>

      {error ? <Feedback text={error} tone="error" /> : null}
      {success ? <Feedback text={success} tone="success" /> : null}

      <Panel title="Complaints">
        {loading ? <div className="message">Loading complaints...</div> : null}
        <div className="stack">
          {complaints.map((complaint) => {
            const draft = drafts[complaint.id] ?? { status: complaint.status, remark: "", workDone: complaint.workDone };
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
                <div className="muted">{complaint.citizenName} | {complaint.citizenPhone} | {complaint.locationDetails || complaint.city}</div>
                <div className="three-col">
                  <select value={draft.status} onChange={(event) => setDrafts((current) => ({ ...current, [complaint.id]: { ...draft, status: event.target.value as ComplaintStatus } }))}>
                    {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                  <input value={draft.remark} onChange={(event) => setDrafts((current) => ({ ...current, [complaint.id]: { ...draft, remark: event.target.value } }))} placeholder="Remark" />
                  <label className="checkbox-row"><input type="checkbox" checked={draft.workDone} onChange={(event) => setDrafts((current) => ({ ...current, [complaint.id]: { ...draft, workDone: event.target.checked, status: event.target.checked ? "Resolved" : draft.status } }))} />Work done</label>
                </div>
                <button type="button" className="action-button" onClick={() => void saveUpdate(complaint)}>Save Update</button>
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
