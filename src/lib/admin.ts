/**
 * Клиентские константы админ-панели ALMAFORT.
 * Роут нестандартный: сканеры уязвимостей не находят точку входа,
 * а неавторизованный доступ отдаёт 404, а не форму логина.
 */
export const ADMIN_BASE = "/admin-alma-secure-2026";

export type AdminRole = "owner" | "manager" | "content";

export const ROLE_LABEL: Record<AdminRole, string> = {
  owner: "Владелец",
  manager: "Отдел продаж",
  content: "Контент-менеджер",
};

/** Какие разделы доступны роли. Это только UI — бэкенд проверяет права сам. */
export const SECTION_ACCESS: Record<string, AdminRole[]> = {
  orders: ["owner", "manager"],
  companies: ["owner", "manager"],
  leads: ["owner", "manager"],
  products: ["owner", "content"],
  ai: ["owner"],
  settings: ["owner"],
  logs: ["owner"],
};

export const can = (roles: AdminRole[], section: string) =>
  (SECTION_ACCESS[section] ?? []).some((r) => roles.includes(r));

export const STATUS_COLOR: Record<string, string> = {
  awaiting_payment: "bg-red-50 text-red-700 border-red-200",
  paid: "bg-amber-50 text-amber-700 border-amber-200",
  production: "bg-blue-50 text-blue-700 border-blue-200",
  packing: "bg-indigo-50 text-indigo-700 border-indigo-200",
  shipped: "bg-violet-50 text-violet-700 border-violet-200",
  arrived: "bg-teal-50 text-teal-700 border-teal-200",
  closed: "bg-emerald-50 text-emerald-700 border-emerald-200",
};
