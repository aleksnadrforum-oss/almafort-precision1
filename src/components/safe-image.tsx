import { useState, type ImgHTMLAttributes } from "react";
import { mediaUrl } from "@/lib/media";

/**
 * Картинка с аккуратной заглушкой ALMAFORT вместо «битой иконки» браузера:
 * если ресурс отдал 404 или завис — блок сохраняет размеры и не ломает сетку.
 */
export function SafeImage({
  src,
  alt,
  className = "",
  wrapperClassName = "",
  ...rest
}: ImgHTMLAttributes<HTMLImageElement> & { wrapperClassName?: string }) {
  const [failed, setFailed] = useState(false);
  const resolved = mediaUrl(typeof src === "string" ? src : undefined) ?? src;

  if (!resolved || failed) {
    return (
      <span
        role="img"
        aria-label={`${alt ?? "Изображение"} — фото недоступно`}
        className={`grid size-full place-items-center bg-[#F3F4F6] ${wrapperClassName} ${className}`}
      >
        <span className="select-none text-[10px] font-extrabold tracking-[0.18em] text-[#9CA3AF]">
          ALMAFORT
        </span>
      </span>
    );
  }

  return (
    <img src={resolved as string} alt={alt} onError={() => setFailed(true)} className={className} {...rest} />
  );
}
