import { useEffect, useState } from "react";
import { X } from "lucide-react";

/**
 * Согласие на обработку персональных данных (152-ФЗ).
 *
 * Хитбоксы жёстко разделены:
 *  - квадрат чекбокса + нейтральный текст (<label htmlFor>) — только переключение стейта;
 *  - «Политикой конфиденциальности» — отдельная кнопка ВНЕ label, открывает модальное окно
 *    поверх формы (контекст экрана не меняется, данные формы не теряются).
 */
export function ConsentCheckbox({
  checked,
  onChange,
  invalid = false,
  id = "consent",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  invalid?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const tone = invalid && !checked ? "text-primary" : "text-muted-foreground";

  return (
    <div className={`mt-6 flex items-start gap-3 text-xs leading-[1.6] ${tone}`}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={`mt-0.5 size-4 shrink-0 cursor-pointer rounded-[3px] accent-[var(--primary)] ${
          invalid && !checked ? "outline outline-1 outline-primary" : ""
        }`}
      />
      <span>
        {/* Toggle Zone: только переключение чекбокса, без навигации */}
        <label htmlFor={id} className="cursor-pointer select-none">
          Я согласен на обработку персональных данных в соответствии с{" "}
        </label>
        {/* Link Zone: изолирована от label, открывает модалку поверх формы */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }}
          className="cursor-pointer underline underline-offset-2 hover:text-primary"
        >
          Политикой конфиденциальности
        </button>
        .
      </span>
      {open ? <PolicyModal onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function PolicyModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-foreground/45 p-0 sm:items-center sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Политика конфиденциальности"
        className="max-h-[85vh] w-full max-w-[640px] overflow-y-auto rounded-t-2xl bg-card p-6 shadow-[0_24px_60px_-20px_rgba(15,23,42,0.45)] sm:rounded-2xl sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold text-foreground">
            Обработка персональных данных
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="-mr-1 -mt-1 cursor-pointer rounded-full p-1.5 text-muted-foreground transition-all duration-200 ease-in-out hover:bg-[#E5E7EB] hover:text-foreground active:scale-90"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4 text-sm leading-[1.75] text-muted-foreground">
          <p>
            Отправляя форму, вы даёте согласие на обработку персональных данных, которые
            сообщаете добровольно: имя, телефон, e-mail, компания, город доставки,
            содержание заявки и приложенные файлы спецификаций и чертежей.
          </p>
          <p>
            Данные используются только для подготовки коммерческого предложения, расчёта
            доставки и связи по вашей заявке. Мы не передаём их третьим лицам, кроме
            транспортных компаний в объёме, необходимом для доставки груза.
          </p>
          <p>
            Согласие отзывается в любой момент по письменному обращению — обработка
            прекращается, данные удаляются, если не действует иное требование закона.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-[background-color,transform] duration-200 hover:bg-[#374151] active:scale-[0.97]"
          >
            Понятно
          </button>
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium underline underline-offset-2 hover:text-primary"
          >
            Полный текст политики
          </a>
        </div>
      </div>
    </div>
  );
}
