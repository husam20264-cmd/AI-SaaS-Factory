const fs = require("fs");

const file = "cloud.js";
let code = fs.readFileSync(file, "utf8");

// تأكد من middlewares/static
if (!code.includes('app.use("/workspace"')) {
  code = code.replace(
    /(const app\s*=\s*express\(\);?)/,
    `$1
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.json({ limit: "50mb" }));
app.use("/workspace", express.static(path.join(__dirname, "workspace")));`
  );
}

// حذف داشبورد قديم
code = code.replace(
  /\/\/ ===============================\n\/\/ PRO DASHBOARD[\s\S]*?\/\/ ===============================\n\/\/ END PRO DASHBOARD\n/g,
  ""
);

// حذف route حذف قديم لو موجود
code = code.replace(
  /app\.post\(["']\/delete\/:name["'][\s\S]*?\n\}\);\s*/g,
  ""
);

const block = `
// ===============================
// PRO DASHBOARD V2
// ===============================

function safeProjectName(name) {
  return String(name || "").replace(/[^a-zA-Z0-9_-]/g, "");
}

function getProjectInfo(name) {
  const projectDir = path.join(__dirname, "workspace", name);
  const indexPath = path.join(projectDir, "index.html");
  const cssPath = path.join(projectDir, "style.css");
  const jsPath = path.join(projectDir, "app.js");
  const manifestPath = path.join(projectDir, "manifest.json");
  const swPath = path.join(projectDir, "sw.js");

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

  const updated = fs.statSync(projectDir).mtime;

  return {
    name,
    hasIndex: fs.existsSync(indexPath),
    hasCss: fs.existsSync(cssPath),
    hasJs: fs.existsSync(jsPath),
    isPwa: fs.existsSync(manifestPath) && fs.existsSync(swPath),
    sizeKB: Math.max(1, Math.round(size / 1024)),
    updated
  };
}

app.get("/dashboard", (req, res) => {
  const workspace = path.join(__dirname, "workspace");
  if (!fs.existsSync(workspace)) fs.mkdirSync(workspace);

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
<title>AI SaaS Factory Dashboard</title>
<style>
:root{
  --bg:#070b16;
  --panel:#0f172a;
  --panel2:#111827;
  --text:#e5e7eb;
  --muted:#94a3b8;
  --line:#1e293b;
  --blue:#2563eb;
  --green:#16a34a;
  --red:#dc2626;
  --yellow:#f59e0b;
  --purple:#7c3aed;
}
*{box-sizing:border-box}
body{
  margin:0;
  font-family:Arial, sans-serif;
  background:
    radial-gradient(circle at top left, rgba(37,99,235,.22), transparent 35%),
    radial-gradient(circle at top right, rgba(124,58,237,.18), transparent 30%),
    var(--bg);
  color:var(--text);
}
.layout{display:grid;grid-template-columns:280px 1fr;min-height:100vh}
.sidebar{
  background:rgba(2,6,23,.88);
  backdrop-filter:blur(16px);
  border-left:1px solid var(--line);
  padding:24px;
  position:sticky;
  top:0;
  height:100vh;
}
.logo{font-size:24px;font-weight:900;margin-bottom:8px}
.muted{color:var(--muted);font-size:14px}
.nav{margin-top:28px;display:grid;gap:10px}
.nav a{
  color:var(--text);
  text-decoration:none;
  padding:12px 14px;
  border-radius:14px;
  background:#0f172a;
  border:1px solid #1e293b;
}
.nav a.active{background:linear-gradient(135deg,var(--blue),var(--purple))}
.main{padding:28px}
.hero{
  background:linear-gradient(135deg, rgba(37,99,235,.95), rgba(124,58,237,.95));
  padding:28px;
  border-radius:26px;
  box-shadow:0 20px 60px #0007;
  margin-bottom:22px;
}
.hero h1{margin:0 0 10px;font-size:34px}
.hero p{margin:0;color:#dbeafe}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:22px}
.stat{
  background:rgba(15,23,42,.82);
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
  max-width:420px;
  background:#0f172a;
  color:white;
  border:1px solid var(--line);
  border-radius:14px;
  padding:13px 14px;
  outline:none;
}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:18px}
.card{
  background:rgba(17,24,39,.88);
  border:1px solid #263449;
  border-radius:22px;
  padding:18px;
  box-shadow:0 14px 40px #0006;
}
.card-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.card h3{margin:0 0 8px;font-size:20px;word-break:break-word}
.pill{
  display:inline-flex;
  padding:6px 9px;
  border-radius:999px;
  font-size:12px;
  background:#1e293b;
  color:#cbd5e1;
}
.pill.green{background:rgba(22,163,74,.18);color:#86efac}
.pill.yellow{background:rgba(245,158,11,.18);color:#fde68a}
.meta{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
.actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:16px}
.btn,button.btn{
  border:0;
  cursor:pointer;
  text-align:center;
  padding:11px 12px;
  border-radius:13px;
  text-decoration:none;
  color:white;
  background:var(--blue);
  font-size:14px;
}
.btn.dark{background:#334155}
.btn.green{background:var(--green)}
.btn.red{background:var(--red)}
.btn.full{grid-column:1/-1}
.empty{
  padding:50px;
  background:rgba(17,24,39,.85);
  border:1px dashed #334155;
  border-radius:22px;
  text-align:center;
  color:var(--muted);
}
.footer{margin-top:26px;color:var(--muted);font-size:13px;text-align:center}
@media(max-width:800px){
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
    <div class="logo">🚀 SaaS Factory</div>
    <div class="muted">Production MVP Dashboard</div>
    <div class="nav">
      <a class="active" href="/dashboard">📁 المشاريع</a>
      <a href="/">🏗️ Builder</a>
      <a href="/dashboard">📊 Analytics</a>
    </div>
  </aside>

  <main class="main">
    <section class="hero">
      <h1>لوحة التحكم الاحترافية</h1>
      <p>إدارة، تعديل، معاينة، وتحميل مشاريعك من مكان واحد.</p>
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
                <div class="muted">آخر تعديل: \${p.updated.toLocaleString("ar")}</div>
              </div>
              <span class="pill \${p.isPwa ? "green" : "yellow"}">\${p.isPwa ? "PWA" : "Web"}</span>
            </div>

            <div class="meta">
              <span class="pill">\${p.sizeKB} KB</span>
              <span class="pill">\${p.hasIndex ? "index.html" : "no index"}</span>
              <span class="pill">\${p.hasCss ? "CSS" : "no CSS"}</span>
              <span class="pill">\${p.hasJs ? "JS" : "no JS"}</span>
            </div>

            <div class="actions">
              <a class="btn" href="/edit/\${p.name}">✏️ تعديل</a>
              <a class="btn dark" href="/workspace/\${p.name}/index.html" target="_blank">👁️ معاينة</a>
              <a class="btn green full" href="/export/\${p.name}">⬇️ تحميل ZIP</a>
              <form method="POST" action="/delete/\${p.name}" onsubmit="return confirm('حذف المشروع \${p.name}؟')" class="full">
                <button class="btn red full" type="submit">🗑️ حذف المشروع</button>
              </form>
            </div>
          </div>
        \`).join("")}
      </div>
    \` : \`
      <div class="empty">لا توجد مشاريع بعد. أنشئ أول مشروع من صفحة Builder.</div>
    \`}

    <div class="footer">AI SaaS Factory · Local MVP · Termux Ready</div>
  </main>
</div>

<script>
function filterProjects(){
  const q = document.getElementById("search").value.toLowerCase();
  document.querySelectorAll(".card").forEach(card => {
    card.style.display = card.dataset.name.includes(q) ? "" : "none";
  });
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

  if (!fs.existsSync(dir)) {
    return res.status(404).send("Project not found");
  }

  fs.rmSync(dir, { recursive: true, force: true });
  res.redirect("/dashboard");
});

// ===============================
// END PRO DASHBOARD
// ===============================
`;

if (!code.includes("PRO DASHBOARD V2")) {
  code = code.replace(/app\.listen\s*\(/, block + "\napp.listen(");
}

fs.writeFileSync(file, code);
console.log("✅ Dashboard V2 installed");
