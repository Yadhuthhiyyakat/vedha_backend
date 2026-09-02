// ─── Document Taxonomy & Category Definitions ────────────────────────────────

export interface SubcategoryConfig {
  id: string;
  name: string;
  description?: string;
  required_fields?: string[];
}

export interface CategoryConfig {
  id: string;
  name: string;
  description: string;
  subcategories: SubcategoryConfig[];
}

export const DOCUMENT_CATEGORIES: CategoryConfig[] = [
  {
    id: "government",
    name: "Government Documents",
    description: "Official identification, certificates, and government-issued cards",
    subcategories: [
      { id: "aadhar", name: "Aadhar Card", required_fields: ["aadhar_number", "dob"] },
      { id: "ration_card", name: "Ration Card", required_fields: ["ration_card_number", "family_head"] },
      { id: "pan_card", name: "PAN Card", required_fields: ["pan_number"] },
      { id: "income_certificate", name: "Income Certificate", required_fields: ["annual_income", "certificate_number", "issuing_authority"] },
      { id: "caste_certificate", name: "Caste / Community Certificate" },
      { id: "domicile_certificate", name: "Domicile / Residence Certificate" },
      { id: "birth_certificate", name: "Birth Certificate" },
      { id: "marriage_certificate", name: "Marriage Certificate" },
      { id: "passport", name: "Passport", required_fields: ["passport_number", "expiry_date"] },
      { id: "driving_license", name: "Driving License", required_fields: ["dl_number", "valid_till"] },
      { id: "voter_id", name: "Voter ID Card", required_fields: ["epic_number"] },
    ],
  },
  {
    id: "educational_institution",
    name: "Educational Institutions",
    description: "Academic credentials, school, college, and degree certificates",
    subcategories: [
      { id: "school_certificate", name: "School Leaving / Transfer Certificate" },
      { id: "college_id", name: "College Student ID" },
      { id: "degree_certificate", name: "Degree Certificate" },
      { id: "marksheet", name: "Marksheet / Transcript" },
      { id: "diploma", name: "Diploma Certificate" },
    ],
  },
  {
    id: "medical_institution",
    name: "Healthcare & Hospitals",
    description: "Medical records, prescriptions, hospital discharge summaries",
    subcategories: [
      { id: "discharge_summary", name: "Hospital Discharge Summary" },
      { id: "prescription", name: "Medical Prescription" },
      { id: "health_insurance", name: "Health Insurance Card / Policy" },
      { id: "vaccination_certificate", name: "Vaccination Record" },
      { id: "lab_report", name: "Diagnostic / Lab Report" },
    ],
  },
  {
    id: "financial_institution",
    name: "Financial Institutions",
    description: "Bank statements, tax records, income certificates, and pay stubs",
    subcategories: [
      { id: "income_certificate", name: "Income Certificate" },
      { id: "bank_statement", name: "Bank Account Statement" },
      { id: "salary_slip", name: "Salary Slip / Pay Stub" },
      { id: "tax_return", name: "ITR / Tax Return Acknowledgement" },
    ],
  },
  {
    id: "other",
    name: "Other Documents",
    description: "Miscellaneous personal or business documents",
    subcategories: [
      { id: "utility_bill", name: "Utility Bill (Electricity/Water/Gas)" },
      { id: "rent_agreement", name: "Rent Agreement" },
      { id: "general", name: "General Document" },
    ],
  },
];

// List of all valid category IDs for validation
export const VALID_CATEGORY_IDS = DOCUMENT_CATEGORIES.map((c) => c.id);

// Map of category ID to array of valid subcategory IDs
export const VALID_SUBCATEGORIES_MAP: Record<string, string[]> = DOCUMENT_CATEGORIES.reduce(
  (acc, cat) => {
    acc[cat.id] = cat.subcategories.map((sub) => sub.id);
    return acc;
  },
  {} as Record<string, string[]>
);
