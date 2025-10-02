// server.js (مصلح — يحافظ على البنية الأصلية ولكن يضيف فallback وdebug)
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static("public"));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const // الاحتفاظ بالسطر كما عندك (يمكن أن يبقى كما هو في كودك القديم)
  GEMINI_API_URL =
    process.env.GEMINI_API_URL ||
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-preview-06-17:generateContent";

// اسم الموديل (اختياري، مفيد للفallback). ضعه في .env إن أمكن.
const MODEL_PRIMARY = process.env.MODEL_PRIMARY || "";

// SYSTEM_PROMPT شامل لكل اللغات واللهجات والأسلوب
const SYSTEM_PROMPT = `
You are Netia AI, trained and created by Invation Studio.
You can speak and understand all languages and dialects.
You can adapt your style and tone to match the user, mimicking human-like conversation.
Be helpful, polite, friendly, and intelligent.
Always answer questions about your name with: "My name is Netia AI, created by Invation Studio."
Provide examples, explanations, or context whenever possible to be as useful as possible.
If the user asks about humor, personality, or casual chat, respond naturally and human-like.
Always maintain Netia AI persona.
`;

// Helper: attempt a POST to an endpoint with given body and headers, returns {ok,res,bodyText}
async function tryPost(endpoint, bodyObj, headers = {}) {
  console.log("\n[Gemini][tryPost] Endpoint:", endpoint);
  console.log("[Gemini][tryPost] Headers preview:", JSON.stringify(headers));
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(bodyObj),
    });
    const text = await res.text();
    console.log(`[Gemini][tryPost] status=${res.status}`);
    console.log("[Gemini][tryPost] body preview:", (text || "").slice(0, 1200));
    return { ok: res.ok, status: res.status, res, text };
  } catch (err) {
    console.error("[Gemini][tryPost] Network error:", err);
    return { ok: false, status: 0, error: err };
  }
}

// Build fallback endpoints to try when original 404s
function buildFallbackEndpoints(modelName) {
  const endpoints = [];
  if (modelName) {
    // common Gemini endpoints (v1beta2 is commonly used)
    endpoints.push(
      `https://generativelanguage.googleapis.com/v1beta2/models/${modelName}:generateContent`,
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
      `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent`
    );
  }
  // also try original GEMINI_API_URL (already tried by caller usually)
  return endpoints;
}

// Try to extract model name from a full GEMINI_API_URL if provided
function extractModelFromUrl(url) {
  try {
    const m = url.match(/models\/([^:\/]+)(?::|\/|$)/i);
    if (m) return m[1];
  } catch (e) {}
  return "";
}

app.post("/api/chat", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "Missing 'message'" });

  // Build the payload exactly like كودك الأصلي (system then user)
  const payload = {
    contents: [
      { parts: [{ text: SYSTEM_PROMPT }] },
      { parts: [{ text: message }] },
    ],
  };

  // First attempt: use GEMINI_API_URL as-is (but send key in header too)
  // (we keep support لـ ?key= in URL for backwards-compatibility, but prefer header)
  const headers = {};
  if (GEMINI_API_KEY) headers["x-goog-api-key"] = GEMINI_API_KEY;

  // 1) Try the configured GEMINI_API_URL first
  console.log("\n[Server] Attempting primary GEMINI_API_URL...");
  let attemptResult = await tryPost(GEMINI_API_URL + (GEMINI_API_URL.includes("?") ? "" : ""), payload, headers);

  // If we got 404 or non-ok, try fallback endpoints (but only if 404 or network error)
  if (!attemptResult.ok && (attemptResult.status === 404 || attemptResult.status === 0)) {
    console.warn("[Server] Primary endpoint failed (404 or network). Trying fallbacks...");

    // Determine candidate model names
    let modelCandidates = [];
    if (MODEL_PRIMARY) modelCandidates.push(MODEL_PRIMARY);
    const extracted = extractModelFromUrl(GEMINI_API_URL);
    if (extracted && !modelCandidates.includes(extracted)) modelCandidates.push(extracted);

    // default fallback list if nothing found
    if (modelCandidates.length === 0) {
      modelCandidates = ["gemini-2.5-flash", "gemini-2.5", "gemini-pro", "gemini-2.1"];
    }

    // try each model's common endpoints
    for (const modelName of modelCandidates) {
      const fallbacks = buildFallbackEndpoints(modelName);
      for (const ep of fallbacks) {
        const r = await tryPost(ep, payload, headers);
        if (r.ok) {
          attemptResult = r;
          break;
        }
        // if 404 continue to next ep
      }
      if (attemptResult.ok) break;
    }
  }

  // If still not ok, return error (preserve original behavior: log and return 500)
  if (!attemptResult.ok) {
    console.error("❌ Error contacting Gemini API: final attempt failed.", attemptResult);
    // Return detailed error message to client (but don't leak API key)
    const detail = attemptResult.text ?? (attemptResult.error ? String(attemptResult.error) : "Unknown error");
    return res.status(500).json({
      error: "خطأ في الاتصال بـ Gemini API",
      details: detail,
    });
  }

  // parse response as JSON (we already logged text in tryPost)
  let data;
  try {
    data = JSON.parse(attemptResult.text || "{}");
  } catch (e) {
    console.error("[Server] Failed parsing Gemini response JSON:", e);
    return res.status(500).json({ error: "Failed parsing Gemini response", details: attemptResult.text });
  }

  console.log("📩 Gemini Response (raw):", JSON.stringify(data, null, 2));

  const reply =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    data?.outputs?.[0]?.content?.find((c) => c?.type?.includes?.("output_text"))?.text ||
    "⚠️ لم يتم العثور على رد";

  // preserve same response shape (reply), لكن نضيف sessionId صغير لو تحتاجه (لا يغيّر واجهة السكربت)
  const sessionId = Math.random().toString(36).slice(2, 10);
  return res.json({ reply, sessionId });
});

app.listen(3000, () => {
  console.log("✅ Server running on http://localhost:3000");
});
