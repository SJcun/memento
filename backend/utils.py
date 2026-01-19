"""
工具函数模块
包含图片处理、文件操作等通用功能
"""

import os
import shutil
import uuid
from typing import Dict

from fastapi import UploadFile, HTTPException, status
from PIL import Image, ImageOps

from config import settings


def process_image(file: UploadFile) -> Dict[str, str]:
    """
    处理上传的图片文件

    功能：
    1. 验证图片格式
    2. 保存原始图片
    3. 生成压缩缩略图（最大800px）
    4. 返回原图和缩略图的访问路径

    Args:
        file: FastAPI UploadFile对象

    Returns:
        Dict[str, str]: 包含原图和缩略图路径的字典
            - "original": 原图访问路径
            - "thumbnail": 缩略图访问路径

    Raises:
        HTTPException: 文件格式不支持时抛出400错误
    """
    # 验证文件格式
    allowed_extensions = {"jpg", "jpeg", "png", "webp"}
    filename = file.filename or "image"
    ext = filename.split(".")[-1].lower() if "." in filename else ""

    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的文件格式。允许的格式: {', '.join(allowed_extensions)}"
        )

    # 生成唯一文件名
    unique_name = str(uuid.uuid4())
    original_filename = f"{unique_name}.{ext}"
    thumb_filename = f"{unique_name}_thumb.jpg"  # 缩略图统一使用jpg格式以提高效率

    # 构建文件路径
    original_path = os.path.join(settings.original_dir_path, original_filename)
    thumb_path = os.path.join(settings.thumbnail_dir_path, thumb_filename)

    try:
        # 重置文件指针到开头（确保可以读取）
        file.file.seek(0)

        # 1. 打开图片并应用EXIF方向校正
        with Image.open(file.file) as img:
            # 应用EXIF方向校正
            img = ImageOps.exif_transpose(img)

            # 保存校正后的原始图片（保持原始格式）
            # 根据图片格式决定保存格式，如果未知则使用扩展名
            if img.format:
                img.save(original_path, format=img.format)
            else:
                # 如果图片没有format属性，使用原始扩展名
                img.save(original_path)

            # 2. 生成缩略图
            # 处理透明通道（PNG等格式），缩略图统一转换为RGB
            if img.mode in ("RGBA", "P"):
                thumb_img = img.convert("RGB")
            else:
                thumb_img = img.copy()

            # 调整尺寸：最大800px宽或高
            thumb_img.thumbnail((settings.THUMBNAIL_MAX_SIZE, settings.THUMBNAIL_MAX_SIZE))

            # 保存缩略图（压缩质量70%）
            thumb_img.save(thumb_path, "JPEG", quality=70)

    except Exception as e:
        # 清理可能已创建的文件
        for path in [original_path, thumb_path]:
            if os.path.exists(path):
                os.remove(path)

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"图片处理失败: {str(e)}"
        )

    # 返回访问路径（相对于静态文件目录）
    return {
        "original": f"/static/originals/{original_filename}",
        "thumbnail": f"/static/thumbnails/{thumb_filename}",
    }


def validate_image_size(file: UploadFile) -> bool:
    """
    验证图片文件大小

    Args:
        file: FastAPI UploadFile对象

    Returns:
        bool: 文件大小是否在限制内

    Raises:
        HTTPException: 文件过大时抛出400错误
    """
    # 获取文件大小（字节）
    file.file.seek(0, 2)  # 移动到文件末尾
    file_size = file.file.tell()
    file.file.seek(0)  # 重置文件指针

    # 转换为MB
    size_mb = file_size / (1024 * 1024)

    if size_mb > settings.MAX_IMAGE_SIZE_MB:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"图片文件过大。最大允许: {settings.MAX_IMAGE_SIZE_MB}MB"
        )

    return True


def get_file_extension(filename: str) -> str:
    """
    获取文件扩展名（小写）

    Args:
        filename: 文件名

    Returns:
        str: 文件扩展名（不带点号）
    """
    if "." not in filename:
        return ""
    return filename.split(".")[-1].lower()


def ensure_directory_exists(directory_path: str):
    """
    确保目录存在，如果不存在则创建

    Args:
        directory_path: 目录路径
    """
    os.makedirs(directory_path, exist_ok=True)


def safe_delete_file(file_path: str):
    """
    安全删除文件（如果存在）

    Args:
        file_path: 文件路径
    """
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception:
        # 忽略删除错误
        pass