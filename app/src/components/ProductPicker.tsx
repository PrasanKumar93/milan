import { splitProduct } from "../core/products";
import { CUSTOM_PRODUCT, glassTypes, thicknesses } from "../data/masters";
import { Select, TextField } from "../ui/controls";

/**
 * The glass for a section. Two dropdowns off the catalogue cover the ordinary
 * case, and the last entry in the glass list is the escape hatch: the samples
 * contain names no catalogue will ever hold, and a quote must never be blocked
 * on a missing entry (dev-plan §3.2). Nothing here is remembered — a name the
 * catalogue does not know is a typed name, which is what puts the box on screen.
 */
export function ProductPicker({
  product,
  onChange,
}: {
  product: string;
  onChange: (product: string) => void;
}) {
  const { thickness, glassType } = splitProduct(product);
  const listed = glassTypes.some((g) => g.name === glassType);

  const pick = (name: string) => {
    if (name === CUSTOM_PRODUCT) {
      onChange("");
      return;
    }
    // Coming back from a typed name, the thickness may be nothing the catalogue
    // knows, so the nearest entry is applied rather than printing half a name.
    const t = thicknesses.includes(thickness) ? thickness : thicknesses[0];
    onChange(`${t} ${name}`);
  };

  return (
    <div className="row row--tight">
      {listed && (
        <Select
          value={thickness}
          width={104}
          onChange={(t) => onChange(`${t} ${glassType}`.trim())}
          options={thicknesses.map((t) => ({ value: t, label: t }))}
        />
      )}

      <Select
        value={listed ? glassType : CUSTOM_PRODUCT}
        width={272}
        onChange={pick}
        options={[
          ...glassTypes.map((g) => ({ value: g.name, label: g.name })),
          { value: CUSTOM_PRODUCT, label: "Other — type it" },
        ]}
      />

      {!listed && (
        <TextField
          value={product}
          onChange={(v) => onChange(v.toUpperCase())}
          placeholder="Glass name as it should print"
          width={340}
        />
      )}
    </div>
  );
}
