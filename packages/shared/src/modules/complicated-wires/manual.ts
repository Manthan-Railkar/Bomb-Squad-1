import type { ManualPage } from '../../types/index.js';
import { COMPLICATED_WIRES_MODULE_ID } from './types.js';
import { COMPLICATED_WIRES_TABLE } from './solve.js';

/** ✓ / — cell text so the truth table is unambiguous without colour (AC4). */
const mark = (present: boolean): string => (present ? '✓' : '—');

/**
 * Structured manual content — NEVER raw HTML or untyped JSX (project rule).
 * The 16-row truth table renders from COMPLICATED_WIRES_TABLE, the exact
 * constant the solver reads: the Expert's manual and the solver that judges
 * the cut cannot diverge.
 *
 * Chosen representation: the structured 16-row truth table is the PRIMARY,
 * authoritative, colorblind-safe manual (the GDD paper manual draws this as a
 * Venn diagram, p.13 of the v1 PDF — an optional visual enhancement only).
 */
export function getComplicatedWiresManualPages(): ManualPage[] {
  return [
    {
      chapterId: COMPLICATED_WIRES_MODULE_ID,
      chapterTitle: 'Complicated Wires',
      sections: [
        {
          content:
            'The module shows three to six wires, each carrying any combination of ' +
            'four attributes: a red stripe, a blue stripe, a white star, and a lit ' +
            'LED. Evaluate each wire INDEPENDENTLY: read its four attributes, look ' +
            'the combination up in the truth table below, and apply the resulting ' +
            'cut code. Cut every wire that should be cut; leave the rest. A severed ' +
            'wire cannot be un-cut.',
        },
        {
          heading: 'Cut codes',
          content:
            'Each row of the truth table gives one code. S, P and B depend on the ' +
            "bomb's edgework (serial number, ports, batteries), which the Defuser " +
            'reads off the bomb face.',
          table: {
            headers: ['Code', 'Rule'],
            rows: [
              ['C', 'Cut the wire'],
              ['D', 'Do not cut the wire'],
              ['S', 'Cut only if the last digit of the serial number is even'],
              ['P', 'Cut only if the bomb has a Parallel port'],
              ['B', 'Cut only if the bomb has two or more batteries'],
            ],
          },
        },
        {
          heading: 'Truth table',
          content:
            'Columns: red stripe, blue stripe, star, LED (✓ = present, — = absent) ' +
            '→ cut code.',
          table: {
            // A ✓/— truth table: render as an even grid (Story TD-9
            // `evenColumns`) — full width, equal columns, centred cells — so the
            // matrix fills the sheet in a regular lattice instead of the auto
            // layout bunching every column against the left.
            evenColumns: true,
            headers: ['Red stripe', 'Blue stripe', 'Star', 'LED', 'Code'],
            rows: COMPLICATED_WIRES_TABLE.map((row) => [
              mark(row.redStripe),
              mark(row.blueStripe),
              mark(row.star),
              mark(row.led),
              row.code,
            ]),
          },
        },
      ],
    },
  ];
}
