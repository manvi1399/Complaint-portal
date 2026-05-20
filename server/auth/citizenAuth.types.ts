import type { CitizenSessionUser, CitizenUserRecord } from "../../shared/types.ts";

export type CitizenOtpPurpose = "register" | "login";

export interface CitizenOtpChallenge {
  id: string;
  purpose: CitizenOtpPurpose;
  code: string;
  expiresAt: number;
  channel: "phone" | "email";
  destination: string;
  payload:
    | {
        kind: "register";
        name: string;
        phone: string;
        email: string | null;
        passwordHash: string;
      }
    | {
        kind: "login";
        citizenId: string;
      };
}

export interface CitizenOtpGateway {
  issue(challenge: Omit<CitizenOtpChallenge, "id" | "code" | "expiresAt">): CitizenOtpChallenge;
  consume(challengeId: string, otp: string): { challenge: CitizenOtpChallenge } | { error: string };
  deliver(challenge: CitizenOtpChallenge, subject: string): Promise<void>;
  response(challenge: CitizenOtpChallenge, message: string): object;
}

export interface CitizenSessionStore {
  create(userId: string): string;
}

export interface CitizenAuthResponse {
  token: string;
  user: CitizenSessionUser;
}

export function sanitizeCitizenUser(user: CitizenUserRecord): CitizenSessionUser {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    registeredAt: user.registeredAt,
  };
}
