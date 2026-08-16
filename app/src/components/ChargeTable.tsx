import type Decimal from "decimal.js";
import type { ComputedSection } from "../core/engine";
import type { Adjustment } from "../core/types";
import { CUSTOM_CHARGE, chargeTypeFor, chargeTypes } from "../data/masters";
import { Button, NumberField, Select, TextField } from "../ui/controls";
import { ChargeColumns } from "./columns";

/**
 * Extra charges for a section: holes, cutouts, polish, transport and the rest.
 * Every charge added here prints — there is no on-screen-only charge, because a
 * customer who is billed for a cutout is shown the cutout (dev-plan §2.7) — and
 * every one of them is taxed with the glass, so there is nothing to decide per
 * row beyond how many and at what rate (§2.9).
 *
 * The heading stays on screen with no charges under it, so that the Add charge
 * button below has something to be adding to.
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
  return (
    <div className="grid-wrap">
      <table className="grid grid--zebra">
        <ChargeColumns />
        <thead>
          <tr>
            <th>Charge</th>
            <th className="num">Qty</th>
            <th />
            <th className="num">Rate</th>
            <th className="num">Amount</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {computed.adjustments.map((a) => {
            const adj = a.adjustment;
            const type = chargeTypeFor(adj.label);
            const custom = type === undefined;
            const counted = adj.qty > 0;

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

                {/*
                 * No count means the charge is not counted: the rate is the
                 * whole charge and the printed line carries no figure here, the
                 * way a document charge has always been written.
                 */}
                <td className="num">
                  <NumberField
                    value={adj.qty}
                    width={56}
                    blankAtZero
                    placeholder="—"
                    decimals={2}
                    title="How many. Leave it empty for a charge that is not counted."
                    onChange={(qty) => onPatch(adj.id, { qty })}
                  />
                </td>

                {/* A charge has no area, so the fill-in-the-perimeter button for
                    polish stands in that column, next to the count it fills. */}
                <td>
                  {type?.unit === "rft" && (
                    <Button
                      variant="icon"
                      title={`Perimeter of every piece in this section: ${perimeter.toFixed(2)} rft`}
                      onClick={() => onPatch(adj.id, { qty: Number(perimeter.toFixed(2)) })}
                    >
                      Use {perimeter.toFixed(2)} rft
                    </Button>
                  )}
                </td>

                <td className="num">
                  <NumberField
                    value={adj.rate}
                    width={78}
                    title={counted ? "Rate for one" : "The whole charge"}
                    onChange={(rate) => onPatch(adj.id, { rate })}
                  />
                </td>

                <td className="num">
                  <NumberField
                    value={a.amount.value.toNumber()}
                    width={96}
                    disabled
                    className="input--derived"
                    title={counted ? "Qty x rate" : "The rate, charged once"}
                    onChange={() => {}}
                  />
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
