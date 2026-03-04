from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class RejectedAdCreate(BaseModel):
    platform: str
    image_url: Optional[str] = None
    headline: Optional[str] = None
    description: Optional[str] = None
    cta: Optional[str] = None
    verdict: str
    violations: List[str]
    rejection_reason: Optional[str] = None

class RejectedAdOut(RejectedAdCreate):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

