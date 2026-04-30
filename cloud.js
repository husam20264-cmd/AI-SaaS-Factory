require("dotenv").config();

const express = require("express");
const compression = require("compression");
const fs = require("fs-extra");
const path = require("path");
const archiver = require("archiver");
const axios = require("axios");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const pLimit = require("p-limit").default;

const app = express();

// ===============================
// SPEED_MODE_MAX
// ===============================
app.use(compression());

app.use((req, res, next) => {
  const start = Date.now();

  res.setHeader("X-Powered-By", "AI-SaaS-Factory");
  res.setHeader("X-Speed-Mode", "MAX");

  if (req.path.startsWith("/dashboard") || req.path.startsWith("/edit")) {
    res.setHeader("Cache-Control", "no-store");
  } else if (req.path.startsWith("/workspace")) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  }

  res.on("finish", () => {
    console.log(`⚡ ${req.method} ${req.url} - ${res.statusCode} - ${Date.now() - start}ms`);
  });

  next();
});

app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.json({ limit: "50mb" }));
app.use("/workspace", express.static(path.join(__dirname, "workspace"), {
  maxAge: "365d",
  immutable: true,
  etag: true,
  lastModified: true
}));
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
  // --- المرحلة 1: الهيكل عبر المحلي مع fallback سحابي ---
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

  // --- المرحلة 2: توليد كل ملف مع Prompt احترافي وتقييم ذاتي ---
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
    '  document.getElementById("projects").innerHTML=data.map(function(p){var e=p.type==="website"?"🌐":p.type==="android"?"📱":"🤖";return "<div class=\'project\'>"+e+" "+p.name+"</div>";}).join("");}loadProjects();' +
    '</script></body></html>'
  );
});

// ==================== نقاط API ====================
app.get("/projects", (req, res) => {
  const list = [];
  try {
    if (fs.existsSync(WORKSPACE)) {
      fs.readdirSync(WORKSPACE).forEach(p => list.push({ type: "website", name: p }));
    }
    if (fs.existsSync(MOBILE_APPS)) {
      fs.readdirSync(MOBILE_APPS).forEach(p => list.push({ type: "android", name: p }));
    }
    if (fs.existsSync(AGENTS)) {
      fs.readdirSync(AGENTS).forEach(p => list.push({ type: "agent", name: p }));
    }
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: "خطأ في قراءة المجلدات" });
  }
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

// ==================== نقاط التعديل (باسم *filePath) ====================
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

// ==================== صفحة المحرر الاحترافي (Monaco + Live Preview) ====================
app.get("/edit", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <title>AI IDE Editor</title>
  <style>
    body{margin:0;font-family:Arial,sans-serif;display:flex;height:100vh;background:#1e1e1e;color:#fff}
    #sidebar{width:280px;background:#111;padding:15px;overflow-y:auto;border-left:1px solid #333}
    #main{flex:1;padding:15px;overflow-y:auto;display:flex;flex-direction:column}
    .project{padding:10px;border-bottom:1px solid #333;cursor:pointer;transition:background 0.2s}
    .project:hover{background:#252526}
    .file{padding:8px;margin:5px 0;background:#252526;border-radius:4px;display:flex;justify-content:space-between;align-items:center}
    button{padding:5px 10px;margin:2px;cursor:pointer;border:none;border-radius:3px;font-size:13px}
    .open{background:#0e639c;color:white}
    .save{background:#1a8a4a;color:white}
    .delete{background:#d32f2f;color:white}
    .preview{background:#6c5ce7;color:white}
    input{padding:8px;width:70%;box-sizing:border-box;background:#3c3c3c;border:1px solid #555;color:white;border-radius:3px}
    .card{background:#252526;padding:12px;border-radius:6px;margin-bottom:12px}
    pre{background:#1e1e1e;padding:10px;white-space:pre-wrap;direction:ltr;text-align:left;font-family:monospace;font-size:12px}
    #editor{height:60vh;border:1px solid #444}
    iframe{width:100%;height:40vh;border:1px solid #444;margin-top:10px;background:white}
  </style>
</head>
<body>
  <div id="sidebar">
    <h3>📁 المشاريع</h3>
    <button onclick="loadProjects()" style="background:#3c3c3c;color:white;width:100%;margin-bottom:10px">🔄 تحديث</button>
    <div id="projects">جاري التحميل...</div>
  </div>
  <div id="main">
    <div class="card">
      <h2>🧠 Monaco IDE</h2>
      <p id="status">اختر مشروعاً للتعديل</p>
    </div>
    <div class="card">
      <h3>📄 الملفات</h3>
      <div id="files"></div>
      <div style="margin-top:10px">
        <input id="newFile" placeholder="مثال: about.html">
        <button onclick="addFile()" style="background:#0e639c;color:white">➕ إضافة</button>
      </div>
    </div>
    <div class="card" id="editorBox" style="display:none">
      <h3>✏️ تعديل: <span id="currentFileName"></span></h3>
      <div id="editor"></div>
      <div style="margin-top:5px">
        <button class="save" onclick="saveFile()">💾 حفظ</button>
        <button class="delete" onclick="deleteFile()">🗑️ حذف</button>
        <button onclick="closeEditor()">إغلاق</button>
      </div>
      <iframe id="preview"></iframe>
    </div>
    <div class="card">
      <h3>Logs</h3>
      <pre id="log"></pre>
    </div>
  </div>

  <!-- Monaco Editor Loader -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.min.js"></script>
  <script>
    let currentType = "";
    let currentProject = "";
    let currentFile = "";
    let editor;

    // تهيئة Monaco Editor
    require.config({ paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs" }});
    require(["vs/editor/editor.main"], function () {
      editor = monaco.editor.create(document.getElementById("editor"), {
        value: "",
        language: "javascript",
        theme: "vs-dark",
        automaticLayout: true,
        fontSize: 14
      });
    });

    function log(x){ document.getElementById("log").textContent = String(x); }
    function emoji(type){
      if(type === "website") return "🌐";
      if(type === "android") return "📱";
      return "🤖";
    }

    async function loadProjects(){
      try{
        const res = await fetch("/projects");
        const data = await res.json();
        const box = document.getElementById("projects");
        if(!Array.isArray(data) || data.length === 0){
          box.innerHTML = "<p>لا توجد مشاريع</p>";
          return;
        }
        box.innerHTML = data.map(function(p){
          return '<div class="project" onclick="loadFiles(\\'' + p.type + '\\',\\'' + p.name.replace(/'/g,"\\\\'") + '\\')">' + emoji(p.type) + " " + p.name + '</div>';
        }).join("");
        log("Loaded projects: " + data.length);
      }catch(e){ log("خطأ تحميل المشاريع: " + e.message); }
    }

    async function loadFiles(type, name){
      try{
        currentType = type;
        currentProject = name;
        currentFile = "";
        document.getElementById("status").textContent = "المشروع: " + currentProject;
        document.getElementById("editorBox").style.display = "none";
        const res = await fetch("/project/" + type + "/" + encodeURIComponent(currentProject));
        const data = await res.json();
        if(!data.files){
          document.getElementById("files").innerHTML = "<pre>" + JSON.stringify(data,null,2) + "</pre>";
          return;
        }
        document.getElementById("files").innerHTML = data.files.map(function(f){
          return '<div class="file"><span>' + f + '</span><span>' +
                 '<button class="open" onclick="openFile(\\'' + encodeURIComponent(f) + '\\')">فتح</button>' +
                 '</span></div>';
        }).join("");
        if(currentType === "website"){
          document.getElementById("files").innerHTML += '<hr><button class="preview" onclick="openPreview()">👁️ معاينة الموقع</button>';
        }
        log("Loaded files: " + data.files.length);
      }catch(e){ log("خطأ تحميل الملفات: " + e.message); }
    }

    async function openFile(encodedFile){
      try{
        currentFile = decodeURIComponent(encodedFile);
        const res = await fetch("/project/" + currentType + "/" + encodeURIComponent(currentProject) + "/" + encodeURIComponent(currentFile));
        const data = await res.json();
        document.getElementById("currentFileName").textContent = currentFile;
        document.getElementById("editorBox").style.display = "block";

        // تعيين المحتوى
        const content = data.content || "";
        if(editor) editor.setValue(content);

        // تحديد اللغة
        if(editor) {
          if(currentFile.endsWith(".html")) monaco.editor.setModelLanguage(editor.getModel(), "html");
          else if(currentFile.endsWith(".css")) monaco.editor.setModelLanguage(editor.getModel(), "css");
          else if(currentFile.endsWith(".js")) monaco.editor.setModelLanguage(editor.getModel(), "javascript");
          else monaco.editor.setModelLanguage(editor.getModel(), "plaintext");
        }

        // تحديث المعاينة للمواقع
        if(currentType === "website") updatePreview();

        log("Opened: " + currentFile);
      }catch(e){ log("خطأ فتح الملف: " + e.message); }
    }

    async function saveFile(){
      try{
        if(!currentFile){ alert("افتح ملفاً أولاً"); return; }
        const content = editor ? editor.getValue() : document.getElementById("code")?.value;
        const res = await fetch("/project/" + currentType + "/" + encodeURIComponent(currentProject) + "/" + encodeURIComponent(currentFile), {
          method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({content:content}) });
        const data = await res.json();
        log(JSON.stringify(data,null,2));
        alert("تم الحفظ");
        if(currentType === "website") updatePreview();
      }catch(e){ log("خطأ الحفظ: " + e.message); }
    }

    async function deleteFile(){
      try{
        if(!currentFile) return;
        if(!confirm("حذف " + currentFile + "؟")) return;
        const res = await fetch("/project/" + currentType + "/" + encodeURIComponent(currentProject) + "/" + encodeURIComponent(currentFile), { method:"DELETE" });
        const data = await res.json();
        log(JSON.stringify(data,null,2));
        document.getElementById("editorBox").style.display = "none";
        loadFiles(currentType, currentProject);
      }catch(e){ log("خطأ الحذف: " + e.message); }
    }

    async function addFile(){
      try{
        if(!currentProject){ alert("اختر مشروعاً أولاً"); return; }
        const name = document.getElementById("newFile").value.trim();
        if(!name) return;
        const res = await fetch("/project/" + currentType + "/" + encodeURIComponent(currentProject) + "/" + encodeURIComponent(name), {
          method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({content:""}) });
        const data = await res.json();
        log(JSON.stringify(data,null,2));
        document.getElementById("newFile").value = "";
        loadFiles(currentType, currentProject);
      }catch(e){ log("خطأ الإضافة: " + e.message); }
    }

    function openPreview(){
      if(currentType !== "website") return;
      window.open("/preview/" + encodeURIComponent(currentProject) + "/index.html", "_blank");
    }

    function updatePreview(){
      if(currentType !== "website") return;
      document.getElementById("preview").src =
        "/preview/" + currentProject + "/index.html?t=" + Date.now();
    }

    function closeEditor(){
      document.getElementById("editorBox").style.display = "none";
    }

    loadProjects();
  </script>
</body>
</html>`);
});

// ==================== تشغيل الخادم ====================

// ===============================
// Export Project as ZIP
// ===============================
app.get("/export/:name", (req, res) => {
  const projectName = req.params.name;
  const dir = path.join(__dirname, "workspace", projectName);

  if (!fs.existsSync(dir)) {
    return res.status(404).send("Project not found: " + projectName);
  }

  res.attachment(projectName + ".zip");

  const archive = archiver("zip", { zlib: { level: 9 } });

  archive.on("error", (err) => {
    console.error("ZIP error:", err);
    if (!res.headersSent) {
      res.status(500).send(err.message);
    }
  });

  archive.pipe(res);
  archive.directory(dir, false);
  archive.finalize();
});


// ===============================


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

  res.send(`
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
    <div class="muted">Projects: ${total}</div>
    <div class="muted">PWA: ${pwaCount}</div>
  </aside>

  <main class="main">
    <section class="hero">
      <h1>لوحة التحكم الاحترافية</h1>
      <p>عدّل، عاين، حمّل ZIP، وجهّز APK من مكان واحد.</p>
    </section>

    <section class="stats">
      <div class="stat"><span class="muted">كل المشاريع</span><strong>${total}</strong></div>
      <div class="stat"><span class="muted">Websites</span><strong>${websiteCount}</strong></div>
      <div class="stat"><span class="muted">PWA Ready</span><strong>${pwaCount}</strong></div>
    </section>

    <div class="toolbar">
      <h2>المشاريع</h2>
      <input class="search" id="search" placeholder="ابحث عن مشروع..." oninput="filterProjects()">
    </div>

    ${projects.length ? `
    <div class="grid" id="projectGrid">
      ${projects.map(p => `
        <div class="card" data-name="${p.name.toLowerCase()}">
          <div class="card-head">
            <div>
              <h3>${p.name}</h3>
              <div class="muted">${p.isPwa ? "🔥 PWA جاهز" : "🌐 موقع عادي"}</div>
            </div>
            <span class="pill ${p.isPwa ? "green" : "orange"}">${p.isPwa ? "PWA" : "WEB"}</span>
          </div>

          <div class="meta">
            <span class="pill">${p.sizeKB} KB</span>
            <span class="pill">${p.hasIndex ? "HTML" : "No HTML"}</span>
            <span class="pill">${p.hasCss ? "CSS" : "No CSS"}</span>
            <span class="pill">${p.hasJs ? "JS" : "No JS"}</span>
          </div>

          <div class="actions">
            <a class="btn blue" href="/edit/${p.name}">✏️ تعديل</a>
            <button type="button" class="btn dark" onclick="openPreview('${p.name}')">👁️ معاينة</button>
            <a class="btn green" href="/export/${p.name}">⬇️ ZIP</a>
            <a class="btn purple" href="/apk/${p.name}">📱 APK</a>
<button type="button" class="btn orange" onclick="improveProject('${p.name}')">🤖 تحسين تلقائي</button>
            <form method="POST" action="/delete/${p.name}" onsubmit="return confirm('حذف المشروع ${p.name}؟')" class="full">
              <button class="btn red full" type="submit">🗑️ حذف المشروع</button>
            </form>
          </div>
        </div>
      `).join("")}
    </div>
    ` : `
    <div class="empty">لا توجد مشاريع بعد.</div>
    `}
  </main>
</div>

<div class="modal" id="previewModal">
  <div class="modal-bar">
    <strong id="previewTitle">Preview</strong>
    <button type="button" class="close" onclick="closePreview()">إغلاق</button>
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
}
</script>
</body>
</html>
`);
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
  res.send(`
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
<p>المشروع: <b>${name}</b></p>
<p>هذه صفحة جاهزة للربط لاحقًا مع Capacitor لتحويل الموقع إلى APK.</p>
<a href="/dashboard">رجوع للوحة التحكم</a>
</div>
</body>
</html>
`);
});

// ===============================
// END PRO DASHBOARD
// ===============================


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
        css += `

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
`;
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

app.get("/health", (req,res)=>res.json({ok:true,time:new Date().toISOString()}));

app.get("/speed", (req, res) => {
  res.json({
    ok: true,
    mode: "MAX",
    compression: true,
    cache: true,
    time: new Date().toISOString()
  });
});


// ===============================


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

  res.send(`
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ultra Fast Editor - ${name}</title>
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
    <div class="status">Project: ${name} · Preview يدوي لتقليل البطء</div>
  </div>
  <div>
    <button class="btn green" onclick="saveAll()">💾 حفظ</button>
    <button class="btn dark" onclick="openPreview()">👁️ معاينة</button>
    <button class="btn purple" onclick="aiImprove()">🤖 AI</button>
    <a class="btn" href="/export/${name}">ZIP</a>
    <a class="btn dark" href="/dashboard">رجوع</a>
  </div>
</div>

<div class="tabs">
  <div class="tab active" onclick="showTab(event,'html')">HTML</div>
  <div class="tab" onclick="showTab(event,'css')">CSS</div>
  <div class="tab" onclick="showTab(event,'js')">JS</div>
</div>

<div class="wrap">
  <div class="panel active" id="panel-html"><textarea id="html" spellcheck="false">${escapeHtml(readProjectFile(name, "index.html"))}</textarea></div>
  <div class="panel" id="panel-css"><textarea id="css" spellcheck="false">${escapeHtml(readProjectFile(name, "style.css"))}</textarea></div>
  <div class="panel" id="panel-js"><textarea id="js" spellcheck="false">${escapeHtml(readProjectFile(name, "app.js"))}</textarea></div>
</div>

<div id="previewBox">
  <div id="previewTop">
    <b>Preview: ${name}</b>
    <button class="btn red" onclick="closePreview()">إغلاق</button>
  </div>
  <iframe id="previewFrame"></iframe>
</div>

<script>
const projectName = "${name}";
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
`);
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

app.listen(PORT, () => console.log(`🚀 Hybrid AI Platform (Stable MVP) على http://localhost:${PORT}`));


