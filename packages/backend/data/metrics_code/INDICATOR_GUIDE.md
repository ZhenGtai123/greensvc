# GreenSVC 指标模板使用指南

## 📋 模板结构

```
┌─────────────────────────────────────────────────────────────┐
│  INDICATOR 字典        ← 【修改这里】定义指标               │
├─────────────────────────────────────────────────────────────┤
│  PATHS 配置            ← 路径一般不用改                     │
├─────────────────────────────────────────────────────────────┤
│  calculate_indicator() ← 【可选修改】特殊计算逻辑           │
├─────────────────────────────────────────────────────────────┤
│  其他代码              ← 不需要修改                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 指标定义示例

### 1. IND_GVI - 绿视率 (Green View Index)
```python
INDICATOR = {
    "id": "IND_GVI",
    "name": "Green View Index",
    "unit": "%",
    "formula": "(Vegetation_Pixels / Total_Pixels) × 100",
    "target_direction": "INCREASE",
    "target_classes": [
        "Lawn",
        "Herbaceous", 
        "Trees",
        "Shrubs",
        "Aquatic plants (on the water)",
        "Green-covered buildings and structures",
        "Hills, mountains"
    ],
    "calc_type": "ratio"
}
```

### 2. IND_SKY - 天空可见度 (Sky View Index)
```python
INDICATOR = {
    "id": "IND_SKY",
    "name": "Sky View Index",
    "unit": "%",
    "formula": "(Sky_Pixels / Total_Pixels) × 100",
    "target_direction": "INCREASE",  # 或 NEUTRAL，取决于设计目标
    "target_classes": [
        "Sky"
    ],
    "calc_type": "ratio"
}
```

### 3. IND_PAV - 硬质铺装比例 (Pavement Ratio)
```python
INDICATOR = {
    "id": "IND_PAV",
    "name": "Pavement Ratio",
    "unit": "%",
    "formula": "(Pavement_Pixels / Total_Pixels) × 100",
    "target_direction": "DECREASE",  # 通常希望减少硬质铺装
    "target_classes": [
        "Roads",
        "Pavements; pavement, paths, gravel roads, dirt roads, not vehicle plazas"
    ],
    "calc_type": "ratio"
}
```

### 4. IND_WAT - 水体可见度 (Water View Index)
```python
INDICATOR = {
    "id": "IND_WAT",
    "name": "Water View Index",
    "unit": "%",
    "formula": "(Water_Pixels / Total_Pixels) × 100",
    "target_direction": "INCREASE",
    "target_classes": [
        "Water",
        "Waterfalls",
        "Fountains"
    ],
    "calc_type": "ratio"
}
```

### 5. IND_BLD - 建筑可见度 (Building View Index)
```python
INDICATOR = {
    "id": "IND_BLD",
    "name": "Building View Index",
    "unit": "%",
    "formula": "(Building_Pixels / Total_Pixels) × 100",
    "target_direction": "NEUTRAL",
    "target_classes": [
        "Building",
        "Wall",
        "Towers"
    ],
    "calc_type": "ratio"
}
```

### 6. IND_ENCL - 围合度 (Enclosure Index)
```python
INDICATOR = {
    "id": "IND_ENCL",
    "name": "Enclosure Index",
    "unit": "%",
    "formula": "((Total - Sky - Water) / Total) × 100",
    "target_direction": "NEUTRAL",
    "target_classes": [
        "Sky",
        "Water"
    ],
    "calc_type": "inverse_ratio"  # 使用反向比例
}
```

### 7. IND_SHAD - 遮阴元素 (Shade Elements)
```python
INDICATOR = {
    "id": "IND_SHAD",
    "name": "Shade Elements Index",
    "unit": "%",
    "formula": "(Shade_Elements_Pixels / Total_Pixels) × 100",
    "target_direction": "INCREASE",
    "target_classes": [
        "Trees",
        "Awnings; Shades, Pavilions, Structures",
        "Green-covered buildings and structures"
    ],
    "calc_type": "ratio"
}
```

### 8. IND_FURN - 街道家具 (Street Furniture)
```python
INDICATOR = {
    "id": "IND_FURN",
    "name": "Street Furniture Index",
    "unit": "%",
    "formula": "(Furniture_Pixels / Total_Pixels) × 100",
    "target_direction": "INCREASE",
    "target_classes": [
        "Chairs",
        "Bins",
        "Street Lights, Street Lamps",
        "Signs, plaques",
        "Benches"  # 如果有的话
    ],
    "calc_type": "ratio"
}
```

### 9. IND_PERM - 渗透性地面 (Permeable Surface)
```python
INDICATOR = {
    "id": "IND_PERM",
    "name": "Permeable Surface Index",
    "unit": "%",
    "formula": "(Permeable_Pixels / Total_Pixels) × 100",
    "target_direction": "INCREASE",
    "target_classes": [
        "Lawn",
        "Land; Ground",
        "Herbaceous"
    ],
    "calc_type": "ratio"
}
```

### 10. IND_HUM - 人活动度 (Human Activity)
```python
INDICATOR = {
    "id": "IND_HUM",
    "name": "Human Activity Index",
    "unit": "%",
    "formula": "(Human_Pixels / Total_Pixels) × 100",
    "target_direction": "NEUTRAL",
    "target_classes": [
        "People; Individuals; Someone; People and their belongings",
        "Bicycles, Pedal Bikes"
    ],
    "calc_type": "ratio"
}
```

---

## 🧮 计算类型说明

| calc_type | 公式 | 适用场景 |
|-----------|------|----------|
| `ratio` | target / total × 100 | 大多数比例类指标 |
| `inverse_ratio` | (total - target) / total × 100 | 围合度、非XX比例 |
| `count` | target (像素数) | 需要绝对数量时 |
| `density` | target / total × 1000 | 每千像素密度 |
| `custom` | 自定义 | 复杂计算逻辑 |

---

## 📂 可用的语义类别（Semantic Classes）

来自 `Semantic_configuration.json`：

| 类别 | 英文名称 |
|------|----------|
| 天空 | Sky |
| 草坪 | Lawn |
| 草本植物 | Herbaceous |
| 树木 | Trees |
| 灌木 | Shrubs |
| 水体 | Water |
| 地面 | Land; Ground |
| 建筑 | Building |
| 岩石 | Rock; stone |
| 人 | People; Individuals; Someone; People and their belongings |
| 墙 | Wall |
| 道路 | Roads |
| 人行道 | Pavements; pavement, paths, gravel roads, dirt roads, not vehicle plazas |
| 桥 | Bridge |
| 汽车 | Automobiles, cars, motor vehicles, carriages |
| 椅子 | Chairs |
| 基座 | Bases, plinths, pedestals, bases for sculptures and planters |
| 台阶 | Steps, curbs (kerbs, berms, stepping stones), hard barges, retaining walls |
| 围栏 | Fences |
| 标识 | Signs, plaques |
| 垃圾桶 | Bins |
| 塔 | Towers |
| 遮阳棚 | Awnings; Shades, Pavilions, Structures |
| 路灯 | Street Lights, Street Lamps |
| 船 | Boat |
| 喷泉 | Fountains |
| 自行车 | Bicycles, Pedal Bikes |
| 雕塑 | Sculptures, Outdoor Vignettes |
| 码头 | Piers, Docks |
| 水生植物 | Aquatic plants (on the water) |
| 绿色建筑 | Green-covered buildings and structures |
| 对联 | Couplets |
| 河岸 | Riverbanks |
| 山丘 | Hills, mountains |
| 施工设备 | Construction equipment |
| 杆 | Poles |
| 动物 | Animal |
| 纪念碑 | Monuments |
| 门 | Doors |
| 户外运动设施 | Outdoor sports equipment |
| 瀑布 | Waterfalls |
| 亭子 | Pavilion |

---

## 🚀 快速生成新指标的步骤

1. **复制模板** `TEMPLATE_Indicator_Calculator.ipynb`
2. **重命名** 为 `IND_XXX_Calculator.ipynb`
3. **修改 INDICATOR 字典**：
   - `id`: 指标ID
   - `name`: 指标名称
   - `unit`: 单位
   - `formula`: 公式描述
   - `target_direction`: INCREASE/DECREASE/NEUTRAL
   - `target_classes`: 目标语义类别列表
   - `calc_type`: 计算类型
4. **运行所有 cells**
5. **检查输出** JSON 文件

---

## 📝 注意事项

1. **类别名称必须完全匹配** `Semantic_configuration.json` 中的名称
2. **分号前后要注意**：如 `"People; Individuals; Someone..."` 是完整名称
3. **多个类别会自动合并**计算
4. **确保所有 zone 文件夹结构一致**
