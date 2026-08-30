import type { ComputedSection } from "../core/engine";
import { perimeterRft } from "../core/products";
import type {
  Adjustment,
  InputUnit,
  Line,
  PrintUnit,
  Section,
  WastageRule,
} from "../core/types";
import { HSN, cardPrice } from "../data/masters";
import { Button, DimensionField, NumberField, Pill } from "../ui/controls";
import { ChargeTable } from "./ChargeTable";
import { LineGrid } from "./LineGrid";
import { ProductPicker } from "./ProductPicker";
import { SectionTotals } from "./SectionTotals";

/**
 * One glass at one price, with its own rows, charges and total — the block the
 * proforma prints under a heading like "10MM CLEAR TOUGHENED GLASS".
 *
 * How it calculates lives here rather than on the quote: a quote often mixes
 * toughened glass at a fixed allowance with mirror measured foot to foot, and
 * millimetres on one section with inches on the next. All of it belongs to the
 * glass (dev-plan §2.1, §2.2).
 */
export function SectionEditor({
  index,
  computed,
  canRemove,
  onSetProduct,
  onPatchSection,
  onSetInputUnit,
  onSetPrintUnit,
  onPatchLine,
  onResetLine,
  onRemoveLine,
  onAddLine,
  onAddCharge,
  onPatchCharge,
  onSetChargeLabel,
  onRemoveCharge,
  onRemoveSection,
}: {
  index: number;
  computed: ComputedSection;
  canRemove: boolean;
  onSetProduct: (product: string) => void;
  onPatchSection: (patch: Partial<Section>) => void;
  onSetInputUnit: (unit: InputUnit) => void;
  onSetPrintUnit: (unit: PrintUnit) => void;
  onPatchLine: (lineId: string, patch: Partial<Line>) => void;
  onResetLine: (lineId: string) => void;
  onRemoveLine: (lineId: string) => void;
  onAddLine: () => void;
  onAddCharge: () => void;
  onPatchCharge: (adjustmentId: string, patch: Partial<Adjustment>) => void;
  onSetChargeLabel: (adjustmentId: string, label: string) => void;
  onRemoveCharge: (adjustmentId: string) => void;
  onRemoveSection: () => void;
}) {
  const section = computed.section;
  const footToFoot = section.wastageRule === "foot_to_foot";
  const price = cardPrice(section.product, section.printUnit);
  const perimeter = perimeterRft(
    computed.lines.map((l) => ({
      line: l.line,
      chargeableH: l.chargeableH.value,
      chargeableW: l.chargeableW.value,
    })),
    section.inputUnit,
  );

  const setRule = (wastageRule: WastageRule) => onPatchSection({ wastageRule });

  return (
    <section className="card">
      <div className="card__head">
        <h2>Section {index + 1}</h2>
        <ProductPicker product={section.product} onChange={onSetProduct} />
        {/* The section title exactly as it prints, which is also the name the
            rate card is looked up by. The short code is what the summary block
            prints, and it is a hover away rather than in the operator's face.
            Until a glass is chosen there is no title to show, and the HSN stands
            on its own rather than after an empty name. */}
        <span
          className="muted small"
          title={section.shortCode ? `Prints as ${section.shortCode} in the summary block` : undefined}
        >
          {section.product ? `${section.product} · ` : ""}HSN {HSN}
        </span>

        {/*
         * What the card asks, and what that figure includes. The two columns of
         * the card are not the same price in two units — the square-foot one has
         * GST in it (§2.5) — so the price is never shown without saying which it
         * is. Nothing fills the rate in from this, which is why it is coloured:
         * it is the one place the price is offered, and it has to be seen to be
         * typed. Glass the card has no price for says nothing at all.
         */}
        {price && (
          <span className="card-rate" title="The list price. Rates are negotiated, so type what was agreed.">
            <strong>₹{price.rate.toLocaleString("en-IN")}</strong> / {section.printUnit}
            <span className="card-rate__tax">
              {price.includesGst ? "GST included" : "GST to be added"}
            </span>
          </span>
        )}
        <span className="spacer" />
        {canRemove && (
          <Button variant="danger" onClick={onRemoveSection} title="Remove this section">
            Remove
          </Button>
        )}
      </div>

      <div className="card__body">
        {/*
         * How this section calculates, on one line above the glass it applies
         * to: the unit it was measured in, the unit it is priced in, its tax and
         * its wastage. All four follow the glass rather than the quote — an
         * order can run a millimetre shopfront and an inch mirror on the same
         * page (§2.1) — and they are ruled apart rather than spaced apart, so
         * the line reads as four settings and not as one long row of buttons.
         */}
        <div className="row settings-line">
          <span className="field__label">Sizes in</span>
          <Pill active={section.inputUnit === "mm"} onClick={() => onSetInputUnit("mm")}>
            mm
          </Pill>
          <Pill active={section.inputUnit === "inch"} onClick={() => onSetInputUnit("inch")}>
            inch
          </Pill>

          <span className="divider--v" />

          <span className="field__label">Area in</span>
          <Pill active={section.printUnit === "SQFT"} onClick={() => onSetPrintUnit("SQFT")}>
            SQFT
          </Pill>
          <Pill active={section.printUnit === "SQMT"} onClick={() => onSetPrintUnit("SQMT")}>
            SQMT
          </Pill>

          <span className="divider--v" />

          <span className="field__label">GST</span>
          {/* Not applied first, so that "Applied" sits beside the rate it governs. */}
          <Pill
            active={!section.gstApplicable}
            onClick={() => onPatchSection({ gstApplicable: false })}
          >
            Not applied
          </Pill>
          <Pill
            active={section.gstApplicable}
            onClick={() => onPatchSection({ gstApplicable: true })}
          >
            Applied
          </Pill>
          <NumberField
            value={section.gstPct}
            onChange={(gstPct) => onPatchSection({ gstPct })}
            width={56}
            disabled={!section.gstApplicable}
            title="CGST and SGST each at this rate"
          />
          <span className={`small ${section.gstApplicable ? "muted" : "muted-2"}`}>
            % + same SGST
          </span>

          <span className="divider--v" />

          <span className="field__label">Wastage</span>
          <Pill
            active={!footToFoot}
            title="The same allowance on height and width, editable on any row"
            onClick={() => setRule("fixed")}
          >
            Fixed
          </Pill>
          <DimensionField
            value={section.wastage}
            unit={section.inputUnit}
            width={70}
            disabled={footToFoot}
            title="Added to both sides of every piece in this section"
            onChange={(wastage) => onPatchSection({ wastage })}
          />
          <span className={`small ${footToFoot ? "muted-2" : "muted"}`}>{section.inputUnit}</span>
          <Pill
            active={footToFoot}
            title="Each side goes up to the next whole foot; a side already on a foot is left alone"
            onClick={() => setRule("foot_to_foot")}
          >
            Foot to foot
          </Pill>
        </div>

        {/* Each table brings its own Add button, at the right under the end of
            it, so adding a row is the same movement in either one. */}
        <LineGrid
          computed={computed}
          onPatchLine={onPatchLine}
          onResetLine={onResetLine}
          onRemoveLine={onRemoveLine}
          onAddLine={onAddLine}
        />

        <ChargeTable
          computed={computed}
          perimeter={perimeter}
          onPatch={onPatchCharge}
          onSetLabel={onSetChargeLabel}
          onRemove={onRemoveCharge}
          onAdd={onAddCharge}
        />

        <hr className="divider" />

        <SectionTotals computed={computed} onPatchSection={onPatchSection} />
      </div>
    </section>
  );
}
