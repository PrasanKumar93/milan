import type Decimal from "decimal.js";
import type { ComputedSection } from "../core/engine";
import type { Adjustment, ChargeBasis } from "../core/types";
import { CUSTOM_CHARGE, chargeTypeFor, chargeTypes } from "../data/masters";
import { Button, NumberField, OverrideDot, Pill, Select, TextField } from "../ui/controls";

/**
 * Extra charges for a section: holes, cutouts, polish, transport and the rest.
 * Every charge added here prints — there is no on-screen-only charge, because a
 * customer who is billed for a cutout is shown the cutout (dev-plan §2.7).
 */
export function ChargeTable({
  computed,
  perimeter,
  onPatch,
  onSetLabel,
  onRemove,
}: {
  computed: ComputedSection;
  /** Perimeter of the section in running feet — the quantity polish is billed on. */
  perimeter: Decimal;
  onPatch: (adjustmentId: string, patch: Partial<Adjustment>) => void;
  onSetLabel: (adjustmentId: string, label: string) => void;
  onRemove: (adjustmentId: string) => void;
}) {
  if (computed.adjustments.length === 0) return null;

  return (
    <div className="grid-wrap">
      <table className="grid grid--zebra">
        <thead>
          <tr>
            <th>Charge</th>
            <th>Basis</th>
            <th className="num">Qty</th>
            <th className="num">Rate</th>
            <th className="num">Amount</th>
            <th>GST</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {computed.adjustments.map((a) => {
            const adj = a.adjustment;
            const type = chargeTypeFor(adj.label);
            const custom = type === undefined;
            const perUnit = adj.basis === "per_unit";

            return (
              <tr key={adj.id}>
                <td>
                  <div className="row row--tight">
                    <Select
                      value={custom ? CUSTOM_CHARGE : adj.label}
                      width={168}
                      onChange={(v) => onSetLabel(adj.id, v === CUSTOM_CHARGE ? "" : v)}
                      options={[
                        ...chargeTypes.map((c) => ({ value: c.label, label: c.label })),
                        { value: CUSTOM_CHARGE, label: "Other — type it" },
                      ]}
                    />
                    {custom && (
                      <TextField
                        value={adj.label}
                        onChange={(v) => onPatch(adj.id, { label: v.toUpperCase() })}
                        placeholder="Charge as it should print"
                        width={200}
                      />
                    )}
                  </div>
                </td>

                <td>
                  <Select
                    value={adj.basis}
                    width={104}
                    onChange={(basis) => onPatch(adj.id, { basis: basis as ChargeBasis })}
                    options={[
                      { value: "flat", label: "Flat" },
                      { value: "per_unit", label: "Per unit" },
                    ]}
                  />
                </td>

                <td>
                  {perUnit ? (
                    <div className="pair">
                      <NumberField
                        value={adj.qty}
                        width={72}
                        onChange={(qty) => onPatch(adj.id, { qty })}
                      />
                      {type?.unit === "rft" && (
                        <Button
                          variant="icon"
                          title={`Perimeter of every piece in this section: ${perimeter.toFixed(2)} rft`}
                          onClick={() =>
                            onPatch(adj.id, { qty: Number(perimeter.toFixed(2)) })
                          }
                        >
                          rft
                        </Button>
                      )}
                    </div>
                  ) : (
                    <span className="muted-2">—</span>
                  )}
                </td>

                <td>
                  <NumberField
                    value={adj.rate}
                    width={84}
                    disabled={!perUnit && adj.amount !== null}
                    onChange={(rate) => onPatch(adj.id, { rate })}
                  />
                </td>

                <td>
                  <div className="pair">
                    <NumberField
                      value={a.amount.value.toNumber()}
                      width={96}
                      className={a.amount.overridden ? "input--overridden" : "input--derived"}
                      title={
                        a.amount.overridden
                          ? `Formula gives ${a.amount.computed.toFixed(2)}`
                          : perUnit
                            ? "Qty x rate"
                            : "Flat rate"
                      }
                      onChange={(v) =>
                        onPatch(adj.id, {
                          amount: a.amount.computed.eq(v) ? null : v,
                        })
                      }
                    />
                    {a.amount.overridden && (
                      <OverrideDot title={`Formula gives ${a.amount.computed.toFixed(2)}`} />
                    )}
                  </div>
                </td>

                <td>
                  <Pill
                    active={adj.taxable}
                    onClick={() => onPatch(adj.id, { taxable: !adj.taxable })}
                  >
                    {adj.taxable ? "Taxed" : "No GST"}
                  </Pill>
                </td>

                <td>
                  <Button variant="icon" title="Remove this charge" onClick={() => onRemove(adj.id)}>
                    ✕
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
