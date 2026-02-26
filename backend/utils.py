"""
工具函数模块
包含图片处理、文件操作等通用功能
"""

import os
import shutil
import uuid
import json
from typing import Dict, Optional, Tuple
from urllib.parse import urlencode
from urllib.request import Request, urlopen

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


def _to_float(value) -> Optional[float]:
    """将 EXIF 的有理数值安全转换为 float。"""
    if value is None:
        return None

    # PIL 的 IFDRational 支持直接 float(value)
    try:
        return float(value)
    except Exception:
        pass

    if isinstance(value, (tuple, list)) and len(value) == 2:
        numerator, denominator = value
        try:
            denominator_float = float(denominator)
            if denominator_float == 0:
                return None
            return float(numerator) / denominator_float
        except Exception:
            return None
    return None


def _dms_to_degrees(dms_value) -> Optional[float]:
    """将度分秒坐标转换为十进制度。"""
    if not isinstance(dms_value, (tuple, list)) or len(dms_value) != 3:
        return None

    degrees = _to_float(dms_value[0])
    minutes = _to_float(dms_value[1])
    seconds = _to_float(dms_value[2])

    if degrees is None or minutes is None or seconds is None:
        return None

    return degrees + (minutes / 60.0) + (seconds / 3600.0)


def extract_gps_coordinates(file: UploadFile) -> Optional[Tuple[float, float]]:
    """
    从图片 EXIF 中提取 GPS 经纬度。

    返回:
        (lat, lon) 或 None
    """
    try:
        file.file.seek(0)
        with Image.open(file.file) as img:
            exif = img.getexif()
            if not exif:
                return None

            # 34853 = GPSInfo
            gps_info = exif.get_ifd(34853) if hasattr(exif, "get_ifd") else exif.get(34853)
            if not gps_info:
                return None

            lat_ref = gps_info.get(1)  # N/S
            lat_dms = gps_info.get(2)
            lon_ref = gps_info.get(3)  # E/W
            lon_dms = gps_info.get(4)

            if isinstance(lat_ref, bytes):
                lat_ref = lat_ref.decode("utf-8", errors="ignore")
            if isinstance(lon_ref, bytes):
                lon_ref = lon_ref.decode("utf-8", errors="ignore")

            lat = _dms_to_degrees(lat_dms)
            lon = _dms_to_degrees(lon_dms)
            if lat is None or lon is None:
                return None

            if str(lat_ref).upper() == "S":
                lat = -lat
            if str(lon_ref).upper() == "W":
                lon = -lon

            return lat, lon
    except Exception:
        return None
    finally:
        # 还原指针，避免影响后续保存流程
        try:
            file.file.seek(0)
        except Exception:
            pass


def reverse_geocode_city(lat: float, lon: float) -> Optional[str]:
    """
    逆地理编码到城市（测试版：使用 Nominatim）。

    失败时返回 None，不中断主流程。
    """
    try:
        params = urlencode({
            "format": "jsonv2",
            "lat": f"{lat:.8f}",
            "lon": f"{lon:.8f}",
            "zoom": 10,
            "addressdetails": 1,
            "accept-language": "zh-CN,zh",
        })
        url = f"https://nominatim.openstreetmap.org/reverse?{params}"
        req = Request(url, headers={"User-Agent": "memento/1.0 city-extractor"})

        with urlopen(req, timeout=5) as resp:
            raw = resp.read().decode("utf-8", errors="ignore")
            data = json.loads(raw)

        address = data.get("address", {})
        city = (
            address.get("city")
            or address.get("town")
            or address.get("municipality")
            or address.get("county")
            or address.get("state")
        )
        if not city:
            return None

        return str(city).strip() or None
    except Exception:
        return None


def extract_city_from_image(file: UploadFile) -> Optional[str]:
    """
    一步提取图片城市信息：
    EXIF GPS -> 逆地理编码（市级）。
    """
    coords = extract_gps_coordinates(file)
    if not coords:
        return None
    lat, lon = coords
    return reverse_geocode_city(lat, lon)
