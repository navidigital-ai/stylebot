import { useState } from "react";
import * as mammoth from "mammoth";

const FORMATS = [
  { id: "expert", label: "Экспертный", hint: "польза + кейс с цифрами + CTA" },
  { id: "story", label: "Сторителлинг", hint: "личная история с выводом" },
  { id: "short", label: "Короткий", hint: "одна мысль, без кейса" },
  { id: "provoke", label: "Провокация", hint: "резкий тезис + обоснование" },
];

const PLATFORMS = [
  {
    id: "instagram",
    label: "Instagram",
    long: false,
    canPost: false,
    spec: "Instagram-пост. Длина средняя. Эмодзи умеренно: фирменный 🔥 после обещаний, ✅ для пунктов списка, тёплые 👌😍🤗. CTA-приманка в комментарии: «напиши „+\" / „Урок\" в комментарии». Тон живой, разговорный. Уместны хэштеги в конце (3-5).",
  },
  {
    id: "telegram",
    label: "Telegram",
    long: false,
    canPost: true,
    spec: "Пост в Telegram-канал. Длина короткая-средняя. Эмодзи умеренно. Заголовок можно выделить. CTA — кликабельная ссылка в конце (→ Записаться: [ссылка]). Без хэштегов.",
  },
  {
    id: "max",
    label: "MAX",
    long: false,
    canPost: true,
    spec: "Пост в MAX-мессенджер. Короткий-средний. Язык проще, меньше профжаргона — аудитория новее и шире. Эмодзи умеренно. CTA мягкий: «пишите, расскажу про обучение».",
  },
  {
    id: "vk",
    label: "ВКонтакте",
    long: false,
    canPost: true,
    spec: "Пост в сообщество ВКонтакте. Длина средняя, чуть свободнее. Эмодзи активно, ✅-списки. CTA: «ставьте „+\" в комментариях». В конце 4-6 тематических хэштегов.",
  },
  {
    id: "vc",
    label: "VC.ru",
    long: true,
    canPost: true,
    spec: "Статья на VC.ru. Лонгрид. Почти без эмодзи (они выглядят несолидно). Сильный заголовок и подзаголовки по разделам. Аналитичный, экспертный тон. CTA — НЕ продажа, а приглашение обсудить в комментариях.",
  },
  {
    id: "dzen",
    label: "Дзен",
    long: true,
    canPost: false,    // нет публичного API — используем кнопку открытия Студии
    dzenHelper: true,  // спецфлаг для кнопки «Открыть в Дзен Студии»
    spec: "Статья в Дзен. Лонгрид. Сильный заголовок-крючок для ленты. Подзаголовки. Простой широкий язык, минимум эмодзи. CTA — подписка на канал, без прямой продажи.",
  },
];

const POST_ENDPOINTS = {
  telegram: "/api/post-to-telegram",
  vk: "/api/post-to-vk",
  max: "/api/post-to-max",
  vc: "/api/post-to-vc",
};

const COMMON_RULES = `ОБЩИЕ ПРАВИЛА ДВИЖКА (соблюдать всегда, поверх паспорта стиля):
1) Пиши конкретно и по-земному: живые детали, цифры, реальные примеры. Без украшательств.
2) СТОП-ЛИСТ (автор так НИКОГДА не пишет): книжные клише вроде «парное молоко»; сказочно-фольклорные обороты вроде «тридевять земель», «за морями»; метафоры ради красоты; канцелярит.
3) Концовка: заходи через риторический вопрос («знаете, что…?») и давай вывод через контраст «не X, а Y»; уместен маркер искренности «честно».
4) В экспертных и длинных форматах подкрепляй мысль реальным кейсом автора с цифрами. В коротких форматах кейс НЕ вставляй — держи стиль ритмом, рублеными фразами и контрастной концовкой.
5) Не пиши как ИИ и не упоминай, что анализировал стиль. Просто будь автором.`;

function formatWaitTime(resetsAtRaw) {
  if (!resetsAtRaw) return null;
  let resetsMs;
  if (typeof resetsAtRaw === "number") {
    resetsMs = resetsAtRaw > 1e12 ? resetsAtRaw : resetsAtRaw * 1000;
  } else {
    const parsed = Date.parse(resetsAtRaw);
    if (!isNaN(parsed)) resetsMs = parsed;
  }
  if (!resetsMs) return null;
  const diffMin = Math.ceil((resetsMs - Date.now()) / 60000);
  if (diffMin <= 0) return "уже можно повторить";
  if (diffMin < 60) return "примерно через " + diffMin + " мин.";
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  return "примерно через " + hours + " ч." + (mins ? " " + mins + " мин." : "");
}

function parseLimitError(raw) {
  let obj = null;
  if (raw && typeof raw === "object") {
    obj = raw;
  } else if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        try { obj = JSON.parse(m[0]); } catch {}
      }
    }
  }
  if (!obj) return null;
  const type = obj.type || obj.error?.type;
  if (type !== "exceeded_limit" && !/exceeded_limit/i.test(raw || "")) return null;
  const resetsAt = obj.resetsAt || obj.resets_at || obj.error?.resetsAt;
  return { resetsAt };
}

class LimitExceededError extends Error {
  constructor(resetsAt) {
    const wait = formatWaitTime(resetsAt);
    super(
      wait
        ? "Лимит запросов временно исчерпан. Попробуйте снова " + wait + "."
        : "Лимит запросов временно исчерпан. Попробуйте снова чуть позже."
    );
    this.name = "LimitExceededError";
    this.isLimit = true;
    this.resetsAt = resetsAt;
  }
}

async function generateText(messages, system, maxTokens) {
  let res;
  try {
    res = await fetch("/api/generate-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, system, maxTokens: maxTokens || 1024 }),
    });
  } catch {
    throw new Error("Не удалось связаться с сервером генерации текста.");
  }

  const data = await res.json();

  if (!res.ok || data.error) {
    const limitFromError = parseLimitError(data.error);
    if (limitFromError) throw new LimitExceededError(limitFromError.resetsAt);
    throw new Error((data.error?.message || data.error || "Ошибка модели") + "");
  }

  const limitInText = parseLimitError(data.text);
  if (limitInText) throw new LimitExceededError(limitInText.resetsAt);

  return data.text;
}

async function generateImage(prompt, opts) {
  let res;
  try {
    res = await fetch("/api/generate-cover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, aspectRatio: opts?.aspectRatio || "1:1" }),
    });
  } catch {
    throw new ImageProviderNotConnectedError();
  }
  if (res.status === 404) throw new ImageProviderNotConnectedError();
  let data;
  try {
    data = await res.json();
  } catch {
    throw new ImageProviderNotConnectedError();
  }
  if (!res.ok || data.error) {
    throw new Error(data.error || "Сервер не смог сгенерировать обложку");
  }
  return data.url;
}

class ImageProviderNotConnectedError extends Error {
  constructor() {
    super("Серверная функция генерации обложек (/api/generate-cover) пока не подключена. В этом превью обложка не рисуется — на боевом сайте с поднятой функцией она заработает автоматически.");
    this.name = "ImageProviderNotConnectedError";
    this.isProviderStub = true;
  }
}

async function publishPost(platformId, text, imageUrl, title) {
  const endpoint = POST_ENDPOINTS[platformId];
  if (!endpoint) throw new Error("Для этой площадки публикация не поддерживается");
  const body = { text, imageUrl: imageUrl || undefined };
  // VC.ru требует отдельный заголовок статьи
  if (platformId === "vc" && title) body.title = title;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || "Ошибка публикации");
  return data;
}

function cleanJSON(text) {
  return text.replace(/```json/gi, "").replace(/```/g, "").trim();
}

export default function StyleBot() {
  const [materials, setMaterials] = useState([]);
  const [draft, setDraft] = useState("");
  const [profile, setProfile] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [extraRules, setExtraRules] = useState([]);
  const [newRule, setNewRule] = useState("");
  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState("expert");
  const [selected, setSelected] = useState(["instagram", "telegram", "vk"]);
  const [results, setResults] = useState({});
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [cover, setCover] = useState({ status: "idle", prompt: "", url: "", note: "" });

  function addDraft() {
    const t = draft.trim();
    if (!t) return;
    const name = t.slice(0, 38) + (t.length > 38 ? "…" : "");
    setMaterials((m) => [...m, { id: Date.now() + Math.random(), name, text: t, type: "text", status: "ready" }]);
    setDraft("");
  }

  function toBase64(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(",")[1]);
      r.onerror = () => rej(new Error("Не удалось прочитать файл"));
      r.readAsDataURL(file);
    });
  }

  async function extractViaModel(file, kind) {
    const b64 = await toBase64(file);
    const block =
      kind === "pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
        : { type: "image", source: { type: "base64", media_type: file.type || "image/png", data: b64 } };
    const content = [
      block,
      { type: "text", text: "Извлеки весь текст из этого файла дословно — только текст, без своих комментариев, заголовков и форматирования." },
    ];
    return await generateText([{ role: "user", content }], undefined, 2000);
  }

  async function handleFiles(files) {
    for (const f of files) {
      const name = f.name;
      const isText = f.type.startsWith("text/") || /\.(txt|md|srt|vtt)$/i.test(name);
      const isDocx = /\.docx?$/i.test(name) || f.type.includes("wordprocessingml");
      const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(name);
      const isImage = f.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(name);
      const isMedia = f.type.startsWith("audio/") || f.type.startsWith("video/") || /\.(mp3|wav|m4a|ogg|flac|aac|mp4|mov|mkv|webm)$/i.test(name);
      const newId = Date.now() + Math.random();

      if (isText) {
        const text = await f.text();
        setMaterials((m) => [...m, { id: newId, name, text, type: "text", status: "ready" }]);
      } else if (isDocx) {
        setMaterials((m) => [...m, { id: newId, name, text: "", type: "docx", status: "processing" }]);
        try {
          const buf = await f.arrayBuffer();
          const out = await mammoth.extractRawText({ arrayBuffer: buf });
          setMaterials((m) => m.map((x) => (x.id === newId ? { ...x, text: out.value.trim(), status: "ready" } : x)));
        } catch {
          setMaterials((m) => m.map((x) => (x.id === newId ? { ...x, status: "awaiting" } : x)));
        }
      } else if (isPdf || isImage) {
        const type = isPdf ? "pdf" : "image";
        setMaterials((m) => [...m, { id: newId, name, text: "", type, status: "processing" }]);
        try {
          const text = await extractViaModel(f, type);
          setMaterials((m) => m.map((x) => (x.id === newId ? { ...x, text: text.trim(), status: text.trim() ? "ready" : "awaiting" } : x)));
        } catch (e) {
          setMaterials((m) => m.map((x) => (x.id === newId ? { ...x, status: "awaiting" } : x)));
          if (e.isLimit) setError(e.message);
        }
      } else if (isMedia) {
        const kind = f.type.startsWith("video/") || /\.(mp4|mov|mkv|webm)$/i.test(name) ? "video" : "audio";
        const sizeMb = (f.size / (1024 * 1024)).toFixed(1);
        setMaterials((m) => [...m, { id: newId, name: name + " · " + sizeMb + " МБ", text: "", type: kind, status: "awaiting" }]);
      }
    }
  }

  function setTranscript(id, text) {
    setMaterials((m) => m.map((x) => (x.id === id ? { ...x, text, status: text.trim() ? "ready" : "awaiting" } : x)));
  }

  function removeMaterial(id) {
    setMaterials((m) => m.filter((x) => x.id !== id));
  }

  async function analyzeStyle() {
    const ready = materials.filter((m) => m.text.trim());
    if (ready.length === 0) {
      setError("Добавьте хотя бы один текст. Для видео/аудио сначала нужна расшифровка.");
      return;
    }
    setError("");
    setAnalyzing(true);
    setProfile(null);
    try {
      const corpus = ready.map((m) => m.text).join("\n\n---\n\n").slice(0, 9000);
      const system =
        "Ты — аналитик авторского стиля письма. Изучи материалы автора и опиши его манеру максимально конкретно. Верни ТОЛЬКО валидный JSON без markdown. Структура: {\"тон\": строка, \"словарь\": [до 8 характерных слов/оборотов], \"длина_фраз\": строка, \"эмодзи\": какие эмодзи и как часто, \"фишки\": [до 5 фирменных приёмов], \"начало\": как заходит, \"концовка\": как завершает, \"обращение\": вы или ты и когда, \"резюме\": 1-2 предложения портрета}";
      const raw = await generateText([{ role: "user", content: "Материалы автора:\n\n" + corpus }], system);
      setProfile(JSON.parse(cleanJSON(raw)));
    } catch (e) {
      setError(e.isLimit ? e.message : "Не удалось разобрать стиль: " + e.message);
    }
    setAnalyzing(false);
  }

  function addRule() {
    const r = newRule.trim();
    if (!r) return;
    setExtraRules((x) => [...x, r]);
    setNewRule("");
  }

  function removeRule(i) {
    setExtraRules((x) => x.filter((_, idx) => idx !== i));
  }

  function togglePlatform(id) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function buildStyleBlock() {
    const example = (materials.find((m) => m.text.trim())?.text || "").slice(0, 600);
    let block =
      "ПАСПОРТ СТИЛЯ АВТОРА (JSON):\n" + JSON.stringify(profile, null, 2) +
      "\n\nЖИВОЙ ПРИМЕР ТЕКСТА АВТОРА:\n«" + example + "»\n\n" + COMMON_RULES;
    if (extraRules.length) {
      block += "\n\nДОПОЛНИТЕЛЬНЫЕ ПРАВКИ СТИЛЯ ОТ ПОЛЬЗОВАТЕЛЯ (обязательно соблюдать):\n- " + extraRules.join("\n- ");
    }
    return block;
  }

  async function generateOne(platform, correction, prev) {
    const fmt = FORMATS.find((f) => f.id === format);
    const system = buildStyleBlock() + "\n\nФОРМАТ: " + fmt.label + " (" + fmt.hint + ").\n\nПЛОЩАДКА: " + platform.spec;
    let userMsg = "Тема поста: " + topic.trim();
    if (correction && prev) {
      userMsg =
        "Тема поста: " + topic.trim() +
        "\n\nТы уже написал такой вариант:\n«" + prev + "»\n\nПользователь просит поправить: " + correction +
        "\n\nПерепиши пост с учётом этой правки, сохранив стиль автора и правила площадки.";
    }
    return await generateText([{ role: "user", content: userMsg }], system, platform.long ? 2000 : 1024);
  }

  async function generateAll() {
    if (!topic.trim()) return setError("Введите тему поста.");
    if (!profile) return setError("Сначала изучите стиль автора.");
    if (selected.length === 0) return setError("Выберите хотя бы одну площадку.");
    setError("");
    setGenerating(true);
    const init = {};
    selected.forEach((id) => (init[id] = { text: "", loading: true, correctionDraft: "", publishing: false, published: null }));
    setResults(init);
    for (const id of selected) {
      const platform = PLATFORMS.find((p) => p.id === id);
      try {
        const text = await generateOne(platform);
        setResults((r) => ({ ...r, [id]: { ...r[id], text, loading: false } }));
      } catch (e) {
        if (e.isLimit) {
          setResults((r) => {
            const next = { ...r };
            selected.forEach((pid) => {
              if (next[pid] && next[pid].loading) {
                next[pid] = { ...next[pid], text: "", loading: false, limited: true };
              }
            });
            return next;
          });
          setError(e.message);
          break;
        }
        setResults((r) => ({ ...r, [id]: { ...r[id], text: "Ошибка: " + e.message, loading: false } }));
      }
    }
    setGenerating(false);
  }

  async function generateCover() {
    if (!topic.trim()) return setError("Введите тему поста.");
    setError("");
    setCover({ status: "loading", prompt: "", url: "", note: "" });
    try {
      const ideaSystem =
        "Ты придумываешь идею обложки для поста. Опиши короткой фразой (1-2 предложения, на английском, для модели генерации изображений): что изобразить, настроение, цвета, композицию. Без текста на самой картинке. Никаких пояснений сверху — только готовый промпт.";
      const prompt = await generateText([{ role: "user", content: "Тема поста: " + topic.trim() }], ideaSystem, 200);
      const url = await generateImage(prompt.trim(), { aspectRatio: "1:1" });
      setCover({ status: "ready", prompt: prompt.trim(), url, note: "" });
    } catch (e) {
      if (e.isProviderStub) {
        setCover({ status: "stub", prompt: "", url: "", note: e.message });
      } else if (e.isLimit) {
        setCover({ status: "idle", prompt: "", url: "", note: "" });
        setError(e.message);
      } else {
        setCover({ status: "idle", prompt: "", url: "", note: "" });
        setError("Не удалось придумать обложку: " + e.message);
      }
    }
  }

  function setCorrectionDraft(id, val) {
    setResults((r) => ({ ...r, [id]: { ...r[id], correctionDraft: val } }));
  }

  async function retryOne(id) {
    const platform = PLATFORMS.find((p) => p.id === id);
    setError("");
    setResults((r) => ({ ...r, [id]: { ...r[id], loading: true, limited: false, published: null } }));
    try {
      const text = await generateOne(platform);
      setResults((r) => ({ ...r, [id]: { ...r[id], text, loading: false } }));
    } catch (e) {
      if (e.isLimit) {
        setResults((r) => ({ ...r, [id]: { ...r[id], loading: false, limited: true } }));
        setError(e.message);
        return;
      }
      setResults((r) => ({ ...r, [id]: { ...r[id], text: "Ошибка: " + e.message, loading: false } }));
    }
  }

  async function applyCorrection(id) {
    const cur = results[id];
    if (!cur || !cur.correctionDraft.trim()) return;
    const platform = PLATFORMS.find((p) => p.id === id);
    setError("");
    setResults((r) => ({ ...r, [id]: { ...r[id], loading: true, limited: false, published: null } }));
    try {
      const text = await generateOne(platform, cur.correctionDraft.trim(), cur.text);
      setResults((r) => ({ ...r, [id]: { ...r[id], text, loading: false } }));
    } catch (e) {
      if (e.isLimit) {
        setResults((r) => ({ ...r, [id]: { ...r[id], loading: false, limited: true } }));
        setError(e.message);
        return;
      }
      setResults((r) => ({ ...r, [id]: { ...r[id], text: "Ошибка: " + e.message, loading: false } }));
    }
  }

  function rememberRule(id) {
    const cur = results[id];
    if (!cur || !cur.correctionDraft.trim()) return;
    setExtraRules((x) => [...x, cur.correctionDraft.trim()]);
  }

  async function publishOne(id) {
    const cur = results[id];
    if (!cur || !cur.text || cur.text.startsWith("Ошибка")) return;
    const platform = PLATFORMS.find((p) => p.id === id);
    if (!platform.canPost) return;
    setResults((r) => ({ ...r, [id]: { ...r[id], publishing: true, published: null } }));
    try {
      const imageUrl = cover.status === "ready" ? cover.url : undefined;
      await publishPost(id, cur.text, imageUrl, topic.trim() || undefined);
      setResults((r) => ({ ...r, [id]: { ...r[id], publishing: false, published: "ok" } }));
    } catch (e) {
      setResults((r) => ({ ...r, [id]: { ...r[id], publishing: false, published: "error:" + e.message } }));
    }
  }

  async function openDzen(id) {
    const cur = results[id];
    if (!cur || !cur.text) return;
    try {
      await navigator.clipboard.writeText(cur.text);
    } catch {}
    window.open("https://dzen.ru/profile/editor/article/new", "_blank");
  }

  async function publishAll() {
    const postable = selected.filter((id) => {
      const p = PLATFORMS.find((p) => p.id === id);
      const r = results[id];
      return p?.canPost && r?.text && !r.text.startsWith("Ошибка") && !r.loading;
    });
    await Promise.all(postable.map((id) => publishOne(id)));
  }

  const hasPostableResults = selected.some((id) => {
    const p = PLATFORMS.find((p) => p.id === id);
    const r = results[id];
    return p?.canPost && r?.text && !r.text.startsWith("Ошибка") && !r.loading;
  });

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 p-4 sm:p-8">
      <div className="max-w-3xl mx-auto">
        <header className="mb-8 border-b border-zinc-200 pb-5">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-medium tracking-tight">СтильПостер</h1>
            <span className="text-sm text-zinc-500">пишет под каждую площадку в стиле автора</span>
          </div>
        </header>

        {/* STEP 1 — materials */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-600 text-white text-xs font-medium">1</span>
            <h2 className="text-base font-medium">База автора</h2>
            <span className="ml-auto text-xs text-zinc-500">{materials.length} матер.</span>
          </div>

          {materials.length > 0 && (
            <ul className="mb-3 space-y-1.5">
              {materials.map((m) => {
                const TYPE_LABEL = { video: "видео", audio: "аудио", pdf: "PDF", image: "скрин", docx: "Word", text: "текст" };
                const showEditable = ["video", "audio", "pdf", "image"].includes(m.type);
                return (
                  <li key={m.id} className="bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-400 text-xs uppercase font-medium w-12 shrink-0">{TYPE_LABEL[m.type] || "файл"}</span>
                      <span className="flex-1 truncate">{m.name}</span>
                      {m.status === "processing" ? (
                        <span className="text-xs text-violet-700 bg-violet-100 rounded px-2 py-0.5 shrink-0">обрабатываю…</span>
                      ) : m.status === "awaiting" ? (
                        <span className="text-xs text-amber-700 bg-amber-100 rounded px-2 py-0.5 shrink-0">{m.type === "audio" || m.type === "video" ? "ждёт расшифровки" : "нужен текст"}</span>
                      ) : (
                        <span className="text-xs text-green-700 bg-green-100 rounded px-2 py-0.5 shrink-0">готово</span>
                      )}
                      <button onClick={() => removeMaterial(m.id)} className="text-zinc-400 hover:text-red-500 text-lg leading-none shrink-0">×</button>
                    </div>
                    {showEditable && m.status !== "processing" && (
                      <textarea
                        value={m.text}
                        onChange={(e) => setTranscript(m.id, e.target.value)}
                        rows={2}
                        placeholder={m.type === "audio" || m.type === "video" ? "Расшифровка (на проде заполнит Whisper)." : "Извлечённый текст — можно поправить опечатки распознавания."}
                        className="mt-2 w-full rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} placeholder="Вставьте текст автора — пост, расшифровку видео или аудио…" className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none" />
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <button onClick={addDraft} className="rounded-lg bg-zinc-900 text-white text-sm px-4 py-2 hover:bg-zinc-700">Добавить текст</button>
            <label className="rounded-lg border border-zinc-300 bg-white text-sm px-4 py-2 cursor-pointer hover:bg-zinc-100">
              Загрузить файлы
              <input type="file" multiple accept=".txt,.md,.srt,.vtt,text/*,.doc,.docx,.pdf,application/pdf,image/*,audio/*,video/*" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            </label>
          </div>

          <button onClick={analyzeStyle} disabled={analyzing} className="mt-4 w-full rounded-lg bg-violet-600 text-white text-sm font-medium py-2.5 hover:bg-violet-700 disabled:opacity-50">
            {analyzing ? "Изучаю стиль…" : "Изучить стиль автора →"}
          </button>
        </section>

        {/* profile + rules */}
        {profile && (
          <section className="mb-6 bg-violet-50 border border-violet-200 rounded-xl p-4">
            <h3 className="text-sm font-medium text-violet-900 mb-3">Паспорт стиля</h3>
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Row k="Тон" v={profile["тон"]} />
              <Row k="Обращение" v={profile["обращение"]} />
              <Row k="Длина фраз" v={profile["длина_фраз"]} />
              <Row k="Эмодзи" v={profile["эмодзи"]} />
              <Row k="Заход" v={profile["начало"]} />
              <Row k="Концовка" v={profile["концовка"]} />
              {Array.isArray(profile["словарь"]) && <Row k="Словарь" v={profile["словарь"].join(", ")} />}
            </dl>
            {Array.isArray(profile["фишки"]) && (
              <div className="mt-3">
                <span className="text-xs text-violet-700 font-medium">Фирменные приёмы:</span>
                <ul className="list-disc list-inside text-sm text-zinc-700 mt-1">{profile["фишки"].map((f, i) => <li key={i}>{f}</li>)}</ul>
              </div>
            )}
            {profile["резюме"] && <p className="mt-3 text-sm italic text-violet-800">{profile["резюме"]}</p>}

            <div className="mt-4 pt-3 border-t border-violet-200">
              <span className="text-xs text-violet-700 font-medium">Правила стиля (стоп-лист и пожелания):</span>
              {extraRules.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {extraRules.map((r, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm bg-white border border-violet-200 rounded px-2.5 py-1.5">
                      <span className="flex-1">{r}</span>
                      <button onClick={() => removeRule(i)} className="text-zinc-400 hover:text-red-500 text-lg leading-none">×</button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2 mt-2">
                <input value={newRule} onChange={(e) => setNewRule(e.target.value)} placeholder="напр.: не использовать книжные обороты" className="flex-1 rounded-md border border-violet-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                <button onClick={addRule} className="rounded-md border border-violet-300 text-violet-700 text-sm px-3 py-1.5 hover:bg-violet-100">Добавить</button>
              </div>
            </div>
          </section>
        )}

        {/* STEP 2 — generate */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-600 text-white text-xs font-medium">2</span>
            <h2 className="text-base font-medium">Новый пост</h2>
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            {FORMATS.map((f) => (
              <button key={f.id} onClick={() => setFormat(f.id)} title={f.hint} className={"rounded-full text-sm px-3 py-1.5 border " + (format === f.id ? "bg-violet-600 text-white border-violet-600" : "bg-white text-zinc-600 border-zinc-300 hover:border-violet-400")}>{f.label}</button>
            ))}
          </div>

          <div className="mb-3">
            <span className="text-xs text-zinc-500">Площадки:</span>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {PLATFORMS.map((p) => (
                <button key={p.id} onClick={() => togglePlatform(p.id)} className={"rounded-lg text-sm px-3 py-1.5 border " + (selected.includes(p.id) ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-600 border-zinc-300 hover:border-zinc-500")}>{p.label}</button>
              ))}
            </div>
          </div>

          <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={2} placeholder="О чём пост? напр.: почему в 2026 нельзя закрыть вакансию, просто подняв зарплату" className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none" />
          <div className="flex flex-wrap gap-2 mt-3">
            <button onClick={generateAll} disabled={generating} className="flex-1 rounded-lg bg-zinc-900 text-white text-sm font-medium py-2.5 hover:bg-zinc-700 disabled:opacity-50">
              {generating ? "Пишу версии…" : "Сгенерировать посты"}
            </button>
            <button onClick={generateCover} disabled={cover.status === "loading"} className="flex-1 rounded-lg border border-zinc-300 bg-white text-zinc-700 text-sm font-medium py-2.5 hover:bg-zinc-100 disabled:opacity-50">
              {cover.status === "loading" ? "Рисую обложку…" : "Сгенерировать обложку"}
            </button>
          </div>

          {cover.status === "ready" && (
            <div className="mt-3 bg-white border border-zinc-200 rounded-lg p-3 flex gap-3 items-start">
              <img src={cover.url} alt="Обложка поста" className="w-24 h-24 rounded-md object-cover shrink-0" />
              <div>
                <span className="text-xs text-zinc-400 uppercase font-medium">Идея обложки</span>
                <p className="text-sm text-zinc-700 mt-0.5">{cover.prompt}</p>
              </div>
            </div>
          )}
          {cover.status === "stub" && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <p className="text-sm text-amber-800">{cover.note}</p>
            </div>
          )}
        </section>

        {error && <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        {hasPostableResults && (
          <div className="mb-4">
            <button onClick={publishAll} className="w-full rounded-lg bg-emerald-600 text-white text-sm font-medium py-2.5 hover:bg-emerald-700">
              Опубликовать всё (Telegram + VK + MAX + VC.ru)
            </button>
            <p className="text-xs text-zinc-400 mt-1 text-center">
              Требуются env vars: TG_BOT_TOKEN, VK_TOKEN, MAX_BOT_TOKEN, VC_TOKEN — и соответствующие ID каналов
            </p>
          </div>
        )}

        <div className="space-y-4">
          {selected.map((id) => {
            const r = results[id];
            if (!r) return null;
            const platform = PLATFORMS.find((p) => p.id === id);
            return (
              <div key={id} className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-100">
                  <span className="text-sm font-medium">{platform.label}</span>
                  <div className="flex items-center gap-2">
                    {!r.loading && r.text && !r.text.startsWith("Ошибка") && (
                      <button onClick={() => navigator.clipboard.writeText(r.text)} className="text-xs border border-zinc-300 rounded-md px-2.5 py-1 hover:bg-zinc-100">Копировать</button>
                    )}
                    {platform.canPost && !r.loading && r.text && !r.text.startsWith("Ошибка") && (
                      <button
                        onClick={() => publishOne(id)}
                        disabled={r.publishing}
                        className={"text-xs rounded-md px-2.5 py-1 " + (
                          r.published === "ok"
                            ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                            : r.published?.startsWith("error")
                            ? "bg-red-100 text-red-700 border border-red-300"
                            : "bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                        )}
                      >
                        {r.publishing ? "Публикую…" : r.published === "ok" ? "Опубликовано ✓" : r.published?.startsWith("error") ? "Ошибка — повторить" : "Опубликовать"}
                      </button>
                    )}
                    {platform.dzenHelper && !r.loading && r.text && !r.text.startsWith("Ошибка") && (
                      <button
                        onClick={() => openDzen(id)}
                        className="text-xs rounded-md px-2.5 py-1 bg-orange-500 text-white hover:bg-orange-600"
                        title="Скопирует текст в буфер и откроет Дзен Студию"
                      >
                        Открыть в Дзен Студии ↗
                      </button>
                    )}
                  </div>
                </div>

                {r.published?.startsWith("error") && (
                  <div className="px-5 pt-3">
                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2.5 py-1.5">
                      {r.published.replace("error:", "")}
                    </p>
                  </div>
                )}

                <div className="px-5 py-4">
                  {r.loading ? (
                    <p className="text-sm text-zinc-400">Пишу…</p>
                  ) : r.limited ? (
                    <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                      <p className="text-sm text-amber-800">Лимит запросов временно исчерпан — этот пост не сгенерирован.</p>
                      <button onClick={() => retryOne(id)} className="shrink-0 text-xs bg-amber-600 text-white rounded-md px-3 py-1.5 hover:bg-amber-700">Повторить</button>
                    </div>
                  ) : (
                    <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{r.text}</p>
                  )}
                </div>
                {!r.loading && r.text && !r.text.startsWith("Ошибка") && (
                  <div className="px-5 pb-4 pt-1 border-t border-zinc-100 bg-zinc-50">
                    <span className="text-xs text-zinc-500">Что поправить в стиле?</span>
                    <textarea value={r.correctionDraft} onChange={(e) => setCorrectionDraft(id, e.target.value)} rows={2} placeholder="напр.: эмодзи гуще / убери книжные обороты / сделай короче / добавь призыв" className="mt-1.5 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none" />
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button onClick={() => applyCorrection(id)} className="rounded-md bg-violet-600 text-white text-sm px-3 py-1.5 hover:bg-violet-700">Переписать с правкой</button>
                      <button onClick={() => rememberRule(id)} title="Сохранить как постоянное правило стиля для всех будущих постов" className="rounded-md border border-violet-300 text-violet-700 text-sm px-3 py-1.5 hover:bg-violet-50">Запомнить как правило стиля</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }) {
  if (!v) return null;
  return (
    <div>
      <dt className="text-xs text-violet-600 font-medium">{k}</dt>
      <dd className="text-zinc-800">{v}</dd>
    </div>
  );
}
