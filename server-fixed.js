const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const SESSION_DAYS = 30;
const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function setupDatabase() {
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL is not configured.");
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users(
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS sessions(
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS comments(
      id TEXT PRIMARY KEY,
      post TEXT NOT NULL,
      name TEXT NOT NULL,
      comment TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL,
      "updatedAt" TIMESTAMPTZ
    );
  `);
  await pool.query(`ALTER TABLE comments ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE SET NULL`);
}

function headers(contentType = "application/json; charset=utf-8") {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
  };
}

function sendJson(res, status, data, cookie) {
  const h = headers();
  if (cookie) h["Set-Cookie"] = cookie;
  res.writeHead(status, h);
  res.end(JSON.stringify(data));
}

function sendFile(res, filePath) {
  const types = {
    ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8",
    ".js":"application/javascript; charset=utf-8", ".json":"application/json; charset=utf-8",
    ".svg":"image/svg+xml", ".png":"image/png", ".jpg":"image/jpeg",
    ".jpeg":"image/jpeg", ".webp":"image/webp", ".ico":"image/x-icon"
  };
  fs.readFile(filePath, (e, data) => {
    if (e) return sendJson(res, e.code === "ENOENT" ? 404 : 500, { error: e.code === "ENOENT" ? "Not found" : "Server error." });
    res.writeHead(200, headers(types[path.extname(filePath).toLowerCase()] || "application/octet-stream"));
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 10000) req.destroy();
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function parseCookies(req) {
  const cookies = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > -1) cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return cookies;
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function sessionCookie(token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `ftx_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${secure}`;
}

function clearSessionCookie() {
  return "ftx_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

function verifyPassword(password, stored) {
  const [scheme, salt, expectedHex] = String(stored).split(":");
  if (scheme !== "scrypt" || !salt || !expectedHex) return false;
  const actual = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '30 days')",
    [crypto.randomUUID(), userId, tokenHash(token)]
  );
  return token;
}

async function getUser(req) {
  const token = parseCookies(req).ftx_session;
  if (!token || !process.env.DATABASE_URL) return null;
  const r = await pool.query(
    "SELECT u.id,u.username,s.id AS session_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW()",
    [tokenHash(token)]
  );
  return r.rows[0] || null;
}

function validUsername(value) {
  return /^[A-Za-z0-9_]{3,24}$/.test(value);
}

async function api(req, res, url) {
  if (url.pathname === "/api/health" && req.method === "GET") {
    if (!process.env.DATABASE_URL) return sendJson(res, 200, { status:"ok", database:"not configured" });
    try {
      await pool.query("SELECT 1");
      return sendJson(res, 200, { status:"ok", database:"connected" });
    } catch (_) {
      return sendJson(res, 503, { status:"error", database:"unavailable" });
    }
  }

  if (url.pathname === "/api/auth/signup" && req.method === "POST") {
    const i = JSON.parse(await readBody(req));
    const username = String(i.username || "").trim();
    const password = String(i.password || "");
    const confirm = String(i.confirmPassword || "");
    if (!process.env.DATABASE_URL) return sendJson(res, 503, { error:"Database is not configured." });
    if (!validUsername(username)) return sendJson(res, 400, { error:"Username must be 3-24 letters, numbers or underscores." });
    if (password.length < 8 || password.length > 128) return sendJson(res, 400, { error:"Password must be 8-128 characters." });
    if (password !== confirm) return sendJson(res, 400, { error:"Passwords do not match." });
    const exists = await pool.query("SELECT 1 FROM users WHERE LOWER(username)=LOWER($1)", [username]);
    if (exists.rows.length) return sendJson(res, 409, { error:"That username is already taken." });
    const id = crypto.randomUUID();
    await pool.query("INSERT INTO users(id,username,password_hash) VALUES($1,$2,$3)", [id,username,hashPassword(password)]);
    const token = await createSession(id);
    return sendJson(res, 201, { user:{id,username} }, sessionCookie(token));
  }

  if (url.pathname === "/api/auth/login" && req.method === "POST") {
    const i = JSON.parse(await readBody(req));
    const username = String(i.username || "").trim();
    const password = String(i.password || "");
    if (!process.env.DATABASE_URL) return sendJson(res, 503, { error:"Database is not configured." });
    if (!username || !password) return sendJson(res, 400, { error:"Username and password are required." });
    const r = await pool.query("SELECT id,username,password_hash FROM users WHERE LOWER(username)=LOWER($1)", [username]);
    if (!r.rows.length || !verifyPassword(password, r.rows[0].password_hash)) return sendJson(res, 401, { error:"Invalid username or password." });
    const token = await createSession(r.rows[0].id);
    return sendJson(res, 200, {user:{id:r.rows[0].id,username:r.rows[0].username}}, sessionCookie(token));
  }

  if (url.pathname === "/api/auth/me" && req.method === "GET") {
    const user = await getUser(req);
    return sendJson(res, 200, { user:user ? {id:user.id,username:user.username} : null });
  }

  if (url.pathname === "/api/auth/logout" && req.method === "POST") {
    const token = parseCookies(req).ftx_session;
    if (token && process.env.DATABASE_URL) await pool.query("DELETE FROM sessions WHERE token_hash=$1", [tokenHash(token)]);
    return sendJson(res, 200, {ok:true}, clearSessionCookie());
  }

  if (url.pathname === "/api/comments" && req.method === "GET") {
    if (!process.env.DATABASE_URL) return sendJson(res, 503, {error:"Database is not configured."});
    const post = (url.searchParams.get("post") || "ai").trim();
    if (!post || post.length > 50) return sendJson(res, 400, {error:"Invalid post."});
    const user = await getUser(req);
    const r = await pool.query(
      'SELECT c.id,c.post,c.name,c.comment,c."createdAt",c."updatedAt",c.user_id,u.username AS "username" FROM comments c LEFT JOIN users u ON u.id=c.user_id WHERE c.post=$1 ORDER BY c."createdAt" ASC',
      [post]
    );
    return sendJson(res, 200, r.rows.map(c => ({...c,isOwner:Boolean(user && c.user_id===user.id)})));
  }

  if (url.pathname === "/api/comments" && req.method === "POST") {
    const user = await getUser(req);
    if (!user) return sendJson(res, 401, {error:"You must be logged in to comment."});
    const i = JSON.parse(await readBody(req));
    const comment = String(i.comment || "").trim();
    const post = String(i.post || "ai").trim();
    if (!comment || !post) return sendJson(res, 400, {error:"Comment and post are required."});
    if (comment.length > 1000 || post.length > 50) return sendJson(res, 400, {error:"Input is too long."});
    const id = crypto.randomUUID(), createdAt = new Date().toISOString();
    await pool.query(
      'INSERT INTO comments(id,post,name,comment,"createdAt",user_id) VALUES($1,$2,$3,$4,$5,$6)',
      [id,post,user.username,comment,createdAt,user.id]
    );
    return sendJson(res, 201, {id,post,name:user.username,comment,createdAt,updatedAt:null,username:user.username,isOwner:true});
  }

  const match = url.pathname.match(/^\/api\/comments\/([^/]+)$/);
  if (match && (req.method === "PUT" || req.method === "DELETE")) {
    const user = await getUser(req);
    if (!user) return sendJson(res, 401, {error:"You must be logged in."});
    const id = decodeURIComponent(match[1]);
    if (req.method === "DELETE") {
      const r = await pool.query('DELETE FROM comments WHERE id=$1 AND user_id=$2 RETURNING id,post,name,comment,"createdAt","updatedAt"', [id,user.id]);
      if (!r.rows.length) return sendJson(res, 404, {error:"Comment not found or not yours."});
      return sendJson(res, 200, {...r.rows[0],username:user.username,isOwner:true});
    }
    const i = JSON.parse(await readBody(req));
    const comment = String(i.comment || "").trim();
    if (!comment || comment.length > 1000) return sendJson(res, 400, {error:"Comment must be 1-1000 characters."});
    const updatedAt = new Date().toISOString();
    const r = await pool.query(
      'UPDATE comments SET comment=$1,"updatedAt"=$2 WHERE id=$3 AND user_id=$4 RETURNING id,post,name,comment,"createdAt","updatedAt"',
      [comment,updatedAt,id,user.id]
    );
    if (!r.rows.length) return sendJson(res, 404, {error:"Comment not found or not yours."});
    return sendJson(res, 200, {...r.rows[0],username:user.username,isOwner:true});
  }

  return false;
}

const server = http.createServer(async (req,res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": req.headers.origin || "",
      "Access-Control-Allow-Methods":"GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":"Content-Type",
      "Access-Control-Allow-Credentials":"true",
      "Vary":"Origin"
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      const handled = await api(req,res,url);
      if (handled !== false) return;
    }

    if (req.method === "GET") {
      let requested = decodeURIComponent(url.pathname);
      if (requested === "/") requested = "/tech.html";
      const safe = path.resolve(path.join(ROOT, "." + requested));
      if ((safe === ROOT || safe.startsWith(ROOT + path.sep)) && fs.existsSync(safe) && fs.statSync(safe).isFile()) {
        return sendFile(res,safe);
      }
    }
    sendJson(res,404,{error:"Not found"});
  } catch (e) {
    console.error("Request error:", e);
    sendJson(res,500,{error:"Server error."});
  }
});

setupDatabase().catch(e => console.error("Database setup failed:", e));
server.listen(PORT,()=>console.log(`FutureTechX server running on port ${PORT}`));
