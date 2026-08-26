const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function setupDatabase() {
    if (!process.env.DATABASE_URL) {
        console.warn("DATABASE_URL is not set. Comments database is unavailable.");
        return;
    }
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
    console.log("PostgreSQL database ready");
}

function sendJson(res, status, data) {
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end(JSON.stringify(data));
}

function sendFile(res, filePath) {
    const types = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"application/javascript; charset=utf-8", ".json":"application/json; charset=utf-8", ".svg":"image/svg+xml", ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".webp":"image/webp", ".ico":"image/x-icon" };
    fs.readFile(filePath, (error, data) => {
        if (error) {
            res.writeHead(error.code === "ENOENT" ? 404 : 500);
            return res.end(error.code === "ENOENT" ? "Not found" : "Server error");
        }
        res.writeHead(200, { "Content-Type": types[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
        res.end(data);
    });
}

function body(req) {
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

const server = http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        });
        return res.end();
    }

    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/api/comments" && req.method === "GET") {
        try {
            const post = (url.searchParams.get("post") || "ai").trim();
            const result = await pool.query(
                'SELECT id, post, name, comment, "createdAt", "updatedAt" FROM comments WHERE post = $1 ORDER BY "createdAt" ASC',
                [post]
            );
            return sendJson(res, 200, result.rows);
        } catch (error) {
            console.error(error);
            return sendJson(res, 500, { error: "Database unavailable." });
        }
    }

    if (url.pathname === "/api/comments" && req.method === "POST") {
        try {
            const input = JSON.parse(await body(req));
            const name = String(input.name || "").trim();
            const text = String(input.comment || "").trim();
            const post = String(input.post || "ai").trim();
            if (!name || !text || !post) return sendJson(res, 400, { error: "Name, comment and post are required." });
            if (name.length > 50 || text.length > 1000 || post.length > 50) return sendJson(res, 400, { error: "Input is too long." });
            const newComment = { id: crypto.randomUUID(), post, name, comment: text, createdAt: new Date().toISOString() };
            await pool.query(
                'INSERT INTO comments (id, post, name, comment, "createdAt") VALUES ($1, $2, $3, $4, $5)',
                [newComment.id, newComment.post, newComment.name, newComment.comment, newComment.createdAt]
            );
            return sendJson(res, 201, newComment);
        } catch (error) {
            console.error(error);
            return sendJson(res, 400, { error: "Invalid request or database error." });
        }
    }

    const commentMatch = url.pathname.match(/^\/api\/comments\/([^/]+)$/);
    if (commentMatch && (req.method === "PUT" || req.method === "DELETE")) {
        const id = decodeURIComponent(commentMatch[1]);

        try {
            if (req.method === "DELETE") {
                const result = await pool.query(
                    'DELETE FROM comments WHERE id = $1 RETURNING id, post, name, comment, "createdAt", "updatedAt"',
                    [id]
                );
                if (result.rows.length === 0) return sendJson(res, 404, { error: "Comment not found." });
                return sendJson(res, 200, result.rows[0]);
            }

            const input = JSON.parse(await body(req));
            const current = await pool.query('SELECT name FROM comments WHERE id = $1', [id]);
            if (current.rows.length === 0) return sendJson(res, 404, { error: "Comment not found." });

            const name = String(input.name || current.rows[0].name).trim();
            const text = String(input.comment || "").trim();
            if (!name || !text) return sendJson(res, 400, { error: "Name and comment are required." });
            if (name.length > 50 || text.length > 1000) return sendJson(res, 400, { error: "Input is too long." });

            const updatedAt = new Date().toISOString();
            const result = await pool.query(
                'UPDATE comments SET name = $1, comment = $2, "updatedAt" = $3 WHERE id = $4 RETURNING id, post, name, comment, "createdAt", "updatedAt"',
                [name, text, updatedAt, id]
            );
            return sendJson(res, 200, result.rows[0]);
        } catch (error) {
            console.error(error);
            return sendJson(res, 400, { error: "Invalid request or database error." });
        }
    }

    if (url.pathname === "/api/health") return sendJson(res, 200, { status: "ok" });

    if (req.method === "GET") {
        let requested = decodeURIComponent(url.pathname);
        if (requested === "/") requested = "/tech.html";
        const safePath = path.normalize(path.join(ROOT, requested));
        if (safePath.startsWith(ROOT) && fs.existsSync(safePath) && fs.statSync(safePath).isFile()) return sendFile(res, safePath);
    }
    sendJson(res, 404, { error: "Not found" });
});

setupDatabase().catch(error => console.error("Database setup failed:", error));
server.listen(PORT, () => console.log(`FutureTechX server running on port ${PORT}`));
