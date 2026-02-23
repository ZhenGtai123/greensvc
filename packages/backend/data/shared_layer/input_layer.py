"""
GreenSVC Stage 2.5 - INPUT LAYER（输入层）
================================================
🔒 完全统一，所有指标共用，无需修改

更新: 使用 color_coding_semantic_segmentation_classes.xlsx 替代 JSON

功能:
1. Mount Google Drive
2. 加载 Query 文件（获取区域清单）
3. 扫描 Mask 文件夹（获取图片清单）
4. 加载语义类别颜色配置（从Excel文件）

输出变量（供后续层使用）:
- query_data: 项目和区域信息
- semantic_colors: {类别名称: (R, G, B)} 颜色映射
- zone_image_map: {zone_id: {layer: [filenames]}} 图片清单
- PATHS: 路径配置
- LAYERS: 图层列表
"""

# =============================================================================
# 1. MOUNT GOOGLE DRIVE
# =============================================================================
try:
    from google.colab import drive
    drive.mount('/content/drive')
    IN_COLAB = True
    print("✅ Google Drive mounted")
except:
    IN_COLAB = False
    print("ℹ️ Not running in Colab - using local paths")


# =============================================================================
# 2. IMPORTS
# =============================================================================
import os
import json
import glob
import numpy as np
from PIL import Image
from datetime import datetime
from typing import Dict, List, Tuple, Any

# 尝试导入pandas（用于读取Excel）
try:
    import pandas as pd
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False
    print("⚠️ pandas not installed. Run: pip install pandas openpyxl")


# =============================================================================
# 3. PATH CONFIGURATION - 【根据你的项目修改这些路径】
# =============================================================================
if IN_COLAB:
    BASE_PATH = "/content/drive/MyDrive/GreenSVC-AI-paper"
else:
    BASE_PATH = "."  # 本地路径

PATHS = {
    # 项目查询文件（定义区域）
    "query_file": f"{BASE_PATH}/UserQueries/GreenSVC-AI_mock_filled_query_single_performance_photos_45_per_zone.json",
    
    # 语义类别颜色配置（Excel文件）
    "semantic_config": f"{BASE_PATH}/color_coding_semantic_segmentation_classes.xlsx",
    
    # mask图片根目录
    "image_base_path": f"{BASE_PATH}/mask/",
    
    # 输出目录
    "output_path": f"{BASE_PATH}/Outputs/"
}

# 处理的图层列表
LAYERS = ["full", "foreground", "middleground", "background"]

print(f"\n📂 Configuration:")
print(f"   Base path: {BASE_PATH}")
print(f"   Layers: {LAYERS}")


# =============================================================================
# 4. LOAD QUERY FILE (项目区域定义)
# =============================================================================
def load_query(query_path: str) -> Dict:
    """
    加载项目查询文件，获取区域定义。
    
    Args:
        query_path: Query JSON文件路径
        
    Returns:
        {
            'project': 项目信息,
            'context': 上下文信息,
            'zones': [{'id', 'name', 'area_sqm', 'status'}, ...]
        }
    """
    with open(query_path, 'r', encoding='utf-8') as f:
        query = json.load(f)
    
    zones = []
    for sz in query.get('spatial_zones', []):
        zones.append({
            'id': sz['zone_id'],
            'name': sz['zone_name'],
            'area_sqm': sz.get('area_sqm', 0),
            'status': sz.get('status', 'unknown')
        })
    
    return {
        'project': query.get('project', {}),
        'context': query.get('context', {}),
        'zones': zones
    }


# =============================================================================
# 5. LOAD SEMANTIC CONFIGURATION (从Excel文件)
# =============================================================================
def parse_rgb_string(rgb_str: str) -> Tuple[int, int, int]:
    """
    解析RGB字符串，支持多种格式:
    - "(120, 120, 120)"
    - "120, 120, 120"
    - "(120,120,120)"
    
    Args:
        rgb_str: RGB字符串
        
    Returns:
        (R, G, B) 元组
    """
    # 移除括号和空格
    cleaned = rgb_str.replace('(', '').replace(')', '').strip()
    # 分割并转换为整数
    parts = [int(x.strip()) for x in cleaned.split(',')]
    return tuple(parts[:3])


def hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
    """
    将十六进制颜色转换为RGB元组。
    
    Args:
        hex_color: 十六进制颜色（如 "#787878" 或 "787878"）
        
    Returns:
        (R, G, B) 元组
    """
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


def load_semantic_config_from_excel(excel_path: str) -> Dict[str, Tuple[int, int, int]]:
    """
    从Excel文件加载语义类别颜色配置。
    
    文件格式要求:
    - 必须包含 'Name' 列（类别名称）
    - 必须包含 'Color_Code (R,G,B)' 或 'Color_Code(hex)' 列
    
    Args:
        excel_path: Excel文件路径
        
    Returns:
        {类别名称: (R, G, B)} 字典
    """
    if not PANDAS_AVAILABLE:
        raise ImportError("pandas is required. Run: pip install pandas openpyxl")
    
    df = pd.read_excel(excel_path)
    
    color_map = {}
    
    for _, row in df.iterrows():
        name = str(row.get('Name', '')).strip()
        if not name:
            continue
        
        # 尝试从 RGB 列获取颜色
        rgb_col = row.get('Color_Code (R,G,B)', None)
        hex_col = row.get('Color_Code(hex)', None)
        
        if rgb_col and pd.notna(rgb_col):
            try:
                rgb = parse_rgb_string(str(rgb_col))
                color_map[name] = rgb
            except:
                pass
        elif hex_col and pd.notna(hex_col):
            try:
                rgb = hex_to_rgb(str(hex_col))
                color_map[name] = rgb
            except:
                pass
    
    return color_map


def load_semantic_config_from_json(json_path: str) -> Dict[str, Tuple[int, int, int]]:
    """
    从JSON文件加载语义类别颜色配置（向后兼容）。
    
    Args:
        json_path: JSON文件路径
        
    Returns:
        {类别名称: (R, G, B)} 字典
    """
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
    """
    自动检测配置文件类型并加载语义颜色配置。
    
    支持:
    - .xlsx / .xls: Excel文件
    - .json: JSON文件
    
    Args:
        config_path: 配置文件路径
        
    Returns:
        {类别名称: (R, G, B)} 字典
    """
    ext = os.path.splitext(config_path)[1].lower()
    
    if ext in ['.xlsx', '.xls']:
        return load_semantic_config_from_excel(config_path)
    elif ext == '.json':
        return load_semantic_config_from_json(config_path)
    else:
        raise ValueError(f"Unsupported config file format: {ext}")


# =============================================================================
# 6. SCAN MASK FOLDERS (扫描图片文件)
# =============================================================================
def scan_zone_images(base_path: str, zone_id: str, layers: List[str]) -> Dict[str, List[str]]:
    """
    自动扫描mask文件夹，获取图片文件列表。
    
    Args:
        base_path: mask文件夹根路径
        zone_id: 区域ID
        layers: 图层列表
        
    Returns:
        {layer_name: [filename1, filename2, ...]}
    """
    zone_images = {}
    
    for layer in layers:
        layer_path = os.path.join(base_path, zone_id, layer)
        
        if os.path.exists(layer_path):
            png_files = glob.glob(os.path.join(layer_path, "*.png"))
            jpg_files = glob.glob(os.path.join(layer_path, "*.jpg"))
            jpeg_files = glob.glob(os.path.join(layer_path, "*.jpeg"))
            
            all_files = png_files + jpg_files + jpeg_files
            zone_images[layer] = [os.path.basename(f) for f in sorted(all_files)]
        else:
            zone_images[layer] = []
    
    return zone_images


# =============================================================================
# 7. EXECUTE INPUT LAYER
# =============================================================================
print("\n" + "=" * 70)
print("🔄 LOADING INPUT DATA")
print("=" * 70)

# 7.1 加载项目查询文件
print(f"\n📄 Loading query file...")
try:
    query_data = load_query(PATHS['query_file'])
    print(f"   ✅ Project: {query_data['project'].get('name', 'Unknown')}")
    print(f"   ✅ Zones: {len(query_data['zones'])}")
    for z in query_data['zones']:
        print(f"      • {z['id']}: {z['name']}")
except FileNotFoundError:
    print(f"   ❌ Query file not found: {PATHS['query_file']}")
    query_data = {'project': {}, 'context': {}, 'zones': []}
except Exception as e:
    print(f"   ❌ Error loading query: {e}")
    query_data = {'project': {}, 'context': {}, 'zones': []}

# 7.2 加载语义颜色配置
print(f"\n🎨 Loading semantic color configuration...")
try:
    semantic_colors = load_semantic_config(PATHS['semantic_config'])
    print(f"   ✅ Loaded {len(semantic_colors)} semantic classes")
    
    # 显示部分类别作为示例
    sample_classes = ['tree', 'sky', 'grass', 'road;route', 'building;edifice', 'sidewalk;pavement']
    print(f"   Sample classes:")
    for cls in sample_classes:
        if cls in semantic_colors:
            print(f"      • {cls}: RGB{semantic_colors[cls]}")
except FileNotFoundError:
    print(f"   ❌ Config file not found: {PATHS['semantic_config']}")
    semantic_colors = {}
except Exception as e:
    print(f"   ❌ Error loading config: {e}")
    semantic_colors = {}

# 7.3 扫描所有区域的图片
print(f"\n📂 Scanning mask folders...")
zone_image_map = {}
total_images_by_layer = {layer: 0 for layer in LAYERS}

for zone in query_data['zones']:
    zone_id = zone['id']
    zone_images = scan_zone_images(PATHS['image_base_path'], zone_id, LAYERS)
    zone_image_map[zone_id] = zone_images
    
    for layer, files in zone_images.items():
        total_images_by_layer[layer] += len(files)

print(f"   ✅ Images by layer:")
for layer, count in total_images_by_layer.items():
    print(f"      • {layer}: {count} images")
print(f"   ✅ Total images: {sum(total_images_by_layer.values())}")

# 7.4 打印完成信息
print("\n" + "=" * 70)
print("✅ INPUT LAYER COMPLETE")
print("=" * 70)
print(f"""
Available variables:
  - query_data      : Project and zone information
  - semantic_colors : {{class_name: (R,G,B)}} color mapping ({len(semantic_colors)} classes)
  - zone_image_map  : {{zone_id: {{layer: [filenames]}}}} image listing
  - PATHS           : Path configuration
  - LAYERS          : Layer list {LAYERS}
""")
