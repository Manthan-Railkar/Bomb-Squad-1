/**
 * Build-time feature flag for the LiveKit voice subsystem.
 *
 * Defaults to ENABLED so the full-featured build is unchanged — only an explicit
 * `VITE_VOICE_ENABLED=false` (baked at `vite build` time) turns it off. Used by
 * the ngrok-tunnel / no-voice deploy, where LiveKit + coturn are not reachable by
 * remote players: hiding the two connect affordances (`LobbyMicCheck`,
 * `VoiceController`) keeps voice fully dormant, since `connectVoice()` is never
 * invoked without a user clicking one of them. Nothing is removed — flip the flag
 * back to unset/`true` and voice returns.
 */
export function isVoiceEnabled(): boolean {
  return import.meta.env.VITE_VOICE_ENABLED !== 'false';
}
