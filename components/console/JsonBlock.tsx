import React, { useMemo, useState } from 'react';

/**
 * JsonBlock renders a potentially huge JSON payload without freezing the UI.
 * Key idea: stringify ONLY when the user expands the <details>.
 */
export const JsonBlock: React.FC<{
  title: string;
  value: unknown;
  /** Hard cap for stringify to prevent accidental multi-MB dumps from killing the tab. */
  maxChars?: number;
  /** Optional hint shown next to the title. */
  hint?: string;
}> = ({ title, value, maxChars = 250_000, hint }) => {
  const [open, setOpen] = useState(false);

  const text = useMemo(() => {
    if (!open) return null;
    let s = '';
    try {
      s = JSON.stringify(value, null, 2);
    } catch (e) {
      s = `<<JSON.stringify failed: ${String(e)}>>`;
    }
    if (s.length > maxChars) {
      return s.slice(0, maxChars) + `\n\n<<truncated: ${s.length} chars total, maxChars=${maxChars}>>`;
    }
    return s;
  }, [open, value, maxChars]);

  return (
    <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest">{title}</div>
          {hint ? <div className="text-[10px] text-slate-500 mt-1">{hint}</div> : null}
        </div>
      </div>

      <details
        className="mt-2"
        open={open}
        onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="text-[11px] text-slate-300 cursor-pointer select-none">{open ? 'close' : 'open'}</summary>
        <pre className="mt-2 text-[10px] font-mono whitespace-pre-wrap break-words text-slate-200/90">
          {text}
        </pre>
      </details>
    </div>
  );
};

