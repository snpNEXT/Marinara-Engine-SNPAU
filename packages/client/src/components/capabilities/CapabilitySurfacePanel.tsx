import { useEffect, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

const DEFAULT_WIDTH = 560;
const MIN_WIDTH = 360;
const MIN_CONTENT_WIDTH = 360;
const STORAGE_KEY = "marinara-capability-surface-width";

function readStoredWidth() {
  if (typeof window === "undefined") return DEFAULT_WIDTH;
  const stored = Number.parseInt(window.localStorage.getItem(STORAGE_KEY) ?? "", 10);
  return Number.isFinite(stored) ? stored : DEFAULT_WIDTH;
}

function useMobileCapabilitySurface() {
  const [mobile, setMobile] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia("(max-width: 767px)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return mobile;
}

export function CapabilitySurfacePanel({ children }: { children: ReactNode }) {
  const mobile = useMobileCapabilitySurface();
  const [width, setWidth] = useState(readStoredWidth);

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const maximumWidth = Math.max(MIN_WIDTH, window.innerWidth - MIN_CONTENT_WIDTH);
    let nextWidth = startWidth;

    const move = (pointerEvent: PointerEvent) => {
      nextWidth = Math.min(maximumWidth, Math.max(MIN_WIDTH, startWidth + startX - pointerEvent.clientX));
      setWidth(nextWidth);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.localStorage.setItem(STORAGE_KEY, String(Math.round(nextWidth)));
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };

  const content = (
    <aside
      data-chat-capability-surface
      data-chat-floating-panel={mobile ? "" : undefined}
      className={
        mobile
          ? "fixed inset-0 z-[10020] min-h-0 box-border bg-[var(--background)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
          : "relative min-h-0 shrink-0 overflow-hidden border-l border-[var(--border)] bg-[var(--background)]"
      }
      style={mobile ? undefined : { width: `min(${width}px, calc(100vw - ${MIN_CONTENT_WIDTH}px))` }}
    >
      {!mobile && (
        <div
          role="separator"
          aria-label="Resize capability panel"
          aria-orientation="vertical"
          className="absolute inset-y-0 left-0 z-20 w-2 -translate-x-1/2 cursor-col-resize touch-none"
          onPointerDown={startResize}
        />
      )}
      {children}
    </aside>
  );

  return mobile ? createPortal(content, document.body) : content;
}