// Short, non-blocking transitions for functional content changes.
import { motion, useReducedMotion } from "motion/react";

export default function AnimatedContent({
  children,
  className = "",
  delay = 0,
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduced
          ? { duration: 0 }
          : { type: "spring", bounce: 0, visualDuration: 0.32, delay }
      }
    >
      {children}
    </motion.div>
  );
}
