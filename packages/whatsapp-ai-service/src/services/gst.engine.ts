// =============================================================================
// GST Computation Engine - Indian Tax Rules
// =============================================================================

export interface GSTComputationInput {
  amount: number;
  gstRate: number;
  isInterstate: boolean; // true = IGST, false = CGST+SGST
  isInclusive: boolean; // true = amount includes GST
  cess?: number;
}

export interface GSTComputationResult {
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  totalTax: number;
  totalAmount: number;
  gstRate: number;
  isInterstate: boolean;
}

export interface GSTINInfo {
  gstin: string;
  isValid: boolean;
  stateCode: string;
  stateName: string;
  panNumber: string;
  entityType: string;
  registrationType: string;
}

// Indian State Codes for GST
const STATE_CODES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
  '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
  '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
  '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
  '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam',
  '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha',
  '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra',
  '28': 'Andhra Pradesh (old)', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu',
  '34': 'Puducherry', '35': 'Andaman & Nicobar',
  '36': 'Telangana', '37': 'Andhra Pradesh (new)',
};

// Valid GST Rates
const VALID_GST_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 7.5, 12, 18, 28];

export class GSTEngine {
  // ─── Compute GST ───────────────────────────────────────────────────────────
  compute(input: GSTComputationInput): GSTComputationResult {
    let taxableAmount: number;
    let totalTax: number;

    if (input.isInclusive) {
      // Amount includes GST - reverse calculate
      taxableAmount = this.roundToTwo(input.amount / (1 + input.gstRate / 100));
      totalTax = this.roundToTwo(input.amount - taxableAmount);
    } else {
      // Amount excludes GST
      taxableAmount = input.amount;
      totalTax = this.roundToTwo(taxableAmount * input.gstRate / 100);
    }

    const cess = input.cess ? this.roundToTwo(taxableAmount * input.cess / 100) : 0;

    let cgst = 0, sgst = 0, igst = 0;

    if (input.isInterstate) {
      igst = totalTax;
    } else {
      cgst = this.roundToTwo(totalTax / 2);
      sgst = this.roundToTwo(totalTax / 2);
      // Handle rounding difference
      if (cgst + sgst !== totalTax) {
        sgst = this.roundToTwo(totalTax - cgst);
      }
    }

    return {
      taxableAmount,
      cgst,
      sgst,
      igst,
      cess,
      totalTax: totalTax + cess,
      totalAmount: this.roundToTwo(taxableAmount + totalTax + cess),
      gstRate: input.gstRate,
      isInterstate: input.isInterstate,
    };
  }

  // ─── Determine Interstate/Intrastate ───────────────────────────────────────
  isInterstate(supplierGSTIN: string, buyerGSTIN: string): boolean {
    if (!supplierGSTIN || !buyerGSTIN) return false;
    // Compare first 2 digits (state code)
    return supplierGSTIN.substring(0, 2) !== buyerGSTIN.substring(0, 2);
  }

  // ─── Validate GSTIN ────────────────────────────────────────────────────────
  validateGSTIN(gstin: string): GSTINInfo {
    const result: GSTINInfo = {
      gstin,
      isValid: false,
      stateCode: '',
      stateName: '',
      panNumber: '',
      entityType: '',
      registrationType: '',
    };

    if (!gstin || gstin.length !== 15) return result;

    // Format: [0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}
    const regex = /^([0-9]{2})([A-Z]{5})([0-9]{4})([A-Z])([1-9A-Z])(Z)([0-9A-Z])$/;
    const match = gstin.match(regex);
    if (!match) return result;

    const stateCode = match[1];
    const pan = match[2] + match[3] + match[4];
    const entityNumber = match[5];

    // Validate state code
    if (!STATE_CODES[stateCode]) return result;

    // Validate checksum
    if (!this.validateChecksum(gstin)) return result;

    result.isValid = true;
    result.stateCode = stateCode;
    result.stateName = STATE_CODES[stateCode];
    result.panNumber = pan;
    result.entityType = this.getEntityType(pan[3]);
    result.registrationType = this.getRegistrationType(entityNumber);

    return result;
  }

  // ─── HSN Code Validation ───────────────────────────────────────────────────
  validateHSNCode(hsnCode: string): { isValid: boolean; length: number; category?: string } {
    // HSN codes are 4, 6, or 8 digits
    const cleaned = hsnCode.replace(/\s+/g, '');
    if (!/^\d{4,8}$/.test(cleaned)) {
      return { isValid: false, length: cleaned.length };
    }

    return {
      isValid: true,
      length: cleaned.length,
      category: this.getHSNCategory(cleaned.substring(0, 2)),
    };
  }

  // ─── Suggest GST Rate from HSN ─────────────────────────────────────────────
  suggestGSTRate(hsnCode: string): number {
    // Common HSN-to-rate mappings for Indian businesses
    const firstTwo = hsnCode.substring(0, 2);
    
    const rateMap: Record<string, number> = {
      '01': 0, '02': 0, '03': 5, '04': 0, '05': 0,  // Food items
      '06': 0, '07': 0, '08': 0, '09': 5, '10': 5,  // Agriculture
      '11': 5, '12': 5, '13': 18, '14': 28, '15': 5, // Processed food
      '25': 5, '26': 5, '27': 18, '28': 18, '29': 18, // Minerals/Chemicals
      '39': 18, '40': 18, '44': 18, '48': 18,        // Plastics/Paper
      '52': 5, '54': 18, '61': 12, '62': 12,         // Textiles
      '68': 28, '69': 28, '70': 18, '71': 3,         // Ceramics/Glass/Gems
      '72': 18, '73': 18, '74': 18, '76': 18,        // Iron/Steel/Metals
      '84': 18, '85': 18, '87': 28, '90': 18,        // Machinery/Electronics
      '94': 18, '95': 18, '96': 18,                    // Furniture/Misc
    };

    return rateMap[firstTwo] ?? 18; // Default 18%
  }

  // ─── Monthly GST Summary ───────────────────────────────────────────────────
  computeNetPayable(
    outputTax: { cgst: number; sgst: number; igst: number },
    inputTax: { cgst: number; sgst: number; igst: number }
  ): { cgst: number; sgst: number; igst: number; total: number } {
    // ITC utilization order: IGST → CGST → SGST
    let remainingIGST = inputTax.igst;

    // First offset IGST output with IGST input
    let netIGST = outputTax.igst - remainingIGST;
    if (netIGST < 0) {
      remainingIGST = Math.abs(netIGST);
      netIGST = 0;
    } else {
      remainingIGST = 0;
    }

    // Remaining IGST input can offset CGST
    let netCGST = outputTax.cgst - inputTax.cgst - remainingIGST / 2;
    let netSGST = outputTax.sgst - inputTax.sgst - remainingIGST / 2;

    netCGST = Math.max(0, netCGST);
    netSGST = Math.max(0, netSGST);

    return {
      cgst: this.roundToTwo(netCGST),
      sgst: this.roundToTwo(netSGST),
      igst: this.roundToTwo(netIGST),
      total: this.roundToTwo(netCGST + netSGST + netIGST),
    };
  }

  // ─── Reverse Charge Mechanism Check ────────────────────────────────────────
  isReverseCharge(serviceType: string, supplierType: string): boolean {
    // Common RCM scenarios in India
    const rcmServices = [
      'legal', 'advocate', 'transport', 'gta',
      'sponsorship', 'government', 'import',
      'director', 'insurance', 'security',
    ];
    
    if (rcmServices.some(s => serviceType.toLowerCase().includes(s))) {
      return true;
    }

    // Unregistered supplier for specified services
    if (supplierType === 'unregistered') {
      return true; // Simplified - actual rules are more complex
    }

    return false;
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private validateChecksum(gstin: string): boolean {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let sum = 0;

    for (let i = 0; i < 14; i++) {
      const charIndex = chars.indexOf(gstin[i]);
      const product = charIndex * ((i % 2 === 0) ? 1 : 2);
      sum += Math.floor(product / 36) + (product % 36);
    }

    const checkDigit = (36 - (sum % 36)) % 36;
    return chars[checkDigit] === gstin[14];
  }

  private getEntityType(fourthChar: string): string {
    const types: Record<string, string> = {
      'C': 'Company', 'P': 'Individual', 'H': 'HUF',
      'F': 'Firm', 'A': 'AOP/BOI', 'T': 'Trust',
      'B': 'BOI', 'L': 'Local Authority', 'J': 'Artificial Juridical Person',
      'G': 'Government',
    };
    return types[fourthChar] || 'Unknown';
  }

  private getRegistrationType(entityNumber: string): string {
    const num = parseInt(entityNumber);
    if (!isNaN(num) && num >= 1 && num <= 9) return 'Normal Taxpayer';
    if (entityNumber === 'Z') return 'SEZ';
    return 'Other';
  }

  private getHSNCategory(firstTwo: string): string {
    const categories: Record<string, string> = {
      '01': 'Live Animals', '02': 'Meat', '03': 'Fish',
      '04': 'Dairy', '05': 'Animal Products', '06': 'Live Trees',
      '07': 'Vegetables', '08': 'Fruits', '09': 'Spices',
      '10': 'Cereals', '11': 'Flour', '12': 'Oil Seeds',
      '25': 'Salt/Sulphur/Earth', '27': 'Mineral Fuels',
      '28': 'Chemicals', '30': 'Pharma', '39': 'Plastics',
      '44': 'Wood', '48': 'Paper', '52': 'Cotton',
      '61': 'Knitted Apparel', '62': 'Woven Apparel',
      '72': 'Iron/Steel', '73': 'Articles of Iron/Steel',
      '84': 'Machinery', '85': 'Electronics', '87': 'Vehicles',
    };
    return categories[firstTwo] || 'General';
  }

  private roundToTwo(num: number): number {
    return Math.round(num * 100) / 100;
  }
}

export const gstEngine = new GSTEngine();
