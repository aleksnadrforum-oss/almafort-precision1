import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/**
 * Нативный жест закрытия нижних шторок: свайп пальцем вниз.
 * Возвращает пропсы для «ручки» шторки и текущее смещение по Y.
 */
export function useSwipeClose(onClose: () => void, threshold = 90) {
  const startY = useRef<number | null>(null);
  const [dy, setDy] = useState(0);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    startY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (startY.current === null) return;
    setDy(Math.max(0, e.clientY - startY.current));
  };

  const finish = () => {
    if (startY.current === null) return;
    startY.current = null;
    setDy((cur) => {
      if (cur > threshold) onClose();
      return 0;
    });
  };

  return {
    dy,
    /** Навешивается на видимую «ручку» вверху шторки. */
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
      style: { touchAction: "none" as const },
    },
    /** Стиль контейнера шторки — следует за пальцем. */
    sheetStyle: dy ? { transform: `translateY(${dy}px)` } : undefined,
  };
}
