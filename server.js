const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function setupDatabase() {
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL is not set. Database features are disabled.");
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      post TEXT NOT NULL,
      name TEXT NOT NULL,
      comment TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL,
      "updatedAt" TIMESTAMPTZ
    )
  `);

  await pool.query(`
    ALTER TABLE comments
    ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE SET NULL
  `);

  console.log("PostgreSQL database ready");
}

function sendJson(res, status, data, cookie) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (cookie) headers["Set-Cookie"] = cookie;

  res.writeHead(status, headers);
  res.end(JSON.stringify(data));
}

const responsive = `<style id="futuretech-responsive">
*,*::before,*::after{box-sizing:border-box}
html,body{width:100%;max-width:100%;overflow-x:hidden}
img,video,svg,canvas{max-width:100%;height:auto}
iframe{max-width:100%}
table{max-width:100%;overflow-x:auto;display:block}
pre,code{max-width:100%;overflow-x:auto;white-space:pre-wrap;overflow-wrap:anywhere}
@media(max-width:900px){header{max-width:100%!important}.intro,.hero,.content,.impact,.team,.contact,.blog,.blog-container{max-width:100%;padding-left:5%!important;padding-right:5%!important}.cards{grid-template-columns:repeat(2,minmax(0,1fr))!important}.intro{gap:30px!important}.container{max-width:100%!important}.timeline-card,.blog-card,.cardi,.impact-box{max-width:100%;min-width:0;overflow-wrap:anywhere}}
@media(max-width:650px){header{position:relative!important;height:auto!important;min-height:65px;padding:14px 5%!important;flex-wrap:wrap;gap:12px}nav,header nav{width:100%;max-width:100%}nav ul{justify-content:center!important;flex-wrap:wrap!important;gap:8px 14px!important}.intro{min-height:auto!important;padding-top:70px!important;padding-bottom:55px!important;flex-direction:column!important;text-align:center}.intro h1{font-size:clamp(36px,12vw,60px)!important}.text{font-size:16px!important}.buttons{justify-content:center;flex-wrap:wrap}.r{width:min(100%,300px)!important}.cards{grid-template-columns:1fr!important;gap:18px!important}.card{min-height:auto!important;padding:22px!important}.ai,.impact{padding-top:60px!important;padding-bottom:55px!important}.container{padding-left:10px!important;padding-right:10px!important}.hero img{height:auto!important;min-height:0!important}.hero h1{font-size:clamp(30px,9vw,42px)!important}.content{padding-top:25px!important}.marquee-container{max-width:100%!important}.timeline-card,.blog-card,.cardi,.impact-box{width:100%!important}.containerf h2{font-size:clamp(28px,8vw,40px)!important}}
@media(max-width:430px){header>a,.logo{font-size:20px!important}nav ul{gap:6px 9px!important}nav ul li a{font-size:11px!important}.intro h1{font-size:clamp(32px,12vw,48px)!important}.buttons{flex-direction:column;align-items:stretch}.btn{width:100%;text-align:center}.card{padding:18px!important}.cardf{flex-basis:calc(100vw - 40px)!important;width:calc(100vw - 40px)!important}.comments{width:calc(100% - 20px)!important;padding:18px!important}}
</style>`;

function sendFile(res, filePath) {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
  };

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500);
      return res.end(error.code === "ENOENT" ? "Not found" : "Server error");
    }

    if (path.extname(filePath).toLowerCase() === ".html") {
      data = Buffer.from(data.toString().replace(/<\/head>/i, `${responsive}</head>`));
    }

    res.writeHead(200, {
      "Content-Type": types[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    });
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
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createSessionCookie(token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `ftx_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${secure}`;
}

function clearSessionCookie() {
  return "ftx_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
  });
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

function verifyPassword(password, stored) {
  const [scheme, salt, expectedHex] = String(stored).split(":");
  if (scheme !== "scrypt" || !salt || !expectedHex) return false;

  const actual = crypto.scryptSync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
  });
  const expected = Buffer.from(expectedHex, "hex");

  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '30 days')",
    [crypto.randomUUID(), userId, hashToken(token)]
  );
  return token;
}

async function getCurrentUser(req) {
  if (!process.env.DATABASE_URL) return null;

  const token = parseCookies(req).ftx_session;
  if (!token) return null;

  const result = await pool.query(
    "SELECT u.id,u.username,s.id AS session_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW()",
    [hashToken(token)]
  );

  return result.rows[0] || null;
}

async function handleRequest(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/api/health" && req.method === "GET") {
    if (!process.env.DATABASE_URL) {
      return sendJson(res, 200, { status: "ok", database: "not configured" });
    }

    try {
      await pool.query("SELECT 1");
      return sendJson(res, 200, { status: "ok", database: "connected" });
    } catch (error) {
      console.error("Health check failed:", error);
      return sendJson(res, 503, { status: "error", database: "unavailable" });
    }
  }

  try {
    if (url.pathname === "/api/auth/signup" && req.method === "POST") {
      const input = JSON.parse(await readBody(req));
      const username = String(input.username || "").trim();
      const password = String(input.password || "");
      const confirmPassword = String(input.confirmPassword || "");

      if (!process.env.DATABASE_URL) {
        return sendJson(res, 503, { error: "Database is not configured." });
      }
      if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) {
        return sendJson(res, 400, { error: "Username must be 3-24 letters, numbers or underscores." });
      }
      if (password.length < 8 || password.length > 128) {
        return sendJson(res, 400, { error: "Password must be 8-128 characters." });
      }
      if (password !== confirmPassword) {
        return sendJson(res, 400, { error: "Passwords do not match." });
      }

      const exists = await pool.query(
        "SELECT 1 FROM users WHERE LOWER(username)=LOWER($1)",
        [username]
      );
      if (exists.rows.length) {
        return sendJson(res, 409, { error: "That username is already taken." });
      }

      const user = {
        id: crypto.randomUUID(),
        username,
      };

      await pool.query(
        "INSERT INTO users(id,username,password_hash) VALUES($1,$2,$3)",
        [user.id, user.username, hashPassword(password)]
      );

      const token = await createSession(user.id);
      return sendJson(res, 201, { user }, createSessionCookie(token));
    }

    if (url.pathname === "/api/auth/login" && req.method === "POST") {
      const input = JSON.parse(await readBody(req));
      const username = String(input.username || "").trim();
      const password = String(input.password || "");

      if (!process.env.DATABASE_URL) {
        return sendJson(res, 503, { error: "Database is not configured." });
      }
      if (!username || !password) {
        return sendJson(res, 400, { error: "Username and password are required." });
      }

      const result = await pool.query(
        "SELECT id,username,password_hash FROM users WHERE LOWER(username)=LOWER($1)",
        [username]
      );

      if (!result.rows.length || !verifyPassword(password, result.rows[0].password_hash)) {
        return sendJson(res, 401, { error: "Invalid username or password." });
      }

      const user = {
        id: result.rows[0].id,
        username: result.rows[0].username,
      };
      const token = await createSession(user.id);
      return sendJson(res, 200, { user }, createSessionCookie(token));
    }

    if (url.pathname === "/api/auth/me" && req.method === "GET") {
      const user = await getCurrentUser(req);
      return sendJson(res, 200, {
        user: user ? { id: user.id, username: user.username } : null,
      });
    }

    if (url.pathname === "/api/auth/logout" && req.method === "POST") {
      if (process.env.DATABASE_URL) {
        const token = parseCookies(req).ftx_session;
        if (token) {
          await pool.query("DELETE FROM sessions WHERE token_hash=$1", [hashToken(token)]);
        }
      }
      return sendJson(res, 200, { ok: true }, clearSessionCookie());
    }

    if (url.pathname === "/api/comments" && req.method === "GET") {
      const post = (url.searchParams.get("post") || "ai").trim();
      const user = await getCurrentUser(req);
      const result = await pool.query(
        'SELECT c.id,c.post,c.name,c.comment,c."createdAt",c."updatedAt",c.user_id,u.username AS "username" FROM comments c LEFT JOIN users u ON u.id=c.user_id WHERE c.post=$1 ORDER BY c."createdAt" ASC',
        [post]
      );

      return sendJson(
        res,
        200,
        result.rows.map(comment => ({
          ...comment,
          isOwner: Boolean(user && comment.user_id === user.id),
        }))
      );
    }

    if (url.pathname === "/api/comments" && req.method === "POST") {
      const user = await getCurrentUser(req);
      if (!user) return sendJson(res, 401, { error: "You must be logged in to comment." });

      const input = JSON.parse(await readBody(req));
      const text = String(input.comment || "").trim();
      const post = String(input.post || "ai").trim();

      if (!text || !post) {
        return sendJson(res, 400, { error: "Comment and post are required." });
      }
      if (text.length > 1000 || post.length > 50) {
        return sendJson(res, 400, { error: "Input is too long." });
      }

      const comment = {
        id: crypto.randomUUID(),
        post,
        name: user.username,
        comment: text,
        createdAt: new Date().toISOString(),
        updatedAt: null,
        username: user.username,
        isOwner: true,
      };

      await pool.query(
        'INSERT INTO comments(id,post,name,comment,"createdAt",user_id) VALUES($1,$2,$3,$4,$5,$6)',
        [comment.id, comment.post, comment.name, comment.comment, comment.createdAt, user.id]
      );

      return sendJson(res, 201, comment);
    }

    const match = url.pathname.match(/^\/api\/comments\/([^/]+)$/);
    if (match && (req.method === "PUT" || req.method === "DELETE")) {
      const user = await getCurrentUser(req);
      if (!user) return sendJson(res, 401, { error: "You must be logged in." });

      const id = decodeURIComponent(match[1]);

      if (req.method === "DELETE") {
        const result = await pool.query(
          'DELETE FROM comments WHERE id=$1 AND user_id=$2 RETURNING id,post,name,comment,"createdAt","updatedAt"',
          [id, user.id]
        );

        if (!result.rows.length) {
          return sendJson(res, 404, { error: "Comment not found or not yours." });
        }

        return sendJson(res, 200, {
          ...result.rows[0],
          username: user.username,
          isOwner: true,
        });
      }

      const input = JSON.parse(await readBody(req));
      const text = String(input.comment || "").trim();
      if (!text || text.length > 1000) {
        return sendJson(res, 400, { error: "Comment must be 1-1000 characters." });
      }

      const updatedAt = new Date().toISOString();
      const result = await pool.query(
        'UPDATE comments SET comment=$1,"updatedAt"=$2 WHERE id=$3 AND user_id=$4 RETURNING id,post,name,comment,"createdAt","updatedAt"',
        [text, updatedAt, id, user.id]
      );

      if (!result.rows.length) {
        return sendJson(res, 404, { error: "Comment not found or not yours." });
      }

      return sendJson(res, 200, {
        ...result.rows[0],
        username: user.username,
        isOwner: true,
      });
    }
  } catch (error) {
    console.error("API error:", error);
    return sendJson(res, 500, { error: "Server error." });
  }

  if (req.method === "GET") {
    let requested = decodeURIComponent(url.pathname);
    if (requested === "/") requested = "/tech.html";

    const safePath = path.normalize(path.join(ROOT, requested));
    if (safePath.startsWith(ROOT) && fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
      return sendFile(res, safePath);
    }
  }

  return sendJson(res, 404, { error: "Not found" });
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch(error => {
    console.error("Unhandled request error:", error);
    if (!res.headersSent) {
      sendJson(res, 500, { error: "Server error." });
    } else {
      res.end();
    }
  });
});

async function start() {
  try {
    await setupDatabase();
    server.listen(PORT, () => {
      console.log(`FutureTechX server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Database setup failed:", error);
    server.listen(PORT, () => {
      console.log(`FutureTechX server running on port ${PORT} without database initialization`);
    });
  }
}

start();
