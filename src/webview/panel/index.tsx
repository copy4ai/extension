import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './components/App';
import { VSCodeAPI } from './types';

declare function acquireVsCodeApi(): VSCodeAPI;

const vscode = acquireVsCodeApi();

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: '#f44', fontFamily: 'monospace', fontSize: 13 }}>
          <h3 style={{ marginBottom: 12 }}>Copy4AI Error</h3>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App vscode={vscode} />
  </ErrorBoundary>
);
