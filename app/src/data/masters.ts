import companyJson from "./company.json";
import chargeTypesJson from "./chargeTypes.json";
import productsJson from "./products.json";
import rateCardJson from "./rateCard.json";
import { splitProduct } from "../core/products";
import type { ChargeBasis, InputUnit, WastageRule } from "../core/types";

/**
 * Typed access to the JSON masters. Everything the business can change — company
 * details, product names, charge names and rates — lives in those files rather
 * than in code, so correcting one is an edit and a commit (dev-plan §5).
 */

export interface GlassType {
  name: string;
  shortCode: string;
  wastageRule: WastageRule;
}

export interface ChargeType {
  label: string;
  basis: ChargeBasis;
  rate?: number;
  /** Polish only: the rate is thickness x this, so it depends on the glass (§3.3). */
  ratePerThicknessMm?: number;
  unit?: string;
}

export const company = companyJson;
export const chargeTypes = chargeTypesJson.charges as ChargeType[];
export const thicknesses = productsJson.thicknesses;
export const glassTypes = productsJson.glassTypes as GlassType[];
export const shapes = productsJson.shapes;
export const defaultProduct = productsJson.defaultProduct;
export const rateCard = rateCardJson;

/** Every section of all 47 samples prints 7007 (dev-plan §4). */
export const HSN = company.defaults.hsn;

export const CUSTOM_PRODUCT = "__custom__";
export const CUSTOM_CHARGE = "__other__";

export function defaultWastage(unit: InputUnit): number {
  return unit === "mm" ? company.defaults.wastageMm : company.defaults.wastageInch;
}

/** Takes a full product name and finds its glass type, e.g. "10MM CLEAR MIRROR" -> CLEAR MIRROR. */
export function glassTypeFor(product: string): GlassType | undefined {
  const { glassType } = splitProduct(product);
  return glassTypes.filter((g) => g.name === glassType)[0];
}

/** What the summary block prints: "10MM CTG" rather than the full section title. */
export function shortCodeFor(product: string): string {
  const { thickness, glassType } = splitProduct(product);
  const code = glassTypes.filter((g) => g.name === glassType)[0]?.shortCode;
  if (!code) return product.toUpperCase();
  return thickness === "" ? code : `${thickness} ${code}`;
}

export function chargeTypeFor(label: string): ChargeType | undefined {
  return chargeTypes.filter((c) => c.label === label.toUpperCase())[0];
}

/** Default rate for a line of this product, from the rate card. */
export function cardRate(product: string, printUnit: "SQFT" | "SQMT"): number | undefined {
  const item = rateCard.items.filter((i) => i.product === product.toUpperCase())[0];
  if (!item) return undefined;
  return printUnit === "SQFT" ? item.sqft : item.sqmt;
}
