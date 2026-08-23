import { ArrowLeft } from "lucide-react";

/**
 * Универсальный возврат: history.back() сохраняет позицию скролла
 * предыдущей страницы. Если истории нет — уходим на fallback.
 */
export function BackLink({
  fallback = "/",
  label = "Назад",
  className = "",
}: {
  fallback?: string;
  label?: string;
  className?: string;
}) {
  const goBack = () => {
    if (typeof window === "undefined") return;
    if (window.history.length > 1) window.history.back();
    else window.location.assign(fallback);
  };

  return (
    <button
      type="button"
      onClick={goBack}
      className={`group inline-flex cursor-pointer items-center gap-2 bg-transparent text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-primary ${className}`}
    >
      <ArrowLeft
        className="size-4 shrink-0 transition-transform duration-200 group-hover:-translate-x-0.5 group-hover:text-primary"
        strokeWidth={1.75}
      />
      {label}
    </button>
  );
}
