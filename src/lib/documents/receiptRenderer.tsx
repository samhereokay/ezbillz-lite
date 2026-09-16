import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { formatINR, formatDate, paymentMethodLabel } from '../utils';

export interface PaymentReceiptData {
  id: string;
  receiptNumber: string;
  paidAt: Date;
  amount: number;
  method: string;
  direction: 'RECEIVED' | 'PAID';
  note?: string | null;
  
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
    brandColor?: string | null;
  };
  
  party?: {
    name: string;
    gstin?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string | null;
  } | null;

  documentRef?: string | null;
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: 'Helvetica', color: '#333', backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingBottom: 20 },
  headerLeft: { width: '60%' },
  headerRight: { width: '35%', textAlign: 'right' },
  title: { fontSize: 24, fontFamily: 'Helvetica-Bold', marginBottom: 5, color: '#111827' },
  companyName: { fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 5 },
  companyDetails: { fontSize: 10, color: '#6b7280', lineHeight: 1.5 },
  
  section: { marginBottom: 25 },
  sectionTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginBottom: 8, color: '#111827' },
  partyBox: { backgroundColor: '#f9fafb', padding: 12, borderRadius: 4 },
  partyName: { fontFamily: 'Helvetica-Bold', fontSize: 12, marginBottom: 4 },
  
  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 },
  detailItem: { width: '50%', marginBottom: 10 },
  detailLabel: { fontSize: 10, color: '#6b7280', marginBottom: 2 },
  detailValue: { fontSize: 11, fontFamily: 'Helvetica-Bold' },

  amountBox: { backgroundColor: '#f3f4f6', padding: 15, borderRadius: 4, alignItems: 'center', marginTop: 10 },
  amountLabel: { fontSize: 12, color: '#4b5563', marginBottom: 5 },
  amountValue: { fontSize: 24, fontFamily: 'Helvetica-Bold', color: '#111827' },
  
  footer: { marginTop: 40, borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 20, textAlign: 'center', fontSize: 10, color: '#9ca3af' }
});

export const PaymentReceiptPDF = ({ data }: { data: PaymentReceiptData }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.companyName}>{data.organization.name}</Text>
          {data.organization.legalName && <Text style={styles.companyDetails}>{data.organization.legalName}</Text>}
          {(data.organization.addressLine1 || data.organization.city) && (
            <Text style={styles.companyDetails}>
              {[data.organization.addressLine1, data.organization.city, data.organization.state].filter(Boolean).join(', ')}
            </Text>
          )}
          {data.organization.gstin && <Text style={styles.companyDetails}>GSTIN: {data.organization.gstin}</Text>}
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.title}>PAYMENT RECEIPT</Text>
          <Text style={styles.companyDetails}>Receipt #: {data.receiptNumber}</Text>
          <Text style={styles.companyDetails}>Date: {formatDate(data.paidAt)}</Text>
        </View>
      </View>

      {/* Party Info */}
      {data.party && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{data.direction === 'RECEIVED' ? 'Received From' : 'Paid To'}</Text>
          <View style={styles.partyBox}>
            <Text style={styles.partyName}>{data.party.name}</Text>
            {(data.party.addressLine1 || data.party.city) && (
              <Text style={styles.companyDetails}>
                {[data.party.addressLine1, data.party.city, data.party.state].filter(Boolean).join(', ')}
              </Text>
            )}
            {data.party.gstin && <Text style={styles.companyDetails}>GSTIN: {data.party.gstin}</Text>}
          </View>
        </View>
      )}

      {/* Payment Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payment Details</Text>
        <View style={styles.detailsGrid}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Payment Method</Text>
            <Text style={styles.detailValue}>{paymentMethodLabel(data.method)}</Text>
          </View>
          {data.documentRef && (
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Reference Document</Text>
              <Text style={styles.detailValue}>{data.documentRef}</Text>
            </View>
          )}
          {data.note && (
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Notes</Text>
              <Text style={styles.detailValue}>{data.note}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Amount Box */}
      <View style={styles.amountBox}>
        <Text style={styles.amountLabel}>Amount {data.direction === 'RECEIVED' ? 'Received' : 'Paid'}</Text>
        <Text style={styles.amountValue}>{formatINR(data.amount)}</Text>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text>Thank you for your business!</Text>
        <Text>This is a computer-generated document and does not require a signature.</Text>
      </View>
    </Page>
  </Document>
);
