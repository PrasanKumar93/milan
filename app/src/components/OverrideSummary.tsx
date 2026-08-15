import type { ComputedQuote } from "../core/engine";
import { Button, Callout } from "../ui/controls";

/**
 * Overrides are allowed everywhere, so the only safeguard is that they are never
 * silent: this lists every cell that no longer matches its formula, right where
 * the operator is about to print (dev-plan §2.8).
 */
export function OverrideSummary({
  computed,
  onResetAll,
}: {
  computed: ComputedQuote;
  onResetAll: () => void;
}) {
  const { overrides, sections } = computed;
  if (overrides.length === 0) return null;

  const titleOf = (sectionId: string) => {
    const i = sections.findIndex((s) => s.section.id === sectionId);
    return i < 0 ? "" : `Section ${i + 1}`;
  };

  const lineNoOf = (sectionId: string, lineId?: string) => {
    if (!lineId) return null;
    const s = sections.find((x) => x.section.id === sectionId);
    const i = s ? s.lines.findIndex((l) => l.line.id === lineId) : -1;
    return i < 0 ? null : i + 1;
  };

  return (
    <Callout
      tone="warn"
      title={`${overrides.length} ${overrides.length === 1 ? "value has" : "values have"} been typed over the formula`}
    >
      <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
        {overrides.map((o, i) => {
          const lineNo = lineNoOf(o.sectionId, o.lineId);
          return (
            <li key={i}>
              {titleOf(o.sectionId)}
              {lineNo ? `, row ${lineNo}` : ""} — {o.field}: {o.value}{" "}
              <span className="muted">(formula gives {o.computed})</span>
            </li>
          );
        })}
      </ul>
      <div className="row">
        <Button onClick={onResetAll}>Put everything back on the formula</Button>
      </div>
    </Callout>
  );
}
