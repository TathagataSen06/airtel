# Udyam Digital

Team Cartel · BIT Mesra, Ranchi  
Airtel SYNC 2026 Digital Track · Accel Business

A bilingual sandbox for onboarding small businesses. Owners answer five questions, receive an itemised bundle, consent to verification, book installation, pay in a sandbox and track products. Sales and verification staff work from the same case reference.

## Run locally

Use Node.js 22.13 or newer.

```sh
npm ci
npm start
```

Open <http://localhost:4173>. The install step prepares local browser OCR assets. The application runs without a CDN and uses a SQLite database under `.udyam/`. Run `npm test` to verify quote pricing, case handoff, KYC, checkout retries and partner attribution.

## Walk through the product

| Workflow | Steps |
| --- | --- |
| Needs assessment | Start the WhatsApp-style chat or use the web advisor. Choose Hindi or English and answer the five questions. |
| Quote | Open **Sample profiles → Clinic with fibre**. Turn off 4G/5G backup to change ₹2,670/month and ₹1,500 setup to ₹2,171/month and ₹0 setup. |
| Resume | Issue a one-time code from **Case passport**. The web session retains the quote and referral. |
| Smart KYC | Accept a quote and give consent. Scan synthetic sample documents or select test images. Open **K01 · cancelled GSTIN** to see the checkout hold. Operations can return the case for corrected evidence. |
| Checkout | Use the clean clinic case. Choose a slot and use the sandbox payment. A failed attempt preserves the slot for a retry. |
| Tracker | Post installation and product milestones in **Operations**. The owner sees status per product, and the partner gets credit once at activation. |
| Assisted sales | Try the multi-site profile or an unsupported PIN. The field desk receives the existing case, owner needs and referral. |

## Organizer data

The public source uses fictional starter records and the supplied catalogue terms. Import the organizer's contestant data locally to use its exact mock registries and all 12 original applicants.

```sh
python -m pip install Pillow
python scripts/import-case.py /path/to/extracted/organizer-data
npm start
```

The input directory must contain the catalogue CSV, both mock registry CSVs, the lead CSV and the `kyc_documents` directory. The importer prepares ignored local data and compressed specimen images. The original specimens are accessible in **Sample profiles** after importing. Address checks use the case date 15 July 2026.

## Integration boundaries

Prices and eligibility come from the catalogue rules. In a browser with a supported on-device language model, the advisor can generate its explanation from allowed product facts. Hosted copy generation requires a configured model credential. The catalogue explanation is available by default.

WhatsApp, coverage, registry verification, payment and provisioning use sandbox adapters. OCR reads images on the device and sends only necessary extracted fields for mock verification. The API stores consent receipts, masked check results and a case event trail. Operations simulates staff roles in the sandbox.
