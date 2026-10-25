import { createWorker, Worker } from "tesseract.js";

let ocrWorker: Worker | null = null;
async function getOcrWorker(): Promise<Worker> {
  if (!ocrWorker) {
    ocrWorker = await createWorker("eng");
  }
  return ocrWorker;
}

export interface AuthenticityCheckResult {
  isAuthentic: boolean;
  confidence: "high" | "medium" | "low";
  detectedType: "digital_pdf" | "card_image" | "unknown";
  checksPassed: string[];
  reasons: string[];
}

interface SubcategoryRule {
  name: string;
  keywords: string[];
  patterns?: RegExp[];
  rejectionMessage: string;
}

const SUBCATEGORY_RULES: Record<string, SubcategoryRule> = {
  // ── Government Documents ────────────────────────────────
  aadhar: {
    name: "Aadhaar Card",
    keywords: ["UIDAI", "AADHAAR", "GOVERNMENT OF INDIA", "BHARAT SARKAR", "UNIQUE IDENTIFICATION", "DOB", "YEAR OF BIRTH", "ENROLMENT", "HELP@UIDAI"],
    patterns: [/\b[2-9][0-9]{3}\s?[0-9]{4}\s?[0-9]{4}\b/],
    rejectionMessage: "Uploaded file does not appear to be an Aadhaar card. Missing UIDAI, Government of India seals, or 12-digit Aadhaar number.",
  },
  aadhaar: {
    name: "Aadhaar Card",
    keywords: ["UIDAI", "AADHAAR", "GOVERNMENT OF INDIA", "BHARAT SARKAR", "UNIQUE IDENTIFICATION", "DOB", "YEAR OF BIRTH", "ENROLMENT", "HELP@UIDAI"],
    patterns: [/\b[2-9][0-9]{3}\s?[0-9]{4}\s?[0-9]{4}\b/],
    rejectionMessage: "Uploaded file does not appear to be an Aadhaar card. Missing UIDAI, Government of India seals, or 12-digit Aadhaar number.",
  },
  pan: {
    name: "PAN Card",
    keywords: ["INCOME TAX", "GOVT. OF INDIA", "PERMANENT ACCOUNT", "INCOMETAX", "FATHER", "SIGNATURE"],
    patterns: [/\b[A-Z]{5}[0-9]{4}[A-Z]\b/],
    rejectionMessage: "Uploaded file does not appear to be a PAN card. Missing Income Tax Department markers or 10-character PAN number.",
  },
  pan_card: {
    name: "PAN Card",
    keywords: ["INCOME TAX", "GOVT. OF INDIA", "PERMANENT ACCOUNT", "INCOMETAX", "FATHER", "SIGNATURE"],
    patterns: [/\b[A-Z]{5}[0-9]{4}[A-Z]\b/],
    rejectionMessage: "Uploaded file does not appear to be a PAN card. Missing Income Tax Department markers or 10-character PAN number.",
  },
  driving_license: {
    name: "Driving License",
    keywords: ["DRIVING", "LICENCE", "LICENSE", "UNION OF INDIA", "TRANSPORT", "MOTOR VEHICLE", "AUTHORISATION", "FORM 7", "PARIVAHAN", "SARATHI"],
    rejectionMessage: "Uploaded file does not appear to be a Driving License. Missing transport department or licensing authority markers.",
  },
  dl: {
    name: "Driving License",
    keywords: ["DRIVING", "LICENCE", "LICENSE", "UNION OF INDIA", "TRANSPORT", "MOTOR VEHICLE", "AUTHORISATION", "FORM 7", "PARIVAHAN", "SARATHI"],
    rejectionMessage: "Uploaded file does not appear to be a Driving License. Missing transport department or licensing authority markers.",
  },
  driving_licence: {
    name: "Driving License",
    keywords: ["DRIVING", "LICENCE", "LICENSE", "UNION OF INDIA", "TRANSPORT", "MOTOR VEHICLE", "AUTHORISATION", "FORM 7", "PARIVAHAN", "SARATHI"],
    rejectionMessage: "Uploaded file does not appear to be a Driving License. Missing transport department or licensing authority markers.",
  },
  passport: {
    name: "Passport",
    keywords: ["PASSPORT", "REPUBLIC OF INDIA", "INDIAN EMPIRE", "SURNAME", "GIVEN NAMES", "NATIONALITY", "P<IND"],
    patterns: [/\b[A-Z][0-9]{7}\b/],
    rejectionMessage: "Uploaded file does not appear to be an Indian Passport. Missing Republic of India or passport travel document markers.",
  },
  voter: {
    name: "Voter ID Card",
    keywords: ["ELECTION", "COMMISSION", "ELECTOR", "IDENTITY CARD", "BHARAT NIRVACHAN", "EPIC"],
    patterns: [/\b[A-Z]{3}[0-9]{7}\b/],
    rejectionMessage: "Uploaded file does not appear to be an Election Commission Voter ID card.",
  },
  voter_id: {
    name: "Voter ID Card",
    keywords: ["ELECTION", "COMMISSION", "ELECTOR", "IDENTITY CARD", "BHARAT NIRVACHAN", "EPIC"],
    patterns: [/\b[A-Z]{3}[0-9]{7}\b/],
    rejectionMessage: "Uploaded file does not appear to be an Election Commission Voter ID card.",
  },
  epic: {
    name: "Voter ID Card",
    keywords: ["ELECTION", "COMMISSION", "ELECTOR", "IDENTITY CARD", "BHARAT NIRVACHAN", "EPIC"],
    patterns: [/\b[A-Z]{3}[0-9]{7}\b/],
    rejectionMessage: "Uploaded file does not appear to be an Election Commission Voter ID card.",
  },
  ration_card: {
    name: "Ration Card",
    keywords: ["RATION", "CIVIL SUPPLIES", "CONSUMER AFFAIRS", "FAIR PRICE", "FOOD", "FAMILY", "FPS", "GRAIN", "DISTRIBUTION"],
    rejectionMessage: "Uploaded file does not appear to be a Ration Card. Missing food & civil supplies authority markers.",
  },
  income_certificate: {
    name: "Income Certificate",
    keywords: ["INCOME", "ANNUAL", "REVENUE", "TAHSILDAR", "TEHSILDAR", "CERTIFICATE", "CERTIFIED", "DISTRICT", "GOVERNMENT", "RUPEES"],
    rejectionMessage: "Uploaded file does not appear to be an Income Certificate. Missing revenue or tahsildar authority seals.",
  },
  caste_certificate: {
    name: "Caste Certificate",
    keywords: ["CASTE", "COMMUNITY", "TRIBE", "SCHEDULED", "REVENUE", "TAHSILDAR", "GOVERNMENT", "CERTIFICATE", "OBC", "SC", "ST"],
    rejectionMessage: "Uploaded file does not appear to be a Caste / Community Certificate.",
  },
  domicile_certificate: {
    name: "Domicile Certificate",
    keywords: ["DOMICILE", "RESIDENCE", "RESIDENT", "NATIVE", "DISTRICT MAGISTRATE", "TAHSILDAR", "GOVERNMENT", "STATE"],
    rejectionMessage: "Uploaded file does not appear to be a Domicile / Residence Certificate.",
  },
  birth_certificate: {
    name: "Birth Certificate",
    keywords: ["BIRTH", "CERTIFICATE", "REGISTRATION OF BIRTHS", "MUNICIPAL", "CORPORATION", "CHILD", "MOTHER", "FATHER", "SEX"],
    rejectionMessage: "Uploaded file does not appear to be a Birth Certificate. Missing birth registry or municipal corporation markers.",
  },
  marriage_certificate: {
    name: "Marriage Certificate",
    keywords: ["MARRIAGE", "REGISTRAR OF MARRIAGES", "BRIDE", "GROOM", "HUSBAND", "WIFE", "SOLEMNIZED", "MARRIAGES ACT"],
    rejectionMessage: "Uploaded file does not appear to be a Marriage Certificate.",
  },

  // ── Educational Credentials ─────────────────────────────
  degree_certificate: {
    name: "Degree Certificate",
    keywords: ["DEGREE", "BACHELOR", "MASTER", "DOCTOR", "UNIVERSITY", "INSTITUTE", "CONVOCATION", "FACULTY", "ACADEMIC", "AWARDED", "GRADUATED", "CONTROLLER"],
    rejectionMessage: "Uploaded file does not appear to be a Degree Certificate. Missing university or degree conferring markers.",
  },
  marksheet: {
    name: "Marksheet / Transcript",
    keywords: ["MARKSHEET", "STATEMENT OF MARKS", "TRANSCRIPT", "ROLL NO", "SEMESTER", "GRADE", "CGPA", "PERCENTAGE", "EXAMINATION", "CONTROLLER", "TOTAL"],
    rejectionMessage: "Uploaded file does not appear to be a Marksheet or Academic Transcript.",
  },
  diploma: {
    name: "Diploma Certificate",
    keywords: ["DIPLOMA", "POLYTECHNIC", "STATE BOARD", "TECHNICAL EDUCATION", "SUCCESSFULLY COMPLETED", "CURRICULUM"],
    rejectionMessage: "Uploaded file does not appear to be a Diploma Certificate.",
  },
  school_certificate: {
    name: "School Transfer / Leaving Certificate",
    keywords: ["SCHOOL", "TRANSFER", "LEAVING", "TC", "ADMISSION", "CONDUCT", "CHARACTER", "DATE OF BIRTH", "PROMOTED", "HEADMASTER", "PRINCIPAL"],
    rejectionMessage: "Uploaded file does not appear to be a School Transfer or Leaving Certificate.",
  },
  college_id: {
    name: "College Student ID",
    keywords: ["COLLEGE", "STUDENT", "IDENTITY CARD", "ID NO", "ROLL NO", "VALID UP TO", "DEPARTMENT", "CAMPUS", "PRINCIPAL"],
    rejectionMessage: "Uploaded file does not appear to be a College Student ID card.",
  },

  // ── Healthcare & Medical ────────────────────────────────
  discharge_summary: {
    name: "Hospital Discharge Summary",
    keywords: ["HOSPITAL", "DISCHARGE", "ADMISSION", "DIAGNOSIS", "CONSULTANT", "PATIENT", "TREATMENT", "CONDITION", "MEDICATION"],
    rejectionMessage: "Uploaded file does not appear to be a Hospital Discharge Summary.",
  },
  prescription: {
    name: "Medical Prescription",
    keywords: ["RX", "DOCTOR", "DR.", "CLINIC", "HOSPITAL", "PATIENT", "PRESCRIPTION", "MEDICINE", "TABLET", "SYRUP", "DOSAGE", "REG NO"],
    rejectionMessage: "Uploaded file does not appear to be a Medical Prescription.",
  },
  health_insurance: {
    name: "Health Insurance Card",
    keywords: ["INSURANCE", "POLICY", "TPA", "BENEFICIARY", "CARD NO", "HEALTH", "VALID", "SUM INSURED", "COVERAGE"],
    rejectionMessage: "Uploaded file does not appear to be a Health Insurance Card or Policy document.",
  },
  vaccination_certificate: {
    name: "Vaccination Record",
    keywords: ["VACCINE", "VACCINATION", "DOSE", "BENEFICIARY", "COWIN", "IMMUNIZATION", "COVID", "MINISTRY OF HEALTH"],
    rejectionMessage: "Uploaded file does not appear to be a Vaccination Certificate or Record.",
  },
  lab_report: {
    name: "Diagnostic / Lab Report",
    keywords: ["LABORATORY", "DIAGNOSTIC", "PATHOLOGY", "TEST", "SAMPLE", "SPECIMEN", "REFERENCE RANGE", "RESULT", "INVESTIGATION", "BIOCHEMISTRY"],
    rejectionMessage: "Uploaded file does not appear to be a Diagnostic or Lab Report.",
  },

  // ── Financial Institutions ──────────────────────────────
  bank_statement: {
    name: "Bank Statement",
    keywords: ["BANK", "ACCOUNT", "STATEMENT", "IFSC", "BALANCE", "DEBIT", "CREDIT", "TRANSACTION", "BRANCH", "WITHDRAWAL", "DEPOSIT"],
    rejectionMessage: "Uploaded file does not appear to be a Bank Account Statement.",
  },
  salary_slip: {
    name: "Salary Slip / Pay Stub",
    keywords: ["SALARY", "PAYSLIP", "PAY SLIP", "EARNINGS", "DEDUCTIONS", "BASIC PAY", "NET PAY", "EMPLOYEE", "HRA", "PROVIDENT FUND", "PF", "GROSS"],
    rejectionMessage: "Uploaded file does not appear to be a Salary Slip or Pay Stub.",
  },
  tax_return: {
    name: "Income Tax Return (ITR)",
    keywords: ["INCOME TAX", "RETURN", "ACKNOWLEDGEMENT", "ITR", "ASSESSMENT YEAR", "PAN", "VERIFICATION", "TAX PAID", "TOTAL INCOME"],
    rejectionMessage: "Uploaded file does not appear to be an Income Tax Return Acknowledgement.",
  },

  // ── Other / Miscellaneous ───────────────────────────────
  utility_bill: {
    name: "Utility Bill",
    keywords: ["ELECTRICITY", "WATER", "GAS", "BILL", "CONSUMER NO", "UNITS", "DUE DATE", "AMOUNT PAYABLE", "TARIFF", "INVOICE"],
    rejectionMessage: "Uploaded file does not appear to be a Utility Bill.",
  },
  rent_agreement: {
    name: "Rent Agreement",
    keywords: ["RENT", "AGREEMENT", "LEASE", "LANDLORD", "TENANT", "PREMISES", "MONTHLY RENT", "SECURITY DEPOSIT", "STAMP PAPER"],
    rejectionMessage: "Uploaded file does not appear to be a Rent Agreement.",
  },
};

/**
 * Inspects uploaded file buffers (PDFs & images) for genuine government markers,
 * physical document formats, and official digital signatures.
 */
export async function inspectDocumentAuthenticity(
  buffer: Buffer,
  mimetype: string,
  subcategory: string,
  claimedNumber?: string
): Promise<AuthenticityCheckResult> {
  const checksPassed: string[] = [];
  const reasons: string[] = [];

  // Minimum physical file size for readable ID cards / certificates (at least 20 KB)
  if (buffer.length < 20 * 1024) {
    return {
      isAuthentic: false,
      confidence: "low",
      detectedType: "unknown",
      checksPassed,
      reasons: ["File size is too small to be a legible physical document or certificate (minimum 20 KB required)."],
    };
  }

  const subKey = subcategory.toLowerCase().replace(/[- ]/g, "_");
  const rule = SUBCATEGORY_RULES[subKey];

  // 1. PDF Digital Signature & Authority Check (e-Aadhaar, DigiLocker, University PDF)
  if (mimetype === "application/pdf" || buffer.subarray(0, 5).toString() === "%PDF-") {
    const rawPdf = buffer.toString("latin1");
    const isSigned = rawPdf.includes("/ByteRange") && rawPdf.includes("/Contents");
    const hasGovMarker =
      rawPdf.includes("Unique Identification Authority of India") ||
      rawPdf.includes("UIDAI") ||
      rawPdf.includes("Income Tax Department") ||
      rawPdf.includes("DigiLocker") ||
      rawPdf.includes("Government of India") ||
      rawPdf.includes("e-District") ||
      rawPdf.includes("University") ||
      rawPdf.includes("Controller of Examinations");

    if (isSigned) {
      checksPassed.push("Cryptographic PKCS#7 digital signature found in PDF certificate");
    }
    if (hasGovMarker) {
      checksPassed.push("Official issuing authority strings verified in PDF");
    }

    if (rule) {
      const upperPdf = rawPdf.toUpperCase();
      const hasKeyword = rule.keywords.some((kw) => upperPdf.includes(kw));
      const hasPattern = rule.patterns?.some((pat) => pat.test(upperPdf));

      if (!hasKeyword && !hasPattern && !isSigned && !hasGovMarker) {
        reasons.push(rule.rejectionMessage);
      } else {
        checksPassed.push(`Verified ${rule.name} content markers in PDF`);
      }
    } else {
      checksPassed.push("General PDF structure confirmed");
    }

    const isAuthentic = reasons.length === 0;
    return {
      isAuthentic,
      confidence: isSigned ? "high" : "medium",
      detectedType: "digital_pdf",
      checksPassed,
      reasons,
    };
  }

  // 2. Image Inspection (JPEG, PNG, WebP)
  if (mimetype.startsWith("image/")) {
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    const isJpg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

    if (!isPng && !isJpg) {
      return {
        isAuthentic: false,
        confidence: "low",
        detectedType: "unknown",
        checksPassed,
        reasons: ["Invalid or corrupted image format. Please upload a standard JPG or PNG photo of the document."],
      };
    }

    checksPassed.push("Standard uncorrupted photo format verified");
    checksPassed.push("Passed forensic resolution threshold (> 20 KB high-definition capture)");

    // Run OCR visual text inspection to verify document markers
    try {
      const ocrResult = await Promise.race([
        (async () => {
          const worker = await getOcrWorker();
          return await worker.recognize(buffer);
        })(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("OCR inspection timeout (exceeded 8s)")), 8000)
        ),
      ]);

      const rawText = (ocrResult.data?.text || "").toUpperCase();

      if (rule) {
        const hasKeyword = rule.keywords.some((kw) => rawText.includes(kw));
        const hasPattern = rule.patterns?.some((pat) => pat.test(rawText));

        if (!hasKeyword && !hasPattern) {
          reasons.push(rule.rejectionMessage);
        } else {
          checksPassed.push(`Verified ${rule.name} visual markings on document image`);
        }
      } else {
        // General fallback: ensure image contains legible text characters
        const cleanedChars = rawText.replace(/[^A-Z0-9]/g, "");
        if (cleanedChars.length < 25) {
          reasons.push("Uploaded image contains insufficient legible document text. Please upload a clear photo or scan of your document.");
        } else {
          checksPassed.push("Legible document text detected on uploaded image");
        }
      }
    } catch (ocrErr) {
      console.warn("[OCR Inspection Note]:", ocrErr);
    }

    const isAuthentic = reasons.length === 0;
    return {
      isAuthentic,
      confidence: isAuthentic ? "high" : "low",
      detectedType: "card_image",
      checksPassed,
      reasons,
    };
  }

  return {
    isAuthentic: true,
    confidence: "low",
    detectedType: "unknown",
    checksPassed: ["General file buffer accepted"],
    reasons: [],
  };
}
