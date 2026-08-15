import type { ComputedQuote } from "../core/engine";
import { warningsFor } from "../core/validate";
import { Callout } from "../ui/controls";

/** The §7 checks, gathered where the operator is about to print. Advice, not gates. */
export function WarningList({ computed }: { computed: ComputedQuote }) {
  const warnings = warningsFor(computed);
  if (warnings.length === 0) return null;

  return (
    <Callout tone="info" title={warnings.length === 1 ? "One thing to check" : `${warnings.length} things to check`}>
      <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
        {warnings.map((w, i) => (
          <li key={i}>{w.text}</li>
        ))}
      </ul>
    </Callout>
  );
}
