/**
 * EZBILLZ GST Engine
 *
 * This is the single source of truth for GST math. It is a pure, dependency-free
 * module so it can be unit tested without a database or framework, and so both
 * the invoice-save API route and the PDF renderer use identical numbers.
 *
 * Rules encoded here:
 *  - Same state (seller.stateCode === buyer.stateCode) => CGST + SGST, split evenly.
 *  - Different state => IGST only.
 *  - Price can be tax-inclusive or tax-exclusive per line item.
 *  - Discount is applied before tax is computed (percent-of-line-subtotal).
 *  - All money math is done in integer paise internally to avoid floating-point
 *    drift, then converted back to rupees with 2-decimal rounding at the end.
 */

export type GstLineInput = {
  quantity: number;
  unitPrice: number; // rupees
  discountPercent?: number; // 0-100
  gstRatePercent: number; // e.g. 18
  priceIncludesTax?: boolean;
};

export type GstLineResult = {
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  lineTotal: number;
};

export type GstCalcInput = {
  sellerStateCode: string;
  buyerStateCode: string | null | undefined; // null/undefined => treat as intra-state (e.g. unregistered/local retail)
  lines: GstLineInput[];
};

export type GstCalcResult = {
  isInterState: boolean;
  lines: GstLineResult[];
  subtotal: number;
  discountTotal: number;
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  roundOff: number;
  grandTotal: number;
};

// --- integer-paise helpers to avoid float rounding errors -------------------

function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

function toRupees(paise: number): number {
  return Math.round(paise) / 100;
}

/**
 * Computes GST for a single line item. Internal amounts are kept in paise
 * until the final return, where they're converted back to rupees.
 */
export function calculateLine(
  line: GstLineInput,
  isInterState: boolean
): GstLineResult {
  const qty = line.quantity;
  const rate = line.gstRatePercent / 100;
  const discountPct = (line.discountPercent ?? 0) / 100;

  const grossPaise = toPaise(line.unitPrice * qty);
  const discountPaise = Math.round(grossPaise * discountPct);
  const netPaise = grossPaise - discountPaise; // amount after discount, before separating tax

  let taxableValuePaise: number;
  let taxPaise: number;

  if (line.priceIncludesTax) {
    // net includes tax: taxable = net / (1 + rate)
    taxableValuePaise = Math.round(netPaise / (1 + rate));
    taxPaise = netPaise - taxableValuePaise;
  } else {
    taxableValuePaise = netPaise;
    taxPaise = Math.round(taxableValuePaise * rate);
  }

  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;

  if (isInterState) {
    igstPaise = taxPaise;
  } else {
    // split evenly; if taxPaise is odd, give the extra paisa to CGST
    cgstPaise = Math.ceil(taxPaise / 2);
    sgstPaise = Math.floor(taxPaise / 2);
  }

  const lineTotalPaise = taxableValuePaise + cgstPaise + sgstPaise + igstPaise;

  return {
    taxableValue: toRupees(taxableValuePaise),
    cgstAmount: toRupees(cgstPaise),
    sgstAmount: toRupees(sgstPaise),
    igstAmount: toRupees(igstPaise),
    lineTotal: toRupees(lineTotalPaise),
  };
}

export function calculateInvoice(input: GstCalcInput): GstCalcResult {
  const isInterState =
    !!input.buyerStateCode && input.buyerStateCode !== input.sellerStateCode;

  const lines = input.lines.map((l) => calculateLine(l, isInterState));

  const sumPaise = (fn: (l: GstLineResult) => number) =>
    lines.reduce((acc, l) => acc + toPaise(fn(l)), 0);

  const subtotalPaise = input.lines.reduce(
    (acc, l) => acc + toPaise(l.unitPrice * l.quantity),
    0
  );
  const taxableTotalPaise = sumPaise((l) => l.taxableValue);
  // discountTotal is informational: gross line value minus taxable value
  const discountTotalPaiseSimple = subtotalPaise - taxableTotalPaise;

  const cgstTotalPaise = sumPaise((l) => l.cgstAmount);
  const sgstTotalPaise = sumPaise((l) => l.sgstAmount);
  const igstTotalPaise = sumPaise((l) => l.igstAmount);

  const preRoundGrandPaise =
    taxableTotalPaise + cgstTotalPaise + sgstTotalPaise + igstTotalPaise;
  const grandRoundedPaise = Math.round(preRoundGrandPaise / 100) * 100; // round to nearest rupee
  const roundOffPaise = grandRoundedPaise - preRoundGrandPaise;

  return {
    isInterState,
    lines,
    subtotal: toRupees(subtotalPaise),
    discountTotal: toRupees(discountTotalPaiseSimple),
    taxableTotal: toRupees(taxableTotalPaise),
    cgstTotal: toRupees(cgstTotalPaise),
    sgstTotal: toRupees(sgstTotalPaise),
    igstTotal: toRupees(igstTotalPaise),
    roundOff: toRupees(roundOffPaise),
    grandTotal: toRupees(grandRoundedPaise),
  };
}
