"""Input Layer.

Loads project query, semantic class color configuration, mask file lists,
and optional image metadata (lat/lng coordinates).

Outputs (used by downstream layers):
    - query_data:     Project and zone information.
    - semantic_colors: {class_name: (R, G, B)} color mapping.
    - zone_image_map: {zone_id: {layer: [filenames]}} image listing.
    - image_metadata: {image_id: {lat, lng, ...}} coordinates (may be empty).
    - PATHS:          Path configuration dict.
    - LAYERS:         List of layer names processed.
"""

try:
    from google.colab import drive
    drive.mount('/content/drive')
    IN_COLAB = True
    print("Google Drive mounted")
except Exception:
    IN_COLAB = False
    print("Not running in Colab - using local paths")


import os
import json
import glob
import csv
import numpy as np
from PIL import Image
from datetime import datetime
from typing import Dict, List, Tuple, Any

try:
    import pandas as pd
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False
    print("pandas not installed. Run: pip install pandas openpyxl")


# Paths configuration
if IN_COLAB:
    BASE_PATH = "/content/drive/MyDrive/SceneRx-AI-paper"
else:
    BASE_PATH = "."

PATHS = {
    "query_file": f"{BASE_PATH}/UserQueries/SceneRx-AI_mock_filled_query_single_performance_photos_45_per_zone.json",
    "semantic_config": f"{BASE_PATH}/color_coding_semantic_segmentation_classes.xlsx",
    "image_base_path": f"{BASE_PATH}/mask/",
    "output_path": f"{BASE_PATH}/Outputs/",
    "image_metadata_file": f"{BASE_PATH}/image_metadata.csv",
}

LAYERS = ["full", "foreground", "middleground", "background"]

print(f"\nConfiguration:")
print(f"  Base path: {BASE_PATH}")
print(f"  Layers: {LAYERS}")


def load_query(query_path: str) -> Dict:
    """Load the project query file and extract zone definitions."""
    with open(query_path, 'r', encoding='utf-8') as f:
        query = json.load(f)

    zones = []
    for sz in query.get('spatial_zones', []):
        zones.append({
            'id': sz['zone_id'],
            'name': sz['zone_name'],
            'area_sqm': sz.get('area_sqm', 0),
            'status': sz.get('status', 'unknown'),
        })

    return {
        'project': query.get('project', {}),
        'context': query.get('context', {}),
        'zones': zones,
    }


def parse_rgb_string(rgb_str: str) -> Tuple[int, int, int]:
    """Parse strings like '(120, 120, 120)' or '120,120,120' into (R, G, B)."""
    cleaned = rgb_str.replace('(', '').replace(')', '').strip()
    parts = [int(x.strip()) for x in cleaned.split(',')]
    return tuple(parts[:3])


def hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
    """Convert a hex color string ('#787878' or '787878') to (R, G, B)."""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i + 2], 16) for i in (0, 2, 4))


def load_semantic_config_from_excel(excel_path: str) -> Dict[str, Tuple[int, int, int]]:
    """Load semantic class colors from an Excel file.

    Required columns: 'Name' plus one of 'Color_Code (R,G,B)' or 'Color_Code(hex)'.
    """
    if not PANDAS_AVAILABLE:
        raise ImportError("pandas is required. Run: pip install pandas openpyxl")

    df = pd.read_excel(excel_path)
    color_map = {}

    for _, row in df.iterrows():
        name = str(row.get('Name', '')).strip()
        if not name:
            continue
        rgb_col = row.get('Color_Code (R,G,B)', None)
        hex_col = row.get('Color_Code(hex)', None)
        if rgb_col and pd.notna(rgb_col):
            try:
                color_map[name] = parse_rgb_string(str(rgb_col))
            except Exception:
                pass
        elif hex_col and pd.notna(hex_col):
            try:
                color_map[name] = hex_to_rgb(str(hex_col))
            except Exception:
                pass

    return color_map


def load_semantic_config_from_json(json_path: str) -> Dict[str, Tuple[int, int, int]]:
    """Load semantic class colors from a JSON file (legacy format)."""
    with open(json_path, 'r', encoding='utf-8') as f:
        config = json.load(f)
    color_map = {}
    for item in config:
        name = item.get('name', '')
        hex_color = item.get('color', '')
        if name and hex_color:
            color_map[name] = hex_to_rgb(hex_color)
    return color_map


def load_semantic_config(config_path: str) -> Dict[str, Tuple[int, int, int]]:
    """Auto-detect config file type (.xlsx, .xls, .json) and load it."""
    ext = os.path.splitext(config_path)[1].lower()
    if ext in ['.xlsx', '.xls']:
        return load_semantic_config_from_excel(config_path)
    if ext == '.json':
        return load_semantic_config_from_json(config_path)
    raise ValueError(f"Unsupported config file format: {ext}")


def scan_zone_images(base_path: str, zone_id: str, layers: List[str]) -> Dict[str, List[str]]:
    """Scan the mask folder for image files in each layer."""
    zone_images = {}
    for layer in layers:
        layer_path = os.path.join(base_path, zone_id, layer)
        if os.path.exists(layer_path):
            files = (
                glob.glob(os.path.join(layer_path, "*.png"))
                + glob.glob(os.path.join(layer_path, "*.jpg"))
                + glob.glob(os.path.join(layer_path, "*.jpeg"))
            )
            zone_images[layer] = [os.path.basename(f) for f in sorted(files)]
        else:
            zone_images[layer] = []
    return zone_images


def load_image_metadata(metadata_path: str) -> Dict[str, Dict]:
    """Load optional per-image metadata (lat/lng, etc.) from a .csv or .json file.

    CSV format must have an 'image_id' column. Other columns are kept as-is
    (numeric values are coerced to float when possible).
    JSON format may be a list of objects (each with 'image_id'), or a dict
    keyed by image_id.

    Returns an empty dict if the file is missing or unparseable.
    """
    if not os.path.exists(metadata_path):
        return {}

    ext = os.path.splitext(metadata_path)[1].lower()
    metadata: Dict[str, Dict] = {}

    try:
        if ext == '.csv':
            with open(metadata_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    img_id = row.get('image_id', '').strip()
                    if not img_id:
                        continue
                    entry = {}
                    for key, val in row.items():
                        if key == 'image_id':
                            continue
                        try:
                            entry[key] = float(val)
                        except (ValueError, TypeError):
                            entry[key] = val
                    metadata[img_id] = entry

        elif ext == '.json':
            with open(metadata_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            if isinstance(data, list):
                for item in data:
                    img_id = item.get('image_id', '').strip()
                    if not img_id:
                        continue
                    metadata[img_id] = {k: v for k, v in item.items() if k != 'image_id'}
            elif isinstance(data, dict):
                metadata = data

        else:
            print(f"  Unsupported metadata format: {ext} (use .csv or .json)")

    except Exception as e:
        print(f"  Error loading image metadata: {e}")

    return metadata


# Execute
print("\n" + "=" * 70)
print("LOADING INPUT DATA")
print("=" * 70)

print(f"\nLoading query file...")
try:
    query_data = load_query(PATHS['query_file'])
    print(f"  Project: {query_data['project'].get('name', 'Unknown')}")
    print(f"  Zones: {len(query_data['zones'])}")
    for z in query_data['zones']:
        print(f"    - {z['id']}: {z['name']}")
except FileNotFoundError:
    print(f"  Query file not found: {PATHS['query_file']}")
    query_data = {'project': {}, 'context': {}, 'zones': []}
except Exception as e:
    print(f"  Error loading query: {e}")
    query_data = {'project': {}, 'context': {}, 'zones': []}

print(f"\nLoading semantic color configuration...")
try:
    semantic_colors = load_semantic_config(PATHS['semantic_config'])
    print(f"  Loaded {len(semantic_colors)} semantic classes")
    sample_classes = ['tree', 'sky', 'grass', 'road;route', 'building;edifice', 'sidewalk;pavement']
    print(f"  Sample classes:")
    for cls in sample_classes:
        if cls in semantic_colors:
            print(f"    - {cls}: RGB{semantic_colors[cls]}")
except FileNotFoundError:
    print(f"  Config file not found: {PATHS['semantic_config']}")
    semantic_colors = {}
except Exception as e:
    print(f"  Error loading config: {e}")
    semantic_colors = {}

print(f"\nScanning mask folders...")
zone_image_map = {}
total_images_by_layer = {layer: 0 for layer in LAYERS}

for zone in query_data['zones']:
    zone_id = zone['id']
    zone_images = scan_zone_images(PATHS['image_base_path'], zone_id, LAYERS)
    zone_image_map[zone_id] = zone_images
    for layer, files in zone_images.items():
        total_images_by_layer[layer] += len(files)

print(f"  Images by layer:")
for layer, count in total_images_by_layer.items():
    print(f"    - {layer}: {count} images")
print(f"  Total: {sum(total_images_by_layer.values())} images")

print(f"\nLoading image metadata...")
image_metadata = load_image_metadata(PATHS['image_metadata_file'])
if image_metadata:
    sample_entry = next(iter(image_metadata.values()))
    print(f"  Loaded metadata for {len(image_metadata)} images")
    print(f"  Available fields: {list(sample_entry.keys())}")
    for i, (img_id, meta) in enumerate(image_metadata.items()):
        if i >= 3:
            break
        print(f"    - {img_id}: {meta}")
else:
    print(f"  No image metadata found (file: {PATHS['image_metadata_file']})")
    print(f"  Output will not include lat/lng coordinates.")
    print(f"  To add coordinates, create a CSV with columns: image_id,lat,lng")

print("\n" + "=" * 70)
print("INPUT LAYER COMPLETE")
print("=" * 70)
print(f"""
Available variables:
  - query_data      : Project and zone information
  - semantic_colors : {{class_name: (R,G,B)}} color mapping ({len(semantic_colors)} classes)
  - zone_image_map  : {{zone_id: {{layer: [filenames]}}}} image listing
  - image_metadata  : {{image_id: {{lat, lng, ...}}}} coordinates ({len(image_metadata)} images)
  - PATHS           : Path configuration
  - LAYERS          : Layer list {LAYERS}
""")
