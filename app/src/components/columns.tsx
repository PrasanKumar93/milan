/**
 * The entry grid decides the column widths, and the charges table borrows them,
 * so a charge's count, rate and amount sit exactly under the count, rate and
 * amount of the glass above. Two tables that share a card should share their
 * columns; left to itself the browser gave the five-column charges table the
 * width of the twelve-column grid and spread it out like a timetable.
 *
 * The count comes before both areas, on screen and on paper alike, because each
 * is worked out from it: height by width by the count. A column that goes into
 * another one should be read before it, and the alternative had an operator
 * meeting the area with the number that made it still to come.
 *
 * A charge has a count, a rate and an amount but no area, so the charges table
 * leaves the pair of area columns empty rather than shifting its figures out
 * from under the glass above (§2.10).
 *
 * The widths are the fields plus their padding. They are the only place either
 * table says how wide anything is.
 */

const WIDTHS = {
  serial: 44,
  shape: 122,
  actualH: 94,
  actualW: 94,
  wastage: 94,
  chargeableH: 94,
  chargeableW: 94,
  qty: 72,
  actualArea: 128,
  // Wider than the one beside it: the heading carries a longer name and the
  // mark that explains it, and a heading that wraps buries the mark under it.
  area: 146,
  rate: 94,
  amount: 126,
  buttons: 110,
} as const;

const order = Object.values(WIDTHS);

/** Everything up to the count: the charge name has that whole run to itself. */
const NAME = order.slice(0, 7).reduce((a, b) => a + b, 0);

export function LineColumns() {
  return (
    <colgroup>
      {order.map((width, i) => (
        <col key={i} style={{ width }} />
      ))}
    </colgroup>
  );
}

/**
 * A charge has no size and no area, so the name has the whole left of the row
 * and stands at the right of it, next to the count — which is also how the
 * printed sheet writes a charge line (dev-plan §2.10). The two area columns are
 * left standing empty, as one gap, so that the rate and the amount stay under
 * the rate and the amount of the glass.
 */
export function ChargeColumns() {
  const areas = WIDTHS.actualArea + WIDTHS.area;

  return (
    <colgroup>
      {[NAME, WIDTHS.qty, areas, WIDTHS.rate, WIDTHS.amount, WIDTHS.buttons].map((width, i) => (
        <col key={i} style={{ width }} />
      ))}
    </colgroup>
  );
}
