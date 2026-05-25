import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { safeRemoveItem } from "@/utils/storageSafe";

type Props = { children: ReactNode };
type State = { error: Error | null };

function clearAppStorage() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("vtl")) keys.push(k);
    }
    keys.forEach((k) => safeRemoveItem(localStorage, k));
  } catch {
    /* ignore */
  }
  try {
    safeRemoveItem(sessionStorage, "vtl-splash-shown");
  } catch {
    /* ignore */
  }
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App render error:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const detail = this.state.error.message || String(this.state.error);

    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 p-6 text-center bg-background">
        <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
        <p className="text-sm text-muted-foreground max-w-md">
          The app crashed after sign-in. Close Incognito, use normal Safari, then reload. If this text mentions
          &quot;older iPhone Safari&quot;, the server still has the old build — deploy the latest frontend.
        </p>
        <p className="text-[10px] text-muted-foreground/60">Build tag: ios-fix-2026-05-25</p>
        {detail ? (
          <p className="text-xs text-muted-foreground/80 max-w-md font-mono break-all">{detail}</p>
        ) : null}
        <div className="flex flex-wrap gap-2 justify-center">
          <Button type="button" onClick={() => window.location.reload()}>
            Reload
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              clearAppStorage();
              window.location.href = "/login";
            }}
          >
            Sign in again
          </Button>
        </div>
      </div>
    );
  }
}
