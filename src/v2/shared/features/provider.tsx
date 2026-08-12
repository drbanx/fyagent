import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { createFeaturePorts } from "../platform/features";
import type { FeaturePorts } from "./ports";
import type { SupportedAppId } from "./types";

interface ToastMessage {
  id: number;
  tone: "success" | "error" | "info";
  title: string;
  description?: string;
}

interface FeatureContextValue {
  ports: FeaturePorts;
  installTarget: SupportedAppId;
  setInstallTarget: (target: SupportedAppId) => void;
  notify: (message: Omit<ToastMessage, "id">) => void;
}

const FeatureContext = createContext<FeatureContextValue | null>(null);

function createFeatureQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
      mutations: { retry: 0 },
    },
  });
}

export function FeatureProvider({
  children,
  ports: injectedPorts,
}: {
  children: ReactNode;
  ports?: FeaturePorts;
}) {
  const ports = useMemo(
    () => injectedPorts ?? createFeaturePorts(),
    [injectedPorts],
  );
  const [queryClient] = useState(createFeatureQueryClient);
  const [installTarget, setInstallTarget] = useState<SupportedAppId>("claude");
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const notify = useCallback((message: Omit<ToastMessage, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { ...message, id }]);
    window.setTimeout(
      () => setToasts((current) => current.filter((toast) => toast.id !== id)),
      4200,
    );
  }, []);
  const value = useMemo(
    () => ({ ports, installTarget, setInstallTarget, notify }),
    [installTarget, notify, ports],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <FeatureContext.Provider value={value}>
        {children}
        <div className="fy-toast-host" aria-live="polite" aria-atomic="false">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`fy-toast fy-toast-${toast.tone}`}
              role="status"
            >
              <strong>{toast.title}</strong>
              {toast.description && <span>{toast.description}</span>}
            </div>
          ))}
        </div>
      </FeatureContext.Provider>
    </QueryClientProvider>
  );
}

export function useFeatures(): FeatureContextValue {
  const context = useContext(FeatureContext);
  if (!context)
    throw new Error("useFeatures must be used within FeatureProvider");
  return context;
}
