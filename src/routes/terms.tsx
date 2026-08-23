import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BackLink } from "@/components/back-link";
import { COMPANY } from "@/lib/company";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Пользовательское соглашение — ALMAFORT" },
      {
        name: "description",
        content:
          "Условия использования сайта ALMAFORT: порядок оформления заказов, статус цен и материалов каталога, ответственность сторон.",
      },
      { property: "og:title", content: "Пользовательское соглашение — ALMAFORT" },
      {
        property: "og:description",
        content: "Правила использования каталога, расчётов и сервисов сайта ALMAFORT.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="w-full flex-1 mx-auto w-full max-w-[820px] px-4 pb-20 pt-8 sm:px-5 lg:px-10">
        <BackLink />
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-foreground [overflow-wrap:anywhere] lg:text-[40px]">
          Пользовательское соглашение
        </h1>
        <div className="mt-8 space-y-6 text-sm leading-[1.75] text-muted-foreground [overflow-wrap:anywhere]">
          <p>
            Соглашение регулирует использование сайта {COMPANY.site}, владельцем которого
            является {COMPANY.legalName} (ИНН {COMPANY.inn}, ОГРН {COMPANY.ogrn}).
          </p>
          <div>
            <h2 className="text-lg font-bold text-foreground">1. Статус информации</h2>
            <p className="mt-2">
              Цены, остатки и сроки в каталоге носят справочный характер и не являются
              публичной офертой. Итоговые условия фиксируются в счёте, подтверждённом
              менеджером.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">2. Оформление заказа</h2>
            <p className="mt-2">
              Заказ считается принятым после подтверждения менеджером наличия позиций и
              согласования сроков отгрузки. Позиции без цены рассчитываются индивидуально по
              запросу.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">3. Материалы пользователя</h2>
            <p className="mt-2">
              Загружая чертежи, 3D-модели и спецификации, пользователь подтверждает наличие
              прав на эти материалы. Оператор использует их исключительно для расчёта заказа.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">4. Контакты</h2>
            <p className="mt-2">
              {COMPANY.legalAddressFull}. Телефон:{" "}
              <a href={COMPANY.phoneHref} className="text-foreground underline underline-offset-2">
                {COMPANY.phone}
              </a>
              .
            </p>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
