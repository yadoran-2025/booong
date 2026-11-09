import assert from "node:assert/strict";
import test from "node:test";
import { canManageBungmo } from "./access.js";

test("BOOONG 서버가 승인한 운영자만 관리한다", () => {
  assert.equal(canManageBungmo({ email: "noamchomsky1571@gmail.com" }), false);
  assert.equal(canManageBungmo({ email: "member@example.com" }), false);
  assert.equal(canManageBungmo({ email: "operator@example.com", bungmoOperator: true }), true);
  assert.equal(canManageBungmo({ email: "operator@example.com", bungmoOperator: true, active: false }), true);
});
