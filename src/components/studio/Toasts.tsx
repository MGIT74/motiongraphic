"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Info, RotateCcw, X } from "lucide-react";
import { friendlyError, type ErrorContext } from "@/lib/studio/errors";

type ToastKind = "error" | "success" | "info";

interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  hint?: string;
  detail?: string;
  action?: { label: string; run: () => void };
}

interface ToastApi {
  /** Erreur technique → message clair (titre, conseil, détails, Réessayer). */
  error: (error: unknown, context?: ErrorContext, retry?: () => void) => void;
  success: (title: string, hint?: string, action?: Toast["action"]) => void;
  info: (title: string, hint?: string) => void;
}

const ToastContext = createContext<ToastApi>({ error: () => {}, success: () => {}, info: () => {} });

export function useToasts(): ToastApi {
  return useContext(ToastContext);
}

/**
 * Notifications du Studio (bas droite) : un titre compréhensible, ce qu'il faut
 * faire, le message technique repliable et, si possible, un bouton Réessayer.
 * Les erreurs restent 12 s (ou jusqu'à fermeture), les succès 6 s ; une même
 * erreur répétée n'est affichée qu'une fois.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (toast: Omit<Toast, "id">, ttl: number) => {
      const id = nextId.current++;
      setToasts((list) => {
        const dedup = list.filter((t) => !(t.title === toast.title && t.detail === toast.detail));
        return [...dedup, { ...toast, id }].slice(-4);
      });
      window.setTimeout(() => dismiss(id), ttl);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      error: (error, context = "generic", retry) => {
        const f = friendlyError(error, context);
        push(
          {
            kind: "error",
            title: f.title,
            hint: f.hint,
            detail: f.detail,
            action: retry && f.retryable ? { label: "Réessayer", run: retry } : undefined,
          },
          12_000
        );
      },
      success: (title, hint, action) => push({ kind: "success", title, hint, action }, 6_000),
      info: (title, hint) => push({ kind: "info", title, hint }, 6_000),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[300] flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite" data-toasts>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const Icon = toast.kind === "error" ? AlertTriangle : toast.kind === "success" ? CheckCircle2 : Info;
  const tone =
    toast.kind === "error"
      ? "border-red-500/40 bg-[#2a1416]/95 text-red-100"
      : toast.kind === "success"
        ? "border-emerald-500/40 bg-[#102a1e]/95 text-emerald-100"
        : "border-line bg-surface/95 text-ink";
  return (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      className={`pointer-events-auto rounded-2xl border p-3 shadow-2xl backdrop-blur ${tone}`}
      data-toast={toast.kind}
    >
      <div className="flex items-start gap-2.5">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">{toast.title}</p>
          {toast.hint ? <p className="mt-0.5 text-xs leading-relaxed opacity-85">{toast.hint}</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {toast.action ? (
              <button
                type="button"
                onClick={() => {
                  toast.action?.run();
                  onClose();
                }}
                className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-full bg-white/10 px-2.5 text-xs font-semibold hover:bg-white/20"
              >
                {toast.action.label === "Réessayer" ? <RotateCcw className="h-3 w-3" aria-hidden="true" /> : null} {toast.action.label}
              </button>
            ) : null}
            {toast.detail ? (
              <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex cursor-pointer items-center gap-0.5 text-[11px] opacity-70 hover:opacity-100" aria-expanded={open}>
                Détails <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
            ) : null}
          </div>
          {open && toast.detail ? (
            <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/30 p-2 font-mono text-[10px] leading-relaxed opacity-80">{toast.detail}</pre>
          ) : null}
        </div>
        <button type="button" onClick={onClose} className="shrink-0 cursor-pointer rounded-full p-0.5 opacity-60 hover:opacity-100" aria-label="Fermer">
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
