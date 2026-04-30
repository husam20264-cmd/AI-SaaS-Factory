const fs = require("fs");
const file = "cloud.js";
let code = fs.readFileSync(file, "utf8");

// حذف edit routes القديمة
code = code.replace(/app\.get\(["']\/edit\/:name["'][\s\S]*?\n\}\);\s*/g, "");
code = code.replace(/app\.post\(["']\/edit\/:name["'][\s\S]*?\n\}\);\s*/g, "");

// تأكد من body parsers
if (!code.includes("express.urlencoded")) {
  code = code.replace(
    /(const app\s*=\s*express\(\);?)/,
    `$1
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.json({ limit: "50mb" }));`
  );
}

const editor = `
// ===============================
// EDITOR PRO
// ===============================
function readProjectFile(projectName, filename) {
  const filePath = path.join(__dirname, "workspace", projectName, filename);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

app.get("/edit/:name", (req, res) => {
  const name = safeProjectName ? safeProjectName(req.params.name) : String(req.params.name).replace(/[^a-zA-Z0-9_-]/g, "");
  const dir = path.join(__dirname, "workspace", name);

  if (!fs.existsSync(dir)) {
    return res.status(404).send("Project not found");
  }

  const html = escapeHtml(readProjectFile(name, "index.html"));
  const css = escapeHtml(readProjectFile(name, "style.css"));
  const js = escapeHtml(readProjectFile(name, "app.js"));

  res.send(\`
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Editor Pro - \${name}</title>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:Arial;background:#070b16;color:#e5e7eb}
.top{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;background:#020617;border-bottom:1px solid #1e293b;position:sticky;top:0;z-index:10}
.brand{font-weight:900;font-size:20px}
.actions{display:flex;gap:8px;flex-wrap:wrap}
.btn{border:0;border-radius:12px;padding:10px 14px;color:white;text-decoration:none;cursor:pointer;background:#2563eb}
.green{background:#16a34a}.dark{background:#334155}.purple{background:linear-gradient(135deg,#7c3aed,#2563eb)}.red{background:#dc2626}
.layout{display:grid;grid-template-columns:1fr 45%;height:calc(100vh - 66px)}
.editor{border-left:1px solid #1e293b;display:flex;flex-direction:column;min-width:0}
.tabs{display:flex;background:#0f172a;border-bottom:1px solid #1e293b}
.tab{padding:13px 18px;cursor:pointer;border-left:1px solid #1e293b}
.tab.active{background:#2563eb}
textarea{width:100%;height:100%;resize:none;background:#020617;color:#e5e7eb;border:0;padding:16px;font-family:monospace;font-size:13px;line-height:1.55;outline:0;direction:ltr;text-align:left}
.panel{display:none;flex:1}
.panel.active{display:flex}
.preview{background:white}
iframe{width:100%;height:100%;border:0;background:white}
.status{font-size:13px;color:#94a3b8;margin-inline-start:10px}
@media(max-width:900px){.layout{grid-template-columns:1fr;height:auto}.preview{height:70vh}.editor{height:70vh}}
</style>
</head>
<body>
<div class="top">
  <div>
    <div class="brand">✏️ Editor Pro</div>
    <div class="status">Project: \${name} · HTML/CSS/JS</div>
  </div>
  <div class="actions">
    <button class="btn green" onclick="saveAll()">💾 حفظ</button>
    <button class="btn purple" onclick="aiImprove()">🤖 تحسين AI</button>
    <button class="btn dark" onclick="reloadPreview()">👁️ تحديث المعاينة</button>
    <a class="btn" href="/export/\${name}">⬇️ ZIP</a>
    <a class="btn dark" href="/dashboard">رجوع</a>
  </div>
</div>

<div class="layout">
  <section class="editor">
    <div class="tabs">
      <div class="tab active" onclick="showTab('html')">index.html</div>
      <div class="tab" onclick="showTab('css')">style.css</div>
      <div class="tab" onclick="showTab('js')">app.js</div>
    </div>

    <div class="panel active" id="panel-html">
      <textarea id="html">\${html}</textarea>
    </div>
    <div class="panel" id="panel-css">
      <textarea id="css">\${css}</textarea>
    </div>
    <div class="panel" id="panel-js">
      <textarea id="js">\${js}</textarea>
    </div>
  </section>

  <section class="preview">
    <iframe id="preview" src="/workspace/\${name}/index.html?v=\${Date.now()}"></iframe>
  </section>
</div>

<script>
const projectName = "\${name}";

function showTab(tab){
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".panel").forEach(x=>x.classList.remove("active"));
  event.target.classList.add("active");
  document.getElementById("panel-" + tab).classList.add("active");
}

async function saveAll(){
  const payload = {
    html: document.getElementById("html").value,
    css: document.getElementById("css").value,
    js: document.getElementById("js").value
  };

  const res = await fetch("/edit/" + projectName, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if(data.ok){
    alert("✅ تم الحفظ");
    reloadPreview();
  } else {
    alert("❌ فشل الحفظ: " + data.error);
  }
}

function reloadPreview(){
  document.getElementById("preview").src = "/workspace/" + projectName + "/index.html?v=" + Date.now();
}

async function aiImprove(){
  const res = await fetch("/improve/" + projectName, { method:"POST" });
  const data = await res.json();
  if(data.ok){
    alert("🤖 تم التحسين");
    location.reload();
  } else {
    alert("❌ فشل التحسين: " + data.error);
  }
}
</script>
</body>
</html>
\`);
});

app.post("/edit/:name", (req, res) => {
  try {
    const name = safeProjectName ? safeProjectName(req.params.name) : String(req.params.name).replace(/[^a-zA-Z0-9_-]/g, "");
    const dir = path.join(__dirname, "workspace", name);

    if (!fs.existsSync(dir)) {
      return res.status(404).json({ ok:false, error:"Project not found" });
    }

    fs.writeFileSync(path.join(dir, "index.html"), req.body.html || "", "utf8");
    fs.writeFileSync(path.join(dir, "style.css"), req.body.css || "", "utf8");
    fs.writeFileSync(path.join(dir, "app.js"), req.body.js || "", "utf8");

    res.json({ ok:true, project:name, updatedAt:new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok:false, error:err.message });
  }
});

// ===============================
// END EDITOR PRO
// ===============================
`;

code = code.replace(/app\.listen\s*\(/, editor + "\napp.listen(");

fs.writeFileSync(file, code);
console.log("✅ Editor Pro installed");
