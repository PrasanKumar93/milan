import { useState } from "react";
import { splitProduct } from "../core/products";
import { CUSTOM_PRODUCT, glassTypes, thicknesses } from "../data/masters";
import { Select, TextField } from "../ui/controls";

/**
 * The glass for a section. Two dropdowns off the catalogue cover the ordinary
 * case, and the last entry in the glass list is the escape hatch: the samples
 * contain names no catalogue will ever hold, and a quote must never be blocked
 * on a missing entry (dev-plan §3.2).
 *
 * Both start on "— Select —" rather than on the commonest glass, so the name the
 * proforma prints is one somebody chose. That leaves three states where there
 * were two: nothing picked yet, a catalogue name, and a typed one. An empty
 * product is the first and the third alike, so the typed state is remembered
 * here — it is the only thing on this screen that is.
 */
const NOTHING = "";

export function ProductPicker({
  product,
  onChange,
}: {
  product: string;
  onChange: (product: string) => void;
}) {
  const { thickness, glassType } = splitProduct(product);
  const listed = glassTypes.some((g) => g.name === glassType);
  const [typing, setTyping] = useState(false);
  const custom = typing || (glassType !== "" && !listed);

  const pick = (name: string) => {
    setTyping(name === CUSTOM_PRODUCT);
    if (name === CUSTOM_PRODUCT || name === NOTHING) {
      onChange("");
      return;
    }
    // Coming back from a typed name, the thickness may be nothing the catalogue
    // knows, so only a thickness it does know is carried over.
    const t = thicknesses.includes(thickness) ? thickness : "";
    onChange(`${t} ${name}`.trim());
  };

  return (
    <div className="row row--tight">
      {!custom && (
        <Select
          value={thickness}
          width={124}
          onChange={(t) => onChange(`${t} ${glassType}`.trim())}
          options={[
            { value: NOTHING, label: "— Select —" },
            ...thicknesses.map((t) => ({ value: t, label: t })),
          ]}
        />
      )}

      <Select
        value={custom ? CUSTOM_PRODUCT : listed ? glassType : NOTHING}
        width={272}
        onChange={pick}
        options={[
          { value: NOTHING, label: "— Select —" },
          ...glassTypes.map((g) => ({ value: g.name, label: g.name })),
          { value: CUSTOM_PRODUCT, label: "Other — type it" },
        ]}
      />

      {custom && (
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
