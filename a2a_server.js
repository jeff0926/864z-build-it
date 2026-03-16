/**
 * A2A Protocol Server
 * Peer-to-peer communication layer for 864zeros Sovereign OS agents.
 *
 * Handles agent discovery, task delegation, and result routing
 * between CEO (Claude 4.6) and Worker (Gemini 3.1) agents.
 */

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

const PORT = process.env.A2A_PORT || 3000;
const HOST = process.env.A2A_HOST || "127.0.0.1";

// --- Agent Registry ---

const agents = new Map();

function registerAgent(id, metadata) {
  agents.set(id, {
    ...metadata,
    registeredAt: Date.now(),
    status: "idle",
  });
  console.log(`[A2A] Agent registered: ${id} (${metadata.role})`);
}

function getAgent(id) {
  return agents.get(id) || null;
}

// --- Task Queue ---

const taskQueue = [];

function enqueueTask(task) {
  const entry = {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ...task,
    status: "pending",
    createdAt: Date.now(),
  };
  taskQueue.push(entry);
  console.log(`[A2A] Task enqueued: ${entry.id} -> ${task.assignee}`);
  return entry;
}

function getTasksByAgent(agentId) {
  return taskQueue.filter((t) => t.assignee === agentId);
}

function completeTask(taskId, result) {
  const task = taskQueue.find((t) => t.id === taskId);
  if (!task) return null;
  task.status = "completed";
  task.result = result;
  task.completedAt = Date.now();
  return task;
}

// --- HTTP Request Handling ---

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString());
}

function json(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

const routes = {
  "POST /agents/register": async (req, res) => {
    const { id, role, model, permissions } = await readBody(req);
    if (!id || !role) return json(res, 400, { error: "id and role required" });
    registerAgent(id, { role, model, permissions });
    return json(res, 201, { ok: true, agent: getAgent(id) });
  },

  "GET /agents": (_req, res) => {
    return json(res, 200, Object.fromEntries(agents));
  },

  "POST /tasks": async (req, res) => {
    const { assignee, action, payload } = await readBody(req);
    if (!assignee || !action)
      return json(res, 400, { error: "assignee and action required" });
    if (!getAgent(assignee))
      return json(res, 404, { error: `Agent '${assignee}' not registered` });
    const task = enqueueTask({ assignee, action, payload });
    return json(res, 201, task);
  },

  "GET /tasks": (req, res) => {
    const url = new URL(req.url, `http://${HOST}`);
    const agentId = url.searchParams.get("agent");
    const tasks = agentId ? getTasksByAgent(agentId) : taskQueue;
    return json(res, 200, tasks);
  },

  "POST /tasks/complete": async (req, res) => {
    const { taskId, result } = await readBody(req);
    const task = completeTask(taskId, result);
    if (!task) return json(res, 404, { error: "Task not found" });
    return json(res, 200, task);
  },

  "GET /health": (_req, res) => {
    return json(res, 200, {
      status: "ok",
      agents: agents.size,
      pendingTasks: taskQueue.filter((t) => t.status === "pending").length,
    });
  },
};

// --- Server ---

async function loadConfig() {
  const raw = await readFile(
    new URL("./paperclip.config.json", import.meta.url),
    "utf-8"
  );
  return JSON.parse(raw);
}

const server = createServer(async (req, res) => {
  const key = `${req.method} ${req.url.split("?")[0]}`;
  const handler = routes[key];
  if (handler) {
    try {
      await handler(req, res);
    } catch (err) {
      console.error(`[A2A] Error handling ${key}:`, err.message);
      json(res, 500, { error: "Internal server error" });
    }
  } else {
    json(res, 404, { error: "Not found" });
  }
});

const config = await loadConfig();

// Auto-register agents from config
for (const [id, meta] of Object.entries(config.agents)) {
  registerAgent(id, meta);
}

server.listen(PORT, HOST, () => {
  console.log(`[A2A] Server listening on http://${HOST}:${PORT}`);
  console.log(`[A2A] Orchestration mode: ${config.orchestration.mode}`);
  console.log(`[A2A] Asset types: ${config.asset_types.join(", ")}`);
});
