import type { Express } from "express";
import type { CitizenUserRecord } from "../../shared/types.ts";
import { AuthRateLimiter } from "./rateLimiter.ts";
import { CitizenAuthController } from "./citizenAuth.controller.ts";
import { CitizenAuthRepository } from "./citizenAuth.repository.ts";
import { CitizenAuthService } from "./citizenAuth.service.ts";
import type { CitizenOtpGateway, CitizenSessionStore } from "./citizenAuth.types.ts";

interface RegisterCitizenAuthRoutesOptions {
  app: Express;
  citizenUsers: CitizenUserRecord[];
  saveCitizenUsers: (users: CitizenUserRecord[]) => Promise<void>;
  sessions: CitizenSessionStore;
  otp: CitizenOtpGateway;
  loginRateLimit: number;
  otpRateLimit: number;
  otpDemoPreview: boolean;
}

export function registerCitizenAuthRoutes(options: RegisterCitizenAuthRoutesOptions) {
  const repository = new CitizenAuthRepository(options.citizenUsers, options.saveCitizenUsers);
  const service = new CitizenAuthService(repository, options.sessions, options.otp, new AuthRateLimiter(), {
    loginRateLimit: options.loginRateLimit,
    otpRateLimit: options.otpRateLimit,
    otpDemoPreview: options.otpDemoPreview,
  });
  const controller = new CitizenAuthController(service);

  options.app.post("/api/auth/register/request-otp", controller.requestRegistrationOtp);
  options.app.post("/api/auth/register/verify", controller.verifyRegistration);
  options.app.post("/api/auth/login/password", controller.loginWithPassword);
  options.app.post("/api/auth/login/request-otp", controller.requestLoginOtp);
  options.app.post("/api/auth/login/verify-otp", controller.verifyLoginOtp);
}
