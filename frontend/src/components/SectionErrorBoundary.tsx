import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  children: ReactNode;
  section: string;
  fallback?: ReactNode;
};

type State = { error: Error | null };

/** Keeps one broken section from crashing the whole dashboard (common on mobile). */
export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.section}]`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="p-6 border border-border/40 rounded-xl bg-muted/10 text-center max-w-md mx-auto my-8">
        <p className="text-sm font-semibold text-foreground">{this.props.section} Error</p>
          <p className="text-xs text-muted-foreground mt-1 font-mono bg-muted/30 p-2 rounded border border-border/20">
            {this.state.error.message || 'An unexpected error occurred.'}
          </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => this.setState({ error: null })}
        >
          Retry
        </Button>
      </div>
    );
  }
}
