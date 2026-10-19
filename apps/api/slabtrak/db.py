from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from slabtrak.config import Settings


def database(settings: Settings):
    # Transaction pooling must not reuse prepared statements from another connection.
    engine = create_engine(
        settings.database_url.get_secret_value(),
        pool_size=2,
        max_overflow=0,
        pool_pre_ping=True,
        connect_args={"prepare_threshold": None, "connect_timeout": 5},
    )
    return engine, sessionmaker(engine, expire_on_commit=False)
