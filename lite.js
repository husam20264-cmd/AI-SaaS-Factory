const express = require("express");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

const app = express();
const PORT = process.env.PORT || 5000;
const WORKSPACE = path.join(__dirname, "workspace");

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

if (!fs.existsSync(WORKSPACE)) {
  fs.mkdirSync(WORKSPACE, { recursive: true });
}

app.use("/workspace", express.static(WORKSPACE));

function safeName(name) {
  return String(name || "").replace(/[^a-zA-Z0-9_-]/g, "");
}

function esc(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

app.get("/", (req, res) => {
  res.redirect("/dashboard");
});

app.get("/dashboard", (req, res) => {
  const projects = fs.readdirSync(WORKSPACE)
    .filter(name => fs.statSync(path.join(WORKSPACE, name)).isDirectory());

  res.send(`
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI SaaS Factory</title>
<style>
body{margin:0;background:#070b16;color:white;font-family:Arial;padding:20px}
.header{background:linear-gradient(135deg,#2563eb,#7c3aed);padding:24px;border-radius:22px;margin-bottom:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}
.card{background:#111827;border:1px solid #263449;border-radius:16px;padding:16px}
.btn{display:inline-block;margin:5px 4px 0 0;padding:9px 12px;border-radius:9px;color:white;text-decoration:none;border:0}
.blue{background:#2563eb}.dark{background:#334155}.green{background:#16a34a}.red{background:#dc2626}
.small{color:#94a3b8;font-size:13px}
</style>
</head>
<body>
<div class="header">
  <h1>🚀 AI SaaS Factory</h1>
  <p>Dashboard · Edit · Preview · Export ZIP</p>
</div>

<h2>المشاريع (${projects.length})</h2>

<div class="grid">
${projects.map(p => `
  <div class="card">
    <h3>${p}</h3>
    <div class="small">Website Project</div>
    <a class="btn blue" href="/edit/${p}">تعديل</a>
    <a class="btn dark" target="_blank" href="/workspace/${p}/index.html">معاينة</a>
    <a class="btn green" href="/export/${p}">ZIP</a>
  </div>
`).join("")}
</div>
</body>
</html>
`);
});

app.get("/edit/:name", (req, res) => {
  const name = safeName(req.params.name);
  const dir = path.join(WORKSPACE, name);

  if (!fs.existsSync(dir)) {
    return res.status(404).send("Project not found");
  }

  const htmlPath = path.join(dir, "index.html");
  const cssPath = path.join(dir, "style.css");
  const jsPath = path.join(dir, "app.js");

  const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, "utf8") : "";
  const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, "utf8") : "";
  const js = fs.existsSync(jsPath) ? fs.readFileSync(jsPath, "utf8") : "";

  res.send(`
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Edit ${name}</title>
<style>
body{margin:0;background:#070b16;color:white;font-family:Arial}
.top{padding:12px;background:#020617;display:flex;gap:8px;align-items:center;flex-wrap:wrap;position:sticky;top:0}
button,a{padding:9px 12px;border:0;border-radius:8px;background:#2563eb;color:white;text-decoration:none}
.tabs{padding:8px;background:#0f172a}
.tabs button{background:#334155}
textarea{width:100%;height:78vh;background:#020617;color:#e5e7eb;border:0;padding:12px;font-family:monospace;font-size:13px;direction:ltr;text-align:left}
</style>
</head>
<body>
<div class="top">
  <b>✏️ ${name}</b>
  <button onclick="save()">حفظ</button>
  <a target="_blank" href="/workspace/${name}/index.html?v=${Date.now()}">معاينة</a>
  <a href="/export/${name}">ZIP</a>
  <a href="/dashboard">رجوع</a>
</div>

<div class="tabs">
  <button onclick="showTab('html')">HTML</button>
  <button onclick="showTab('css')">CSS</button>
  <button onclick="showTab('js')">JS</button>
</div>

<textarea id="html">${esc(html)}</textarea>
<textarea id="css" style="display:none">${esc(css)}</textarea>
<textarea id="js" style="display:none">${esc(js)}</textarea>

<script>
function showTab(id){
  document.getElementById("html").style.display = "none";
  document.getElementById("css").style.display = "none";
  document.getElementById("js").style.display = "none";
  document.getElementById(id).style.display = "block";
}

async function save(){
  const res = await fetch("/edit/${name}", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      html: document.getElementById("html").value,
      css: document.getElementById("css").value,
      js: document.getElementById("js").value
    })
  });

  const data = await res.json();
  alert(data.ok ? "✅ تم الحفظ" : "❌ فشل الحفظ");
}
</script>
</body>
</html>
`);
});

app.post("/edit/:name", (req, res) => {
  const name = safeName(req.params.name);
  const dir = path.join(WORKSPACE, name);

  if (!fs.existsSync(dir)) {
    return res.status(404).json({ ok: false, error: "Project not found" });
  }

  fs.writeFileSync(path.join(dir, "index.html"), req.body.html || "", "utf8");
  fs.writeFileSync(path.join(dir, "style.css"), req.body.css || "", "utf8");
  fs.writeFileSync(path.join(dir, "app.js"), req.body.js || "", "utf8");

  res.json({ ok: true });
});

app.get("/export/:name", (req, res) => {
  const name = safeName(req.params.name);
  const dir = path.join(WORKSPACE, name);

  if (!fs.existsSync(dir)) {
    return res.status(404).send("Project not found");
  }

  res.attachment(name + ".zip");

  const archive = archiver("zip", { zlib: { level: 1 } });

  archive.on("error", err => {
    res.status(500).send(err.message);
  });

  archive.pipe(res);
  archive.directory(dir, false);
  archive.finalize();
});

app.get("/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 AI SaaS Factory running on port " + PORT);
});
