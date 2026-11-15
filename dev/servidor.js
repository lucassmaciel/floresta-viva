// Servidor de desenvolvimento (Node puro). Serve frontend/ e /dev/*.
// Injeta o provedor local e o endereco local no index.html (so aqui, nunca no arquivo).
// A rota /?sem-carteira=1 serve o index sem injecao (simula navegador sem MetaMask).
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORTA = 5173;
const RAIZ = path.join(__dirname, "..");
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function injetar(html) {
  return html.replace(
    /<script src="contrato\.js"><\/script>/,
    '<script src="/dev/provedor-local.js"></script>\n  <script src="contrato.js"></script>\n  <script src="/dev/contrato.local.js"></script>'
  );
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/") rel = "/index.html";

    let base;
    if (rel.startsWith("/dev/")) base = path.join(RAIZ, rel);
    else base = path.join(RAIZ, "frontend", rel);
    base = path.normalize(base);
    const permitido = [path.join(RAIZ, "frontend"), path.join(RAIZ, "dev")];
    if (!permitido.some((p) => base.startsWith(p + path.sep))) {
      res.writeHead(403).end("Proibido");
      return;
    }

    fs.readFile(base, (erro, dados) => {
      if (erro) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Não encontrado");
        return;
      }
      const tipo = TIPOS[path.extname(base)] || "application/octet-stream";
      let corpo = dados;
      if (rel === "/index.html" && !url.searchParams.has("sem-carteira")) {
        corpo = Buffer.from(injetar(dados.toString("utf8")), "utf8");
      }
      res.writeHead(200, { "Content-Type": tipo, "Cache-Control": "no-store" }).end(corpo);
    });
  })
  .listen(PORTA, () => console.log(`Floresta Viva dev em http://localhost:${PORTA}`));
