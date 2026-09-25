// Tiny helpers for writing pattern strings (see ../patterns.js for the notation).

/** 16-step empty grid bar. */
export const REST = '................'
/** One silent bar in SEQ notation. */
export const SILENT = '.:16'

/** Repeat a bar (or multi-bar string) `n` times. */
export const rep = (bar, n) => Array(n).fill(bar).join(' | ')

/** Join bars / multi-bar chunks. */
export const bars = (...parts) => parts.join(' | ')

/** `n` bars of `bar` where the last one is replaced by `last` (fills, pickups, turnarounds). */
export const withLast = (bar, last, n = 8) => (n > 1 ? bars(rep(bar, n - 1), last) : last)

/** `n` bars where only the first differs (e.g. crash on the downbeat). */
export const withFirst = (first, bar, n = 8) => (n > 1 ? bars(first, rep(bar, n - 1)) : first)
