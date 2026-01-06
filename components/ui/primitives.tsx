// components/ui/primitives.tsx
// Reusable UI primitives with canonical styling.

import React from 'react';

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

export function Card(props: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div
      className={cx(
        'rounded-canon border border-canon-border bg-canon-card/80 shadow-canon-2 backdrop-blur-sm',
        props.className
      )}
    >
      {(props.title || props.right) && (
        <div className="px-5 py-4 border-b border-canon-border flex items-center justify-between gap-3">
          <div className="text-[13px] tracking-wide font-semibold text-canon-text uppercase">{props.title}</div>
          <div className="flex items-center gap-2">{props.right}</div>
        </div>
      )}
      <div className={cx('p-5', props.bodyClassName)}>{props.children}</div>
    </div>
  );
}

export function Button(props: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  kind?: 'ghost' | 'primary' | 'danger';
  className?: string;
  title?: string;
}) {
  const kind = props.kind || 'ghost';
  return (
    <button
      title={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
      className={cx(
        'px-4 py-2 rounded-xl border text-sm transition select-none',
        'border-canon-border bg-white/0 hover:bg-white/5 active:bg-white/8',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        kind === 'primary' && 'border-white/0 bg-canon-accent/20 hover:bg-canon-accent/25 text-canon-text',
        kind === 'danger' && 'border-white/0 bg-canon-bad/20 hover:bg-canon-bad/25 text-canon-text',
        props.className
      )}
    >
      {props.children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { className?: string }) {
  return (
    <input
      {...props}
      className={cx(
        'px-3 py-2 rounded-xl border border-canon-border bg-canon-card-2/70 text-sm',
        'placeholder:text-canon-faint focus-visible:shadow-none',
        props.className
      )}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { className?: string }) {
  return (
    <select
      {...props}
      className={cx(
        'px-3 py-2 rounded-xl border border-canon-border bg-canon-card-2/70 text-sm',
        'focus-visible:shadow-none',
        props.className
      )}
    />
  );
}

export function TabButton(props: {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={props.onClick}
      className={cx(
        'px-4 py-2 rounded-xl border text-sm transition',
        props.active
          ? 'border-white/0 bg-white/10 text-canon-text shadow-canon-1'
          : 'border-canon-border bg-white/0 text-canon-muted hover:bg-white/5',
        props.className
      )}
    >
      {props.children}
    </button>
  );
}

export function Badge(props: { children: React.ReactNode; tone?: 'muted' | 'good' | 'bad' }) {
  const tone = props.tone || 'muted';
  const cls =
    tone === 'good'
      ? 'bg-canon-good/15 text-canon-good'
      : tone === 'bad'
      ? 'bg-canon-bad/15 text-canon-bad'
      : 'bg-white/8 text-canon-muted';
  return <span className={cx('px-2 py-1 rounded-lg text-xs border border-canon-border', cls)}>{props.children}</span>;
}
