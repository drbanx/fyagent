import { useEffect } from "react";

import { signalFrontendReady } from "../../shared/platform";
import { TooltipProvider } from "../../shared/ui/primitives";
import { ContentViewport } from "./ContentViewport";
import { TopBar } from "./TopBar";

export function AppShell() {
  useEffect(() => {
    void signalFrontendReady().catch((error: unknown) => {
      console.error("FyAgent V2 frontend lifecycle readiness failed", error);
    });
  }, []);

  return (
    <TooltipProvider delayDuration={250} skipDelayDuration={100}>
      <div className="fy-app-shell" data-testid="app-shell">
        <TopBar />
        <ContentViewport />
      </div>
    </TooltipProvider>
  );
}
