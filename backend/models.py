"""
数据库模型定义模块
包含所有SQLAlchemy ORM模型类
"""

from datetime import date
from sqlalchemy import Column, Integer, String, Text, Boolean, Date, ForeignKey, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base

# 创建声明性基类
Base = declarative_base()


class User(Base):
    """
    用户模型
    存储用户基本信息、认证信息和生命周期配置
    """

    __tablename__ = "users"

    # 主键和索引
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)

    # 认证信息
    hashed_password = Column(String, nullable=False)
    is_admin = Column(Boolean, default=False)

    # 生命周期配置
    dob = Column(Date, nullable=True, comment="用户出生日期")
    life_expectancy = Column(Integer, default=100, comment="预期寿命（年）")

    # 用户资料
    nickname = Column(String, nullable=True, comment="用户昵称")
    avatar_url = Column(String, nullable=True, comment="用户头像URL")

    # 关系（由SQLAlchemy自动处理）
    # events = relationship("Event", back_populates="user")
    # goals = relationship("Goal", back_populates="user")

    def __repr__(self):
        return f"<User(id={self.id}, username='{self.username}', nickname='{self.nickname}', is_admin={self.is_admin})>"


class Event(Base):
    """
    事件记录模型
    按年-周索引存储用户的生命事件记录
    """

    __tablename__ = "events"
    __table_args__ = (
        UniqueConstraint("user_id", "entry_date", name="uq_events_user_entry_date"),
    )

    # 主键和索引
    id = Column(Integer, primary_key=True, index=True)

    # 外键关联
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # 时间索引（日记）
    entry_date = Column(Date, nullable=False, index=True, comment="记录日期")

    # 事件内容
    title = Column(String, nullable=True, comment="事件标题")
    content = Column(Text, nullable=True, comment="事件详细内容")
    mood = Column(String, default="neutral", comment="心情状态")

    # 图片存储路径（JSON数组字符串，存储多个图片路径）
    image_original = Column(Text, nullable=True, comment="原始图片路径数组（JSON格式）")
    image_thumbnail = Column(Text, nullable=True, comment="缩略图路径数组（JSON格式）")

    # 时间戳
    updated_at = Column(Date, default=date.today, comment="最后更新时间")

    # 关系（由SQLAlchemy自动处理）
    # user = relationship("User", back_populates="events")

    def __repr__(self):
        return f"<Event(id={self.id}, user_id={self.user_id}, date={self.entry_date})>"

    @property
    def date_key(self):
        """获取日期键（用于前端索引）"""
        return self.entry_date.isoformat()


class Goal(Base):
    """
    用户目标模型
    存储用户的个人目标和完成状态
    """

    __tablename__ = "goals"

    # 主键和索引
    id = Column(Integer, primary_key=True, index=True)

    # 外键关联
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # 目标内容
    text = Column(String, nullable=False, comment="目标描述")
    completed = Column(Boolean, default=False, comment="完成状态")

    # 完成相关信息
    completed_at = Column(Date, nullable=True, comment="完成时间")
    week_year = Column(Integer, nullable=True, comment="完成时的年份索引")
    week_index = Column(Integer, nullable=True, comment="完成时的周索引")

    # 时间戳
    created_at = Column(Date, default=date.today, comment="创建时间")

    # 关系（由SQLAlchemy自动处理）
    # user = relationship("User", back_populates="goals")

    def __repr__(self):
        return f"<Goal(id={self.id}, user_id={self.user_id}, text='{self.text[:20]}...')>"


class SpecialDay(Base):
    """
    纪念日/计划日模型
    存储用户的特殊日期（纪念日、计划日等）
    """

    __tablename__ = "special_days"

    # 主键和索引
    id = Column(Integer, primary_key=True, index=True)

    # 外键关联
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # 日期信息
    title = Column(String, nullable=False, comment="事件标题")
    date = Column(Date, nullable=False, comment="日期")
    type = Column(String, nullable=False, default="anniversary", comment="类型: anniversary(纪念日)或plan(计划日)")
    repeat_yearly = Column(Boolean, default=True, comment="是否每年重复")
    notify_days_before = Column(Integer, default=0, comment="提前几天提醒（0=不提醒）")

    # 时间戳
    created_at = Column(Date, default=lambda: date.today(), comment="创建时间")

    def __repr__(self):
        return f"<SpecialDay(id={self.id}, user_id={self.user_id}, title='{self.title}', date='{self.date}')>"
