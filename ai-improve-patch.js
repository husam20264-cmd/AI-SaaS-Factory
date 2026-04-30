const fs = require("fs");
const file = "cloud.js";
let code = fs.readFileSync(file, "utf8");

// حذف route قديم إن وجد
code = code.replace(/app\.post\(["']\/improve\/:name["'][\s\S]*?\n\}\);\s*/g, "");

// Route تحسين تلقائي بسيط وآمن
const improveRoute = `
// ===============================
// AI Auto Improve Project
// ===============================
app.post("/improve/:name", async (req, res) => {
  try {
    const name = safeProjectName ? safeProjectName(req.params.name) : String(req.params.name).replace(/[^a-zA-Z0-9_-]/g, "");
    const dir = path.join(__dirname, "workspace", name);
    const htmlPath = path.join(dir, "index.html");
    const cssPath = path.join(dir, "style.css");

    if (!fs.existsSync(htmlPath)) {
      return res.status(404).json({ ok: false, error: "index.html not found" });
    }

    let html = fs.readFileSync(htmlPath, "utf8");

    html = html
      .replace(/انضم إلى مجتمع المتطوعين/g, "🚀 منصة احترافية لإدارة العمل بسهولة")
      .replace(/سجل الآن/g, "ابدأ الآن مجانًا 🚀")
      .replace(/ابدأ الآن/g, "ابدأ الآن مجانًا 🚀")
      .replace(/تواصل معنا/g, "تواصل معنا الآن")
      .replace(/منصة التطوع/g, "منصة العمل الذكية");

    if (!html.includes("تم تحسين هذا الموقع تلقائيًا")) {
      html = html.replace(
        "</body>",
        '<div style="position:fixed;bottom:15px;right:15px;background:#111;color:#fff;padding:10px 14px;border-radius:999px;font-size:12px;z-index:9999">🤖 تم تحسين هذا الموقع تلقائيًا</div></body>'
      );
    }

    fs.writeFileSync(htmlPath, html, "utf8");

    if (fs.existsSync(cssPath)) {
      let css = fs.readFileSync(cssPath, "utf8");

      if (!css.includes("AI_AUTO_IMPROVE")) {
        css += \`

/* AI_AUTO_IMPROVE */
body {
  scroll-behavior: smooth;
}

button, .btn, a {
  transition: all .25s ease;
}

button:hover, .btn:hover, a:hover {
  transform: translateY(-2px);
  filter: brightness(1.08);
}

section {
  animation: fadeInUp .6s ease both;
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(18px); }
  to { opacity: 1; transform: translateY(0); }
}
\`;
      }

      fs.writeFileSync(cssPath, css, "utf8");
    }

    res.json({
      ok: true,
      project: name,
      message: "Project improved successfully",
      updatedAt: new Date().toISOString()
    });

  } catch (err) {
    console.error("Improve error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});
`;

if (!code.includes('app.post("/improve/:name"')) {
  code = code.replace(/app\.listen\s*\(/, improveRoute + "\napp.listen(");
}

// أضف زر AI داخل الكروت بعد زر APK
if (!code.includes("🤖 تحسين تلقائي")) {
  code = code.replace(
    /<a class="btn purple" href="\/apk\/\$\{p\.name\}">📱 APK<\/a>/g,
    `<a class="btn purple" href="/apk/\${p.name}">📱 APK</a>
<button class="btn orange" onclick="improveProject('\${p.name}')">🤖 تحسين تلقائي</button>`
  );
}

// أضف آخر تعديل داخل الكارت إذا لم يكن موجود
if (!code.includes("آخر تعديل")) {
  code = code.replace(
    /<div class="muted">\\\$\{p\.isPwa \? "🔥 PWA جاهز" : "🌐 موقع عادي"\}<\/div>/g,
    `<div class="muted">\${p.isPwa ? "🔥 PWA جاهز" : "🌐 موقع عادي"}</div>
<div class="muted">🕒 آخر تعديل: \${p.updated.toLocaleString("ar")}</div>`
  );
}

// أضف JS function
if (!code.includes("function improveProject")) {
  code = code.replace(
    /function showToast\(msg\)\{[\s\S]*?\n\}/,
    `function showToast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.display = "block";
  setTimeout(() => t.style.display = "none", 2200);
}

async function improveProject(name){
  showToast("🤖 جاري تحسين المشروع...");
  const res = await fetch("/improve/" + name, { method: "POST" });
  const data = await res.json();

  if(data.ok){
    showToast("✅ تم تحسين المشروع");
    setTimeout(() => location.reload(), 900);
  } else {
    showToast("❌ فشل التحسين: " + (data.error || "unknown"));
  }
}`
  );
}

fs.writeFileSync(file, code);
console.log("✅ AI Auto Improve + Last Modified added");
