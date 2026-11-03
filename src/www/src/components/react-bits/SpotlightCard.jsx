// Adapted from React Bits SpotlightCard, Copyright (c) 2026 David Haz.
// See THIRD_PARTY_NOTICES.md and react-bits.LICENSE.md for the source and license.
import { useRef } from "react";

export default function SpotlightCard({ children, className = "", ...props }) {
  const ref = useRef(null);
  function move(event) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    ref.current.style.setProperty(
      "--spotlight-x",
      `${event.clientX - rect.left}px`,
    );
    ref.current.style.setProperty(
      "--spotlight-y",
      `${event.clientY - rect.top}px`,
    );
  }
  return (
    <article
      ref={ref}
      className={`spotlight-card ${className}`}
      onPointerMove={move}
      {...props}
    >
      {children}
    </article>
  );
}
