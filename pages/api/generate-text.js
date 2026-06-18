// ============================================================
//  /api/generate-text  —  serverless-функция (посредник)
// ============================================================
//  Куда положить:
//    • Next.js (Pages Router):  pages/api/generate-text.js
//    • Next.js (App Router):    app/api/generate-text/route.js
//
//  Что делает:
//    1. Принимает от браузера messages, system, maxTokens
//    2. Сама обращается к Anthropic API (ключ скрыт на сервере)
//    3. Возвращает сгенерированный текст браузеру
//
//  Переменная окружения (Vercel → Settings → Environment Variables):
//    ANTHROPIC_API_KEY=sk-ant-...
// ============================================================

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Только POST-запросы" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "На сервере не настроен ANTHROPIC_API_KEY" });
  }

  const { messages, system, maxTokens } = req.body || {};
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Поле messages обязательно" });
  }

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens || 1024,
        ...(system ? { system } : {}),
        messages,
      }),
    });

    const data = await anthropicRes.json();

    if (data.error) {
      // Пробрасываем структуру ошибки как есть — клиент умеет разбирать лимиты
      return res.status(anthropicRes.status).json({ error: data.error });
    }

    const text = (data.content || [])
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");

    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: "Ошибка сервера: " + (e.message || "неизвестно") });
  }
}

// ------------------------------------------------------------
//  App Router (app/api/generate-text/route.js):
//
//  export async function POST(req) {
//    const body = await req.json();
//    // ... та же логика ...
//    return Response.json({ text });
//  }
// ------------------------------------------------------------
