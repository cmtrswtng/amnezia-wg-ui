// A minimal, first-mount-only adaptation of React Bits CountUp (David Haz).
// See THIRD_PARTY_NOTICES.md and react-bits.LICENSE.md.
import { useEffect, useRef } from "react";
import { animate, useReducedMotion } from "motion/react";

export default function CountUp({ value }) {
  const ref = useRef(null);
  const initialized = useRef(false);
  const current = useRef(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!ref.current) return;
    if (initialized.current || reduced) {
      ref.current.textContent = String(value);
      initialized.current = true;
      return;
    }
    const control = animate(current.current, value, {
      duration: 0.65,
      ease: "easeOut",
      onUpdate: (number) => {
        current.current = number;
        if (ref.current) ref.current.textContent = String(Math.round(number));
      },
      onComplete: () => {
        initialized.current = true;
      },
    });
    return () => control.stop();
  }, [value, reduced]);
  return (
    <>
      <span ref={ref} aria-hidden="true">
        {value}
      </span>
      <span className="sr-only">{value}</span>
    </>
  );
}
