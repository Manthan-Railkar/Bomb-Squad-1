import { useVoiceStore } from '../store/voiceStore.js';
import { setVoiceMuted } from '../voice/connectVoice.js';
import { MUTE_SELF, UNMUTE_SELF, MUTED_STATUS } from './copy.js';

/**
 * Self-mute control (Story 3.4, generalised by 3.7) — a bottom-left,
 * gesture-driven toggle for the local publisher's own mic. Rendering-only: all
 * toggle logic lives in `voice/connectVoice.ts` (`setVoiceMuted`), the flag in
 * `voiceStore.muted`. The component just drives the toggle from a click and
 * reflects the flag in its own glyph — a normal mic un-muted, a strike-through
 * mic in `voice-muted` when muted (AC #3's "the control's own visual shows the
 * muted state").
 *
 * Render gating (AC #4): show ONLY when the local connection is actually
 * PUBLISHING a mic — `voiceStore.publishing` is the authoritative signal
 * (whatever room they're in). Pre-3.7 that meant only a Bomb Room seat; post-3.7
 * the lounge is bidirectional, so a spectator / resting-team player in the lounge
 * publishes too and gets the same control. A listen-only connection (`publishing:
 * false`) and any non-`connected` state render nothing (no live mic to toggle).
 * `setVoiceMuted` is itself a no-op for a non-publisher — belt-and-suspenders.
 */
export default function MuteControl() {
  const status = useVoiceStore((s) => s.status);
  const publishing = useVoiceStore((s) => s.publishing);
  const muted = useVoiceStore((s) => s.muted);

  // Gate on the authoritative "I have a live mic" flag, not the role — this now
  // covers every publisher (active Bomb Room seat AND bidirectional-lounge member).
  if (!publishing || status !== 'connected') return null;

  const label = muted ? UNMUTE_SELF : MUTE_SELF;

  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 z-10">
      <button
        type="button"
        aria-label={label}
        aria-pressed={muted}
        title={muted ? MUTED_STATUS : MUTE_SELF}
        onClick={() => void setVoiceMuted(!muted)}
        className={`flex items-center gap-2 rounded-md bg-surface-raised px-3 py-2 font-mono text-xs uppercase tracking-widest transition-colors hover:text-ink-primary ${
          muted ? 'text-voice-muted' : 'text-ink-muted'
        }`}
      >
        <MicGlyph muted={muted} />
        {muted ? MUTED_STATUS : MUTE_SELF}
      </button>
    </div>
  );
}

/** Mic glyph — a plain mic when live, a strike-through mic when muted. Decorative
 * (the button already carries the accessible label), so it's aria-hidden. */
function MicGlyph({ muted }: { muted: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="21" />
      {/* Strike-through line only in the muted state. */}
      {muted && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  );
}
