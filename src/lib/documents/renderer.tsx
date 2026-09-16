import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import { DocumentData } from './types';
import { formatINR, formatDate } from '../utils';

// You can register custom fonts here if needed
// Font.register({ family: 'Inter', src: '...' });

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#333333',
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingBottom: 15,
  },
  headerLeft: {
    width: '60%',
  },
  headerRight: {
    width: '35%',
    textAlign: 'right',
  },
  title: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 5,
  },
  companyName: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 5,
  },
  companyDetails: {
    fontSize: 9,
    color: '#6b7280',
    lineHeight: 1.4,
  },
  documentMeta: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 4,
  },
  metaLabel: {
    fontFamily: 'Helvetica-Bold',
    marginRight: 5,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 8,
    color: '#111827',
  },
  billTo: {
    backgroundColor: '#f9fafb',
    padding: 10,
    borderRadius: 4,
  },
  customerName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    marginBottom: 4,
  },
  table: {
    width: 'auto',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  tableRow: {
    margin: 'auto',
    flexDirection: 'row',
  },
  tableColHeader: {
    width: '16.6%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderLeftWidth: 0,
    borderTopWidth: 0,
    backgroundColor: '#f3f4f6',
    padding: 6,
  },
  tableCol: {
    width: '16.6%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderLeftWidth: 0,
    borderTopWidth: 0,
    padding: 6,
  },
  tableColDesc: {
    width: '33.6%',
  },
  tableCellHeader: {
    margin: 'auto',
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
  },
  tableCell: {
    margin: 'auto',
    fontSize: 9,
  },
  tableCellLeft: {
    fontSize: 9,
    textAlign: 'left',
  },
  tableCellRight: {
    fontSize: 9,
    textAlign: 'right',
  },
  summary: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  summaryTable: {
    width: '40%',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  summaryLabel: {
    fontFamily: 'Helvetica-Bold',
  },
  summaryValue: {
    textAlign: 'right',
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#111827',
    marginTop: 4,
  },
  grandTotalLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
  },
  grandTotalValue: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    textAlign: 'right',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    fontSize: 8,
    color: '#9ca3af',
    textAlign: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 10,
  },
  notesBox: {
    marginTop: 20,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  leftFooter: {
    width: '45%',
  },
  rightFooter: {
    width: '45%',
    textAlign: 'right',
  },
  bankDetails: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  bankDetailRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  bankLabel: {
    fontFamily: 'Helvetica-Bold',
    width: 80,
    fontSize: 9,
  },
  bankValue: {
    fontSize: 9,
  },
  signatureBox: {
    marginTop: 40,
    borderTopWidth: 1,
    borderTopColor: '#111827',
    paddingTop: 5,
    width: 150,
    alignSelf: 'flex-end',
  },
  signatureName: {
    textAlign: 'center',
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
  }
});

const getDocumentTitle = (type: string) => {
  switch (type) {
    case 'QUOTATION': return 'QUOTATION';
    case 'DELIVERY_CHALLAN': return 'DELIVERY CHALLAN';
    case 'CREDIT_NOTE': return 'CREDIT NOTE';
    case 'DEBIT_NOTE': return 'DEBIT NOTE';
    case 'SALES_RETURN': return 'SALES RETURN';
    case 'BILL_OF_SUPPLY': return 'BILL OF SUPPLY';
    default: return 'TAX INVOICE';
  }
};

export const BaseDocumentLayout = ({ data }: { data: DocumentData }) => {
  const brandColor = data.organization.brandColor || '#000000';
  
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.companyName, { color: brandColor }]}>{data.organization.name}</Text>
            {data.organization.addressLine1 && <Text style={styles.companyDetails}>{data.organization.addressLine1}</Text>}
            {data.organization.addressLine2 && <Text style={styles.companyDetails}>{data.organization.addressLine2}</Text>}
            <Text style={styles.companyDetails}>
              {[data.organization.city, data.organization.state, data.organization.pincode].filter(Boolean).join(', ')}
            </Text>
            {data.organization.gstin && <Text style={styles.companyDetails}>GSTIN: {data.organization.gstin}</Text>}
          </View>
          
          <View style={styles.headerRight}>
            <Text style={styles.title}>{getDocumentTitle(data.type)}</Text>
            <View style={styles.documentMeta}>
              <Text style={styles.metaLabel}>No:</Text>
              <Text>{data.number}</Text>
            </View>
            <View style={styles.documentMeta}>
              <Text style={styles.metaLabel}>Date:</Text>
              <Text>{formatDate(data.issueDate)}</Text>
            </View>
            {data.validUntil && (
              <View style={styles.documentMeta}>
                <Text style={styles.metaLabel}>Valid Until:</Text>
                <Text>{formatDate(data.validUntil)}</Text>
              </View>
            )}
            {data.vehicleNo && (
              <View style={styles.documentMeta}>
                <Text style={styles.metaLabel}>Vehicle No:</Text>
                <Text>{data.vehicleNo}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Bill To */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bill To:</Text>
          <View style={styles.billTo}>
            <Text style={styles.customerName}>{data.customer.name}</Text>
            {data.customer.addressLine1 && <Text style={styles.companyDetails}>{data.customer.addressLine1}</Text>}
            {data.customer.city && <Text style={styles.companyDetails}>{data.customer.city}, {data.customer.state}</Text>}
            {data.customer.gstin && <Text style={styles.companyDetails}>GSTIN: {data.customer.gstin}</Text>}
          </View>
        </View>

        {/* Items Table */}
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <View style={[styles.tableColHeader, styles.tableColDesc]}>
              <Text style={styles.tableCellHeader}>Description</Text>
            </View>
            <View style={styles.tableColHeader}>
              <Text style={styles.tableCellHeader}>Qty</Text>
            </View>
            <View style={styles.tableColHeader}>
              <Text style={styles.tableCellHeader}>Rate</Text>
            </View>
            <View style={styles.tableColHeader}>
              <Text style={styles.tableCellHeader}>GST%</Text>
            </View>
            <View style={styles.tableColHeader}>
              <Text style={styles.tableCellHeader}>Taxable</Text>
            </View>
            <View style={styles.tableColHeader}>
              <Text style={styles.tableCellHeader}>Total</Text>
            </View>
          </View>

          {data.items.map((item, i) => (
            <View style={styles.tableRow} key={i}>
              <View style={[styles.tableCol, styles.tableColDesc]}>
                <Text style={styles.tableCellLeft}>{item.description}</Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCellRight}>{item.quantity.toString()}</Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCellRight}>{Number(item.unitPrice).toFixed(2)}</Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCellRight}>{item.gstRatePercent.toString()}%</Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCellRight}>{Number(item.taxableValue).toFixed(2)}</Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCellRight}>{Number(item.lineTotal).toFixed(2)}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Summary Area */}
        <View style={styles.summary}>
          <View style={styles.summaryTable}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Taxable Total</Text>
              <Text style={styles.summaryValue}>{formatINR(data.taxableTotal)}</Text>
            </View>
            
            {data.cgstTotal > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>CGST</Text>
                <Text style={styles.summaryValue}>{formatINR(data.cgstTotal)}</Text>
              </View>
            )}
            
            {data.sgstTotal > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>SGST</Text>
                <Text style={styles.summaryValue}>{formatINR(data.sgstTotal)}</Text>
              </View>
            )}
            
            {data.igstTotal > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>IGST</Text>
                <Text style={styles.summaryValue}>{formatINR(data.igstTotal)}</Text>
              </View>
            )}

            {data.roundOff !== 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Round Off</Text>
                <Text style={styles.summaryValue}>{formatINR(data.roundOff)}</Text>
              </View>
            )}

            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>Grand Total</Text>
              <Text style={styles.grandTotalValue}>{formatINR(data.grandTotal)}</Text>
            </View>
          </View>
        </View>

        {/* Footer Configuration */}
        <View style={styles.notesBox}>
          <View style={styles.leftFooter}>
            {data.organization.defaultNotes && (
              <View style={{ marginBottom: 10 }}>
                <Text style={styles.sectionTitle}>Notes:</Text>
                <Text style={styles.companyDetails}>{data.organization.defaultNotes}</Text>
              </View>
            )}
            {data.organization.defaultTerms && (
              <View style={{ marginBottom: 10 }}>
                <Text style={styles.sectionTitle}>Terms & Conditions:</Text>
                <Text style={styles.companyDetails}>{data.organization.defaultTerms}</Text>
              </View>
            )}

            {(data.organization.bankName || data.organization.upiId) && (
              <View style={styles.bankDetails}>
                <Text style={styles.sectionTitle}>Bank Details:</Text>
                {data.organization.bankName && (
                  <View style={styles.bankDetailRow}>
                    <Text style={styles.bankLabel}>Bank Name:</Text>
                    <Text style={styles.bankValue}>{data.organization.bankName}</Text>
                  </View>
                )}
                {data.organization.bankAccountNo && (
                  <View style={styles.bankDetailRow}>
                    <Text style={styles.bankLabel}>Account No:</Text>
                    <Text style={styles.bankValue}>{data.organization.bankAccountNo}</Text>
                  </View>
                )}
                {data.organization.bankIfsc && (
                  <View style={styles.bankDetailRow}>
                    <Text style={styles.bankLabel}>IFSC Code:</Text>
                    <Text style={styles.bankValue}>{data.organization.bankIfsc}</Text>
                  </View>
                )}
                {data.organization.upiId && (
                  <View style={styles.bankDetailRow}>
                    <Text style={styles.bankLabel}>UPI ID:</Text>
                    <Text style={styles.bankValue}>{data.organization.upiId}</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          <View style={styles.rightFooter}>
            <View style={styles.signatureBox}>
              <Text style={styles.signatureName}>
                {data.organization.authorizedSignatoryName || "Authorized Signatory"}
              </Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <Text style={styles.footer} fixed>
          Generated with EZBILLZ Lite — {data.id}
        </Text>
      </Page>
    </Document>
  );
};
