/**
 * messaging_bridge.js — A2A Server <-> Telegram Bot Bridge
 *
 * Polls the A2A server for tasks requiring human approval,
 * sends approval requests to Telegram, and relays responses back.
 *
 * Env vars:
 *   TELEGRAM_BOT_TOKEN  — Bot token from @BotFather
 *   TELEGRAM_CHAT_ID    — Your personal/group chat ID
 *   A2A_URL             — A2A server base URL (default: http://127.0.0.1:3000)
 */

import { readFile } from "node:fs/promises";

const A2A_BASE = process.env.A2A_URL || "http://127.0.0.1:3000";
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || "";
const POLL_INTERVAL_MS = 5000;

// --- Telegram API ---

const tgApi = (method, body) =>
  fetch(`https://api.telegram.org/bot${TG_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

async function sendApprovalRequest(task) {
  const text = [
    `🔒 *APPROVAL REQUIRED*`,
    ``,
    `*Action:* ${task.action}`,
    `*Task ID:* \`${task.id}\``,
    `*Assignee:* ${task.assignee}`,
    ``,
    task.payload?.summary || JSON.stringify(task.payload, null, 2).slice(0, 500),
  ].join("\n");

  return tgApi("sendMessage", {
    chat_id: TG_CHAT,
    text,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Approve", callback_data: `approve:${task.id}` },
          { text: "❌ Reject", callback_data: `reject:${task.id}` },
        ],
      ],
    },
  });
}

async function sendNotification(text) {
  if (!TG_TOKEN || !TG_CHAT) {
    console.log(`[TG-Bridge] (dry-run) ${text}`);
    return { ok: true, dry_run: true };
  }
  return tgApi("sendMessage", {
    chat_id: TG_CHAT,
    text,
    parse_mode: "Markdown",
  });
}

// --- A2A helpers ---

async function a2aGet(path) {
  const res = await fetch(`${A2A_BASE}${path}`);
  return res.json();
}

async function a2aPost(path, body) {
  const res = await fetch(`${A2A_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// --- Callback listener (Telegram long-polling) ---

let lastUpdateId = 0;

async function pollTelegramUpdates() {
  if (!TG_TOKEN) return [];
  const data = await tgApi("getUpdates", {
    offset: lastUpdateId + 1,
    timeout: 3,
  });
  if (!data.ok || !data.result?.length) return [];
  lastUpdateId = data.result[data.result.length - 1].update_id;
  return data.result;
}

async function handleCallbacks(updates) {
  for (const update of updates) {
    const cb = update.callback_query;
    if (!cb?.data) continue;

    const [action, taskId] = cb.data.split(":");
    if (!taskId) continue;

    const approved = action === "approve";
    await a2aPost("/tasks/complete", {
      taskId,
      result: {
        status: approved ? "approved" : "rejected",
        decided_by: cb.from.username || cb.from.id,
        decided_at: new Date().toISOString(),
      },
    });

    await tgApi("answerCallbackQuery", {
      callback_query_id: cb.id,
      text: approved ? "Approved ✅" : "Rejected ❌",
    });

    console.log(`[TG-Bridge] Task ${taskId} ${action}ed by ${cb.from.username || cb.from.id}`);
  }
}

// --- A2A poll: find tasks waiting for approval ---

const notifiedTasks = new Set();

async function pollApprovalTasks() {
  const tasks = await a2aGet("/tasks");
  if (!Array.isArray(tasks)) return;

  for (const task of tasks) {
    if (task.status !== "pending") continue;
    if (task.action !== "wait_for_approval") continue;
    if (notifiedTasks.has(task.id)) continue;

    console.log(`[TG-Bridge] Approval needed: ${task.id}`);
    await sendApprovalRequest(task);
    notifiedTasks.add(task.id);
  }
}

// --- Main loop ---

async function run() {
  console.log("[TG-Bridge] Messaging bridge starting...");
  console.log(`[TG-Bridge] A2A: ${A2A_BASE}`);
  console.log(`[TG-Bridge] Telegram: ${TG_TOKEN ? "configured" : "dry-run mode (no token)"}`);

  // Initial health check
  const health = await a2aGet("/health");
  console.log(`[TG-Bridge] A2A health: ${health.status}, agents: ${health.agents}`);

  await sendNotification("🤖 *864zeros Messaging Bridge* is online.");

  const tick = async () => {
    try {
      await pollApprovalTasks();
      const updates = await pollTelegramUpdates();
      if (updates.length) await handleCallbacks(updates);
    } catch (err) {
      console.error("[TG-Bridge] Poll error:", err.message);
    }
  };

  // Run once immediately, then on interval
  await tick();
  setInterval(tick, POLL_INTERVAL_MS);
}

// Allow import as module or direct execution
run().catch((err) => {
  console.error("[TG-Bridge] Fatal:", err.message);
  process.exit(1);
});
