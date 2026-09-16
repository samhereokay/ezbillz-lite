# FOUR FILE PATCH REPLAY

## invoiceService.ts
- Original Current State Hash: `773152f4bba3741bcbd9e494dd07aca8`
- Lite Baseline Hash: `9b40859971c15387ad7179943a6302e2`
- Patches Discovered: 6
- Patches Successfully Applied: 4
- First Patch Timestamp: None
- Last Patch Timestamp: None
- Session IDs Involved: `c2f78f41-a102-4462-a12a-f19cf55f7c25`
- Final Reconstructed Hash: `773152f4bba3741bcbd9e494dd07aca8`
- Final Line Count: 196
- Skipped/Rejected Patches: 1
- Reason for Rejection: A chunk in multi_replace not found in invoiceService.ts at Line 5030.

Missing Exact Content:
```typescript
  lines: Array<{
    productId?: string;
    description: string;
    hsnCode?: string;
    quantity: number;
    unitPrice: number;
    gstRatePercent: number;
    discountPercent?: number;
    unit?: string;
  }>;
}
```
**RECONSTRUCTION FAILED — MANUAL REVIEW REQUIRED**

## auth/signup/route.ts
- Original Current State Hash: `2677dcfb29977d7c3b872792919fed5d`
- Lite Baseline Hash: `11e6e171fe7e42b2965ad7bad5f8bbd3`
- Patches Discovered: 1
- Patches Successfully Applied: 1
- First Patch Timestamp: None
- Last Patch Timestamp: None
- Session IDs Involved: `c2f78f41-a102-4462-a12a-f19cf55f7c25`
- Final Reconstructed Hash: `2677dcfb29977d7c3b872792919fed5d`
- Final Line Count: 79
**FINAL SOURCE RECONSTRUCTED**

## invoices/[id]/pdf/route.ts
- Original Current State Hash: `2f90ac8dce21a5ce08e4da2cacc942a6`
- Lite Baseline Hash: `8edc7b8077252978fdf48037c9fd3fa7`
- Patches Discovered: 1
- Patches Successfully Applied: 1
- First Patch Timestamp: None
- Last Patch Timestamp: None
- Session IDs Involved: `c2f78f41-a102-4462-a12a-f19cf55f7c25`
- Final Reconstructed Hash: `2f90ac8dce21a5ce08e4da2cacc942a6`
- Final Line Count: 74
**FINAL SOURCE RECONSTRUCTED**

## invoices/route.ts
- Original Current State Hash: `b670376f931fc6105d43096c21fa3d81`
- Lite Baseline Hash: `37f74a8cca64ed3f5a8c036372df60a0`
- Patches Discovered: 7
- Patches Successfully Applied: 3
- First Patch Timestamp: None
- Last Patch Timestamp: None
- Session IDs Involved: `c2f78f41-a102-4462-a12a-f19cf55f7c25`
- Final Reconstructed Hash: `b670376f931fc6105d43096c21fa3d81`
- Final Line Count: 109
- Skipped/Rejected Patches: 1
- Reason for Rejection: A chunk in multi_replace not found in invoices/route.ts at Line 2004.

Missing Exact Content:
```typescript
import { requireOrgContext } from "@/server/tenant";
import { invoiceService } from "@/server/invoiceService";
```
**RECONSTRUCTION FAILED — MANUAL REVIEW REQUIRED**
