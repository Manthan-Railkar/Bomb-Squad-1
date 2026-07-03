/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Optional: absent when no .env is present — App.tsx falls back at runtime.
  readonly VITE_SERVER_URL?: string;
  // Voice feature flag (see voice/voiceEnabled.ts). Absent ⇒ voice enabled;
  // only the literal string 'false' disables it. Baked at build time.
  readonly VITE_VOICE_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
