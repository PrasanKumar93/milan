import type Decimal from "decimal.js";
import type { ComputedLine, ComputedSection } from "../core/engine";
import type { Line, Quote } from "../core/types";
import { formatInches } from "../core/units";
import { shapes } from "../data/masters";
import { Button, DimensionField, NumberField, OverrideDot, Select } from "../ui/controls";

/**
 * The entry grid. It is the screen the operator lives in, so every derived cell
 * is shown as an editable field rather than as text: the formula fills it in, and
 * typing over it turns it into an override that is flagged but never argued with
 * (dev-plan §2.8).
 */

/** Typing the number the formula already produced is not an override. */
function overrideOf(computed: Decimal, typed: number): number | null {
  return computed.eq(typed) ? null : typed;
}

function isOverridden(l: ComputedLine): boolean {
  return (
    l.chargeableH.overridden ||
    l.chargeableW.overridden ||
    l.area.overridden ||
    l.amount.overridden ||
    l.wastageOverridden
  );
}

export function LineGrid({
  quote,
  computed,
  onPatchLine,
  onResetLine,
  onRemoveLine,
}: {
  quote: Quote;
  computed: ComputedSection;
  onPatchLine: (lineId: string, patch: Partial<Line>) => void;
  onResetLine: (lineId: string) => void;
  onRemoveLine: (lineId: string) => void;
}) {
  const { section } = computed;
  const unit = quote.inputUnit;
  const footToFoot = section.wastageRule === "foot_to_foot";
  const showSize = (v: Decimal) => (unit === "inch" ? formatInches(v.toNumber()) : v.toString());

  return (
    <div className="grid-wrap">
      <table className="grid grid--zebra">
        <thead>
          <tr>
            <th rowSpan={2} style={{ width: 28 }}>
              #
            </th>
            <th rowSpan={2}>Shape</th>
            <th className="grid__group" colSpan={2}>
              Actual size ({unit})
            </th>
            <th rowSpan={2}>Wastage</th>
            <th className="grid__group" colSpan={2}>
              Chargeable size ({unit})
            </th>
            <th rowSpan={2} className="num">
              Qty
            </th>
            <th rowSpan={2} className="num">
              Area ({quote.printUnit})
            </th>
            <th rowSpan={2} className="num">
              Rate
            </th>
            <th rowSpan={2} className="num">
              Amount
            </th>
            <th rowSpan={2} />
          </tr>
          <tr>
            <th className="grid__sub">H</th>
            <th className="grid__sub">W</th>
            <th className="grid__sub">H</th>
            <th className="grid__sub">W</th>
          </tr>
        </thead>

        <tbody>
          {computed.lines.map((l, i) => {
            const line = l.line;
            const shapeOptions = shapes.includes(line.shape) ? shapes : [...shapes, line.shape];

            return (
              <tr key={line.id}>
                <td className="muted-2 small">{i + 1}</td>

                <td>
                  <Select
                    value={line.shape}
                    width={106}
                    onChange={(shape) => onPatchLine(line.id, { shape })}
                    options={shapeOptions.map((s) => ({ value: s, label: s }))}
                  />
                </td>

                <td>
                  <DimensionField
                    value={line.actualH}
                    unit={unit}
                    onChange={(actualH) => onPatchLine(line.id, { actualH })}
                  />
                </td>
                <td>
                  <DimensionField
                    value={line.actualW}
                    unit={unit}
                    onChange={(actualW) => onPatchLine(line.id, { actualW })}
                  />
                </td>

                <td>
                  {footToFoot ? (
                    <span className="muted small" title="Foot to foot ignores the allowance">
                      to next foot
                    </span>
                  ) : (
                    <div className="pair">
                      <DimensionField
                        value={l.wastage.toNumber()}
                        unit={unit}
                        width={64}
                        className={l.wastageOverridden ? "input--overridden" : ""}
                        title={`Section allowance is ${section.wastage}`}
                        onChange={(v) =>
                          onPatchLine(line.id, {
                            wastage: v === section.wastage ? null : v,
                          })
                        }
                      />
                      {l.wastageOverridden && <OverrideDot title="Differs from the section" />}
                    </div>
                  )}
                </td>

                <td>
                  <div className="pair">
                    <DimensionField
                      value={l.chargeableH.value.toNumber()}
                      unit={unit}
                      className={l.chargeableH.overridden ? "input--overridden" : "input--derived"}
                      title={
                        l.chargeableH.overridden
                          ? `Formula gives ${showSize(l.chargeableH.computed)}`
                          : `Actual + ${showSize(l.addedH)}`
                      }
                      onChange={(v) =>
                        onPatchLine(line.id, { chargeableH: overrideOf(l.chargeableH.computed, v) })
                      }
                    />
                    {l.chargeableH.overridden && (
                      <OverrideDot title={`Formula gives ${showSize(l.chargeableH.computed)}`} />
                    )}
                  </div>
                </td>
                <td>
                  <div className="pair">
                    <DimensionField
                      value={l.chargeableW.value.toNumber()}
                      unit={unit}
                      className={l.chargeableW.overridden ? "input--overridden" : "input--derived"}
                      title={
                        l.chargeableW.overridden
                          ? `Formula gives ${showSize(l.chargeableW.computed)}`
                          : `Actual + ${showSize(l.addedW)}`
                      }
                      onChange={(v) =>
                        onPatchLine(line.id, { chargeableW: overrideOf(l.chargeableW.computed, v) })
                      }
                    />
                    {l.chargeableW.overridden && (
                      <OverrideDot title={`Formula gives ${showSize(l.chargeableW.computed)}`} />
                    )}
                  </div>
                </td>

                <td>
                  <NumberField
                    value={line.qty}
                    width={56}
                    decimals={0}
                    onChange={(qty) => onPatchLine(line.id, { qty })}
                  />
                </td>

                <td>
                  <div className="pair">
                    <NumberField
                      value={l.area.value.toNumber()}
                      width={92}
                      decimals={6}
                      className={l.area.overridden ? "input--overridden" : "input--derived"}
                      title={
                        l.area.overridden
                          ? `Formula gives ${l.area.computed.toFixed(4)}`
                          : "Chargeable H x W x qty"
                      }
                      onChange={(v) => onPatchLine(line.id, { area: overrideOf(l.area.computed, v) })}
                    />
                    {l.area.overridden && (
                      <OverrideDot title={`Formula gives ${l.area.computed.toFixed(4)}`} />
                    )}
                  </div>
                </td>

                <td>
                  <NumberField
                    value={line.rate}
                    width={78}
                    onChange={(rate) => onPatchLine(line.id, { rate })}
                  />
                </td>

                <td>
                  <div className="pair">
                    <NumberField
                      value={l.amount.value.toNumber()}
                      width={96}
                      className={l.amount.overridden ? "input--overridden" : "input--derived"}
                      title={
                        l.amount.overridden
                          ? `Formula gives ${l.amount.computed.toFixed(2)}`
                          : "Area x rate"
                      }
                      onChange={(v) =>
                        onPatchLine(line.id, { amount: overrideOf(l.amount.computed, v) })
                      }
                    />
                    {l.amount.overridden && (
                      <OverrideDot title={`Formula gives ${l.amount.computed.toFixed(2)}`} />
                    )}
                  </div>
                </td>

                <td>
                  <div className="row row--tight">
                    {isOverridden(l) && (
                      <Button
                        variant="icon"
                        title="Put this row back on the formula"
                        onClick={() => onResetLine(line.id)}
                      >
                        Reset
                      </Button>
                    )}
                    <Button
                      variant="icon"
                      title="Remove this row"
                      onClick={() => onRemoveLine(line.id)}
                    >
                      ✕
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
