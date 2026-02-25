"""
API路由模块
定义所有FastAPI路由端点和请求处理函数
"""

from datetime import date, datetime
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, Depends, Form, UploadFile, File, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
from config import settings
from database import get_db
from models import User, Event, Goal, SpecialDay
from auth import (
    authenticate_user,
    create_access_token,
    get_current_user,
    get_current_admin_user,
    create_initial_admin,
)
from utils import process_image, validate_image_size

# 创建API路由组
router = APIRouter(tags=["api"])


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
        # 解析图片路径（支持多张图片，JSON数组或单个字符串）
        import json

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

        # 返回第一张缩略图作为主图（向后兼容），同时返回所有图片
        result[key] = {
            "id": event.id,
            "entry_date": event.entry_date.isoformat(),
            "title": event.title,
            "content": event.content,
            "mood": event.mood,
            "image": thumbnail_paths[0] if thumbnail_paths else None,  # 第一张缩略图（向后兼容）
            "imageOriginal": original_paths[0] if original_paths else None,  # 第一张原图（向后兼容）
            "images": thumbnail_paths,  # 所有缩略图
            "imagesOriginal": original_paths,  # 所有原图
        }

    return result


@router.post("/events")
async def save_event(
    entry_date: str = Form(..., description="记录日期（YYYY-MM-DD）"),
    title: str = Form(None, description="事件标题"),
    content: str = Form(None, description="事件内容"),
    mood: str = Form("neutral", description="心情状态"),
    image: UploadFile = File(None, description="事件图片（单个，向后兼容）"),
    images: List[UploadFile] = File(None, description="事件图片列表（多张）"),
    keep_images: str = Form(None, description="要保留的现有图片URL列表（JSON字符串）"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, str]:
    """
    保存或更新事件

    根据日期创建或更新事件记录，支持图片上传

    Args:
        entry_date: 记录日期
        title: 事件标题（可选）
        content: 事件内容（可选）
        mood: 心情状态（默认"neutral"）
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

    # 更新事件字段
    event.title = title
    event.content = content
    event.mood = mood
    event.updated_at = date.today()

    # 处理图片上传（支持多张图片）
    import json

    all_images = []
    if images:  # 多张图片
        all_images = images
    elif image:  # 向后兼容：单张图片
        all_images = [image]

    original_paths = []
    thumbnail_paths = []

    # 处理新上传的图片
    for img in all_images:
        # 验证图片大小
        validate_image_size(img)

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
    else:
        # 没有图片，清空字段
        event.image_original = None
        event.image_thumbnail = None

    db.commit()

    return {"msg": "事件保存成功"}


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
    today = date.today()
    future_date = date(today.year, today.month, today.day + days)

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
        created_at=date.today()
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
            goal.completed_at = date.today()
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
