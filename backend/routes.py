"""
API路由模块
定义所有FastAPI路由端点和请求处理函数
"""

import json
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Dict, Any, List, Optional
try:
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
except Exception:  # pragma: no cover
    ZoneInfo = None
    ZoneInfoNotFoundError = Exception

from fastapi import APIRouter, Depends, Form, UploadFile, File, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
from config import settings
from database import get_db
from models import User, Event, Goal, SpecialDay, Habit, HabitLog
from auth import (
    authenticate_user,
    create_access_token,
    get_current_user,
    get_current_admin_user,
    create_initial_admin,
)
from utils import process_image, validate_image_size, extract_city_from_image

# 创建API路由组
router = APIRouter(tags=["api"])

try:
    BEIJING_TZ = ZoneInfo("Asia/Shanghai") if ZoneInfo else timezone(timedelta(hours=8), name="Asia/Shanghai")
except ZoneInfoNotFoundError:
    # Windows/Python environments without tzdata still need deterministic Beijing time.
    BEIJING_TZ = timezone(timedelta(hours=8), name="Asia/Shanghai")
SERVER_LOCAL_TZ = datetime.now().astimezone().tzinfo or timezone.utc


def _parse_date(date_str: str, *, field: str = "date") -> date:
    """解析 YYYY-MM-DD 日期字符串。"""
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field} 格式无效，请使用 YYYY-MM-DD"
        )


def _json_list(raw: Optional[str]) -> List[Any]:
    """将 JSON 数组字符串安全解析为列表。"""
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


def _beijing_now() -> datetime:
    return datetime.now(BEIJING_TZ)


def _beijing_today() -> date:
    return _beijing_now().date()


def _to_beijing_iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        # habit_logs.created_at is stored as naive UTC
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(BEIJING_TZ).isoformat(timespec="seconds")


def _normalize_iso_time_to_beijing(raw: Any) -> Any:
    """Normalize ISO datetime text to Asia/Shanghai; keep non-time values unchanged."""
    if not isinstance(raw, str):
        return raw

    text = raw.strip()
    if not text:
        return raw
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"

    try:
        dt = datetime.fromisoformat(text)
    except Exception:
        return raw

    if dt.tzinfo is None:
        # Legacy instant-action values may not carry timezone info.
        # Interpret them in server local timezone, then convert to Beijing.
        dt = dt.replace(tzinfo=SERVER_LOCAL_TZ)

    return dt.astimezone(BEIJING_TZ).isoformat(timespec="seconds")


def _normalize_tags(tags: Optional[List[str]], *, max_count: int = 5, max_length: int = 12) -> List[str]:
    """规范化标签：去重、去空、限制长度和数量。"""
    if tags is None:
        return []
    normalized = []
    seen = set()
    for tag in tags:
        if not isinstance(tag, str):
            continue
        cleaned = tag.strip()
        if not cleaned:
            continue
        if len(cleaned) > max_length:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"标签长度不能超过 {max_length} 个字符"
            )
        lowered = cleaned.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        normalized.append(cleaned)
    if len(normalized) > max_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"标签最多 {max_count} 个"
        )
    return normalized


def _serialize_habit(habit: Habit) -> Dict[str, Any]:
    """序列化 Habit 模型为 API 响应。"""
    frequency_value = None
    if habit.frequency_value:
        try:
            frequency_value = json.loads(habit.frequency_value)
        except Exception:
            frequency_value = None

    return {
        "id": habit.id,
        "name": habit.name,
        "mode": habit.mode,
        "frequency_type": habit.frequency_type,
        "frequency_value": frequency_value,
        "target_value": habit.target_value,
        "unit": habit.unit,
        "tags": _json_list(habit.tags),
        "start_date": habit.start_date.isoformat() if habit.start_date else None,
        "reminder_time": habit.reminder_time,
        "is_active": habit.is_active,
        "created_at": habit.created_at.isoformat() if habit.created_at else None,
    }


def _serialize_habit_log(log: HabitLog, habit: Optional[Habit] = None) -> Dict[str, Any]:
    """序列化 HabitLog 模型为 API 响应。"""
    result = {
        "id": log.id,
        "habit_id": log.habit_id,
        "log_date": log.log_date.isoformat() if log.log_date else None,
        "value": log.value,
        "completed": log.completed,
        "note": log.note,
        "created_at": _to_beijing_iso(log.created_at),
    }
    if habit is not None:
        result.update({
            "habit_name": habit.name,
            "habit_mode": habit.mode,
            "habit_unit": habit.unit,
            "habit_tags": _json_list(habit.tags),
        })
    return result


def _weekly_range(day: date) -> (date, date):
    """返回给定日期所在周（一到日）的起止日期。"""
    week_start = day - timedelta(days=day.weekday())
    week_end = week_start + timedelta(days=6)
    return week_start, week_end


def _is_habit_due_on_date(habit: Habit, check_date: date, db: Session) -> bool:
    """判断某个行为在指定日期是否应打卡。"""
    if not habit.is_active:
        return False
    if habit.start_date and check_date < habit.start_date:
        return False

    frequency_type = habit.frequency_type or "daily"
    frequency_value = None
    if habit.frequency_value:
        try:
            frequency_value = json.loads(habit.frequency_value)
        except Exception:
            frequency_value = None

    if frequency_type == "daily":
        return True

    if frequency_type == "weekly_days":
        if isinstance(frequency_value, list):
            try:
                selected_days = {int(d) for d in frequency_value}
            except Exception:
                selected_days = set()
            return check_date.weekday() in selected_days
        return False

    if frequency_type == "weekly_n":
        times = 1
        if isinstance(frequency_value, dict):
            try:
                times = int(frequency_value.get("times", 1))
            except Exception:
                times = 1
        times = max(1, min(7, times))

        week_start, week_end = _weekly_range(check_date)
        completed_count = db.query(HabitLog).filter(
            HabitLog.habit_id == habit.id,
            HabitLog.log_date >= week_start,
            HabitLog.log_date <= week_end,
            HabitLog.completed == True,  # noqa: E712
        ).count()
        return completed_count < times

    # 未识别频率类型，默认按每日
    return True


def _compute_habit_streak(completed_dates: List[date]) -> int:
    """计算按自然日连续完成天数。"""
    if not completed_dates:
        return 0
    completed_set = set(completed_dates)
    cursor = _beijing_today()
    if cursor not in completed_set:
        cursor = cursor - timedelta(days=1)

    streak = 0
    while cursor in completed_set:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def _normalize_frequency(frequency_type: str, frequency_value: Any) -> Optional[str]:
    """规范化频率并序列化为 JSON 字符串。"""
    if frequency_type == "daily":
        return None

    if frequency_type == "weekly_n":
        try:
            if isinstance(frequency_value, dict):
                times = int(frequency_value.get("times", 1))
            else:
                times = int(frequency_value)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="weekly_n 模式的 frequency_value 必须是 1-7 的整数"
            )
        times = max(1, min(7, times))
        return json.dumps({"times": times}, ensure_ascii=False)

    if frequency_type == "weekly_days":
        days = frequency_value
        if isinstance(days, dict):
            days = days.get("days")
        if not isinstance(days, list) or not days:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="weekly_days 模式的 frequency_value 必须是非空数组"
            )
        try:
            normalized_days = sorted({int(d) for d in days})
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="weekly_days 的取值必须是 0-6 的数字数组"
            )
        if any(d < 0 or d > 6 for d in normalized_days):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="weekly_days 的取值范围必须是 0-6（周一到周日）"
            )
        return json.dumps(normalized_days, ensure_ascii=False)

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="frequency_type 仅支持 daily / weekly_n / weekly_days"
    )


@router.post("/token")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    用户登录接口

    验证用户名和密码，返回JWT访问令牌和用户配置信息

    Args:
        form_data: OAuth2密码请求表单（包含username和password）
        db: 数据库会话

    Returns:
        Dict[str, Any]: 包含访问令牌和用户配置的字典
            - access_token: JWT访问令牌
            - token_type: 令牌类型（固定为"bearer"）
            - user_config: 用户配置信息（生日、预期寿命、管理员状态）

    Raises:
        HTTPException: 用户名或密码错误时抛出400错误
    """
    # 验证用户凭证
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名或密码错误"
        )

    # 创建访问令牌
    token = create_access_token(data={"sub": user.username})

    # 返回令牌和用户配置
    return {
        "access_token": token,
        "token_type": "bearer",
        "user_config": {
            "dob": user.dob,
            "life_expectancy": user.life_expectancy,
            "is_admin": user.is_admin,
            "nickname": user.nickname,
            "avatar_url": user.avatar_url
        }
    }


@router.post("/register")
async def register(
    username: str = Form(..., description="用户名"),
    password: str = Form(..., description="密码"),
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    """
    注册新用户接口（仅管理员可用）

    创建新的普通用户账户

    Args:
        username: 新用户名
        password: 新用户密码
        current_user: 当前管理员用户（通过依赖注入验证）
        db: 数据库会话

    Returns:
        Dict[str, str]: 操作结果消息

    Raises:
        HTTPException:
            - 403: 当前用户不是管理员
            - 400: 用户名已存在
    """
    # 检查用户名是否已存在
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已存在"
        )

    # 导入密码哈希函数（避免循环导入）
    from auth import get_password_hash

    # 创建新用户（普通用户，非管理员）
    new_user = User(
        username=username,
        hashed_password=get_password_hash(password),
        is_admin=False,
    )

    db.add(new_user)
    db.commit()

    return {"msg": "用户创建成功"}


@router.get("/events")
async def get_events(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Dict[str, Any]]:
    """
    获取当前用户的所有事件

    按日期键组织事件数据，便于前端显示

    Args:
        db: 数据库会话
        current_user: 当前用户

    Returns:
        Dict[str, Dict[str, Any]]: 以"YYYY-MM-DD"为键的事件字典
            每个事件包含id、标题、内容、心情、缩略图路径和原图路径
    """
    # 查询当前用户的所有事件
    events = db.query(Event).filter(Event.user_id == current_user.id).all()

    # 转换为前端需要的格式
    result = {}
    for event in events:
        key = event.entry_date.isoformat()

        # 处理缩略图
        thumbnail_paths = []
        if event.image_thumbnail:
            try:
                thumbnail_paths = json.loads(event.image_thumbnail)
                if not isinstance(thumbnail_paths, list):
                    thumbnail_paths = [thumbnail_paths]  # 单个字符串转换为数组
            except:
                thumbnail_paths = [event.image_thumbnail]  # 如果不是JSON，当作单个字符串

        # 处理原图
        original_paths = []
        if event.image_original:
            try:
                original_paths = json.loads(event.image_original)
                if not isinstance(original_paths, list):
                    original_paths = [original_paths]
            except:
                original_paths = [event.image_original]

        instant_actions = []
        if event.instant_actions:
            try:
                parsed_actions = json.loads(event.instant_actions)
                if isinstance(parsed_actions, list):
                    instant_actions = parsed_actions
            except Exception:
                instant_actions = []
        normalized_actions = []
        for item in instant_actions:
            if isinstance(item, dict):
                copied = dict(item)
                copied["created_at"] = _normalize_iso_time_to_beijing(copied.get("created_at"))
                normalized_actions.append(copied)
            else:
                normalized_actions.append(item)

        # 返回第一张缩略图作为主图（向后兼容），同时返回所有图片
        result[key] = {
            "id": event.id,
            "entry_date": event.entry_date.isoformat(),
            "title": event.title,
            "content": event.content,
            "mood": event.mood,
            "city": event.city,
            "image": thumbnail_paths[0] if thumbnail_paths else None,  # 第一张缩略图（向后兼容）
            "imageOriginal": original_paths[0] if original_paths else None,  # 第一张原图（向后兼容）
            "images": thumbnail_paths,  # 所有缩略图
            "imagesOriginal": original_paths,  # 所有原图
            "instantActions": normalized_actions,  # 当日即刻行动记录（北京时间）
        }

    return result


@router.post("/events")
async def save_event(
    entry_date: str = Form(..., description="记录日期（YYYY-MM-DD）"),
    title: str = Form(None, description="事件标题"),
    content: str = Form(None, description="事件内容"),
    mood: Optional[str] = Form(None, description="心情状态"),
    image: UploadFile = File(None, description="事件图片（单个，向后兼容）"),
    images: List[UploadFile] = File(None, description="事件图片列表（多张）"),
    keep_images: str = Form(None, description="要保留的现有图片URL列表（JSON字符串）"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    保存或更新事件

    根据日期创建或更新事件记录，支持图片上传

    Args:
        entry_date: 记录日期
        title: 事件标题（可选）
        content: 事件内容（可选）
        mood: 心情状态（可选：joy/neutral/hard）
        image: 事件图片文件（可选）
        db: 数据库会话
        current_user: 当前用户

    Returns:
        Dict[str, str]: 操作结果消息
    """
    # 解析日期
    try:
        parsed_entry_date = datetime.strptime(entry_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="日期格式无效，请使用YYYY-MM-DD"
        )

    # 查找现有事件
    event = db.query(Event).filter(
        Event.user_id == current_user.id,
        Event.entry_date == parsed_entry_date,
    ).first()

    # 如果不存在则创建新事件
    if not event:
        event = Event(
            user_id=current_user.id,
            entry_date=parsed_entry_date,
        )
        db.add(event)

    valid_moods = {"joy", "neutral", "hard"}
    if mood is not None and mood not in valid_moods:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="心情状态无效"
        )

    # 更新事件字段
    event.title = title
    event.content = content
    event.mood = mood if mood in valid_moods else None
    event.updated_at = _beijing_today()

    # 处理图片上传（支持多张图片）
    all_images = []
    if images:  # 多张图片
        all_images = images
    elif image:  # 向后兼容：单张图片
        all_images = [image]

    original_paths = []
    thumbnail_paths = []
    detected_city = None
    has_new_images = len(all_images) > 0

    # 处理新上传的图片
    for img in all_images:
        # 验证图片大小
        validate_image_size(img)

        # 测试版：尝试从 EXIF GPS 解析城市（取第一张可解析的）
        if detected_city is None:
            detected_city = extract_city_from_image(img)

        # 处理图片（保存原图+生成缩略图）
        paths = process_image(img)
        original_paths.append(paths["original"])
        thumbnail_paths.append(paths["thumbnail"])

    # 处理要保留的现有图片
    keep_images_list = []
    if keep_images:
        try:
            parsed = json.loads(keep_images)
            if isinstance(parsed, list):
                keep_images_list = parsed
        except json.JSONDecodeError:
            # JSON解析失败，忽略keep_images
            pass

    for img_url in keep_images_list:
        if isinstance(img_url, str):
            original_paths.append(img_url)
            # 根据原始URL生成缩略图URL
            # 例如: /static/originals/uuid.jpg -> /static/thumbnails/uuid_thumb.jpg
            if '/originals/' in img_url:
                # 提取文件名部分
                filename = img_url.split('/')[-1]
                # 移除扩展名，添加_thumb.jpg
                name_without_ext = filename.rsplit('.', 1)[0] if '.' in filename else filename
                thumb_filename = f"{name_without_ext}_thumb.jpg"
                thumb_url = img_url.replace('/originals/', '/thumbnails/').replace(filename, thumb_filename)
            else:
                # 如果不是标准路径，使用相同URL（虽然可能不正确）
                thumb_url = img_url
            thumbnail_paths.append(thumb_url)

    # 更新图片字段
    if original_paths:
        # 有图片（新上传的或保留的）
        event.image_original = json.dumps(original_paths)
        event.image_thumbnail = json.dumps(thumbnail_paths)

        # 城市字段更新策略（测试版）
        if detected_city:
            event.city = detected_city
        elif has_new_images and not keep_images_list:
            # 仅有新图且未识别到城市时，清空旧城市，避免误导
            event.city = None
    else:
        # 没有图片，清空字段
        event.image_original = None
        event.image_thumbnail = None
        event.city = None

    db.commit()

    return {"msg": "事件保存成功", "city": event.city}


class InstantActionCreate(BaseModel):
    content: str
    tags: List[str] = []


@router.post("/events/{entry_date}/instant-actions")
async def create_instant_action(
    entry_date: str,
    payload: InstantActionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """为指定日期添加一条即刻行动记录。"""
    target_date = _parse_date(entry_date, field="entry_date")
    if target_date > _beijing_today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不能在未来日期创建即刻行动"
        )

    content = (payload.content or "").strip()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="即刻行动内容不能为空"
        )
    if len(content) > 200:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="即刻行动内容不能超过200个字符"
        )

    tags = _normalize_tags(payload.tags)

    event = db.query(Event).filter(
        Event.user_id == current_user.id,
        Event.entry_date == target_date,
    ).first()
    if not event:
        event = Event(
            user_id=current_user.id,
            entry_date=target_date,
            mood=None,
        )
        db.add(event)
        db.flush()

    instant_actions = _json_list(event.instant_actions)
    new_item = {
        "id": f"ia_{uuid.uuid4().hex[:8]}",
        "content": content,
        "tags": tags,
        "created_at": _beijing_now().isoformat(timespec="seconds"),
    }
    instant_actions.append(new_item)

    event.instant_actions = json.dumps(instant_actions, ensure_ascii=False)
    event.updated_at = _beijing_today()
    db.commit()

    return {"msg": "instant action saved", "item": new_item}


@router.delete("/events/{entry_date}/instant-actions/{action_id}")
async def delete_instant_action(
    entry_date: str,
    action_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除指定日期的一条即刻行动记录。"""
    target_date = _parse_date(entry_date, field="entry_date")

    event = db.query(Event).filter(
        Event.user_id == current_user.id,
        Event.entry_date == target_date,
    ).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="该日期没有可删除的即刻行动记录"
        )

    instant_actions = _json_list(event.instant_actions)
    remaining_actions = [
        item for item in instant_actions
        if not (isinstance(item, dict) and item.get("id") == action_id)
    ]

    if len(remaining_actions) == len(instant_actions):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="即刻行动记录不存在"
        )

    event.instant_actions = json.dumps(remaining_actions, ensure_ascii=False) if remaining_actions else None
    event.updated_at = _beijing_today()
    db.commit()

    return {"msg": "instant action deleted"}


@router.get("/health")
async def health_check() -> Dict[str, str]:
    """
    健康检查接口

    用于监控应用运行状态

    Returns:
        Dict[str, str]: 健康状态信息
    """
    return {"status": "healthy", "service": "memento-backend"}


# --- 新增：更新用户配置的接口 ---
class UserUpdate(BaseModel):
    dob: str
    life_expectancy: int = 100
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None


@router.put("/users/me")
async def update_user_me(user_update: UserUpdate, db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_user)):
    # 将字符串日期 (YYYY-MM-DD) 转换为 Python date 对象
    try:
        new_dob = datetime.strptime(user_update.dob, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")

    current_user.dob = new_dob
    current_user.life_expectancy = user_update.life_expectancy

    # 更新昵称和头像URL（如果提供了）
    if user_update.nickname is not None:
        current_user.nickname = user_update.nickname
    if user_update.avatar_url is not None:
        current_user.avatar_url = user_update.avatar_url

    db.commit()
    return {"msg": "Profile updated", "user_config": {
        "dob": new_dob,
        "life_expectancy": current_user.life_expectancy,
        "nickname": current_user.nickname,
        "avatar_url": current_user.avatar_url
    }}


@router.post("/users/me/avatar")
async def upload_avatar(
    avatar: UploadFile = File(..., description="头像图片文件"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    上传用户头像

    Args:
        avatar: 头像图片文件
        db: 数据库会话
        current_user: 当前用户

    Returns:
        Dict: 包含头像URL的响应
    """
    import os
    import uuid
    from PIL import Image, ImageOps
    import io

    # 验证文件类型
    allowed_types = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if avatar.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="不支持的图片格式，请上传 JPG、PNG、GIF 或 WebP 格式")

    # 读取文件内容
    content = await avatar.read()

    # 验证文件大小（最大5MB）
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="图片大小不能超过 5MB")

    try:
        # 使用 PIL 处理图片
        img = Image.open(io.BytesIO(content))

        # 应用EXIF方向校正
        img = ImageOps.exif_transpose(img)

        # 转换为 RGB（如果是 RGBA 或其他模式）
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')

        # 裁剪为正方形（居中裁剪）
        width, height = img.size
        min_dim = min(width, height)
        left = (width - min_dim) // 2
        top = (height - min_dim) // 2
        img = img.crop((left, top, left + min_dim, top + min_dim))

        # 缩放到 200x200
        img = img.resize((200, 200), Image.Resampling.LANCZOS)

        # 生成唯一文件名
        filename = f"avatar_{current_user.id}_{uuid.uuid4().hex[:8]}.jpg"

        # 确保头像目录存在
        avatar_dir = os.path.join(settings.UPLOAD_DIR, "avatars")
        os.makedirs(avatar_dir, exist_ok=True)

        # 保存文件
        filepath = os.path.join(avatar_dir, filename)
        img.save(filepath, "JPEG", quality=90)

        # 更新用户头像URL
        avatar_url = f"/static/avatars/{filename}"
        current_user.avatar_url = avatar_url
        db.commit()

        return {
            "msg": "头像上传成功",
            "avatar_url": avatar_url
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"图片处理失败: {str(e)}")


# --- 纪念日/计划日管理接口 ---
class SpecialDayCreate(BaseModel):
    title: str
    date: str  # YYYY-MM-DD格式
    type: str = "anniversary"
    repeat_yearly: bool = True
    notify_days_before: int = 0

class SpecialDayUpdate(BaseModel):
    title: Optional[str] = None
    date: Optional[str] = None
    type: Optional[str] = None
    repeat_yearly: Optional[bool] = None
    notify_days_before: Optional[int] = None


# --- 目标管理接口 ---
class GoalCreate(BaseModel):
    text: str
    completed: bool = False
    completed_at: Optional[str] = None  # YYYY-MM-DD格式
    week_year: Optional[int] = None
    week_index: Optional[int] = None

class GoalUpdate(BaseModel):
    text: Optional[str] = None
    completed: Optional[bool] = None
    completed_at: Optional[str] = None  # YYYY-MM-DD格式
    week_year: Optional[int] = None
    week_index: Optional[int] = None


@router.get("/special-days")
async def get_special_days(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取当前用户的所有纪念日/计划日"""
    special_days = db.query(SpecialDay).filter(SpecialDay.user_id == current_user.id).all()
    return [
        {
            "id": day.id,
            "title": day.title,
            "date": day.date.isoformat() if day.date else None,
            "type": day.type,
            "repeat_yearly": day.repeat_yearly,
            "notify_days_before": day.notify_days_before,
            "created_at": day.created_at.isoformat() if day.created_at else None
        }
        for day in special_days
    ]


@router.post("/special-days")
async def create_special_day(
    special_day: SpecialDayCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """创建新的纪念日/计划日"""
    # 验证日期格式
    try:
        date_obj = datetime.strptime(special_day.date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")

    # 创建记录
    db_special_day = SpecialDay(
        user_id=current_user.id,
        title=special_day.title,
        date=date_obj,
        type=special_day.type,
        repeat_yearly=special_day.repeat_yearly,
        notify_days_before=special_day.notify_days_before
    )
    db.add(db_special_day)
    db.commit()
    db.refresh(db_special_day)

    return {
        "id": db_special_day.id,
        "title": db_special_day.title,
        "date": db_special_day.date.isoformat() if db_special_day.date else None,
        "type": db_special_day.type,
        "repeat_yearly": db_special_day.repeat_yearly,
        "notify_days_before": db_special_day.notify_days_before,
        "created_at": db_special_day.created_at.isoformat() if db_special_day.created_at else None
    }


@router.put("/special-days/{special_day_id}")
async def update_special_day(
    special_day_id: int,
    special_day_update: SpecialDayUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """更新纪念日/计划日"""
    # 查找记录
    db_special_day = db.query(SpecialDay).filter(
        SpecialDay.id == special_day_id,
        SpecialDay.user_id == current_user.id
    ).first()
    if not db_special_day:
        raise HTTPException(status_code=404, detail="Special day not found")

    # 更新字段
    if special_day_update.title is not None:
        db_special_day.title = special_day_update.title
    if special_day_update.date is not None:
        try:
            date_obj = datetime.strptime(special_day_update.date, "%Y-%m-%d").date()
            db_special_day.date = date_obj
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format")
    if special_day_update.type is not None:
        db_special_day.type = special_day_update.type
    if special_day_update.repeat_yearly is not None:
        db_special_day.repeat_yearly = special_day_update.repeat_yearly
    if special_day_update.notify_days_before is not None:
        db_special_day.notify_days_before = special_day_update.notify_days_before

    db.commit()
    db.refresh(db_special_day)

    return {
        "id": db_special_day.id,
        "title": db_special_day.title,
        "date": db_special_day.date.isoformat() if db_special_day.date else None,
        "type": db_special_day.type,
        "repeat_yearly": db_special_day.repeat_yearly,
        "notify_days_before": db_special_day.notify_days_before,
        "created_at": db_special_day.created_at.isoformat() if db_special_day.created_at else None
    }


@router.delete("/special-days/{special_day_id}")
async def delete_special_day(
    special_day_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """删除纪念日/计划日"""
    db_special_day = db.query(SpecialDay).filter(
        SpecialDay.id == special_day_id,
        SpecialDay.user_id == current_user.id
    ).first()
    if not db_special_day:
        raise HTTPException(status_code=404, detail="Special day not found")

    db.delete(db_special_day)
    db.commit()
    return {"msg": "Special day deleted"}


@router.get("/special-days/upcoming")
async def get_upcoming_special_days(
    days: int = 7,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取即将到来的纪念日/计划日（未来N天内）"""
    today = _beijing_today()
    future_date = today + timedelta(days=days)

    # 获取用户的所有纪念日
    all_special_days = db.query(SpecialDay).filter(SpecialDay.user_id == current_user.id).all()
    upcoming = []

    for day in all_special_days:
        # 计算今年的日期
        this_year_date = date(today.year, day.date.month, day.date.day)
        # 如果今年的日期已过，且重复每年，则计算明年
        if this_year_date < today and day.repeat_yearly:
            this_year_date = date(today.year + 1, day.date.month, day.date.day)

        # 检查是否在时间范围内
        if today <= this_year_date <= future_date:
            days_until = (this_year_date - today).days
            upcoming.append({
                "id": day.id,
                "title": day.title,
                "date": this_year_date.isoformat(),
                "type": day.type,
                "repeat_yearly": day.repeat_yearly,
                "notify_days_before": day.notify_days_before,
                "days_until": days_until,
                "original_date": day.date.isoformat()
            })

    # 按日期排序
    upcoming.sort(key=lambda x: x["date"])
    return upcoming


@router.get("/goals")
async def get_goals(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取当前用户的所有目标"""
    goals = db.query(Goal).filter(Goal.user_id == current_user.id).all()
    return [
        {
            "id": goal.id,
            "text": goal.text,
            "completed": goal.completed,
            "completed_at": goal.completed_at.isoformat() if goal.completed_at else None,
            "week_year": goal.week_year,
            "week_index": goal.week_index,
            "created_at": goal.created_at.isoformat() if goal.created_at else None
        }
        for goal in goals
    ]


@router.post("/goals")
async def create_goal(
    goal: GoalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """创建新的目标"""
    # 解析完成时间
    completed_at_date = None
    if goal.completed_at:
        try:
            completed_at_date = date.fromisoformat(goal.completed_at)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="日期格式无效，请使用YYYY-MM-DD格式"
            )

    # 创建目标记录
    new_goal = Goal(
        user_id=current_user.id,
        text=goal.text,
        completed=goal.completed,
        completed_at=completed_at_date,
        week_year=goal.week_year,
        week_index=goal.week_index,
        created_at=_beijing_today()
    )

    db.add(new_goal)
    db.commit()
    db.refresh(new_goal)

    return {
        "id": new_goal.id,
        "text": new_goal.text,
        "completed": new_goal.completed,
        "completed_at": new_goal.completed_at.isoformat() if new_goal.completed_at else None,
        "week_year": new_goal.week_year,
        "week_index": new_goal.week_index,
        "created_at": new_goal.created_at.isoformat() if new_goal.created_at else None
    }


@router.put("/goals/{goal_id}")
async def update_goal(
    goal_id: int,
    goal_update: GoalUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """更新目标"""
    # 查找目标
    goal = db.query(Goal).filter(
        Goal.id == goal_id,
        Goal.user_id == current_user.id
    ).first()

    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="目标不存在"
        )

    # 更新字段
    if goal_update.text is not None:
        goal.text = goal_update.text
    if goal_update.completed is not None:
        goal.completed = goal_update.completed

        # 如果标记为完成且没有完成时间，设置为当前时间
        if goal_update.completed and goal.completed_at is None:
            goal.completed_at = _beijing_today()
        # 如果取消完成，清除完成时间
        elif not goal_update.completed:
            goal.completed_at = None

    # 解析完成时间（如果提供）
    if goal_update.completed_at is not None:
        try:
            goal.completed_at = date.fromisoformat(goal_update.completed_at)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="日期格式无效，请使用YYYY-MM-DD格式"
            )

    if goal_update.week_year is not None:
        goal.week_year = goal_update.week_year
    if goal_update.week_index is not None:
        goal.week_index = goal_update.week_index

    db.commit()
    db.refresh(goal)

    return {
        "id": goal.id,
        "text": goal.text,
        "completed": goal.completed,
        "completed_at": goal.completed_at.isoformat() if goal.completed_at else None,
        "week_year": goal.week_year,
        "week_index": goal.week_index,
        "created_at": goal.created_at.isoformat() if goal.created_at else None
    }


@router.delete("/goals/{goal_id}")
async def delete_goal(
    goal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """删除目标"""
    goal = db.query(Goal).filter(
        Goal.id == goal_id,
        Goal.user_id == current_user.id
    ).first()

    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="目标不存在"
        )

    db.delete(goal)
    db.commit()

    return {"msg": "目标删除成功"}


class HabitCreate(BaseModel):
    name: str
    mode: str = "binary"
    frequency_type: str = "daily"
    frequency_value: Optional[Any] = None
    target_value: Optional[int] = None
    unit: Optional[str] = None
    tags: List[str] = []
    start_date: Optional[str] = None
    reminder_time: Optional[str] = None


class HabitUpdate(BaseModel):
    name: Optional[str] = None
    mode: Optional[str] = None
    frequency_type: Optional[str] = None
    frequency_value: Optional[Any] = None
    target_value: Optional[int] = None
    unit: Optional[str] = None
    tags: Optional[List[str]] = None
    start_date: Optional[str] = None
    reminder_time: Optional[str] = None
    is_active: Optional[bool] = None


class HabitLogUpsert(BaseModel):
    log_date: Optional[str] = None
    value: Optional[int] = None
    completed: Optional[bool] = None
    note: Optional[str] = None


@router.post("/habits")
async def create_habit(
    payload: HabitCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """创建长期行为。"""
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="行为名称不能为空")
    if len(name) > 60:
        raise HTTPException(status_code=400, detail="行为名称不能超过60个字符")

    mode = (payload.mode or "binary").strip().lower()
    if mode not in {"binary", "quantity"}:
        raise HTTPException(status_code=400, detail="mode 仅支持 binary / quantity")

    frequency_type = (payload.frequency_type or "daily").strip().lower()
    frequency_value = _normalize_frequency(frequency_type, payload.frequency_value)

    tags = _normalize_tags(payload.tags)
    start_date = _parse_date(payload.start_date, field="start_date") if payload.start_date else _beijing_today()

    target_value = payload.target_value
    unit = (payload.unit or "").strip() or None
    if mode == "quantity":
        if target_value is None or target_value <= 0:
            raise HTTPException(status_code=400, detail="计量型行为必须设置大于0的目标值")
        if not unit:
            raise HTTPException(status_code=400, detail="计量型行为必须设置单位")
    else:
        target_value = None
        unit = None

    habit = Habit(
        user_id=current_user.id,
        name=name,
        mode=mode,
        frequency_type=frequency_type,
        frequency_value=frequency_value,
        target_value=target_value,
        unit=unit,
        tags=json.dumps(tags, ensure_ascii=False),
        start_date=start_date,
        reminder_time=(payload.reminder_time or "").strip() or None,
        is_active=True,
        created_at=_beijing_today(),
    )
    db.add(habit)
    db.commit()
    db.refresh(habit)

    return _serialize_habit(habit)


@router.get("/habits")
async def get_habits(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取当前用户的长期行为列表。"""
    query = db.query(Habit).filter(Habit.user_id == current_user.id)
    if not include_inactive:
        query = query.filter(Habit.is_active == True)  # noqa: E712
    habits = query.order_by(Habit.created_at.desc(), Habit.id.desc()).all()
    return [_serialize_habit(habit) for habit in habits]


@router.put("/habits/{habit_id}")
async def update_habit(
    habit_id: int,
    payload: HabitUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """更新长期行为配置。"""
    habit = db.query(Habit).filter(
        Habit.id == habit_id,
        Habit.user_id == current_user.id,
    ).first()
    if not habit:
        raise HTTPException(status_code=404, detail="行为不存在")

    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="行为名称不能为空")
        if len(name) > 60:
            raise HTTPException(status_code=400, detail="行为名称不能超过60个字符")
        habit.name = name

    if payload.mode is not None:
        mode = payload.mode.strip().lower()
        if mode not in {"binary", "quantity"}:
            raise HTTPException(status_code=400, detail="mode 仅支持 binary / quantity")
        habit.mode = mode

    if payload.frequency_type is not None or payload.frequency_value is not None:
        new_frequency_type = (payload.frequency_type or habit.frequency_type or "daily").strip().lower()
        existing_frequency_value = None
        if habit.frequency_value:
            try:
                existing_frequency_value = json.loads(habit.frequency_value)
            except Exception:
                existing_frequency_value = None
        new_frequency_value_input = payload.frequency_value if payload.frequency_value is not None else existing_frequency_value
        habit.frequency_type = new_frequency_type
        habit.frequency_value = _normalize_frequency(new_frequency_type, new_frequency_value_input)

    if payload.target_value is not None:
        if payload.target_value <= 0:
            raise HTTPException(status_code=400, detail="目标值必须大于0")
        habit.target_value = payload.target_value

    if payload.unit is not None:
        habit.unit = payload.unit.strip() or None

    if payload.tags is not None:
        habit.tags = json.dumps(_normalize_tags(payload.tags), ensure_ascii=False)

    if payload.start_date is not None:
        habit.start_date = _parse_date(payload.start_date, field="start_date")

    if payload.reminder_time is not None:
        habit.reminder_time = payload.reminder_time.strip() or None

    if payload.is_active is not None:
        habit.is_active = payload.is_active

    if habit.mode == "quantity":
        if not habit.target_value or habit.target_value <= 0:
            raise HTTPException(status_code=400, detail="计量型行为必须设置目标值")
        if not habit.unit:
            raise HTTPException(status_code=400, detail="计量型行为必须设置单位")
    else:
        habit.target_value = None
        habit.unit = None

    db.commit()
    db.refresh(habit)
    return _serialize_habit(habit)


@router.delete("/habits/{habit_id}")
async def delete_habit(
    habit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """停用长期行为（软删除）。"""
    habit = db.query(Habit).filter(
        Habit.id == habit_id,
        Habit.user_id == current_user.id,
    ).first()
    if not habit:
        raise HTTPException(status_code=404, detail="行为不存在")

    habit.is_active = False
    db.commit()
    return {"msg": "habit deactivated"}


@router.post("/habits/{habit_id}/logs")
async def upsert_habit_log(
    habit_id: int,
    payload: HabitLogUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """新增或更新某个行为在某天的打卡记录。"""
    habit = db.query(Habit).filter(
        Habit.id == habit_id,
        Habit.user_id == current_user.id,
        Habit.is_active == True,  # noqa: E712
    ).first()
    if not habit:
        raise HTTPException(status_code=404, detail="行为不存在或已停用")

    log_date = _parse_date(payload.log_date, field="log_date") if payload.log_date else _beijing_today()
    if log_date > _beijing_today():
        raise HTTPException(status_code=400, detail="不能记录未来日期的打卡")
    if habit.start_date and log_date < habit.start_date:
        raise HTTPException(status_code=400, detail="不能记录开始日期之前的打卡")

    if payload.value is not None and payload.value < 0:
        raise HTTPException(status_code=400, detail="打卡数值不能为负数")

    log = db.query(HabitLog).filter(
        HabitLog.habit_id == habit.id,
        HabitLog.log_date == log_date,
    ).first()

    value = payload.value if payload.value is not None else (log.value if log else None)

    if habit.mode == "binary":
        completed = payload.completed if payload.completed is not None else True
    else:
        if value is None:
            raise HTTPException(status_code=400, detail="计量型行为必须提供数值")
        target = habit.target_value or 0
        completed = payload.completed if payload.completed is not None else (value >= target if target > 0 else value > 0)

    note = payload.note.strip() if isinstance(payload.note, str) else payload.note

    if not log:
        log = HabitLog(
            habit_id=habit.id,
            user_id=current_user.id,
            log_date=log_date,
            value=value,
            completed=bool(completed),
            note=note,
            created_at=datetime.utcnow(),
        )
        db.add(log)
    else:
        log.value = value
        log.completed = bool(completed)
        log.note = note

    db.commit()
    db.refresh(log)
    return _serialize_habit_log(log, habit)


@router.delete("/habits/{habit_id}/logs/{log_date}")
async def delete_habit_log(
    habit_id: int,
    log_date: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除某个行为在指定日期的打卡记录。"""
    target_date = _parse_date(log_date, field="log_date")

    habit = db.query(Habit).filter(
        Habit.id == habit_id,
        Habit.user_id == current_user.id,
    ).first()
    if not habit:
        raise HTTPException(status_code=404, detail="行为不存在")

    log = db.query(HabitLog).filter(
        HabitLog.habit_id == habit.id,
        HabitLog.log_date == target_date,
    ).first()
    if not log:
        raise HTTPException(status_code=404, detail="打卡记录不存在")

    db.delete(log)
    db.commit()
    return {"msg": "habit log deleted"}


@router.get("/habits/today")
async def get_today_habits(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取今日长期行为打卡状态。"""
    today = _beijing_today()
    habits = db.query(Habit).filter(
        Habit.user_id == current_user.id,
        Habit.is_active == True,  # noqa: E712
    ).order_by(Habit.created_at.desc(), Habit.id.desc()).all()

    today_logs = db.query(HabitLog).filter(
        HabitLog.user_id == current_user.id,
        HabitLog.log_date == today,
    ).all()
    today_log_map = {log.habit_id: log for log in today_logs}

    result = []
    for habit in habits:
        due_today = _is_habit_due_on_date(habit, today, db)
        today_log = today_log_map.get(habit.id)

        # 如果今天无需打卡且没有今日日志，则不出现在今日卡片中
        if not due_today and not today_log:
            continue

        completed_logs = db.query(HabitLog).filter(
            HabitLog.habit_id == habit.id,
            HabitLog.completed == True,  # noqa: E712
        ).order_by(HabitLog.log_date.asc()).all()
        completed_dates = [log.log_date for log in completed_logs]

        item = _serialize_habit(habit)
        item.update({
            "due_today": due_today,
            "today": _serialize_habit_log(today_log, habit) if today_log else None,
            "streak_days": _compute_habit_streak(completed_dates),
            "total_completed": len(completed_dates),
        })
        result.append(item)

    return result


@router.get("/habits/logs/{log_date}")
async def get_habit_logs_by_date(
    log_date: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取指定日期的打卡日志（用于日记页面展示）。"""
    target_date = _parse_date(log_date, field="log_date")

    logs = db.query(HabitLog).filter(
        HabitLog.user_id == current_user.id,
        HabitLog.log_date == target_date,
    ).order_by(HabitLog.created_at.desc()).all()

    if not logs:
        return []

    habit_ids = {log.habit_id for log in logs}
    habits = db.query(Habit).filter(Habit.id.in_(habit_ids)).all()
    habit_map = {habit.id: habit for habit in habits}

    return [_serialize_habit_log(log, habit_map.get(log.habit_id)) for log in logs]


@router.get("/habits/{habit_id}/stats")
async def get_habit_stats(
    habit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取单个长期行为的统计信息。"""
    habit = db.query(Habit).filter(
        Habit.id == habit_id,
        Habit.user_id == current_user.id,
    ).first()
    if not habit:
        raise HTTPException(status_code=404, detail="行为不存在")

    completed_logs = db.query(HabitLog).filter(
        HabitLog.habit_id == habit.id,
        HabitLog.completed == True,  # noqa: E712
    ).order_by(HabitLog.log_date.asc()).all()
    completed_dates = [log.log_date for log in completed_logs]

    today = _beijing_today()
    range_start = today - timedelta(days=29)
    recent_logs = db.query(HabitLog).filter(
        HabitLog.habit_id == habit.id,
        HabitLog.log_date >= range_start,
        HabitLog.log_date <= today,
    ).all()
    recent_map = {log.log_date: log for log in recent_logs}

    recent_30_days = []
    for i in range(30):
        day = range_start + timedelta(days=i)
        log = recent_map.get(day)
        recent_30_days.append({
            "date": day.isoformat(),
            "completed": bool(log.completed) if log else False,
            "value": log.value if log else None,
        })

    return {
        "habit": _serialize_habit(habit),
        "streak_days": _compute_habit_streak(completed_dates),
        "total_completed": len(completed_dates),
        "recent_30_days": recent_30_days,
    }


# --- 密码修改接口 ---
class PasswordChange(BaseModel):
    old_password: str
    new_password: str
    confirm_password: str


@router.put("/users/me/password")
async def change_password(
    password_change: PasswordChange,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    修改用户密码

    Args:
        password_change: 密码修改请求数据
        db: 数据库会话
        current_user: 当前用户

    Returns:
        Dict[str, str]: 操作结果消息

    Raises:
        HTTPException:
            - 400: 旧密码错误、新密码格式错误或两次输入不一致
    """
    # 验证旧密码
    from auth import verify_password
    if not verify_password(password_change.old_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="旧密码错误"
        )

    # 验证新密码与确认密码是否一致
    if password_change.new_password != password_change.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="新密码与确认密码不一致"
        )

    # 验证新密码长度（至少6位）
    if len(password_change.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="新密码长度至少为6位"
        )

    # 生成新密码哈希
    from auth import get_password_hash
    current_user.hashed_password = get_password_hash(password_change.new_password)

    db.commit()

    return {"msg": "密码修改成功"}
