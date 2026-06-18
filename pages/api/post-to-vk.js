// ============================================================
//  /api/post-to-vk  —  serverless-функция
// ============================================================
//  Куда положить:  pages/api/post-to-vk.js
//
//  Что делает:
//    1. Принимает текст поста и (опционально) URL обложки
//    2. Если есть imageUrl — сначала загружает фото на сервер VK,
//       потом публикует пост с прикреплённым фото
//    3. Если imageUrl нет — публикует обычный текстовый пост
//
//  Переменные окружения:
//    VK_TOKEN     — токен сообщества (Управление → Настройки → Работа с API
//                   → Создать ключ доступа, права: wall, photos)
//    VK_GROUP_ID  — числовой ID группы/сообщества (без минуса, напр. 123456789)
// ============================================================

const VK_API = "https://api.vk.com/method";
const VK_VERSION = "5.199";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Только POST-запросы" });
  }

  const token = process.env.VK_TOKEN;
  const groupId = process.env.VK_GROUP_ID;

  if (!token || !groupId) {
    return res.status(500).json({
      error: "Не настроены VK_TOKEN или VK_GROUP_ID. Добавьте их в Environment Variables на Vercel.",
    });
  }

  const { text, imageUrl } = req.body || {};
  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Поле text обязательно" });
  }

  try {
    let attachments = "";

    if (imageUrl) {
      // Шаг 1: получаем адрес для загрузки фото на стену
      const uploadServerRes = await vkCall("photos.getWallUploadServer", {
        access_token: token,
        group_id: groupId,
      });
      if (uploadServerRes.error) {
        return res.status(502).json({ error: "VK API: " + uploadServerRes.error.error_msg });
      }
      const uploadUrl = uploadServerRes.response.upload_url;

      // Шаг 2: скачиваем картинку и заливаем на сервер VK через multipart
      const imageRes = await fetch(imageUrl);
      if (!imageRes.ok) {
        return res.status(502).json({ error: "Не удалось скачать изображение по URL" });
      }
      const imageBuffer = await imageRes.arrayBuffer();
      const imageBlob = new Blob([imageBuffer], { type: "image/webp" });

      const form = new FormData();
      form.append("photo", imageBlob, "cover.webp");
      const uploadRes = await fetch(uploadUrl, { method: "POST", body: form });
      const uploaded = await uploadRes.json();

      if (!uploaded.photo) {
        return res.status(502).json({ error: "VK: фото не загрузилось на сервер" });
      }

      // Шаг 3: сохраняем фото в альбоме стены группы
      const saveRes = await vkCall("photos.saveWallPhoto", {
        access_token: token,
        group_id: groupId,
        photo: uploaded.photo,
        server: uploaded.server,
        hash: uploaded.hash,
      });
      if (saveRes.error) {
        return res.status(502).json({ error: "VK API saveWallPhoto: " + saveRes.error.error_msg });
      }
      const photo = saveRes.response[0];
      attachments = `photo${photo.owner_id}_${photo.id}`;
    }

    // Шаг 4: публикуем пост
    const postRes = await vkCall("wall.post", {
      access_token: token,
      owner_id: "-" + groupId,  // минус = сообщество, не пользователь
      message: text,
      ...(attachments ? { attachments } : {}),
      from_group: 1,
    });

    if (postRes.error) {
      return res.status(502).json({ error: "VK API wall.post: " + postRes.error.error_msg });
    }

    return res.status(200).json({ ok: true, postId: postRes.response.post_id });
  } catch (e) {
    return res.status(500).json({ error: "Ошибка сервера: " + (e.message || "неизвестно") });
  }
}

async function vkCall(method, params) {
  const url = new URL(`${VK_API}/${method}`);
  url.searchParams.set("v", VK_VERSION);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const r = await fetch(url.toString());
  return r.json();
}
