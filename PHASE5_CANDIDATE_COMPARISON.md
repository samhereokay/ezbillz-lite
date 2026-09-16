# PHASE 5 CANDIDATE COMPARISON

## invoiceService.ts

### Candidate 1 (Length 4) vs Candidate 3 (Length 3)
- Candidate 1 applied 4 patches ending with the `replace_file_content` at Line 4876.
- Candidate 3 applied 3 patches.
- The `replace_file_content` at Line 4876 introduces `inventoryService` calls `recordStockMovement`. This is consistent with the Phase 13 inventory integration mentioned in the ledger.
- However, patches at Line 5030 and Line 5119 failed to apply deterministically. Line 5030 explicitly tries to add `warehouseId` to the `lines` signature. Because we cannot deterministically apply the final patches, multiple valid but incomplete candidates exist.

## invoices/route.ts

### Candidate 1 (Length 6) vs Candidate 2 (Length 5)
- Candidate 1 skipped Line 2004 but applied later patches.
- Line 2004 attempted to modify how `orgId` was validated, but its `TargetContent` didn't match the state produced by Line 522. 
- Because we cannot know for sure whether skipping Line 2004 produces the exact final tested state, the state remains ambiguous.

