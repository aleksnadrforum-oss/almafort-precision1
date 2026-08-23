const STEPS = [
  {
    title: "Мгновенный парсинг",
    text: "Загрузите смету. Алгоритм за 3 секунды распознает 10 000+ артикулов и найдет 100% совпадения или ближайшие ГОСТ-аналоги.",
  },
  {
    title: "Матрица оптовых цен",
    text: "Система автоматически применит каскадные скидки (до 40%) в зависимости от объема партии прямо в корзине.",
  },
  {
    title: "Бесшовная логистика",
    text: "Точный расчет сроков и стоимости доставки (СДЭК, Деловые Линии) до вашего объекта.",
  },
  {
    title: "ЭДО и документы",
    text: "Платформа сгенерирует готовый договор и счет в PDF. Обмен закрывающими документами через любого оператора ЭДО.",
  },
];

export function PlatformTerminal() {
  return (
    <aside
      className="rounded-xl bg-card p-8 lg:p-10"
      style={{ boxShadow: "0 20px 40px oklch(0 0 0 / 0.06)" }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[1px] text-muted-foreground/70">
        Как работает платформа
      </p>

      <ol className="relative mt-7 space-y-7 pl-8">
        <span
          aria-hidden
          className="absolute bottom-3 left-[5px] top-3 w-[2px] rounded-full bg-[#E5E7EB]"
        />
        {STEPS.map((step) => (
          <li key={step.title} className="relative">
            <span
              aria-hidden
              className="absolute -left-[32px] top-1.5 size-3 rounded-full bg-primary ring-4 ring-card"
            />

            <h3 className="text-[18px] font-semibold leading-tight text-foreground">
              {step.title}
            </h3>
            <p className="mt-2 text-sm leading-[1.55] text-muted-foreground">{step.text}</p>
          </li>
        ))}
      </ol>
    </aside>
  );
}

