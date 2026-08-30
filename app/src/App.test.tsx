import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { CUSTOM_PRODUCT } from "./data/masters";

/**
 * A quote typed the way an operator types one, checked end to end: the engine
 * tests prove the arithmetic against the real PDFs, and these prove the screen is
 * wired to it.
 */

afterEach(cleanup);
beforeEach(() => localStorage.clear());

/**
 * The entry grid in column order: H, W, wastage, chargeable H, chargeable W,
 * qty, area as measured, chargeable area, rate, amount.
 */
function firstRow() {
  // The first grid on screen is the lines; the one after it holds the charges.
  const grid = document.querySelectorAll<HTMLElement>("table.grid")[0];
  const rows = within(grid).getAllByRole("row");
  const row = rows[rows.length - 1];
  return within(row).getAllByRole("textbox") as HTMLInputElement[];
}

function type(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

function fillOneLine() {
  render(<App />);
  const [h, w] = firstRow();
  type(h, "2000");
  type(w, "1000");
  type(firstRow()[8], "500");
}

describe("the entry screen", () => {
  it("starts on one section with one empty row", () => {
    render(<App />);
    expect(screen.getByText("Section 1")).toBeTruthy();
    expect(firstRow()).toHaveLength(10);
  });

  it("fills in the chargeable size, the area and the amount as sizes are typed", () => {
    fillOneLine();
    const cells = firstRow();

    // 50 mm on each side, then 2.05 x 1.05 SQMT at ₹500. The glass measures
    // 2 x 1, so the row also shows the 0.1525 the allowance costs in glass.
    expect(cells[2].value).toBe("50");
    expect(cells[3].value).toBe("2050");
    expect(cells[4].value).toBe("1050");
    expect(cells[6].value).toBe("2");
    expect(cells[7].value).toBe("2.1525");
    expect(cells[9].value).toBe("1076.25");
  });

  it("adds GST to the rounded subtotal and shows the total in the toolbar", () => {
    fillOneLine();
    // 1076 rounded, 9% CGST and 9% SGST on top.
    expect(screen.getAllByText("₹ 1,269.68").length).toBeGreaterThan(0);
  });

  it("rounds each side up to the next foot once the section is foot to foot", () => {
    render(<App />);
    type(firstRow()[0], "2000");
    fireEvent.click(screen.getByText("Foot to foot"));

    // 2000 mm overhangs six feet, so it goes to seven.
    expect(firstRow()[2].value).toBe("2135");
  });

  /*
   * An order can run a millimetre shopfront and an inch mirror on the same
   * page, so the units and the tax are set on the section rather than on the
   * quote. A new section starts where the one above it is, because that is the
   * ordinary case, and moves from there.
   */
  describe("the settings on a section", () => {
    const card = (n: number) =>
      within(screen.getByText(`Section ${n}`).closest("section") as HTMLElement);

    const pressed = (n: number, name: string) =>
      card(n).getByRole("button", { name }).getAttribute("aria-pressed");

    it("carries down to the section added under it", () => {
      render(<App />);
      fireEvent.click(card(1).getByRole("button", { name: "inch" }));
      fireEvent.click(card(1).getByRole("button", { name: "SQFT" }));
      fireEvent.click(card(1).getByRole("button", { name: "Not applied" }));
      fireEvent.click(screen.getByText("Add section"));

      expect(pressed(2, "inch")).toBe("true");
      expect(pressed(2, "SQFT")).toBe("true");
      expect(pressed(2, "Not applied")).toBe("true");
    });

    it("moves one section without moving the one beside it", () => {
      render(<App />);
      fireEvent.click(screen.getByText("Add section"));
      fireEvent.click(card(2).getByRole("button", { name: "inch" }));

      expect(pressed(1, "mm")).toBe("true");
      expect(pressed(2, "inch")).toBe("true");

      // Each section is headed in its own unit, and its allowance is refilled
      // in that unit: 50 mm on the first, 2 inches on the second.
      expect(card(1).getAllByText(/Actual size \(mm\)/).length).toBe(1);
      expect(card(2).getAllByText(/Actual size \(inch\)/).length).toBe(1);
      expect(card(2).getByTitle(/Added to both sides/).getAttribute("value")).toBe("2");
    });

    it("leaves nothing about the calculation on the quote header", () => {
      render(<App />);
      expect(screen.queryByText("Sizes entered in")).toBeNull();
      expect(screen.queryByText("Area printed in")).toBeNull();
    });
  });

  it("works out the cut size, the area and the amount, and lets none of them be typed", () => {
    fillOneLine();
    const cells = firstRow();
    for (const i of [3, 4, 6, 7, 9]) expect(cells[i].disabled).toBe(true);

    // The way to cut a row differently is the allowance it was cut by.
    type(cells[2], "30");
    expect(firstRow()[3].value).toBe("2030");
  });

  it("refuses letters where a number belongs", () => {
    fillOneLine();
    type(firstRow()[0], "20x0");
    expect(firstRow()[0].value).toBe("2000");
  });

  /*
   * Inches are typed a key at a time, and every key on the way to `42 3/4` goes
   * through the box: `42` is a size on its own, `42 ` and `42 3/` are not sizes
   * at all. What is in the box has to survive all of that, because the operator
   * is reading it — a box that says one size while the row is worked out on
   * another is the one fault that cannot be seen on screen.
   */
  describe("a size typed as a fraction", () => {
    const press = (input: HTMLInputElement, keys: string) => {
      // Typed as it is on the day: the box selects its contents when it is
      // entered, so the first key replaces them, and every key after that lands
      // on whatever the box holds at that moment — if the app has rewritten the
      // text, the next key goes onto the rewritten text. Leaving the field is
      // part of typing a size, and is where the box settles on what it shows.
      fireEvent.focus(input);
      type(input, "");
      for (const key of keys) type(input, input.value + key);
      fireEvent.blur(input);
    };

    const inchQuote = () => {
      render(<App />);
      fireEvent.click(screen.getByText("inch"));
      return firstRow()[0];
    };

    it("shows what was typed, and is worked out on what is shown", () => {
      const height = inchQuote();
      press(height, "42 3/4");

      expect(firstRow()[0].value).toBe("42 3/4");
      expect(firstRow()[3].value).toBe("44 3/4");
    });

    it("holds a half and a quarter, which the sheet writes as often as eighths", () => {
      for (const [typed, charged] of [
        ["44 1/2", "46 1/2"],
        ["48 1/4", "50 1/4"],
        ["11 7/8", "13 7/8"],
        ["3/4", "2 3/4"],
      ]) {
        cleanup();
        const height = inchQuote();
        press(height, typed);

        expect(firstRow()[0].value).toBe(typed);
        expect(firstRow()[3].value).toBe(charged);
      }
    });

    /*
     * A sixteenth used to be taken in, kept, and then shown as the nearest
     * eighth — the box said 42 3/4 while the row was priced on 42.6875. Worse,
     * the text passed through `42 11/1` on the way, which is a real size, and
     * the box was rewritten to 53 under the operator's fingers: what landed on
     * the row was 536. Both are the same fault — the screen showing one size
     * while another is being used — and neither is visible on the sheet.
     */
    it("keeps a sixteenth as a sixteenth, all the way through the fraction", () => {
      const height = inchQuote();
      press(height, "42 11/16");

      expect(firstRow()[0].value).toBe("42 11/16");
      expect(firstRow()[3].value).toBe("44 11/16");
    });
  });

  it("flags a row that was cut differently, and puts it back when asked", () => {
    fillOneLine();
    type(firstRow()[2], "30");

    expect(screen.getByText(/1 value has been typed over the formula/)).toBeTruthy();
    fireEvent.click(screen.getByText("Put everything back on the formula"));
    expect(screen.queryByText(/typed over the formula/)).toBeNull();
    expect(firstRow()[2].value).toBe("50");
  });

  it("says nothing about a rounding, and names a discount", () => {
    fillOneLine();
    // 1076.25 written as 1076 is the rounding doing its job.
    expect(screen.queryByText("Discount given")).toBeNull();

    type(screen.getByTitle("Total, to the nearest rupee"), "1000");
    expect(screen.getByText("Discount given")).toBeTruthy();
    expect(screen.getByText("76.25")).toBeTruthy();
  });

  it("starts the next line on Enter and moves to it, without stacking empty rows", () => {
    fillOneLine();
    const grid = document.querySelectorAll<HTMLElement>("table.grid")[0];
    const rows = () => within(grid).getAllByRole("row").length;
    const shape = () => within(grid).getAllByRole("combobox").at(-1) as HTMLSelectElement;
    const before = rows();

    fireEvent.keyDown(firstRow()[1], { key: "Enter" });
    expect(rows()).toBe(before + 1);

    // The cursor lands on the first field of the row, which is the one to choose.
    expect(document.activeElement).toBe(shape());

    // The new row has no size in it, so leaning on the key adds nothing more.
    fireEvent.keyDown(firstRow()[0], { key: "Enter" });
    fireEvent.keyDown(firstRow()[0], { key: "Enter" });
    expect(rows()).toBe(before + 1);
  });

  it("moves to the new row from the Add button too, in either table", () => {
    fillOneLine();
    const grid = document.querySelectorAll<HTMLElement>("table.grid")[0];
    const charges = document.querySelectorAll<HTMLElement>("table.grid")[1];

    fireEvent.click(screen.getByText("Add line"));
    expect(document.activeElement).toBe(within(grid).getAllByRole("combobox").at(-1));

    fireEvent.click(screen.getByText("Add charge"));
    expect(document.activeElement).toBe(within(charges).getAllByRole("combobox").at(-1));
  });

  it("starts the next charge on Enter, once the row on screen has been named", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Add charge"));

    const charges = document.querySelectorAll<HTMLElement>("table.grid")[1];
    const rows = () => within(charges).getAllByRole("row");
    const nameOf = (i: number) => within(rows()[i]).getByRole("combobox") as HTMLSelectElement;

    fireEvent.keyDown(nameOf(1), { key: "Enter" });
    expect(rows()).toHaveLength(2);

    fireEvent.change(nameOf(1), { target: { value: "HOLES" } });
    fireEvent.keyDown(nameOf(1), { key: "Enter" });
    expect(rows()).toHaveLength(3);
    expect(document.activeElement).toBe(nameOf(2));
  });

  it("keeps the charges heading standing over the button that fills it", () => {
    render(<App />);
    const charges = document.querySelectorAll<HTMLElement>("table.grid")[1];
    expect(within(charges).getAllByRole("row")).toHaveLength(1);

    fireEvent.click(screen.getByText("Add charge"));
    const row = within(charges).getAllByRole("row")[1];
    const cells = within(row).getAllByRole("textbox") as HTMLInputElement[];
    const name = within(row).getByRole("combobox") as HTMLSelectElement;

    // Nothing chosen, nothing counted, nothing charged: the name comes off the
    // office's list and the price is the job's (§3.1). Only the amount is
    // worked out rather than typed.
    expect(name.value).toBe("");
    expect(cells.map((c) => c.value)).toEqual(["", "0", "0"]);
    expect(cells[2].disabled).toBe(true);

    // Naming it says how it is billed — holes are counted — but never at what.
    fireEvent.change(name, { target: { value: "HOLES" } });
    const named = within(within(charges).getAllByRole("row")[1]).getAllByRole(
      "textbox",
    ) as HTMLInputElement[];
    expect(named.map((c) => c.value)).toEqual(["1", "0", "0"]);
  });

  it("takes a glass name the catalogue has never heard of", () => {
    render(<App />);
    const glass = screen.getAllByRole("combobox")[1];
    fireEvent.change(glass, { target: { value: CUSTOM_PRODUCT } });

    type(screen.getByPlaceholderText("Glass name as it should print"), "12mm low iron");
    expect(screen.getByDisplayValue("12MM LOW IRON")).toBeTruthy();

    // And back again, from the same dropdown.
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "CLEAR MIRROR" } });
    expect(screen.queryByPlaceholderText("Glass name as it should print")).toBeNull();
  });

  it("starts on no glass at all, and waits for both halves of the name", () => {
    render(<App />);
    const [thickness, glass] = screen.getAllByRole("combobox") as HTMLSelectElement[];
    expect(thickness.value).toBe("");
    expect(glass.value).toBe("");

    // Half a name is not a glass the catalogue knows, and must not tip the
    // section into the free-text box that a name it does not know would.
    fireEvent.change(thickness, { target: { value: "12MM" } });
    expect(screen.queryByPlaceholderText("Glass name as it should print")).toBeNull();

    fireEvent.change(glass, { target: { value: "CLEAR TOUGHENED GLASS" } });
    expect(screen.getByText("12MM CLEAR TOUGHENED GLASS · HSN 7007")).toBeTruthy();
  });

  it("offers the card price beside the glass and still leaves the rate to be typed", () => {
    render(<App />);
    const [thickness, glass] = screen.getAllByRole("combobox") as HTMLSelectElement[];

    // Nothing to offer until there is a glass to price.
    expect(document.body.textContent).not.toContain("GST to be added");

    fireEvent.change(glass, { target: { value: "CLEAR TOUGHENED GLASS" } });
    fireEvent.change(thickness, { target: { value: "12MM" } });

    // The card asks ₹1,414 the square metre, before tax — and the row stays at 0
    // until somebody types the price that was agreed.
    expect(document.body.textContent).toContain("₹1,414 / SQMT");
    expect(document.body.textContent).toContain("GST to be added");
    expect(firstRow()[7].value).toBe("0");
  });

  it("asks before throwing the quote away", () => {
    fillOneLine();
    fireEvent.click(screen.getByText("New quote"));

    fireEvent.click(screen.getByText("Cancel"));
    expect(firstRow()[0].value).toBe("2000");

    fireEvent.click(screen.getByText("New quote"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("Start a new quote?")).toBeNull();
    expect(firstRow()[0].value).toBe("2000");

    fireEvent.click(screen.getByText("New quote"));
    fireEvent.click(screen.getByText("Yes, start fresh"));
    expect(firstRow()[0].value).toBe("0");
  });

  it("keeps the working off the printed document", () => {
    fillOneLine();
    fireEvent.click(screen.getByText("Preview"));

    expect(screen.getByText("PROFORMA INVOICE")).toBeTruthy();
    expect(screen.getByText("BANK DETAILS")).toBeTruthy();
    expect(screen.queryByText("Wastage")).toBeNull();
    expect(screen.queryByText("Add line")).toBeNull();
  });
});

describe("the draft", () => {
  it("is offered back after the tab is closed mid-quote", async () => {
    fillOneLine();
    type(screen.getByPlaceholderText("M/S ..."), "G FOCUSS INTERIORS");

    await new Promise((r) => setTimeout(r, 500));
    cleanup();
    render(<App />);

    expect(screen.getByText("An unfinished quote was left open")).toBeTruthy();
    fireEvent.click(screen.getByText("Pick it up"));
    expect(screen.getByDisplayValue("G FOCUSS INTERIORS")).toBeTruthy();
  });
});
