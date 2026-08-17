/**
 * The entry grid decides the column widths, and the charges table borrows them,
 * so a charge's count, rate and amount sit exactly under the count, rate and
 * amount of the glass above. Two tables that share a card should share their
 * columns; left to itself the browser gave the five-column charges table the
 * width of the eleven-column grid and spread it out like a timetable.
 *
 * Count, rate and amount are the last three columns of both tables, which is
 * why area sits to the left of the count here while the printed sheet keeps
 * them the other way round (§2.10) — on paper there are no charges to line up
 * with, and on screen the charge block would otherwise have a hole in it.
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
  area: 122,
  qty: 72,
  rate: 94,
  amount: 126,
  buttons: 110,
} as const;

const order = Object.values(WIDTHS);

/** Everything up to the count: the charge name has that whole run to itself. */
const NAME = order.slice(0, 8).reduce((a, b) => a + b, 0);

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
 * printed sheet writes a charge line (dev-plan §2.10).
 */
export function ChargeColumns() {
  return (
    <colgroup>
      {[NAME, WIDTHS.qty, WIDTHS.rate, WIDTHS.amount, WIDTHS.buttons].map((width, i) => (
        <col key={i} style={{ width }} />
      ))}
    </colgroup>
  );
}
