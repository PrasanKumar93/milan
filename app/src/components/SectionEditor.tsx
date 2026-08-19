import type { ComputedSection } from "../core/engine";
import { perimeterRft } from "../core/products";
import type { Adjustment, Line, Quote, Section, WastageRule } from "../core/types";
import { HSN, cardPrice } from "../data/masters";
import { Button, DimensionField, Pill } from "../ui/controls";
import { ChargeTable } from "./ChargeTable";
import { LineGrid } from "./LineGrid";
import { ProductPicker } from "./ProductPicker";
import { SectionTotals } from "./SectionTotals";

/**
 * One glass at one price, with its own rows, charges and total — the block the
 * proforma prints under a heading like "10MM CLEAR TOUGHENED GLASS".
 *
 * Wastage lives here rather than on the quote: a quote often mixes toughened
 * glass at a fixed allowance with mirror measured foot to foot, and the rule
 * belongs to the glass (dev-plan §2.2).
 */
export function SectionEditor({
  index,
  quote,
  computed,
  canRemove,
  onSetProduct,
  onPatchSection,
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
  quote: Quote;
  computed: ComputedSection;
  canRemove: boolean;
  onSetProduct: (product: string) => void;
  onPatchSection: (patch: Partial<Section>) => void;
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
  const price = cardPrice(section.product, quote.printUnit);
  const perimeter = perimeterRft(
    computed.lines.map((l) => ({
      line: l.line,
      chargeableH: l.chargeableH.value,
      chargeableW: l.chargeableW.value,
    })),
    quote.inputUnit,
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
            <strong>₹{price.rate.toLocaleString("en-IN")}</strong> / {quote.printUnit}
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
        <div className="row">
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
            unit={quote.inputUnit}
            width={70}
            disabled={footToFoot}
            title="Added to both sides of every piece in this section"
            onChange={(wastage) => onPatchSection({ wastage })}
          />
          <span className={`small ${footToFoot ? "muted-2" : "muted"}`}>{quote.inputUnit}</span>
          <span className="divider--v" />
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
          quote={quote}
          computed={computed}
          onPatchLine={onPatchLine}
          onResetLine={onResetLine}
          onRemoveLine={onRemoveLine}
          onAddLine={onAddLine}
        />

        <ChargeTable
          computed={computed}
          quote={quote}
          perimeter={perimeter}
          onPatch={onPatchCharge}
          onSetLabel={onSetChargeLabel}
          onRemove={onRemoveCharge}
          onAdd={onAddCharge}
        />

        <hr className="divider" />

        <SectionTotals quote={quote} computed={computed} onPatchSection={onPatchSection} />
      </div>
    </section>
  );
}
