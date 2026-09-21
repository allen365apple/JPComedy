import { SignJWT, jwtVerify, importPKCS8 } from "jose";
import { createPrivateKey } from "node:crypto";
import { validateGlossary } from "./validation.js";

/** @typedef {Cloudflare.Env & {GH_APP_ID?:string, GH_INSTALLATION_ID?:string, GH_PRIVATE_KEY?:string, SESSION_SECRET?:string, EDITOR_PASSWORD?:string}} Bindings */

const MAX_BODY = 2_000_000;
const secrets = ["GH_APP_ID", "GH_INSTALLATION_ID", "GH_PRIVATE_KEY", "SESSION_SECRET", "EDITOR_PASSWORD"];

/** Encode UTF-8 JSON as Base64 without relying on Node's Buffer global. */
function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

/** A safe error whose message may be displayed to users. */
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Bound request and upstream response memory consumption. */
async function readJson(stream) {
  const reader = stream?.getReader();
  if (!reader) throw new ApiError(400, "缺少資料");
  let length = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY) { await reader.cancel(); throw new ApiError(413, "資料過大"); }
      chunks.push(value);
    }
    const buffer = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder().decode(buffer));
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(400, "JSON 格式不正確");
  } finally { reader.releaseLock(); }
}

/** Fetch a bounded UTF-8 response body for public raw-file reads. */
async function readBytes(stream) {
  const reader = stream?.getReader();
  if (!reader) throw new ApiError(502, "上游沒有回傳資料");
  let length = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY) { await reader.cancel(); throw new ApiError(502, "詞庫檔案過大"); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes;
  } finally { reader.releaseLock(); }
}

/** Compute the SHA-1 blob identifier expected by GitHub's contents API. */
async function gitBlobSha(bytes) {
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const payload = new Uint8Array(header.length + bytes.length);
  payload.set(header);
  payload.set(bytes, header.length);
  const digest = await crypto.subtle.digest("SHA-1", payload);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Make a bounded GitHub API call without forwarding credentials to other hosts. */
async function github(path, token = "", init = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init, signal: AbortSignal.timeout(12000), redirect: "manual",
    headers: { "User-Agent": "JPComedy", Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!response.ok) {
    if (response.status === 409 || response.status === 422) throw new ApiError(409, "詞庫已更新，請重新載入後比對修改");
    throw new ApiError(502, `GitHub 暫時無法完成操作 (${response.status})`);
  }
  return readJson(response.body);
}

/** Read the public glossary without consuming GitHub's REST API rate limit. */
async function rawGlossary(env) {
  const url = `https://raw.githubusercontent.com/${env.GLOSSARY_REPO}/${encodeURIComponent(env.GLOSSARY_BRANCH)}/glossary.json`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(12000), redirect: "manual",
    cache: "no-store",
    cf: { cacheTtl: 0, cacheEverything: false },
    headers: { "User-Agent": "JPComedy" },
  });
  if (!response.ok) throw new ApiError(502, `詞庫來源暫時無法讀取 (${response.status})`);
  const bytes = await readBytes(response.body);
  const data = validateGlossary(JSON.parse(new TextDecoder().decode(bytes)));
  return { data, sha: await gitBlobSha(bytes) };
}

/** Fixed server-side destination: clients cannot choose repository or path. */
function contentsPath(env) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(env.GLOSSARY_REPO)) throw new ApiError(503, "詞庫來源尚未設定");
  return `/repos/${env.GLOSSARY_REPO}/contents/glossary.json`;
}

/** Sign a short-lived purpose-bound token. */
export async function signSession(payload, secret, purpose, lifetime = "30m") {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" })
    .setIssuer("jpcomedy").setAudience(purpose).setIssuedAt().setExpirationTime(lifetime)
    .sign(new TextEncoder().encode(secret));
}

/** Verify purpose, signature and expiry before trusting a session. */
export async function verifySession(token, secret, purpose) {
  try {
    return (await jwtVerify(token, new TextEncoder().encode(secret), {
      issuer: "jpcomedy", audience: purpose, algorithms: ["HS256"],
    })).payload;
  } catch { throw new ApiError(401, "登入已過期，請重新登入"); }
}

/** Obtain a repository-limited app token, only after authenticating the editor. */
async function installationToken(env) {
  const pem = createPrivateKey(env.GH_PRIVATE_KEY).export({ type: "pkcs8", format: "pem" }).toString();
  const key = await importPKCS8(pem, "RS256");
  const jwt = await new SignJWT({}).setProtectedHeader({ alg: "RS256" })
    .setIssuer(env.GH_APP_ID).setIssuedAt(Math.floor(Date.now() / 1000) - 60)
    .setExpirationTime("5m").sign(key);
  const result = await github(`/app/installations/${env.GH_INSTALLATION_ID}/access_tokens`, jwt, {
    method: "POST", body: JSON.stringify({ repositories: [env.GLOSSARY_REPO.split("/")[1]], permissions: { contents: "write" } }),
  });
  return result.token;
}

/** Require complete server configuration; secrets never go to the browser. */
function requireConfigured(env) {
  if (secrets.some(name => !env[name]) || env.SESSION_SECRET.length < 32) {
    throw new ApiError(503, "管理員尚未完成詞庫編輯設定，目前可以瀏覽詞庫");
  }
}

/** Compare the shared password without putting it in public code. */
function sameSecret(candidate, expected) {
  const left = new TextEncoder().encode(candidate);
  const right = new TextEncoder().encode(expected);
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] || 0) ^ (right[index] || 0);
  }
  return difference === 0;
}

/** Issue an in-memory editor session after verifying the shared password. */
async function passwordLogin(request, env) {
  requireConfigured(env);
  if (request.headers.get("Origin") !== env.SITE_ORIGIN) throw new ApiError(403, "來源不允許");
  const body = await readJson(request.body);
  const password = typeof body.password === "string" ? body.password : "";
  if (!sameSecret(password, env.EDITOR_PASSWORD)) throw new ApiError(401, "共用密碼不正確");
  const token = await signSession({ sub: "shared-password" }, env.SESSION_SECRET, "editor", "8h");
  return Response.json({ ok: true, token });
}

/** Authenticated optimistic write: reject stale SHA instead of overwriting others. */
async function save(request, env) {
  requireConfigured(env);
  if (request.headers.get("Origin") !== env.SITE_ORIGIN) throw new ApiError(403, "來源不允許");
  const bearer = request.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!bearer) throw new ApiError(401, "請先登入");
  await verifySession(bearer, env.SESSION_SECRET, "editor");
  const body = await readJson(request.body);
  if (!/^[0-9a-f]{40}$/.test(body.sha || "")) throw new ApiError(400, "缺少詞庫版本，請重新載入");
  let data;
  try { data = validateGlossary(body.data); } catch (e) { throw new ApiError(400, e.message); }
  const token = await installationToken(env);
  const result = await github(contentsPath(env), token, {
    method: "PUT", body: JSON.stringify({ branch: env.GLOSSARY_BRANCH, sha: body.sha,
      message: "fix(glossary): 更新共用漫才詞庫（密碼編輯）",
      content: encodeBase64(JSON.stringify(data, null, 2) + "\n") }),
  });
  return Response.json({ ok: true, data, sha: result.content.sha, commit: result.commit.sha });
}

/** Dispatch the small public read API and authenticated writer. */
async function route(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method === "GET" && url.pathname === "/health") return Response.json({ ok: true, editorConfigured: secrets.every(s => Boolean(env[s])) });
  if (request.method === "POST" && url.pathname === "/auth/password") return passwordLogin(request, env);
  if (url.pathname === "/api/glossary") {
    if (request.method === "PUT") return save(request, env);
    if (request.method === "GET") {
      const file = await rawGlossary(env);
      return Response.json({ ok: true, sha: file.sha, data: file.data });
    }
  }
  throw new ApiError(404, "找不到這個操作");
}

export default {
  /** @param {Request} request @param {Bindings} env */
  async fetch(request, env) {
    let response;
    try { response = await route(request, env); }
    catch (e) {
      if (!(e instanceof ApiError)) console.error(JSON.stringify({ event: "request_failed", type: e.name }));
      response = Response.json({ ok: false, message: e instanceof ApiError ? e.message : "服務暫時無法使用，請稍後重試" }, { status: e instanceof ApiError ? e.status : 500 });
    }
    const headers = new Headers(response.headers);
    if (request.headers.get("Origin") === env.SITE_ORIGIN) headers.set("Access-Control-Allow-Origin", env.SITE_ORIGIN);
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    headers.set("Cache-Control", "no-store");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(response.body, { status: response.status, headers });
  },
};
