const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "comments.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "[]", "utf8");

function readComments() {
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    } catch {
        return [];
    }
}

function writeComments(comments) {
    fs.writeFileSync(DB_FILE, JSON.stringify(comments, null, 2), "utf8");
}

function sendJson(res, status, data) {
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end(JSON.stringify(data));
}

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
        ".ico": "image/x-icon"
    };

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
    if (req.method === "OPTIONS") return sendJson(res, 204, {});

    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/api/comments" && req.method === "GET") {
        const post = (url.searchParams.get("post") || "ai").trim();
        const comments = readComments().filter(comment => comment.post === post);
        return sendJson(res, 200, comments);
    }

    if (url.pathname === "/api/comments" && req.method === "POST") {
        try {
            const input = JSON.parse(await body(req));
            const name = String(input.name || "").trim();
            const text = String(input.comment || "").trim();
            const post = String(input.post || "ai").trim();

            if (!name || !text || !post) {
                return sendJson(res, 400, { error: "Name, comment and post are required." });
            }
            if (name.length > 50 || text.length > 1000 || post.length > 50) {
                return sendJson(res, 400, { error: "Input is too long." });
            }

            const comments = readComments();
            const newComment = {
                id: crypto.randomUUID(),
                post,
                name,
                comment: text,
                createdAt: new Date().toISOString()
            };

            comments.push(newComment);
            writeComments(comments);
            return sendJson(res, 201, newComment);
        } catch {
            return sendJson(res, 400, { error: "Invalid request." });
        }
    }

    if (url.pathname === "/api/health") {
        return sendJson(res, 200, { status: "ok" });
    }

    if (req.method === "GET") {
        let requested = decodeURIComponent(url.pathname);
        if (requested === "/") requested = "/tech.html";
        const safePath = path.normalize(path.join(ROOT, requested));
        if (safePath.startsWith(ROOT) && fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
            return sendFile(res, safePath);
        }
    }

    sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
    console.log(`FutureTechX server running on port ${PORT}`);
});
