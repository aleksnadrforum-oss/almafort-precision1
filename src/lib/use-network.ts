import { useEffect, useState } from "react";
import { toast } from "sonner";

/** Онлайн-статус устройства (тест лифта: авиарежим посреди расчёта). */
export function useOnline() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => {
      setOnline(true);
      toast.success("Соединение восстановлено");
    };
    const down = () => {
      setOnline(false);
      toast.error("Нет подключения к интернету. Проверьте сеть и повторите попытку");
    };
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  return online;
}

/**
 * Проверка перед сетевым запросом: без сети сразу показываем тост,
 * чтобы кнопка не зависала в бесконечном лоадере.
 */
export function ensureOnline(action = "Повторите попытку"): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    toast.error(`Нет подключения к интернету. ${action}`);
    return false;
  }
  return true;
}
