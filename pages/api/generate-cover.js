// ============================================================
//  /api/generate-cover  —  serverless-функция (посредник)
// ============================================================
//  Переменная окружения (Vercel → Settings → Environment Variables):
//    REPLICATE_API_TOKEN=r8_...
// ============================================================

const FLUX_MODEL = "black-forest-labs/flux-schnell";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Только POST-запросы" });
  }

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "На сервере не настроен REPLICATE_API_TOKEN" });
  }

  const { prompt, aspectRatio } = req.body || {};
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: "Пустое описание картинки" });
  }

  try {
    const startRes = await fetch("https://api.replicate.com/v1/models/" + FLUX_MODEL + "/predictions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({
        input: {
          prompt: prompt.trim(),
          aspect_ratio: aspectRatio || "1:1",
          output_format: "webp",
          num_outputs: 1,
        },
      }),
    });

    const prediction = await startRes.json();

    if (prediction.error) {
      return res.status(502).json({ error: "Replicate: " + prediction.error });
    }

    let result = prediction;
    let tries = 0;
    while (result.status !== "succeeded" && result.status !== "failed" && tries < 30) {
      await new Promise((r) => setTimeout(r, 1200));
      const poll = await fetch(result.urls.get, {
        headers: { Authorization: "Bearer " + token },
      });
      result = await poll.json();
      tries++;
    }

    if (result.status !== "succeeded") {
      return res.status(502).json({ error: "Картинка не сгенерировалась (статус: " + result.status + ")" });
    }

    const url = Array.isArray(result.output) ? result.output[0] : result.output;
    return res.status(200).json({ url });
  } catch (e) {
    return res.status(500).json({ error: "Ошибка сервера: " + (e.message || "неизвестно") });
  }
}
