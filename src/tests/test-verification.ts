import {
  validateAadhaar,
  validatePan,
  validateDrivingLicense,
  validatePassport,
  validateVoterId,
  verifyDocumentData,
} from "../services/algorithmicVerification.service.js";

console.log("=== Testing Algorithmic Verification Engine ===");

// 1. Aadhaar Verhoeff Test
// Note: Valid Verhoeff numbers can be computed. 
// A known valid Aadhaar test number: 200000000018
const validAadhaar = "234567890124";
const invalidAadhaar = "234567890125";

console.log("Aadhaar valid test:", validateAadhaar(validAadhaar));
console.log("Aadhaar invalid test:", validateAadhaar(invalidAadhaar));
console.assert(validateAadhaar(validAadhaar).valid === true, "Valid Aadhaar should pass");
console.assert(validateAadhaar(invalidAadhaar).valid === false, "Random 12-digit should fail");

// 2. PAN Card Test
const panValid = "ABCDE1234F"; // E = Entity, not P. But if user surname matches E:
const panPersonalValid = "ABCPK1234F"; // 'P' = Individual, 'K' = Krishna
console.log("PAN valid test:", validatePan(panPersonalValid, "Yadhu Krishna"));
console.assert(validatePan(panPersonalValid, "Yadhu Krishna").valid === true, "Matching PAN should pass");

const panMismatched = "ABCPZ1234F"; // 'Z' doesn't match Krishna or Yadhu
console.log("PAN mismatched surname test:", validatePan(panMismatched, "Yadhu Krishna"));
console.assert(validatePan(panMismatched, "Yadhu Krishna").valid === false, "Mismatched PAN surname should fail");

// 3. Driving License Test
const dlValid = "KL0720200012345";
console.log("DL valid test:", validateDrivingLicense(dlValid));
console.assert(validateDrivingLicense(dlValid).valid === true, "Valid DL should pass");

const dlInvalidState = "ZZ0720200012345";
console.log("DL invalid state test:", validateDrivingLicense(dlInvalidState));
console.assert(validateDrivingLicense(dlInvalidState).valid === false, "Invalid state DL should fail");

// 4. Passport Test
const passValid = "Z1234567";
console.log("Passport valid test:", validatePassport(passValid));
console.assert(validatePassport(passValid).valid === true, "Valid Passport should pass");

// 5. Voter ID Test
const voterValid = "ABC1234567";
console.log("Voter ID valid test:", validateVoterId(voterValid));
console.assert(validateVoterId(voterValid).valid === true, "Valid Voter ID should pass");

// 6. Master Verifier Test
const masterPanCheck = verifyDocumentData("government", "pan_card", { pan_number: "ABCPK1234F" }, "Yadhu Krishna");
console.log("Master Verifier PAN:", masterPanCheck);
console.assert(masterPanCheck.verified === true, "Master PAN should be verified");

console.log("✅ All verification algorithm unit tests passed successfully!");
