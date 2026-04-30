const fs = require("fs");
const file = "cloud.js";
let code = fs.readFileSync(file, "utf8");

// حذف أي Dashboard قديم
code = code.replace(
  /\/\/ ===============================\n\/\/ PRO DASHBOARD[\s\S]*?\/\/ ===============================\n\/\/ END PRO DASHBOARD[\s\S]*?\n/g,
  ""
);

// حذف routes قديمة
code = code.replace(/app\.post\(["']\/delete\/:name["'][\s\S]*?\n\}\);\s*/g, "");
code = code.replace(/app\.get\(["']\/apk\/:name["'][\s\S]*?\n\}\);\s*/g, "");

// تأكد من static
if (!code.includes('app.use("/workspace"')) {
  code = code.replace(
    /(const app\s*=\s*express\(\);?)/,
    `$1
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.json({ limit: "50mb" }));
app.use("/workspace", express.static(path.join(__dirname, "workspace")));`
  );
}

const block = `
// ===============================
// PRO DASHBOARD V3
// ===============================
function safeProjectName(name) {
  return String(name || "").replace(/[^a-zA-Z0-9_-]/g, "");
}

function getProjectInfo(name) {
  const projectDir = path.join(__dirname, "workspace", name);
  let size = 0;

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir)) {
      const p = path.join(dir, item);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else size += st.size;
    }
  }

  walk(projectDir);

  return {
    name,
    hasIndex: fs.existsSync(path.join(projectDir, "index.html")),
    hasCss: fs.existsSync(path.join(projectDir, "style.css")),
    hasJs: fs.existsSync(path.join(projectDir, "app.js")),
    isPwa:
      fs.existsSync(path.join(projectDir, "manifest.json")) &&
      fs.existsSync(path.join(projectDir, "sw.js")),
    sizeKB: Math.max(1, Math.round(size / 1024)),
    updated: fs.statSync(projectDir).mtime
  };
}

app.get("/dashboard", (req, res) => {
  const workspace = path.join(__dirname, "workspace");
  if (!fs.existsSync(workspace)) fs.mkdirSync(workspace, { recursive: true });

  const projects = fs.readdirSync(workspace)
    .filter(name => fs.statSync(path.join(workspace, name)).isDirectory())
    .map(getProjectInfo)
    .sort((a, b) => b.updated - a.updated);

  const total = projects.length;
  const pwaCount = projects.filter(p => p.isPwa).length;
  const websiteCount = projects.filter(p => p.hasIndex).length;

  res.send(\`
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI SaaS Factory Pro</title>
<style>
:root{
  --bg:#070b16;
  --side:#020617;
  --card:#111827;
  --text:#e5e7eb;
  --muted:#94a3b8;
  --line:#1e293b;
  --blue:#2563eb;
  --green:#16a34a;
  --red:#dc2626;
  --purple:#7c3aed;
  --orange:#f97316;
}
*{box-sizing:border-box}
body{
  margin:0;
  font-family:Arial,sans-serif;
  background:
    radial-gradient(circle at top left, rgba(37,99,235,.25), transparent 35%),
    radial-gradient(circle at top right, rgba(124,58,237,.20), transparent 30%),
    var(--bg);
  color:var(--text);
}
.layout{
  display:grid;
  grid-template-columns:270px 1fr;
  min-height:100vh;
}
.sidebar{
  background:rgba(2,6,23,.94);
  border-left:1px solid var(--line);
  padding:24px;
  position:sticky;
  top:0;
  height:100vh;
}
.logo{font-size:22px;font-weight:900;margin-bottom:6px}
.muted{color:var(--muted);font-size:13px}
.nav{display:grid;gap:10px;margin-top:25px}
.nav a{
  color:white;
  text-decoration:none;
  padding:13px 14px;
  border-radius:14px;
  background:#0f172a;
  border:1px solid var(--line);
}
.nav a.active{
  background:linear-gradient(135deg,var(--blue),var(--purple));
}
.main{padding:28px}
.hero{
  background:linear-gradient(135deg,#2563eb,#7c3aed);
  border-radius:26px;
  padding:28px;
  margin-bottom:22px;
  box-shadow:0 20px 60px #0007;
}
.hero h1{margin:0 0 10px;font-size:32px}
.hero p{margin:0;color:#dbeafe}
.stats{
  display:grid;
  grid-template-columns:repeat(3,1fr);
  gap:14px;
  margin-bottom:22px;
}
.stat{
  background:rgba(17,24,39,.85);
  border:1px solid var(--line);
  border-radius:20px;
  padding:18px;
}
.stat strong{font-size:30px;display:block}
.toolbar{
  display:flex;
  justify-content:space-between;
  gap:12px;
  align-items:center;
  margin-bottom:18px;
}
.search{
  width:100%;
  max-width:430px;
  padding:13px 14px;
  border-radius:14px;
  border:1px solid var(--line);
  background:#0f172a;
  color:white;
}
.grid{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(270px,1fr));
  gap:18px;
}
.card{
  background:
    linear-gradient(#111827,#111827) padding-box,
    linear-gradient(135deg,#2563eb,#7c3aed) border-box;
  border:1px solid transparent;
  border-radius:22px;
  padding:18px;
  box-shadow:0 12px 36px #0006;
  transition:.25s ease;
}
.card:hover{
  transform:translateY(-6px);
  box-shadow:0 22px 70px #0009;
}
.card-head{
  display:flex;
  justify-content:space-between;
  gap:10px;
}
.card h3{
  margin:0 0 8px;
  font-size:20px;
  word-break:break-word;
}
.pill{
  display:inline-flex;
  padding:6px 9px;
  border-radius:999px;
  font-size:12px;
  background:#1e293b;
  color:#cbd5e1;
}
.pill.green{background:rgba(22,163,74,.18);color:#86efac}
.pill.orange{background:rgba(249,115,22,.18);color:#fdba74}
.meta{
  display:flex;
  flex-wrap:wrap;
  gap:7px;
  margin:13px 0;
}
.actions{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:9px;
  margin-top:15px;
}
.btn,button.btn{
  border:0;
  cursor:pointer;
  text-align:center;
  padding:11px 10px;
  border-radius:13px;
  color:white;
  text-decoration:none;
  font-size:14px;
}
.blue{background:var(--blue)}
.dark{background:#334155}
.green{background:var(--green)}
.red{background:var(--red)}
.purple{background:linear-gradient(135deg,var(--purple),var(--blue))}
.orange{background:var(--orange)}
.full{grid-column:1/-1}
.empty{
  padding:50px;
  background:rgba(17,24,39,.85);
  border:1px dashed #334155;
  border-radius:22px;
  text-align:center;
  color:var(--muted);
}
.modal{
  display:none;
  position:fixed;
  inset:0;
  background:rgba(0,0,0,.82);
  z-index:999;
}
.modal-bar{
  height:54px;
  background:#020617;
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:0 16px;
  border-bottom:1px solid #1e293b;
}
.modal iframe{
  width:100%;
  height:calc(100vh - 54px);
  border:0;
  background:white;
}
.close{
  background:#dc2626;
  color:white;
  border:0;
  border-radius:10px;
  padding:9px 13px;
}
.toast{
  position:fixed;
  bottom:20px;
  left:20px;
  background:#111827;
  border:1px solid #334155;
  border-radius:14px;
  padding:14px 18px;
  display:none;
}
@media(max-width:850px){
  .layout{grid-template-columns:1fr}
  .sidebar{position:relative;height:auto;border-left:0;border-bottom:1px solid var(--line)}
  .stats{grid-template-columns:1fr}
  .toolbar{flex-direction:column;align-items:stretch}
}
</style>
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <div class="logo">SaaS Factory 🚀</div>
    <div class="muted">Pro Dashboard v3</div>
    <div class="nav">
      <a class="active" href="/dashboard">📁 المشاريع</a>
      <a href="/">🏗️ Builder</a>
      <a href="#" onclick="showToast('قريبًا: Analytics')">📊 Analytics</a>
      <a href="#" onclick="showToast('قريبًا: Settings')">⚙️ Settings</a>
    </div>
    <hr style="border-color:#1e293b;margin:22px 0">
    <div class="muted">Projects: \${total}</div>
    <div class="muted">PWA: \${pwaCount}</div>
  </aside>

  <main class="main">
    <section class="hero">
      <h1>لوحة التحكم الاحترافية</h1>
      <p>عدّل، عاين، حمّل ZIP، وجهّز APK من مكان واحد.</p>
    </section>

    <section class="stats">
      <div class="stat"><span class="muted">كل المشاريع</span><strong>\${total}</strong></div>
      <div class="stat"><span class="muted">Websites</span><strong>\${websiteCount}</strong></div>
      <div class="stat"><span class="muted">PWA Ready</span><strong>\${pwaCount}</strong></div>
    </section>

    <div class="toolbar">
      <h2>المشاريع</h2>
      <input class="search" id="search" placeholder="ابحث عن مشروع..." oninput="filterProjects()">
    </div>

    \${projects.length ? \`
    <div class="grid" id="projectGrid">
      \${projects.map(p => \`
        <div class="card" data-name="\${p.name.toLowerCase()}">
          <div class="card-head">
            <div>
              <h3>\${p.name}</h3>
              <div class="muted">\${p.isPwa ? "🔥 PWA جاهز" : "🌐 موقع عادي"}</div>
            </div>
            <span class="pill \${p.isPwa ? "green" : "orange"}">\${p.isPwa ? "PWA" : "WEB"}</span>
          </div>

          <div class="meta">
            <span class="pill">\${p.sizeKB} KB</span>
            <span class="pill">\${p.hasIndex ? "HTML" : "No HTML"}</span>
            <span class="pill">\${p.hasCss ? "CSS" : "No CSS"}</span>
            <span class="pill">\${p.hasJs ? "JS" : "No JS"}</span>
          </div>

          <div class="actions">
            <a class="btn blue" href="/edit/\${p.name}">✏️ تعديل</a>
            <button class="btn dark" onclick="openPreview('\${p.name}')">👁️ معاينة</button>
            <a class="btn green" href="/export/\${p.name}">⬇️ ZIP</a>
            <a class="btn purple" href="/apk/\${p.name}">📱 APK</a>
            <form method="POST" action="/delete/\${p.name}" onsubmit="return confirm('حذف المشروع \${p.name}؟')" class="full">
              <button class="btn red full" type="submit">🗑️ حذف المشروع</button>
            </form>
          </div>
        </div>
      \`).join("")}
    </div>
    \` : \`
    <div class="empty">لا توجد مشاريع بعد.</div>
    \`}
  </main>
</div>

<div class="modal" id="previewModal">
  <div class="modal-bar">
    <strong id="previewTitle">Preview</strong>
    <button class="close" onclick="closePreview()">إغلاق</button>
  </div>
  <iframe id="previewFrame"></iframe>
</div>

<div class="toast" id="toast"></div>

<script>
function filterProjects(){
  const q = document.getElementById("search").value.toLowerCase();
  document.querySelectorAll(".card").forEach(card => {
    card.style.display = card.dataset.name.includes(q) ? "" : "none";
  });
}
function openPreview(name){
  document.getElementById("previewTitle").textContent = "Preview: " + name;
  document.getElementById("previewFrame").src = "/workspace/" + name + "/index.html";
  document.getElementById("previewModal").style.display = "block";
}
function closePreview(){
  document.getElementById("previewFrame").src = "";
  document.getElementById("previewModal").style.display = "none";
}
function showToast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.display = "block";
  setTimeout(() => t.style.display = "none", 2200);
}
</script>
</body>
</html>
\`);
});

app.post("/delete/:name", (req, res) => {
  const name = safeProjectName(req.params.name);
  if (!name) return res.status(400).send("Invalid project name");

  const dir = path.join(__dirname, "workspace", name);
  if (!fs.existsSync(dir)) return res.status(404).send("Project not found");

  fs.rmSync(dir, { recursive: true, force: true });
  res.redirect("/dashboard");
});

app.get("/apk/:name", (req, res) => {
  const name = safeProjectName(req.params.name);
  res.send(\`
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>APK Builder</title>
<style>
body{font-family:Arial;background:#070b16;color:white;display:grid;place-items:center;min-height:100vh;margin:0}
.box{background:#111827;border:1px solid #334155;border-radius:24px;padding:28px;max-width:520px}
a{color:white;background:#2563eb;padding:12px 16px;border-radius:12px;text-decoration:none;display:inline-block;margin-top:14px}
</style>
</head>
<body>
<div class="box">
<h1>📱 APK Builder</h1>
<p>المشروع: <b>\${name}</b></p>
<p>هذه صفحة جاهزة للربط لاحقًا مع Capacitor لتحويل الموقع إلى APK.</p>
<a href="/dashboard">رجوع للوحة التحكم</a>
</div>
</body>
</html>
\`);
});

// ===============================
// END PRO DASHBOARD
// ===============================
`;

code = code.replace(/app\.listen\s*\(/, block + "\napp.listen(");

fs.writeFileSync(file, code);
console.log("✅ Dashboard upgraded to Pro V3");
