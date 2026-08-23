import { useState } from "react";
import { Plus } from "lucide-react";

const ITEMS = [
  {
    q: "Как происходит возврат при обнаружении брака?",
    a: "Вся продукция проходит строгий контроль качества (соответствие ГОСТ/ТУ). При выявлении скрытого производственного дефекта возврат и замена партии осуществляются на 100% за счет ALMAFORT в кратчайшие сроки.",
  },
  {
    q: "Возможен ли возврат товара надлежащего качества?",
    a: "Да, по согласованию с вашим персональным менеджером в течение 14 дней с момента отгрузки. Обязательные условия: полное сохранение товарного вида, целостность упаковки и отсутствие следов монтажа.",
  },
  {
    q: "Можно ли вернуть детали, изготовленные на заказ?",
    a: "Нет. Детали и узлы, изготовленные методом серийного литья или 3D-печати по индивидуальным чертежам и спецификациям заказчика, возврату и обмену не подлежат.",
  },
  {
    q: "С какими юридическими лицами вы работаете?",
    a: "Мы работаем преимущественно с юридическими лицами и ИП. Оплата по безналичному расчету (по выставленному счету), закрывающие документы передаем оперативно через системы ЭДО или вместе с грузом.",
  },
];

const FAQ_JSONLD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: ITEMS.map((i) => ({
    "@type": "Question",
    name: i.q,
    acceptedAnswer: { "@type": "Answer", text: i.a },
  })),
};

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section id="faq" className="bg-background py-20 lg:py-28">
      <div className="mx-auto max-w-[800px] px-5">
        <h2 className="text-center text-[28px] font-extrabold uppercase leading-tight tracking-tight text-foreground lg:text-[40px]">
          Частые вопросы и гарантии
        </h2>

        <div className="mx-auto mt-12 max-w-[800px] border-t border-border text-left">
          {ITEMS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q} className="border-b border-border">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="group flex w-full cursor-pointer items-start justify-between gap-6 py-5 text-left"
                >
                  <span
                    className={`text-[18px] font-semibold leading-snug transition-colors ${
                      isOpen ? "text-foreground" : "text-foreground/90 group-hover:text-foreground"
                    }`}
                  >
                    {item.q}
                  </span>

                  <Plus
                    className={`mt-0.5 size-5 shrink-0 transition-all duration-300 ${
                      isOpen
                        ? "rotate-45 text-primary"
                        : "text-muted-foreground group-hover:rotate-45 group-hover:text-primary"
                    }`}
                    strokeWidth={1.75}
                  />
                </button>
                <div
                  className="grid transition-all duration-300 ease-in-out"
                  style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                >
                  <div className="overflow-hidden">
                    <p className="pb-6 pr-10 pt-4 text-[16px] leading-[1.6] text-[#595959]">
                      {item.a}
                    </p>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }}
      />
    </section>
  );
}
