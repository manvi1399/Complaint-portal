export const COMPLAINT_CATEGORIES = [
  "Garbage",
  "Water Supply",
  "Road Issues",
  "Sewage",
  "Street Light",
  "Other",
] as const;

export const COMPLAINT_SEVERITIES = [
  "Low",
  "Medium",
  "High",
  "Critical",
] as const;

export const COMPLAINT_STATUSES = [
  "Received",
  "Under Review",
  "Assigned",
  "In Progress",
  "Resolved",
] as const;

export const COMPLAINT_ROUTING_STATUSES = [
  "Automatic",
  "Needs Manual Review",
  "Manually Assigned",
] as const;

export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];
export type ComplaintSeverity = (typeof COMPLAINT_SEVERITIES)[number];
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];
export type ComplaintRoutingStatus = (typeof COMPLAINT_ROUTING_STATUSES)[number];
export type ClassificationSource = "ai" | "rules";
export type PortalUserRole = "citizen" | "admin" | "block";

export interface MunicipalityBlock {
  id: string;
  name: string;
  sectors: number[];
}

export interface MunicipalityDefinition {
  id: string;
  name: string;
  blocks: MunicipalityBlock[];
}

export interface ComplaintRemark {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: PortalUserRole;
  message: string;
  createdAt: string;
  workDone: boolean | null;
}

export interface ComplaintRecord {
  id: string;
  text: string;
  city: string;
  locationDetails: string;
  sector: number | null;
  category: ComplaintCategory;
  severity: ComplaintSeverity;
  status: ComplaintStatus;
  routingStatus: ComplaintRoutingStatus;
  municipalityId: string | null;
  municipalityName: string | null;
  blockId: string | null;
  blockName: string | null;
  source: ClassificationSource;
  timestamp: string;
  updatedAt: string;
  resolvedAt: string | null;
  citizenId: string;
  citizenName: string;
  citizenPhone: string;
  citizenEmail: string | null;
  workDone: boolean;
  remarks: ComplaintRemark[];
}

export interface CitizenUserRecord {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  passwordHash: string;
  registeredAt: string;
}

export interface CitizenSessionUser {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  registeredAt: string;
}

export interface AdminSessionUser {
  id: string;
  name: string;
  username: string;
}

export interface BlockOperatorRecord {
  id: string;
  name: string;
  username: string;
  passwordHash: string;
  municipalityId: string;
  municipalityName: string;
  blockId: string;
  blockName: string;
  portalId: string;
}

export interface BlockPortalDefinition {
  portalId: string;
  title: string;
  shortName: string;
  description: string;
  port: number;
  municipalityId: string;
  municipalityName: string;
  blockId: string;
  blockName: string;
  sectors: number[];
}

export interface BlockSessionUser {
  id: string;
  name: string;
  username: string;
  municipalityId: string;
  municipalityName: string;
  blockId: string;
  blockName: string;
  portalId: string;
}

export interface ComplaintHealth {
  status: "ok";
  complaintCount: number;
  manualReviewCount: number;
  aiAvailable: boolean;
  persistence: "file" | "mongodb";
  otpDelivery: string;
  emailOtpConfigured: boolean;
  brevoConfigured: boolean;
  smtpConfigured: boolean;
  resendConfigured: boolean;
  uptimeSeconds: number;
}
