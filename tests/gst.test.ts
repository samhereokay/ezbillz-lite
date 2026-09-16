import { describe, it, expect } from "vitest";
import { calculateInvoice, calculateLine } from "../src/lib/gst/engine";

describe("GST engine — mandatory cases", () => {
  it("West Bengal -> West Bengal @18% => CGST 9% + SGST 9%, IGST 0", () => {
    const result = calculateInvoice({
      sellerStateCode: "19",
      buyerStateCode: "19",
      lines: [{ quantity: 1, unitPrice: 1000, gstRatePercent: 18 }],
    });
    expect(result.isInterState).toBe(false);
    expect(result.cgstTotal).toBeCloseTo(90);
    expect(result.sgstTotal).toBeCloseTo(90);
    expect(result.igstTotal).toBe(0);
    expect(result.taxableTotal).toBeCloseTo(1000);
    expect(result.grandTotal).toBeCloseTo(1180);
  });

  it("West Bengal -> Maharashtra @18% => IGST 18%, CGST 0, SGST 0", () => {
    const result = calculateInvoice({
      sellerStateCode: "19",
      buyerStateCode: "27",
      lines: [{ quantity: 1, unitPrice: 1000, gstRatePercent: 18 }],
    });
    expect(result.isInterState).toBe(true);
    expect(result.cgstTotal).toBe(0);
    expect(result.sgstTotal).toBe(0);
    expect(result.igstTotal).toBeCloseTo(180);
    expect(result.grandTotal).toBeCloseTo(1180);
  });

  it("applies a line discount before computing tax", () => {
    const line = calculateLine(
      { quantity: 2, unitPrice: 500, discountPercent: 10, gstRatePercent: 18 },
      false
    );
    // gross 1000, 10% discount => taxable 900, tax 18% = 162 (81/81 split)
    expect(line.taxableValue).toBeCloseTo(900);
    expect(line.cgstAmount).toBeCloseTo(81);
    expect(line.sgstAmount).toBeCloseTo(81);
    expect(line.lineTotal).toBeCloseTo(1062);
  });

  it("handles tax-inclusive pricing correctly", () => {
    // unit price 118 inclusive of 18% GST => taxable 100, tax 18
    const line = calculateLine(
      { quantity: 1, unitPrice: 118, gstRatePercent: 18, priceIncludesTax: true },
      false
    );
    expect(line.taxableValue).toBeCloseTo(100);
    expect(line.cgstAmount + line.sgstAmount).toBeCloseTo(18);
    expect(line.lineTotal).toBeCloseTo(118);
  });

  it("treats a null buyer state as intra-state (e.g. unregistered local retail)", () => {
    const result = calculateInvoice({
      sellerStateCode: "19",
      buyerStateCode: null,
      lines: [{ quantity: 1, unitPrice: 100, gstRatePercent: 5 }],
    });
    expect(result.isInterState).toBe(false);
    expect(result.igstTotal).toBe(0);
  });

  it("rounds the grand total to the nearest rupee and records roundOff", () => {
    const result = calculateInvoice({
      sellerStateCode: "19",
      buyerStateCode: "19",
      lines: [{ quantity: 3, unitPrice: 33.33, gstRatePercent: 18 }],
    });
    expect(Number.isInteger(result.grandTotal)).toBe(true);
    expect(result.roundOff).toBeCloseTo(
      result.grandTotal - (result.taxableTotal + result.cgstTotal + result.sgstTotal + result.igstTotal),
      2
    );
  });

  it("splits an odd paisa of tax so CGST and SGST never diverge by more than 1 paisa", () => {
    const line = calculateLine(
      { quantity: 1, unitPrice: 10.01, gstRatePercent: 18 },
      false
    );
    expect(Math.abs(line.cgstAmount - line.sgstAmount)).toBeLessThanOrEqual(0.01);
  });
});
