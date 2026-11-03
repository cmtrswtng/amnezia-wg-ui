import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, AlertCircle, X } from "lucide-react";
import { useI18n } from "./i18n";

const ToastContext = createContext(null);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const timers = useRef(new Set());
  const nextId = useRef(0);
  const { t } = useI18n();
  const dismiss = useCallback(
    (id) => setItems((list) => list.filter((item) => item.id !== id)),
    [],
  );
  const add = useCallback(
    (type, message) => {
      const id = ++nextId.current;
      setItems((list) => [...list.slice(-3), { id, type, message }]);
      const timer = setTimeout(() => {
        dismiss(id);
        timers.current.delete(timer);
      }, 6000);
      timers.current.add(timer);
    },
    [dismiss],
  );
  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
    },
    [],
  );
  const value = useMemo(
    () => ({
      success: (message) => add("success", message),
      error: (message) => add("error", message),
    }),
    [add],
  );
  return (
    <ToastContext value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map((item) => (
          <div
            key={item.id}
            className={`toast toast-${item.type}`}
            role={item.type === "error" ? "alert" : "status"}
          >
            {item.type === "error" ? (
              <AlertCircle size={18} />
            ) : (
              <Check size={18} />
            )}
            <span>{item.message}</span>
            <button
              className="icon-button"
              onClick={() => dismiss(item.id)}
              aria-label={t("close")}
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}
export const useToasts = () => useContext(ToastContext);
