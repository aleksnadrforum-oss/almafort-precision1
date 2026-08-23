import { useRef, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";

/**
 * Нативный свайп влево для удаления строки (как в почтовых клиентах).
 * Работает только на тач-устройствах; на десктопе остаётся обычная кнопка.
 */
export function SwipeToDelete({
  onDelete,
  label = "Удалить позицию",
  children,
}: {
  onDelete: () => void;
  label?: string;
  children: ReactNode;
}) {
  const startX = useRef(0);
  const startY = useRef(0);
  const axis = useRef<"none" | "x" | "y">("none");
  const [dx, setDx] = useState(0);
  const [gone, setGone] = useState(false);

  const THRESHOLD = 96;

  return (
    <div className="swipe-row md:overflow-visible">
      <div
        aria-hidden
        className="absolute inset-y-0 right-0 flex w-[120px] items-center justify-center bg-primary text-primary-foreground md:hidden"
      >
        <Trash2 className="size-5" strokeWidth={2} />
      </div>

      <div
        className="swipe-row-content"
        style={{
          transform: `translateX(${gone ? -400 : dx}px)`,
          transition: dx === 0 || gone ? "transform 200ms ease-out" : "none",
        }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          if (!t) return;
          startX.current = t.clientX;
          startY.current = t.clientY;
          axis.current = "none";
        }}
        onTouchMove={(e) => {
          const t = e.touches[0];
          if (!t) return;
          const deltaX = t.clientX - startX.current;
          const deltaY = t.clientY - startY.current;
          if (axis.current === "none") {
            if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return;
            axis.current = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
          }
          if (axis.current !== "x") return;
          setDx(Math.min(0, Math.max(-140, deltaX)));
        }}
        onTouchEnd={() => {
          if (axis.current === "x" && dx <= -THRESHOLD) {
            setGone(true);
            window.setTimeout(onDelete, 180);
            return;
          }
          setDx(0);
        }}
        onTouchCancel={() => setDx(0)}
      >
        {children}
      </div>
      <span className="sr-only">{label} — свайпом влево</span>
    </div>
  );
}
