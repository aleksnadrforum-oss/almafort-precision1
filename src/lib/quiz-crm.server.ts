// Лид из инженерного квиза: контакт + сделка в CRM с фолбеком на аварийное письмо.

export type QuizLead = {
  name: string;
  phone: string;
  email?: string;
  quiz_answers: Record<string, string>;
  file_urls: string[];
};

export const QUIZ_TAG = "Квиз_Производство";
export const QUIZ_DEAL_TITLE = "Заявка на Инжиниринг (Квиз)";

export function quizNote(lead: QuizLead) {
  const answers = Object.entries(lead.quiz_answers)
    .map(([k, v]) => `• ${k}: ${v}`)
    .join("\n");
  const files = lead.file_urls.length
    ? lead.file_urls.map((u) => `• ${u}`).join("\n")
    : "• файлы не приложены";
  return [
    `Имя: ${lead.name}`,
    `Телефон: ${lead.phone}`,
    lead.email ? `E-mail: ${lead.email}` : "",
    "",
    "Ответы квиза:",
    answers,
    "",
    "Файлы клиента:",
    files,
  ]
    .filter(Boolean)
    .join("\n");
}

export type QuizCrmResult = { crm: "amocrm" | "bitrix24" | "none"; ok: boolean; detail?: string };

export async function pushQuizLead(lead: QuizLead): Promise<QuizCrmResult> {
  const bitrixHook = process.env["BITRIX24_WEBHOOK_URL"];
  const amoBase = process.env["AMOCRM_BASE_URL"];
  const amoToken = process.env["AMOCRM_ACCESS_TOKEN"];

  let result: QuizCrmResult;
  try {
    if (bitrixHook) result = await bitrix(lead, bitrixHook);
    else if (amoBase && amoToken) result = await amo(lead, amoBase, amoToken);
    else {
      console.info("[quiz] CRM не подключена, лид в логе:\n" + quizNote(lead));
      return { crm: "none", ok: true, detail: "CRM не подключена — лид записан в лог" };
    }
  } catch (e) {
    result = { crm: bitrixHook ? "bitrix24" : "amocrm", ok: false, detail: String(e) };
  }

  if (!result.ok) await alertAdmin(lead, result.detail ?? "CRM недоступна");
  return result;
}

/** Аварийное письмо администратору, если CRM не приняла лид. */
async function alertAdmin(lead: QuizLead, reason: string) {
  const to = process.env["ADMIN_ALERT_EMAIL"];
  const apiKey = process.env["RESEND_API_KEY"];
  const from = process.env["ALERT_FROM_EMAIL"] ?? "onboarding@resend.dev";
  const body = `CRM не приняла заявку (${reason}).\n\n${quizNote(lead)}`;
  if (!to || !apiKey) {
    console.error("[quiz][FALLBACK] почта не настроена, лид только в логе:\n" + body);
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `[ALMAFORT] Потерянный лид из квиза — ${lead.phone}`,
        text: body,
      }),
    });
    if (!res.ok) console.error(`[quiz][FALLBACK] Resend [${res.status}]: ${await res.text()}`);
  } catch (e) {
    console.error("[quiz][FALLBACK] ошибка отправки письма:", e);
  }
}

async function bitrix(lead: QuizLead, hook: string): Promise<QuizCrmResult> {
  const base = hook.replace(/\/+$/, "");

  // 1. Ищем контакт по телефону, создаём при отсутствии.
  let contactId: number | undefined;
  const found = await fetch(`${base}/crm.duplicate.findbycomm.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity_type: "CONTACT", type: "PHONE", values: [lead.phone] }),
  });
  if (found.ok) {
    const j = (await found.json().catch(() => null)) as { result?: { CONTACT?: number[] } } | null;
    contactId = j?.result?.CONTACT?.[0];
  }
  if (!contactId) {
    const created = await fetch(`${base}/crm.contact.add.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          NAME: lead.name,
          PHONE: [{ VALUE: lead.phone, VALUE_TYPE: "WORK" }],
          ...(lead.email ? { EMAIL: [{ VALUE: lead.email, VALUE_TYPE: "WORK" }] } : {}),
          SOURCE_ID: "WEB",
        },
      }),
    });
    if (!created.ok) {
      return { crm: "bitrix24", ok: false, detail: `contact.add [${created.status}]` };
    }
    const j = (await created.json().catch(() => null)) as { result?: number } | null;
    contactId = j?.result;
  }

  // 2. Сделка в первичной стадии «Неразобранное».
  const deal = await fetch(`${base}/crm.deal.add.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        TITLE: QUIZ_DEAL_TITLE,
        CONTACT_ID: contactId,
        CATEGORY_ID: process.env["CRM_QUIZ_CATEGORY_ID"] ?? 0,
        STAGE_ID: process.env["CRM_QUIZ_STAGE_ID"] ?? "NEW",
        COMMENTS: quizNote(lead),
        SOURCE_ID: "WEB",
        UTM_CAMPAIGN: QUIZ_TAG,
      },
    }),
  });
  if (!deal.ok) {
    return { crm: "bitrix24", ok: false, detail: `deal.add [${deal.status}]: ${await deal.text()}` };
  }
  return { crm: "bitrix24", ok: true };
}

async function amo(lead: QuizLead, baseUrl: string, token: string): Promise<QuizCrmResult> {
  const base = baseUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}/api/v4/leads/complex`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify([
      {
        name: QUIZ_DEAL_TITLE,
        ...(process.env["CRM_QUIZ_PIPELINE_ID"]
          ? { pipeline_id: Number(process.env["CRM_QUIZ_PIPELINE_ID"]) }
          : {}),
        _embedded: {
          contacts: [
            {
              name: lead.name,
              custom_fields_values: [
                { field_code: "PHONE", values: [{ value: lead.phone, enum_code: "WORK" }] },
                ...(lead.email
                  ? [{ field_code: "EMAIL", values: [{ value: lead.email, enum_code: "WORK" }] }]
                  : []),
              ],
            },
          ],
          tags: [{ name: QUIZ_TAG }],
        },
        notes: [{ note_type: "common", params: { text: quizNote(lead) } }],
      },
    ]),
  });
  if (!res.ok) {
    return { crm: "amocrm", ok: false, detail: `leads/complex [${res.status}]: ${await res.text()}` };
  }
  return { crm: "amocrm", ok: true };
}
