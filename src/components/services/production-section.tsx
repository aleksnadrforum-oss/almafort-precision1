import { ArrowRight, Boxes, Layers, ScanLine } from "lucide-react";
import { EngineeringQuiz } from "./engineering-quiz";

const METRICS = [
  { value: "16 лет", label: "Экспертиза в литье пластмасс" },
  { value: "6 ТПА", label: "Современный парк термопластавтоматов" },
  { value: "100%", label: "Входной контроль сырья и соответствие ГОСТ" },
];

const CARDS = [
  {
    icon: ScanLine,
    title: "Реверс-инжиниринг",
    text: "Воссоздание деталей по изношенному образцу. Оптимизация геометрии и подбор полимеров для повышения прочности.",
  },
  {
    icon: Layers,
    title: "Промышленная 3D-печать",
    text: "Быстрое прототипирование. Изготовление предсерийных образцов для тестирования узлов в реальных условиях.",
  },
  {
    icon: Boxes,
    title: "Серийное литье пластмасс",
    text: "Литье на собственных пресс-формах или пресс-формах заказчика. Партии от 10 000 штук с жестким контролем допусков.",
  },
];

export function ProductionSection() {
  return (
    <section id="services" className="bg-surface py-20 lg:py-24">
      <div className="mx-auto w-full max-w-[1440px] px-5 lg:px-10">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-8">
            <h2 className="max-w-[18ch] text-[32px] font-extrabold leading-[1.1] tracking-tight text-foreground lg:text-[48px]">
              Контрактное производство и инжиниринг
            </h2>
            <p className="mt-6 max-w-[62ch] text-base leading-[1.6] text-muted-foreground lg:text-lg">
              Полный цикл создания деталей: от 3D-моделирования и печати прототипов до
              серийного выпуска на собственных термопластавтоматах.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:col-span-4">
            {METRICS.map((m) => (
              <div key={m.value} className="border-l-2 border-primary pl-4">
                <p className="text-[32px] font-bold leading-none text-foreground">
                  {m.value}
                </p>
                <p className="mt-2 text-[13px] leading-[1.5] text-muted-foreground">
                  {m.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div id="reverse" className="no-scrollbar -mx-5 mt-14 flex snap-x gap-8 overflow-x-auto px-5 md:mx-0 md:grid md:grid-cols-1 md:overflow-visible md:px-0 lg:grid-cols-3">
          {CARDS.map((c) => (
            <article
              key={c.title}
              onClick={() => {
                document.getElementById("quiz")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="group flex min-w-[300px] shrink-0 cursor-pointer snap-start flex-col rounded-lg bg-card p-8 shadow-[0_4px_6px_oklch(0_0_0/0.02)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_24px_oklch(0_0_0/0.06)] [will-change:transform] md:min-w-0 lg:p-10"
            >
              <span className="relative inline-flex size-8 items-center justify-center">
                <c.icon className="size-8 text-foreground" strokeWidth={1.5} />
                <span className="absolute -right-1 -top-1 size-2 rounded-full bg-primary" />
              </span>
              <h3 className="mt-6 text-xl font-bold text-foreground">{c.title}</h3>
              <p className="mt-3 text-sm leading-[1.6] text-muted-foreground">{c.text}</p>
              <a
                href="#quiz"
                className="mt-6 inline-flex min-h-11 cursor-pointer items-center gap-2 py-2 text-sm font-medium text-foreground transition-colors group-hover:text-primary"
              >
                Подробнее о технологии
                <ArrowRight
                  className="size-4 transition-transform duration-300 group-hover:translate-x-1"
                  strokeWidth={1.75}
                />
              </a>
            </article>

          ))}
        </div>


        <div id="quiz">
          <EngineeringQuiz />
        </div>
      </div>
    </section>
  );
}
