import { renderToBuffer } from '@react-pdf/renderer';
import type { Invoice, InvoiceItem, Organization, Customer } from "@prisma/client";
import { invoiceToDocument } from './types';
import { BaseDocumentLayout } from './renderer';
import React from 'react';

/**
 * Renders a tax invoice to PDF bytes using @react-pdf/renderer.
 * Uses unified DocumentData to render a styled, reusable layout.
 */
export async function renderInvoicePdf(
  invoice: Invoice & { items: InvoiceItem[] },
  organization: Organization,
  customer: Customer
): Promise<Uint8Array> {
  const documentData = invoiceToDocument(invoice, organization, customer);
  
  // renderToBuffer returns a Node.js Buffer, which implements Uint8Array
  const buffer = await renderToBuffer(
    React.createElement(BaseDocumentLayout, { data: documentData }) as any
  );
  
  return new Uint8Array(buffer);
}
