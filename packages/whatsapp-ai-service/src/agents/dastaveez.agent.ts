// =============================================================================
// Dastaveez Agent - Document Processing (Azure AI Document Intelligence)
// =============================================================================

import {
  WhatsAppMessage,
  DocumentExtractionResult,
  DocumentType,
  LineItem,
  TaxBreakdown,
} from '../types';
import { WhatsAppClient } from '../services/whatsapp-client';
import { config } from '../config';
import axios from 'axios';

export class DastaveezAgent {
  private whatsappClient: WhatsAppClient;

  constructor() {
    this.whatsappClient = new WhatsAppClient();
  }

  // ─── Process Document from WhatsApp Message ────────────────────────────────
  async processDocument(
    message: WhatsAppMessage,
    tenantId: string
  ): Promise<DocumentExtractionResult> {
    let mediaBuffer: Buffer;
    let mimeType: string;

    // Download media from WhatsApp
    switch (message.type) {
      case 'image':
        mediaBuffer = await this.whatsappClient.downloadMedia(message.image!.id);
        mimeType = message.image!.mime_type;
        break;
      case 'document':
        mediaBuffer = await this.whatsappClient.downloadMedia(message.document!.id);
        mimeType = message.document!.mime_type;
        break;
      case 'audio':
        return this.processAudio(message, tenantId);
      default:
        throw new Error(`Unsupported media type: ${message.type}`);
    }

    // Determine document type from content
    const documentType = await this.classifyDocument(mediaBuffer, mimeType);

    // Process based on document type
    switch (documentType) {
      case 'UPI_SCREENSHOT':
        return this.processUPIScreenshot(mediaBuffer, mimeType, tenantId);
      case 'PURCHASE_BILL':
      case 'SALES_INVOICE':
      case 'EXPENSE_RECEIPT':
        return this.processInvoice(mediaBuffer, mimeType, documentType, tenantId);
      default:
        return this.processGenericDocument(mediaBuffer, mimeType, tenantId);
    }
  }

  // ─── Classify Document Type ────────────────────────────────────────────────
  private async classifyDocument(buffer: Buffer, mimeType: string): Promise<DocumentType> {
    // Use Azure Document Intelligence or GPT-4o Vision to classify
    try {
      const endpoint = config.azure.documentIntelligence.endpoint;
      const apiKey = config.azure.documentIntelligence.apiKey;

      if (!endpoint || !apiKey) {
        // Fallback: Use basic heuristics
        return 'UNKNOWN';
      }

      // Use prebuilt-invoice model to check if it's an invoice
      const response = await axios.post(
        `${endpoint}/documentintelligence/documentClassifiers/prebuilt-layout:analyze?api-version=2024-02-29-preview`,
        buffer,
        {
          headers: {
            'Ocp-Apim-Subscription-Key': apiKey,
            'Content-Type': mimeType,
          },
        }
      );

      // Parse the classification result
      const resultUrl = response.headers['operation-location'];
      if (resultUrl) {
        // Poll for result
        const result = await this.pollForResult(resultUrl, apiKey);
        return this.mapToDocumentType(result);
      }

      return 'UNKNOWN';
    } catch (error) {
      console.error('Document classification error:', error);
      return 'UNKNOWN';
    }
  }

  // ─── Process UPI Screenshot ────────────────────────────────────────────────
  private async processUPIScreenshot(
    buffer: Buffer,
    mimeType: string,
    tenantId: string
  ): Promise<DocumentExtractionResult> {
    // Use GPT-4o Vision for UPI screenshot extraction
    const base64Image = buffer.toString('base64');

    const extractionPrompt = `Analyze this UPI payment screenshot and extract:
1. Amount (₹)
2. UPI Reference/Transaction ID
3. Date and Time
4. Sender name/UPI ID
5. Receiver name/UPI ID
6. Payment status (Success/Failed/Pending)
7. Payment app (PhonePe/GPay/Paytm/BHIM/Other)

Respond in JSON:
{
  "amount": number,
  "upiReference": "string",
  "date": "DD/MM/YYYY",
  "time": "HH:MM",
  "senderName": "string",
  "receiverName": "string",
  "status": "SUCCESS|FAILED|PENDING",
  "app": "string"
}`;

    try {
      const { AzureOpenAIService } = await import('../services/azure-openai.service');
      const openai = new AzureOpenAIService();
      
      const result = await openai.chatCompletionWithVision(
        extractionPrompt,
        `data:${mimeType};base64,${base64Image}`
      );

      const parsed = JSON.parse(result);

      return {
        documentType: 'UPI_SCREENSHOT',
        confidence: 0.9,
        extractedData: {
          partyName: parsed.receiverName,
          totalAmount: parsed.amount,
          date: parsed.date,
          upiReference: parsed.upiReference,
          paymentStatus: parsed.status,
        },
        rawOcrText: result,
        blobUrl: '', // Will be set after upload
      };
    } catch (error) {
      console.error('UPI screenshot processing error:', error);
      return this.createEmptyResult('UPI_SCREENSHOT');
    }
  }

  // ─── Process Invoice/Bill ──────────────────────────────────────────────────
  private async processInvoice(
    buffer: Buffer,
    mimeType: string,
    documentType: DocumentType,
    tenantId: string
  ): Promise<DocumentExtractionResult> {
    try {
      const endpoint = config.azure.documentIntelligence.endpoint;
      const apiKey = config.azure.documentIntelligence.apiKey;

      if (!endpoint || !apiKey) {
        // Use GPT-4o Vision as fallback
        return this.processWithVision(buffer, mimeType, documentType, tenantId);
      }

      // Use Azure Document Intelligence - prebuilt-invoice
      const response = await axios.post(
        `${endpoint}/documentintelligence/documentModels/prebuilt-invoice:analyze?api-version=2024-02-29-preview`,
        buffer,
        {
          headers: {
            'Ocp-Apim-Subscription-Key': apiKey,
            'Content-Type': mimeType,
          },
        }
      );

      const resultUrl = response.headers['operation-location'];
      if (!resultUrl) throw new Error('No operation-location header');

      const result = await this.pollForResult(resultUrl, apiKey);
      return this.parseInvoiceResult(result, documentType);
    } catch (error) {
      console.error('Invoice processing error:', error);
      return this.processWithVision(buffer, mimeType, documentType, tenantId);
    }
  }

  // ─── Process with GPT-4o Vision (Fallback) ─────────────────────────────────
  private async processWithVision(
    buffer: Buffer,
    mimeType: string,
    documentType: DocumentType,
    _tenantId: string
  ): Promise<DocumentExtractionResult> {
    const base64Image = buffer.toString('base64');

    const prompt = `Analyze this Indian business document (bill/invoice/receipt) and extract ALL information:

1. Party/Vendor/Customer Name
2. Bill/Invoice Number
3. Date (in DD/MM/YYYY format)
4. GSTIN (15-digit GST number if visible)
5. HSN/SAC codes
6. Line items (description, quantity, unit, rate, amount)
7. Tax breakdown (CGST, SGST, IGST amounts and rates)
8. Total Amount
9. Payment terms
10. Bank details if visible

Handle: Thermal receipts, handwritten bills (kachchi parchi), rotated images, blurry photos.
Understand Hindi text on bills.

Respond in JSON:
{
  "partyName": "string",
  "billNumber": "string",
  "date": "DD/MM/YYYY",
  "gstin": "string or null",
  "hsnCodes": ["string"],
  "lineItems": [{"description": "string", "quantity": number, "unit": "string", "rate": number, "amount": number, "hsnCode": "string", "gstRate": number}],
  "taxBreakdown": {"cgst": number, "sgst": number, "igst": number, "totalTax": number, "taxRate": number, "isInterstate": boolean},
  "totalAmount": number,
  "paymentTerms": "string or null",
  "bankDetails": {"accountNumber": "string", "ifscCode": "string", "bankName": "string"} or null
}`;

    try {
      const { AzureOpenAIService } = await import('../services/azure-openai.service');
      const openai = new AzureOpenAIService();
      
      const result = await openai.chatCompletionWithVision(
        prompt,
        `data:${mimeType};base64,${base64Image}`
      );

      const parsed = JSON.parse(result);

      return {
        documentType,
        confidence: 0.85,
        extractedData: {
          partyName: parsed.partyName,
          billNumber: parsed.billNumber,
          date: parsed.date,
          gstin: parsed.gstin,
          hsnCodes: parsed.hsnCodes,
          lineItems: parsed.lineItems,
          taxBreakdown: parsed.taxBreakdown,
          totalAmount: parsed.totalAmount,
          paymentTerms: parsed.paymentTerms,
          bankDetails: parsed.bankDetails,
        },
        rawOcrText: result,
        blobUrl: '',
      };
    } catch (error) {
      console.error('Vision processing error:', error);
      return this.createEmptyResult(documentType);
    }
  }

  // ─── Process Audio (Voice Notes) ───────────────────────────────────────────
  private async processAudio(
    message: WhatsAppMessage,
    tenantId: string
  ): Promise<DocumentExtractionResult> {
    try {
      // Download audio
      const audioBuffer = await this.whatsappClient.downloadMedia(message.audio!.id);

      // Transcribe using Azure Speech Services
      const { SpeechService } = await import('../services/speech.service');
      const speechService = new SpeechService();
      const transcription = await speechService.transcribeAudio(audioBuffer, message.audio!.mime_type);

      console.log(`🎤 Transcription: "${transcription}"`);

      return {
        documentType: 'UNKNOWN',
        confidence: 0.8,
        extractedData: {},
        rawOcrText: transcription,
        blobUrl: '',
      };
    } catch (error) {
      console.error('Audio processing error:', error);
      return this.createEmptyResult('UNKNOWN');
    }
  }

  // ─── Helper Methods ────────────────────────────────────────────────────────

  private async pollForResult(url: string, apiKey: string, maxRetries = 10): Promise<any> {
    for (let i = 0; i < maxRetries; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const response = await axios.get(url, {
        headers: { 'Ocp-Apim-Subscription-Key': apiKey },
      });

      if (response.data.status === 'succeeded') {
        return response.data.analyzeResult;
      } else if (response.data.status === 'failed') {
        throw new Error('Document analysis failed');
      }
    }
    throw new Error('Document analysis timed out');
  }

  private mapToDocumentType(result: any): DocumentType {
    // Heuristic-based classification from OCR text
    const text = (result?.content || '').toLowerCase();
    
    if (text.includes('upi') || text.includes('transaction successful') || text.includes('paid to')) {
      return 'UPI_SCREENSHOT';
    }
    if (text.includes('tax invoice') || text.includes('gst') || text.includes('gstin')) {
      if (text.includes('purchase') || text.includes('supplier')) return 'PURCHASE_BILL';
      return 'SALES_INVOICE';
    }
    if (text.includes('delivery challan')) return 'DELIVERY_CHALLAN';
    if (text.includes('credit note')) return 'CREDIT_NOTE';
    if (text.includes('debit note')) return 'DEBIT_NOTE';
    
    return 'PURCHASE_BILL'; // Default for business context
  }

  private parseInvoiceResult(result: any, documentType: DocumentType): DocumentExtractionResult {
    const invoice = result?.documents?.[0]?.fields || {};

    const lineItems: LineItem[] = (invoice.Items?.values || []).map((item: any) => ({
      description: item.values?.Description?.content || '',
      quantity: item.values?.Quantity?.value,
      unit: item.values?.Unit?.content,
      rate: item.values?.UnitPrice?.value,
      amount: item.values?.Amount?.value || 0,
    }));

    return {
      documentType,
      confidence: 0.9,
      extractedData: {
        partyName: invoice.VendorName?.content || invoice.CustomerName?.content,
        billNumber: invoice.InvoiceId?.content,
        date: invoice.InvoiceDate?.content,
        gstin: this.extractGSTIN(result?.content || ''),
        totalAmount: invoice.InvoiceTotal?.value,
        lineItems,
        taxBreakdown: this.extractTaxFromContent(result?.content || ''),
      },
      rawOcrText: result?.content || '',
      blobUrl: '',
    };
  }

  private extractGSTIN(text: string): string | undefined {
    const match = text.match(/[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]/);
    return match?.[0];
  }

  private extractTaxFromContent(text: string): TaxBreakdown | undefined {
    const cgstMatch = text.match(/cgst[:\s]*(?:₹|rs\.?)?\s*([\d,.]+)/i);
    const sgstMatch = text.match(/sgst[:\s]*(?:₹|rs\.?)?\s*([\d,.]+)/i);
    const igstMatch = text.match(/igst[:\s]*(?:₹|rs\.?)?\s*([\d,.]+)/i);

    if (!cgstMatch && !sgstMatch && !igstMatch) return undefined;

    const cgst = cgstMatch ? parseFloat(cgstMatch[1].replace(/,/g, '')) : 0;
    const sgst = sgstMatch ? parseFloat(sgstMatch[1].replace(/,/g, '')) : 0;
    const igst = igstMatch ? parseFloat(igstMatch[1].replace(/,/g, '')) : 0;

    return {
      cgst,
      sgst,
      igst,
      totalTax: cgst + sgst + igst,
      taxRate: 0, // Will be computed
      isInterstate: igst > 0,
    };
  }

  private processGenericDocument(
    buffer: Buffer,
    mimeType: string,
    tenantId: string
  ): Promise<DocumentExtractionResult> {
    return this.processWithVision(buffer, mimeType, 'UNKNOWN', tenantId);
  }

  private createEmptyResult(documentType: DocumentType): DocumentExtractionResult {
    return {
      documentType,
      confidence: 0,
      extractedData: {},
      rawOcrText: '',
      blobUrl: '',
    };
  }
}
