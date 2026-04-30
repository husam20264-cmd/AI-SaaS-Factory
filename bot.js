require("dotenv").config();
const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const readline = require("readline-sync");

const API_KEY = process.env.OPENROUTER_API_KEY;
const BASE = path.join(process.cwd(), "company");
fs.ensureDirSync(BASE);

// 🤖 AI Core
async function ai(prompt, system = "") {
  const res = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "anthropic/claude-3-haiku",
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  return res.data.choices[0].message.content;
}

// 🧠 CEO (فكرة + استراتيجية)
async function ceo(task) {
  return await ai(
    `You are CEO of a software company.
Turn this idea into a product strategy:

${task}`,
    "You are a startup CEO."
  );
}

// 🏗️ PRODUCT TEAM
async function productTeam(plan) {
  return await ai(
    `Design full product features + file structure:

${plan}

Return ONLY JSON:
{
 "files":[{"name":"file.js","content":"code"}]
}`,
    "You are a product architect."
  );
}

// 👨‍💻 DEV TEAM
async function devTeam(product) {
  return await ai(
    `Build full working code from this product design:

${product}

Return ONLY JSON.`,
    "You are a senior full-stack developer."
  );
}

// 🔧 QA TEAM
async function qaTeam(code) {
  return await ai(
    `Find bugs and fix code:

${JSON.stringify(code)}

Return corrected JSON only.`,
    "You are QA engineer."
  );
}

// 📊 REVIEWER
async function reviewer(code) {
  return await ai(
    `Rate this project 0-100 and suggest improvements:

${JSON.stringify(code)}`,
    "You are strict code reviewer."
  );
}

// 🧱 Safe JSON parser
function parseSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

// 📦 Save company product
function saveProduct(name, data) {
  const dir = path.join(BASE, name);
  fs.ensureDirSync(dir);

  if (!data || !data.files) {
    console.log("❌ Invalid output");
    return;
  }

  data.files.forEach(f => {
    const filePath = path.join(dir, f.name);
    fs.outputFileSync(filePath, f.content);
    console.log("📄 Saved:", f.name);
  });

  console.log("\n🏢 Product created:", dir);
}

// 🚀 COMPANY ENGINE
async function runCompany(task) {
  console.log("\n🧠 CEO thinking...");
  const strategy = await ceo(task);

  console.log("\n🏗️ Product team designing...");
  const product = await productTeam(strategy);

  console.log("\n👨‍💻 Dev team building...");
  let code = parseSafe(await devTeam(product));

  if (!code) {
    console.log("❌ Dev failed");
    return;
  }

  console.log("\n🔧 QA testing...");
  code = parseSafe(await qaTeam(code)) || code;

  console.log("\n📊 Reviewing...");
  const review = await reviewer(code);

  console.log("\n📊 REVIEW:\n", review);

  const name = "startup_" + Date.now();
  saveProduct(name, code);

  console.log("\n✅ Autonomous company finished product!");
}

// 💻 CLI
async function main() {
  console.log("\n🏢 AUTONOMOUS SOFTWARE COMPANY OS\n");

  while (true) {
    const input = readline.question("company> ");

    if (input === "exit") break;

    if (input.startsWith("build ")) {
      const task = input.replace("build ", "");
      await runCompany(task);
      continue;
    }

    console.log(await ai(input, "You are helpful assistant."));
  }
}

main();
