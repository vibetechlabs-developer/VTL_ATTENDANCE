import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode };
type State = { error: Error | null };

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

    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 p-6 text-center bg-background">
        <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
        <p className="text-sm text-muted-foreground max-w-md">
          This page hit an error in your browser (common on older iPhone Safari). Try refreshing or signing in again.
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          <Button type="button" onClick={() => window.location.reload()}>
            Reload
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              try {
                localStorage.removeItem("vtl-auth");
              } catch {
                /* ignore */
              }
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
