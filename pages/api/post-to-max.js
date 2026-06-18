// ============================================================
//  /api/post-to-max  —  serverless-функция (MAX-мессенджер, MTS)
// ============================================================
//  Куда положить:  pages/api/post-to-max.js
//
//  MAX Bot API работает по той же схеме, что Telegram:
//    • Создаёшь бота на сайте MAX → получаешь токен
//    • Добавляешь бота в канал как администратора с правом публикации
//    • Bot API endpoint: https://botapi.max.ru
//
//  Документация: https://dev.max.ru/bot-api  (раздел «Работа с каналами»)
//
//  Переменные окружения:
//    MAX_BOT_TOKEN  — токен бота (выдаётся в панели разработчика MAX)
//    MAX_CHANNEL_ID — числовой ID канала (берётся из URL канала в MAX или через getUpdates)
// ============================================================

const MAX_API = "https://botapi.max.ru";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Только POST-запросы" });
  }

  const token = process.env.MAX_BOT_TOKEN;
  const channelId = process.env.MAX_CHANNEL_ID;

  if (!token || !channelId) {
    return res.status(500).json({
      error: "Не настроены MAX_BOT_TOKEN или MAX_CHANNEL_ID. Добавьте их в Environment Variables на Vercel.",
    });
  }

  const { text, imageUrl } = req.body || {};
  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Поле text обязательно" });
  }

  try {
    // MAX Bot API — метод sendMessage с указанием chat_id канала
    const body = {
      chat_id: channelId,
      text,
      ...(imageUrl
        ? {
            attachments: [
              {
                type: "image",
                url: imageUrl,
              },
            ],
          }
        : {}),
    };

    const r = await fetch(`${MAX_API}/sendMessage?access_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await r.json();

    if (!r.ok || data.error) {
      return res.status(502).json({
        error: "MAX API: " + (data.error?.message || data.message || JSON.stringify(data)),
      });
    }

    return res.status(200).json({ ok: true, messageId: data.message?.id });
  } catch (e) {
    return res.status(500).json({ error: "Ошибка сервера: " + (e.message || "неизвестно") });
  }
}

// ============================================================
//  ПРИМЕЧАНИЕ: если API MAX изменилось — сверяйся с документацией
//  на https://dev.max.ru/bot-api и поправь endpoint/поля.
//  Структура запроса умышленно близка к Telegram Bot API,
//  чтобы легко адаптировать при расхождениях.
// ============================================================
