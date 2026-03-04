from sqlalchemy import Column, Integer, String, Text, ARRAY, TIMESTAMP
from datetime import datetime
from database import Base

class RejectedAd(Base):
    __tablename__ = "rejected_ads"

    id = Column(Integer, primary_key=True, index=True)
    platform = Column(String, nullable=False)
    image_url = Column(Text)
    headline = Column(Text)
    description = Column(Text)
    cta = Column(Text)
    verdict = Column(String)
    violations = Column(ARRAY(Text))
    rejection_reason = Column(Text)
    created_at = Column(TIMESTAMP, default=datetime.utcnow)
