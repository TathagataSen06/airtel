"""Fit an activation model using only fields available at lead intake."""
from math import exp, log1p, sqrt


FEATURES = ['log_staff', 'log_sites', 'tier_one', 'active_gst', 'weak_internet', 'addon_interests']


def sigmoid(value):
    return 1 / (1 + exp(-max(-60, min(value, 60))))


def train_propensity(leads, tax):
    active_gst = {row['gstin'] for row in tax if row['status'] == 'Active'}
    data = []
    for row in sorted(leads, key=lambda lead: (lead['created_date'], lead['lead_id'])):
        extras = {sku for sku in row['products_of_interest'].split(';') if sku and sku >= 'P07'}
        values = [log1p(int(row['employee_count'])), log1p(int(row['num_sites'])),
                  int(row['city_tier'] == '1'), int(row['gstin'] in active_gst),
                  int(row['current_internet'] in ('Mobile hotspot', 'None')), len(extras)]
        data.append((values, int(row['outcome'].lower() == 'activated')))

    split = int(len(data) * 0.8)
    train, holdout = data[:split], data[split:]
    size = len(FEATURES)
    mean = [sum(x[i] for x, _ in train) / split for i in range(size)]
    scale = [sqrt(sum((x[i] - mean[i]) ** 2 for x, _ in train) / split) or 1 for i in range(size)]

    def standardize(x):
        return [(v - m) / s for v, m, s in zip(x, mean, scale)]

    inputs = [(standardize(x), label) for x, label in train]
    positive = sum(label for _, label in train)
    intercept = 0.0
    weights = [0.0] * size
    for _ in range(420):
        total = 0.0
        gradient = [0.0] * size
        for x, label in inputs:
            error = sigmoid(intercept + sum(w * v for w, v in zip(weights, x))) - label
            total += error
            for i, value in enumerate(x):
                gradient[i] += error * value
        intercept -= 0.3 * total / split
        weights = [w - 0.3 * (g / split + 0.01 * w) for w, g in zip(weights, gradient)]

    predictions = [(sigmoid(intercept + sum(w * v for w, v in zip(weights, standardize(x)))), label)
                   for x, label in holdout]
    wins = [p for p, label in predictions if label]
    drops = [p for p, label in predictions if not label]
    auc = sum((a > b) + 0.5 * (a == b) for a in wins for b in drops) / (len(wins) * len(drops))
    return {
        'version': 'case-logit-v1', 'features': FEATURES, 'intercept': round(intercept, 8),
        'means': [round(v, 8) for v in mean], 'scales': [round(v, 8) for v in scale],
        'weights': [round(v, 8) for v in weights], 'trainingRows': split, 'trainingActivated': positive,
        'holdoutRows': len(holdout), 'holdoutActivated': len(wins), 'holdoutAuc': round(auc, 4),
        'holdoutBrier': round(sum((p - label) ** 2 for p, label in predictions) / len(holdout), 4),
        'holdoutBaselineBrier': round(sum((positive / split - label) ** 2 for _, label in holdout) / len(holdout), 4)
    }
