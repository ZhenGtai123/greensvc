"""
GreenSVC Stage 2.5 - OUTPUT LAYER（输出层）
================================================
🔒 完全统一，所有指标共用，无需修改

功能:
1. 构建输出JSON结构
2. 保存JSON文件
3. 显示结果摘要

依赖变量（来自 INPUT LAYER）:
- query_data: 项目和区域信息
- PATHS: 路径配置
- LAYERS: 图层列表

依赖变量（来自 CALCULATOR LAYER）:
- INDICATOR: 指标定义字典

依赖变量（来自 PROCESSING LAYER）:
- all_zone_results: 所有区域的处理结果
- all_values: 所有有效值的列表
- all_values_by_layer: 按图层分组的值列表
- calculate_statistics(): 统计函数
"""

import os
import json
import numpy as np
from datetime import datetime


# =============================================================================
# 1. BUILD OUTPUT JSON
# =============================================================================
print("\n" + "=" * 70)
print("📦 BUILDING OUTPUT")
print("=" * 70)

# 计算总体统计量
descriptive_stats = calculate_statistics(all_values)

# 计算各图层统计量
layer_overall_stats = {}
for layer in LAYERS:
    if all_values_by_layer[layer]:
        layer_overall_stats[layer] = calculate_statistics(all_values_by_layer[layer])
    else:
        layer_overall_stats[layer] = {'N': 0, 'Mean': None, 'note': 'No images found'}

# 构建区域统计表
zone_statistics = []
for zr in all_zone_results:
    if zr['all_values']:
        zone_stat = {
            'Zone': zr['zone_name'],
            'Area_ID': zr['zone_id'],
            'Area_sqm': zr['area_sqm'],
            'Status': zr['status'],
            'Indicator': INDICATOR['id'],
            'N_total': len(zr['all_values']),
            'Mean_overall': round(float(np.mean(zr['all_values'])), 3),
            'Std_overall': round(float(np.std(zr['all_values'])), 3),
            'Min_overall': round(float(min(zr['all_values'])), 3),
            'Max_overall': round(float(max(zr['all_values'])), 3)
        }
        
        # 添加各图层统计
        for layer in LAYERS:
            layer_stats = zr['layers'].get(layer, {}).get('statistics', {})
            zone_stat[f'{layer}_N'] = layer_stats.get('N', 0)
            zone_stat[f'{layer}_Mean'] = layer_stats.get('Mean', None)
            zone_stat[f'{layer}_Std'] = layer_stats.get('Std', None)
        
        zone_statistics.append(zone_stat)

# 构建完整输出结构
output = {
    'computation_metadata': {
        'version': '2.5-EXCEL',
        'generated_at': datetime.now().isoformat(),
        'system': 'GreenSVC-AI Stage 2.5: Single Indicator Computation',
        'indicator_id': INDICATOR['id'],
        'source_query': os.path.basename(PATHS['query_file']),
        'semantic_config': os.path.basename(PATHS['semantic_config']),
        'color_matching': 'exact',
        'note': 'Images auto-scanned from mask folders, all layers processed'
    },
    'indicator_definition': {
        'id': INDICATOR['id'],
        'name': INDICATOR['name'],
        'definition': INDICATOR.get('definition', ''),
        'unit': INDICATOR['unit'],
        'formula': INDICATOR['formula'],
        'target_direction': INDICATOR['target_direction'],
        'category': INDICATOR.get('category', ''),
        'calc_type': INDICATOR.get('calc_type', 'ratio'),
        'semantic_classes': INDICATOR.get('target_classes', 
                           INDICATOR.get('numerator_classes', []) + 
                           INDICATOR.get('denominator_classes', [])),
        'variables': INDICATOR.get('variables', {})
    },
    'computation_summary': {
        'total_zones': len(query_data['zones']),
        'total_images_analyzed': sum(r['images_processed'] for r in all_zone_results),
        'images_failed': sum(r['images_failed'] for r in all_zone_results),
        'images_no_data': sum(r.get('images_no_data', 0) for r in all_zone_results),
        'layers_processed': LAYERS,
        'images_per_layer': {layer: len(all_values_by_layer[layer]) for layer in LAYERS}
    },
    'descriptive_statistics_overall': {
        'Indicator': INDICATOR['id'],
        'Name': INDICATOR['name'],
        'Unit': INDICATOR['unit'],
        **descriptive_stats
    },
    'descriptive_statistics_by_layer': layer_overall_stats,
    'zone_statistics': zone_statistics,
    'layer_results': {zr['zone_id']: zr['layers'] for zr in all_zone_results}
}

print("✅ Output JSON structure built")


# =============================================================================
# 2. SAVE OUTPUT FILES
# =============================================================================
os.makedirs(PATHS['output_path'], exist_ok=True)

timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
saved_files = []

for filename in [f"{INDICATOR['id']}_{timestamp}.json", f"{INDICATOR['id']}_latest.json"]:
    filepath = os.path.join(PATHS['output_path'], filename)
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    saved_files.append(filepath)
    print(f"✅ Saved: {filename}")


# =============================================================================
# 3. DISPLAY SUMMARY TABLE
# =============================================================================
print("\n" + "=" * 100)
print(f"{INDICATOR['id']} - {INDICATOR['name']} - RESULTS SUMMARY")
print("=" * 100)

# 表头
header = f"{'Zone':<30} | {'N':>5} | {'Mean':>8} | {'full':>8} | {'fore':>8} | {'mid':>8} | {'back':>8}"
print(header)
print("-" * 100)

# 数据行
def fmt(v):
    """格式化数值，None显示为'-'"""
    return f"{v:.2f}" if v is not None else '-'

for zs in zone_statistics:
    row = f"{zs['Zone']:<30} | {zs['N_total']:>5} | {fmt(zs['Mean_overall']):>8} | "
    row += f"{fmt(zs.get('full_Mean')):>8} | "
    row += f"{fmt(zs.get('foreground_Mean')):>8} | "
    row += f"{fmt(zs.get('middleground_Mean')):>8} | "
    row += f"{fmt(zs.get('background_Mean')):>8}"
    print(row)

print("=" * 100)

# 总体统计
if descriptive_stats:
    print(f"\n📊 OVERALL: Mean={descriptive_stats.get('Mean', 0):.2f}{INDICATOR['unit']}, "
          f"Std={descriptive_stats.get('Std', 0):.2f}, N={descriptive_stats.get('N', 0)}")

# 各图层统计
print(f"\n📊 BY LAYER:")
for layer in LAYERS:
    stats = layer_overall_stats.get(layer, {})
    if stats.get('Mean') is not None:
        print(f"   {layer}: Mean={stats['Mean']:.2f}{INDICATOR['unit']}, "
              f"Std={stats.get('Std', 0):.2f}, N={stats.get('N', 0)}")
    else:
        print(f"   {layer}: No data")


# =============================================================================
# 4. COMPLETION MESSAGE
# =============================================================================
print("\n" + "=" * 100)
print(f"✅ {INDICATOR['id']} COMPUTATION COMPLETED!")
print(f"   Output files saved to: {PATHS['output_path']}")
print("=" * 100)
