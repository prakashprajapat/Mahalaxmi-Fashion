'use client';
import { useEffect, useRef } from 'react';

/**
 * Ask the server something, over and over, without being a nuisance.
 *
 * Polling gets a bad name from the version that just sets an interval and
 * leaves it running. That version keeps asking while the tab is in the
 * background, keeps asking on a train with no signal, and keeps asking every
 * two seconds while the server is down — which is the moment it is least able
 * to cope. None of that is inherent to polling; it is just what a bare
 * setInterval does.
 *
 * For this shop polling is the RIGHT tool, not a compromise. A few orders a
 * day is not a stream. A server-sent events connection or a websocket would
 * mean holding a connection open on a VPS already running Postgres, .NET and
 * Next.js, plus reconnect logic to write and get wrong, to learn about
 * something that happens six times a day. The textbook answer is for a score
 * ticking every second, and that is not this.
 *
 * So: poll, and observe the four manners.
 *
 *   Stop when nobody is looking. A hidden tab learns nothing from an answer.
 *   Stop when there is no network, rather than firing requests at nothing.
 *   Back off when it fails, so a struggling server is not also being hammered.
 *   Ask immediately on coming back, so returning to the tab feels instant
 *     instead of waiting out the rest of an interval.
 */
export function usePoll(
  task: () => Promise<void>,
  opts: { everyMs: number; enabled?: boolean; maxBackoffMs?: number },
) {
  const { everyMs, enabled = true, maxBackoffMs = 5 * 60_000 } = opts;

  // The task changes identity on every render (it closes over state), and a
  // dependency on it would tear the timer down and rebuild it each time. The
  // ref keeps the timer stable while always calling the newest version.
  const taskRef = useRef(task);
  taskRef.current = task;

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let wait = everyMs;
    let running = false;

    const visible = () =>
      typeof document === 'undefined' || document.visibilityState === 'visible';
    const online = () =>
      typeof navigator === 'undefined' || navigator.onLine !== false;

    const schedule = (ms: number) => {
      if (stopped) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, ms);
    };

    const run = async () => {
      if (stopped) return;

      // Not a failure, so the backoff is left alone: there is simply no point
      // asking. Check again after the normal interval in case the tab came
      // back without firing the event.
      if (!visible() || !online()) { schedule(everyMs); return; }

      // A slow answer must not stack a second request on top of the first.
      if (running) { schedule(everyMs); return; }

      running = true;
      try {
        await taskRef.current();
        wait = everyMs;                       // worked — back to the normal rhythm
      } catch {
        // Doubling, capped. A server that is down gets asked every 30s, then
        // a minute, then two — instead of forty times a minute while it is
        // trying to come back up. Swallowed on purpose: a poll that fails is
        // not an error the person needs to see, it is one to try again later.
        wait = Math.min(wait * 2, maxBackoffMs);
      } finally {
        running = false;
      }
      schedule(wait);
    };

    // Coming back to the tab asks at once rather than waiting out the
    // interval, which is what makes it feel live rather than laggy.
    const wake = () => { if (visible() && online()) { wait = everyMs; schedule(0); } };

    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);

    schedule(everyMs);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
    };
  }, [everyMs, enabled, maxBackoffMs]);
}
