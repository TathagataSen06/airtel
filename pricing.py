"""Synthetic Udyam Digital catalogue pricing; no live Airtel orders."""
CATALOGUE = {"P01": (999, 0, 12), "P02": (1499, 0, 12), "P07": (299, 0, 1), "P09": (499, 1500, 12), "P16": (125, 0, 12), "P20": (99, 0, 12), "P19": (599, 2500, 12)}
BUNDLES = {"office": {"P02": 1, "P16": 3, "P20": 3, "P09": 1}, "retail": {"P01": 1, "P07": 1}}
def quote(items):
    if not isinstance(items, dict) or not items: raise ValueError("Products required")
    if any(sku not in CATALOGUE or type(qty) is not int or not 1 <= qty <= 20 for sku, qty in items.items()): raise ValueError("Invalid product or quantity")
    if sum(sku in items for sku in ("P01", "P02")) != 1: raise ValueError("Choose one fibre plan")
    if "P09" in items and "P02" not in items: raise ValueError("Backup requires Fibre 300")
    return {"monthly": sum(CATALOGUE[k][0] * v for k, v in items.items()), "setup": sum(CATALOGUE[k][1] * v for k, v in items.items()), "currency": "INR", "tax_excluded": True, "synthetic": True}
