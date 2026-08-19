import type Decimal from "decimal.js";
import { useState } from "react";
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
            <th className="charge__name">Charge</th>
            <th className="num">Qty</th>
            {/* A charge has no area; the column stands empty so that everything
                after it stays under the same heading as the glass above. */}
            <th />
            <th className="num">Rate</th>
            <th className="num">Amount</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {computed.adjustments.map((a) => (
            <ChargeRow
              key={a.adjustment.id}
              computed={a}
              perimeter={perimeter}
              onPatch={onPatch}
              onSetLabel={onSetLabel}
              onRemove={onRemove}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A charge starts unnamed. The list is there so the office's own names are
 * picked rather than spelled — the samples carry `HOLE` and `HOLES`, `CUT OUT`
 * and `CUTOUT` — but which charge it is has to be said, so the dropdown opens on
 * `— Select —` and the free-text box appears only for a charge the list has
 * never heard of. An empty name is that unchosen state and a typed one is the
 * escape hatch, so the difference is remembered here rather than read off a name
 * that is empty in both.
 */
const NOTHING = "";

function ChargeRow({
  computed,
  perimeter,
  onPatch,
  onSetLabel,
  onRemove,
}: {
  computed: ComputedSection["adjustments"][number];
  perimeter: Decimal;
  onPatch: (adjustmentId: string, patch: Partial<Adjustment>) => void;
  onSetLabel: (adjustmentId: string, label: string) => void;
  onRemove: (adjustmentId: string) => void;
}) {
  const adj = computed.adjustment;
  const type = chargeTypeFor(adj.label);
  const [typing, setTyping] = useState(false);
  const custom = typing || (adj.label !== "" && type === undefined);
  const counted = adj.qty > 0;

  const pick = (value: string) => {
    setTyping(value === CUSTOM_CHARGE);
    onSetLabel(adj.id, value === CUSTOM_CHARGE ? "" : value);
  };

  return (
    <tr>
      {/* The name stands at the right of its run, against the count, so the
          charge reads as one block rather than a name marooned at one end of
          the card and its figures at the other. */}
      <td className="charge__name">
        <div className="row row--tight">
          {type?.unit === "rft" && (
            <Button
              variant="icon"
              title="Perimeter of every piece in this section"
              onClick={() => onPatch(adj.id, { qty: Number(perimeter.toFixed(2)) })}
            >
              Use {perimeter.toFixed(2)} rft
            </Button>
          )}
          <Select
            value={custom ? CUSTOM_CHARGE : adj.label}
            width={200}
            onChange={pick}
            options={[
              { value: NOTHING, label: "— Select —" },
              ...chargeTypes.map((c) => ({ value: c.label, label: c.label })),
              { value: CUSTOM_CHARGE, label: "Other — type it" },
            ]}
          />
          {/* The name that prints ends up nearest the figures either way. */}
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
       * No count means the charge is not counted: the rate is the whole charge
       * and the printed line carries no figure here, the way a document charge
       * has always been written.
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

      <td />

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
          value={computed.amount.value.toNumber()}
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
}
