import { Link, useLocation } from "@tanstack/react-router";
import { Home, LayoutGrid, ShoppingCart, Sparkles, UserRound } from "lucide-react";
import { useEffect } from "react";
import { useCart } from "@/store/cart-store";

/**
 * Нижняя панель навигации (App-like Bottom Tab Bar).
 * Управление платформой одной рукой: зоны касания 56×44+, safe-area снизу.
 * На десктопе скрыта — там работает обычная шапка.
 */
export function MobileTabBar() {
  // Виртуальная клавиатура: помечаем body, чтобы липкие панели не «скакали».
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      const hidden = window.innerHeight - vv.height - vv.offsetTop;
      document.body.classList.toggle("kb-open", hidden > 140);
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      document.body.classList.remove("kb-open");
    };
  }, []);

  const location = useLocation();
  const lines = useCart((s) => s.lines);
  const count = lines.length;
  const path = location.pathname;

  const isActive = (to: string) =>
    to === "/" ? path === "/" : path.startsWith(to);

  const item = (active: boolean) =>
    `flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-1 px-1 pt-1 text-[10px] font-semibold leading-none transition-colors ${
      active ? "text-primary" : "text-muted-foreground"
    }`;

  return (
    <nav
      aria-label="Основная навигация"
      className="mobile-tabbar fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex h-16 max-w-[560px] items-stretch justify-between px-1">
        <Link to="/" className={item(isActive("/"))} aria-current={isActive("/") ? "page" : undefined}>
          <Home className="size-5" strokeWidth={1.75} />
          Главная
        </Link>

        <Link
          to="/catalog"
          className={item(isActive("/catalog"))}
          aria-current={isActive("/catalog") ? "page" : undefined}
        >
          <LayoutGrid className="size-5" strokeWidth={1.75} />
          Каталог
        </Link>

        {/* Центральная акцентная кнопка — ИИ-подбор */}
        <a
          href="/catalog#configurator"
          aria-label="ИИ-поиск и подбор"
          className="relative flex min-w-[64px] flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold leading-none text-primary"
        >
          <span className="-mt-6 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_20px_oklch(0.573_0.221_27.5/0.4)] active:scale-95">
            <Sparkles className="size-6" strokeWidth={2} />
          </span>
          <span className="-mt-1">ИИ-поиск</span>
        </a>

        <Link
          to="/cart"
          className={item(isActive("/cart"))}
          aria-current={isActive("/cart") ? "page" : undefined}
        >
          <span className="relative">
            <ShoppingCart className="size-5" strokeWidth={1.75} />
            {count > 0 && (
              <span className="absolute -right-2.5 -top-2 grid min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-[18px] text-primary-foreground">
                {count > 99 ? "99+" : count}
              </span>
            )}
          </span>
          Корзина
        </Link>

        <Link
          to="/cabinet"
          className={item(isActive("/cabinet"))}
          aria-current={isActive("/cabinet") ? "page" : undefined}
        >
          <UserRound className="size-5" strokeWidth={1.75} />
          Профиль
        </Link>
      </div>
    </nav>
  );
}
