import assert from "node:assert/strict";
import test from "node:test";
import { BUNGMO_ADMIN_EMAIL, canManageBungmo, hasBungmoAccess } from "./access.js";

test("관리자와 사이트 접근 상태를 판별한다", () => {
  assert.equal(canManageBungmo({ email: BUNGMO_ADMIN_EMAIL }), false);
  assert.equal(canManageBungmo({ email: "member@example.com" }), false);
  assert.equal(canManageBungmo({ email: "operator@example.com", bungmoOperator: true }), true);
  assert.equal(hasBungmoAccess({ nickname: "기존 멤버" }), true);
  assert.equal(hasBungmoAccess({ active: true }), true);
  assert.equal(hasBungmoAccess({ active: false }), false);
});
