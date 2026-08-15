import { useState } from "react";
import { splitProduct } from "../core/products";
import { glassTypes, thicknesses } from "../data/masters";
import { Button, Select, TextField } from "../ui/controls";

/**
 * The glass for a section. Two dropdowns off the catalogue cover the ordinary
 * case; the free-text escape hatch is there because the samples contain names no
 * catalogue will ever hold, and a quote must never be blocked on a missing entry
 * (dev-plan §3.2).
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
  const [typing, setTyping] = useState(!listed && product !== "");

  // Coming back from a typed name, the two dropdowns have to land on something
  // they can actually show, so the nearest catalogue entry is applied at once.
  const backToList = () => {
    setTyping(false);
    if (!listed) {
      const t = thicknesses.includes(thickness) ? thickness : thicknesses[0];
      onChange(`${t} ${glassTypes[0].name}`);
    }
  };

  if (typing) {
    return (
      <div className="row row--tight">
        <TextField
          value={product}
          onChange={(v) => onChange(v.toUpperCase())}
          placeholder="Glass name as it should print"
          width={340}
        />
        <Button variant="ghost" onClick={backToList}>
          Pick from list
        </Button>
      </div>
    );
  }

  return (
    <div className="row row--tight">
      <Select
        value={thickness}
        width={104}
        onChange={(t) => onChange(`${t} ${glassType}`.trim())}
        options={thicknesses.map((t) => ({ value: t, label: t }))}
      />
      <Select
        value={glassType}
        width={272}
        onChange={(g) => onChange(`${thickness} ${g}`.trim())}
        options={glassTypes.map((g) => ({ value: g.name, label: g.name }))}
      />
      <Button variant="ghost" onClick={() => setTyping(true)}>
        Type another
      </Button>
    </div>
  );
}
