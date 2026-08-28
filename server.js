const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const types = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"application/javascript; charset=utf-8", ".json":"application/json; charset=utf-8", ".svg":"image/svg+xml", ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".webp":"image/webp", ".ico":"image/x-icon" };

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Method Not Allowed");
  }
  let requested = decodeURIComponent(new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname);
  if (requested === "/") requested = "/tech.html";
  const safePath = path.normalize(path.join(ROOT, requested));
  if (!safePath.startsWith(ROOT + path.sep) && safePath !== ROOT) {
    res.writeHead(403); return res.end("Forbidden");
  }
  fs.stat(safePath, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": types[path.extname(safePath).toLowerCase()] || "application/octet-stream" });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(safePath).pipe(res);
  });
});
server.listen(PORT, () => console.log(`FutureTechX running on port ${PORT}`));
