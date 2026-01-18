"""
Memento 后端应用主入口文件
基于FastAPI的个人记忆/日记记录系统

主要功能：
1. 用户认证和授权（JWT）
2. 生命周期事件记录（按年-周组织）
3. 图片上传和处理
4. 用户目标管理

模块结构：
- config.py: 配置管理
- models.py: 数据库模型
- database.py: 数据库连接
- auth.py: 认证授权
- utils.py: 工具函数
- routes.py: API路由
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import SessionLocal, create_tables
from auth import create_initial_admin
from routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    应用生命周期管理上下文管理器
    处理应用启动和关闭事件

    Args:
        app: FastAPI应用实例
    """
    # 启动事件
    print("=" * 50)
    print("Memento 后端应用启动中...")
    print(f"环境: {'开发' if settings.DEBUG else '生产'}")
    print(f"数据库: {settings.DATABASE_URL}")
    print(f"运行在: {settings.HOST}:{settings.PORT}")
    print("=" * 50)

    # 确保数据库表存在
    create_tables()

    # 创建默认管理员账户（如果不存在）
    db = SessionLocal()
    try:
        if create_initial_admin(db):
            print(f"已创建默认管理员账户: {settings.DEFAULT_ADMIN_USERNAME}")
        else:
            print("数据库已初始化，跳过管理员创建")
    finally:
        db.close()

    print("应用启动完成，等待请求...")
    print()

    yield  # 应用运行期

    # 关闭事件
    print("应用正在关闭...")


# 创建FastAPI应用实例
app = FastAPI(
    title="Memento API",
    description="个人记忆/日记记录系统后端API",
    version="1.0.0",
    lifespan=lifespan,
    debug=settings.DEBUG,
)

# 挂载静态文件目录（图片访问）
app.mount(
    "/static",
    StaticFiles(directory=settings.upload_dir_path),
    name="static",
)

# 配置CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应限制为特定域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册API路由
app.include_router(router)

# 根路径重定向到API文档
@app.get("/")
async def root():
    """
    根路径重定向

    访问根路径时重定向到交互式API文档页面
    """
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/docs")


@app.get("/info")
async def app_info():
    """
    应用信息接口

    返回应用基本信息、配置状态和运行环境信息
    """
    return {
        "app": "Memento Backend",
        "version": "1.0.0",
        "environment": "development" if settings.DEBUG else "production",
        "database": settings.DATABASE_URL,
        "upload_dirs": {
            "originals": settings.original_dir_path,
            "thumbnails": settings.thumbnail_dir_path,
        },
        "admin_configured": settings.DEFAULT_ADMIN_USERNAME != "admin",
    }


if __name__ == "__main__":
    """
    直接运行入口（开发模式）
    使用: python main.py
    """
    import uvicorn

    print("正在启动开发服务器...")
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info" if settings.DEBUG else "warning",
    )