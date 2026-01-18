"""
用户认证和授权模块
处理密码哈希、JWT令牌生成和验证、用户身份验证等功能
"""

from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from models import User

# 密码哈希上下文
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2密码Bearer方案（用于token获取）
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    验证明文密码与哈希密码是否匹配

    Args:
        plain_password: 明文密码
        hashed_password: 哈希后的密码

    Returns:
        bool: 密码是否匹配
    """
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """
    生成密码哈希值

    Args:
        password: 明文密码

    Returns:
        str: 哈希后的密码
    """
    return pwd_context.hash(password)


def create_access_token(data: dict) -> str:
    """
    创建JWT访问令牌

    Args:
        data: 要编码到令牌中的数据字典

    Returns:
        str: 编码后的JWT令牌
    """
    to_encode = data.copy()

    # 添加过期时间
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})

    # 使用配置的密钥和算法编码
    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM
    )

    return encoded_jwt


def authenticate_user(db: Session, username: str, password: str) -> Optional[User]:
    """
    验证用户凭证

    Args:
        db: 数据库会话
        username: 用户名
        password: 密码

    Returns:
        Optional[User]: 验证成功的用户对象，失败返回None
    """
    # 查询用户
    user = db.query(User).filter(User.username == username).first()

    # 用户不存在或密码不匹配
    if not user or not verify_password(password, user.hashed_password):
        return None

    return user


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """
    获取当前认证用户（FastAPI依赖注入）

    从JWT令牌中提取用户名，然后从数据库获取用户信息

    Args:
        token: JWT令牌（通过OAuth2依赖自动获取）
        db: 数据库会话（通过依赖注入）

    Returns:
        User: 当前用户对象

    Raises:
        HTTPException: 令牌无效或用户不存在时抛出401错误
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无效的认证凭证",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        # 解码JWT令牌
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )

        # 提取用户名
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception

    except JWTError:
        raise credentials_exception

    # 查询用户
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception

    return user


def get_current_admin_user(current_user: User = Depends(get_current_user)) -> User:
    """
    获取当前管理员用户（FastAPI依赖注入）

    验证当前用户是否为管理员

    Args:
        current_user: 当前用户对象（通过依赖注入）

    Returns:
        User: 管理员用户对象

    Raises:
        HTTPException: 用户不是管理员时抛出403错误
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理员权限"
        )

    return current_user


def create_initial_admin(db: Session) -> bool:
    """
    创建初始管理员账户（如果不存在）

    Args:
        db: 数据库会话

    Returns:
        bool: 是否创建了管理员账户
    """
    # 检查是否已存在用户
    if db.query(User).first():
        return False

    # 创建管理员账户
    admin_user = User(
        username=settings.DEFAULT_ADMIN_USERNAME,
        hashed_password=get_password_hash(settings.DEFAULT_ADMIN_PASSWORD),
        is_admin=True,
        dob=settings.default_admin_dob,
    )

    db.add(admin_user)
    db.commit()

    print(f"已创建默认管理员账户: {settings.DEFAULT_ADMIN_USERNAME} / {settings.DEFAULT_ADMIN_PASSWORD}")

    return True