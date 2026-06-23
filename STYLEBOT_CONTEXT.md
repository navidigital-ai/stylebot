# СтильПостер (StyleBot) — полный контекст проекта

## Что это

Веб-приложение для мультиплатформенного постинга. Анализирует стиль автора по его текстам, потом генерирует посты на разные площадки в этом стиле и публикует их через API.

**Живой URL:** https://multiposting.navidigital.ru  
**GitHub:** https://github.com/navidigital-ai/stylebot  
**Хостинг:** Vercel (проект `stylebot`, аккаунт `vanvanivan94-beeps-projects`)  
**Деплой:** автоматический по push в `main`

---

## Стек

- **Next.js 14** (Pages Router, не App Router)
- **React** (только `useState`, без `useEffect` — нет browser API на верхнем уровне)
- **Tailwind CSS** (utility-first, через `globals.css` с `@tailwind base/components/utilities`)
- **Vercel Serverless Functions** (папка `pages/api/`)
- **Anthropic Claude Sonnet 4.6** — для генерации текстов и анализа стиля
- **Replicate / Flux Schnell** — для генерации обложек
- **mammoth** — динамический импорт для парсинга .docx (только когда нужен)

---

## Структура файлов

```
navi_stylebot/
├── components/
│   └── StyleBot.jsx        — весь UI (752 строки)
├── pages/
│   ├── _app.js             — ErrorBoundary + globals.css
│   ├── index.jsx           — static import StyleBot (без dynamic)
│   ├── simple.jsx          — диагностическая страница (тест JS)
│   └── api/
│       ├── generate-text.js    — прокси к Anthropic API
│       ├── generate-cover.js   — прокси к Replicate API
│       ├── post-to-telegram.js — публикация в Telegram
│       ├── post-to-vk.js       — публикация во ВКонтакте
│       ├── post-to-max.js      — публикация в MAX-мессенджер
│       └── post-to-vc.js       — публикация на VC.ru (Osnova API)
├── styles/
│   └── globals.css         — только Tailwind (@tailwind base/components/utilities)
├── next.config.js          — заголовки X-Frame-Options + CSP для iframe в WebView
├── push-to-github.bat      — Windows-скрипт для git push (для деплоя через File Explorer)
└── .env.example
```

---

## Environment Variables (все уже добавлены на Vercel)

| Переменная | Назначение |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API — генерация текстов |
| `REPLICATE_API_TOKEN` | Replicate — генерация обложек (Flux Schnell) |
| `TG_BOT_TOKEN` | Telegram Bot — публикация постов |
| `TG_CHANNEL_ID` | ID Telegram-канала (не добавлен пока) |
| `MAX_BOT_TOKEN` | MAX Bot — токен (botapi.max.ru) |
| `MAX_CHANNEL_ID` | ID канала в MAX: `-76014974524885` |
| `VK_TOKEN` | ВКонтакте — токен сообщества (не добавлен пока) |
| `VK_GROUP_ID` | ID группы ВКонтакте (не добавлен пока) |

---

## Логика приложения

### Шаг 1 — База автора
Пользователь добавляет материалы (тексты, файлы). Поддерживаются:
- `.txt`, `.md`, `.srt`, `.vtt` — читаются напрямую
- `.docx` — парсится через `mammoth` (динамический импорт)
- `.pdf`, изображения — извлечение текста через Anthropic API (base64 → Claude)
- Аудио/видео — добавляются как "ждут расшифровки" (Whisper на боевом)

### Шаг 2 — Анализ стиля
Кнопка "Изучить стиль автора →" отправляет до 9000 символов корпуса в `/api/generate-text`. System prompt просит вернуть JSON с полями: `тон`, `словарь`, `длина_фраз`, `эмодзи`, `фишки`, `начало`, `концовка`, `обращение`, `резюме`.

Результат показывается как "Паспорт стиля". Пользователь может добавить свои правила стиля (стоп-лист и пожелания).

### Шаг 3 — Генерация постов
Выбираются площадки и формат, вводится тема. Генерация идёт последовательно (for..of) через `/api/generate-text`.

**System prompt = Паспорт стиля (JSON) + пример текста + COMMON_RULES + spec площадки + формат**

**Форматы:** Экспертный / Сторителлинг / Короткий / Провокация

**Площадки и их spec:**
- **Instagram** — средний, эмодзи умеренно (🔥✅👌😍🤗), CTA в комментарии, 3-5 хэштегов, canPost: false
- **Telegram** — короткий-средний, CTA со ссылкой, без хэштегов, canPost: true
- **MAX** — короткий-средний, язык проще, мягкий CTA, canPost: true
- **ВКонтакте** — средний, активно эмодзи, CTA «ставьте „+" в комментариях», 4-6 хэштегов, canPost: true
- **VC.ru** — лонгрид, без эмодзи, аналитичный тон, CTA — обсудить в комментариях, canPost: true
- **Дзен** — лонгрид, заголовок-крючок, простой язык, canPost: false (кнопка "Открыть в Дзен Студии")

Для каждого результата можно: копировать, публиковать напрямую, написать правку и переписать, сохранить правку как постоянное правило стиля.

### Генерация обложки
`/api/generate-cover` → Replicate Flux Schnell. Сначала Claude придумывает промпт на английском, потом Replicate генерирует картинку.

---

## API-эндпоинты

### `/api/generate-text`
- **Метод:** POST
- **Body:** `{ messages, system, maxTokens }`
- **Делает:** проксирует к `api.anthropic.com/v1/messages`, модель `claude-sonnet-4-6`
- **Возвращает:** `{ text }` или `{ error }`

### `/api/generate-cover`
- **Метод:** POST
- **Body:** `{ prompt, aspectRatio }`
- **Делает:** Replicate Flux Schnell с polling
- **Возвращает:** `{ url }` (webp)

### `/api/post-to-telegram`
- **Метод:** POST
- **Body:** `{ text, imageUrl? }`
- **Env:** `TG_BOT_TOKEN`, `TG_CHANNEL_ID`
- **Логика:** если imageUrl → sendPhoto с caption (до 1024 символов), если overflow → отдельным сообщением

### `/api/post-to-max`
- **Метод:** POST
- **Body:** `{ text, imageUrl? }`
- **Env:** `MAX_BOT_TOKEN`, `MAX_CHANNEL_ID`
- **Эндпоинт:** `https://botapi.max.ru/sendMessage?access_token={token}`
- **Важно:** Authorization без Bearer — просто токен в query-параметре

### `/api/post-to-vk`
- **Метод:** POST
- **Body:** `{ text, imageUrl? }`
- **Env:** `VK_TOKEN`, `VK_GROUP_ID`
- **Логика:** если imageUrl → photos.getWallUploadServer → upload → photos.saveWallPhoto → wall.post с attachment
- **VK API v5.199**

### `/api/post-to-vc`
- **Метод:** POST
- **Body:** `{ title?, text, imageUrl? }`
- **Env:** `VC_TOKEN`, `VC_SUBSITE_ID`
- **API:** `https://api.vc.ru/v2.8/entry/create` (неофициальный Osnova API, заголовок `X-Device-Token`)
- **Логика:** конвертирует plain-text в Osnova blocks (параграфы, заголовки h2)

---

## next.config.js

```js
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "ALLOWALL" },
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
```

Эти заголовки добавлены чтобы страница открывалась в iframe/WebView MAX-мессенджера.

---

## pages/_app.js

Обёрнут в `ErrorBoundary` (class component) — ловит ошибки рендера и показывает их в UI вместо белого экрана.

---

## Текущая проблема: MAX WebView (мобильный)

**Симптом:** На мобильном в MAX мини-апп не загружается (белый экран, "Не удалось загрузить"). На десктопе работает нормально.

**История попыток:**
1. Добавили заголовки iframe — решило проблему "не позволяет установить соединение"
2. Отключили Vercel Deployment Protection (Google OAuth) — решило проблему 403
3. Сделали mammoth динамическим импортом — не помогло
4. Добавили `ssr: false` через `next/dynamic` — "Загрузка…" появилась, потом белый экран
5. Добавили ErrorBoundary в `_app.js` — ошибка не показывается (или её нет)
6. Добавили таймаут 15 сек в dynamic import с показом ошибки в UI — через 15 сек белый экран (ErrPage не рендерится)
7. Убрали dynamic import, сделали static import — сейчас "Не удалось загрузить"

**Диагностическая страница `/simple`** (чистый React без Tailwind, без хуков) — в MAX WebView также показывала проблему (хотя в браузере работает).

**Гипотезы:**
- MAX WebView (iOS) имеет ограничения на загрузку JS
- Tailwind CSS как-то мешает (preflight?)
- Проблема с SSL или с размером бандла
- MAX WebView кэширует сломанную версию

**Что нужно проверить:**
- Открыть `/simple` в MAX WebView — чистая страница без Tailwind и без хуков
- Проверить консоль MAX WebView (если возможно через Safari Web Inspector на iOS)
- Попробовать полностью статический HTML без Next.js (сделать отдельную страницу `pages/test.html` или API route который возвращает чистый HTML)

---

## Особенности деплоя

- Git push → Vercel автоматически деплоит
- Деплой занимает ~90-120 секунд
- Из-за прокси на Windows-машине разработчика bash sandbox не может делать git push — пуш делается через `push-to-github.bat` запускаемый из File Explorer
- Vercel Deployment Protection ОТКЛЮЧЕНА (была включена по умолчанию и блокировала MAX WebView через Google OAuth)
- Домен `multiposting.navidigital.ru` — CNAME на `cname.vercel-dns.com` через reg.ru

---

## MAX Bot Setup

- Бот: `@id250205395861_bot`
- Канал: "НАВИ ИИшка", ID: `-76014974524885`
- Мини-апп URL настроен на `https://multiposting.navidigital.ru` в business.max.ru
- MAX Bot API: `https://botapi.max.ru` — Authorization без Bearer (просто `access_token` в query)

---

## COMMON_RULES (встроен в каждый промпт генерации)

```
1) Пиши конкретно и по-земному: живые детали, цифры, реальные примеры. Без украшательств.
2) СТОП-ЛИСТ: книжные клише вроде «парное молоко»; сказочно-фольклорные обороты; метафоры ради красоты; канцелярит.
3) Концовка: через риторический вопрос и контраст «не X, а Y»; уместен маркер «честно».
4) В экспертных/длинных форматах — кейс автора с цифрами. В коротких — НЕ вставляй.
5) Не пиши как ИИ и не упоминай анализ стиля. Просто будь автором.
```
