import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface InvoiceData {
  // Invoice
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  status: string;
  // Business
  businessName: string;
  businessAddress?: string;
  businessCity?: string;
  businessState?: string;
  businessPincode?: string;
  businessGst?: string;
  businessPhone?: string;
  businessEmail?: string;
  // Subscription
  planName: string;
  billingCycle: string;
  periodStart: string;
  periodEnd: string;
  // Amounts
  amount: number;
  taxAmount: number;
  totalAmount: number;
  // Payment
  paymentMode?: string;
  paymentRef?: string;
  paidAt?: string;
}

const BRAND_COLOR: [number, number, number] = [37, 99, 235]; // Blue-600
const DARK_TEXT: [number, number, number] = [17, 24, 39];
const MID_TEXT: [number, number, number] = [107, 114, 128];
const LIGHT_BG: [number, number, number] = [243, 244, 246];

function formatINR(amount: number): string {
  return '₹' + amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(date: string): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function generateInvoicePdf(inv: InvoiceData): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;
  let y = margin;

  // ─── Header bar ───────────────────────────────────
  doc.setFillColor(...BRAND_COLOR);
  doc.rect(0, 0, pageWidth, 38, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('Bahi Khata Pro', margin, 17);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Smart Business Management Platform', margin, 24);
  doc.text('support@bahikhata.pro  |  www.bahikhata.pro', margin, 30);

  // Invoice number + status on right
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('TAX INVOICE', pageWidth - margin, 15, { align: 'right' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(inv.invoiceNumber, pageWidth - margin, 23, { align: 'right' });

  // Status badge
  const statusLabel = inv.status.toUpperCase();
  const isPaid = statusLabel === 'PAID';
  if (isPaid) {
    doc.setFillColor(16, 185, 129); // Emerald
  } else {
    doc.setFillColor(245, 158, 11); // Amber
  }
  const statusW = doc.getTextWidth(statusLabel) + 8;
  doc.roundedRect(pageWidth - margin - statusW, 26, statusW + 2, 7, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(statusLabel, pageWidth - margin - statusW + 5, 31);

  y = 48;

  // ─── Invoice meta row ─────────────────────────────
  doc.setTextColor(...MID_TEXT);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');

  const metaCols = [
    { label: 'Invoice Date', value: fmtDate(inv.invoiceDate) },
    { label: 'Due Date', value: fmtDate(inv.dueDate) },
    { label: 'Billing Cycle', value: inv.billingCycle.replace(/_/g, ' ') },
    { label: 'Payment Mode', value: inv.paymentMode || '—' },
  ];

  const colW = (pageWidth - margin * 2) / metaCols.length;
  metaCols.forEach((col, i) => {
    const x = margin + i * colW;
    doc.setTextColor(...MID_TEXT);
    doc.setFontSize(7);
    doc.text(col.label.toUpperCase(), x, y);
    doc.setTextColor(...DARK_TEXT);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(col.value, x, y + 5);
    doc.setFont('helvetica', 'normal');
  });

  y += 16;

  // ─── Bill To section ──────────────────────────────
  doc.setFillColor(...LIGHT_BG);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 28, 3, 3, 'F');

  doc.setTextColor(...BRAND_COLOR);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('BILL TO', margin + 5, y + 6);

  doc.setTextColor(...DARK_TEXT);
  doc.setFontSize(10);
  doc.text(inv.businessName, margin + 5, y + 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MID_TEXT);

  const addressParts: string[] = [];
  if (inv.businessAddress) addressParts.push(inv.businessAddress);
  const cityState = [inv.businessCity, inv.businessState, inv.businessPincode].filter(Boolean).join(', ');
  if (cityState) addressParts.push(cityState);
  if (addressParts.length) {
    doc.text(addressParts.join(' · '), margin + 5, y + 19);
  }

  const rightInfo: string[] = [];
  if (inv.businessGst) rightInfo.push(`GSTIN: ${inv.businessGst}`);
  if (inv.businessPhone) rightInfo.push(`Ph: ${inv.businessPhone}`);
  if (inv.businessEmail) rightInfo.push(inv.businessEmail);
  rightInfo.forEach((line, i) => {
    doc.text(line, pageWidth - margin - 5, y + 6 + i * 5, { align: 'right' });
  });

  y += 35;

  // ─── Subscription period ──────────────────────────
  doc.setTextColor(...BRAND_COLOR);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('SUBSCRIPTION PERIOD', margin, y);
  doc.setTextColor(...DARK_TEXT);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`${fmtDate(inv.periodStart)}  →  ${fmtDate(inv.periodEnd)}`, margin, y + 6);

  if (inv.paymentRef) {
    doc.setTextColor(...MID_TEXT);
    doc.setFontSize(8);
    doc.text(`Payment Ref: ${inv.paymentRef}`, pageWidth - margin, y + 6, { align: 'right' });
  }

  y += 14;

  // ─── Items table ──────────────────────────────────
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['#', 'Description', 'Billing Cycle', 'Amount']],
    body: [
      [
        '1',
        `${inv.planName} Plan – Subscription`,
        inv.billingCycle.replace(/_/g, ' '),
        formatINR(inv.amount),
      ],
    ],
    headStyles: {
      fillColor: BRAND_COLOR,
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: DARK_TEXT,
      cellPadding: 4,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 35, halign: 'center' },
      3: { cellWidth: 35, halign: 'right' },
    },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    theme: 'grid',
    styles: { lineColor: [229, 231, 235], lineWidth: 0.3 },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // ─── Totals box ───────────────────────────────────
  const totalsX = pageWidth - margin - 72;
  const totalsW = 72;

  doc.setFillColor(...LIGHT_BG);
  doc.roundedRect(totalsX, y, totalsW, 30, 2, 2, 'F');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MID_TEXT);

  doc.text('Subtotal:', totalsX + 4, y + 7);
  doc.setTextColor(...DARK_TEXT);
  doc.text(formatINR(inv.amount), totalsX + totalsW - 4, y + 7, { align: 'right' });

  doc.setTextColor(...MID_TEXT);
  doc.text('GST (18%):', totalsX + 4, y + 14);
  doc.setTextColor(...DARK_TEXT);
  doc.text(formatINR(inv.taxAmount), totalsX + totalsW - 4, y + 14, { align: 'right' });

  // Divider
  doc.setDrawColor(...BRAND_COLOR);
  doc.setLineWidth(0.4);
  doc.line(totalsX + 4, y + 18, totalsX + totalsW - 4, y + 18);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...BRAND_COLOR);
  doc.text('Total:', totalsX + 4, y + 25);
  doc.text(formatINR(inv.totalAmount), totalsX + totalsW - 4, y + 25, { align: 'right' });

  y += 38;

  // ─── Paid stamp (if paid) ─────────────────────────
  if (isPaid && inv.paidAt) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(16, 185, 129);
    doc.text(`✓  Payment received on ${fmtDate(inv.paidAt)}`, margin, y);
    y += 8;
  }

  // ─── Footer ───────────────────────────────────────
  const footerY = doc.internal.pageSize.getHeight() - 20;
  doc.setDrawColor(...LIGHT_BG);
  doc.setLineWidth(0.5);
  doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MID_TEXT);
  doc.text('This is a computer-generated invoice and does not require a signature.', margin, footerY);
  doc.text('Bahi Khata Pro · GST: 07AABCB1234A1ZQ · CIN: U72200DL2024PTC123456', margin, footerY + 5);
  doc.text(`Generated on ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`, pageWidth - margin, footerY + 5, { align: 'right' });

  return doc;
}

/**
 * One-click: generate + download the invoice PDF
 */
export function downloadInvoicePdf(inv: InvoiceData) {
  const doc = generateInvoicePdf(inv);
  doc.save(`${inv.invoiceNumber}.pdf`);
}

/**
 * One-click: generate + open invoice PDF in a new browser tab for preview
 */
export function previewInvoicePdf(inv: InvoiceData) {
  const doc = generateInvoicePdf(inv);
  const blobUrl = doc.output('bloburl');
  window.open(blobUrl as unknown as string, '_blank');
}
