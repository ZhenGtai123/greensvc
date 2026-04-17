"""Calculator Layer.

Indicator ID:   IND_PED_CNT
Indicator Name: Pedestrian Count
Type:           TYPE E
"""

import numpy as np
from PIL import Image
from typing import Dict
import os


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    "id": "IND_PED_CNT",
    "name": "Pedestrian Count",
    "unit": "count",
    "formula": "Count of instances identified as 'person' using Mask R-CNN",
    "target_direction": "NEUTRAL",
    "definition": "Absolute count of pedestrians/people detected in the scene using Mask R-CNN (He et al., 2017)",
    "category": "CAT_CMP",

    "calc_type": "deep_learning",

    "model_config": {
        "model_type": "MaskRCNN_ResNet50_FPN",
        "score_threshold": 0.5,
        "nms_iou_threshold": 0.5,  # torchvisionNMS
        "max_detections": 100,
        "input_size": None,        # Mask R-CNNresize
        "person_class_id": 1       # COCO: person=1
    },

    # PLACEHOLDER MODE DL
    "use_placeholder": True
}

print(f"\nCalculator ready: {INDICATOR['id']} - {INDICATOR['name']}")
print(f" Mode: {'Placeholder (mask-based)' if INDICATOR.get('use_placeholder', True) else 'Deep Learning'}")


# =============================================================================
# DEEP LEARNING ENVIRONMENT
# =============================================================================
TORCH_AVAILABLE = False
try:
    import torch
    import torchvision.transforms as transforms
    from torchvision.models.detection import maskrcnn_resnet50_fpn
    TORCH_AVAILABLE = True
    print(f" PyTorch: Available (version {torch.__version__})")
except ImportError:
    print(f" PyTorch: Not installed")
    print(f" To enable full DL mode: pip install torch torchvision")


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(image_path: str) -> Dict:
    use_placeholder = INDICATOR.get('use_placeholder', True)

    if use_placeholder or not TORCH_AVAILABLE:
        return calculate_placeholder(image_path)
    else:
        return calculate_deep_learning(image_path)


def calculate_placeholder(image_path: str) -> Dict:
    try:
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img)
        h, w, _ = pixels.shape
        flat = pixels.reshape(-1, 3)

        # person
        person_keys = [
            "person",
            "person;individual;someone;somebody;...",
            "peoples",
            "pedestrian"
        ]

        person_rgb = None
        for k in person_keys:
            if 'semantic_colors' in globals() and k in semantic_colors:
                person_rgb = semantic_colors[k]
                break

        if person_rgb is None:
            return {
                'success': True,
                'value': 0,
                'count': 0,
                'method': 'placeholder_mask_based',
                'note': 'Person class not found in semantic_colors; placeholder returns 0'
            }

        mask = np.all(flat == person_rgb, axis=1).reshape(h, w).astype(np.uint8)

        # 8 - numpy BFS
        visited = np.zeros_like(mask, dtype=np.uint8)
        count = 0

        for y in range(h):
            for x in range(w):
                if mask[y, x] == 1 and visited[y, x] == 0:
                    count += 1
                    stack = [(y, x)]
                    visited[y, x] = 1
                    while stack:
                        cy, cx = stack.pop()
                        for dy in (-1, 0, 1):
                            for dx in (-1, 0, 1):
                                if dy == 0 and dx == 0:
                                    continue
                                ny, nx = cy + dy, cx + dx
                                if 0 <= ny < h and 0 <= nx < w:
                                    if mask[ny, nx] == 1 and visited[ny, nx] == 0:
                                        visited[ny, nx] = 1
                                        stack.append((ny, nx))

        return {
            'success': True,
            'value': int(count),
            'count': int(count),
            'method': 'placeholder_mask_based',
            'note': 'This is a placeholder estimation based on connected components, not Mask R-CNN'
        }

    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'value': None,
            'method': 'placeholder_mask_based'
        }


def calculate_deep_learning(image_path: str) -> Dict:
    try:
        cfg = INDICATOR.get('model_config', {})
        score_thr = float(cfg.get('score_threshold', 0.5))
        max_det = int(cfg.get('max_detections', 100))
        person_id = int(cfg.get('person_class_id', 1))

        # COCO
        model = maskrcnn_resnet50_fpn(pretrained=True)
        model.eval()

        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        model = model.to(device)

        img = Image.open(image_path).convert('RGB')
        img_tensor = transforms.ToTensor()(img).to(device)

        with torch.no_grad():
            outputs = model([img_tensor])[0]

        labels = outputs.get('labels', torch.tensor([])).detach().cpu().numpy().tolist()
        scores = outputs.get('scores', torch.tensor([])).detach().cpu().numpy().tolist()

        # person & threshold
        detections = []
        for lab, sc in zip(labels, scores):
            if int(lab) == person_id and float(sc) >= score_thr:
                detections.append(float(sc))

        detections = sorted(detections, reverse=True)[:max_det]
        count = len(detections)

        return {
            'success': True,
            'value': int(count),
            'count': int(count),
            'method': 'deep_learning',
            'model_type': cfg.get('model_type', 'MaskRCNN_ResNet50_FPN'),
            'device': str(device),
            'score_threshold': score_thr,
            'confidence': {
                'mean_score': round(float(np.mean(detections)), 3) if count > 0 else 0,
                'max_score': round(float(np.max(detections)), 3) if count > 0 else 0
            },
            'detections': [{'score': round(float(s), 4)} for s in detections[:10]]  # 10
        }

    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'value': None,
            'method': 'deep_learning'
        }


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================
def interpret_ped_count(count: int) -> str:
    if count == 0:
        return "No pedestrians detected"
    elif count <= 3:
        return "Few pedestrians"
    elif count <= 10:
        return "Moderate pedestrian presence"
    else:
        return "High pedestrian presence"


# =============================================================================
# TEST CODE
# =============================================================================
if __name__ == "__main__":
    print("\nTesting Pedestrian Count calculator...")

    # PLACEHOLDER MODEpersonmask
    test_img = np.zeros((128, 128, 3), dtype=np.uint8)
    test_path = "/tmp/test_ped_cnt.png"
    Image.fromarray(test_img).save(test_path)

    result = calculate_indicator(test_path)

    print(f"\nTest: blank image")
    print(f" Count: {result.get('value')}")
    print(f" Method: {result.get('method')}")
    if result.get('success'):
        print(f" Interpretation: {interpret_ped_count(int(result.get('value') or 0))}")

    os.remove(test_path)
