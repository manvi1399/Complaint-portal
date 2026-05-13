import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
const fixturePath = path.join(process.cwd(), "fixtures", "multilingual-complaints.json");
const citizenIdentifier = process.env.SEED_CITIZEN_IDENTIFIER ?? "CIT-1001";
const citizenPassword = process.env.SEED_CITIZEN_PASSWORD ?? "Citizen@123";

async function loginCitizen() {
  const response = await fetch(`${baseUrl}/api/auth/login/password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      identifier: citizenIdentifier,
      password: citizenPassword,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || typeof payload.token !== "string") {
    throw new Error(payload.error ?? "Citizen login failed.");
  }

  return payload.token;
}

async function main() {
  const raw = await fs.readFile(fixturePath, "utf-8");
  const cases = JSON.parse(raw);

  if (!Array.isArray(cases)) {
    throw new Error("Fixture file must contain an array.");
  }

  console.log(`Posting ${cases.length} multilingual complaint samples to ${baseUrl}`);
  const token = await loginCitizen();
  console.log(`Logged in as ${citizenIdentifier}`);

  for (const [index, testCase] of cases.entries()) {
    const sector = testCase.sector ?? (index % 2 === 0 ? 16 : 30);
    const response = await fetch(`${baseUrl}/api/complaints`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        city: "Chandigarh",
        sector,
        locationDetails: `Sector ${sector} demo location`,
        complaint: testCase.complaint,
      }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error(`\n[${index + 1}] ${testCase.language}`);
      console.error(`Complaint: ${testCase.complaint}`);
      console.error(`Error: ${payload.error ?? "Unknown error"}`);
      continue;
    }

    const categoryMatches = payload.category === testCase.expectedCategory ? "PASS" : "CHECK";
    const severityMatches = payload.severity === testCase.expectedSeverity ? "PASS" : "CHECK";

    console.log(`\n[${index + 1}] ${testCase.language}`);
    console.log(`Complaint: ${testCase.complaint}`);
    console.log(`Category: ${payload.category} (${categoryMatches}; expected ${testCase.expectedCategory})`);
    console.log(`Severity: ${payload.severity} (${severityMatches}; expected ${testCase.expectedSeverity})`);
    console.log(`Route: ${payload.municipalityName ?? "Manual Review"} / ${payload.blockName ?? "Unassigned"}`);
    console.log(`Source: ${payload.source}`);
    console.log(`Case ID: ${payload.id}`);
  }

  console.log("\nFinished posting multilingual test cases.");
}

main().catch((error) => {
  console.error("Seed test failed.");
  console.error(error);
  process.exit(1);
});
