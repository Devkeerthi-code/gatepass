"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Icon } from "./icon";

type Toast = { id: number; message: string; error: boolean; leaving: boolean };
type ToastFn = (message: string, opts?: { error?: boolean }) => void;

const ToastContext = createContext<ToastFn>(() => undefined);

export function useToast(): ToastFn {
  return useContext(ToastContext);
}

let nextId = 1;

export function Toaster({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback<ToastFn>((message, opts) => {
    const id = nextId++;
    setToasts((t) => [...t.slice(-2), { id, message, error: !!opts?.error, leaving: false }]);
    setTimeout(() => setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x))), 3200);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.error ? "is-error" : ""} ${t.leaving ? "leaving" : ""}`}>
            <Icon name={t.error ? "alert" : "check"} />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}
