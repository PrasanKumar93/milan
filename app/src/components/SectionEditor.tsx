import type { ComputedSection } from "../core/engine";
import { perimeterRft } from "../core/products";
import type { Adjustment, Line, Quote, Section, WastageRule } from "../core/types";
import { HSN } from "../data/masters";
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
  onResetSection,
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
  onResetSection: () => void;
  onRemoveSection: () => void;
}) {
  const section = computed.section;
  const footToFoot = section.wastageRule === "foot_to_foot";
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
        <span className="muted small">
          {section.shortCode} · HSN {HSN}
        </span>
        <span className="spacer" />
        <Button variant="ghost" onClick={onResetSection} title="Put every cell back on the formula">
          Reset section
        </Button>
        {canRemove && (
          <Button variant="danger" onClick={onRemoveSection} title="Remove this section">
            Remove
          </Button>
        )}
      </div>

      <div className="card__body">
        <div className="row">
          <span className="field__label">Wastage</span>
          <Pill active={!footToFoot} onClick={() => setRule("fixed")}>
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
          <Pill active={footToFoot} onClick={() => setRule("foot_to_foot")}>
            Foot to foot
          </Pill>
          <span className="muted small">
            {footToFoot
              ? "Each side goes up to the next whole foot; a side already on a foot is left alone"
              : "The same allowance on height and width, editable on any row"}
          </span>
        </div>

        <LineGrid
          quote={quote}
          computed={computed}
          onPatchLine={onPatchLine}
          onResetLine={onResetLine}
          onRemoveLine={onRemoveLine}
        />

        <div className="row">
          <Button onClick={onAddLine}>Add line</Button>
          <Button onClick={onAddCharge}>Add charge</Button>
        </div>

        <ChargeTable
          computed={computed}
          perimeter={perimeter}
          onPatch={onPatchCharge}
          onSetLabel={onSetChargeLabel}
          onRemove={onRemoveCharge}
        />

        <hr className="divider" />

        <SectionTotals quote={quote} computed={computed} onPatchSection={onPatchSection} />
      </div>
    </section>
  );
}
