export function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

type ValidationResult<T> = { value: T } | { error: string };

export function normalizeName(value: unknown, label: string): ValidationResult<string> {
  if (typeof value !== "string") {
    return { error: `${label} is required.` };
  }

  const normalized = normalizeWhitespace(value);

  if (normalized.length < 2) {
    return { error: `${label} must be at least 2 characters.` };
  }

  return { value: normalized };
}

export function normalizePassword(value: unknown): ValidationResult<string> {
  if (typeof value !== "string") {
    return { error: "Password is required." };
  }

  const trimmed = value.trim();

  if (trimmed.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  return { value };
}

export function normalizePhone(value: unknown): ValidationResult<string> {
  if (typeof value !== "string") {
    return { error: "Phone number is required." };
  }

  const digits = value.replace(/\D/g, "");
  const normalized = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;

  if (!/^\d{10}$/.test(normalized)) {
    return { error: "Phone number must contain 10 digits." };
  }

  return { value: normalized };
}

export function normalizeEmail(value: unknown): ValidationResult<string | null> {
  if (value === null || value === undefined || value === "") {
    return { value: null as string | null };
  }

  if (typeof value !== "string") {
    return { error: "Email must be a string." };
  }

  const normalized = normalizeWhitespace(value).toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(normalized)) {
    return { error: "Please enter a valid email address." };
  }

  return { value: normalized };
}

export function normalizeIdentifier(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  return normalizeWhitespace(value).toLowerCase();
}
