import { useOnline } from "@/lib/use-network";

/**
 * Тонкая полоса вместо «мёртвого» интерфейса, когда телефон теряет сеть
 * в лифте или метро. Не перекрывает шапку и нижнюю панель.
 */
export function NetworkWatcher() {
  const online = useOnline();
  if (online) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[70] bg-destructive px-4 py-1.5 text-center text-xs font-semibold text-destructive-foreground"
      style={{ paddingTop: "calc(0.375rem + env(safe-area-inset-top))" }}
    >
      Нет сети — данные могут быть устаревшими
    </div>
  );
}
