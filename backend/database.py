"""
数据库连接和会话管理模块
提供数据库引擎、会话工厂和依赖注入功能
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.ext.declarative import declarative_base

from config import settings

# 导入模型以确保它们被注册到Base.metadata
from models import Base


def get_database_url() -> str:
    """
    获取数据库连接URL
    根据配置返回相应的数据库URL
    """
    return settings.DATABASE_URL


def create_database_engine():
    """
    创建数据库引擎
    根据配置创建SQLAlchemy引擎实例
    """
    database_url = get_database_url()

    # SQLite特殊配置
    connect_args = {}
    if database_url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}

    # 创建引擎
    engine = create_engine(
        database_url,
        connect_args=connect_args,
        echo=settings.DEBUG,  # 调试模式下显示SQL语句
    )

    return engine


# 创建全局引擎实例
engine = create_database_engine()

# 创建会话工厂
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    class_=Session,
)


def get_db():
    """
    数据库会话依赖注入函数
    用于FastAPI的依赖注入系统，为每个请求提供独立的数据库会话

    Yields:
        Session: SQLAlchemy数据库会话

    Usage:
        @app.get("/items")
        def read_items(db: Session = Depends(get_db)):
            # 使用db会话进行数据库操作
            items = db.query(Item).all()
            return items
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    """
    创建数据库表
    如果表不存在则自动创建（根据模型定义）
    """
    Base.metadata.create_all(bind=engine)


def drop_tables():
    """
    删除数据库表
    注意：仅用于开发和测试环境，生产环境慎用
    """
    Base.metadata.drop_all(bind=engine)


def get_session() -> Session:
    """
    获取数据库会话（手动管理）
    用于非请求上下文中的数据库操作，需要手动关闭会话

    Returns:
        Session: SQLAlchemy数据库会话

    Example:
        db = get_session()
        try:
            # 使用db进行数据库操作
            pass
        finally:
            db.close()
    """
    return SessionLocal()


# 应用启动时自动创建表
create_tables()