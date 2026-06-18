// ============================================================
//  /api/post-to-telegram  —  serverless-функция
// ============================================================
//  Куда положить:  pages/api/post-to-telegram.js
//
//  Что делает:
//    1. Принимает текст поста и (опционально) URL обложки
//    2. Публикует в Telegram-канал от имени бота
//    3. Если передан imageUrl — отправляет фото с подписью,
//       иначе — обычное текстовое сообщение
//
//  Переменные окружения (Vercel → Settings → Environment Variables):
//    TG_BOT_TOKEN   — токен бота от @BotFather (формат: 123456:ABC-DEF...)
//    TG_CHANNEL_ID  — ID канала или @username (формат: -1001234567890 или @mychannel)
//                     Бот должен быть администратором канала с правом на публикацию!
// ============================================================

const TG_API = "https://api.telegram.org/bot";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Только POST-запросы" });
  }

  const token = process.env.TG_BOT_TOKEN;
  const channelId = process.env.TG_CHANNEL_ID;

  if (!token || !channelId) {
    return res.status(500).json({
      error: "Не настроены TG_BOT_TOKEN или TG_CHANNEL_ID. Добавьте их в Environment Variables на Vercel.",
    });
  }

  const { text, imageUrl } = req.body || {};
  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Поле text обязательно" });
  }

  // Telegram ограничивает подписи к фото до 1024 символов.
  // Если текст длиннее — отправляем фото без подписи, потом отдельным сообщением текст.
  const caption = text.slice(0, 1024);
  const overflow = text.length > 1024 ? text.slice(1024) : null;

  try {
    let messageId;

    if (imageUrl) {
      // Отправляем фото с подписью
      const r = await tgCall(token, "sendPhoto", {
        chat_id: channelId,
        photo: imageUrl,
        caption,
        parse_mode: "HTML",
      });
      if (!r.ok) {
        return res.status(502).json({ error: "Telegram API: " + (r.description || JSON.stringify(r)) });
      }
      messageId = r.result?.message_id;

      // Если текст не влез в подпись — отправляем продолжение
      if (overflow) {
        await tgCall(token, "sendMessage", {
          chat_id: channelId,
          text: overflow,
          parse_mode: "HTML",
          reply_to_message_id: messageId,
        });
      }
    } else {
      // Обычное текстовое сообщение (без ограничения в 1024 символа)
      const r = await tgCall(token, "sendMessage", {
        chat_id: channelId,
        text,
        parse_mode: "HTML",
      });
      if (!r.ok) {
        return res.status(502).json({ error: "Telegram API: " + (r.description || JSON.stringify(r)) });
      }
      messageId = r.result?.message_id;
    }

    return res.status(200).json({ ok: true, messageId });
  } catch (e) {
    return res.status(500).json({ error: "Ошибка сервера: " + (e.message || "неизвестно") });
  }
}

async function tgCall(token, method, body) {
  const r = await fetch(`${TG_API}${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}
