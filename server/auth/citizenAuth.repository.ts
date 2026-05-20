import type { CitizenUserRecord } from "../../shared/types.ts";
import { normalizeIdentifier } from "./citizenValidation.ts";

export class CitizenAuthRepository {
  constructor(
    private readonly users: CitizenUserRecord[],
    private readonly saveUsers: (users: CitizenUserRecord[]) => Promise<void>,
  ) {}

  findByIdentifier(identifier: string) {
    const normalizedIdentifier = normalizeIdentifier(identifier);
    const normalizedDigits = identifier.replace(/\D/g, "");
    const phoneIdentifier =
      normalizedDigits.length === 12 && normalizedDigits.startsWith("91") ? normalizedDigits.slice(2) : normalizedDigits;

    return this.users.find(
      (user) =>
        user.id.toLowerCase() === normalizedIdentifier ||
        user.phone === phoneIdentifier ||
        (user.email ? user.email.toLowerCase() === normalizedIdentifier : false),
    );
  }

  findById(id: string) {
    return this.users.find((user) => user.id === id);
  }

  hasPhone(phone: string) {
    return this.users.some((user) => user.phone === phone);
  }

  hasEmail(email: string) {
    return this.users.some((user) => user.email?.toLowerCase() === email.toLowerCase());
  }

  async create(input: Omit<CitizenUserRecord, "id" | "registeredAt">) {
    const user: CitizenUserRecord = {
      ...input,
      id: this.nextCitizenId(),
      registeredAt: new Date().toISOString(),
    };

    this.users.push(user);
    await this.saveUsers(this.users);
    return user;
  }

  private nextCitizenId() {
    const maxValue = this.users.reduce((currentMax, user) => {
      const match = user.id.match(/(\d+)$/);
      const numeric = Number.parseInt(match?.[1] ?? "0", 10);
      return Math.max(currentMax, numeric);
    }, 1000);

    return `CIT-${String(maxValue + 1).padStart(4, "0")}`;
  }
}
