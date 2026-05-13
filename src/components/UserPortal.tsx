import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import type { CitizenSessionUser, ComplaintRecord } from "../types";
import { formatDateTime, roleLabels, severityStyles, statusStyles } from "./complaintStyles";

const CITIZEN_TOKEN_KEY = "citizen-token";

interface MunicipalityResponse {
  city: string;
  sectors: number[];
}

interface OtpChallengeResponse {
  challengeId: string;
  otpPreview?: string;
  destination: string;
  channel: "phone" | "email";
  message: string;
}

export function UserPortal() {
  const [token, setToken] = useState(() => window.localStorage.getItem(CITIZEN_TOKEN_KEY) ?? "");
  const [user, setUser] = useState<CitizenSessionUser | null>(null);
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [municipalityData, setMunicipalityData] = useState<MunicipalityResponse | null>(null);
  const [authView, setAuthView] = useState<"login" | "register">("login");
  const [loginMode, setLoginMode] = useState<"password" | "otp">("password");
  const [loginIdentifier, setLoginIdentifier] = useState("CIT-1001");
  const [loginPassword, setLoginPassword] = useState("Citizen@123");
  const [registerForm, setRegisterForm] = useState({ name: "", phone: "", email: "", password: "" });
  const [pendingChallenge, setPendingChallenge] = useState<OtpChallengeResponse | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [challengeType, setChallengeType] = useState<"login" | "register" | null>(null);
  const [complaintForm, setComplaintForm] = useState({ complaint: "", city: "Chandigarh", sector: "", locationDetails: "" });
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [submittingComplaint, setSubmittingComplaint] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function bootstrap() {
      const municipalityResponse = await fetch("/api/municipalities");
      if (ignore) return;

      if (municipalityResponse.ok) {
        const payload = (await municipalityResponse.json()) as MunicipalityResponse;
        setMunicipalityData(payload);
        setComplaintForm((current) => ({ ...current, city: payload.city }));
      }
    }

    void bootstrap();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setComplaints([]);
      return;
    }

    let ignore = false;
    let intervalId: number | undefined;

    async function loadDashboard(showLoader: boolean) {
      if (showLoader) setLoadingDashboard(true);

      try {
        const response = await fetch("/api/citizen/dashboard", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          user?: CitizenSessionUser;
          complaints?: ComplaintRecord[];
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load citizen dashboard.");
        }

        if (!ignore) {
          setUser(payload.user ?? null);
          setComplaints(payload.complaints ?? []);
        }
      } catch (dashboardError) {
        if (!ignore) {
          setError(dashboardError instanceof Error ? dashboardError.message : "Unable to load dashboard.");
          handleLogout();
        }
      } finally {
        if (!ignore && showLoader) setLoadingDashboard(false);
      }
    }

    void loadDashboard(true);
    intervalId = window.setInterval(() => void loadDashboard(false), 15000);
    return () => {
      ignore = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [token]);

  function persistCitizenSession(nextToken: string, nextUser: CitizenSessionUser) {
    window.localStorage.setItem(CITIZEN_TOKEN_KEY, nextToken);
    setToken(nextToken);
    setUser(nextUser);
    setPendingChallenge(null);
    setOtpCode("");
    setChallengeType(null);
    setSuccess(`Welcome, ${nextUser.name}.`);
    setError(null);
  }

  function handleLogout() {
    window.localStorage.removeItem(CITIZEN_TOKEN_KEY);
    setToken("");
    setUser(null);
    setComplaints([]);
    setPendingChallenge(null);
    setOtpCode("");
    setChallengeType(null);
  }

  async function handlePasswordLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoadingAuth(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: loginIdentifier, password: loginPassword }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; token?: string; user?: CitizenSessionUser };

      if (!response.ok || !payload.token || !payload.user) {
        throw new Error(payload.error ?? "Citizen sign-in failed.");
      }

      persistCitizenSession(payload.token, payload.user);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to sign in.");
    } finally {
      setLoadingAuth(false);
    }
  }

  async function requestOtp(event: FormEvent<HTMLFormElement>, type: "login" | "register") {
    event.preventDefault();
    setLoadingAuth(true);
    setError(null);
    setSuccess(null);

    try {
      const endpoint = type === "login" ? "/api/auth/login/request-otp" : "/api/auth/register/request-otp";
      const body = type === "login" ? { identifier: loginIdentifier } : registerForm;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as OtpChallengeResponse & { error?: string };

      if (!response.ok || !payload.challengeId) {
        throw new Error(payload.error ?? "Unable to generate OTP.");
      }

      setPendingChallenge(payload);
      setChallengeType(type);
      setAuthView(type === "register" ? "register" : "login");
      setSuccess(payload.otpPreview ? `${payload.message} Use the code shown below.` : payload.message);
    } catch (otpError) {
      setError(otpError instanceof Error ? otpError.message : "Unable to generate OTP.");
    } finally {
      setLoadingAuth(false);
    }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingChallenge || !challengeType) return;

    setLoadingAuth(true);
    setError(null);

    try {
      const response = await fetch(
        challengeType === "login" ? "/api/auth/login/verify-otp" : "/api/auth/register/verify",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ challengeId: pendingChallenge.challengeId, otp: otpCode }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string; token?: string; user?: CitizenSessionUser };

      if (!response.ok || !payload.token || !payload.user) {
        throw new Error(payload.error ?? "OTP verification failed.");
      }

      persistCitizenSession(payload.token, payload.user);
    } catch (verificationError) {
      setError(verificationError instanceof Error ? verificationError.message : "OTP verification failed.");
    } finally {
      setLoadingAuth(false);
    }
  }

  async function handleComplaintSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;

    setSubmittingComplaint(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(complaintForm),
      });
      const payload = (await response.json().catch(() => ({}))) as ComplaintRecord & { error?: string };

      if (!response.ok || !payload.id) {
        throw new Error(payload.error ?? "Complaint submission failed.");
      }

      setComplaints((current) => [payload, ...current]);
      setComplaintForm((current) => ({ ...current, complaint: "", sector: "", locationDetails: "" }));
      setSuccess(`Complaint ${payload.id} submitted successfully.`);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Unable to submit complaint.");
    } finally {
      setSubmittingComplaint(false);
    }
  }

  return (
    <div className={user ? "citizen-page" : "auth-page"}>
      <section className="stack">
        {!user ? (
          <>
          {authView === "login" ? (
            <Panel title="Login">
              <div className="button-row">
                <button className={loginMode === "otp" ? "active" : ""} type="button" onClick={() => setLoginMode("otp")}>OTP</button>
                <button className={loginMode === "password" ? "active" : ""} type="button" onClick={() => setLoginMode("password")}>Password</button>
              </div>
              <form className="form-stack" onSubmit={loginMode === "password" ? handlePasswordLogin : (event) => void requestOtp(event, "login")}>
                <input value={loginIdentifier} onChange={(event) => setLoginIdentifier(event.target.value)} placeholder="Citizen ID, phone, or email" />
                {loginMode === "password" ? <input type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} placeholder="Password" /> : null}
                <button disabled={loadingAuth}>{loginMode === "password" ? "Login" : "Send OTP"}</button>
              </form>
              <p className="auth-link muted">
                New citizen? <button type="button" className="text-button" onClick={() => setAuthView("register")}>Create an account</button>
              </p>
            </Panel>
          ) : (
            <Panel title="Register">
              <form className="form-stack" onSubmit={(event) => void requestOtp(event, "register")}>
                <input value={registerForm.name} onChange={(event) => setRegisterForm((current) => ({ ...current, name: event.target.value }))} placeholder="Full name" />
                <input value={registerForm.phone} onChange={(event) => setRegisterForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone number" />
                <input value={registerForm.email} onChange={(event) => setRegisterForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email for OTP" />
                <input type="password" value={registerForm.password} onChange={(event) => setRegisterForm((current) => ({ ...current, password: event.target.value }))} placeholder="Password" />
                <button disabled={loadingAuth}>Generate OTP</button>
              </form>
              <p className="auth-link muted">
                Already registered? <button type="button" className="text-button" onClick={() => setAuthView("login")}>Back to login</button>
              </p>
            </Panel>
          )}
          </>
        ) : (
          <Panel title="New Complaint">
            <div className="button-row">
              <span className="muted">{user.name} ({user.id})</span>
              <button type="button" onClick={handleLogout}>Logout</button>
            </div>
            <form className="form-stack" onSubmit={handleComplaintSubmit}>
              <div className="three-col">
                <input value={complaintForm.city} onChange={(event) => setComplaintForm((current) => ({ ...current, city: event.target.value }))} />
                <select value={complaintForm.sector} onChange={(event) => setComplaintForm((current) => ({ ...current, sector: event.target.value }))}>
                  <option value="">Sector (optional)</option>
                  {(municipalityData?.sectors ?? []).map((sector) => <option key={sector} value={String(sector)}>Sector {sector}</option>)}
                </select>
                <input value={complaintForm.locationDetails} onChange={(event) => setComplaintForm((current) => ({ ...current, locationDetails: event.target.value }))} placeholder="Landmark / locality" />
              </div>
              <textarea value={complaintForm.complaint} onChange={(event) => setComplaintForm((current) => ({ ...current, complaint: event.target.value }))} rows={5} placeholder="Describe the complaint" />
              <button disabled={submittingComplaint}>{submittingComplaint ? "Submitting..." : "Submit Complaint"}</button>
            </form>
          </Panel>
        )}

        {pendingChallenge ? (
          <Panel title="OTP Verification">
            <p className="muted">Destination: {pendingChallenge.destination}</p>
            {pendingChallenge.otpPreview ? (
              <p><strong>Demo OTP:</strong> {pendingChallenge.otpPreview}</p>
            ) : (
              <p className="message message-success">OTP sent. Check your email inbox.</p>
            )}
            <form className="inline-form" onSubmit={verifyOtp}>
              <input value={otpCode} onChange={(event) => setOtpCode(event.target.value)} placeholder="Enter OTP" />
              <button disabled={loadingAuth}>Verify</button>
            </form>
          </Panel>
        ) : null}

        {(error || success) ? <Feedback error={error} success={success} /> : null}

        {user ? (
          <Panel title="My Complaints">
            <p className="muted">{loadingDashboard ? "Refreshing..." : `${complaints.length} complaints`}</p>
            <div className="stack">
              {complaints.length === 0 ? <div className="message">No complaints yet.</div> : complaints.map((complaint) => <ComplaintCard key={complaint.id} complaint={complaint} />)}
            </div>
          </Panel>
        ) : null}
      </section>

    </div>
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

function Feedback({ error, success }: { error: string | null; success: string | null }) {
  return <div className={`message ${error ? "message-error" : "message-success"}`}>{error ?? success}</div>;
}

function ComplaintCard({ complaint }: { complaint: ComplaintRecord }) {
  return (
    <div className="simple-box">
      <div className="row-wrap">
        <strong>#{complaint.id}</strong>
        <div className="row-wrap">
          <span className={severityStyles[complaint.severity]}>{complaint.severity}</span>
          <span className={statusStyles[complaint.status]}>{complaint.status}</span>
        </div>
      </div>
      <div>{complaint.text}</div>
      <div className="muted">{complaint.city}{complaint.sector ? `, Sector ${complaint.sector}` : ""}{complaint.locationDetails ? `, ${complaint.locationDetails}` : ""}</div>
      <div className="muted">Assigned: {complaint.municipalityName ? `${complaint.municipalityName} / ${complaint.blockName}` : "Manual review queue"}</div>
      <div className="muted">Work done: {complaint.workDone ? "Yes" : "No"} | Updated: {formatDateTime(complaint.updatedAt)}</div>
      {complaint.remarks.slice(0, 3).map((remark) => (
        <div key={remark.id} className="remark">
          <strong>{roleLabels[remark.authorRole]} {remark.authorName}:</strong> {remark.message}
        </div>
      ))}
    </div>
  );
}
