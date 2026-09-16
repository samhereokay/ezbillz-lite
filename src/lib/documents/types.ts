import type { Invoice, InvoiceItem, Organization, Customer, InvoiceType } from "@prisma/client";

// Unified document interface that the UI/PDF components consume
export interface DocumentData {
  id: string;
  type: InvoiceType;
  number: string;
  issueDate: Date;
  
  // Organization Details
  organization: {
    name: string;
    legalName?: string | null;
    gstin?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    state: string;
    stateCode: string;
    pincode?: string | null;
    logoFileId?: string | null;
    brandColor?: string | null;
    bankName?: string | null;
    bankAccountNo?: string | null;
    bankIfsc?: string | null;
    upiId?: string | null;
    defaultNotes?: string | null;
    defaultTerms?: string | null;
    authorizedSignatoryName?: string | null;
  };

  // Customer Details
  customer: {
    name: string;
    gstin?: string | null;
    state?: string | null;
    stateCode?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    pincode?: string | null;
  };

  // Document Specific Fields
  validUntil?: Date | null;
  deliveryAddress?: string | null;
  vehicleNo?: string | null;
  transporter?: string | null;
  ewayBillNo?: string | null;
  reasonForMovement?: string | null;

  // Commercials
  items: InvoiceItem[];
  subtotal: number;
  discountTotal: number;
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  roundOff: number;
  grandTotal: number;
  amountPaid: number;
}

export function invoiceToDocument(
  invoice: Invoice & { items: InvoiceItem[] },
  organization: Organization,
  customer: Customer
): DocumentData {
  return {
    id: invoice.id,
    type: invoice.type,
    number: invoice.number,
    issueDate: invoice.issueDate,
    organization: {
      name: organization.name,
      legalName: organization.legalName,
      gstin: organization.gstin,
      addressLine1: organization.addressLine1,
      addressLine2: organization.addressLine2,
      city: organization.city,
      state: organization.state,
      stateCode: organization.stateCode,
      pincode: organization.pincode,
      logoFileId: organization.logoFileId,
      brandColor: organization.brandColor,
      bankName: organization.bankName,
      bankAccountNo: organization.bankAccountNo,
      bankIfsc: organization.bankIfsc,
      upiId: organization.upiId,
      defaultNotes: organization.defaultNotes,
      defaultTerms: organization.defaultTerms,
      authorizedSignatoryName: organization.authorizedSignatoryName,
    },
    customer: {
      name: customer.name,
      gstin: customer.gstin,
      state: customer.state,
      stateCode: customer.stateCode,
      addressLine1: customer.addressLine1,
      addressLine2: customer.addressLine2,
      city: customer.city,
      pincode: customer.pincode,
    },
    validUntil: invoice.validUntil,
    deliveryAddress: invoice.deliveryAddress,
    vehicleNo: invoice.vehicleNo,
    transporter: invoice.transporter,
    ewayBillNo: invoice.ewayBillNo,
    reasonForMovement: invoice.reasonForMovement,
    items: invoice.items,
    subtotal: Number(invoice.subtotal),
    discountTotal: Number(invoice.discountTotal),
    taxableTotal: Number(invoice.taxableTotal),
    cgstTotal: Number(invoice.cgstTotal),
    sgstTotal: Number(invoice.sgstTotal),
    igstTotal: Number(invoice.igstTotal),
    roundOff: Number(invoice.roundOff),
    grandTotal: Number(invoice.grandTotal),
    amountPaid: Number(invoice.amountPaid),
  };
}
