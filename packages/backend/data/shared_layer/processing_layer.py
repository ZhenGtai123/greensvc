"""Processing Layer.

Iterates over zones, runs the calculator on each image, and aggregates
per-zone and per-layer statistics.

Inputs (from INPUT LAYER):
    - query_data, zone_image_map, image_metadata, PATHS, LAYERS

Inputs (from CALCULATOR LAYER):
    - INDICATOR, calculate_indicator()

Outputs:
    - all_zone_results:    list of per-zone result dicts
    - all_values:          flat list of all valid values
    - all_values_by_layer: {layer: [values]}
"""

import os
import numpy as np
from typing import Dict, List, Any


def process_zone(zone: Dict, zone_images: Dict[str, List[str]],
                 base_path: str, calculator_func,
                 image_metadata: Dict[str, Dict] = None) -> Dict:
    """Process all images in a zone, calling calculator_func on each.

    Args:
        zone: Zone dict with id, name, area_sqm, status.
        zone_images: {layer: [filenames]} from the input layer.
        base_path: Mask folder root path.
        calculator_func: Reference to calculate_indicator().
        image_metadata: Optional {image_id: {lat, lng, ...}}.

    Returns:
        Dict with zone_id, zone_name, area_sqm, status, layers (per-layer
        results with images, values, and statistics), all_values,
        values_by_layer, images_processed, images_failed, images_no_data.
    """
    if image_metadata is None:
        image_metadata = {}

    zone_id = zone['id']
    results = {
        'zone_id': zone_id,
        'zone_name': zone['name'],
        'area_sqm': zone.get('area_sqm', 0),
        'status': zone.get('status', 'unknown'),
        'layers': {},
        'all_values': [],
        'values_by_layer': {},
        'images_processed': 0,
        'images_failed': 0,
        'images_no_data': 0,
    }

    for layer, filenames in zone_images.items():
        layer_results = {'images': [], 'values': [], 'statistics': {}}

        for filename in filenames:
            image_path = os.path.join(base_path, zone_id, layer, filename)
            image_id = os.path.splitext(filename)[0]
            result = calculator_func(image_path)

            if result['success']:
                image_data = {
                    'image_id': image_id,
                    'filename': filename,
                    'value': result['value'],
                }

                # Inject lat/lng and other metadata if available
                meta = image_metadata.get(image_id, {})
                for meta_key, meta_val in meta.items():
                    image_data[meta_key] = meta_val

                # Carry over extra calculator-returned fields
                for key, val in result.items():
                    if key not in ['success', 'value', 'error']:
                        image_data[key] = val

                layer_results['images'].append(image_data)

                if result['value'] is not None:
                    layer_results['values'].append(result['value'])
                    results['all_values'].append(result['value'])
                else:
                    results['images_no_data'] += 1

                results['images_processed'] += 1
            else:
                results['images_failed'] += 1

        if layer_results['values']:
            arr = np.array(layer_results['values'])
            layer_results['statistics'] = {
                'N': len(arr),
                'Mean': round(float(np.mean(arr)), 3),
                'Std': round(float(np.std(arr)), 3),
                'Min': round(float(np.min(arr)), 3),
                'Max': round(float(np.max(arr)), 3),
                'Median': round(float(np.median(arr)), 3),
            }

        results['layers'][layer] = layer_results
        results['values_by_layer'][layer] = layer_results['values']

    return results


def calculate_statistics(values: List[float]) -> Dict:
    """Compute descriptive statistics for a list of numeric values.

    Returns N, Mean, Std, Min, Q1, Median, Q3, Max, Range, IQR, Variance, CV(%).
    Returns an empty dict for an empty input.
    """
    if not values:
        return {}

    arr = np.array(values)
    q1, q3 = np.percentile(arr, 25), np.percentile(arr, 75)
    mean_val = float(np.mean(arr))
    std_val = float(np.std(arr))

    return {
        'N': len(values),
        'Mean': round(mean_val, 3),
        'Std': round(std_val, 3),
        'Min': round(float(np.min(arr)), 3),
        'Q1': round(float(q1), 3),
        'Median': round(float(np.median(arr)), 3),
        'Q3': round(float(q3), 3),
        'Max': round(float(np.max(arr)), 3),
        'Range': round(float(np.max(arr) - np.min(arr)), 3),
        'IQR': round(float(q3 - q1), 3),
        'Variance': round(float(np.var(arr)), 3),
        'CV(%)': round(float(std_val / mean_val * 100), 2) if mean_val != 0 else 0,
    }


# Main processing loop
print("\n" + "=" * 70)
print(f"PROCESSING: {INDICATOR['id']} - {INDICATOR['name']}")
print(f"  Layers: {', '.join(LAYERS)}")
if image_metadata:
    print(f"  Image metadata: {len(image_metadata)} entries loaded")
else:
    print(f"  Image metadata: not available (output will not include lat/lng)")
print("=" * 70)

all_zone_results = []
all_values = []
all_values_by_layer = {layer: [] for layer in LAYERS}

for zone in query_data['zones']:
    zone_id = zone['id']
    zone_images = zone_image_map.get(zone_id, {})
    total_zone_images = sum(len(files) for files in zone_images.values())

    print(f"\nProcessing: {zone['name']} ({total_zone_images} images)...")

    result = process_zone(
        zone=zone,
        zone_images=zone_images,
        base_path=PATHS['image_base_path'],
        calculator_func=calculate_indicator,
        image_metadata=image_metadata,
    )

    all_zone_results.append(result)
    all_values.extend(result['all_values'])

    for layer in LAYERS:
        all_values_by_layer[layer].extend(result['values_by_layer'].get(layer, []))

    print(f"  Processed: {result['images_processed']}")
    if result['images_failed'] > 0:
        print(f"  Failed: {result['images_failed']}")
    if result['images_no_data'] > 0:
        print(f"  No data: {result['images_no_data']}")
    if result['all_values']:
        mean_val = np.mean(result['all_values'])
        print(f"  Zone Mean: {mean_val:.2f}{INDICATOR['unit']}")

print("\n" + "=" * 70)
total_processed = sum(r['images_processed'] for r in all_zone_results)
total_failed = sum(r['images_failed'] for r in all_zone_results)
total_no_data = sum(r.get('images_no_data', 0) for r in all_zone_results)

print(f"PROCESSING COMPLETE")
print(f"  Total processed: {total_processed}")
if total_failed > 0:
    print(f"  Total failed: {total_failed}")
if total_no_data > 0:
    print(f"  Total no data: {total_no_data}")

if all_values:
    print(f"\nOVERALL Mean: {np.mean(all_values):.2f}{INDICATOR['unit']}")

print(f"\nBY LAYER:")
for layer in LAYERS:
    if all_values_by_layer[layer]:
        mean_val = np.mean(all_values_by_layer[layer])
        n_val = len(all_values_by_layer[layer])
        print(f"  {layer}: Mean={mean_val:.2f}{INDICATOR['unit']}, N={n_val}")
    else:
        print(f"  {layer}: No data")

print("=" * 70)
