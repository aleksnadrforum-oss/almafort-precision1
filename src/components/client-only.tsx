import * as React from "react";

/**
 * Предотвращает выполнение и рендер дочерних компонентов на стороне сервера (SSR).
 * Используется для изоляции тяжёлых браузерных библиотек (Three.js, Leaflet и др.).
 */
export function ClientOnly({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
