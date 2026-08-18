import type Decimal from "decimal.js";
import type { ComputedLine, ComputedSection } from "../core/engine";
import type { Line, Quote } from "../core/types";
import { formatInches } from "../core/units";
import { shapes } from "../data/masters";
import { Button, DimensionField, Info, NumberField, OverrideDot, Select } from "../ui/controls";
import { LineColumns } from "./columns";
import { amountHint, areaHint, chargeableHint, feetSpan, footSteps, footStepsPair } from "./formulas";

/**
 * The entry grid. What was measured and what was agreed — size, wastage, count
 * and rate — is typed; what follows from them — the cut size, the area and the
 * amount — is worked out and shown greyed, because a figure that disagrees with
 * the numbers beside it is how a wrong bill gets printed (dev-plan §2.8).
 *
 * A price that has to come out differently is still a rate, or the rounded
 * total under the grid, which is where a discount belongs.
 */

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
        <LineColumns />
        <thead>
          <tr>
            <th rowSpan={2}>#</th>
            <th rowSpan={2}>Shape</th>
            <th className="grid__group" colSpan={2}>
              Actual size ({unit})
            </th>
            {/* Under foot to foot there is no allowance to type: the column
                shows what the rule did instead, so it is named for that. */}
            <th rowSpan={2} className={footToFoot ? "num" : undefined}>
              {footToFoot ? "In feet" : "Wastage"}
            </th>
            {/* The three columns the app fills in for itself say so, and say how. */}
            <th className="grid__group" colSpan={2}>
              Chargeable size ({unit}) <Info hint={chargeableHint(computed, quote)} />
            </th>
            {/* The count is read before the area because it is inside it. */}
            <th rowSpan={2} className="num">
              Qty
            </th>
            <th rowSpan={2} className="num">
              Area ({quote.printUnit}) <Info hint={areaHint(computed, quote)} />
            </th>
            <th rowSpan={2} className="num">
              Rate
            </th>
            <th rowSpan={2} className="num">
              Amount <Info hint={amountHint(computed)} />
            </th>
            <th rowSpan={2} />
          </tr>
          <tr>
            {/* Spelt out, as the printed sheet spells them: the pair of boxes
                is the one place on the screen where guessing which is which
                costs a re-cut. */}
            <th className="grid__sub">Height</th>
            <th className="grid__sub">Width</th>
            <th className="grid__sub">Height</th>
            <th className="grid__sub">Width</th>
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

                <td className={footToFoot ? "num" : undefined}>
                  {footToFoot ? (
                    /* Where each side stands in feet, and the foot it is
                       charged at — the height above the width, in the order of
                       the boxes on either side of it. */
                    <div className="feet" title={footStepsPair(line.actualH, line.actualW, unit)}>
                      <span>{feetSpan(line.actualH, unit)}</span>
                      <span>{feetSpan(line.actualW, unit)}</span>
                    </div>
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

                {/*
                 * The chargeable size is the cut size and nothing else: actual
                 * plus the allowance, or the next foot up. It is shown rather
                 * than typed, and a row that needs a different one changes its
                 * wastage, which is the number that was actually decided.
                 */}
                <td>
                  <DimensionField
                    value={l.chargeableH.value.toNumber()}
                    unit={unit}
                    disabled
                    className="input--derived"
                    title={footToFoot ? footSteps(line.actualH, unit) : `Actual + ${showSize(l.addedH)}`}
                    onChange={() => {}}
                  />
                </td>
                <td>
                  <DimensionField
                    value={l.chargeableW.value.toNumber()}
                    unit={unit}
                    disabled
                    className="input--derived"
                    title={footToFoot ? footSteps(line.actualW, unit) : `Actual + ${showSize(l.addedW)}`}
                    onChange={() => {}}
                  />
                </td>

                <td className="num">
                  <NumberField
                    value={line.qty}
                    width={56}
                    decimals={0}
                    onChange={(qty) => onPatchLine(line.id, { qty })}
                  />
                </td>

                <td className="num">
                  <div className="pair">
                    <NumberField
                      value={l.area.value.toNumber()}
                      width={92}
                      decimals={6}
                      disabled
                      className={l.area.overridden ? "input--overridden" : "input--derived"}
                      title="Chargeable H x W x qty"
                      onChange={() => {}}
                    />
                    {l.area.overridden && (
                      <OverrideDot title={`Formula gives ${l.area.computed.toFixed(4)}`} />
                    )}
                  </div>
                </td>

                <td className="num">
                  <NumberField
                    value={line.rate}
                    width={78}
                    onChange={(rate) => onPatchLine(line.id, { rate })}
                  />
                </td>

                <td className="num">
                  <div className="pair">
                    <NumberField
                      value={l.amount.value.toNumber()}
                      width={96}
                      disabled
                      className={l.amount.overridden ? "input--overridden" : "input--derived"}
                      title="Area x rate"
                      onChange={() => {}}
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
