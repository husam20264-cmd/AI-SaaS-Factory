const fs = require("fs");
const file = "cloud.js";
let code = fs.readFileSync(file, "utf8");

if (!code.includes("express.static")) {
  code = code.replace(
    /(const app\s*=\s*express\(\);?)/,
    `$1
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(express.json({ limit: "20mb" }));
app.use("/workspace", express.static(path.join(__dirname, "workspace")));`
  );
}

code = code.replace(/app\.get\(["']\/dashboard["'][\s\S]*?\n\}\);\s*/g, "");

const dashboard = `
// ===============================
// PRO DASHBOARD
// ===============================
app.get("/dashboard", (req, res) => {
  const workspace = path.join(__dirname, "workspace");
  if (!fs.existsSync(workspace)) fs.mkdirSync(workspace);

  const projects = fs.readdirSync(workspace)
    .filter(name => fs.statSync(path.join(workspace, name)).isDirectory())
    .map(name => {
      const p = path.join(workspace, name);
      const hasIndex = fs.existsSync(path.join(p, "index.html"));
      return { name, hasIndex };
    });

  res.send(\`
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI SaaS Factory Pro</title>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:Arial;background:#0f172a;color:#e5e7eb}
.layout{display:grid;grid-template-columns:260px 1fr;min-height:100vh}
.sidebar{background:#020617;padding:24px;border-left:1px solid #1e293b}
.logo{font-size:22px;font-weight:800;margin-bottom:8px}
.muted{color:#94a3b8;font-size:14px}
.main{padding:28px}
.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}
.badge{background:#16a34a;color:white;padding:8px 12px;border-radius:999px;font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:18px}
.card{background:#111827;border:1px solid #243244;border-radius:18px;padding:18px;box-shadow:0 10px 30px #0005}
.card h3{margin:0 0 8px}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
a.btn{padding:10px 12px;border-radius:10px;text-decoration:none;color:white;background:#2563eb;font-size:14px}
a.btn.dark{background:#334155}
a.btn.green{background:#16a34a}
a.btn.red{background:#dc2626}
.empty{padding:40px;background:#111827;border-radius:18px;text-align:center;color:#94a3b8}
.hero{background:linear-gradient(135deg,#2563eb,#7c3aed);padding:24px;border-radius:22px;margin-bottom:22px}
.hero h1{margin:0 0 8px;font-size:30px}
@media(max-width:700px){.layout{grid-template-columns:1fr}.sidebar{border-left:0;border-bottom:1px solid #1e293b}}
</style>
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <div class="logo">🚀 SaaS Factory</div>
    <div class="muted">Pro Dashboard</div>
    <hr style="border-color:#1e293b;margin:20px 0">
    <div class="muted">Projects: \${projects.length}</div>
  </aside>

  <main class="main">
    <div class="hero">
      <h1>لوحة إدارة المشاريع</h1>
      <p>عدّل، عاين، وحمّل مشاريعك من مكان واحد.</p>
    </div>

    <div class="top">
      <h2>المشاريع</h2>
      <span class="badge">System Online</span>
    </div>

    \${projects.length ? \`
    <div class="grid">
      \${projects.map(p => \`
        <div class="card">
          <h3>\${p.name}</h3>
          <p class="muted">\${p.hasIndex ? "Website project جاهز" : "Project folder"}</p>
          <div class="actions">
            <a class="btn" href="/edit/\${p.name}">تعديل</a>
            <a class="btn dark" href="/workspace/\${p.name}/index.html" target="_blank">معاينة</a>
            <a class="btn green" href="/export/\${p.name}">تحميل ZIP</a>
          </div>
        </div>
      \`).join("")}
    </div>\` : \`<div class="empty">لا توجد مشاريع بعد</div>\`}
  </main>
</div>
</body>
</html>
\`);
});
`;

if (!code.includes('app.get("/dashboard"')) {
  code = code.replace(/app\.listen\s*\(/, dashboard + "\napp.listen(");
}

fs.writeFileSync(file, code);
console.log("✅ Pro Dashboard added: /dashboard");
