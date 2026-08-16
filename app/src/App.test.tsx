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

/** The entry grid in column order: H, W, wastage, chargeable H, chargeable W, qty, area, rate, amount. */
function firstRow() {
  const rows = screen.getAllByRole("row");
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
  type(firstRow()[7], "500");
}

describe("the entry screen", () => {
  it("starts on one section with one empty row", () => {
    render(<App />);
    expect(screen.getByText("Section 1")).toBeTruthy();
    expect(firstRow()).toHaveLength(9);
  });

  it("fills in the chargeable size, the area and the amount as sizes are typed", () => {
    fillOneLine();
    const cells = firstRow();

    // 50 mm on each side, then 2.05 x 1.05 SQMT at ₹500.
    expect(cells[2].value).toBe("50");
    expect(cells[3].value).toBe("2050");
    expect(cells[4].value).toBe("1050");
    expect(cells[6].value).toBe("2.1525");
    expect(cells[8].value).toBe("1076.25");
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

  it("shows the cut size but will not be typed over", () => {
    fillOneLine();
    const cells = firstRow();
    expect(cells[3].disabled).toBe(true);
    expect(cells[4].disabled).toBe(true);

    // The way to cut a row differently is the allowance it was cut by.
    type(cells[2], "30");
    expect(firstRow()[3].value).toBe("2030");
  });

  it("flags a typed-over cell and puts it back when asked", () => {
    fillOneLine();
    type(firstRow()[8], "1000");

    expect(screen.getByText(/1 value has been typed over the formula/)).toBeTruthy();
    fireEvent.click(screen.getByText("Put everything back on the formula"));
    expect(screen.queryByText(/typed over the formula/)).toBeNull();
    expect(firstRow()[8].value).toBe("1076.25");
  });

  it("says nothing about a rounding, and names a discount", () => {
    fillOneLine();
    // 1076.25 written as 1076 is the rounding doing its job.
    expect(screen.queryByText("Discount given")).toBeNull();

    type(screen.getByTitle("Total, to the nearest rupee"), "1000");
    expect(screen.getByText("Discount given")).toBeTruthy();
    expect(screen.getByText("76.25")).toBeTruthy();
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
    fireEvent.click(screen.getByText("What prints"));

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
