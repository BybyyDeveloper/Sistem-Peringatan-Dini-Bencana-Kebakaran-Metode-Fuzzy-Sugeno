/**
 * server.js — Static file server untuk web-pages/
 * Jalankan: node server.js
 * Akses di: http://localhost:<PORT>
 */
const http = require("http");
const fs   = require("fs");
const path = require("path");

const PORT = process.env.PORT || 5500;
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css",
  ".js":   "application/javascript",
  ".json": "application/json",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".woff2":"font/woff2",
};

http.createServer((req, res) => {
  // CORS header agar Firebase Auth menerima domain ini
  res.setHeader("Access-Control-Allow-Origin", "*");

  let pathname = req.url.split("?")[0];
  if (pathname === "/" || pathname === "") pathname = "/index.html";

  const filePath = path.join(ROOT, pathname);

  // Security: jangan keluar dari ROOT
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        // Coba index.html sebagai fallback
        const index = path.join(ROOT, "index.html");
        fs.readFile(index, (e2, d2) => {
          if (e2) { res.writeHead(404); res.end("Not found"); return; }
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(d2);
        });
      } else {
        res.writeHead(500); res.end("Server error");
      }
      return;
    }
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  });
}).listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Web-pages server berjalan di port ${PORT}`);
  console.log(`   Buka: http://localhost:${PORT}`);
});
