# Prototype test results

The full suite passed **43 checks**. The 15 advisor scenarios and all 12 original KYC specimens passed. The portable suite passed 30 checks and skips the image suite until the dataset is imported.

Reproduce the quote and case API tests with `npm test`. Import the contestant dataset and set `CASE_DATA_DIR` to run the original KYC images. The 15 advisor scenarios below were authored for regression coverage. KYC expectations were inferred independently from the contestant specimens and mock registries. The organizers reserve their scenario list and answer key for judges.

## Advisor scenarios

Every selected SKU passes the catalogue eligibility and dependency checks. All 25 SKUs are selected at least once across the 15 scenarios. Quantities are shown only when greater than one. Prices are pre-tax catalogue floors.

| # | Scenario | Bundle | Monthly | Setup | Gap | Route |
| ---: | --- | --- | ---: | ---: | ---: | --- |
| 1 | Delhi retail and POS | P01, P07, P19 | ₹1,897 | ₹2,500 | ₹0 | Self-serve |
| 2 | Jaipur clinic with failover | P02, P09, P16 × 3, P20 × 3 | ₹2,670 | ₹1,500 | ₹0 | Self-serve |
| 3 | Mumbai gigabit with static IP | P03, P11 | ₹4,199 | ₹0 | ₹0 | Self-serve, provisional |
| 4 | Jaipur retail with Wi-Fi and CCTV | P02, P07, P22, P23 | ₹2,396 | ₹2,800 | ₹0 | Self-serve, provisional |
| 5 | Factory with leased line, firewall and IoT | P05, P09, P21, P24 × 3 | ₹10,945 | ₹24,500 | ₹0 | Self-serve, provisional |
| 6 | Large two-site factory | P06 × 2, P09 × 2, P24 × 3 | ₹51,445 | ₹42,000 | ₹0 | Self-serve |
| 7 | Wireless shop with fibre-only needs | P04, P07 | ₹1,198 | ₹0 | ₹0 | Self-serve |
| 8 | Unknown PIN and budget step-down | P01 | ₹999 | ₹0 | ₹0 | Self-serve, provisional |
| 9 | Messaging without GSTIN | P02, P18 | ₹1,798 | ₹0 | ₹0 | Self-serve |
| 10 | Active GSTIN and communications | P02, P12, P13, P14, P15 | ₹6,498 | ₹3,000 | ₹0 | Self-serve |
| 11 | Three-site access, failover and SD-WAN | P05 × 3, P09 × 3, P10 × 3, P21 × 3 | ₹38,994 | ₹61,500 | ₹0 | Self-serve |
| 12 | Two sites with a central network request | P03 × 2, P09 × 2 | ₹8,996 | ₹3,000 | ₹0 | Self-serve |
| 13 | Fleet, premium SIM, website and cloud backup | P02, P08, P17, P18, P25 × 4 | ₹3,692 | ₹6,000 | ₹0 | Self-serve |
| 14 | Known PIN with no supported access | — | — | — | — | Site survey |
| 15 | Four sites with a large budget gap | P01 × 4 | ₹3,996 | ₹0 | ₹2,996 | Field sales |

## KYC specimens

The test feeds the 47 original PNGs through the shared image preparation, OCR and extraction code and then into the server verifier. The tests assert the decision and a case-specific reason.

| Case | Expected and observed decision | Decision check |
| --- | --- | --- |
| K01 | Manual review | Cancelled GSTIN held by the mock registry status |
| K02 | Cleared | Tilt detected and corrected before an active GSTIN and cross-document check |
| K03 | Cleared | Complete proofs match registry and bill |
| K04 | Owner correction | Blurry certificate requires a sharper scan |
| K05 | Owner correction | Required Udyam proof is missing |
| K06 | Owner correction | Failed GSTIN checksum and nearby registry match flagged |
| K07 | Owner correction | GST legal name disagrees with the registry |
| K08 | Cleared | Complete proofs match registry and bill |
| K09 | Cleared | Current bill matches the GST address and business name |
| K10 | Owner correction | OCR flagged the GSTIN. The corroborating registry record also flagged the signatory mismatch. |
| K11 | Owner correction | Utility bill exceeds the 90-day window |
| K12 | Cleared | Complete proofs match registry and bill |

## Other verification

- Case API tests cover the Hindi intake, active and inactive GST checks, independent evidence, checkout gating, single-use resume, concurrent payment retries and one-time partner credit.
- OpenAI, Gemini and Anthropic adapters use mock transports in tests. Tests confirm typed extraction, fallback and the generated-number guard.
- WhatsApp tests cover challenge verification, bad signatures, retry and deduplication, two-message intake and one-time quote-link redemption using a simulated Meta transport.
- Browser walkthrough verified Hindi intake, the per-site quote, Operations and clinic OCR clearance to checkout.
- The logistic model uses six intake fields and a chronological 4,000 / 1,000 split of the 5,000 synthetic leads. There were 71 activations in the holdout set. AUC was 0.6484 and Brier score was 0.0649 versus 0.0660 for a constant training-rate predictor.
