import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BackLink } from "@/components/back-link";
import { COMPANY, companyEmail } from "@/lib/company";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Политика конфиденциальности — ALMAFORT" },
      {
        name: "description",
        content:
          "Порядок обработки персональных данных пользователей сайта ALMAFORT в соответствии с Федеральным законом № 152-ФЗ.",
      },
      { property: "og:title", content: "Политика конфиденциальности — ALMAFORT" },
      {
        property: "og:description",
        content: "Как ALMAFORT собирает, хранит и защищает персональные данные клиентов (152-ФЗ).",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const [mail, setMail] = useState("");
  useEffect(() => setMail(companyEmail()), []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="w-full flex-1 mx-auto w-full max-w-[820px] px-4 pb-20 pt-8 sm:px-5 lg:px-10">
        <BackLink />
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-foreground [overflow-wrap:anywhere] lg:text-[40px]">
          Политика конфиденциальности
        </h1>
        <div className="mt-8 space-y-6 text-sm leading-[1.75] text-muted-foreground [overflow-wrap:anywhere]">
          <p>
            Настоящая Политика определяет порядок обработки и защиты персональных данных
            пользователей сайта {COMPANY.site} и действует в отношении оператора —{" "}
            {COMPANY.legalName} (ИНН {COMPANY.inn}, ОГРН {COMPANY.ogrn}), адрес:{" "}
            {COMPANY.legalAddressFull}.
          </p>
          <div>
            <h2 className="text-lg font-bold text-foreground">1. Состав данных</h2>
            <p className="mt-2">
              Оператор обрабатывает данные, которые пользователь сообщает добровольно: имя,
              номер телефона, адрес электронной почты, название компании, город доставки,
              содержание сообщений и приложенные файлы спецификаций и чертежей.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">2. Цели обработки</h2>
            <p className="mt-2">
              Подготовка коммерческих предложений и счетов, расчёт доставки, исполнение
              договоров поставки и производства, обратная связь по заявкам.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">3. Правовое основание</h2>
            <p className="mt-2">
              Федеральный закон № 152-ФЗ «О персональных данных», согласие субъекта
              персональных данных, выражаемое проставлением отметки в формах сайта.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">4. Хранение и передача</h2>
            <p className="mt-2">
              Данные хранятся на серверах, расположенных на территории Российской Федерации, и
              не передаются третьим лицам, за исключением транспортных компаний в объёме,
              необходимом для доставки заказа.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">5. Отзыв согласия</h2>
            <p className="mt-2">
              Согласие может быть отозвано в любой момент письмом на{" "}
              {mail ? (
                <a href={`mailto:${mail}`} className="text-foreground underline underline-offset-2">
                  {mail}
                </a>
              ) : (
                "почту оператора"
              )}{" "}
              или по телефону {COMPANY.phone}. Данные будут удалены в течение 10 рабочих дней.
            </p>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
