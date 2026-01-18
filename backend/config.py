"""
配置管理模块
使用pydantic-settings的BaseSettings管理环境变量配置
支持从.env文件或系统环境变量读取配置
"""

import os
from typing import Optional
from pydantic_settings import BaseSettings
from datetime import date

# 加载.env文件（如果存在）
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # python-dotenv未安装，跳过
    pass


class Settings(BaseSettings):
    """
    应用配置类
    所有配置项都有默认值，可以通过环境变量覆盖
    """

    # 安全配置
    SECRET_KEY: str = "CHANGE_THIS_TO_A_SUPER_SECRET_KEY"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30000

    # 数据库配置
    DATABASE_URL: str = "sqlite:///./data/memento.db"

    # 应用配置
    DEBUG: bool = False
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # 默认管理员账户（仅在首次启动时创建）
    DEFAULT_ADMIN_USERNAME: str = "admin"
    DEFAULT_ADMIN_PASSWORD: str = "admin123"
    DEFAULT_ADMIN_DOB_STR: str = "1990-01-01"  # 格式: YYYY-MM-DD

    @property
    def default_admin_dob(self) -> date:
        """将字符串格式的生日转换为date对象"""
        return date.fromisoformat(self.DEFAULT_ADMIN_DOB_STR)

    # 文件上传配置
    UPLOAD_DIR: str = "./uploads"
    ORIGINAL_DIR: str = "./uploads/originals"
    THUMBNAIL_DIR: str = "./uploads/thumbnails"
    MAX_IMAGE_SIZE_MB: int = 10
    THUMBNAIL_MAX_SIZE: int = 800

    # 自动计算的属性
    @property
    def base_dir(self) -> str:
        """获取项目根目录"""
        return os.path.dirname(os.path.abspath(__file__))

    @property
    def upload_dir_path(self) -> str:
        """获取上传目录的绝对路径"""
        return os.path.join(self.base_dir, self.UPLOAD_DIR.lstrip("./"))

    @property
    def original_dir_path(self) -> str:
        """获取原图目录的绝对路径"""
        return os.path.join(self.base_dir, self.ORIGINAL_DIR.lstrip("./"))

    @property
    def thumbnail_dir_path(self) -> str:
        """获取缩略图目录的绝对路径"""
        return os.path.join(self.base_dir, self.THUMBNAIL_DIR.lstrip("./"))

    @property
    def database_path(self) -> str:
        """获取数据库文件的绝对路径"""
        # 从SQLite URL中提取路径
        if self.DATABASE_URL.startswith("sqlite:///"):
            db_relative_path = self.DATABASE_URL.replace("sqlite:///", "")
            return os.path.join(self.base_dir, db_relative_path)
        return self.DATABASE_URL

    class Config:
        """Pydantic配置"""
        env_file = ".env"
        env_file_encoding = "utf-8"

        @classmethod
        def customise_sources(cls, init_settings, env_settings, file_secret_settings):
            """自定义配置源顺序"""
            return env_settings, init_settings


# 创建全局配置实例
settings = Settings()

# 确保必要的目录存在
def ensure_directories():
    """确保应用运行所需的目录存在"""
    os.makedirs(settings.original_dir_path, exist_ok=True)
    os.makedirs(settings.thumbnail_dir_path, exist_ok=True)

    # 确保数据库目录存在
    db_dir = os.path.dirname(settings.database_path)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)


# 在导入时自动创建目录
ensure_directories()