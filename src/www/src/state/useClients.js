import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";

export function useClients(active) {
  const [clients, setClients] = useState(null);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const state = useRef({
    active: false,
    epoch: 0,
    pending: null,
    controller: null,
    history: new Map(),
  });
  const refresh = useCallback(() => {
    const current = state.current;
    if (!current.active) return Promise.resolve([]);
    if (current.pending) return current.pending;
    const epoch = current.epoch;
    const controller = new AbortController();
    current.controller = controller;
    const request = (async () => {
      try {
        const list = await api.getClients(controller.signal);
        if (!current.active || epoch !== current.epoch) return [];
        const now = Date.now();
        const ids = new Set(list.map((client) => client.id));
        for (const id of current.history.keys())
          if (!ids.has(id)) current.history.delete(id);
        const next = list.map((client) => {
          const previous = current.history.get(client.id);
          const seconds = previous
            ? Math.max(1, (now - previous.at) / 1000)
            : 1;
          const rx = previous
            ? Math.max(0, (client.transferRx || 0) - previous.rx) / seconds
            : 0;
          const tx = previous
            ? Math.max(0, (client.transferTx || 0) - previous.tx) / seconds
            : 0;
          const rxHistory = [
            ...(previous?.rxHistory || Array(23).fill(0)),
            rx,
          ].slice(-24);
          const txHistory = [
            ...(previous?.txHistory || Array(23).fill(0)),
            tx,
          ].slice(-24);
          current.history.set(client.id, {
            rx: client.transferRx || 0,
            tx: client.transferTx || 0,
            at: now,
            rxHistory,
            txHistory,
          });
          return {
            ...client,
            transferRxCurrent: rx,
            transferTxCurrent: tx,
            transferRxHistory: rxHistory,
            transferTxHistory: txHistory,
          };
        });
        setClients(next);
        setError("");
        setUpdatedAt(now);
        return next;
      } catch (err) {
        if (
          current.active &&
          epoch === current.epoch &&
          err.name !== "AbortError"
        )
          setError(err.message);
        return [];
      } finally {
        if (current.pending === request) current.pending = null;
      }
    })();
    current.pending = request;
    return request;
  }, []);
  useEffect(() => {
    const current = state.current;
    current.epoch++;
    current.active = active;
    if (!active) {
      setClients(null);
      setError("");
      setUpdatedAt(null);
      current.history.clear();
      return;
    }
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      clearInterval(timer);
      current.active = false;
      current.epoch++;
      current.controller?.abort();
      current.pending = null;
    };
  }, [active, refresh]);
  const mutate = useCallback(
    async (action) => {
      const epoch = state.current.epoch;
      await action();
      if (!state.current.active || epoch !== state.current.epoch) return [];
      // Finish any pre-mutation poll, then fetch the new state.
      await state.current.pending;
      return refresh();
    },
    [refresh],
  );
  const bulk = useCallback(
    async (ids, action) => {
      let done = 0;
      let failed = 0;
      const epoch = state.current.epoch;
      for (const id of ids) {
        if (!state.current.active || epoch !== state.current.epoch) break;
        try {
          await action(id);
          done++;
        } catch {
          failed++;
        }
      }
      await state.current.pending;
      if (state.current.active && epoch === state.current.epoch)
        await refresh();
      return { done, failed };
    },
    [refresh],
  );
  return { clients, error, updatedAt, refresh, mutate, bulk };
}
