"""Rebuild demo data from the organizer's extracted synthetic contestant dataset."""
import csv
import json
import sys
from pathlib import Path
from PIL import Image

source = Path(sys.argv[1])
output = Path(__file__).resolve().parents[1]
images = output / 'public' / 'specimens'
images.mkdir(parents=True, exist_ok=True)

def rows(name):
    with (source / name).open(newline='', encoding='utf-8-sig') as stream:
        return list(csv.DictReader(stream))

products = rows('product_catalogue.csv')
tax = rows('mock_gstin_registry.csv')
msme = rows('mock_udyam_registry.csv')
leads = rows('smb_leads.csv')
applicants = [
    ('37IHKXV5167L1ZS', 'Cancelled GSTIN'),
    ('19EOGXH4115Y1ZL', 'Tilted GST certificate'),
    ('27XUIXG0767D1ZP', 'Complete document set'),
    ('27PZSXS1936O1ZH', 'Blurred GST certificate'),
    ('32TZAXB5481U1Z1', 'Missing Udyam certificate'),
    ('08YKZXS5189L1ZO', 'GSTIN differs from registry'),
    ('07CPCXN0398P1ZT', 'GST legal name discrepancy'),
    ('24XORXG9365M1Z3', 'Complete document set'),
    ('37LDYXK0296F1ZB', 'Address proof cross-check'),
    ('27QHJXK0658U1ZL', 'Signatory discrepancy'),
    ('03KGZXT1320R1ZZ', 'Stale address proof'),
    ('37NBLXS1145E1ZU', 'Complete document set')
]
by_gst = {row['gstin']: row for row in leads if row['gstin']}
fixtures = {}
for i, (gstin, description) in enumerate(applicants, start=1):
    key = f'K{i:02}'
    applicant = by_gst[gstin]
    files = {}
    for kind, label in [('gst', 'gst_certificate'), ('udyam', 'udyam_certificate'), ('id', 'signatory_id'), ('address', 'address_proof')]:
        path = source / 'kyc_documents' / f'{key}_{label}.png'
        if not path.exists():
            continue
        image = Image.open(path).convert('RGB')
        image.thumbnail((1100, 1650))
        filename = f'{key}-{kind}.webp'
        image.save(images / filename, quality=48, method=4)
        files[kind] = f'/specimens/{filename}'
    fixtures[key] = {
        'name': applicant['business_name'], 'description': description,
        'gstin': gstin, 'udyam': applicant['udyam_number'], 'signer': applicant['contact_name'],
        'requireGst': True, 'requireUdyam': bool(applicant['udyam_number']), 'files': files
    }

stages = ['Lead generated', 'Contacted', 'Needs assessed', 'Quote accepted', 'KYC complete', 'Activated']
stage_columns = ['created_date', 'contacted_date', 'needs_assessed_date', 'quote_accepted_date', 'kyc_complete_date', 'activated_date']
# The supplied file stores cumulative reached dates and the final stage for each lead.
funnel = [
    {'name': label, 'count': len(leads) if index == 0 else sum(row[column] != '' for row in leads)}
    for index, (label, column) in enumerate(zip(stages, stage_columns))
]
active = [row for row in leads if row['outcome'].lower() == 'activated']
def average(column):
    return sum(float(r[column]) for r in active if r[column]) / len(active)
segments = []
for name in dict.fromkeys(row['segment'] for row in leads):
    group = [row for row in leads if row['segment'] == name]
    won = sum(row['outcome'].lower() == 'activated' for row in group)
    segments.append({'name': name, 'leads': len(group), 'active': won,
                     'cost': round(sum(int(row['acquisition_cost_inr']) for row in group) / won)})
baselines = {
    'funnel': funnel, 'activation': len(active), 'total': len(leads),
    'days': round(average('days_lead_to_activation'), 2),
    'calls': round(average('customer_follow_up_calls'), 2),
    'churn': round(100 * sum(row['churned_within_6_months'] == 'Y' for row in active) / len(active), 1),
    'spend': sum(int(row['acquisition_cost_inr']) for row in leads),
    'segments': segments, 'registrySizes': [len(tax), len(msme)], 'documents': sum(len(row['files']) for row in fixtures.values())
}
def compact(data):
    return json.dumps(data, ensure_ascii=False, separators=(',', ':'))

payload = {
    'productSource': {row['product_id']: row for row in products},
    'officialGst': {row['gstin']: [row['legal_name'], row['trade_name'], row['principal_place_of_business'], row['state'], row['status']] for row in tax},
    'officialUdyam': {row['udyam_number']: [row['enterprise_name'], row['state']] for row in msme},
    'officialFixtures': fixtures,
    'baselines': baselines
}
(output / 'src' / 'official.local.mjs').write_text(
    '// Generated from organizer-supplied synthetic contestant files by scripts/import-case.py.\n'
    + '\n'.join(f'export const {key} = {compact(value)};' for key, value in payload.items()) + '\n',
    encoding='utf-8'
)
print(json.dumps(baselines, indent=2))
