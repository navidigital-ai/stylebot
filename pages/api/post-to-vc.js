// ============================================================
//  /api/post-to-vc  —  публикация статьи на vc.ru
// ============================================================
//  Использует неофициальный Osnova API (тот же движок, что DTF, TJ).
//  API работает стабильно с ~2019 г. и используется сторонними
//  разработчиками — но официально не задокументирован.
//
//  Переменные окружения (Vercel → Settings → Environment Variables):
//    VC_TOKEN       — токен из настроек vc.ru → Профиль → Настройки → API
//                     (кнопка «Создать токен»)
//    VC_SUBSITE_ID  — числовой ID вашего блога/профиля.
//                     Найти: зайдите на свой профиль vc.ru, в URL будет
//                     /id123456 — это и есть subsite_id.
//                     Или запрос: GET https://api.vc.ru/v2.8/auth/me
//                     с заголовком X-Device-Token: {VC_TOKEN} — поле id.
//
//  Что делает:
//    1. Конвертирует plain-text в Osnova content blocks (JSON)
//    2. Добавляет обложку, если передан imageUrl
//    3. Публикует статью сразу (is_published=1)
// ============================================================

const VC_API = "https://api.vc.ru/v2.8";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Только POST-запросы" });
  }

  const token = process.env.VC_TOKEN;
  const subsiteId = process.env.VC_SUBSITE_ID;

  if (!token || !subsiteId) {
    return res.status(500).json({
      error: "Не настроены VC_TOKEN или VC_SUBSITE_ID. Добавьте их в Environment Variables на Vercel.",
    });
  }

  const { title, text, imageUrl } = req.body || {};
  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Поле text обязательно" });
  }

  // Заголовок статьи: используем переданный title или берём первую строку текста
  const articleTitle = (title || extractTitle(text)).trim();
  // Тело статьи: если title был первой строкой — убираем дублирование
  const bodyText = title ? text : stripFirstLine(text);

  try {
    const blocks = textToBlocks(bodyText);

    // Если есть картинка — добавляем её первым блоком как обложку
    if (imageUrl) {
      blocks.unshift({
        type: "media",
        id: "cover_block",
        data: {
          items: [{ url: imageUrl, title: "", author: "", additional: "" }],
        },
      });
    }

    // Osnova API принимает форм-данные (application/x-www-form-urlencoded)
    const formBody = new URLSearchParams({
      title: articleTitle,
      blocks: JSON.stringify(blocks),
      subsite_id: subsiteId,
      is_published: "1",
    });

    const r = await fetch(`${VC_API}/entry/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Device-Token": token,
      },
      body: formBody.toString(),
    });

    const data = await r.json();

    if (!r.ok || data.error) {
      return res.status(r.status || 502).json({
        error: "VC API: " + (data.error?.message || data.message || JSON.stringify(data)),
      });
    }

    const entryId = data.result?.id;
    const url = entryId ? `https://vc.ru/${entryId}` : null;

    return res.status(200).json({ ok: true, entryId, url });
  } catch (e) {
    return res.status(500).json({ error: "Ошибка сервера: " + (e.message || "неизвестно") });
  }
}

// ─── helpers ────────────────────────────────────────────────

/**
 * Конвертирует plain-text в массив Osnova content blocks.
 * Каждый абзац (разделитель — двойной перенос) → отдельный block type=text.
 * Строки внутри абзаца → <p>-теги.
 */
function textToBlocks(text) {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());

  return paragraphs.map((para, i) => {
    const lines = para.trim().split("\n");

    // Если это короткая строка в верхнем регистре или заголовочного вида — делаем header
    const isHeading =
      lines.length === 1 &&
      lines[0].length < 80 &&
      (lines[0] === lines[0].toUpperCase() || /^#+\s/.test(lines[0]));

    if (isHeading) {
      const headingText = lines[0].replace(/^#+\s+/, ""); // убираем markdown #
      return {
        type: "header",
        id: `block_${i}`,
        data: { style: "h2", text: headingText },
      };
    }

    // Обычный абзац — оборачиваем каждую строку в <p>
    const html = lines.map((l) => `<p>${escapeHtml(l.trim())}</p>`).join("");
    return {
      type: "text",
      id: `block_${i}`,
      data: { text: html },
    };
  });
}

/** Берёт первую строку как заголовок (или первые 80 символов первого предложения) */
function extractTitle(text) {
  const firstLine = text.trim().split("\n")[0];
  if (firstLine.length <= 120) return firstLine;
  const dot = firstLine.search(/[.!?]/);
  return dot > 0 && dot <= 120 ? firstLine.slice(0, dot + 1) : firstLine.slice(0, 80) + "…";
}

/** Убирает первую строку из текста (чтобы не дублировать title в теле) */
function stripFirstLine(text) {
  const idx = text.indexOf("\n");
  return idx === -1 ? "" : text.slice(idx + 1).trim();
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
