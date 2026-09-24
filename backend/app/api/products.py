from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db

router = APIRouter(prefix="/api/products", tags=["products"])

@router.get("")
def list_products(db: Session = Depends(get_db)):
    return []

@router.post("")
def create_product(payload: dict, db: Session = Depends(get_db)):
    return {"status": "stub"}

@router.put("/{product_id}")
def update_product(product_id: str, payload: dict, db: Session = Depends(get_db)):
    return {"status": "stub", "id": product_id}

@router.delete("/{product_id}")
def delete_product(product_id: str, db: Session = Depends(get_db)):
    return {"status": "stub", "id": product_id}
