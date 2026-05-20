import type { Request, Response } from "express";
import { isAuthHttpError } from "./authErrors.ts";
import type { CitizenAuthService } from "./citizenAuth.service.ts";

export class CitizenAuthController {
  constructor(private readonly service: CitizenAuthService) {}

  requestRegistrationOtp = async (req: Request, res: Response) => {
    await this.handle(res, async () => {
      const payload = await this.service.requestRegistrationOtp(req.body, this.clientKey(req));
      res.status(201).json(payload);
    });
  };

  verifyRegistration = async (req: Request, res: Response) => {
    await this.handle(res, async () => {
      const payload = await this.service.verifyRegistration(req.body);
      res.status(201).json(payload);
    });
  };

  loginWithPassword = async (req: Request, res: Response) => {
    await this.handle(res, async () => {
      res.json(this.service.loginWithPassword(req.body, this.clientKey(req)));
    });
  };

  requestLoginOtp = async (req: Request, res: Response) => {
    await this.handle(res, async () => {
      const payload = await this.service.requestLoginOtp(req.body, this.clientKey(req));
      res.status(201).json(payload);
    });
  };

  verifyLoginOtp = async (req: Request, res: Response) => {
    await this.handle(res, async () => {
      res.json(this.service.verifyLoginOtp(req.body));
    });
  };

  private clientKey(req: Request) {
    return req.ip ?? "unknown";
  }

  private async handle(res: Response, action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      if (isAuthHttpError(error)) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }

      console.error("Citizen auth request failed.", error);
      res.status(500).json({ error: "Authentication request failed." });
    }
  }
}
