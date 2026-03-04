from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from models import RejectedAd
from schemas import RejectedAdCreate


async def create_rejected_ad(db: AsyncSession, ad: RejectedAdCreate):
    new_ad = RejectedAd(**ad.dict())
    db.add(new_ad)
    await db.commit()
    await db.refresh(new_ad)
    return new_ad


async def get_all_rejected_ads(db: AsyncSession):
    result = await db.execute(select(RejectedAd))
    return result.scalars().all()
