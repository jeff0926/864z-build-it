import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("A2A Server", () => {
  it("health endpoint returns status ok", async () => {
    // Start server in background
    const serverProcess = await import("./a2a_server.js");

    // Give it a moment to bind
    await new Promise((r) => setTimeout(r, 200));

    const res = await fetch("http://127.0.0.1:3000/health");
    const data = await res.json();

    assert.equal(data.status, "ok");
    assert.equal(typeof data.agents, "number");
    assert.ok(data.agents >= 2, "Should have at least 2 agents from config");

    // Cleanup
    process.exit(0);
  });
});
