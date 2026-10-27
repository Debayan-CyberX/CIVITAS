import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  failed: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };
  static getDerivedStateFromError(): State {
    return { failed: true };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('CIVITAS foundation error', error, info.componentStack);
  }
  override render() {
    if (this.state.failed)
      return (
        <main>
          <h1>CIVITAS</h1>
          <p role="alert">The foundation could not load. Reload to retry.</p>
        </main>
      );
    return this.props.children;
  }
}
