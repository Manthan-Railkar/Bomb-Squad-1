import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import type { MeshStandardMaterial } from 'three';
import { useGameStore } from '../../store/gameStore.js';
import { prefersReducedMotion } from '../../scenes/dom.js';
import type { ModuleDefuserViewProps } from '../registry.js';
import { dispatchModuleAction } from '../dispatch.js';
import { moduleClickHandlers } from '../interaction.js';
import { MORSE_CODE_MODULE_ID, MORSE_FREQUENCIES, formatMorseFrequency, type MorseCodeState } from './types.js';
import { morsePatternForWord } from './solve.js';

/**
 * Morse Code DefuserView — R3F rendering ONLY, zero game logic. A lamp flashes
 * the transmitted `word` in Morse on a loop (pure presentation — the timeline
 * derives from the word); a frequency dial (up/down + LCD readout) and a TX
 * button are the only inputs. The answer (the frequency) is validated
 * server-side and never present here — the Defuser sees only the flashes.
 *
 * FLASH PLAYBACK (copied from Simon 7.2's architecture): driven exclusively from
 * useFrame off a clock ref, emissiveIntensity mutated in place — zero React
 * state, zero per-frame allocations. The on/off timeline is precomputed ONCE per
 * word (useMemo) as cumulative segment boundaries; each frame advances a cursor
 * ref, never Array.find.
 *
 * CRITICAL DIVERGENCE FROM SIMON 7.2 — do NOT reset playback on every `data`
 * reference change. The store hands a fresh `data` object on every MODULE_UPDATE,
 * and for Morse the dial moves on every FREQ_UP/DOWN click. Restarting the
 * transmission on a dial click would garble mid-word decoding. We reset the clock
 * ONLY when the `word` primitive changes (compared in a ref) or on mount, and we
 * keep looping across dial moves AND across a wrong-TX strike (the physical lamp
 * doesn't care). A reviewer must not "fix" this back to Simon's data-keyed reset.
 *
 * SOLVED: a solved module goes quiescent — the lamp holds dark and clicks neither
 * animate nor dispatch (7.2's solved-quiescent pattern).
 *
 * PHOTOSENSITIVITY: UNIT ≥ 0.17s keeps the worst-case cadence (dot + gap) under
 * 3 flashes/sec. prefers-reduced-motion scales the tempo uniformly (delta ×0.6),
 * preserving the dot:dash ratio and the discrete on/off steps.
 */

/** Standard Morse timing in UNITs. */
const UNIT = 0.25; // seconds per unit (2 flashes/sec worst case — under the 3/sec floor)
const DOT_ON = 1;
const DASH_ON = 3;
const SYMBOL_GAP = 1; // between symbols within a letter
const LETTER_GAP = 3; // between letters
const WORD_GAP = 7; // before the word repeats

const LAMP_COLOR = '#F2C744'; // amber signal lamp
const LAMP_OFF_EMISSIVE = 0.04;
const LAMP_ON_EMISSIVE = 1.1;
const LCD_COLOR = '#7CFF6B';
const BTN_COLOR = '#d7d2c4';
const BTN_INK = '#0b0f0a';
const BASE_Z = 0.02;

/** A precomputed flash timeline: on/off flags + cumulative boundaries (seconds). */
interface FlashTimeline {
  readonly on: ReadonlyArray<boolean>;
  /** boundaries[i]..boundaries[i+1] is segment i; boundaries[last] === loop. */
  readonly boundaries: ReadonlyArray<number>;
  readonly loop: number;
}

/** Build the cumulative on/off segments for a word — ONCE per word (useMemo). */
function buildTimeline(word: string): FlashTimeline {
  const letters = morsePatternForWord(word);
  const on: boolean[] = [];
  const durs: number[] = []; // in UNITs
  letters.forEach((code, li) => {
    [...code].forEach((symbol, si) => {
      on.push(true);
      durs.push(symbol === '-' ? DASH_ON : DOT_ON);
      if (si < code.length - 1) {
        on.push(false);
        durs.push(SYMBOL_GAP);
      }
    });
    // Gap AFTER this letter: letter gap between letters, word gap after the last.
    on.push(false);
    durs.push(li < letters.length - 1 ? LETTER_GAP : WORD_GAP);
  });
  const boundaries: number[] = [0];
  let acc = 0;
  for (const d of durs) {
    acc += d * UNIT;
    boundaries.push(acc);
  }
  return { on, boundaries, loop: acc };
}

/** Select the whole module envelope — the view needs `status` (solved) + `data`. */
function selectMorseModule(moduleIndex: number) {
  return (s: ReturnType<typeof useGameStore.getState>) => {
    const mod = s.bomb?.modules[moduleIndex];
    return mod?.moduleId === MORSE_CODE_MODULE_ID ? mod : null;
  };
}

export function MorseCodeDefuserView({ moduleIndex }: ModuleDefuserViewProps) {
  const selector = useMemo(() => selectMorseModule(moduleIndex), [moduleIndex]);
  const mod = useGameStore(selector);
  const data = (mod?.data as MorseCodeState | undefined) ?? null;
  const word = data?.word ?? null;
  const solved = mod?.status === 'solved';

  // Timeline rebuilds ONLY when the word changes — never on a dial move.
  const timeline = useMemo(() => (word ? buildTimeline(word) : null), [word]);

  const clock = useRef(0);
  const cursor = useRef(0); // current segment index; advanced monotonically
  const lastWord = useRef<string | null>(null);
  const lamp = useRef<MeshStandardMaterial | null>(null);
  const reduced = useMemo(() => prefersReducedMotion(), []);

  useFrame((_, delta) => {
    // Reset playback ONLY when the word changes (or first mount) — NOT on every
    // data change. Dial moves hand a fresh data object but the same word; the
    // transmission must keep looping. (Deliberate divergence from Simon 7.2 —
    // do not change this to a data-keyed reset.)
    if (word !== lastWord.current) {
      lastWord.current = word;
      clock.current = 0;
      cursor.current = 0;
    }

    const mat = lamp.current;
    if (!mat || !timeline) return;

    // Solved → lamp dark, playback frozen.
    if (solved) {
      mat.emissiveIntensity = LAMP_OFF_EMISSIVE;
      return;
    }

    clock.current += reduced ? delta * 0.6 : delta;
    const { boundaries, on, loop } = timeline;
    let local = clock.current % loop;
    if (local < 0) local += loop;

    // Advance the cursor to the segment covering `local` (ref-scan, no alloc).
    if (local < boundaries[cursor.current]) cursor.current = 0; // wrapped
    while (cursor.current < on.length - 1 && local >= boundaries[cursor.current + 1]) {
      cursor.current++;
    }
    mat.emissiveIntensity = on[cursor.current] ? LAMP_ON_EMISSIVE : LAMP_OFF_EMISSIVE;
  });

  if (!data) return null;

  const dispatchIfArmed = (action: { type: 'FREQ_UP' | 'FREQ_DOWN' | 'TX' }) => {
    const live = useGameStore.getState().bomb?.modules[moduleIndex];
    if (live?.status === 'solved') return; // solved-inert: no dead traffic
    dispatchModuleAction(moduleIndex, action);
  };

  const upHandlers = moduleClickHandlers(() => dispatchIfArmed({ type: 'FREQ_UP' }));
  const downHandlers = moduleClickHandlers(() => dispatchIfArmed({ type: 'FREQ_DOWN' }));
  const txHandlers = moduleClickHandlers(() => dispatchIfArmed({ type: 'TX' }));

  return (
    <group>
      {/* Flashing signal lamp. */}
      <mesh position={[0, 0.2, BASE_Z]}>
        <sphereGeometry args={[0.07, 24, 24]} />
        <meshStandardMaterial
          ref={(m) => {
            lamp.current = m;
          }}
          color={LAMP_COLOR}
          emissive={LAMP_COLOR}
          emissiveIntensity={LAMP_OFF_EMISSIVE}
        />
      </mesh>

      {/* Frequency LCD readout (re-renders on freqIndex change). */}
      <mesh position={[0, 0.02, BASE_Z]}>
        <boxGeometry args={[0.44, 0.13, 0.03]} />
        <meshStandardMaterial color="#12210f" emissive={LCD_COLOR} emissiveIntensity={0.25} />
      </mesh>
      <Text
        font="/fonts/DSEG7Classic-Regular.ttf"
        fontSize={0.07}
        color={LCD_COLOR}
        anchorX="center"
        anchorY="middle"
        position={[0, 0.02, BASE_Z + 0.02]}
      >
        {formatMorseFrequency(MORSE_FREQUENCIES[data.freqIndex])}
      </Text>

      {/* Dial down / up controls. name = e2e projection target (TD-7), render-only. */}
      <group name={`m${moduleIndex}-morse-down`} position={[-0.16, -0.18, BASE_Z]} {...downHandlers}>
        <mesh>
          <boxGeometry args={[0.12, 0.12, 0.03]} />
          <meshStandardMaterial color={BTN_COLOR} emissive={BTN_COLOR} emissiveIntensity={0.05} />
        </mesh>
        <Text font="/fonts/jetbrains-mono-700.ttf" fontSize={0.08} color={BTN_INK} anchorX="center" anchorY="middle" position={[0, 0, 0.02]}>
          {'▼'}
        </Text>
      </group>
      <group name={`m${moduleIndex}-morse-up`} position={[0.16, -0.18, BASE_Z]} {...upHandlers}>
        <mesh>
          <boxGeometry args={[0.12, 0.12, 0.03]} />
          <meshStandardMaterial color={BTN_COLOR} emissive={BTN_COLOR} emissiveIntensity={0.05} />
        </mesh>
        <Text font="/fonts/jetbrains-mono-700.ttf" fontSize={0.08} color={BTN_INK} anchorX="center" anchorY="middle" position={[0, 0, 0.02]}>
          {'▲'}
        </Text>
      </group>

      {/* TX transmit button. name = e2e projection target (TD-7), render-only. */}
      <group name={`m${moduleIndex}-morse-tx`} position={[0, -0.18, BASE_Z]} {...txHandlers}>
        <mesh>
          <boxGeometry args={[0.14, 0.12, 0.03]} />
          <meshStandardMaterial color="#C0392B" emissive="#C0392B" emissiveIntensity={0.12} />
        </mesh>
        <Text font="/fonts/jetbrains-mono-700.ttf" fontSize={0.05} color="#f4f1e8" anchorX="center" anchorY="middle" position={[0, 0, 0.02]}>
          TX
        </Text>
      </group>
    </group>
  );
}
