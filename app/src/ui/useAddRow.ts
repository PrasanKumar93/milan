import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

/**
 * Adding the next row of a table, by the button under it or by Enter in its
 * last row, and moving the cursor into the row that arrives.
 *
 * Both do the same thing, so both are here: a row added by the button that
 * leaves the cursor where it was is a row you then have to go and find. The
 * cursor lands on the first field of the new row, which is the dropdown that
 * says what the row is.
 *
 * A blank row does not add another. That is the whole guard against a leant-on
 * key: the row Enter just made is blank, so the next Enter does nothing until
 * something is typed into it, and there is no way to stack empties.
 */
export function useAddRow(add: () => void) {
  const body = useRef<HTMLTableSectionElement>(null);
  const [arriving, setArriving] = useState(false);

  useEffect(() => {
    if (!arriving) return;
    setArriving(false);

    const rows = body.current?.children;
    const last = rows?.[rows.length - 1];
    last?.querySelector<HTMLElement>("select, input:not([disabled])")?.focus();
  }, [arriving]);

  const addRow = () => {
    add();
    setArriving(true);
  };

  /** For the last row of the table: `blank` is a row with nothing typed in it yet. */
  const onKeyDown = (e: KeyboardEvent, blank: boolean) => {
    if (e.key !== "Enter" || blank) return;

    e.preventDefault();
    addRow();
  };

  return { body, onKeyDown, addRow };
}
