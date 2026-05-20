import { AuthHttpError } from "./authErrors.ts";
import { CitizenAuthRepository } from "./citizenAuth.repository.ts";
import type { CitizenOtpGateway, CitizenSessionStore } from "./citizenAuth.types.ts";
import { sanitizeCitizenUser } from "./citizenAuth.types.ts";
import {
  normalizeEmail,
  normalizeIdentifier,
  normalizeName,
  normalizePassword,
  normalizePhone,
} from "./citizenValidation.ts";
import { hashPassword, verifyPassword } from "./password.ts";
import { AuthRateLimiter } from "./rateLimiter.ts";

interface CitizenAuthServiceOptions {
  loginRateLimit: number;
  otpRateLimit: number;
  otpDemoPreview: boolean;
}

export class CitizenAuthService {
  constructor(
    private readonly repository: CitizenAuthRepository,
    private readonly sessions: CitizenSessionStore,
    private readonly otp: CitizenOtpGateway,
    private readonly rateLimiter: AuthRateLimiter,
    private readonly options: CitizenAuthServiceOptions,
  ) {}

  async requestRegistrationOtp(input: unknown, clientKey: string) {
    const body = asRecord(input);
    const normalizedName = normalizeName(body.name, "Full name");
    if ("error" in normalizedName) throw new AuthHttpError(400, normalizedName.error);

    const normalizedPhone = normalizePhone(body.phone);
    if ("error" in normalizedPhone) throw new AuthHttpError(400, normalizedPhone.error);

    this.enforceRateLimit(`citizen-register-otp:${clientKey}:${normalizedPhone.value}`, this.options.otpRateLimit);

    const normalizedEmail = normalizeEmail(body.email);
    if ("error" in normalizedEmail) throw new AuthHttpError(400, normalizedEmail.error);

    const normalizedPassword = normalizePassword(body.password);
    if ("error" in normalizedPassword) throw new AuthHttpError(400, normalizedPassword.error);

    this.ensureRegistrationIsUnique(normalizedPhone.value, normalizedEmail.value);

    if (!normalizedEmail.value && !this.options.otpDemoPreview) {
      throw new AuthHttpError(400, "Email address is required for OTP. SMS delivery is not configured for this deployment.");
    }

    const challenge = this.otp.issue({
      purpose: "register",
      channel: normalizedEmail.value ? "email" : "phone",
      destination: normalizedEmail.value ?? normalizedPhone.value,
      payload: {
        kind: "register",
        name: normalizedName.value,
        phone: normalizedPhone.value,
        email: normalizedEmail.value,
        passwordHash: hashPassword(normalizedPassword.value),
      },
    });

    try {
      await this.otp.deliver(challenge, "Verify your Complaint Portal account");
    } catch (error) {
      throw new AuthHttpError(503, error instanceof Error ? error.message : "Unable to deliver OTP.");
    }

    return this.otp.response(
      challenge,
      challenge.channel === "phone" ? "OTP generated for phone verification." : "OTP sent to your email address.",
    );
  }

  async verifyRegistration(input: unknown) {
    const body = asRecord(input);
    const challengeId = typeof body.challengeId === "string" ? body.challengeId : "";
    const otpCode = typeof body.otp === "string" ? body.otp.trim() : "";
    const consumed = this.otp.consume(challengeId, otpCode);

    if ("error" in consumed) throw new AuthHttpError(400, consumed.error);
    if (consumed.challenge.payload.kind !== "register") {
      throw new AuthHttpError(400, "OTP challenge is not valid for registration.");
    }

    const payload = consumed.challenge.payload;
    this.ensureRegistrationIsUnique(payload.phone, payload.email);

    const citizenUser = await this.repository.create({
      name: payload.name,
      phone: payload.phone,
      email: payload.email,
      passwordHash: payload.passwordHash,
    });

    return this.createSessionResponse(citizenUser.id);
  }

  loginWithPassword(input: unknown, clientKey: string) {
    const body = asRecord(input);
    const identifier = typeof body.identifier === "string" ? body.identifier : "";
    const password = typeof body.password === "string" ? body.password : "";
    const rateLimitKey = `citizen-password:${clientKey}:${normalizeIdentifier(identifier) || "anonymous"}`;

    this.enforceRateLimit(rateLimitKey, this.options.loginRateLimit);

    const citizenUser = this.repository.findByIdentifier(identifier);
    if (!citizenUser || !verifyPassword(password, citizenUser.passwordHash)) {
      throw new AuthHttpError(401, "Invalid citizen credentials.");
    }

    this.rateLimiter.clear(rateLimitKey);
    return this.createSessionResponse(citizenUser.id);
  }

  async requestLoginOtp(input: unknown, clientKey: string) {
    const body = asRecord(input);
    const identifier = typeof body.identifier === "string" ? body.identifier : "";
    this.enforceRateLimit(`citizen-login-otp:${clientKey}:${normalizeIdentifier(identifier) || "anonymous"}`, this.options.otpRateLimit);

    const citizenUser = this.repository.findByIdentifier(identifier);
    if (!citizenUser) {
      throw new AuthHttpError(404, "Citizen account not found for that phone, email, or user ID.");
    }

    const useEmailChannel = Boolean(citizenUser.email);
    if (!useEmailChannel && !this.options.otpDemoPreview) {
      throw new AuthHttpError(
        400,
        "This account has no email address for OTP. Please sign in with password or register with an email address.",
      );
    }

    const challenge = this.otp.issue({
      purpose: "login",
      channel: useEmailChannel ? "email" : "phone",
      destination: useEmailChannel ? citizenUser.email! : citizenUser.phone,
      payload: {
        kind: "login",
        citizenId: citizenUser.id,
      },
    });

    try {
      await this.otp.deliver(challenge, "Your Complaint Portal sign-in code");
    } catch (error) {
      throw new AuthHttpError(503, error instanceof Error ? error.message : "Unable to deliver OTP.");
    }

    return this.otp.response(
      challenge,
      challenge.channel === "phone" ? "OTP generated for phone sign-in." : "OTP sent to your email address.",
    );
  }

  verifyLoginOtp(input: unknown) {
    const body = asRecord(input);
    const challengeId = typeof body.challengeId === "string" ? body.challengeId : "";
    const otpCode = typeof body.otp === "string" ? body.otp.trim() : "";
    const consumed = this.otp.consume(challengeId, otpCode);

    if ("error" in consumed) throw new AuthHttpError(400, consumed.error);
    if (consumed.challenge.payload.kind !== "login") {
      throw new AuthHttpError(400, "OTP challenge is not valid for sign-in.");
    }

    const citizenUser = this.repository.findById(consumed.challenge.payload.citizenId);
    if (!citizenUser) {
      throw new AuthHttpError(404, "Citizen account no longer exists.");
    }

    return this.createSessionResponse(citizenUser.id);
  }

  private enforceRateLimit(key: string, maxAttempts: number) {
    const rateLimit = this.rateLimiter.check(key, maxAttempts);
    if (rateLimit) throw new AuthHttpError(429, rateLimit.error);
  }

  private ensureRegistrationIsUnique(phone: string, email: string | null) {
    if (this.repository.hasPhone(phone)) {
      throw new AuthHttpError(409, "A citizen account already exists for this phone number.");
    }

    if (email && this.repository.hasEmail(email)) {
      throw new AuthHttpError(409, "A citizen account already exists for this email address.");
    }
  }

  private createSessionResponse(citizenId: string) {
    const citizenUser = this.repository.findById(citizenId);
    if (!citizenUser) {
      throw new AuthHttpError(404, "Citizen account no longer exists.");
    }

    return {
      token: this.sessions.create(citizenUser.id),
      user: sanitizeCitizenUser(citizenUser),
    };
  }
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}
