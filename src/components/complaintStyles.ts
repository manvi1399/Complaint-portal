import type { ComplaintSeverity, ComplaintStatus, PortalUserRole } from "../types";

export const severityStyles: Record<ComplaintSeverity, string> = {
  Critical: "badge badge-critical",
  High: "badge badge-high",
  Medium: "badge badge-medium",
  Low: "badge badge-low",
};

export const statusStyles: Record<ComplaintStatus, string> = {
  Received: "badge badge-neutral",
  "Under Review": "badge badge-neutral",
  Assigned: "badge badge-info",
  "In Progress": "badge badge-medium",
  Resolved: "badge badge-low",
};

export const roleLabels: Record<PortalUserRole, string> = {
  citizen: "Citizen",
  admin: "Admin",
  block: "Block",
};

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
