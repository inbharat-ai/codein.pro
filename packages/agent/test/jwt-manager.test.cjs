const test = require("node:test");
const assert = require("node:assert/strict");
const { JWTManager } = require("../src/auth/jwt-manager");

test("jwt manager generates and verifies access token", () => {
  const jwtManager = new JWTManager({ secret: "test-secret" });
  const token = jwtManager.generateToken({ userId: "u1", role: "developer" });
  const verified = jwtManager.verifyToken(token);

  assert.equal(verified.valid, true);
  assert.equal(verified.payload.userId, "u1");
  assert.equal(verified.payload.role, "developer");
});

test("jwt manager refreshes token", () => {
  const jwtManager = new JWTManager({ secret: "test-secret" });
  const issued = jwtManager.generateRefreshToken({ userId: "u2", role: "admin" });

  const refreshed = jwtManager.refreshAccessToken(issued.refreshToken);
  assert.equal(refreshed.success, true);
  assert.ok(refreshed.accessToken);
});

test("jwt manager revokes token", () => {
  const jwtManager = new JWTManager({ secret: "test-secret" });
  const token = jwtManager.generateToken({ userId: "u3", role: "viewer" }, { expiresIn: "1h" });

  const revoked = jwtManager.revokeToken(token);
  assert.equal(revoked, true);

  const verified = jwtManager.verifyToken(token);
  assert.equal(verified.valid, false);
});
