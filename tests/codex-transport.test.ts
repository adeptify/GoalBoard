import assert from "node:assert/strict";
import test from "node:test";
import {
  CodexAppServerTransport,
  CodexAppServerTransportError,
} from "../src/sessions/codex-transport.js";

const FAKE_APP_SERVER = `
const readline = require("node:readline");
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialized") return;
  if (message.method === "initialize") {
    process.stdout.write(JSON.stringify({ id: message.id, result: { ready: true } }) + "\\n");
    return;
  }
  if (message.method === "oversized") {
    process.stdout.write(JSON.stringify({ id: message.id, result: "X".repeat(8_192) }) + "\\n");
    return;
  }
  process.stdout.write(JSON.stringify({ id: message.id, result: { method: message.method } }) + "\\n");
});
`;

test("Codex transport bounds a JSONL response and restarts after rejecting the oversized request", async () => {
  const transport = new CodexAppServerTransport({
    command: process.execPath,
    args: ["-e", FAKE_APP_SERVER],
    maxResponseLineBytes: 1_024,
    requestTimeoutMs: 5_000,
  });
  try {
    await assert.rejects(
      transport.request("oversized", {}),
      (error: unknown) => {
        assert.ok(error instanceof CodexAppServerTransportError);
        assert.equal(error.code, "runtime.response_too_large");
        assert.match(error.message, /安全读取上限/);
        return true;
      },
    );

    const recovered = await transport.request("healthy", {});
    assert.deepEqual(recovered, { method: "healthy" });
  } finally {
    transport.close();
  }
});
