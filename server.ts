import { createHash, randomInt, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import express, { type NextFunction, type Request, type Response } from "express";
import { GoogleGenAI } from "@google/genai";
import { MongoClient, type Collection } from "mongodb";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import {
  CHANDIGARH_SECTORS,
  DEFAULT_CITY,
  MUNICIPALITY_MAP,
  extractSectorFromText,
  findBlockById,
  findSectorRoute,
  normalizeSector,
} from "./shared/municipalities.ts";
import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_ROUTING_STATUSES,
  COMPLAINT_SEVERITIES,
  COMPLAINT_STATUSES,
  type AdminSessionUser,
  type BlockOperatorRecord,
  type BlockPortalDefinition,
  type BlockSessionUser,
  type CitizenSessionUser,
  type CitizenUserRecord,
  type ClassificationSource,
  type ComplaintCategory,
  type ComplaintHealth,
  type ComplaintRecord,
  type ComplaintRemark,
  type ComplaintRoutingStatus,
  type ComplaintSeverity,
  type ComplaintStatus,
  type PortalUserRole,
} from "./shared/types.ts";

dotenv.config();

const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const ADMIN_PORT = Number.parseInt(process.env.ADMIN_PORT ?? "3001", 10);
const NORTH_BLOCK_PORT = Number.parseInt(process.env.NORTH_BLOCK_PORT ?? "3002", 10);
const CENTRAL_BLOCK_PORT = Number.parseInt(process.env.CENTRAL_BLOCK_PORT ?? "3003", 10);
const DATA_DIRECTORY = path.join(process.cwd(), "data");
const COMPLAINTS_FILE = path.join(DATA_DIRECTORY, "complaints.json");
const ADMIN_USERS_FILE = path.join(DATA_DIRECTORY, "admin-users.json");
const CITIZEN_USERS_FILE = path.join(DATA_DIRECTORY, "citizen-users.json");
const BLOCK_USERS_FILE = path.join(DATA_DIRECTORY, "block-users.json");
const MAX_COMPLAINT_LENGTH = 1200;
const MAX_LOCATION_LENGTH = 240;
const MAX_REMARK_LENGTH = 300;
const MIN_COMPLAINT_LENGTH = 10;
const SERVER_STARTED_AT = Date.now();
const OTP_EXPIRY_MS = 5 * 60 * 1000;
const DEFAULT_ADMIN_USERNAME = process.env.ADMIN_SEED_USERNAME ?? "admin@chandigarh.gov.in";
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD ?? "Admin@123";
function configuredEnvValue(value: string | undefined) {
  const normalized = value?.trim() ?? "";
  if (!normalized) return "";

  const placeholderPattern = /^(my_|your-|your_|paste_|change_me|changeme|example_|replaceme)/i;
  return placeholderPattern.test(normalized) ? "" : normalized;
}

const RESEND_API_KEY = configuredEnvValue(process.env.RESEND_API_KEY);
const OTP_FROM_EMAIL = process.env.OTP_FROM_EMAIL ?? "Complaint Portal <onboarding@resend.dev>";
const SMTP_HOST = configuredEnvValue(process.env.SMTP_HOST);
const SMTP_PORT = Number.parseInt(process.env.SMTP_PORT ?? "587", 10);
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const SMTP_USER = configuredEnvValue(process.env.SMTP_USER);
const SMTP_PASS = configuredEnvValue(process.env.SMTP_PASS);
const HAS_SMTP_CONFIG = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
const OTP_DEMO_PREVIEW =
  process.env.OTP_DEMO_PREVIEW === "true" ||
  (!HAS_SMTP_CONFIG && !RESEND_API_KEY && process.env.NODE_ENV !== "production");

function otpDeliverySummary(): string {
  if (HAS_SMTP_CONFIG) {
    return `email via SMTP (${SMTP_HOST}:${SMTP_PORT})`;
  }
  if (RESEND_API_KEY) {
    return "email via Resend API";
  }
  if (OTP_DEMO_PREVIEW) {
    return "demo — OTP shown in UI only; configure SMTP_* or RESEND_API_KEY to send email";
  }
  return "not configured — set SMTP_* or RESEND_API_KEY for email OTP";
}

function hasEmailOtpDelivery() {
  return HAS_SMTP_CONFIG || Boolean(RESEND_API_KEY);
}

const MONGODB_URI = process.env.MONGODB_URI ?? "";
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME ?? "complaint_portal";
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT = Number.parseInt(process.env.LOGIN_RATE_LIMIT ?? "10", 10);
const OTP_RATE_LIMIT = Number.parseInt(process.env.OTP_RATE_LIMIT ?? "5", 10);

interface AdminUserRecord {
  id: string;
  name: string;
  username: string;
  passwordHash: string;
}

interface AuthenticatedRequest extends Request {
  adminUser?: AdminUserRecord;
  citizenUser?: CitizenUserRecord;
  blockUser?: BlockOperatorRecord;
}

interface OtpChallenge {
  id: string;
  purpose: "register" | "login";
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
      }
    | {
        kind: "admin-login";
        adminId: string;
      }
    | {
        kind: "block-login";
        blockId: string;
        portalId: string;
      };
}

const BLOCK_PORTALS: BlockPortalDefinition[] = [
  {
    portalId: "north-block-b",
    title: "North Block B Works Portal",
    shortName: "North Block B",
    description: "Dedicated block operations site for complaints routed to North Chandigarh Municipality Block B.",
    port: NORTH_BLOCK_PORT,
    municipalityId: "north-chandigarh",
    municipalityName: "North Chandigarh Municipality",
    blockId: "north-block-b",
    blockName: "Block B",
    sectors: findBlockById("north-chandigarh", "north-block-b")?.sectors ?? [],
  },
  {
    portalId: "central-block-b",
    title: "Central Block B Works Portal",
    shortName: "Central Block B",
    description: "Dedicated block operations site for complaints routed to Central Chandigarh Municipality Block B.",
    port: CENTRAL_BLOCK_PORT,
    municipalityId: "central-chandigarh",
    municipalityName: "Central Chandigarh Municipality",
    blockId: "central-block-b",
    blockName: "Block B",
    sectors: findBlockById("central-chandigarh", "central-block-b")?.sectors ?? [],
  },
];

const citizenSessions = new Map<string, string>();
const adminSessions = new Map<string, string>();
const blockSessions = new Map<string, string>();
const otpChallenges = new Map<string, OtpChallenge>();
const authAttempts = new Map<string, { count: number; resetAt: number }>();

interface MongoStore {
  client: MongoClient;
  complaints: Collection<ComplaintRecord>;
  adminUsers: Collection<AdminUserRecord>;
  citizenUsers: Collection<CitizenUserRecord>;
  blockUsers: Collection<BlockOperatorRecord>;
}

let mongoStore: MongoStore | null = null;

function hashPassword(password: string) {
  return bcrypt.hashSync(password, 12);
}

function legacyHashPassword(password: string) {
  return createHash("sha256").update(password).digest("hex");
}

function verifyPassword(password: string, passwordHash: string) {
  if (passwordHash.startsWith("$2a$") || passwordHash.startsWith("$2b$") || passwordHash.startsWith("$2y$")) {
    return bcrypt.compareSync(password, passwordHash);
  }

  return passwordHash === legacyHashPassword(password);
}

function buildRateLimitKey(req: Request, scope: string, identifier: string) {
  return `${scope}:${req.ip}:${normalizeIdentifier(identifier) || "anonymous"}`;
}

function checkRateLimit(key: string, maxAttempts: number) {
  const now = Date.now();
  const existing = authAttempts.get(key);

  if (!existing || existing.resetAt <= now) {
    authAttempts.set(key, { count: 1, resetAt: now + AUTH_WINDOW_MS });
    return null;
  }

  if (existing.count >= maxAttempts) {
    return {
      error: `Too many attempts. Try again after ${new Date(existing.resetAt).toLocaleTimeString()}.`,
    };
  }

  existing.count += 1;
  return null;
}

function clearRateLimit(key: string) {
  authAttempts.delete(key);
}

function isValidCategory(value: unknown): value is ComplaintCategory {
  return typeof value === "string" && COMPLAINT_CATEGORIES.includes(value as ComplaintCategory);
}

function isValidSeverity(value: unknown): value is ComplaintSeverity {
  return typeof value === "string" && COMPLAINT_SEVERITIES.includes(value as ComplaintSeverity);
}

function isValidRoutingStatus(value: unknown): value is ComplaintRoutingStatus {
  return typeof value === "string" && COMPLAINT_ROUTING_STATUSES.includes(value as ComplaintRoutingStatus);
}

function isValidStatus(value: unknown): value is ComplaintStatus {
  return typeof value === "string" && COMPLAINT_STATUSES.includes(value as ComplaintStatus);
}

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeComplaint(value: unknown) {
  if (typeof value !== "string") {
    return { error: "Complaint text must be a string." };
  }

  const text = normalizeWhitespace(value);

  if (text.length < MIN_COMPLAINT_LENGTH) {
    return { error: `Complaint must be at least ${MIN_COMPLAINT_LENGTH} characters.` };
  }

  if (text.length > MAX_COMPLAINT_LENGTH) {
    return { error: `Complaint must be ${MAX_COMPLAINT_LENGTH} characters or fewer.` };
  }

  return { text };
}

function normalizeLocationDetails(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return normalizeWhitespace(value).slice(0, MAX_LOCATION_LENGTH);
}

function normalizeCity(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return DEFAULT_CITY;
  }

  return normalizeWhitespace(value);
}

function normalizeName(value: unknown, label: string) {
  if (typeof value !== "string") {
    return { error: `${label} is required.` };
  }

  const normalized = normalizeWhitespace(value);

  if (normalized.length < 2) {
    return { error: `${label} must be at least 2 characters.` };
  }

  return { value: normalized };
}

function normalizePassword(value: unknown) {
  if (typeof value !== "string") {
    return { error: "Password is required." };
  }

  const trimmed = value.trim();

  if (trimmed.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  return { value: value };
}

function normalizePhone(value: unknown) {
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

function normalizeEmail(value: unknown) {
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

function normalizeIdentifier(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  return normalizeWhitespace(value).toLowerCase();
}

function normalizeRemark(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return normalizeWhitespace(value).slice(0, MAX_REMARK_LENGTH);
}

function hasAnyKeyword(text: string, keywords: string[]) {
  function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  for (const keyword of keywords) {
    const k = keyword.trim();
    if (!k) continue;

    // Avoid false positives for short latin tokens (e.g. "ped" inside "pedestrians").
    const isShortLatinToken = /^[a-z]+$/i.test(k) && k.length <= 4;
    if (isShortLatinToken) {
      const re = new RegExp(`\\b${escapeRegExp(k)}\\b`, "i");
      if (re.test(text)) return true;
      continue;
    }

    if (text.includes(k)) return true;
  }

  return false;
}

function normalizeComplaintForMatching(complaint: string) {
  return complaint
    .toLowerCase()
    .normalize("NFC")
    .replace(/[|।,.;:!?()[\]{}"'`~_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyWithRules(complaint: string): {
  category: ComplaintCategory;
  severity: ComplaintSeverity;
  source: ClassificationSource;
} {
  const text = normalizeComplaintForMatching(complaint);
  const roadHazardKeywords = [
    "road",
    "sadak",
    "सड़क",
    "सड़क",
    "street",
    "rasta",
    "raasta",
    "रास्ता",
    "pothole",
    "gadda",
    "khadda",
    "गड्ढा",
    "खड्डा",
    "tree",
    "ped",
    "पेड़",
    "पेड़",
  ];
  const severeRoadRiskKeywords = [
    "5ft",
    "5 ft",
    "5 feet",
    "deep",
    "deep pothole",
    "bada gadda",
    "bada khadda",
    "bda gadda",
    "bda khadda",
    "bahut bada",
    "bahut bda",
    "bohot bada",
    "bohot bda",
    "bara gadda",
    "bara khadda",
    "accident",
    "dangerous",
    "jaan ka khatra",
    "जान का खतरा",
    "khatarnaak",
    "खतरनाक",
    "risk",
    "gir sakti",
    "gir sakta",
    "gir gaya",
    "gir gya",
    "ped gira",
    "tree fallen",
    "पेड़ गिर",
    "पेड़ गिर",
    "paani bhar gaya",
    "pani bhar gaya",
    "paani bhar gya",
    "pani bhar gya",
    "water filled",
    "water-filled",
  ];

  const categorySignals: Array<{ category: ComplaintCategory; keywords: string[] }> = [
    {
      category: "Sewage",
      keywords: [
        "sewage",
        "drain",
        "drainage",
        "manhole",
        "sewer",
        "nali",
        "naali",
        "नाली",
        "नाला",
        "सीवर",
        "गटर",
        "मैनहोल",
        "gutter",
        "ganda paani",
        "ganda pani",
        "गंदा पानी",
        "pani bhar gaya",
        "paani bhar gaya",
        "jam",
        "जाम",
      ],
    },
    {
      category: "Water Supply",
      keywords: [
        "water",
        "pipeline",
        "pipe",
        "tap",
        "leak",
        "tank",
        "pani",
        "paani",
        "jal",
        "nal",
        "पानी",
        "जल",
        "नल",
        "nal ka pani",
        "paani nahi aa raha",
        "pani nahi aa raha",
        "paani nahi aa rahi",
        "pani nahi aa rahi",
        "पानी नहीं",
        "पानी नही",
        "सप्लाई",
        "water supply",
      ],
    },
    {
      category: "Street Light",
      keywords: [
        "light",
        "streetlight",
        "street light",
        "lamp",
        "dark",
        "electric pole",
        "bijli ka khamba",
        "bijli",
        "bijli ki taar",
        "electric wire",
        "wire",
        "current",
        "sparking",
        "short circuit",
        "बिजली",
        "बिजली की तार",
        "करंट",
        "तार",
        "खंभा",
        "खम्बा",
        "चिंगारी",
        "आग",
        "street light band",
        "light band",
        "andhera",
        "अंधेरा",
      ],
    },
    {
      category: "Road Issues",
      keywords: [
        "road",
        "pothole",
        "traffic",
        "footpath",
        "accident",
        "sadak",
        "gadda",
        "khadda",
        "सड़क",
        "सड़क",
        "गड्ढा",
        "खड्डा",
        "पेड़",
        "पेड़",
        "ped",
        "tree",
        "fallen tree",
        "ped gira",
        "पेड़ गिर",
        "पेड़ गिर",
        "kharab road",
        "rasta",
        "raasta",
        "रास्ता",
      ],
    },
    {
      category: "Garbage",
      keywords: [
        "garbage",
        "waste",
        "trash",
        "dump",
        "cleanliness",
        "kachra",
        "gandagi",
        "safai",
        "dustbin",
        "kooda",
        "koora",
        "कचरा",
        "कूड़ा",
        "कूड़ा",
        "गंदगी",
        "सफाई",
      ],
    },
  ];

  const severitySignals: Array<{ severity: ComplaintSeverity; keywords: string[] }> = [
    {
      severity: "Critical",
      keywords: [
        "fire",
        "aag",
        "आग",
        "electrocution",
        "current",
        "karant",
        "करंट",
        "injury",
        "ghayal",
        "घायल",
        "open manhole",
        "खुला मैनहोल",
        "collapsed",
        "flooding",
        "jaan ka khatra",
        "जान का खतरा",
        "jaan ko khatra",
        "bahut dangerous",
        "bohot dangerous",
        "bahut khatra",
        "khula manhole",
        "khatarnaak",
        "खतरनाक",
        "bijli ki taar mein aag",
        "bijli ki taar me aag",
        "बिजली की तार में आग",
        "wire fire",
        "live wire",
        "taar gir",
        "तार गिर",
        "ped gira",
        "tree fallen",
        "पेड़ गिर",
        "पेड़ गिर",
        "doob",
      ],
    },
    {
      severity: "High",
      keywords: [
        "danger",
        "hazard",
        "urgent",
        "major leak",
        "overflow",
        "badbu",
        "बदबू",
        "accident",
        "skid",
        "bike riders",
        "dangerous",
        "turant",
        "jaldi",
        "तुरंत",
        "जल्दी",
        "risk",
        "khatra",
        "खतरा",
      ],
    },
    {
      severity: "Medium",
      keywords: [
        "not working",
        "not been working",
        "completely dark",
        "broken",
        "blocked",
        "delayed",
        "band",
        "kharab",
        "ruk gaya",
        "ruk gaya hai",
        "problem",
        "dikkat",
        "समस्या",
        "दिक्कत",
        "बंद",
        "खराब",
        "kai dino",
        "kayi dino",
        "कई दिनों",
      ],
    },
  ];

  function keywordWeight(keyword: string) {
    const k = keyword.trim();
    if (!k) return 0;
    // Phrase-like keywords are usually more specific than short tokens.
    if (k.includes(" ") || k.includes("-")) return 3;
    if (k.length >= 10) return 2;
    return 1;
  }

  function scoreKeywords(keywords: string[]) {
    let score = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        score += keywordWeight(keyword);
      }
    }
    return score;
  }

  const categoryCandidates = categorySignals
    .map((signal) => ({
      category: signal.category,
      score: scoreKeywords(signal.keywords),
    }))
    .sort((a, b) => b.score - a.score);

  const category: ComplaintCategory = categoryCandidates[0]?.score ? categoryCandidates[0].category : "Other";

  if (
    hasAnyKeyword(text, ["open manhole", "khula manhole", "खुला मैनहोल", "मैनहोल"]) &&
    hasAnyKeyword(text, ["danger", "khatra", "खतरा", "jaan ka khatra", "जान का खतरा", "open"])
  ) {
    return { category: "Sewage", severity: "Critical", source: "rules" };
  }

  if (
    hasAnyKeyword(text, [
      "bijli ki taar mein aag",
      "bijli ki taar me aag",
      "बिजली की तार में आग",
      "wire fire",
      "electric wire fire",
      "live wire",
      "taar me aag",
      "तार में आग",
    ])
  ) {
    return { category: "Street Light", severity: "Critical", source: "rules" };
  }

  if (hasAnyKeyword(text, roadHazardKeywords) && hasAnyKeyword(text, severeRoadRiskKeywords)) {
    return { category: "Road Issues", severity: "Critical", source: "rules" };
  }

  if (category === "Road Issues" && hasAnyKeyword(text, ["accident", "dangerous", "risk", "khatra"])) {
    return { category, severity: "High", source: "rules" };
  }

  const criticalSignal = severitySignals.find((s) => s.severity === "Critical");
  const highSignal = severitySignals.find((s) => s.severity === "High");
  const mediumSignal = severitySignals.find((s) => s.severity === "Medium");

  const criticalScore = criticalSignal ? scoreKeywords(criticalSignal.keywords) : 0;
  const highScore = highSignal ? scoreKeywords(highSignal.keywords) : 0;
  const mediumScore = mediumSignal ? scoreKeywords(mediumSignal.keywords) : 0;

  const severity: ComplaintSeverity =
    criticalScore > 0 ? "Critical" : highScore > 0 ? "High" : mediumScore > 0 ? "Medium" : "Low";

  return { category, severity, source: "rules" };
}

function buildRoutingDetails(city: string, providedSector: unknown, complaint: string, locationDetails: string) {
  const normalizedCity = normalizeCity(city);
  const sector = normalizeSector(providedSector) ?? extractSectorFromText(locationDetails, complaint);
  const route = normalizedCity.toLowerCase() === DEFAULT_CITY.toLowerCase() ? findSectorRoute(sector) : null;

  if (!route) {
    return {
      city: normalizedCity,
      sector,
      municipalityId: null,
      municipalityName: null,
      blockId: null,
      blockName: null,
      routingStatus: "Needs Manual Review" as const,
    };
  }

  return {
    city: normalizedCity,
    sector: route.sector,
    municipalityId: route.municipalityId,
    municipalityName: route.municipalityName,
    blockId: route.blockId,
    blockName: route.blockName,
    routingStatus: "Automatic" as const,
  };
}

function createRemark(
  author: { id: string; name: string; role: PortalUserRole },
  message: string,
  workDone: boolean | null,
): ComplaintRemark {
  return {
    id: randomUUID().slice(0, 8).toUpperCase(),
    authorId: author.id,
    authorName: author.name,
    authorRole: author.role,
    message,
    createdAt: new Date().toISOString(),
    workDone,
  };
}

function nextCitizenId(users: CitizenUserRecord[]) {
  const maxValue = users.reduce((currentMax, user) => {
    const match = user.id.match(/(\d+)$/);
    const numeric = Number.parseInt(match?.[1] ?? "0", 10);
    return Math.max(currentMax, numeric);
  }, 1000);

  return `CIT-${String(maxValue + 1).padStart(4, "0")}`;
}

function cleanupOtpChallenges() {
  const now = Date.now();

  for (const [challengeId, challenge] of otpChallenges) {
    if (challenge.expiresAt <= now) {
      otpChallenges.delete(challengeId);
    }
  }
}

function issueOtpChallenge(challenge: Omit<OtpChallenge, "id" | "code" | "expiresAt">) {
  cleanupOtpChallenges();

  const createdChallenge: OtpChallenge = {
    ...challenge,
    id: randomUUID(),
    code: String(randomInt(100000, 999999)),
    expiresAt: Date.now() + OTP_EXPIRY_MS,
  };

  otpChallenges.set(createdChallenge.id, createdChallenge);

  return createdChallenge;
}

function consumeOtpChallenge(challengeId: string, otp: string) {
  cleanupOtpChallenges();
  const challenge = otpChallenges.get(challengeId);

  if (!challenge) {
    return { error: "OTP session has expired. Please request a new code." };
  }

  if (challenge.code !== otp.trim()) {
    return { error: "Incorrect OTP code." };
  }

  otpChallenges.delete(challengeId);
  return { challenge };
}

function createOtpResponse(challenge: OtpChallenge, message: string) {
  return {
    challengeId: challenge.id,
    expiresAt: new Date(challenge.expiresAt).toISOString(),
    channel: challenge.channel,
    destination: challenge.destination,
    ...(OTP_DEMO_PREVIEW ? { otpPreview: challenge.code } : {}),
    message,
  };
}

async function sendEmailOtp(challenge: OtpChallenge, subject: string) {
  if (challenge.channel !== "email") {
    if (OTP_DEMO_PREVIEW) {
      return;
    }

    throw new Error("Real phone OTP delivery is not configured. Use an email login or configure an SMS provider.");
  }

  const text = [
    `Your Complaint Portal OTP is ${challenge.code}.`,
    "",
    "This code expires in 5 minutes.",
    "If you did not request this code, you can ignore this email.",
  ].join("\n");

  if (HAS_SMTP_CONFIG) {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });

    try {
      await transporter.sendMail({
        from: OTP_FROM_EMAIL,
        to: challenge.destination,
        subject,
        text,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown SMTP error";
      console.error("Email OTP delivery failed via SMTP.", {
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        userConfigured: Boolean(SMTP_USER),
        from: OTP_FROM_EMAIL,
        to: challenge.destination,
        error: errorMessage,
      });
      throw new Error(`Email OTP delivery failed via SMTP. ${errorMessage}`);
    }

    return;
  }

  if (!RESEND_API_KEY) {
    if (OTP_DEMO_PREVIEW) {
      return;
    }

    throw new Error("Email OTP delivery is not configured. Set SMTP credentials or RESEND_API_KEY.");
  }

  const resend = new Resend(RESEND_API_KEY);
  
  try {
    const response = await resend.emails.send({
      from: OTP_FROM_EMAIL,
      to: challenge.destination,
      subject,
      text,
    });

    if (response.error) {
      throw new Error(`Email OTP delivery failed. ${response.error.message}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Email OTP delivery failed via Resend.", {
      from: OTP_FROM_EMAIL,
      to: challenge.destination,
      error: errorMessage,
    });
    throw new Error(`Email OTP delivery failed. ${errorMessage}`);
  }
}

async function deliverOtpChallenge(challenge: OtpChallenge, subject: string) {
  try {
    await sendEmailOtp(challenge, subject);
  } catch (error) {
    otpChallenges.delete(challenge.id);
    throw error;
  }
}

function getSeedAdminUsers(): AdminUserRecord[] {
  return [
    {
      id: "ADMIN-CHD-001",
      name: "Chandigarh Control Room",
      username: DEFAULT_ADMIN_USERNAME,
      passwordHash: hashPassword(DEFAULT_ADMIN_PASSWORD),
    },
  ];
}

function getSeedCitizenUsers(): CitizenUserRecord[] {
  return [
    {
      id: "CIT-1001",
      name: "Aman Sharma",
      phone: "9876543210",
      email: "aman.sharma@gmail.com",
      passwordHash: hashPassword("Citizen@123"),
      registeredAt: new Date("2026-04-01T10:00:00.000Z").toISOString(),
    },
    {
      id: "CIT-1002",
      name: "Neha Verma",
      phone: "9123456789",
      email: "neha.verma@gmail.com",
      passwordHash: hashPassword("Resident@123"),
      registeredAt: new Date("2026-04-02T11:30:00.000Z").toISOString(),
    },
  ];
}

function getSeedBlockUsers(): BlockOperatorRecord[] {
  return [
    {
      id: "BLK-NB-001",
      name: "North Block B Field Desk",
      username: "north.blockb",
      passwordHash: hashPassword("Block@123"),
      municipalityId: "north-chandigarh",
      municipalityName: "North Chandigarh Municipality",
      blockId: "north-block-b",
      blockName: "Block B",
      portalId: "north-block-b",
    },
    {
      id: "BLK-CB-001",
      name: "Central Block B Field Desk",
      username: "central.blockb",
      passwordHash: hashPassword("Block@123"),
      municipalityId: "central-chandigarh",
      municipalityName: "Central Chandigarh Municipality",
      blockId: "central-block-b",
      blockName: "Block B",
      portalId: "central-block-b",
    },
  ];
}

async function ensureDataStore() {
  await fs.mkdir(DATA_DIRECTORY, { recursive: true });

  try {
    await fs.access(COMPLAINTS_FILE);
  } catch {
    await fs.writeFile(COMPLAINTS_FILE, "[]\n", "utf-8");
  }

  try {
    await fs.access(ADMIN_USERS_FILE);
  } catch {
    await fs.writeFile(ADMIN_USERS_FILE, `${JSON.stringify(getSeedAdminUsers(), null, 2)}\n`, "utf-8");
  }

  try {
    await fs.access(CITIZEN_USERS_FILE);
  } catch {
    await fs.writeFile(CITIZEN_USERS_FILE, `${JSON.stringify(getSeedCitizenUsers(), null, 2)}\n`, "utf-8");
  }

  try {
    await fs.access(BLOCK_USERS_FILE);
  } catch {
    await fs.writeFile(BLOCK_USERS_FILE, `${JSON.stringify(getSeedBlockUsers(), null, 2)}\n`, "utf-8");
  }
}

function toComplaintRecord(item: unknown): ComplaintRecord | null {
  if (!item || typeof item !== "object") {
    return null;
  }

  const candidate = item as Partial<ComplaintRecord> & {
    locationDetails?: unknown;
    city?: unknown;
    sector?: unknown;
    municipalityId?: unknown;
    municipalityName?: unknown;
    blockId?: unknown;
    blockName?: unknown;
    routingStatus?: unknown;
    remarks?: unknown;
  };

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.text !== "string" ||
    typeof candidate.timestamp !== "string" ||
    typeof candidate.source !== "string" ||
    !isValidCategory(candidate.category) ||
    !isValidSeverity(candidate.severity)
  ) {
    return null;
  }

  const locationDetails = normalizeLocationDetails(candidate.locationDetails);
  const routingDetails = buildRoutingDetails(
    typeof candidate.city === "string" ? candidate.city : DEFAULT_CITY,
    candidate.sector,
    candidate.text,
    locationDetails,
  );
  const remarks = Array.isArray(candidate.remarks)
    ? candidate.remarks
        .map((remark) => {
          if (!remark || typeof remark !== "object") {
            return null;
          }

          const parsedRemark = remark as Partial<ComplaintRemark>;

          if (
            typeof parsedRemark.id !== "string" ||
            typeof parsedRemark.authorId !== "string" ||
            typeof parsedRemark.authorName !== "string" ||
            typeof parsedRemark.authorRole !== "string" ||
            typeof parsedRemark.message !== "string" ||
            typeof parsedRemark.createdAt !== "string"
          ) {
            return null;
          }

          return {
            id: parsedRemark.id,
            authorId: parsedRemark.authorId,
            authorName: parsedRemark.authorName,
            authorRole:
              parsedRemark.authorRole === "admin" ||
              parsedRemark.authorRole === "block" ||
              parsedRemark.authorRole === "citizen"
                ? parsedRemark.authorRole
                : "admin",
            message: parsedRemark.message,
            createdAt: parsedRemark.createdAt,
            workDone:
              typeof parsedRemark.workDone === "boolean" || parsedRemark.workDone === null
                ? parsedRemark.workDone
                : null,
          } satisfies ComplaintRemark;
        })
        .filter((remark): remark is ComplaintRemark => remark !== null)
    : [];

  return {
    id: candidate.id,
    text: candidate.text,
    city: typeof candidate.city === "string" && candidate.city.trim() ? candidate.city : routingDetails.city,
    locationDetails,
    sector: routingDetails.sector,
    category: candidate.category,
    severity: candidate.severity,
    status: isValidStatus(candidate.status) ? candidate.status : "Received",
    routingStatus: isValidRoutingStatus(candidate.routingStatus)
      ? candidate.routingStatus
      : routingDetails.routingStatus,
    municipalityId:
      typeof candidate.municipalityId === "string" || candidate.municipalityId === null
        ? candidate.municipalityId
        : routingDetails.municipalityId,
    municipalityName:
      typeof candidate.municipalityName === "string" || candidate.municipalityName === null
        ? candidate.municipalityName
        : routingDetails.municipalityName,
    blockId:
      typeof candidate.blockId === "string" || candidate.blockId === null ? candidate.blockId : routingDetails.blockId,
    blockName:
      typeof candidate.blockName === "string" || candidate.blockName === null
        ? candidate.blockName
        : routingDetails.blockName,
    source: candidate.source === "ai" ? "ai" : "rules",
    timestamp: candidate.timestamp,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : candidate.timestamp,
    resolvedAt: typeof candidate.resolvedAt === "string" || candidate.resolvedAt === null ? candidate.resolvedAt : null,
    citizenId: typeof candidate.citizenId === "string" ? candidate.citizenId : "LEGACY-CITIZEN",
    citizenName: typeof candidate.citizenName === "string" ? candidate.citizenName : "Legacy Citizen",
    citizenPhone: typeof candidate.citizenPhone === "string" ? candidate.citizenPhone : "0000000000",
    citizenEmail:
      typeof candidate.citizenEmail === "string" || candidate.citizenEmail === null ? candidate.citizenEmail : null,
    workDone: typeof candidate.workDone === "boolean" ? candidate.workDone : candidate.status === "Resolved",
    remarks,
  };
}

function toCitizenUser(item: unknown): CitizenUserRecord | null {
  if (!item || typeof item !== "object") {
    return null;
  }

  const candidate = item as Partial<CitizenUserRecord>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string" ||
    typeof candidate.phone !== "string" ||
    typeof candidate.passwordHash !== "string" ||
    typeof candidate.registeredAt !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    name: candidate.name,
    phone: candidate.phone,
    email: typeof candidate.email === "string" || candidate.email === null ? candidate.email : null,
    passwordHash: candidate.passwordHash,
    registeredAt: candidate.registeredAt,
  };
}

function toBlockUser(item: unknown): BlockOperatorRecord | null {
  if (!item || typeof item !== "object") {
    return null;
  }

  const candidate = item as Partial<BlockOperatorRecord>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string" ||
    typeof candidate.username !== "string" ||
    typeof candidate.passwordHash !== "string" ||
    typeof candidate.municipalityId !== "string" ||
    typeof candidate.municipalityName !== "string" ||
    typeof candidate.blockId !== "string" ||
    typeof candidate.blockName !== "string" ||
    typeof candidate.portalId !== "string"
  ) {
    return null;
  }

  return candidate as BlockOperatorRecord;
}

async function replaceCollection<T extends { id: string }>(collection: Collection<T>, records: T[]) {
  await collection.deleteMany({});

  if (records.length > 0) {
    await collection.insertMany(records as unknown as Parameters<typeof collection.insertMany>[0]);
  }
}

function stripMongoId<T extends object>(item: T): Omit<T, "_id"> {
  const { _id, ...record } = item as T & { _id?: unknown };
  return record;
}

async function connectMongoStore() {
  if (!MONGODB_URI) {
    return null;
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();

  const db = client.db(MONGODB_DB_NAME);
  const store: MongoStore = {
    client,
    complaints: db.collection<ComplaintRecord>("complaints"),
    adminUsers: db.collection<AdminUserRecord>("adminUsers"),
    citizenUsers: db.collection<CitizenUserRecord>("citizenUsers"),
    blockUsers: db.collection<BlockOperatorRecord>("blockUsers"),
  };

  await Promise.all([
    store.complaints.createIndex({ id: 1 }, { unique: true }),
    store.complaints.createIndex({ citizenId: 1, timestamp: -1 }),
    store.complaints.createIndex({ municipalityId: 1, blockId: 1, updatedAt: -1 }),
    store.adminUsers.createIndex({ id: 1 }, { unique: true }),
    store.adminUsers.createIndex({ username: 1 }, { unique: true }),
    store.citizenUsers.createIndex({ id: 1 }, { unique: true }),
    store.citizenUsers.createIndex({ phone: 1 }, { unique: true }),
    store.citizenUsers.createIndex({ email: 1 }, { sparse: true }),
    store.blockUsers.createIndex({ id: 1 }, { unique: true }),
    store.blockUsers.createIndex({ username: 1, portalId: 1 }, { unique: true }),
  ]);

  if ((await store.adminUsers.countDocuments()) === 0) {
    await store.adminUsers.insertMany(getSeedAdminUsers());
  }

  if ((await store.citizenUsers.countDocuments()) === 0) {
    await store.citizenUsers.insertMany(getSeedCitizenUsers());
  }

  if ((await store.blockUsers.countDocuments()) === 0) {
    await store.blockUsers.insertMany(getSeedBlockUsers());
  }

  return store;
}

async function initializePersistence() {
  if (!MONGODB_URI) {
    await ensureDataStore();
    return "file" as const;
  }

  mongoStore = await connectMongoStore();
  return "mongodb" as const;
}

async function loadComplaints() {
  if (mongoStore) {
    return (await mongoStore.complaints.find({}, { projection: { _id: 0 } }).toArray())
      .map(stripMongoId)
      .map((item) => toComplaintRecord(item))
      .filter((item): item is ComplaintRecord => item !== null);
  }

  const raw = await fs.readFile(COMPLAINTS_FILE, "utf-8");
  const parsed: unknown = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.map((item) => toComplaintRecord(item)).filter((item): item is ComplaintRecord => item !== null);
}

async function saveComplaints(complaints: ComplaintRecord[]) {
  if (mongoStore) {
    await replaceCollection(mongoStore.complaints, complaints);
    return;
  }

  await fs.writeFile(COMPLAINTS_FILE, `${JSON.stringify(complaints, null, 2)}\n`, "utf-8");
}

async function loadAdminUsers() {
  if (mongoStore) {
    return (await mongoStore.adminUsers.find({}, { projection: { _id: 0 } }).toArray()).map(stripMongoId).filter((item): item is AdminUserRecord => {
      if (!item || typeof item !== "object") {
        return false;
      }

      const candidate = item as Partial<AdminUserRecord>;

      return (
        typeof candidate.id === "string" &&
        typeof candidate.name === "string" &&
        typeof candidate.username === "string" &&
        typeof candidate.passwordHash === "string"
      );
    });
  }

  const raw = await fs.readFile(ADMIN_USERS_FILE, "utf-8");
  const parsed: unknown = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter((item): item is AdminUserRecord => {
    if (!item || typeof item !== "object") {
      return false;
    }

    const candidate = item as Partial<AdminUserRecord>;

    return (
      typeof candidate.id === "string" &&
      typeof candidate.name === "string" &&
      typeof candidate.username === "string" &&
      typeof candidate.passwordHash === "string"
    );
  });
}

async function loadCitizenUsers() {
  if (mongoStore) {
    return (await mongoStore.citizenUsers.find({}, { projection: { _id: 0 } }).toArray())
      .map(stripMongoId)
      .map((item) => toCitizenUser(item))
      .filter((item): item is CitizenUserRecord => item !== null);
  }

  const raw = await fs.readFile(CITIZEN_USERS_FILE, "utf-8");
  const parsed: unknown = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.map((item) => toCitizenUser(item)).filter((item): item is CitizenUserRecord => item !== null);
}

async function saveCitizenUsers(users: CitizenUserRecord[]) {
  if (mongoStore) {
    await replaceCollection(mongoStore.citizenUsers, users);
    return;
  }

  await fs.writeFile(CITIZEN_USERS_FILE, `${JSON.stringify(users, null, 2)}\n`, "utf-8");
}

async function loadBlockUsers() {
  if (mongoStore) {
    return (await mongoStore.blockUsers.find({}, { projection: { _id: 0 } }).toArray())
      .map(stripMongoId)
      .map((item) => toBlockUser(item))
      .filter((item): item is BlockOperatorRecord => item !== null);
  }

  const raw = await fs.readFile(BLOCK_USERS_FILE, "utf-8");
  const parsed: unknown = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.map((item) => toBlockUser(item)).filter((item): item is BlockOperatorRecord => item !== null);
}

function sanitizeCitizenUser(user: CitizenUserRecord): CitizenSessionUser {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    registeredAt: user.registeredAt,
  };
}

function sanitizeAdminUser(user: AdminUserRecord): AdminSessionUser {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
  };
}

function sanitizeBlockUser(user: BlockOperatorRecord): BlockSessionUser {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    municipalityId: user.municipalityId,
    municipalityName: user.municipalityName,
    blockId: user.blockId,
    blockName: user.blockName,
    portalId: user.portalId,
  };
}

function findCitizenByIdentifier(users: CitizenUserRecord[], identifier: string) {
  const normalizedIdentifier = normalizeIdentifier(identifier);
  const normalizedDigits = identifier.replace(/\D/g, "");
  const phoneIdentifier =
    normalizedDigits.length === 12 && normalizedDigits.startsWith("91") ? normalizedDigits.slice(2) : normalizedDigits;

  return users.find(
    (user) =>
      user.id.toLowerCase() === normalizedIdentifier ||
      user.phone === phoneIdentifier ||
      (user.email ? user.email.toLowerCase() === normalizedIdentifier : false),
  );
}

function blockEmailAlias(username: string) {
  return username.includes("@") ? username.toLowerCase() : `${username.toLowerCase()}@chandigarh.gov.in`;
}

function findAdminByIdentifier(users: AdminUserRecord[], identifier: string) {
  const normalizedIdentifier = normalizeIdentifier(identifier);
  return users.find((user) => user.username.toLowerCase() === normalizedIdentifier);
}

function findBlockByIdentifier(users: BlockOperatorRecord[], identifier: string, portalId: string) {
  const normalizedIdentifier = normalizeIdentifier(identifier);
  return users.find(
    (user) =>
      user.portalId === portalId &&
      (user.username.toLowerCase() === normalizedIdentifier ||
        blockEmailAlias(user.username) === normalizedIdentifier),
  );
}

async function classifyComplaint(complaint: string, ai: GoogleGenAI | null) {
  const rulesClassification = classifyWithRules(complaint);

  if (rulesClassification.category !== "Other" || rulesClassification.severity !== "Low") {
    return rulesClassification;
  }

  if (!ai) {
    return rulesClassification;
  }

  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: [
                "Classify this municipality complaint into a category and severity.",
                "The complaint may be written in English, Hindi, or Hinglish.",
                "Deep potholes, major road cave-ins, and road hazards with explicit accident risk should be treated as Critical.",
                `Allowed categories: ${COMPLAINT_CATEGORIES.join(", ")}.`,
                `Allowed severities: ${COMPLAINT_SEVERITIES.join(", ")}.`,
                `Rules hint (use this if it seems correct): {"category":"${rulesClassification.category}","severity":"${rulesClassification.severity}"}`,
                "If you are not confident, return Other + Low.",
                "Return only valid JSON in this exact shape:",
                '{"category":"Garbage","severity":"Low"}',
                `Complaint: ${complaint}`,
              ].join("\n"),
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const responseText = result.text ?? "";
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const parsedText = jsonMatch?.[0] ?? responseText;
    const parsed = JSON.parse(parsedText) as Partial<{
      category: ComplaintCategory;
      severity: ComplaintSeverity;
    }>;

    if (!isValidCategory(parsed.category) || !isValidSeverity(parsed.severity)) {
      throw new Error("Model returned unsupported classification values.");
    }

    return {
      category: parsed.category,
      severity: parsed.severity,
      source: "ai" as const,
    };
  } catch (error) {
    console.error("AI classification failed. Falling back to rules-based routing.", error);
    return rulesClassification;
  }
}

function applySecurityHeaders(app: express.Express) {
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.use((_, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
    next();
  });
}

function createHealthPayload(complaints: ComplaintRecord[], ai: GoogleGenAI | null): ComplaintHealth {
  return {
    status: "ok",
    complaintCount: complaints.length,
    manualReviewCount: complaints.filter((item) => item.routingStatus === "Needs Manual Review").length,
    aiAvailable: Boolean(ai),
    persistence: mongoStore ? "mongodb" : "file",
    otpDelivery: otpDeliverySummary(),
    emailOtpConfigured: hasEmailOtpDelivery(),
    smtpConfigured: HAS_SMTP_CONFIG,
    resendConfigured: Boolean(RESEND_API_KEY),
    uptimeSeconds: Math.floor((Date.now() - SERVER_STARTED_AT) / 1000),
  };
}

function addComplaintRemark(
  complaint: ComplaintRecord,
  author: { id: string; name: string; role: PortalUserRole },
  remarkText: string,
  workDone: boolean | null,
) {
  if (!remarkText) {
    return;
  }

  complaint.remarks.unshift(createRemark(author, remarkText, workDone));
}

function getPortalDefinition(portalId: string) {
  return BLOCK_PORTALS.find((portal) => portal.portalId === portalId) ?? null;
}

async function registerApiRoutes(
  app: express.Express,
  complaints: ComplaintRecord[],
  adminUsers: AdminUserRecord[],
  citizenUsers: CitizenUserRecord[],
  blockUsers: BlockOperatorRecord[],
  ai: GoogleGenAI | null,
) {
  function requireCitizen(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const authorization = req.headers.authorization;
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: "Missing citizen access token." });
    }

    const userId = citizenSessions.get(token);
    const citizenUser = citizenUsers.find((item) => item.id === userId);

    if (!userId || !citizenUser) {
      return res.status(401).json({ error: "Invalid citizen session." });
    }

    req.citizenUser = citizenUser;
    return next();
  }

  function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const authorization = req.headers.authorization;
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: "Missing admin access token." });
    }

    const userId = adminSessions.get(token);
    const adminUser = adminUsers.find((item) => item.id === userId);

    if (!userId || !adminUser) {
      return res.status(401).json({ error: "Invalid admin session." });
    }

    req.adminUser = adminUser;
    return next();
  }

  function requireBlockOperator(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const authorization = req.headers.authorization;
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: "Missing block access token." });
    }

    const userId = blockSessions.get(token);
    const blockUser = blockUsers.find((item) => item.id === userId);

    if (!userId || !blockUser) {
      return res.status(401).json({ error: "Invalid block session." });
    }

    req.blockUser = blockUser;
    return next();
  }

  app.get("/api/health", (_req, res) => {
    res.json(createHealthPayload(complaints, ai));
  });

  app.get("/api/municipalities", (_req, res) => {
    res.json({
      city: DEFAULT_CITY,
      sectors: CHANDIGARH_SECTORS,
      municipalities: MUNICIPALITY_MAP,
      blockPortals: BLOCK_PORTALS,
    });
  });

  app.post("/api/auth/register/request-otp", async (req, res) => {
    const normalizedName = normalizeName(req.body?.name, "Full name");

    if ("error" in normalizedName) {
      return res.status(400).json({ error: normalizedName.error });
    }

    const normalizedPhone = normalizePhone(req.body?.phone);

    if ("error" in normalizedPhone) {
      return res.status(400).json({ error: normalizedPhone.error });
    }

    const rateLimit = checkRateLimit(buildRateLimitKey(req, "citizen-register-otp", normalizedPhone.value), OTP_RATE_LIMIT);
    if (rateLimit) {
      return res.status(429).json(rateLimit);
    }

    const normalizedEmail = normalizeEmail(req.body?.email);

    if ("error" in normalizedEmail) {
      return res.status(400).json({ error: normalizedEmail.error });
    }

    const normalizedPassword = normalizePassword(req.body?.password);

    if ("error" in normalizedPassword) {
      return res.status(400).json({ error: normalizedPassword.error });
    }

    if (citizenUsers.some((user) => user.phone === normalizedPhone.value)) {
      return res.status(409).json({ error: "A citizen account already exists for this phone number." });
    }

    if (
      normalizedEmail.value &&
      citizenUsers.some((user) => user.email && user.email.toLowerCase() === normalizedEmail.value)
    ) {
      return res.status(409).json({ error: "A citizen account already exists for this email address." });
    }

    if (!normalizedEmail.value && !OTP_DEMO_PREVIEW) {
      return res.status(400).json({
        error: "Email address is required for OTP. SMS delivery is not configured for this deployment.",
      });
    }

    const challenge = issueOtpChallenge({
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
      await deliverOtpChallenge(challenge, "Verify your Complaint Portal account");
    } catch (error) {
      return res.status(503).json({
        error: error instanceof Error ? error.message : "Unable to deliver OTP.",
      });
    }

    return res.status(201).json(
      createOtpResponse(
        challenge,
        challenge.channel === "phone"
          ? "OTP generated for phone verification."
          : "OTP sent to your email address.",
      ),
    );
  });

  app.post("/api/auth/register/verify", async (req, res) => {
    const challengeId = typeof req.body?.challengeId === "string" ? req.body.challengeId : "";
    const otp = typeof req.body?.otp === "string" ? req.body.otp.trim() : "";
    const consumed = consumeOtpChallenge(challengeId, otp);

    if ("error" in consumed) {
      return res.status(400).json({ error: consumed.error });
    }

    if (consumed.challenge.payload.kind !== "register") {
      return res.status(400).json({ error: "OTP challenge is not valid for registration." });
    }

    const payload = consumed.challenge.payload;

    if (citizenUsers.some((user) => user.phone === payload.phone)) {
      return res.status(409).json({ error: "A citizen account already exists for this phone number." });
    }

    if (payload.email && citizenUsers.some((user) => user.email === payload.email)) {
      return res.status(409).json({ error: "A citizen account already exists for this email address." });
    }

    const citizenUser: CitizenUserRecord = {
      id: nextCitizenId(citizenUsers),
      name: payload.name,
      phone: payload.phone,
      email: payload.email,
      passwordHash: payload.passwordHash,
      registeredAt: new Date().toISOString(),
    };

    citizenUsers.push(citizenUser);
    await saveCitizenUsers(citizenUsers);

    const token = randomUUID();
    citizenSessions.set(token, citizenUser.id);

    return res.status(201).json({
      token,
      user: sanitizeCitizenUser(citizenUser),
    });
  });

  app.post("/api/auth/login/password", (req, res) => {
    const identifier = typeof req.body?.identifier === "string" ? req.body.identifier : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const rateLimitKey = buildRateLimitKey(req, "citizen-password", identifier);
    const rateLimit = checkRateLimit(rateLimitKey, LOGIN_RATE_LIMIT);

    if (rateLimit) {
      return res.status(429).json(rateLimit);
    }

    const citizenUser = findCitizenByIdentifier(citizenUsers, identifier);

    if (!citizenUser || !verifyPassword(password, citizenUser.passwordHash)) {
      return res.status(401).json({ error: "Invalid citizen credentials." });
    }

    clearRateLimit(rateLimitKey);
    const token = randomUUID();
    citizenSessions.set(token, citizenUser.id);

    return res.json({
      token,
      user: sanitizeCitizenUser(citizenUser),
    });
  });

  app.post("/api/auth/login/request-otp", async (req, res) => {
    const identifier = typeof req.body?.identifier === "string" ? req.body.identifier : "";
    const rateLimit = checkRateLimit(buildRateLimitKey(req, "citizen-login-otp", identifier), OTP_RATE_LIMIT);

    if (rateLimit) {
      return res.status(429).json(rateLimit);
    }

    const citizenUser = findCitizenByIdentifier(citizenUsers, identifier);

    if (!citizenUser) {
      return res.status(404).json({ error: "Citizen account not found for that phone, email, or user ID." });
    }

    const useEmailChannel = Boolean(citizenUser.email);

    if (!useEmailChannel && !OTP_DEMO_PREVIEW) {
      return res.status(400).json({
        error: "This account has no email address for OTP. Please sign in with password or register with an email address.",
      });
    }

    const challenge = issueOtpChallenge({
      purpose: "login",
      channel: useEmailChannel ? "email" : "phone",
      destination: useEmailChannel ? citizenUser.email! : citizenUser.phone,
      payload: {
        kind: "login",
        citizenId: citizenUser.id,
      },
    });

    try {
      await deliverOtpChallenge(challenge, "Your Complaint Portal sign-in code");
    } catch (error) {
      return res.status(503).json({
        error: error instanceof Error ? error.message : "Unable to deliver OTP.",
      });
    }

    return res.status(201).json(
      createOtpResponse(
        challenge,
        challenge.channel === "phone" ? "OTP generated for phone sign-in." : "OTP sent to your email address.",
      ),
    );
  });

  app.post("/api/auth/login/verify-otp", (req, res) => {
    const challengeId = typeof req.body?.challengeId === "string" ? req.body.challengeId : "";
    const otp = typeof req.body?.otp === "string" ? req.body.otp.trim() : "";
    const consumed = consumeOtpChallenge(challengeId, otp);

    if ("error" in consumed) {
      return res.status(400).json({ error: consumed.error });
    }

    if (consumed.challenge.payload.kind !== "login") {
      return res.status(400).json({ error: "OTP challenge is not valid for sign-in." });
    }

    const loginPayload = consumed.challenge.payload;
    const citizenUser = citizenUsers.find((user) => user.id === loginPayload.citizenId);

    if (!citizenUser) {
      return res.status(404).json({ error: "Citizen account no longer exists." });
    }

    const token = randomUUID();
    citizenSessions.set(token, citizenUser.id);

    return res.json({
      token,
      user: sanitizeCitizenUser(citizenUser),
    });
  });

  app.get("/api/citizen/dashboard", requireCitizen, (req: AuthenticatedRequest, res) => {
    const citizenUser = req.citizenUser!;
    const citizenComplaints = complaints
      .filter((complaint) => complaint.citizenId === citizenUser.id)
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp));

    res.json({
      user: sanitizeCitizenUser(citizenUser),
      complaints: citizenComplaints,
    });
  });

  app.post("/api/complaints", requireCitizen, async (req: AuthenticatedRequest, res) => {
    const normalizedComplaint = normalizeComplaint(req.body?.complaint);

    if ("error" in normalizedComplaint) {
      return res.status(400).json({ error: normalizedComplaint.error });
    }

    const citizenUser = req.citizenUser!;
    const city = normalizeCity(req.body?.city);
    const locationDetails = normalizeLocationDetails(req.body?.locationDetails);
    const routing = buildRoutingDetails(city, req.body?.sector, normalizedComplaint.text, locationDetails);

    try {
      const classification = await classifyComplaint(normalizedComplaint.text, ai);
      const now = new Date().toISOString();
      const newRecord: ComplaintRecord = {
        id: randomUUID().slice(0, 8).toUpperCase(),
        text: normalizedComplaint.text,
        city: routing.city,
        locationDetails,
        sector: routing.sector,
        category: classification.category,
        severity: classification.severity,
        status: routing.routingStatus === "Needs Manual Review" ? "Received" : "Assigned",
        routingStatus: routing.routingStatus,
        municipalityId: routing.municipalityId,
        municipalityName: routing.municipalityName,
        blockId: routing.blockId,
        blockName: routing.blockName,
        source: classification.source,
        timestamp: now,
        updatedAt: now,
        resolvedAt: null,
        citizenId: citizenUser.id,
        citizenName: citizenUser.name,
        citizenPhone: citizenUser.phone,
        citizenEmail: citizenUser.email,
        workDone: false,
        remarks: [
          createRemark(
            { id: citizenUser.id, name: citizenUser.name, role: "citizen" },
            "Complaint submitted by citizen.",
            false,
          ),
        ],
      };

      complaints.unshift(newRecord);
      await saveComplaints(complaints);

      return res.status(201).json(newRecord);
    } catch (error) {
      console.error("Failed to create complaint record.", error);
      return res.status(500).json({ error: "Failed to create complaint. Please try again." });
    }
  });

  app.post("/api/admin/login", (req, res) => {
    const username = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const rateLimitKey = buildRateLimitKey(req, "admin-password", username);
    const rateLimit = checkRateLimit(rateLimitKey, LOGIN_RATE_LIMIT);

    if (rateLimit) {
      return res.status(429).json(rateLimit);
    }

    const adminUser = findAdminByIdentifier(adminUsers, username);

    if (!adminUser || !verifyPassword(password, adminUser.passwordHash)) {
      return res.status(401).json({ error: "Invalid admin credentials." });
    }

    clearRateLimit(rateLimitKey);
    const token = randomUUID();
    adminSessions.set(token, adminUser.id);

    return res.json({
      token,
      user: sanitizeAdminUser(adminUser),
    });
  });

  app.post("/api/admin/login/request-otp", async (req, res) => {
    const username = typeof req.body?.username === "string" ? req.body.username : "";
    const rateLimit = checkRateLimit(buildRateLimitKey(req, "admin-login-otp", username), OTP_RATE_LIMIT);

    if (rateLimit) {
      return res.status(429).json(rateLimit);
    }

    const adminUser = findAdminByIdentifier(adminUsers, username);

    if (!adminUser) {
      return res.status(404).json({ error: "Admin account not found for that email address." });
    }

    const challenge = issueOtpChallenge({
      purpose: "login",
      channel: "email",
      destination: adminUser.username,
      payload: {
        kind: "admin-login",
        adminId: adminUser.id,
      },
    });

    try {
      await deliverOtpChallenge(challenge, "Your admin Complaint Portal sign-in code");
    } catch (error) {
      return res.status(503).json({
        error: error instanceof Error ? error.message : "Unable to deliver admin OTP.",
      });
    }

    return res.status(201).json(createOtpResponse(challenge, "OTP sent to your admin email address."));
  });

  app.post("/api/admin/login/verify-otp", (req, res) => {
    const challengeId = typeof req.body?.challengeId === "string" ? req.body.challengeId : "";
    const otp = typeof req.body?.otp === "string" ? req.body.otp.trim() : "";
    const consumed = consumeOtpChallenge(challengeId, otp);

    if ("error" in consumed) {
      return res.status(400).json({ error: consumed.error });
    }

    const payload = consumed.challenge.payload;

    if (payload.kind !== "admin-login") {
      return res.status(400).json({ error: "OTP challenge is not valid for admin sign-in." });
    }

    const adminUser = adminUsers.find((user) => user.id === payload.adminId);

    if (!adminUser) {
      return res.status(404).json({ error: "Admin account no longer exists." });
    }

    const token = randomUUID();
    adminSessions.set(token, adminUser.id);

    return res.json({
      token,
      user: sanitizeAdminUser(adminUser),
    });
  });

  app.get("/api/admin/complaints", requireAdmin, (_req, res) => {
    res.json({
      municipalities: MUNICIPALITY_MAP,
      blockPortals: BLOCK_PORTALS,
      complaints: complaints.sort((left, right) => right.timestamp.localeCompare(left.timestamp)),
    });
  });

  app.patch("/api/admin/complaints/:id/assign", requireAdmin, async (req: AuthenticatedRequest, res) => {
    const complaint = complaints.find((item) => item.id === req.params.id);

    if (!complaint) {
      return res.status(404).json({ error: "Complaint not found." });
    }

    const municipalityId = typeof req.body?.municipalityId === "string" ? req.body.municipalityId : "";
    const blockId = typeof req.body?.blockId === "string" ? req.body.blockId : "";
    const remark = normalizeRemark(req.body?.remark);
    const municipality = MUNICIPALITY_MAP.find((item) => item.id === municipalityId);
    const block = municipality ? findBlockById(municipality.id, blockId) : null;

    if (!municipality || !block) {
      return res.status(400).json({ error: "Please choose a valid municipality and block." });
    }

    complaint.municipalityId = municipality.id;
    complaint.municipalityName = municipality.name;
    complaint.blockId = block.id;
    complaint.blockName = block.name;
    complaint.routingStatus = "Manually Assigned";
    complaint.status = "Assigned";
    complaint.workDone = false;
    complaint.resolvedAt = null;
    complaint.updatedAt = new Date().toISOString();

    if (!complaint.sector && block.sectors.length > 0) {
      complaint.sector = block.sectors[0] ?? null;
    }

    addComplaintRemark(
      complaint,
      {
        id: req.adminUser!.id,
        name: req.adminUser!.name,
        role: "admin",
      },
      remark || `Complaint directed to ${municipality.name} / ${block.name}.`,
      false,
    );

    await saveComplaints(complaints);

    return res.json({
      complaint,
      assignedBy: req.adminUser?.name ?? "Admin",
    });
  });

  app.patch("/api/admin/complaints/:id/update", requireAdmin, async (req: AuthenticatedRequest, res) => {
    const complaint = complaints.find((item) => item.id === req.params.id);

    if (!complaint) {
      return res.status(404).json({ error: "Complaint not found." });
    }

    const remark = normalizeRemark(req.body?.remark);
    const requestedStatus = req.body?.status;
    const workDone = typeof req.body?.workDone === "boolean" ? req.body.workDone : null;

    if (!remark && !isValidStatus(requestedStatus) && workDone === null) {
      return res.status(400).json({ error: "Provide a remark, status, or work-done flag to update the complaint." });
    }

    if (isValidStatus(requestedStatus)) {
      complaint.status = requestedStatus;
    }

    if (typeof workDone === "boolean") {
      complaint.workDone = workDone;
      complaint.status = workDone ? "Resolved" : complaint.status === "Resolved" ? "In Progress" : complaint.status;
      complaint.resolvedAt = workDone ? new Date().toISOString() : null;
    }

    complaint.updatedAt = new Date().toISOString();
    addComplaintRemark(
      complaint,
      {
        id: req.adminUser!.id,
        name: req.adminUser!.name,
        role: "admin",
      },
      remark || "Admin updated complaint progress.",
      workDone,
    );

    await saveComplaints(complaints);

    return res.json({ complaint });
  });

  app.post("/api/block/login", (req, res) => {
    const username = typeof req.body?.username === "string" ? req.body.username : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const portalId = typeof req.body?.portalId === "string" ? req.body.portalId : "";
    const rateLimitKey = buildRateLimitKey(req, "block-password", `${portalId}:${username}`);
    const rateLimit = checkRateLimit(rateLimitKey, LOGIN_RATE_LIMIT);

    if (rateLimit) {
      return res.status(429).json(rateLimit);
    }

    const blockUser = findBlockByIdentifier(blockUsers, username, portalId);

    if (!blockUser || !verifyPassword(password, blockUser.passwordHash)) {
      return res.status(401).json({ error: "Invalid block credentials for this portal." });
    }

    clearRateLimit(rateLimitKey);
    const token = randomUUID();
    blockSessions.set(token, blockUser.id);

    return res.json({
      token,
      user: sanitizeBlockUser(blockUser),
      portal: getPortalDefinition(blockUser.portalId),
    });
  });

  app.post("/api/block/login/request-otp", async (req, res) => {
    const username = typeof req.body?.username === "string" ? req.body.username : "";
    const portalId = typeof req.body?.portalId === "string" ? req.body.portalId : "";
    const rateLimit = checkRateLimit(buildRateLimitKey(req, "block-login-otp", `${portalId}:${username}`), OTP_RATE_LIMIT);

    if (rateLimit) {
      return res.status(429).json(rateLimit);
    }

    const blockUser = findBlockByIdentifier(blockUsers, username, portalId);

    if (!blockUser) {
      return res.status(404).json({ error: "Block account not found for this portal." });
    }

    const challenge = issueOtpChallenge({
      purpose: "login",
      channel: "email",
      destination: blockEmailAlias(blockUser.username),
      payload: {
        kind: "block-login",
        blockId: blockUser.id,
        portalId: blockUser.portalId,
      },
    });

    try {
      await deliverOtpChallenge(challenge, "Your municipality block sign-in code");
    } catch (error) {
      return res.status(503).json({
        error: error instanceof Error ? error.message : "Unable to deliver block OTP.",
      });
    }

    return res.status(201).json(createOtpResponse(challenge, "OTP sent to your municipality block email address."));
  });

  app.post("/api/block/login/verify-otp", (req, res) => {
    const challengeId = typeof req.body?.challengeId === "string" ? req.body.challengeId : "";
    const otp = typeof req.body?.otp === "string" ? req.body.otp.trim() : "";
    const portalId = typeof req.body?.portalId === "string" ? req.body.portalId : "";
    const consumed = consumeOtpChallenge(challengeId, otp);

    if ("error" in consumed) {
      return res.status(400).json({ error: consumed.error });
    }

    const payload = consumed.challenge.payload;

    if (payload.kind !== "block-login" || payload.portalId !== portalId) {
      return res.status(400).json({ error: "OTP challenge is not valid for this block portal." });
    }

    const blockUser = blockUsers.find((user) => user.id === payload.blockId);

    if (!blockUser) {
      return res.status(404).json({ error: "Block account no longer exists." });
    }

    const token = randomUUID();
    blockSessions.set(token, blockUser.id);

    return res.json({
      token,
      user: sanitizeBlockUser(blockUser),
      portal: getPortalDefinition(blockUser.portalId),
    });
  });

  app.get("/api/block/dashboard", requireBlockOperator, (req: AuthenticatedRequest, res) => {
    const blockUser = req.blockUser!;
    const portal = getPortalDefinition(blockUser.portalId);
    const blockComplaints = complaints
      .filter(
        (complaint) =>
          complaint.municipalityId === blockUser.municipalityId && complaint.blockId === blockUser.blockId,
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    res.json({
      user: sanitizeBlockUser(blockUser),
      portal,
      complaints: blockComplaints,
    });
  });

  app.patch("/api/block/complaints/:id/update", requireBlockOperator, async (req: AuthenticatedRequest, res) => {
    const blockUser = req.blockUser!;
    const complaint = complaints.find((item) => item.id === req.params.id);

    if (!complaint) {
      return res.status(404).json({ error: "Complaint not found." });
    }

    if (complaint.municipalityId !== blockUser.municipalityId || complaint.blockId !== blockUser.blockId) {
      return res.status(403).json({ error: "This complaint is not assigned to your block portal." });
    }

    const remark = normalizeRemark(req.body?.remark);
    const workDone = typeof req.body?.workDone === "boolean" ? req.body.workDone : null;
    const requestedStatus = req.body?.status;

    if (!remark && workDone === null && !isValidStatus(requestedStatus)) {
      return res.status(400).json({ error: "Add a remark or update the work-done status." });
    }

    if (isValidStatus(requestedStatus)) {
      complaint.status = requestedStatus;
    } else if (workDone === false && complaint.status === "Assigned") {
      complaint.status = "In Progress";
    }

    if (typeof workDone === "boolean") {
      complaint.workDone = workDone;
      complaint.status = workDone ? "Resolved" : complaint.status === "Resolved" ? "In Progress" : complaint.status;
      complaint.resolvedAt = workDone ? new Date().toISOString() : null;
    }

    complaint.updatedAt = new Date().toISOString();
    addComplaintRemark(
      complaint,
      {
        id: blockUser.id,
        name: blockUser.name,
        role: "block",
      },
      remark || (workDone ? "Block marked the work as completed." : "Block updated complaint progress."),
      workDone,
    );

    await saveComplaints(complaints);

    return res.json({ complaint });
  });
}

async function sendViteHtml(vite: ViteDevServer, res: Response, htmlFile: string, url: string) {
  const templatePath = path.join(process.cwd(), htmlFile);
  const template = await fs.readFile(templatePath, "utf-8");
  const html = await vite.transformIndexHtml(url, template);

  res.status(200).set({ "Content-Type": "text/html" }).end(html);
}

async function registerDevFrontend(app: express.Express, vite: ViteDevServer, htmlFile: string) {
  app.use(vite.middlewares);
  app.get("*", async (req, res, next) => {
    try {
      await sendViteHtml(vite, res, htmlFile, req.originalUrl);
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      next(error);
    }
  });
}

function registerProductionFrontend(app: express.Express, htmlFile: string) {
  const distPath = path.join(process.cwd(), "dist");

  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, htmlFile));
  });
}

function registerProductionFrontends(app: express.Express) {
  const distPath = path.join(process.cwd(), "dist");

  app.use(express.static(distPath));
  app.get(["/admin", "/admin/*"], (_req, res) => {
    res.sendFile(path.join(distPath, "admin.html"));
  });
  app.get(["/block/north", "/block/north/*"], (_req, res) => {
    res.sendFile(path.join(distPath, "block-north.html"));
  });
  app.get(["/block/central", "/block/central/*"], (_req, res) => {
    res.sendFile(path.join(distPath, "block-central.html"));
  });
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

async function startServer() {
  const persistenceMode = await initializePersistence();
  const complaints = await loadComplaints();
  const adminUsers = await loadAdminUsers();
  const citizenUsers = await loadCitizenUsers();
  const blockUsers = await loadBlockUsers();
  const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

  if (process.env.NODE_ENV === "production") {
    const app = express();
    applySecurityHeaders(app);
    await registerApiRoutes(app, complaints, adminUsers, citizenUsers, blockUsers, ai);
    registerProductionFrontends(app);

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Complaint portal running on http://localhost:${PORT}`);
      console.log(`Admin portal available at /admin`);
      console.log(`North Block B portal available at /block/north`);
      console.log(`Central Block B portal available at /block/central`);
    });
  } else {
    const citizenApp = express();
    const adminApp = express();
    const northBlockApp = express();
    const centralBlockApp = express();

    const frontendServers = [
      {
        app: citizenApp,
        htmlFile: "index.html",
        port: PORT,
        label: `Citizen portal running on http://localhost:${PORT}`,
      },
      {
        app: adminApp,
        htmlFile: "admin.html",
        port: ADMIN_PORT,
        label: `Admin portal running on http://localhost:${ADMIN_PORT}`,
      },
      {
        app: northBlockApp,
        htmlFile: "block-north.html",
        port: NORTH_BLOCK_PORT,
        label: `North Block B portal running on http://localhost:${NORTH_BLOCK_PORT}`,
      },
      {
        app: centralBlockApp,
        htmlFile: "block-central.html",
        port: CENTRAL_BLOCK_PORT,
        label: `Central Block B portal running on http://localhost:${CENTRAL_BLOCK_PORT}`,
      },
    ];

    for (const server of frontendServers) {
      applySecurityHeaders(server.app);
      await registerApiRoutes(server.app, complaints, adminUsers, citizenUsers, blockUsers, ai);
    }

    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom",
    });

    for (const server of frontendServers) {
      await registerDevFrontend(server.app, vite, server.htmlFile);
    }

    for (const server of frontendServers) {
      server.app.listen(server.port, "0.0.0.0", () => {
        console.log(server.label);
      });
    }
  }

  console.log(`Seeded admin username: ${DEFAULT_ADMIN_USERNAME}`);
  console.log(`Seeded admin password: ${DEFAULT_ADMIN_PASSWORD}`);
  console.log(`OTP delivery: ${otpDeliverySummary()}`);
  console.log("Seeded citizen logins: CIT-1001 / Citizen@123, CIT-1002 / Resident@123");
  console.log("Seeded block logins: north.blockb / Block@123, central.blockb / Block@123");
  console.log(
    persistenceMode === "mongodb"
      ? `Persistence: MongoDB database ${MONGODB_DB_NAME}`
      : `Persistence: ${COMPLAINTS_FILE}`,
  );
}

startServer().catch((error) => {
  console.error("Server failed to start.", error);
  process.exit(1);
});
