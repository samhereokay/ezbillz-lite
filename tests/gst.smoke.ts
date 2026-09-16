// Dependency-free smoke runner for the GST engine — same assertions as
// tests/gst.test.ts (vitest), runnable directly with `tsx` where no
// package install is available (e.g. CI-less sandboxes).
import { calculateInvoice, calculateLine } from "../src/lib/gst/engine";

let pass = 0;
let fail = 0;

function close(a: number, b: number, label: string) {
  if (Math.abs(a - b) < 0.005) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${label} — expected ${b}, got ${a}`);
  }
}
function ok(cond: boolean, label: string) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL: ${label}`);
  }
}

// 1. WB -> WB @18%
{
  const r = calculateInvoice({
    sellerStateCode: "19",
    buyerStateCode: "19",
    lines: [{ quantity: 1, unitPrice: 1000, gstRatePercent: 18 }],
  });
  ok(r.isInterState === false, "WB->WB is intra-state");
  close(r.cgstTotal, 90, "WB->WB CGST=90");
  close(r.sgstTotal, 90, "WB->WB SGST=90");
  close(r.igstTotal, 0, "WB->WB IGST=0");
  close(r.grandTotal, 1180, "WB->WB grandTotal=1180");
}

// 2. WB -> Maharashtra @18%
{
  const r = calculateInvoice({
    sellerStateCode: "19",
    buyerStateCode: "27",
    lines: [{ quantity: 1, unitPrice: 1000, gstRatePercent: 18 }],
  });
  ok(r.isInterState === true, "WB->MH is inter-state");
  close(r.cgstTotal, 0, "WB->MH CGST=0");
  close(r.sgstTotal, 0, "WB->MH SGST=0");
  close(r.igstTotal, 180, "WB->MH IGST=180");
  close(r.grandTotal, 1180, "WB->MH grandTotal=1180");
}

// 3. Discount applied before tax
{
  const l = calculateLine(
    { quantity: 2, unitPrice: 500, discountPercent: 10, gstRatePercent: 18 },
    false
  );
  close(l.taxableValue, 900, "discount taxable=900");
  close(l.cgstAmount, 81, "discount CGST=81");
  close(l.sgstAmount, 81, "discount SGST=81");
  close(l.lineTotal, 1062, "discount lineTotal=1062");
}

// 4. Tax-inclusive pricing
{
  const l = calculateLine(
    { quantity: 1, unitPrice: 118, gstRatePercent: 18, priceIncludesTax: true },
    false
  );
  close(l.taxableValue, 100, "inclusive taxable=100");
  close(l.cgstAmount + l.sgstAmount, 18, "inclusive tax=18");
  close(l.lineTotal, 118, "inclusive lineTotal=118");
}

// 5. Null buyer state => intra-state
{
  const r = calculateInvoice({
    sellerStateCode: "19",
    buyerStateCode: null,
    lines: [{ quantity: 1, unitPrice: 100, gstRatePercent: 5 }],
  });
  ok(r.isInterState === false, "null buyer state => intra-state");
  ok(r.igstTotal === 0, "null buyer state => IGST 0");
}

// 6. Rounding
{
  const r = calculateInvoice({
    sellerStateCode: "19",
    buyerStateCode: "19",
    lines: [{ quantity: 3, unitPrice: 33.33, gstRatePercent: 18 }],
  });
  ok(Number.isInteger(r.grandTotal), "grandTotal rounded to integer rupee");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
