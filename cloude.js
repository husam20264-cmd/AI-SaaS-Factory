require("dotenv").config();

const express = require("express");
const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const pLimit = require("p-limit").default;

const app = express();
const PORT = 5000;

// --- إعدادات الأمان (مع تعطيل CSP للـ Dashboard) ---
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "طلبات كثيرة جداً، حاول لاحقاً" }
});
app.use(limiter);

// --- مفتاح OpenRouter ---
const API_KEY = process.env.OPENROUTER_API_KEY;
if (!API_KEY || !API_KEY.startsWith("sk-or-")) {
  console.error("❌ OPENROUTER_API_KEY غير موجود أو لا يبدأ بـ sk-or- في ملف .env");
  process.exit(1);
}

// --- إعدادات النموذج المحلي (llama.cpp server) ---
const LOCAL_AI_URL = process.env.LOCAL_AI_URL || "http://127.0.0.1:8080/v1/chat/completions";
const LOCAL_AI_MODEL = process.env.LOCAL_AI_MODEL || "qwen2.5-coder-1.5b";
const LOCAL_AI_TIMEOUT = parseInt(process.env.LOCAL_AI_TIMEOUT) || 8000;
const SMART_SPLIT = process.env.SMART_SPLIT !== "false";

// --- المسارات الرئيسية ---
const WORKSPACE = path.join(__dirname, "workspace");
const MOBILE_APPS = path.join(__dirname, "mobile_apps");
const AGENTS = path.join(__dirname, "agents");
fs.ensureDirSync(WORKSPACE);
fs.ensureDirSync(MOBILE_APPS);
fs.ensureDirSync(AGENTS);

// --- خدمة preview مع فحص المسار ---
app.use("/preview", (req, res, next) => {
  const safePath = path.normalize(req.path).replace(/^(\.\.[\/\\])+/, "");
  const fullPath = path.resolve(WORKSPACE, safePath);
  if (!fullPath.startsWith(path.resolve(WORKSPACE) + path.sep)) {
    return res.status(403).send("ممنوع");
  }
  express.static(WORKSPACE)(req, res, next);
});

// --- ذاكرة مؤقتة LRU ---
const cache = new Map();
const CACHE_MAX_SIZE = 200;

function setCache(key, value) {
  if (cache.size >= CACHE_MAX_SIZE) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, value);
}

// --- قائمة انتظار (max 2 parallel AI calls) ---
const limit = pLimit(2);

// --- ملفات بسيطة تُوجّه للنموذج المحلي ---
const SIMPLE_FILES = new Set(["manifest.json", "sw.js", "README.md", "package.json"]);
function isSimpleFile(fileName) { return SIMPLE_FILES.has(fileName); }

// ========== القائمة الصارمة للنماذج المجانية (تنتهي بـ :free) ==========
const FREE_MODELS = [
  "openai/gpt-oss-120b:free",
  "qwen/qwen3-coder-480b:free",
  "nvidia/nemotron-3-super:free",
  "z-ai/glm-4.5-air:free",
  "deepseek/deepseek-r1:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "nvidia/nemotron-nano-30b:free",
  "openai/gpt-oss-20b:free",
  "nvidia/nemotron-nano-9b-v2:free",
  "google/gemma-3:free"
];

// ========== دالة AI الأساسية (نماذج مجانية حقيقية) ==========
async function ai(prompt, preferLocal = false) {
  const cacheKey = prompt;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  // 1. محاولة النموذج المحلي إذا طلب ذلك
  if (preferLocal && SMART_SPLIT) {
    try {
      console.log("🏠 محاولة النموذج المحلي...");
      const res = await axios.post(LOCAL_AI_URL, {
        model: LOCAL_AI_MODEL,
        messages: [
          { role: "system", content: "You are a strict JSON generator." },
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 1000
      }, { timeout: LOCAL_AI_TIMEOUT });
      const output = res.data.choices[0].message.content;
      if (output) {
        console.log("✅ تم استخدام المحلي");
        setCache(cacheKey, output);
        return output;
      }
    } catch (err) {
      console.log("⚠️ فشل المحلي:", err.code || err.message);
    }
  }

  // 2. النماذج المجانية عبر OpenRouter
  console.log("☁️ استخدام OpenRouter (نماذج :free)...");

  for (const model of FREE_MODELS) {
    try {
      console.log(`🧠 نموذج: ${model}`);
      const res = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model,
          temperature: 0.1,
          max_tokens: 3500,
          messages: [
            { role: "system", content: "You are a strict software generator. Return exactly what is asked. No markdown. No explanation." },
            { role: "user", content: prompt }
          ]
        },
        {
          timeout: 45000,
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost",
            "X-Title": "AI Dev Platform",
            "User-Agent": "ai-cli/1.0"
          }
        }
      );
      const output = res.data.choices[0].message.content;
      console.log(`✅ نجح ${model}`);
      setCache(cacheKey, output);
      return output;
    } catch (err) {
      console.log(`❌ فشل ${model}: ${err.message}`);
      if (err.response) {
        console.log("📬 تفاصيل OpenRouter:", JSON.stringify(err.response.data, null, 2));
      }
      if (err.response && err.response.status === 402) {
        console.log("💸 خطأ في المفتاح أو الرصيد. توقف عن المحاولة.");
        break;
      }
    }
  }

  throw new Error("فشلت جميع النماذج المجانية. تأكد من مفتاح API واتصال الإنترنت.");
}

// --- استخراج JSON مع إعادة محاولة واحدة ---
async function safeJSONWithRetry(text, fallbackPrompt) {
  const tryParse = (t) => {
    try { return JSON.parse(t); } catch {}
    const match = t.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]); } catch { return null; }
  };

  let result = tryParse(text);
  if (result) return result;

  console.log("⚠️ JSON غير صالح، إعادة المحاولة مع النص الخام...");
  const retryRes = await ai(fallbackPrompt + "\n\nBroken response:\n" + text, false);
  return tryParse(retryRes) || null;
}

// --- توليد الملفات مع التقييم الذاتي ---
async function generateFiles(task, type) {
  console.log("📋 استخراج قائمة الملفات (محلي)...");
  const step1Prompt = `You are a senior architect. Given this ${type} project, list ONLY file names needed.
Description: ${task}

Return valid JSON array of strings. No markdown. Example: ["index.html","style.css","app.js"]`;

  let fileList;
  const rawList = await ai(step1Prompt, true);
  try {
    fileList = JSON.parse(rawList);
    if (!Array.isArray(fileList)) throw new Error("Not array");
  } catch {
    console.log("⚠️ فشلت قائمة الملفات المحلية، إعادة المحاولة عبر OpenRouter...");
    const cloudList = await ai(step1Prompt, false);
    const match = cloudList.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("لم يتم العثور على قائمة ملفات");
    try {
      fileList = JSON.parse(match[0]);
      if (!Array.isArray(fileList)) throw new Error("Not array");
    } catch {
      throw new Error("قائمة الملفات غير صالحة حتى بعد الإعادة السحابية");
    }
  }

  console.log("📁 الملفات المطلوبة:", fileList);

  const files = [];
  const getPromptForFile = (fileName, task, type) => {
    const base = `أنت مطوّر ويب محترف. اكتب كوداً كاملاً واحترافياً للملف "${fileName}" لمشروع ${type}.

وصف المشروع: ${task}

`;
    const commonRules = `
قواعد صارمة:
- استخدم خطوط عربية من Google Fonts (مثل Tajawal أو Cairo).
- كل النصوص باللغة العربية الفصحى، بدون أخطاء إملائية.
- لا تستخدم أبداً نصوصاً وهمية مثل "لوريم إيبسوم"، استخدم محتوى حقيقي متعلق بالمشروع.
- التصميم عصري، بألوان هادئة، متجاوب مع الهاتف، ويدعم RTL بالكامل.
- أضف أيقونات (مثلاً Font Awesome) ورسوم متحركة خفيفة.
- إذا كان الملف index.html: أدرج شريط تنقل، قسم رئيسي، مميزات، أسعار، معرض صور، اتصل بنا، وزر واتساب عائم.
- إذا كان style.css: استخدم CSS حديث مع متغيرات ألوان، وتقسيم منظم.
- إذا كان app.js: أضف تفاعلات بسيطة مثل القائمة الجوالة، التمرير السلس، نموذج اتصال.
`;
    const jsonRule = `\nأرجع ONLY كائن JSON صالح: {"name": "${fileName}", "content": "<الكود الكامل>"}. لا تضع أي شرح خارج JSON.`;
    
    return base + commonRules + jsonRule;
  };

  const generateOneFile = async (fileName) => {
    console.log(`📝 توليد: ${fileName}`);
    const prompt = getPromptForFile(fileName, task, type);
    const preferLocal = isSimpleFile(fileName);
    const rawContent = await ai(prompt, preferLocal);
    
    let json = await safeJSONWithRetry(rawContent,
      `Your previous response was invalid JSON. You MUST return ONLY valid JSON: {"name": "${fileName}", "content": "the code..."}. No other text.`);
    
    if (!json || !json.name || typeof json.content !== "string") {
      console.warn(`⚠️ فشل استخراج JSON لـ ${fileName}، استخدم المحتوى الخام`);
      json = { name: fileName, content: rawContent || "" };
    }

    // --- تقييم ذاتي (اختياري لكنه يرفع الجودة) ---
    try {
      const critiquePrompt = `قيم الكود التالي للملف "${fileName}" من حيث:
1. الالتزام بالمعايير المطلوبة (عربي، RTL، تصميم احترافي...)
2. وجود أخطاء أو نقص.

الكود:
${json.content.slice(0, 1500)}...

أجب بكلمة واحدة فقط: "ممتاز" أو "ضعيف". لا تزد شيئاً.`;

      const verdict = await ai(critiquePrompt, false);
      if (verdict.trim().includes("ضعيف")) {
        console.log(`🔄 إعادة توليد ${fileName} لأن التقييم ضعيف...`);
        const retryRaw = await ai(prompt, false);
        const retryJson = await safeJSONWithRetry(retryRaw,
          `Return ONLY valid JSON: {"name": "${fileName}", "content": "code..."}`);
        if (retryJson && retryJson.name && typeof retryJson.content === "string") {
          json = retryJson;
        }
      }
    } catch (e) {
      console.log("⚠️ فشل التقييم الذاتي، استمرار...");
    }

    return json;
  };

  const tasks = fileList.map(f => limit(() => generateOneFile(f)));
  const results = await Promise.all(tasks);
  results.forEach(f => files.push(f));
  return { files };
}

// --- حفظ الملفات (مع فحص المسار) ---
function sanitizeFilename(name) {
  return String(name)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\.\./g, "")
    .replace(/[^a-zA-Z0-9_\-\.\/]/g, "_")
    .slice(0, 180);
}

function saveFiles(baseDir, data) {
  const resolvedBase = path.resolve(baseDir);
  fs.ensureDirSync(resolvedBase);
  data.files.forEach(file => {
    if (!file.name || typeof file.content !== "string") return;
    const cleanName = sanitizeFilename(file.name);
    const filePath = path.resolve(resolvedBase, cleanName);
    if (!filePath.startsWith(resolvedBase + path.sep)) {
      console.warn(`⚠️ مسار خارج النطاق: ${file.name}`);
      return;
    }
    fs.ensureDirSync(path.dirname(filePath));
    fs.writeFileSync(filePath, file.content, "utf8");
    console.log(`💾 تم الحفظ: ${filePath}`);
  });
}

// --- PWA + واجهة المستخدم ---
function ensurePWA(projectDir, appName) {
  const indexPath = path.join(projectDir, "index.html");
  if (fs.existsSync(indexPath)) {
    let html = fs.readFileSync(indexPath, "utf8");
    if (!html.includes("manifest.json")) html = html.replace("</head>",
      '<link rel="manifest" href="manifest.json">\n<meta name="theme-color" content="#111111">\n</head>');
    if (!html.includes("serviceWorker.register")) html = html.replace("</body>",
      '<script>if("serviceWorker" in navigator){navigator.serviceWorker.register("sw.js");}</script>\n</body>');
    fs.writeFileSync(indexPath, html, "utf8");
  }
  fs.writeFileSync(path.join(projectDir, "manifest.json"), JSON.stringify({
    name: appName, short_name: appName.slice(0, 12), start_url: "./index.html",
    display: "standalone", background_color: "#ffffff", theme_color: "#111111",
    icons: [{ src: "https://cdn-icons-png.flaticon.com/512/1046/1046784.png", sizes: "512x512", type: "image/png" }]
  }, null, 2), "utf8");
  fs.writeFileSync(path.join(projectDir, "sw.js"),
    'self.addEventListener("install",function(e){self.skipWaiting();});\nself.addEventListener("fetch",function(e){});\n');
}

function sanitizeProjectName(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\w\s\u0600-\u06FF-]/g, "").trim().replace(/\s+/g, "_");
  return cleaned.length > 0 ? cleaned : null;
}

// --- دوال مساعدة للتعديل ---
function getBaseDir(type) {
  if (type === "website") return WORKSPACE;
  if (type === "android") return MOBILE_APPS;
  if (type === "agent") return AGENTS;
  throw new Error("نوع غير معروف");
}

function isSafePath(base, target) {
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(target);
  return resolvedTarget.startsWith(resolvedBase + path.sep);
}

function safeProjectName(name) {
  return path.basename(name);
}

// --- الواجهة الرئيسية ---
app.get("/", (req, res) => {
  res.send(
    '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"/><title>AI Dev Platform</title>' +
    '<style>body{margin:0;font-family:Arial,sans-serif;display:flex;height:100vh;background:#f5f5f5}#sidebar{width:260px;background:#111;color:white;padding:15px;overflow-y:auto}#main{flex:1;padding:15px;overflow-y:auto}input,textarea,select{width:100%;margin:6px 0;padding:8px;box-sizing:border-box}textarea{height:180px}button{padding:10px 15px;margin:5px 0;cursor:pointer}.project{padding:8px;border-bottom:1px solid #333;font-size:13px}pre{background:#eee;padding:10px;white-space:pre-wrap;direction:ltr;text-align:left}.card{background:white;padding:12px;border-radius:8px;margin-bottom:12px}</style>' +
    '</head><body>' +
    '<div id="sidebar"><h3>📁 المشاريع</h3><button onclick="loadProjects()">تحديث</button><div id="projects"></div></div>' +
    '<div id="main"><div class="card"><h2>🤖 AI Dev Platform (Hybrid MVP)</h2>' +
    '<label>النوع:</label><select id="type"><option value="website">موقع Web جاهز للبيع</option><option value="android">تطبيق Android</option><option value="agent">Agent</option></select>' +
    '<label>اسم المشروع (اختياري):</label><input id="name" placeholder="مثال: restaurant_app"/>' +
    '<label>وصف المشروع:</label><textarea id="task" placeholder="مثال: موقع مطعم عربي احترافي مع زر واتساب"></textarea>' +
    '<button onclick="build()">🚀 بناء المشروع</button></div>' +
    '<div class="card"><h3>النتيجة:</h3><pre id="output"></pre></div></div>' +
    '<script>' +
    'async function build(){' +
    '  const type=document.getElementById("type").value;const name=document.getElementById("name").value.trim();const task=document.getElementById("task").value.trim();' +
    '  if(!task){alert("اكتب وصف المشروع أولاً");return;}' +
    '  let url="/build-website";if(type==="android")url="/build-android";if(type==="agent")url="/build-agent";' +
    '  document.getElementById("output").textContent="جاري البناء...";' +
    '  try{const res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,task})});' +
    '  const data=await res.json();let text=JSON.stringify(data,null,2);if(data.preview){text+="\\n\\nافتح المعاينة هنا:\\n"+data.preview;}document.getElementById("output").textContent=text;loadProjects();}' +
    '  catch(e){document.getElementById("output").textContent="خطأ: "+e.message;}}' +
    'async function loadProjects(){const res=await fetch("/projects");const data=await res.json();' +
    '  document.getElementById("projects").innerHTML=data.map(function(p){return "<div class=\'project\'>"+p+"</div>";}).join("");}loadProjects();' +
    '</script></body></html>'
  );
});

// ==================== نقاط API ====================
app.get("/projects", (req, res) => {
  const list = [];
  try {
    if (fs.existsSync(WORKSPACE)) fs.readdirSync(WORKSPACE).forEach(p => list.push("🌐 " + p));
    if (fs.existsSync(MOBILE_APPS)) fs.readdirSync(MOBILE_APPS).forEach(p => list.push("📱 " + p));
    if (fs.existsSync(AGENTS)) fs.readdirSync(AGENTS).forEach(p => list.push("🤖 " + p));
    res.json(list);
  } catch (e) { res.status(500).json({ error: "خطأ في قراءة المجلدات" }); }
});

app.post("/build-website", async (req, res) => {
  try {
    const { name, task } = req.body;
    if (!task || typeof task !== "string" || task.trim().length === 0) return res.status(400).json({ error: "وصف المشروع مطلوب" });
    const projectName = sanitizeProjectName(name) || `website_${Date.now()}`;
    const data = await generateFiles(task,
      "premium Arabic RTL website ready to sell. Must include index.html, style.css, app.js, manifest.json, sw.js. Requirements: modern responsive UI, real working image URLs from Unsplash, WhatsApp CTA button, SEO title and meta description, professional Arabic content, no placeholders like Dish 1, mobile friendly, polished design, clean sections, pricing or offer section when relevant.");
    const dir = path.join(WORKSPACE, projectName);
    saveFiles(dir, data);
    ensurePWA(dir, projectName);
    res.json({ status: "website_created", name: projectName, preview: `http://localhost:${PORT}/preview/${projectName}/index.html`, pwa: "enabled" });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.post("/build-android", async (req, res) => {
  try {
    const { name, task } = req.body;
    if (!task || typeof task !== "string" || task.trim().length === 0) return res.status(400).json({ error: "وصف المشروع مطلوب" });
    const projectName = sanitizeProjectName(name) || `android_${Date.now()}`;
    const data = await generateFiles(task,
      "Android-ready PWA/WebView hybrid app. Must include index.html, style.css, app.js, manifest.json, sw.js, README.md. The app must be mobile-first, PWA-ready, Arabic RTL if requested, and suitable for conversion to APK using PWABuilder or GitHub Actions.");
    const dir = path.join(MOBILE_APPS, projectName);
    saveFiles(dir, data);
    ensurePWA(dir, projectName);
    res.json({ status: "android_project_created", name: projectName, note: "تم إنشاء PWA جاهز للتحويل إلى APK." });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.post("/build-agent", async (req, res) => {
  try {
    const { name, task } = req.body;
    if (!task || typeof task !== "string" || task.trim().length === 0) return res.status(400).json({ error: "وصف المشروع مطلوب" });
    const projectName = sanitizeProjectName(name) || `agent_${Date.now()}`;
    const data = await generateFiles(task,
      "Node.js AI Agent project. Must include agent.js, tools.js, memory.json, package.json, README.md. The agent should read tasks, plan steps, use OpenRouter API from .env, and safely read/write files inside its folder.");
    const dir = path.join(AGENTS, projectName);
    saveFiles(dir, data);
    res.json({ status: "agent_created", name: projectName, run: `cd ${dir} && npm install && node agent.js` });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.post("/clear-cache", (req, res) => {
  cache.clear();
  res.json({ status: "تم مسح الذاكرة المؤقتة" });
});

// ==================== نقاط التعديل (باستخدام *filePath) ====================
app.get("/project/:type/:name", (req, res) => {
  try {
    const type = req.params.type;
    const name = safeProjectName(req.params.name);
    const baseDir = getBaseDir(type);
    const projectDir = path.join(baseDir, name);
    if (!fs.existsSync(projectDir) || !projectDir.startsWith(path.resolve(baseDir) + path.sep)) {
      return res.status(404).json({ error: "المشروع غير موجود" });
    }
    const files = [];
    const walk = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(fullPath);
        else files.push(path.relative(projectDir, fullPath));
      }
    };
    walk(projectDir);
    res.json({ files });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// قراءة محتوى ملف (باستخدام *filePath)
app.get("/project/:type/:name/*filePath", (req, res) => {
  try {
    const type = req.params.type;
    const name = safeProjectName(req.params.name);
    const filePath = decodeURIComponent(req.params.filePath);
    const baseDir = getBaseDir(type);
    const projectDir = path.join(baseDir, name);
    const fullPath = path.join(projectDir, filePath);

    if (!isSafePath(projectDir, fullPath) || !fs.existsSync(fullPath)) {
      return res.status(404).json({ error: "الملف غير موجود" });
    }

    const content = fs.readFileSync(fullPath, "utf8");
    res.json({ content });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// حفظ أو إنشاء ملف (باستخدام *filePath)
app.post("/project/:type/:name/*filePath", (req, res) => {
  try {
    const type = req.params.type;
    const name = safeProjectName(req.params.name);
    const filePath = decodeURIComponent(req.params.filePath);
    const { content } = req.body;

    if (typeof content !== "string") return res.status(400).json({ error: "المحتوى مطلوب" });

    const baseDir = getBaseDir(type);
    const projectDir = path.join(baseDir, name);
    const fullPath = path.join(projectDir, sanitizeFilename(filePath));

    if (!isSafePath(projectDir, fullPath)) {
      return res.status(403).json({ error: "مسار غير آمن" });
    }

    fs.ensureDirSync(path.dirname(fullPath));
    fs.writeFileSync(fullPath, content, "utf8");
    res.json({ status: "تم الحفظ", file: path.relative(projectDir, fullPath) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// حذف ملف (باستخدام *filePath)
app.delete("/project/:type/:name/*filePath", (req, res) => {
  try {
    const type = req.params.type;
    const name = safeProjectName(req.params.name);
    const filePath = decodeURIComponent(req.params.filePath);
    const baseDir = getBaseDir(type);
    const projectDir = path.join(baseDir, name);
    const fullPath = path.join(projectDir, filePath);

    if (!isSafePath(projectDir, fullPath) || !fs.existsSync(fullPath)) {
      return res.status(404).json({ error: "الملف غير موجود" });
    }

    if (fs.statSync(fullPath).isDirectory()) {
      return res.status(400).json({ error: "لا يمكن حذف مجلد" });
    }

    fs.unlinkSync(fullPath);
    res.json({ status: "تم الحذف" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// صفحة المحرر
app.get("/edit", (req, res) => {
  res.send(`
<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"/><title>محرر المشاريع</title>
<style>
body{margin:0;font-family:Arial,sans-serif;display:flex;height:100vh;background:#f5f5f5}
#sidebar{width:260px;background:#111;color:white;padding:15px;overflow-y:auto}
#main{flex:1;padding:15px;overflow-y:auto;display:flex;flex-direction:column}
button{padding:8px 12px;margin:4px 0;cursor:pointer}
.project-item{margin:8px 0;padding:4px;border-bottom:1px solid #333}
textarea{width:100%;height:70vh;direction:ltr;text-align:left;font-family:monospace}
input{width:100%;margin:6px 0;padding:6px}
</style></head><body>
<div id="sidebar"><h3>📁 مشاريع</h3><div id="projects"></div></div>
<div id="main">
  <div id="editor" style="display:none">
    <h3>✏️ تعديل: <span id="editing-file"></span></h3>
    <textarea id="code"></textarea>
    <button onclick="saveFile()">💾 حفظ</button>
    <button onclick="deleteFile()" style="background:#c0392b;color:white">🗑️ حذف</button>
    <button onclick="closeEditor()">إغلاق</button>
  </div>
  <div id="file-list"><h3>اختر مشروعاً للتعديل</h3></div>
</div>
<script>
let currentType = "", currentProject = "", currentFile = "";

async function loadProjects() {
  const res = await fetch("/projects");
  const data = await res.json();
  const container = document.getElementById("projects");
  container.innerHTML = data.map(p => {
    const type = p.startsWith("🌐") ? "website" : p.startsWith("📱") ? "android" : "agent";
    const name = p.slice(2);
    return '<div class="project-item">' + p +
      ' <button onclick="loadFiles(\'' + type + '\',\'' + name + '\')">فتح</button></div>';
  }).join("");
}
loadProjects();

async function loadFiles(type, name) {
  currentType = type; currentProject = name;
  const res = await fetch("/project/" + type + "/" + name);
  const data = await res.json();
  const list = document.getElementById("file-list");
  list.innerHTML = "<h3>" + name + "</h3>" +
    data.files.map(f => '<div>' + f + ' <button onclick="openFile(\'' + f + '\')">تعديل</button></div>').join("") +
    '<hr><input id="new-file" placeholder="اسم ملف جديد"><button onclick="addFile()">➕ إضافة ملف</button>';
}

async function openFile(file) {
  currentFile = file;
  const res = await fetch("/project/" + currentType + "/" + currentProject + "/" + encodeURIComponent(file));
  const data = await res.json();
  document.getElementById("code").value = data.content;
  document.getElementById("editing-file").textContent = file;
  document.getElementById("editor").style.display = "block";
}

async function saveFile() {
  const content = document.getElementById("code").value;
  await fetch("/project/" + currentType + "/" + currentProject + "/" + encodeURIComponent(currentFile), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content })
  });
  alert("تم الحفظ");
}

async function deleteFile() {
  if (!confirm("حذف " + currentFile + "؟")) return;
  await fetch("/project/" + currentType + "/" + currentProject + "/" + encodeURIComponent(currentFile), { method: "DELETE" });
  document.getElementById("editor").style.display = "none";
  loadFiles(currentType, currentProject);
}

async function addFile() {
  const name = document.getElementById("new-file").value.trim();
  if (!name) return;
  await fetch("/project/" + currentType + "/" + currentProject + "/" + encodeURIComponent(name), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: "" })
  });
  loadFiles(currentType, currentProject);
}

function closeEditor() {
  document.getElementById("editor").style.display = "none";
}
</script></body></html>`);
});

// ==================== تشغيل الخادم ====================
app.listen(PORT, () => console.log(`🚀 Hybrid AI Platform (Stable MVP) على http://localhost:${PORT}`));
