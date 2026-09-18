import { PrismaClient, Prisma, StockMovementType } from "@prisma/client";

export class InventoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryError";
  }
}

/**
 * Creates the default "Main Warehouse" for an organization if one doesn't exist.
 * This is meant to be called during onboarding or explicit setup, NOT hidden inside a GET.
 */
export async function initializeDefaultWarehouse(tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">, organizationId: string) {
  const existing = await tx.warehouse.findFirst({
    where: { organizationId, isDefault: true },
  });
  if (existing) return existing;

  return await tx.warehouse.create({
    data: {
      organizationId,
      name: "Main Warehouse",
      isDefault: true,
      isActive: true,
    },
  });
}

/**
 * Validates stock availability and records a movement transactionally.
 */
export async function recordStockMovement(
  prismaOrTx: any,
  params: {
    organizationId: string;
    productId: string;
    warehouseId: string;
    locationId?: string | null;
    type: StockMovementType;
    quantity: number;
    referenceType?: string;
    referenceId?: string;
    note?: string;
    userId?: string;
  }
) {
  const doWork = async (tx: any) => {
    const { organizationId, productId, warehouseId, locationId, type, quantity, referenceType, referenceId, note, userId } = params;

  const warehouse = await tx.warehouse.findUnique({ where: { id: warehouseId } });
  if (!warehouse) {
    throw new InventoryError("Warehouse not found.");
  }
  if (warehouse.organizationId !== organizationId) {
    throw new InventoryError("Warehouse does not belong to this organization.");
  }
  if (!warehouse.isActive) {
    throw new InventoryError("Warehouse is inactive.");
  }

  if (locationId) {
    const location = await tx.location.findUnique({ where: { id: locationId } });
    if (!location || location.organizationId !== organizationId || location.warehouseId !== warehouseId) {
      throw new InventoryError("Invalid location.");
    }
  }

  const product = await tx.$queryRaw<any[]>`
    SELECT id, "organizationId" FROM "Product" WHERE id = ${productId} FOR UPDATE
  `;
  
  if (!product || product.length === 0 || product[0].organizationId !== organizationId) {
    throw new InventoryError("Product not found or does not belong to this organization.");
  }

  // Idempotency check
  if (referenceType && referenceId) {
    const existingMovement = await tx.stockMovement.findFirst({
      where: {
        organizationId,
        productId,
        type,
        referenceType,
        referenceId,
      },
    });
    if (existingMovement) {
      // Already applied, return silently for idempotency
      return existingMovement;
    }
  }

  const isOutbound = ([
    StockMovementType.SALE_ISSUE,
    StockMovementType.PURCHASE_RETURN,
    StockMovementType.TRANSFER_OUT,
  ] as StockMovementType[]).includes(type);

  const isInbound = ([
    StockMovementType.OPENING,
    StockMovementType.PURCHASE_RECEIPT,
    StockMovementType.SALE_RETURN,
    StockMovementType.TRANSFER_IN,
  ] as StockMovementType[]).includes(type);

  const isAdjustment = type === StockMovementType.ADJUSTMENT;
  
  if (!isAdjustment && quantity <= 0) {
      throw new InventoryError(`Movement quantity must be greater than zero for ${type}`);
  }
  if (isAdjustment && quantity === 0) {
      throw new InventoryError("Adjustment quantity cannot be zero");
  }

  const actualQuantity = isAdjustment 
    ? quantity // Can be positive or negative
    : (isOutbound ? -Math.abs(quantity) : Math.abs(quantity));

  // 1. Enforce Stock Balance Update
  if (actualQuantity < 0) {
    // OUTBOUND: Atomic update with constraint
    const decrementAmount = Math.abs(actualQuantity);
    
    let affected = 0;
    
    if (locationId) {
        affected = await tx.$executeRaw`
          UPDATE "StockBalance"
          SET quantity = quantity - ${decrementAmount}, "updatedAt" = NOW()
          WHERE "organizationId" = ${organizationId}
            AND "productId" = ${productId}
            AND "warehouseId" = ${warehouseId}
            AND "locationId" = ${locationId}
            AND quantity >= ${decrementAmount}
        `;
    } else {
        affected = await tx.$executeRaw`
          UPDATE "StockBalance"
          SET quantity = quantity - ${decrementAmount}, "updatedAt" = NOW()
          WHERE "organizationId" = ${organizationId}
            AND "productId" = ${productId}
            AND "warehouseId" = ${warehouseId}
            AND "locationId" IS NULL
            AND quantity >= ${decrementAmount}
        `;
    }

    if (affected === 0) {
      throw new InventoryError("Insufficient stock or balance not found for product in the specified warehouse/location.");
    }
  } else {
    // INBOUND: Upsert balance
    const incrementAmount = actualQuantity;
    // Note: cuid() is not native to postgres, but gen_random_uuid() is close enough for the id field.
    if (locationId) {
        await tx.$executeRaw`
          INSERT INTO "StockBalance" ("id", "organizationId", "warehouseId", "locationId", "productId", "quantity", "updatedAt")
          VALUES (
            gen_random_uuid()::text, 
            ${organizationId}, 
            ${warehouseId}, 
            ${locationId}, 
            ${productId}, 
            ${incrementAmount}, 
            NOW()
          )
          ON CONFLICT ("organizationId", "warehouseId", "locationId", "productId")
          DO UPDATE SET quantity = "StockBalance".quantity + EXCLUDED.quantity, "updatedAt" = NOW();
        `;
    } else {
        // Unfortunately ON CONFLICT behavior with NULLs is tricky in Postgres unless a unique index handles NULL explicitly.
        // Prisma schema defines @@unique([organizationId, warehouseId, locationId, productId]). 
        // Postgres unique indexes consider NULL != NULL. 
        // Wait, if locationId is missing, Prisma's unique constraint handles it?
        // Actually, Prisma uses unique index which by default doesn't enforce uniqueness for NULL in PG < 15 unless NULLS NOT DISTINCT.
        // A safer bet is to find and update or insert using Prisma client!
        const existingBalance = await tx.stockBalance.findFirst({
            where: {
                organizationId,
                productId,
                warehouseId,
                locationId: null,
            }
        });
        
        if (existingBalance) {
             await tx.stockBalance.update({
                 where: { id: existingBalance.id },
                 data: { quantity: { increment: incrementAmount } }
             });
        } else {
             await tx.stockBalance.create({
                 data: {
                     organizationId,
                     productId,
                     warehouseId,
                     locationId: null,
                     quantity: incrementAmount
                 }
             });
        }
    }
  }

  // 2. Record Movement
  const movement = await tx.stockMovement.create({
    data: {
      organizationId,
      productId,
      warehouseId,
      locationId: locationId || null,
      type,
      quantity: new Prisma.Decimal(actualQuantity),
      referenceType,
      referenceId,
      note,
    },
  });

  return movement;
  };

  if ('$transaction' in prismaOrTx) {
    return prismaOrTx.$transaction(doWork);
  } else {
    return doWork(prismaOrTx);
  }
}
