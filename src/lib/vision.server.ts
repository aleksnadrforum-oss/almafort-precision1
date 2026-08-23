// Vision-конвейер: кадр → изоляция объекта → ИИ-классификатор → подбор SKU ALMAFORT.
// Стадии: 1) кроп по рамке и отсев рук/органики, 2) классификация мультимодальной LLM,
// 3) маршрутизация по Confidence Score (см. src/routes/api/vision/identify.ts).
import { PRODUCTS, type Product } from "@/data/catalog";
import { aiComplete } from "@/lib/ai-provider.server";
import { activePrompt, logLlmCall } from "@/lib/llm-log.server";
import { uploadObject } from "@/lib/s3.server";

export type VisionStatus = "VALID" | "FOREIGN" | "INVALID";

export type VisionVerdict = {
  /** VALID — техническая деталь класса ALMAFORT, FOREIGN — деталь не из матрицы,
   *  INVALID — рука, лицо, животное, темнота или посторонний предмет. */
  status: VisionStatus;
  type: string;
  shape: string;
  color: string;
  has_threads: boolean;
  /** 0..1 */
  confidence: number;
  /** Что именно увидела модель — для сценария «мусор в кадре». */
  observed: string;
  /** Обнаружены ли пальцы/ладонь: влияет на изоляцию объекта. */
  hands_present: boolean;
  /** Кадр тёмный / деталь сливается с фоном — гадать по пикселям запрещено. */
  low_light: boolean;
  /** Отличительные визуальные маркеры: металлический каркас, фактура, форма шляпки. */
  markers: string[];
};

const MODEL = "google/gemini-3.6-flash";

const SYSTEM_PROMPT =
  "Ты — инженер ALMAFORT и промышленный сканер каталога. На фото — кадр, обрезанный по рамке " +
  "видоискателя. Твоя задача — классифицировать объект, а не угадывать артикул и размер до миллиметра.\n" +
  "Стадия изоляции: если объект лежит на ладони или его держат пальцами — мысленно вырежи руки и " +
  "фон, анализируй только геометрию неорганического предмета. Если в кадре ТОЛЬКО рука, лицо, " +
  "животное, еда, клавиатура, кадр чёрный/пустой/смазанный — верни status INVALID.\n" +
  "Если это техническая пластиковая или металлическая деталь, но её формы нет среди классов " +
  "ALMAFORT (заглушки внутренние, заглушки декоративные, опоры и подпятники, мебельный крепёж, " +
  "комплектующие для ДПК, комплектующие для канистр, детали для сэндвич-панелей) — верни status FOREIGN.\n" +
  "Иначе верни status VALID и класс детали.\n" +
  "Масштаб по фото не определяется: НИКОГДА не называй конкретный размер (15х15 или 100х100 " +
  "выглядят на снимке одинаково) — определяй только класс и форму.\n" +
  "Fine-grained: отмечай в markers отличительные признаки — «металлический каркас», " +
  "«цельный пластик», «фактура металла», «широкая шляпка», «резьбовой шток».\n" +
  "low_light=true, если кадр тёмный, засвечен бликом или деталь по цвету сливается с фоном — " +
  "в этом случае не угадывай класс.\n" +
  "confidence — целое 0..100: насколько уверенно объект соответствует классу ALMAFORT.\n" +
  "Ответ СТРОГО JSON без markdown: " +
  '{"status":"VALID|FOREIGN|INVALID","type":"заглушка/опора/крепеж/колпачок/хомут","shape":' +
  '"квадрат/круг/прямоугольник","color":"черный/серый/белый","has_threads":true|false,' +
  '"confidence":0-100,"observed":"что видно на фото","hands_present":true|false,' +
  '"low_light":true|false,"markers":["металлический каркас"]}';

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  const bin = atob(m[2]!);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime: m[1]! };
}

/**
 * Shadow Logging: кадры со Score < 50% анонимно уезжают в S3 /vision_fails/,
 * чтобы раз в месяц вручную связать неудачный ракурс с артикулом.
 */
export async function logVisionFail(imageDataUrl: string, verdict: VisionVerdict) {
  try {
    const parsed = dataUrlToBytes(imageDataUrl);
    if (!parsed) return;
    const ext = parsed.mime.split("/")[1] ?? "webp";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rand = crypto.randomUUID().slice(0, 8);
    const key = `vision_fails/${stamp}_${verdict.status}_${Math.round(
      verdict.confidence * 100,
    )}_${rand}.${ext}`;
    await uploadObject(key, parsed.bytes, parsed.mime);
  } catch (e) {
    console.error("[vision] shadow log failed", e);
  }
}

export async function identifyPart(imageDataUrl: string): Promise<VisionVerdict> {
  const system = (await activePrompt("vision")) ?? SYSTEM_PROMPT;

  let completion;
  try {
    completion = await aiComplete({
      task: "vision",
      system,
      content: [
        { type: "text", text: "Классифицируй объект на фото." },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ],
      timeoutMs: 25_000,
    });
  } catch (e) {
    void logLlmCall({
      kind: "vision",
      prompt: system,
      response: e instanceof Error ? e.message : "unknown",
      parseStatus: "api_error",
      model: MODEL,
      usage: { prompt_tokens: 0, completion_tokens: 0 },
    });
    throw e;
  }

  const raw = completion.text;
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);

  let parsed: Partial<VisionVerdict> = {};
  let parseStatus: "ok" | "json_error" = "ok";
  try {
    parsed = JSON.parse(match?.[0] ?? cleaned) as Partial<VisionVerdict>;
  } catch {
    parseStatus = "json_error";
  }

  void logLlmCall({
    kind: "vision",
    prompt: system,
    response: raw,
    parseStatus,
    model: completion.model,
    usage: completion.usage,
  });


  const rawStatus = String(parsed.status ?? "").toUpperCase();
  const status: VisionStatus =
    rawStatus === "FOREIGN" ? "FOREIGN" : rawStatus === "INVALID" ? "INVALID" : "VALID";

  // Модель отдаёт 0..100, но иногда 0..1 — нормализуем в долю.
  const rawConf = Number(parsed.confidence);
  const conf = Number.isFinite(rawConf) ? (rawConf > 1 ? rawConf / 100 : rawConf) : 0.5;

  return {
    status: parseStatus === "json_error" ? "INVALID" : status,
    type: String(parsed.type ?? "деталь").toLowerCase(),
    shape: String(parsed.shape ?? "").toLowerCase(),
    color: String(parsed.color ?? "").toLowerCase(),
    has_threads: Boolean(parsed.has_threads),
    confidence: status === "INVALID" ? Math.min(0.09, conf) : Math.min(1, Math.max(0, conf)),
    observed: String(parsed.observed ?? "").slice(0, 160),
    hands_present: Boolean(parsed.hands_present),
    low_light: Boolean(parsed.low_light),
    markers: Array.isArray(parsed.markers)
      ? parsed.markers.slice(0, 5).map((m) => String(m).slice(0, 40))
      : [],
  };
}

const TYPE_KEYS: Array<[RegExp, string]> = [
  [/декоратив|евровинт|эксцентрик|самореза/i, "Заглушки декоративные"],
  [/заглуш/i, "Заглушки внутренние"],
  [/опор|подпятник|ножк/i, "Опоры и подпятники"],
  [/тетрагедрон|сэндвич|крепсс/i, "Для производства сэндвич-панелей"],
  [/кляймер|дпк|террас/i, "Комплектующие для ДПК"],
  [/крышк|канистр|тара/i, "Комплектующие для канистр"],
  [/уголок|держател|хвост|крепеж|крепёж/i, "Мебельный крепеж"],
];

/** Класс детали (категория каталога) по вердикту ИИ — для сценария 3.1. */
export function verdictCategory(v: VisionVerdict): string | null {
  return TYPE_KEYS.find(([re]) => re.test(v.type))?.[1] ?? null;
}

/** Ранжирование каталога по вердикту ИИ: тип задаёт категорию, форма — уточнение. */
export function matchProducts(v: VisionVerdict, limit = 3): Product[] {
  const category = verdictCategory(v);
  const square = /квадрат|square/.test(v.shape);
  const round = /кругл|round|circle/.test(v.shape);
  const rect = /прямоуг|rect/.test(v.shape);

  return PRODUCTS.filter((p) => !shapeConflict(p, { square, round }))
    .map((p) => {
      let score = 0;
      if (category && p.category === category) score += 10;
      if (square && /квадратн/i.test(p.name)) score += 5;
      if (round && /кругл|Ø/i.test(`${p.name} ${p.dims}`)) score += 5;
      if (rect && /прямоугольн/i.test(p.name)) score += 5;
      // Резьба на детали сужает выбор до резьбовых групп каталога.
      if (v.has_threads && /Мебельный крепеж|сэндвич-панелей/.test(p.category)) score += 4;
      if (!v.has_threads && /Заглушки/.test(p.category)) score -= 2;
      if (p.stock.qty > 0) score += 1;
      return { p, score };
    })

    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || b.p.stock.qty - a.p.stock.qty)
    .slice(0, limit)
    .map((r) => r.p);
}

/**
 * Жёсткая отсечка заведомо невозможных форм: если на фото квадрат, круглые
 * варианты в список не попадают вообще (и наоборот) — угадывать нельзя.
 */
function shapeConflict(p: Product, s: { square: boolean; round: boolean }): boolean {
  const text = `${p.name} ${p.dims}`;
  if (s.square && !s.round) return /кругл|Ø/i.test(text);
  if (s.round && !s.square) return /квадратн/i.test(text);
  return false;
}

/** Сценарий 3.1: весь размерный ряд распознанного класса — «Выберите размер». */
export function classVariants(v: VisionVerdict, limit = 24): Product[] {
  const category = verdictCategory(v);
  if (!category) return [];
  const square = /квадрат|square/.test(v.shape);
  const round = /кругл|round|circle/.test(v.shape);
  return PRODUCTS.filter((p) => p.category === category && !p.is_service)
    .filter((p) => !shapeConflict(p, { square, round }))
    .sort((a, b) => b.stock.qty - a.stock.qty)
    .slice(0, limit);
}

/**
 * Уверенность ниже порога: ИИ обязан не выдавать артикул, а спросить человека.
 * Возвращает 2–3 категории-кандидата с товарами для ручного уточнения.
 */
export function candidateCategories(
  v: VisionVerdict,
  limit = 3,
): Array<{ category: string; items: Product[] }> {
  const ranked = matchProducts(v, 40);
  const order: string[] = [];
  for (const p of ranked) {
    if (!p.is_service && !order.includes(p.category)) order.push(p.category);
  }
  const fallback = ["Заглушки внутренние", "Опоры и подпятники", "Мебельный крепеж"];
  for (const c of fallback) if (order.length < 2 && !order.includes(c)) order.push(c);

  return order.slice(0, limit).map((category) => ({
    category,
    items: PRODUCTS.filter((p) => p.category === category && !p.is_service)
      .sort((a, b) => b.stock.qty - a.stock.qty)
      .slice(0, 6),
  }));
}

