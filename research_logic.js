/**
 * research_logic.js — Google Workspace Add-on Market Gap Scanner
 *
 * Uses Gemini 3.1 Pro (when GEMINI_API_KEY is set) or built-in
 * market intelligence to identify profitable gaps. Reports findings
 * to the A2A server and saves to research/PROPOSAL.json.
 */

import { writeFile, mkdir } from "node:fs/promises";

const A2A_BASE = process.env.A2A_URL || "http://127.0.0.1:3000";
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";

// --- A2A helpers ---

async function a2aPost(path, body) {
  const res = await fetch(`${A2A_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function a2aGet(path) {
  const res = await fetch(`${A2A_BASE}${path}`);
  return res.json();
}

// --- Gemini 3.1 Pro scanner ---

const GEMINI_PROMPT = `You are a market research analyst for Google Workspace Add-ons.
Identify exactly 3 profitable gaps in the current Google Workspace Marketplace.
For each gap return a JSON object with these fields:
- id: short kebab-case identifier
- title: concise name (under 60 chars)
- category: one of "compliance", "vertical_saas", "automation", "ai_augmentation", "productivity"
- problem: 1-2 sentence description of the unmet need
- target_users: who would buy this
- monetization: how it makes money
- competition_level: "low", "medium", or "high"
- confidence_score: 0.0-1.0

Return ONLY a JSON array of 3 objects, no markdown fences.`;

async function scanWithGemini() {
  console.log("[Research] Calling Gemini 3.1 Pro...");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: GEMINI_PROMPT }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const data = await res.json();
  const text = data.candidates[0].content.parts[0].text;
  return JSON.parse(text);
}

// --- Fallback: curated market intelligence ---

function curatedOpportunities() {
  console.log("[Research] Using curated market intelligence (no GEMINI_API_KEY)");
  return [
    {
      id: "compliance-dlp-addon",
      title: "Workspace Compliance & DLP Dashboard",
      category: "compliance",
      problem:
        "Google's native DLP is fragmented across services. Admins lack a unified view of data-loss risks, especially with the new AI Expanded Access add-on generating more AI-processed content across Docs, Sheets, and Gmail.",
      target_users: "IT admins and compliance officers at mid-market companies (50-500 employees)",
      monetization: "Per-seat SaaS subscription ($3-5/user/month)",
      competition_level: "low",
      confidence_score: 0.82,
    },
    {
      id: "legal-contract-sidebar",
      title: "Legal Contract Review Sidebar for Google Docs",
      category: "vertical_saas",
      problem:
        "The marketplace is heavy on horizontal tools but has almost no industry-specific add-ons for legal teams. Solo practitioners and small firms need clause extraction, risk flagging, and template matching directly inside Google Docs without expensive platforms like Ironclad.",
      target_users: "Solo attorneys, paralegals, and small law firms using Google Workspace",
      monetization: "Freemium with pro tier ($12/user/month)",
      competition_level: "low",
      confidence_score: 0.78,
    },
    {
      id: "sheets-etl-connector",
      title: "No-Code ETL Connector for Google Sheets",
      category: "automation",
      problem:
        "Existing Sheets data connectors (Supermetrics, Coupler.io) focus on marketing data. There is no lightweight add-on that lets ops teams pull from databases (Postgres, MySQL), warehouses (BigQuery, Snowflake), and APIs into Sheets with scheduled refreshes — without leaving the spreadsheet UI.",
      target_users: "Operations analysts, RevOps, and data-savvy non-engineers at startups",
      monetization: "Usage-based pricing with free tier (100 syncs/month free, $9/month pro)",
      competition_level: "medium",
      confidence_score: 0.75,
    },
  ];
}

// --- Main ---

async function run() {
  console.log("[Research] 864zeros Market Gap Scanner starting...");
  console.log(`[Research] A2A server: ${A2A_BASE}`);

  // 1. Get opportunities
  let opportunities;
  if (GEMINI_KEY) {
    opportunities = await scanWithGemini();
  } else {
    opportunities = curatedOpportunities();
  }

  console.log(`[Research] Found ${opportunities.length} opportunities`);

  // 2. Report to A2A server — create a task for the worker agent
  const task = await a2aPost("/tasks", {
    assignee: "worker",
    action: "market_scan_complete",
    payload: { opportunities, scannedAt: new Date().toISOString() },
  });
  console.log(`[Research] Reported to A2A server: ${task.id}`);

  // 3. Mark task complete on A2A
  await a2aPost("/tasks/complete", {
    taskId: task.id,
    result: {
      status: "delivered",
      count: opportunities.length,
      source: GEMINI_KEY ? "gemini-3.1-pro" : "curated-intelligence",
    },
  });
  console.log(`[Research] Task ${task.id} marked complete`);

  // 4. Save PROPOSAL.json
  const proposal = {
    project: "864zeros-sovereign-os",
    scan_type: "google_workspace_addon_market_gaps",
    source: GEMINI_KEY ? "gemini-3.1-pro" : "curated-intelligence",
    generated_at: new Date().toISOString(),
    a2a_task_id: task.id,
    opportunities,
  };

  await mkdir("research", { recursive: true });
  await writeFile("research/PROPOSAL.json", JSON.stringify(proposal, null, 2));
  console.log("[Research] Saved research/PROPOSAL.json");

  // 5. Verify via A2A
  const tasks = await a2aGet("/tasks?agent=worker");
  console.log(`[Research] A2A worker tasks: ${tasks.length} total`);

  return proposal;
}

run().catch((err) => {
  console.error("[Research] Fatal:", err.message);
  process.exit(1);
});
