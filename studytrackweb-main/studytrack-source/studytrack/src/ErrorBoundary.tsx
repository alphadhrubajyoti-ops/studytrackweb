import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error('StudyTrack UI error', error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        style={{
          padding: 24,
          maxWidth: 480,
          margin: '10vh auto',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <h1 style={{ fontSize: 22 }}>Something went wrong</h1>
        <p>Your study records are safe in this browser. Reload the page to continue.</p>
        <button
          onClick={() => location.reload()}
          style={{
            padding: '12px 20px',
            borderRadius: 12,
            border: 0,
            background: '#3b6446',
            color: '#fff',
            fontWeight: 600,
          }}
        >
          Reload StudyTrack
        </button>
      </div>
    );
  }
}
