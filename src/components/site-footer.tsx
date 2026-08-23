import { useEffect, useRef, useState } from "react";
import { MapPin, Send, MessageCircle, X } from "lucide-react";
import { trackContact } from "@/lib/metrika";
import { COMPANY, companyEmail } from "@/lib/company";

const LAT = COMPANY.lat;
const LON = COMPANY.lon;


/** Обфускация e-mail: адрес не встречается в исходном HTML целиком. */
const email = companyEmail();

function LazyMap() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  // Ловушка скролла: пока карта не активирована тапом, она не принимает жесты —
  // палец свайпает страницу, а не зумит улицу.
  const [active, setActive] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const loaded = useRef(false);

  // Если виджет не загрузился за 6 секунд — считаем, что его вырезал AdBlock.
  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => {
      setBlocked((b) => b || !loaded.current);
    }, 6000);
    return () => window.clearTimeout(t);
  }, [visible]);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "350px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  // Клик вне карты и уход карты из вида снова блокируют жесты.
  useEffect(() => {
    if (!active) return;
    const onDoc = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setActive(false);
    };
    document.addEventListener("pointerdown", onDoc);
    const el = ref.current;
    const io = el
      ? new IntersectionObserver((es) => es.some((e) => !e.isIntersecting) && setActive(false), {
          threshold: 0.25,
        })
      : null;
    if (el && io) io.observe(el);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      io?.disconnect();
    };
  }, [active]);

  return (
    <div
      ref={ref}
      className="relative h-full min-h-[280px] w-full max-w-full overflow-hidden bg-[#1B1B1F] sm:min-h-[400px]"
    >
      {visible && blocked ? (
        // Корпоративные блокировщики часто режут виджет карт — адрес остаётся доступен.
        <div className="flex h-full min-h-[280px] w-full flex-col items-center justify-center gap-2 px-6 text-center sm:min-h-[400px]">
          <p className="text-sm font-semibold text-white">
            Дивногорск, Нижний проезд, 15/1
          </p>
          <p className="text-xs text-[#9CA3AF]">
            Интерактивная карта заблокирована расширением браузера
          </p>
          <a
            href={`https://yandex.ru/maps/?pt=${LON},${LAT}&z=17&l=map`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 cursor-pointer rounded-sm border border-white/30 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/10"
          >
            Открыть карту в новой вкладке
          </a>
        </div>
      ) : visible ? (
        <iframe
          onLoad={() => {
            loaded.current = true;
            setBlocked(false);
          }}
          onError={() => setBlocked(true)}
          title="ALMAFORT — производство и склад: Дивногорск, Нижний проезд, 15/1"
          loading="lazy"
          scrolling="no"
          src={`https://yandex.ru/map-widget/v1/?ll=${LON}%2C${LAT}&z=17&l=map&controls=zoomControl%2CfullscreenControl&text=${encodeURIComponent(
            "Дивногорск, Нижний проезд, 15/1",
          )}`}
          className={`block h-full min-h-[280px] w-full max-w-full overflow-hidden border-0 opacity-90 sm:min-h-[400px] [filter:invert(1)_hue-rotate(180deg)_saturate(0.6)_brightness(0.95)] ${
            active ? "" : "pointer-events-none"
          }`}
        />
      ) : (
        <div className="flex h-full min-h-[280px] w-full items-center justify-center bg-[#1B1B1F] text-sm text-[#4B5563] sm:min-h-[400px]">
          Карта загрузится при прокрутке
        </div>
      )}

      <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-full flex-col items-center">
        <span className="mb-1 rounded-[3px] bg-[#121214] px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-lg">
          ALMAFORT
        </span>
        <svg width="34" height="46" viewBox="0 0 34 46" fill="none" aria-hidden="true">
          <path
            d="M17 0C7.6 0 0 7.6 0 17c0 12 17 29 17 29s17-17 17-29C34 7.6 26.4 0 17 0z"
            fill="#E52421"
          />
          <circle cx="17" cy="17" r="5.5" fill="#FFFFFF" />
        </svg>
      </div>

      {visible && !active && (
        <button
          type="button"
          onClick={() => setActive(true)}
          aria-label="Активировать карту для перемещения и масштабирования"
          className="absolute inset-0 z-10 flex cursor-pointer items-end justify-center bg-transparent pb-5 text-xs font-semibold text-white"
        >
          <span className="rounded-full bg-black/70 px-4 py-2.5">
            Нажмите, чтобы взаимодействовать с картой
          </span>
        </button>
      )}

      {active && (
        <span className="pointer-events-none absolute right-3 top-3 z-10 rounded-full bg-black/70 px-3 py-1.5 text-[11px] text-white">
          Прокрутка страницы — свайпом вне карты
        </span>
      )}
    </div>
  );
}

export function SiteFooter() {
  const [modal, setModal] = useState(false);
  // Антиспам: адрес собирается только в браузере — в исходном коде страницы его нет.
  const [mail, setMail] = useState("");
  useEffect(() => setMail(email), []);

  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setModal(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [modal]);

  return (
    <footer id="contacts" className="bg-[#121214] text-white">
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 lg:grid-cols-12">
        <div className="px-4 py-16 sm:px-[max(5vw,20px)] lg:col-span-4 lg:py-20 lg:pl-10 lg:pr-12">
          <div className="flex items-center gap-2">
            <span className="text-[26px] font-extrabold uppercase tracking-tight text-white">
              Alma<span className="text-[#E52421]">fort</span>
            </span>
            <span className="mt-1 block size-2 rounded-[2px] bg-[#E52421]" />
          </div>

          <a
            href={COMPANY.phoneHref}
            className="mt-8 inline-flex min-h-11 items-center text-[26px] font-extrabold tracking-tight text-white tabular-nums lg:text-[32px]"
          >
            {COMPANY.phone}
          </a>

          <p className="mt-4 text-sm leading-[1.7] text-[#9CA3AF]">
            Пн–Пт 08:00–19:00 (МСК+4)
            <br />
            Сб–Вс: выходной
          </p>

          <a
            href={mail ? `mailto:${mail}` : undefined}
            onClick={() => trackContact("email_click")}
            className="mt-4 inline-flex min-h-11 items-center text-base text-white hover:underline hover:underline-offset-4"
          >
            {mail || "отдел продаж — почта"}
          </a>

          <a
            href={COMPANY.siteUrl}
            className="mt-1 inline-flex min-h-11 items-center text-sm text-[#9CA3AF] hover:text-white"
          >
            {COMPANY.site}
          </a>

          <div className="mt-6 space-y-1 text-sm leading-[1.6] text-[#9CA3AF]">
            <p className="font-semibold text-white">Производство и склад</p>
            <p className="flex items-start gap-2 text-white">
              <MapPin className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
              {COMPANY.addressFull}
            </p>
            <p className="pt-3 text-[12px] leading-[1.5] text-[#9CA3AF]">
              {COMPANY.legalName}
              <br />
              Юридический адрес: {COMPANY.legalStreet}
              <br />
              <span className="tabular-nums">
                ИНН: {COMPANY.inn} <span className="text-[#4B5563]">|</span> ОГРН: {COMPANY.ogrn}
              </span>
            </p>
          </div>


          <button
            type="button"
            onClick={() => setModal(true)}
            className="mt-8 inline-flex items-center justify-center rounded-[4px] border border-white px-6 py-3 text-sm font-medium text-white transition-colors duration-200 hover:bg-[#FFFFFF] hover:text-[#121214]"
          >
            Написать в WhatsApp / Telegram
          </button>
        </div>


        <div className="lg:col-span-8">
          <LazyMap />
        </div>
      </div>

      <div className="border-t border-[#2A2A2E]">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-[max(5vw,20px)] py-5 text-[12px] leading-[1.6] text-[#9CA3AF] sm:flex-row sm:items-center sm:justify-between lg:px-10">
          <p>© 2006–2026 ALMAFORT · ИП Сазонов Е. О..  Официально зарегистрированный товарный знак (№ 1192250).</p>
          <div className="flex flex-wrap gap-6">
            <a href="/auth" className="inline-flex min-h-11 items-center font-semibold text-white transition-colors hover:text-[#9CA3AF]">
              Кабинет снабженца
            </a>
            <a href="/privacy" className="inline-flex min-h-11 items-center underline underline-offset-2 transition-colors hover:text-white">
              Политика конфиденциальности
            </a>
            <a href="/terms" className="inline-flex min-h-11 items-center underline underline-offset-2 transition-colors hover:text-white">
              Пользовательское соглашение
            </a>
          </div>


        </div>
      </div>

      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5"
          onClick={() => setModal(false)}
          role="presentation"
        >
          <div
            className="relative w-full max-w-[380px] rounded-[6px] bg-[#1B1B1F] p-8"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Выбор мессенджера"
          >
            <button
              type="button"
              aria-label="Закрыть"
              onClick={() => setModal(false)}
              className="absolute right-4 top-4 text-[#9CA3AF] hover:text-white"
            >
              <X className="size-5" strokeWidth={1.75} />
            </button>
            <p className="text-lg font-bold text-white">Выберите мессенджер</p>
            <p className="mt-2 text-sm text-[#9CA3AF]">
              Ответим в рабочие часы: Пн–Пт 08:00–19:00 (МСК+4).
            </p>
            <div className="mt-6 grid gap-3">
              <a
                href="https://api.whatsapp.com/send?phone=79029229734"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-[4px] border border-white/20 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white hover:text-[#121214]"
              >
                <MessageCircle className="size-5" strokeWidth={1.75} />
                WhatsApp
              </a>
              <a
                href="https://t.me/+79029229734"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-[4px] border border-white/20 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white hover:text-[#121214]"
              >
                <Send className="size-5" strokeWidth={1.75} />
                Telegram
              </a>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
}
