import React from 'react';
import { arr } from '../lib/utils/arr';

type Props = { children: React.ReactNode };

type State = {
  error: Error | null;
  info: { componentStack?: string } | null;
  eventLog: any[];
};

declare global {
  interface Window {
    __KANONAR_DIAG__?: any[];
  }
}

function getDiag() {
  const d = window.__KANONAR_DIAG__;
  return Array.isArray(d) ? d.slice(-50) : [];
}

function downloadJson(obj: any, name: string) {
  try {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {}
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: null, eventLog: [] };

  static getDerivedStateFromError(error: Error) {
    return { error } as Partial<State>;
  }

  componentDidCatch(error: Error, info: any) {
    try { arr(null); } catch {}
    const diag = getDiag();
    this.setState({ error, info, eventLog: diag });
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    const report = {
      schema: 'KanonarCrashReportV1',
      time: new Date().toISOString(),
      message: String(error.message || error),
      stack: String((error as any).stack || ''),
      componentStack: String(info?.componentStack || ''),
      diag: this.state.eventLog,
      userAgent: navigator.userAgent,
      location: String(window.location.href),
    };

    return (
      <div style={{ padding: 16, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Runtime error</div>
            <div style={{ opacity: 0.9, fontSize: 12 }}>{report.message}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => {
                this.setState({ error: null, info: null, eventLog: [] });
                window.location.reload();
              }}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.2)', color: 'white' }}
            >
              Reload
            </button>
            <button
              onClick={() => downloadJson(report, `kanonar-crash-${Date.now()}.json`)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.2)', color: 'white' }}
            >
              Download crash report
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Stack</div>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, lineHeight: 1.35, padding: 10, borderRadius: 10, background: 'rgba(0,0,0,0.35)', color: '#e6e6e6' }}>
              {report.stack}
            </pre>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Component stack</div>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, lineHeight: 1.35, padding: 10, borderRadius: 10, background: 'rgba(0,0,0,0.35)', color: '#e6e6e6' }}>
              {report.componentStack}
            </pre>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Recent diagnostics (last 50)</div>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, lineHeight: 1.35, padding: 10, borderRadius: 10, background: 'rgba(0,0,0,0.35)', color: '#e6e6e6' }}>
              {JSON.stringify(report.diag, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    );
  }
}
