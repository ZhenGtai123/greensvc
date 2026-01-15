"""Metrics calculator endpoints"""

import shutil
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query

from app.api.deps import get_metrics_manager, get_metrics_calculator
from app.services.metrics_manager import MetricsManager
from app.services.metrics_calculator import MetricsCalculator
from app.models.metrics import (
    CalculatorInfo,
    CalculationRequest,
    CalculationResult,
    BatchCalculationResponse,
)

router = APIRouter()


@router.get("", response_model=list[CalculatorInfo])
async def list_calculators(
    manager: MetricsManager = Depends(get_metrics_manager),
):
    """List all available calculators"""
    return manager.get_all_calculators()


@router.get("/{indicator_id}", response_model=CalculatorInfo)
async def get_calculator(
    indicator_id: str,
    manager: MetricsManager = Depends(get_metrics_manager),
):
    """Get calculator info by indicator ID"""
    calc = manager.get_calculator(indicator_id)
    if not calc:
        raise HTTPException(status_code=404, detail=f"Calculator not found: {indicator_id}")
    return calc


@router.get("/{indicator_id}/code")
async def get_calculator_code(
    indicator_id: str,
    manager: MetricsManager = Depends(get_metrics_manager),
):
    """Get calculator source code"""
    code = manager.get_calculator_code(indicator_id)
    if not code:
        raise HTTPException(status_code=404, detail=f"Calculator not found: {indicator_id}")
    return {"indicator_id": indicator_id, "code": code}


@router.post("/upload")
async def upload_calculator(
    file: UploadFile = File(...),
    manager: MetricsManager = Depends(get_metrics_manager),
):
    """Upload a new calculator file"""
    # Validate filename
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    if not file.filename.startswith("calculator_layer_") or not file.filename.endswith(".py"):
        raise HTTPException(
            status_code=400,
            detail="Filename must be in format: calculator_layer_IND_XXX.py"
        )

    # Save to temp file first
    with tempfile.NamedTemporaryFile(mode='wb', suffix='.py', delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Try to add calculator
        indicator_id = manager.add_calculator(tmp_path)
        if not indicator_id:
            raise HTTPException(
                status_code=400,
                detail="Failed to parse calculator file. Ensure it has valid INDICATOR dict."
            )

        calc = manager.get_calculator(indicator_id)
        return {
            "success": True,
            "indicator_id": indicator_id,
            "calculator": calc,
        }

    finally:
        # Clean up temp file
        Path(tmp_path).unlink(missing_ok=True)


@router.delete("/{indicator_id}")
async def delete_calculator(
    indicator_id: str,
    manager: MetricsManager = Depends(get_metrics_manager),
):
    """Delete a calculator"""
    if not manager.has_calculator(indicator_id):
        raise HTTPException(status_code=404, detail=f"Calculator not found: {indicator_id}")

    success = manager.remove_calculator(indicator_id)
    return {"success": success, "indicator_id": indicator_id}


@router.post("/calculate", response_model=CalculationResult)
async def calculate_single(
    indicator_id: str = Query(..., description="Indicator ID"),
    image_path: str = Query(..., description="Path to image file"),
    calculator: MetricsCalculator = Depends(get_metrics_calculator),
):
    """Calculate indicator for a single image"""
    # Validate image exists
    if not Path(image_path).exists():
        raise HTTPException(status_code=404, detail=f"Image not found: {image_path}")

    result = calculator.calculate(indicator_id, image_path)
    return result


@router.post("/calculate/batch", response_model=BatchCalculationResponse)
async def calculate_batch(
    request: CalculationRequest,
    calculator: MetricsCalculator = Depends(get_metrics_calculator),
):
    """Calculate indicator for multiple images"""
    # Validate images exist
    missing = [p for p in request.image_paths if not Path(p).exists()]
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"Images not found: {missing[:5]}..."  # Show first 5
        )

    result = calculator.batch_calculate(request.indicator_id, request.image_paths)
    return result


@router.post("/reload")
async def reload_calculators(
    manager: MetricsManager = Depends(get_metrics_manager),
):
    """Rescan and reload all calculators"""
    calculators = manager.scan_calculators()
    return {
        "success": True,
        "calculator_count": len(calculators),
        "calculators": list(calculators.keys()),
    }
