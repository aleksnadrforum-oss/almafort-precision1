// Отправка сделки в CRM: поддержаны amoCRM (Bearer-токен) и Bitrix24 (входящий вебхук).
// Если ключей нет — заказ не теряется: пишем структурированный лог и возвращаем skipped.

export type CrmOrder = {
  customer: { name: string; phone: string; email?: string; company?: string; comment?: string };
  city: string;
  carrierLabel: string;
  deliveryPrice: number;
  goodsPrice: number;
  total: number;
  invoiceUrl: string | null;
  items: Array<{ sku: string; name: string; quantity: number; unit: number; sum: number }>;
};

const SOURCE_TAG = "b2b_platform";

const money = (n: number) =>
  n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function dealTitle(o: CrmOrder) {
  return `B2B-Платформа: Заказ на ${money(o.total)} ₽ (${o.city || "город не указан"})`;
}

export function dealDescription(o: CrmOrder) {
  const rows = o.items
    .map((i) => `${i.sku} — ${i.name} · ${i.quantity} шт × ${money(i.unit)} = ${money(i.sum)} ₽`)
    .join("\n");
  return [
    `Источник: ${SOURCE_TAG}`,
    `Клиент: ${o.customer.name}${o.customer.company ? `, ${o.customer.company}` : ""}`,
    `Телефон: ${o.customer.phone}`,
    o.customer.email ? `E-mail: ${o.customer.email}` : "",
    `Город: ${o.city}`,
    `Транспортная компания: ${o.carrierLabel}`,
    `Стоимость доставки: ${money(o.deliveryPrice)} ₽`,
    `Товары: ${money(o.goodsPrice)} ₽`,
    `Итого к оплате: ${money(o.total)} ₽`,
    o.invoiceUrl ? `Счёт (PDF): ${o.invoiceUrl}` : "Счёт: файл не выгружен в хранилище",
    o.customer.comment ? `Комментарий: ${o.customer.comment}` : "",
    "",
    "Состав заказа:",
    rows,
  ]
    .filter(Boolean)
    .join("\n");
}

export type CrmResult = { crm: "amocrm" | "bitrix24" | "none"; ok: boolean; detail?: string };

export async function pushToCrm(order: CrmOrder): Promise<CrmResult> {
  const bitrixHook = process.env["BITRIX24_WEBHOOK_URL"];
  const amoBase = process.env["AMOCRM_BASE_URL"];
  const amoToken = process.env["AMOCRM_ACCESS_TOKEN"];

  if (bitrixHook) return bitrix(order, bitrixHook);
  if (amoBase && amoToken) return amo(order, amoBase, amoToken);

  console.info("[checkout] CRM не подключена, лид сохранён в логе:", dealDescription(order));
  return { crm: "none", ok: true, detail: "CRM не подключена — заказ записан в лог сервера" };
}

async function bitrix(order: CrmOrder, hook: string): Promise<CrmResult> {
  const base = hook.replace(/\/+$/, "");
  const contact = await fetch(`${base}/crm.contact.add.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        NAME: order.customer.name,
        COMPANY_TITLE: order.customer.company ?? "",
        PHONE: [{ VALUE: order.customer.phone, VALUE_TYPE: "WORK" }],
        ...(order.customer.email
          ? { EMAIL: [{ VALUE: order.customer.email, VALUE_TYPE: "WORK" }] }
          : {}),
        SOURCE_ID: SOURCE_TAG,
        UTM_SOURCE: SOURCE_TAG,
      },
    }),
  });
  const contactJson = (await contact.json().catch(() => null)) as { result?: number } | null;
  if (!contact.ok) {
    const detail = `Bitrix24 contact.add [${contact.status}]`;
    console.error(detail);
    return { crm: "bitrix24", ok: false, detail };
  }

  const deal = await fetch(`${base}/crm.deal.add.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        TITLE: dealTitle(order),
        OPPORTUNITY: order.total,
        CURRENCY_ID: "RUB",
        CONTACT_ID: contactJson?.result,
        COMMENTS: dealDescription(order),
        SOURCE_ID: SOURCE_TAG,
        UTM_SOURCE: SOURCE_TAG,
      },
    }),
  });
  if (!deal.ok) {
    const body = await deal.text();
    const detail = `Bitrix24 deal.add [${deal.status}]: ${body}`;
    console.error(detail);
    return { crm: "bitrix24", ok: false, detail };
  }
  return { crm: "bitrix24", ok: true };
}

async function amo(order: CrmOrder, baseUrl: string, token: string): Promise<CrmResult> {
  const base = baseUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}/api/v4/leads/complex`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify([
      {
        name: dealTitle(order),
        price: Math.round(order.total),
        _embedded: {
          contacts: [
            {
              name: order.customer.name,
              custom_fields_values: [
                {
                  field_code: "PHONE",
                  values: [{ value: order.customer.phone, enum_code: "WORK" }],
                },
                ...(order.customer.email
                  ? [
                      {
                        field_code: "EMAIL",
                        values: [{ value: order.customer.email, enum_code: "WORK" }],
                      },
                    ]
                  : []),
              ],
            },
          ],
          tags: [{ name: SOURCE_TAG }],
        },
        notes: [{ note_type: "common", params: { text: dealDescription(order) } }],
      },
    ]),
  });
  if (!res.ok) {
    const body = await res.text();
    const detail = `amoCRM leads/complex [${res.status}]: ${body}`;
    console.error(detail);
    return { crm: "amocrm", ok: false, detail };
  }
  return { crm: "amocrm", ok: true };
}
