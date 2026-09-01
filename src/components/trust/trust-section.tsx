import { SafeImage } from "@/components/safe-image";
import { useCallback, useEffect, useState } from "react";
import { Check, MapPin, Search, Truck, X, Zap } from "lucide-react";

/** src — превью (JPG). pdf — если задан, в лайтбоксе открывается встроенный просмотрщик. */
type Doc = { alt: string; caption?: string; src: string; pdf?: string };

function Lightbox({ doc, onClose }: { doc: Doc | null; onClose: () => void }) {
  useEffect(() => {
    if (!doc) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [doc, onClose]);

  if (!doc) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={doc.alt}
      onClick={onClose}
      className="fixed inset-0 z-[100] flex flex-col overscroll-contain bg-foreground"
    >
      {/* Верхняя панель: всегда видима, учитывает «чёлку» и панель Safari */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex shrink-0 items-center gap-3 px-4 pb-3 pt-[calc(env(safe-area-inset-top,0px)+12px)]"
      >
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-background">
          {doc.caption ?? doc.alt}
        </p>
        <button
          type="button"
          aria-label="Закрыть"
          onClick={onClose}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-background/15 text-background transition-colors hover:bg-background/25 active:scale-95"
        >
          <X className="size-6" strokeWidth={2} />
        </button>
      </div>

      {/* Область просмотра: изображение всегда вписывается по ширине и высоте */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="mx-auto flex min-h-0 w-full max-w-[900px] flex-1 items-center justify-center px-3 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]"
      >
        {doc.pdf ? (
          <iframe
            src={doc.pdf}
            title={doc.alt}
            className="h-full w-full rounded-md border-0 bg-card"
          />
        ) : (
          <img
            src={doc.src}
            alt={doc.alt}
            className="max-h-full w-auto max-w-full rounded-md bg-card object-contain shadow-2xl"
          />
        )}
      </div>
    </div>
  );
}


function DocThumb({ doc, onOpen }: { doc: Doc; onOpen: (d: Doc) => void }) {
  return (
    <figure className="m-0">
      <button
        type="button"
        onClick={() => onOpen(doc)}
        className="group relative block w-full cursor-zoom-in overflow-hidden rounded-lg bg-card shadow-[0_4px_12px_oklch(0_0_0/0.05)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_oklch(0_0_0/0.12)] [will-change:transform]"
      >
        <SafeImage
          src={doc.src}
          alt={doc.alt}
          loading="lazy"
          className="block aspect-[1/1.1] w-full bg-card object-contain p-2"
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-foreground/0 opacity-0 transition-all duration-300 group-hover:bg-foreground/10 group-hover:opacity-100">
          <span className="rounded-full bg-background p-3 shadow-lg">
            <Search className="size-5 text-foreground" strokeWidth={1.75} />
          </span>
        </span>
      </button>
      {doc.caption && (
        <figcaption className="mt-3 text-center text-xs text-muted-foreground">
          {doc.caption}
        </figcaption>
      )}
    </figure>
  );
}



const DELIVERY = [
  {
    icon: Zap,
    title: "Отгрузка в день оплаты (СДЭК)",
    text: "Для срочных и небольших заказов. Идеальный вариант для доставки образцов или закрытия горящих потребностей на объекте. Отправка в рабочие дни.",
  },
  {
    icon: Truck,
    title: "Строгий график (Деловые Линии)",
    text: "Для стандартных заказов и крупного опта. Отгружаем продукцию любого объема. Машины забирают груз с нашего склада каждую среду и пятницу.",
  },
  {
    icon: MapPin,
    title: "Самовывоз с производства",
    text: "Заберите продукцию самостоятельно напрямую со склада. Актуальный адрес: г. Дивногорск, Нижний проезд, 15/1.",
    note: "Требуется доверенность или печать организации.",
  },
];

const BRAND_POINTS = [
  {
    title: "Безопасность.",
    text: "Вы работаете с официальным, юридически защищенным производителем, несущим полную ответственность за продукт.",
  },
  {
    title: "Защита от контрафакта.",
    text: "Оригинальная продукция производится только на наших мощностях со строгим соблюдением технических регламентов и ГОСТов.",
  },
  {
    title: "Долгосрочность.",
    text: "Регистрация марки — показатель того, что компания пришла на рынок всерьез и надолго.",
  },
];

const COMPETENCIES = [
  {
    title: "Промышленная 3D-печать",
    text: "Знаем тонкости поведения полимеров, температурных режимов и усадки при послойном наплавлении.",
  },
  {
    title: "Реверс-инжиниринг",
    text: "Способны воссоздать точную цифровую копию изношенной или импортной детали через высокоточное сканирование для запуска в серийное литье.",
  },
];

export function TrustSection() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const open = useCallback((d: Doc) => setDoc(d), []);
  const close = useCallback(() => setDoc(null), []);

  const trademarkDoc: Doc = {
    alt: "Свидетельство Роспатента на товарный знак ALMAFORT",
    src: "/media/trademark-almafort.jpg",
  };
  const expertDocs: Doc[] = [
    {
      alt: "Сертификат соответствия КРЕПСС РОСС RU.33163.OC01.00631",
      caption: "Сертификат соответствия КРЕПСС (до 11.03.2029)",
      src: "/media/krepss-sertifikat.jpg",
    },
    {
      alt: "Удостоверение АО «ЦАТ»: 3D-печать пластиком",
      caption: "Квалификация: 3D-печать (Центр аддитивных технологий)",
      src: "/media/cert-3d-print.jpg",
    },
    {
      alt: "Удостоверение АО «ЦАТ»: реверсивный инжиниринг",
      caption: "Квалификация: Реверс-инжиниринг",
      src: "/media/cert-reverse-eng.jpg",
    },
  ];


  return (
    <>
      {/* 4.1 Логистика */}
      <section id="delivery" className="bg-background py-20 lg:py-24">
        <div className="mx-auto w-full max-w-[1440px] px-5 lg:px-10">
          <div className="mx-auto max-w-[760px] text-center">
            <h2 className="text-[28px] font-extrabold leading-[1.15] tracking-tight text-foreground lg:text-[42px]">
              Логистика и отгрузки по всей России
            </h2>
            <p className="mt-5 text-base leading-[1.6] text-muted-foreground lg:text-lg">
              Специальная складская программа позволяет оперативно комплектовать заявки.
              Мы автоматизировали отгрузки, чтобы вы получали продукцию точно в срок.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-3">
            {DELIVERY.map((d) => (
              <article
                key={d.title}
                className="rounded-lg border border-transparent bg-[#F8F9FA] p-8 text-left transition-colors hover:border-border"
              >

                <d.icon className="size-9 text-primary" strokeWidth={1.5} />
                <h3 className="mt-5 text-lg font-bold leading-snug text-foreground">
                  {d.title}
                </h3>
                <p className="mt-3 text-sm leading-[1.6] text-muted-foreground">{d.text}</p>
                {d.note && (
                  <p className="mt-3 text-xs leading-[1.5] text-muted-foreground/80">
                    {d.note}
                  </p>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 4.2 Товарный знак */}
      <section id="brand" className="bg-surface py-20 lg:py-24">
        <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 items-center gap-12 px-5 lg:grid-cols-12 lg:gap-16 lg:px-10">
          <div className="lg:col-span-6">
            <h2 className="text-[28px] font-extrabold leading-[1.15] tracking-tight text-foreground lg:text-[42px]">
              ALMAFORT — зарегистрированный бренд
            </h2>
            <p className="mt-5 max-w-[60ch] text-base leading-[1.6] text-muted-foreground">
              Мы дорожим качеством выпускаемой продукции. Бренд ALMAFORT является
              официально зарегистрированным товарным знаком в РФ. Что это дает нашим
              B2B-партнерам?
            </p>
            <ul className="mt-8 space-y-6">
              {BRAND_POINTS.map((p) => (
                <li key={p.title} className="flex gap-3">
                  <Check className="mt-0.5 size-5 shrink-0 text-primary" strokeWidth={2.25} />
                  <p className="text-sm leading-[1.6] text-muted-foreground">
                    <span className="font-semibold text-foreground">{p.title}</span>{" "}
                    {p.text}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-8 text-xs leading-[1.6] text-muted-foreground">
              Свидетельство Роспатента № 1192250 от 02.03.2026.
              <br />
              Правообладатель: Сазонов Е. О.
            </p>
          </div>

          <div className="lg:col-span-6">
            <div className="mx-auto max-w-[520px]">
              <DocThumb doc={trademarkDoc} onOpen={open} />
            </div>
          </div>
        </div>
      </section>

      {/* 4.3 Инженерная экспертиза */}
      <section id="expertise" className="bg-background py-20 lg:py-24">
        <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 items-start gap-12 px-5 lg:grid-cols-12 lg:gap-16 lg:px-10">
          <div className="lg:col-span-5">
            <div className="grid grid-cols-2 gap-6">
              {expertDocs.map((d, i) => (
                <div key={d.alt} className={i === 0 ? "col-span-2" : undefined}>
                  <DocThumb doc={d} onOpen={open} />
                </div>
              ))}
            </div>
          </div>


          <div className="text-left lg:col-span-7">
            <h2 className="text-left text-[28px] font-extrabold leading-[1.15] tracking-tight text-foreground lg:text-[42px]">
              Кто отвечает за точность деталей?
            </h2>
            <p className="mt-5 max-w-[64ch] text-base leading-[1.6] text-muted-foreground">
              Современное производство пластмассовых изделий — это не просто нажатие
              кнопки на ТПА. Это сложный инжиниринговый процесс, где каждая сотая доля
              миллиметра влияет на собираемость механизма.
            </p>
            <p className="mt-4 max-w-[64ch] text-base leading-[1.6] text-muted-foreground">
              Руководитель и главный эксперт производства, Сазонов Евгений Олегович,
              прошел официальную сертификацию на базе профильного АО «Центр аддитивных
              технологий». Доверяя нам прототипы или серийные партии, вы работаете со
              специалистами, которые говорят с вами на одном техническом языке.
            </p>

            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
              {COMPETENCIES.map((c) => (
                <div
                  key={c.title}
                  className="rounded-r-md border-l-[3px] border-primary bg-surface p-6"
                >
                  <p className="text-sm font-bold text-foreground">{c.title}</p>
                  <p className="mt-2 text-sm leading-[1.6] text-muted-foreground">
                    {c.text}
                  </p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

      <Lightbox doc={doc} onClose={close} />
    </>
  );
}
