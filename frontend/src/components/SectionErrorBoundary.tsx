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
      <div className="p-4 border-b border-border/40 bg-muted/20 text-center">
        <p className="text-sm text-muted-foreground">{this.props.section} could not load on this device.</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => this.setState({ error: null })}
        >
          Retry
        </Button>
      </div>
    );
  }
}
