const express = require("express");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "openai/gpt-6-astra";

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

function apiError(res, status, message) {
  return res.status(status).json({ error: message });
}

app.post("/api/chat", async (req, res) => {
  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return apiError(res, 400, "Messages array is required and must not be empty.");
  }

  if (!OPENROUTER_API_KEY) {
    return apiError(res, 500, "Server is not configured. Missing API key.");
  }

  const sanitized = messages
    .filter((m) => m && typeof m.role === "string" && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content }));

  if (sanitized.length === 0) {
    return apiError(res, 400, "No valid messages provided.");
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Astra AI",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: sanitized,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.status === 401) {
      return apiError(res, 401, "Invalid API key. Please check your OpenRouter configuration.");
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get("X-RateLimit-Reset");
      return apiError(res, 429, retryAfter ? `Rate limit exceeded. Try again after ${retryAfter}.` : "Rate limit exceeded. Please try again shortly.");
    }

    if (response.status === 402) {
      return apiError(res, 402, "Insufficient credits. Please add credits to your OpenRouter account.");
    }

    if (!response.ok) {
      let detail = "";
      try {
        const errBody = await response.json();
        detail = errBody?.error?.message || "";
      } catch (_) {}
      return apiError(res, response.status, detail || `OpenRouter API error (status ${response.status}).`);
    }

    let data;
    try {
      data = await response.json();
    } catch (_) {
      return apiError(res, 502, "Received an invalid response from the AI provider.");
    }

    const reply = data?.choices?.[0]?.message?.content;

    if (!reply || typeof reply !== "string") {
      return apiError(res, 502, "The AI returned an empty response. Please try again.");
    }

    return res.json({ reply });
  } catch (err) {
    if (err.name === "AbortError") {
      return apiError(res, 504, "Request timed out. The AI took too long to respond.");
    }
    return apiError(res, 503, "Unable to reach the AI service. Please check your network connection.");
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", configured: Boolean(OPENROUTER_API_KEY) });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`\n  Astra AI running at http://localhost:${PORT}\n`);
});
