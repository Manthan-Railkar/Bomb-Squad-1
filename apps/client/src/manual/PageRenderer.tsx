import type { ManualMaze, ManualPage, ManualSection, ManualTable } from '@bomb-squad/shared';
import { splitColorWords, MANUAL_COLOR_INKS } from './colorWords.js';
import { MazeDiagram } from './MazeDiagram.js';

/**
 * Generic structured-data renderer: one ManualPage → paper-styled React (AC4).
 * Rendering only — zero knowledge of any specific module. All literal values
 * are mockup-derived on-cream inks (`4. Expert Manual.html`); the page surface
 * itself (cream bg / manual ink / serif) is owned by the sheet in ManualViewer.
 */

function EmphasizedText({ text }: { text: string }) {
  const runs = splitColorWords(text);
  return (
    <>
      {runs.map((run, i) =>
        run.colorWord === undefined ? (
          <span key={i}>{run.text}</span>
        ) : (
          <span key={i} className="font-semibold" style={{ color: MANUAL_COLOR_INKS[run.colorWord] }}>
            {run.text}
          </span>
        ),
      )}
    </>
  );
}

function TableView({ table }: { table: ManualTable }) {
  const hasHeaders = table.headers.some((h) => h.trim() !== '');
  // Presentation metadata (Story TD-9), both default-on so metadata-free tables
  // render exactly as before: the last column right-aligns as the answer column
  // unless opted out, and colour words are tinted unless opted out.
  const rightAlignLast = table.rightAlignLastColumn !== false;
  const emphasize = table.emphasizeColorWords !== false;
  // Even-grid layout (Story TD-9): full width, equal fixed columns, centred
  // headers + cells — the matrix/truth-table look. Overrides the answer-column
  // right-align. Default is the normal auto-width layout.
  const evenColumns = table.evenColumns === true;
  return (
    <table
      className={`w-full border-collapse font-manual text-[15px] ${evenColumns ? 'table-fixed' : ''}`}
    >
      {hasHeaders && (
        <thead>
          <tr>
            {table.headers.map((header, i) => (
              <th
                key={i}
                className={`border-b-2 px-1 pb-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.1em] ${
                  // Even grid → centre every header over its equal column.
                  // Otherwise mirror the body <td> horizontal rhythm (px-1 +
                  // pr-3.5, or a right-aligned last column) so the header aligns
                  // with its column instead of hanging left.
                  evenColumns
                    ? 'text-center'
                    : rightAlignLast && i === table.headers.length - 1
                      ? 'text-right'
                      : 'pr-3.5 text-left'
                }`}
                style={{ borderColor: '#211A12', color: '#8A7A5E' }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {table.rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, c) => (
              <td
                key={c}
                className={`border-b px-1 py-1.5 align-top leading-snug ${
                  evenColumns
                    ? 'text-center'
                    : rightAlignLast && c === row.length - 1
                      ? 'whitespace-nowrap text-right font-semibold'
                      : 'pr-3.5'
                }`}
                style={{ borderColor: '#D8CBAC', color: '#2A2118' }}
              >
                {emphasize ? <EmphasizedText text={cell} /> : cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A fixed 3-column grid of maze diagrams (the 9 mazes render as a 3×3 block). */
function MazeGridView({ mazes }: { mazes: ManualMaze[] }) {
  return (
    <div className="grid w-fit grid-cols-3 gap-4">
      {mazes.map((maze, i) => (
        <MazeDiagram key={i} maze={maze} />
      ))}
    </div>
  );
}

function SectionView({ section }: { section: ManualSection }) {
  return (
    <section className="mb-5">
      {section.heading !== undefined && (
        <h2 className="mb-2 font-manual text-[20px] font-bold">{section.heading}</h2>
      )}
      {section.content !== '' && (
        <p className="mb-3 max-w-[60ch] font-manual text-[17px] leading-[1.55]" style={{ color: '#2A2118' }}>
          <EmphasizedText text={section.content} />
        </p>
      )}
      {section.table !== undefined && <TableView table={section.table} />}
      {section.maze !== undefined && (
        <div className="mb-3">
          <MazeDiagram maze={section.maze} />
        </div>
      )}
      {section.mazes !== undefined && <MazeGridView mazes={section.mazes} />}
    </section>
  );
}

export default function PageRenderer({ page }: { page: ManualPage }) {
  return (
    <div>
      {page.sections.map((section, i) => (
        <SectionView key={i} section={section} />
      ))}
    </div>
  );
}
