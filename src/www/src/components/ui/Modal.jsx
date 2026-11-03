import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { useI18n } from "../../state/i18n";
import { animate } from "motion";

export default function Modal({
  title,
  children,
  onClose,
  wide = false,
  busy = false,
}) {
  const dialog = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  const titleId = useId();
  const { t } = useI18n();
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    element.showModal();
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const animation = reduced
      ? null
      : animate(
          element,
          {
            opacity: [0, 1],
            transform: [
              "translateY(6px) scale(.985)",
              "translateY(0) scale(1)",
            ],
          },
          { type: "spring", bounce: 0, visualDuration: 0.22 },
        );
    document.body.style.overflow = "hidden";
    (
      element.querySelector("[autofocus]") ||
      element.querySelector('input:not([type="checkbox"])') ||
      element.querySelector("button")
    )?.focus();
    return () => {
      animation?.stop();
      element.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  function onKeyDown(event) {
    if (event.key !== "Tab") return;
    const focusable = [
      ...dialog.current.querySelectorAll(
        'button, input, select, textarea, a[href], [tabindex="0"]',
      ),
    ].filter((item) => !item.disabled);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  return (
    <dialog
      ref={dialog}
      className={`modal ${wide ? "modal-wide" : ""}`}
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close.current();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            close.current();
        }
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          aria-label={t("close")}
          onClick={onClose}
          disabled={busy}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
