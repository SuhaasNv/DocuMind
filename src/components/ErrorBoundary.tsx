import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches React errors and shows a visible message (inline styles so it works even if CSS fails).
 * Prevents blank black screen when something throws.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[DocuMind] Error boundary caught:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            backgroundColor: '#0a0a0f',
            color: '#e2e8f0',
            fontFamily: 'system-ui, sans-serif',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: 14,
              color: '#94a3b8',
              maxWidth: 480,
              marginBottom: 24,
              wordBreak: 'break-word',
            }}
          >
            {this.state.error.message}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              backgroundColor: '#14b8a6',
              color: '#0a0a0f',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Try again
          </button>
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 24 }}>
            Check the browser console (F12) for details.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
