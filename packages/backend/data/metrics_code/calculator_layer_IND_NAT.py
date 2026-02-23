"""
GreenSVC Stage 2.5 - Calculator Layer
================================================
Indicator ID: IND_NAT
Indicator Name: Naturalness Index
Type: TYPE E (Deep Learning)

Description:
    The Naturalness Index (NAT) quantifies the perceived naturalness of 
    a scene using deep learning or rule-based estimation. It measures the 
    degree to which a streetscape appears natural versus artificial/urban.
    
    The indicator considers:
    - Natural elements: vegetation (trees, grass, plants), sky, water, earth
    - Artificial elements: buildings, roads, vehicles, walls, infrastructure
    
    A higher score indicates a more natural-appearing environment, which is 
    associated with psychological restoration, stress reduction, and improved 
    well-being. The naturalness perception is fundamental to understanding 
    urban environmental quality and the restorative potential of streetscapes.

Formula: 
    - Deep Learning Mode: CNN model prediction (0-10 scale)
    - Placeholder Mode: score = natural_ratio × 10 × (1 - artificial_ratio × 0.5)

Variables:
    - natural_ratio: Proportion of natural element pixels
    - artificial_ratio: Proportion of artificial element pixels

⚠️ Notes:
    - Full DL implementation requires PyTorch: pip install torch torchvision
    - Requires pre-trained model file for DL mode
    - GPU support recommended for better performance
    - Placeholder mode uses rule-based estimation for testing
"""

import numpy as np
from PIL import Image
from typing import Dict
import os


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    # Basic Information
    "id": "IND_NAT",
    "name": "Naturalness Index",
    "unit": "score",
    "formula": "Deep Learning Model Prediction / Rule-based Estimation",
    "target_direction": "INCREASE",
    "definition": "Perceived naturalness of the scene based on natural vs artificial element composition",
    "category": "CAT_COM",
    
    # TYPE E Configuration
    "calc_type": "deep_learning",
    
    # Model Configuration (for full DL implementation)
    "model_config": {
        "model_type": "ResNet50",
        "model_path": "./models/naturalness_resnet50.pth",  # Pre-trained model required
        "input_size": (224, 224),
        "normalize": True,
        "mean": [0.485, 0.456, 0.406],
        "std": [0.229, 0.224, 0.225]
    },
    
    # Output Configuration
    "output_type": "regression",
    "output_range": [0, 10],  # Naturalness score range
    
    # Placeholder Mode (used when no model available)
    "use_placeholder": True,  # Set to False to enable full DL implementation
    
    # Natural and Artificial Class Definitions
    "natural_classes": [
        "tree",
        "grass", 
        "plant;flora;plant;life",
        "flower",
        "palm;palm;tree",
        "mountain;mount",
        "water",
        "sea",
        "river",
        "earth;ground",
        "land;ground;soil",
        "sky"
    ],
    "artificial_classes": [
        "building;edifice",
        "house",
        "road;route",
        "sidewalk;pavement",
        "car;auto;automobile;machine;motorcar",
        "bus;autobus;coach;charabanc;double-decker;jitney;motorbus;motorcoach;omnibus;passenger;vehicle",
        "truck;motortruck",
        "wall",
        "fence;fencing",
        "signboard;sign"
    ],
    
    # Additional metadata
    "variables": {
        "natural_ratio": "Proportion of natural element pixels (vegetation, sky, water, etc.)",
        "artificial_ratio": "Proportion of artificial element pixels (buildings, roads, vehicles, etc.)"
    },
    "note": "Higher scores indicate more natural-appearing environments; supports both DL and rule-based modes"
}

print(f"\n✅ Calculator ready: {INDICATOR['id']} - {INDICATOR['name']}")
print(f"   Mode: {'Placeholder (rule-based)' if INDICATOR.get('use_placeholder', True) else 'Deep Learning'}")


# =============================================================================
# DETECT DEEP LEARNING ENVIRONMENT
# =============================================================================
TORCH_AVAILABLE = False
try:
    import torch
    import torchvision.transforms as transforms
    from torchvision import models
    TORCH_AVAILABLE = True
    print(f"   PyTorch: Available (version {torch.__version__})")
except ImportError:
    print(f"   PyTorch: Not installed")
    print(f"   To enable full DL mode: pip install torch torchvision")


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(image_path: str) -> Dict:
    """
    Calculate the Naturalness Index (NAT) for an image.
    
    TYPE E - Deep Learning / Rule-based
    
    Depending on configuration, uses either:
    - Placeholder mode: Rule-based estimation using natural/artificial pixel ratios
    - Full mode: Pre-trained CNN model prediction
    
    Args:
        image_path: Path to the image (semantic segmentation mask for placeholder,
                   original image for DL mode)
        
    Returns:
        dict: Result dictionary containing:
            - 'success' (bool): Whether calculation succeeded
            - 'value' (float): Naturalness score (0-10)
            - 'method' (str): Method used ('placeholder_rule_based' or 'deep_learning')
            - 'natural_ratio' (float): Percentage of natural elements (placeholder only)
            - 'artificial_ratio' (float): Percentage of artificial elements (placeholder only)
            - 'confidence' (float): Model confidence if applicable
            - 'error' (str): Error message if success is False
            
    Example:
        >>> result = calculate_indicator('/path/to/mask.png')
        >>> if result['success']:
        ...     print(f"Naturalness: {result['value']}/10")
        ...     print(f"Interpretation: {interpret_naturalness(result['value'])}")
    """
    use_placeholder = INDICATOR.get('use_placeholder', True)
    
    if use_placeholder or not TORCH_AVAILABLE:
        return calculate_placeholder(image_path)
    else:
        return calculate_deep_learning(image_path)


def calculate_placeholder(image_path: str) -> Dict:
    """
    Placeholder implementation: Rule-based naturalness estimation.
    
    Algorithm:
    1. Count pixels classified as natural elements (vegetation, sky, water, etc.)
    2. Count pixels classified as artificial elements (buildings, roads, vehicles, etc.)
    3. Calculate naturalness score: score = natural_ratio × 10 × (1 - artificial_ratio × 0.5)
    
    Note: This is a placeholder for testing, not a true deep learning prediction.
    """
    try:
        # Step 1: Load the image
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img)
        h, w, _ = pixels.shape
        total_pixels = h * w
        flat_pixels = pixels.reshape(-1, 3)
        
        # Step 2: Count natural element pixels
        natural_classes = INDICATOR.get('natural_classes', [])
        natural_count = 0
        natural_breakdown = {}
        
        for class_name in natural_classes:
            if class_name in semantic_colors:
                rgb = semantic_colors[class_name]
                mask = np.all(flat_pixels == rgb, axis=1)
                count = np.sum(mask)
                if count > 0:
                    natural_breakdown[class_name] = int(count)
                    natural_count += count
        
        # Step 3: Count artificial element pixels
        artificial_classes = INDICATOR.get('artificial_classes', [])
        artificial_count = 0
        artificial_breakdown = {}
        
        for class_name in artificial_classes:
            if class_name in semantic_colors:
                rgb = semantic_colors[class_name]
                mask = np.all(flat_pixels == rgb, axis=1)
                count = np.sum(mask)
                if count > 0:
                    artificial_breakdown[class_name] = int(count)
                    artificial_count += count
        
        # Step 4: Calculate ratios
        natural_ratio = natural_count / total_pixels if total_pixels > 0 else 0
        artificial_ratio = artificial_count / total_pixels if total_pixels > 0 else 0
        
        # Step 5: Calculate naturalness score (0-10)
        # Formula: score = natural_ratio × 10 × (1 - artificial_ratio × 0.5)
        # More natural elements and fewer artificial elements = higher score
        base_score = natural_ratio * 10
        penalty = artificial_ratio * 0.5
        naturalness_score = base_score * (1 - penalty)
        naturalness_score = max(0, min(10, naturalness_score))  # Clamp to 0-10
        
        # Step 6: Return results
        return {
            'success': True,
            'value': round(naturalness_score, 3),
            'method': 'placeholder_rule_based',
            'natural_ratio': round(natural_ratio * 100, 2),
            'artificial_ratio': round(artificial_ratio * 100, 2),
            'natural_pixels': int(natural_count),
            'artificial_pixels': int(artificial_count),
            'total_pixels': int(total_pixels),
            'natural_breakdown': natural_breakdown,
            'artificial_breakdown': artificial_breakdown,
            'note': 'Rule-based estimation (not deep learning prediction)',
            'confidence': None
        }
        
    except FileNotFoundError:
        return {
            'success': False,
            'error': f'Image file not found: {image_path}',
            'value': None,
            'method': 'placeholder_rule_based'
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'value': None,
            'method': 'placeholder_rule_based'
        }


def calculate_deep_learning(image_path: str) -> Dict:
    """
    Full implementation: Deep learning model prediction.
    
    Requires:
    - PyTorch
    - Pre-trained model file
    """
    try:
        model_config = INDICATOR.get('model_config', {})
        model_path = model_config.get('model_path', '')
        
        # Check model file exists
        if not os.path.exists(model_path):
            return {
                'success': False,
                'error': f'Model file not found: {model_path}',
                'value': None,
                'method': 'deep_learning',
                'fallback': 'Set use_placeholder=True or provide model file'
            }
        
        # Create model
        model_type = model_config.get('model_type', 'ResNet50')
        
        if model_type == 'ResNet50':
            model = models.resnet50(pretrained=False)
            model.fc = torch.nn.Linear(model.fc.in_features, 1)  # Regression output
        else:
            raise ValueError(f"Unsupported model type: {model_type}")
        
        # Load weights
        model.load_state_dict(torch.load(model_path, map_location='cpu'))
        model.eval()
        
        # GPU support
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        model = model.to(device)
        
        # Image preprocessing
        input_size = model_config.get('input_size', (224, 224))
        mean = model_config.get('mean', [0.485, 0.456, 0.406])
        std = model_config.get('std', [0.229, 0.224, 0.225])
        
        transform = transforms.Compose([
            transforms.Resize(input_size),
            transforms.ToTensor(),
            transforms.Normalize(mean=mean, std=std)
        ])
        
        # Load and transform image
        img = Image.open(image_path).convert('RGB')
        img_tensor = transform(img).unsqueeze(0).to(device)
        
        # Inference
        with torch.no_grad():
            output = model(img_tensor)
        
        # Process output
        raw_value = float(output.squeeze().cpu().numpy())
        
        # Clamp to output range
        output_range = INDICATOR.get('output_range', [0, 10])
        value = max(output_range[0], min(output_range[1], raw_value))
        
        return {
            'success': True,
            'value': round(value, 3),
            'method': 'deep_learning',
            'model_type': model_type,
            'raw_output': round(raw_value, 4),
            'device': str(device),
            'confidence': None  # Regression model has no confidence
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
def interpret_naturalness(score: float) -> str:
    """Interpret the naturalness score."""
    if score is None:
        return "Unable to interpret (no score)"
    elif score < 2:
        return "Very urban/artificial environment"
    elif score < 4:
        return "Primarily artificial with some natural elements"
    elif score < 6:
        return "Mixed natural and artificial environment"
    elif score < 8:
        return "Primarily natural environment"
    else:
        return "Highly natural environment"


# =============================================================================
# STANDALONE TEST (Optional)
# =============================================================================
if __name__ == "__main__":
    print("\n🧪 Testing Naturalness Index calculator...")
    
    # Create test image - High naturalness (mostly green)
    test_natural = np.zeros((100, 100, 3), dtype=np.uint8)
    if 'grass' in semantic_colors:
        test_natural[0:40, :] = semantic_colors['grass']
    if 'tree' in semantic_colors:
        test_natural[40:70, :] = semantic_colors['tree']
    if 'sky' in semantic_colors:
        test_natural[70:100, :] = semantic_colors['sky']
    
    # Create test image - Low naturalness (mostly buildings)
    test_urban = np.zeros((100, 100, 3), dtype=np.uint8)
    if 'building;edifice' in semantic_colors:
        test_urban[0:50, :] = semantic_colors['building;edifice']
    if 'road;route' in semantic_colors:
        test_urban[50:80, :] = semantic_colors['road;route']
    if 'sky' in semantic_colors:
        test_urban[80:100, :] = semantic_colors['sky']
    
    for name, test_img in [('High naturalness', test_natural), ('Low naturalness', test_urban)]:
        test_path = f'/tmp/test_nat_{name.replace(" ", "_")}.png'
        Image.fromarray(test_img).save(test_path)
        
        result = calculate_indicator(test_path)
        
        print(f"\n   {name}:")
        print(f"      Score: {result['value']}/10")
        print(f"      Method: {result['method']}")
        if 'natural_ratio' in result:
            print(f"      Natural: {result['natural_ratio']}%, Artificial: {result['artificial_ratio']}%")
        print(f"      Interpretation: {interpret_naturalness(result['value'])}")
        
        os.remove(test_path)
    
    print("\n   🧹 Test cleanup complete")
