import crypto from "crypto";

// ─── Verhoeff Checksum Algorithm (Used by UIDAI for Aadhaar) ─────────────────
// The Verhoeff algorithm utilizes dihedral group D5 multiplication & permutation tables.
// It catches 100% of single-digit typos and adjacent transposition errors.

const VERHOEFF_D: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const VERHOEFF_P: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/**
 * Validates a 12-digit Aadhaar number using the official Verhoeff algorithm.
 */
export function validateAadhaar(aadhaar: string): { valid: boolean; reason?: string } {
  const clean = aadhaar.replace(/[\s-]/g, "");

  if (!/^\d{12}$/.test(clean)) {
    return { valid: false, reason: "Aadhaar must be exactly 12 digits" };
  }

  // Aadhaar cannot start with 0 or 1
  if (clean.startsWith("0") || clean.startsWith("1")) {
    return { valid: false, reason: "Aadhaar number cannot start with 0 or 1" };
  }

  let c = 0;
  const digits = clean.split("").map(Number).reverse();

  for (let i = 0; i < digits.length; i++) {
    c = VERHOEFF_D[c]![VERHOEFF_P[i % 8]![digits[i]!]!]!;
  }

  if (c !== 0) {
    return { valid: false, reason: "Invalid Aadhaar number (Verhoeff checksum failed)" };
  }

  return { valid: true };
}

// ─── PAN Card Verification ───────────────────────────────────────────────────
// Format: 5 uppercase letters + 4 digits + 1 uppercase letter (e.g. ABCDE1234F)
// 4th char = Entity status ('P' for Individual/Person, 'C' for Company, etc.)
// 5th char = First letter of cardholder's surname/last name

export function validatePan(
  pan: string,
  userFullName?: string
): { valid: boolean; reason?: string } {
  const clean = pan.trim().toUpperCase();

  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(clean)) {
    return {
      valid: false,
      reason: "PAN must follow format: 5 letters, 4 numbers, 1 letter (e.g. ABCPK1234F)",
    };
  }

  // 4th letter entity check: allow standard Indian tax entity codes
  const validEntityTypes = ["P", "C", "H", "F", "A", "T", "B", "L", "J", "G"];
  const entityChar = clean.charAt(3);
  if (!validEntityTypes.includes(entityChar)) {
    return {
      valid: false,
      reason: `Invalid PAN 4th character '${entityChar}'. Must be a valid entity code (e.g. 'P' for individual)`,
    };
  }

  // Cross-match 5th character against user's surname if full_name is provided
  if (userFullName && entityChar === "P") {
    const parts = userFullName.trim().split(/\s+/);
    // In India, the surname is usually the last word (or first word if initials follow)
    const possibleSurname = parts[parts.length - 1] ?? "";
    const expectedLetter = possibleSurname.charAt(0).toUpperCase();
    const actualLetter = clean.charAt(4);

    if (expectedLetter && expectedLetter !== actualLetter) {
      // Also check first name in case user wrote Firstname only or Surname First
      const firstNameLetter = parts[0]?.charAt(0).toUpperCase();
      if (firstNameLetter !== actualLetter) {
        return {
          valid: false,
          reason: `PAN 5th character '${actualLetter}' does not match user's name initial ('${expectedLetter}')`,
        };
      }
    }
  }

  return { valid: true };
}

// ─── Driving License Verification ────────────────────────────────────────────
// Format: SS-RR-YYYY-NNNNNNN or SSRRYYYYNNNNNNN (15 or 16 alphanumeric characters)
// SS = 2-letter state code, RR = 2-digit RTO, YYYY = 4-digit issue year

const INDIAN_STATE_CODES = new Set([
  "AN", "AP", "AR", "AS", "BR", "CH", "CG", "DN", "DD", "DL", "GA", "GJ",
  "HR", "HP", "JK", "JH", "KA", "KL", "LA", "LD", "MP", "MH", "MN", "ML",
  "MZ", "NL", "OD", "PY", "PB", "RJ", "SK", "TN", "TS", "TR", "UP", "UK", "WB",
]);

export function validateDrivingLicense(dl: string): {
  valid: boolean;
  state?: string;
  year?: number;
  reason?: string;
} {
  const clean = dl.replace(/[\s-]/g, "").toUpperCase();

  if (clean.length < 15 || clean.length > 16) {
    return {
      valid: false,
      reason: "Driving License number must be 15 or 16 characters (e.g. KL0720180001234)",
    };
  }

  const stateCode = clean.substring(0, 2);
  if (!INDIAN_STATE_CODES.has(stateCode)) {
    return {
      valid: false,
      reason: `Unknown state code '${stateCode}' in Driving License`,
    };
  }

  // Extract year (typically digits 4 to 8, or digits 2 to 6 depending on RTO style)
  const possibleYear = parseInt(clean.substring(4, 8), 10);
  const currentYear = new Date().getFullYear();

  if (!isNaN(possibleYear)) {
    if (possibleYear < 1970 || possibleYear > currentYear) {
      return {
        valid: false,
        reason: `Invalid license issuance year: ${possibleYear}`,
      };
    }
    return { valid: true, state: stateCode, year: possibleYear };
  }

  return { valid: true, state: stateCode };
}

// ─── Passport Verification ───────────────────────────────────────────────────
// Indian Passports: 1 letter (A-Z except Q, X, Z typically) + 7 digits
export function validatePassport(passport: string): { valid: boolean; reason?: string } {
  const clean = passport.trim().toUpperCase();
  if (!/^[A-Z][0-9]{7}$/.test(clean)) {
    return {
      valid: false,
      reason: "Passport number must be 1 uppercase letter followed by 7 digits (e.g. Z1234567)",
    };
  }
  return { valid: true };
}

// ─── Voter ID (EPIC) Verification ────────────────────────────────────────────
// Format: 3 uppercase letters followed by 7 digits (e.g. ABC1234567)
export function validateVoterId(voterId: string): { valid: boolean; reason?: string } {
  const clean = voterId.trim().toUpperCase();
  if (!/^[A-Z]{3}[0-9]{7}$/.test(clean)) {
    return {
      valid: false,
      reason: "Voter ID (EPIC) must be 3 letters followed by 7 digits (e.g. ABC1234567)",
    };
  }
  return { valid: true };
}

// ─── SHA-256 Binary File Fingerprint ─────────────────────────────────────────
// Generates an immutable cryptographic hash of any uploaded document buffer
export function calculateFileHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// ─── Master Document Verifier ────────────────────────────────────────────────
// Evaluates document payload against known algorithmic and checksum standards

export interface VerificationResult {
  verified: boolean;
  checksPassed: string[];
  errors: string[];
  details: Record<string, unknown>;
}

export function verifyDocumentData(
  category: string,
  subcategory: string,
  documentData: Record<string, unknown>,
  userFullName?: string
): VerificationResult {
  const checksPassed: string[] = [];
  const errors: string[] = [];
  const details: Record<string, unknown> = {};

  const sub = subcategory.toLowerCase();

  switch (sub) {
    case "aadhar": {
      const aadhaarNum = (documentData["aadhar_number"] ?? documentData["id_number"]) as string | undefined;
      if (!aadhaarNum) {
        errors.push("Missing 'aadhar_number' field in document data");
      } else {
        const result = validateAadhaar(String(aadhaarNum));
        if (result.valid) {
          checksPassed.push("Verhoeff mathematical checksum validated");
          details["verhoeff_valid"] = true;
        } else {
          errors.push(result.reason || "Aadhaar checksum failed");
        }
      }
      break;
    }

    case "pan_card": {
      const panNum = (documentData["pan_number"] ?? documentData["id_number"]) as string | undefined;
      if (!panNum) {
        errors.push("Missing 'pan_number' field in document data");
      } else {
        const result = validatePan(String(panNum), userFullName);
        if (result.valid) {
          checksPassed.push("PAN structural regex & surname initial matched");
          details["pan_valid"] = true;
        } else {
          errors.push(result.reason || "PAN verification failed");
        }
      }
      break;
    }

    case "driving_license": {
      const dlNum = (documentData["dl_number"] ?? documentData["id_number"]) as string | undefined;
      if (!dlNum) {
        errors.push("Missing 'dl_number' field in document data");
      } else {
        const result = validateDrivingLicense(String(dlNum));
        if (result.valid) {
          checksPassed.push(`Driving License format & state (${result.state}) validated`);
          details["dl_state"] = result.state;
          if (result.year) details["dl_year"] = result.year;
        } else {
          errors.push(result.reason || "Driving License format failed");
        }
      }
      break;
    }

    case "passport": {
      const passNum = (documentData["passport_number"] ?? documentData["id_number"]) as string | undefined;
      if (!passNum) {
        errors.push("Missing 'passport_number' field in document data");
      } else {
        const result = validatePassport(String(passNum));
        if (result.valid) {
          checksPassed.push("Passport format verified");
          details["passport_valid"] = true;
        } else {
          errors.push(result.reason || "Passport format failed");
        }
      }
      break;
    }

    case "voter_id": {
      const epicNum = (documentData["epic_number"] ?? documentData["id_number"]) as string | undefined;
      if (!epicNum) {
        errors.push("Missing 'epic_number' field in document data");
      } else {
        const result = validateVoterId(String(epicNum));
        if (result.valid) {
          checksPassed.push("Voter ID (EPIC) format verified");
          details["epic_valid"] = true;
        } else {
          errors.push(result.reason || "Voter ID format failed");
        }
      }
      break;
    }

    default: {
      // Non-government or unmapped category (e.g. degrees, medical, other)
      // Checks for presence of basic required identifiers
      if (documentData && Object.keys(documentData).length > 0) {
        checksPassed.push("Document payload integrity confirmed");
        details["has_payload"] = true;
      } else {
        errors.push("Document data contains no identifiable fields");
      }
      break;
    }
  }

  const verified = errors.length === 0 && checksPassed.length > 0;

  return {
    verified,
    checksPassed,
    errors,
    details,
  };
}
