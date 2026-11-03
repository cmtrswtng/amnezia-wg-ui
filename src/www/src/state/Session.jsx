import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "../api/client";

const SessionContext = createContext(null);
export function SessionProvider({ children }) {
  const [session, setSession] = useState({
    authenticated: null,
    requiresPassword: false,
  });
  const [rememberMeEnabled, setRememberMeEnabled] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const initialize = useCallback(async () => {
    const version = ++generation.current;
    setError("");
    try {
      const [nextSession, remember] = await Promise.all([
        api.getSession(),
        api.getRememberMe().catch(() => false),
      ]);
      if (generation.current === version) {
        setSession(nextSession);
        setRememberMeEnabled(remember === true || remember === "true");
      }
    } catch (err) {
      if (generation.current === version) setError(err.message);
    }
  }, []);
  useEffect(() => {
    initialize();
    const unauthorized = () => {
      generation.current++;
      setSession((value) => ({ ...value, authenticated: false }));
    };
    window.addEventListener("api:unauthorized", unauthorized);
    return () => {
      generation.current++;
      window.removeEventListener("api:unauthorized", unauthorized);
    };
  }, [initialize]);
  const login = useCallback(async (password, remember) => {
    const version = ++generation.current;
    await api.login(password, remember);
    if (generation.current === version)
      setSession({ authenticated: true, requiresPassword: true });
  }, []);
  const logout = useCallback(() => {
    generation.current++;
    setSession((value) => ({ ...value, authenticated: false }));
    return api.logout().catch(() => {});
  }, []);
  const value = useMemo(
    () => ({ ...session, rememberMeEnabled, error, initialize, login, logout }),
    [session, rememberMeEnabled, error, initialize, login, logout],
  );
  return <SessionContext value={value}>{children}</SessionContext>;
}
export const useSession = () => useContext(SessionContext);
