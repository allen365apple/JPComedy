import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import worker, { signSession, verifySession } from "../src/index.js";
import { validateGlossary } from "../src/validation.js";

const env = {
  SITE_ORIGIN: "https://example.github.io",
  GLOSSARY_REPO: "test/glossary",
  GLOSSARY_BRANCH: "main",
  EDITOR_PASSWORD: "test-password",
  SESSION_SECRET: "test-secret-for-unit-testing-only-123456789",
  GH_APP_ID: "test",
  GH_INSTALLATION_ID: "test",
  GH_PRIVATE_KEY: "test",
};

test("validation rejects empty names and broken schema", () => {
  assert.throws(() => validateGlossary({}));
  assert.throws(() => validateGlossary({ talents: [], others: [{ jp: ["a"], zh: "" }] }));
});

test("tokens cannot cross purposes or survive expiry/tampering", async () => {
  const token = await signSession({ sub: "shared-password" }, env.SESSION_SECRET, "editor");
  assert.equal((await verifySession(token, env.SESSION_SECRET, "editor")).sub, "shared-password");
  await assert.rejects(verifySession(token, env.SESSION_SECRET, "oauth"));
  await assert.rejects(verifySession(token + "x", env.SESSION_SECRET, "editor"));
  const expired = await signSession({ sub: "shared-password" }, env.SESSION_SECRET, "editor", "-1s");
  await assert.rejects(verifySession(expired, env.SESSION_SECRET, "editor"));
});

test("shared password issues a session and rejects bad origins/passwords", async () => {
  const request = (password, origin = env.SITE_ORIGIN) => new Request("https://api.test/auth/password", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ password }),
  });
  const success = await worker.fetch(request("test-password"), env);
  assert.equal(success.status, 200);
  assert.match((await success.json()).token, /^[\w-]+\./);
  assert.equal((await worker.fetch(request("wrong"), env)).status, 401);
  assert.equal((await worker.fetch(request("test-password", "https://evil.test"), env)).status, 403);
});

test("missing editor configuration is explicit", async () => {
  const response = await worker.fetch(new Request("https://api.test/auth/password", {
    method: "POST", headers: { Origin: env.SITE_ORIGIN }, body: JSON.stringify({ password: "test-password" }),
  }), { ...env, EDITOR_PASSWORD: "" });
  assert.equal(response.status, 503);
});

test("unauthorized and cross-origin writes fail before any GitHub call", async () => {
  for (const origin of [env.SITE_ORIGIN, "https://evil.test"]) {
    const response = await worker.fetch(new Request("https://api.test/api/glossary", {
      method: "PUT", headers: { Origin: origin }, body: "{}",
    }), env);
    assert.equal(response.status, origin === env.SITE_ORIGIN ? 401 : 403);
  }
});

test("public reads bypass raw-file caches and return the Git blob SHA", async (t) => {
  const data = { talents: [], others: [{ jp: ["漫才"], zh: "漫才" }] };
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url, "https://raw.githubusercontent.com/test/glossary/main/glossary.json");
    assert.equal(init.cache, "no-store");
    assert.deepEqual(init.cf, { cacheTtl: 0, cacheEverything: false });
    return new Response(JSON.stringify(data));
  });
  const response = await worker.fetch(new Request("https://api.test/api/glossary"), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.data, data);
  assert.match(body.sha, /^[0-9a-f]{40}$/);
});

test("authorized writes target only glossary.json and preserve optimistic locking", async (t) => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const configured = { ...env, GH_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }) };
  const token = await signSession({ sub: "shared-password" }, env.SESSION_SECRET, "editor");
  const data = { talents: [], others: [{ jp: ["漫才"], zh: "漫才" }] };
  const sha = "a".repeat(40);
  let calls = 0;
  let conflict = false;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls++;
    if (url.endsWith("/access_tokens")) {
      assert.deepEqual(JSON.parse(init.body).repositories, ["glossary"]);
      return Response.json({ token: "mock-installation-token" });
    }
    assert.equal(url, "https://api.github.com/repos/test/glossary/contents/glossary.json");
    assert.equal(init.method, "PUT");
    const body = JSON.parse(init.body);
    assert.equal(body.sha, sha);
    assert.equal(body.branch, "main");
    assert.deepEqual(JSON.parse(Buffer.from(body.content, "base64").toString()), data);
    return conflict ? Response.json({}, { status: 409 }) : Response.json({ content: { sha: "b".repeat(40) }, commit: { sha: "c".repeat(40) } });
  });
  const request = (payload) => new Request("https://api.test/api/glossary", {
    method: "PUT", headers: { Origin: env.SITE_ORIGIN, Authorization: `Bearer ${token}` }, body: JSON.stringify(payload),
  });
  const success = await worker.fetch(request({ sha, data, repo: "attacker/other" }), configured);
  assert.equal(success.status, 200);
  assert.equal((await success.json()).sha, "b".repeat(40));
  conflict = true;
  assert.equal((await worker.fetch(request({ sha, data }), configured)).status, 409);
  assert.equal((await worker.fetch(request({ sha, data: {} }), configured)).status, 400);
  assert.equal(calls, 4, "invalid data must not call GitHub");
});
