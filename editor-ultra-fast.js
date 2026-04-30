const fs = require("fs");
const file = "cloud.js";
let code = fs.readFileSync(file, "utf8");

// احذف Editor Pro القديم
code = code.replace(
  /\/\/ ===============================\n\/\/ EDITOR PRO[\s\S]*?\/\/ ===============================\n\/\/ END EDITOR PRO\n/g,
  ""
);

const editor = `
// ===============================
// EDITOR ULTRA FAST
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

  if (!fs.existsSync(dir)) return res.status(404).send("Project not found");

  res.send(\`
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ultra Fast Editor - \${name}</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#070b16;color:#e5e7eb;font-family:Arial}
.top{position:sticky;top:0;z-index:5;background:#020617;border-bottom:1px solid #1e293b;padding:12px;display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.title{font-weight:900}
.btn{border:0;border-radius:10px;padding:9px 12px;color:white;background:#2563eb;text-decoration:none;cursor:pointer}
.green{background:#16a34a}.dark{background:#334155}.purple{background:#7c3aed}.red{background:#dc2626}
.tabs{display:flex;background:#0f172a;border-bottom:1px solid #1e293b}
.tab{padding:12px 16px;cursor:pointer;border-left:1px solid #1e293b}
.tab.active{background:#2563eb}
.wrap{height:calc(100vh - 102px)}
.panel{display:none;height:100%}
.panel.active{display:block}
textarea{width:100%;height:100%;resize:none;border:0;outline:0;background:#020617;color:#e5e7eb;padding:14px;font-family:monospace;font-size:13px;line-height:1.5;direction:ltr;text-align:left}
.status{color:#94a3b8;font-size:13px}
#previewBox{display:none;position:fixed;inset:0;background:#000d;z-index:20}
#previewTop{height:52px;background:#020617;border-bottom:1px solid #1e293b;display:flex;justify-content:space-between;align-items:center;padding:0 12px}
#previewFrame{width:100%;height:calc(100vh - 52px);border:0;background:white}
</style>
</head>
<body>
<div class="top">
  <div>
    <div class="title">⚡ Ultra Fast Editor</div>
    <div class="status">Project: \${name} · Preview يدوي لتقليل البطء</div>
  </div>
  <div>
    <button class="btn green" onclick="saveAll()">💾 حفظ</button>
    <button class="btn dark" onclick="openPreview()">👁️ معاينة</button>
    <button class="btn purple" onclick="aiImprove()">🤖 AI</button>
    <a class="btn" href="/export/\${name}">ZIP</a>
    <a class="btn dark" href="/dashboard">رجوع</a>
  </div>
</div>

<div class="tabs">
  <div class="tab active" onclick="showTab(event,'html')">HTML</div>
  <div class="tab" onclick="showTab(event,'css')">CSS</div>
  <div class="tab" onclick="showTab(event,'js')">JS</div>
</div>

<div class="wrap">
  <div class="panel active" id="panel-html"><textarea id="html" spellcheck="false">\${escapeHtml(readProjectFile(name, "index.html"))}</textarea></div>
  <div class="panel" id="panel-css"><textarea id="css" spellcheck="false">\${escapeHtml(readProjectFile(name, "style.css"))}</textarea></div>
  <div class="panel" id="panel-js"><textarea id="js" spellcheck="false">\${escapeHtml(readProjectFile(name, "app.js"))}</textarea></div>
</div>

<div id="previewBox">
  <div id="previewTop">
    <b>Preview: \${name}</b>
    <button class="btn red" onclick="closePreview()">إغلاق</button>
  </div>
  <iframe id="previewFrame"></iframe>
</div>

<script>
const projectName = "\${name}";
let dirty = false;

document.querySelectorAll("textarea").forEach(t => {
  t.addEventListener("input", () => dirty = true);
});

function showTab(e, tab){
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".panel").forEach(x=>x.classList.remove("active"));
  e.target.classList.add("active");
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
    dirty = false;
    alert("✅ تم الحفظ بسرعة");
  } else {
    alert("❌ " + data.error);
  }
}

async function openPreview(){
  if(dirty) await saveAll();
  const box = document.getElementById("previewBox");
  const frame = document.getElementById("previewFrame");
  frame.src = "/workspace/" + projectName + "/index.html?v=" + Date.now();
  box.style.display = "block";
}

function closePreview(){
  document.getElementById("previewFrame").src = "about:blank";
  document.getElementById("previewBox").style.display = "none";
}

async function aiImprove(){
  const res = await fetch("/improve/" + projectName, { method:"POST" });
  const data = await res.json();
  if(data.ok){
    alert("🤖 تم التحسين");
    location.href = "/edit/" + projectName + "?v=" + Date.now();
  } else {
    alert("❌ " + data.error);
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
    if (!fs.existsSync(dir)) return res.status(404).json({ ok:false, error:"Project not found" });

    fs.writeFileSync(path.join(dir, "index.html"), req.body.html || "", "utf8");
    fs.writeFileSync(path.join(dir, "style.css"), req.body.css || "", "utf8");
    fs.writeFileSync(path.join(dir, "app.js"), req.body.js || "", "utf8");

    res.json({ ok:true });
  } catch (err) {
    res.status(500).json({ ok:false, error:err.message });
  }
});
// ===============================
// END EDITOR ULTRA FAST
// ===============================
`;

code = code.replace(/app\.listen\s*\(/, editor + "\napp.listen(");

fs.writeFileSync(file, code);
console.log("✅ Ultra Fast Editor installed");
