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

function safeName(name) {
  return String(name || "").replace(/[^a-zA-Z0-9_-]/g, "");
}

function esc(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function ensureProjectFiles(name) {
  const dir = path.join(WORKSPACE, name);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const htmlPath = path.join(dir, "index.html");
  const cssPath = path.join(dir, "style.css");
  const jsPath = path.join(dir, "app.js");
  const manifestPath = path.join(dir, "manifest.json");
  const swPath = path.join(dir, "sw.js");

  const manifestHref = `/manifest/${name}`;

  if (!fs.existsSync(htmlPath)) {
    fs.writeFileSync(htmlPath, `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
  <meta name="theme-color" content="#2563eb">
  <link rel="manifest" href="${manifestHref}">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main class="hero">
    <h1>🚀 ${name}</h1>
    <p>موقع احترافي سريع ومتجاوب تم إنشاؤه بواسطة AI SaaS Factory</p>
    <a class="btn" href="#contact">ابدأ الآن مجانًا 🚀</a>
  </main>

  <section class="features">
    <h2>مميزات المشروع</h2>
    <div class="cards">
      <div>⚡ سريع</div>
      <div>📱 PWA جاهز</div>
      <div>🎨 تصميم نظيف</div>
    </div>
  </section>

  <section id="contact" class="contact">
    <h2>تواصل معنا الآن</h2>
    <p>جاهز للانطلاق.</p>
  </section>

  <script src="app.js"></script>
</body>
</html>`, "utf8");
  } else {
    let html = fs.readFileSync(htmlPath, "utf8");

    if (!html.includes('rel="manifest"')) {
      html = html.replace("</head>", `  <meta name="theme-color" content="#2563eb">
  <link rel="manifest" href="${manifestHref}">
</head>`);
    } else {
      html = html.replace(/<link\s+rel=["']manifest["'][^>]*>/i, `<link rel="manifest" href="${manifestHref}">`);
    }

    fs.writeFileSync(htmlPath, html, "utf8");
  }

  if (!fs.existsSync(cssPath)) {
    fs.writeFileSync(cssPath, `body {
  margin: 0;
  font-family: Arial, sans-serif;
  background: #f8fafc;
  color: #0f172a;
}

.hero {
  min-height: 70vh;
  display: grid;
  place-items: center;
  text-align: center;
  padding: 40px;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  color: white;
}

.hero h1 { font-size: 42px; margin-bottom: 10px; }

.btn {
  display: inline-block;
  background: white;
  color: #2563eb;
  padding: 12px 20px;
  border-radius: 10px;
  text-decoration: none;
  font-weight: bold;
}

.features, .contact {
  padding: 40px 20px;
  text-align: center;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
  max-width: 800px;
  margin: 20px auto;
}

.cards div {
  background: white;
  padding: 20px;
  border-radius: 14px;
  box-shadow: 0 10px 25px rgba(0,0,0,.08);
}

.ai-improve-badge {
  position: fixed;
  bottom: 14px;
  left: 14px;
  z-index: 9999;
  background: #111827;
  color: #fff;
  padding: 9px 13px;
  border-radius: 999px;
  font-size: 12px;
}`, "utf8");
  }

  if (!fs.existsSync(jsPath)) {
    fs.writeFileSync(jsPath, `console.log("AI SaaS Factory project loaded");

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
`, "utf8");
  }

  // يكتب manifest دائمًا
  fs.writeFileSync(manifestPath, JSON.stringify({
    id: "/" + name + "/",
    name: name,
    short_name: name.slice(0, 12),
    description: "تطبيق احترافي تم إنشاؤه باستخدام AI SaaS Factory",
    start_url: "/preview/" + name,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    lang: "ar",
    dir: "rtl",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "https://cdn-icons-png.flaticon.com/512/1046/1046784.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable"
      }
    ]
  }, null, 2), "utf8");

  if (!fs.existsSync(swPath)) {
    fs.writeFileSync(swPath, `const CACHE_NAME = "${name}-v1";
const ASSETS = ["./", "./index.html", "./style.css", "./app.js"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener("fetch", event => {
  event.respondWith(caches.match(event.request).then(res => res || fetch(event.request)));
});
`, "utf8");
  }
}

// مهم: manifest route قبل static
app.get(/^\/manifest\/([^/]+)\/?$/, (req, res) => {
  const name = safeName(req.params[0]);
  ensureProjectFiles(name);

  res.setHeader("Content-Type", "application/manifest+json");
  res.setHeader("Cache-Control", "no-store");

  res.json({
    id: "/" + name + "/",
    name: name,
    short_name: name.slice(0, 12),
    description: "تطبيق احترافي تم إنشاؤه باستخدام AI SaaS Factory",
    start_url: "/preview/" + name,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    lang: "ar",
    dir: "rtl",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "https://cdn-icons-png.flaticon.com/512/1046/1046784.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable"
      }
    ]
  });
});

app.use("/workspace", express.static(WORKSPACE));

app.get("/", (req, res) => res.redirect("/dashboard"));

app.get("/dashboard", (req, res) => {
  const projects = fs.readdirSync(WORKSPACE)
    .filter(name => fs.statSync(path.join(WORKSPACE, name)).isDirectory());

  res.send(`<!DOCTYPE html>
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
.btn{display:inline-block;margin:5px 4px 0 0;padding:9px 12px;border-radius:9px;color:white;text-decoration:none;border:0;cursor:pointer}
.blue{background:#2563eb}.dark{background:#334155}.green{background:#16a34a}.purple{background:#7c3aed}.orange{background:#f97316}
.small{color:#94a3b8;font-size:13px}
</style>
</head>
<body>
<div class="header">
  <h1>🚀 AI SaaS Factory</h1>
  <p>Dashboard · Edit · Preview · Export ZIP · AI Improve · APK</p>
</div>

<h2>المشاريع (${projects.length})</h2>
<div class="grid">
${projects.map(p => `
  <div class="card">
    <h3>${p}</h3>
    <div class="small">Website / PWA Project</div>
    <a class="btn blue" href="/edit/${p}">تعديل</a>
    <a class="btn dark" target="_blank" href="/preview/${p}">معاينة</a>
    <a class="btn green" href="/export/${p}">ZIP</a>
    <a class="btn orange" href="/apk/${p}">APK 📱</a>
    <button class="btn purple" onclick="improve('${p}')">AI Improve ✨</button>
  </div>
`).join("")}
</div>

<script>
async function improve(name){
  const res = await fetch("/improve/" + name, { method: "POST" });
  const data = await res.json();
  alert(data.ok ? "✅ تم التحسين" : "❌ " + data.error);
  location.reload();
}
</script>
</body>
</html>`);
});

app.get("/preview/:name", (req, res) => {
  const name = safeName(req.params.name);
  ensureProjectFiles(name);
  res.redirect("/workspace/" + name + "/index.html?v=" + Date.now());
});

app.get("/edit/:name", (req, res) => {
  const name = safeName(req.params.name);
  ensureProjectFiles(name);

  const dir = path.join(WORKSPACE, name);
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(dir, "style.css"), "utf8");
  const js = fs.readFileSync(path.join(dir, "app.js"), "utf8");

  res.send(`<!DOCTYPE html>
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
  <button onclick="improve()">AI Improve</button>
  <a target="_blank" href="/preview/${name}">معاينة</a>
  <a href="/export/${name}">ZIP</a>
  <a href="/apk/${name}">APK</a>
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

async function improve(){
  await save();
  const res = await fetch("/improve/${name}", { method: "POST" });
  const data = await res.json();
  alert(data.ok ? "✅ تم التحسين" : "❌ " + data.error);
  location.reload();
}
</script>
</body>
</html>`);
});

app.post("/edit/:name", (req, res) => {
  const name = safeName(req.params.name);
  ensureProjectFiles(name);
  const dir = path.join(WORKSPACE, name);

  fs.writeFileSync(path.join(dir, "index.html"), req.body.html || "", "utf8");
  fs.writeFileSync(path.join(dir, "style.css"), req.body.css || "", "utf8");
  fs.writeFileSync(path.join(dir, "app.js"), req.body.js || "", "utf8");

  res.json({ ok: true });
});

app.post("/improve/:name", (req, res) => {
  try {
    const name = safeName(req.params.name);
    ensureProjectFiles(name);

    const dir = path.join(WORKSPACE, name);
    const htmlPath = path.join(dir, "index.html");
    const cssPath = path.join(dir, "style.css");

    let html = fs.readFileSync(htmlPath, "utf8");

    html = html
      .replace(/ابدأ الآن/g, "ابدأ الآن مجانًا 🚀")
      .replace(/تواصل معنا/g, "تواصل معنا الآن")
      .replace(/موقع احترافي/g, "موقع احترافي سريع ومتجاوب");

    if (!html.includes("ai-improve-badge")) {
      html = html.replace("</body>", `<div class="ai-improve-badge">✨ محسّن تلقائيًا</div></body>`);
    }

    fs.writeFileSync(htmlPath, html, "utf8");

    let css = fs.readFileSync(cssPath, "utf8");
    if (!css.includes("AI_IMPROVE_V4")) {
      css += `

/* AI_IMPROVE_V4 */
html{scroll-behavior:smooth}
button,.btn,a{transition:.25s ease}
button:hover,.btn:hover,a:hover{transform:translateY(-2px);filter:brightness(1.08)}
section{animation:fadeInUp .55s ease both}
@keyframes fadeInUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
`;
    }

    fs.writeFileSync(cssPath, css, "utf8");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/apk/:name", (req, res) => {
  const name = safeName(req.params.name);
  ensureProjectFiles(name);

  const previewUrl = `${req.protocol}://${req.get("host")}/preview/${name}`;
  const builderUrl = `https://www.pwabuilder.com/?url=${encodeURIComponent(previewUrl)}`;

  res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>APK Builder - ${name}</title>
<style>
body{margin:0;background:#070b16;color:white;font-family:Arial;padding:20px}
.box{max-width:760px;margin:auto;background:#111827;border:1px solid #263449;border-radius:20px;padding:24px}
a{display:inline-block;margin:8px 6px 0 0;padding:12px 16px;border-radius:10px;background:#2563eb;color:white;text-decoration:none}
.green{background:#16a34a}.dark{background:#334155}.purple{background:#7c3aed}
code{display:block;background:#020617;padding:12px;border-radius:10px;direction:ltr;text-align:left;overflow:auto}
li{margin:8px 0}
</style>
</head>
<body>
<div class="box">
  <h1>📱 APK Builder</h1>
  <p>المشروع: <b>${name}</b></p>
  <h3>رابط التطبيق</h3>
  <code>${previewUrl}</code>

  <a class="purple" target="_blank" href="${builderUrl}">فتح PWABuilder</a>
  <a class="green" href="/export/${name}">تحميل ZIP</a>
  <a class="dark" href="/dashboard">رجوع</a>

  <hr>
  <h3>طريقة استخراج APK</h3>
  <ol>
    <li>افتح PWABuilder.</li>
    <li>استخدم رابط التطبيق أعلاه.</li>
    <li>اختر Package for Stores.</li>
    <li>اختر Android.</li>
    <li>نزّل APK أو AAB.</li>
  </ol>
</div>
</body>
</html>`);
});

app.get("/export/:name", (req, res) => {
  const name = safeName(req.params.name);
  ensureProjectFiles(name);

  const dir = path.join(WORKSPACE, name);
  res.attachment(name + ".zip");

  const archive = archiver("zip", { zlib: { level: 1 } });
  archive.on("error", err => res.status(500).send(err.message));
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
