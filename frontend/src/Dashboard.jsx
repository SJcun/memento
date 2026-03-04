import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Clock, Moon, Calendar, CalendarDays, Heart, Smile, Frown, Plus, X, Save, Trash2,
  MoreHorizontal, Info, ChevronLeft, ChevronRight, CheckCircle2, Circle,
  Target, Image as ImageIcon, Upload, Link as LinkIcon, LayoutGrid,
  Download, FileText, Maximize2, LogOut, UserPlus, Zap
} from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';
import emojisZhData from 'emoji-picker-react/dist/data/emojis-zh';
import axios from 'axios';
import { fetchGoals, createGoal, updateGoal, deleteGoal, updateUserPassword } from './api';

// --- API Definitions (已内联以修复导入错误) ---

const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user_config');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

const fetchEvents = async () => {
  const res = await api.get('/events');
  return res.data;
};

const saveEventToBackend = async (entryDate, data) => {
  const formData = new FormData();
  formData.append('entry_date', entryDate);
  if (data.title) formData.append('title', data.title);
  if (data.content) formData.append('content', data.content);
  if (data.mood) formData.append('mood', data.mood);

  // 上传多个图片文件
  if (data.imageFiles && data.imageFiles.length > 0) {
    data.imageFiles.forEach(file => {
      formData.append('images', file); // 后端期望 'images' 字段接收多个文件
    });
  }

  // 鍙戦€佽淇濈暀鐨勭幇鏈夊浘鐗嘦RL锛堣繃婊ゆ帀null/鏃犳晥鍊硷級
  if (data.imagesOriginal && Array.isArray(data.imagesOriginal)) {
    const validOriginalUrls = data.imagesOriginal.filter(url => url && typeof url === 'string' && url.trim() !== '');
    formData.append('keep_images', JSON.stringify(validOriginalUrls));
  } else {
    // 濡傛灉娌℃湁鐜版湁鍥剧墖锛屽彂閫佺┖鏁扮粍浠ユ竻绌哄凡鍒犻櫎鐨勫浘鐗?
    formData.append('keep_images', JSON.stringify([]));
  }

  const res = await api.post('/events', formData);
  return res.data;
};

const registerUser = async (username, password) => {
    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);
    const res = await api.post('/register', formData);
    return res.data;
}

const updateUserConfig = async (dob, lifeExpectancy = 100) => {
    const res = await api.put('/users/me', {
        dob: dob,
        life_expectancy: lifeExpectancy
    });
    return res.data;
}

const updateUserProfile = async (dob, lifeExpectancy = 100, nickname = null, avatar_url = null) => {
    const res = await api.put('/users/me', {
        dob: dob,
        life_expectancy: lifeExpectancy,
        nickname: nickname,
        avatar_url: avatar_url
    });
    return res.data;
}

// 头像上传API
const uploadAvatar = async (file) => {
    const formData = new FormData();
    formData.append('avatar', file);
    const res = await api.post('/users/me/avatar', formData);
    return res.data;
}

// --- 绾康鏃?璁″垝鏃PI ---
const fetchSpecialDays = async () => {
    const res = await api.get('/special-days');
    return res.data;
}

const createSpecialDay = async (specialDay) => {
    const res = await api.post('/special-days', specialDay);
    return res.data;
}

const updateSpecialDay = async (id, specialDayUpdate) => {
    const res = await api.put(`/special-days/${id}`, specialDayUpdate);
    return res.data;
}

const deleteSpecialDay = async (id) => {
    const res = await api.delete(`/special-days/${id}`);
    return res.data;
}

const fetchUpcomingSpecialDays = async (days = 7) => {
    const res = await api.get(`/special-days/upcoming?days=${days}`);
    return res.data;
}

// --- 即刻行动 API ---
const createInstantAction = async (entryDate, content, tags = []) => {
    const res = await api.post(`/events/${entryDate}/instant-actions`, {
        content,
        tags
    });
    return res.data;
}

const deleteInstantAction = async (entryDate, actionId) => {
    const res = await api.delete(`/events/${entryDate}/instant-actions/${actionId}`);
    return res.data;
}

// --- 长期行为打卡 API ---
const createHabit = async (habitData) => {
    const res = await api.post('/habits', habitData);
    return res.data;
}

const finishHabit = async (habitId) => {
    const res = await api.delete(`/habits/${habitId}`);
    return res.data;
}

const fetchTodayHabits = async () => {
    const res = await api.get('/habits/today');
    return res.data;
}

const upsertHabitLog = async (habitId, payload) => {
    const res = await api.post(`/habits/${habitId}/logs`, payload);
    return res.data;
}

const deleteHabitLog = async (habitId, logDate) => {
    const res = await api.delete(`/habits/${habitId}/logs/${logDate}`);
    return res.data;
}

const fetchHabitLogsByDate = async (logDate) => {
    const res = await api.get(`/habits/logs/${logDate}`);
    return res.data;
}

// --- 鍔ㄦ€佸姞杞藉鍑哄簱 ---
const loadScript = (src) => {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const script = document.createElement('script');
    script.src = src; script.onload = resolve; script.onerror = reject;
    document.head.appendChild(script);
  });
};

const loadExportLibraries = async () => {
  try {
    await Promise.all([
      loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'),
      loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'),
      loadScript('https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js')
    ]);
    return true;
  } catch { return false; }
};

// --- 工具函数 ---
// 情绪映射配置
const moodConfig = {
  'joy': { label: '开心 😊', color: 'bg-green-500 border-green-600' },
  'neutral': { label: '一般 😐', color: 'bg-yellow-500 border-yellow-600' },
  'hard': { label: '艰难 😔', color: 'bg-red-500 border-red-600' }
};

const moodDistributionMeta = [
  { key: 'joy', label: '开心', color: '#22c55e', dotClass: 'bg-green-500' },
  { key: 'neutral', label: '一般', color: '#eab308', dotClass: 'bg-yellow-500' },
  { key: 'hard', label: '艰难', color: '#ef4444', dotClass: 'bg-red-500' },
  { key: 'unmarked', label: '未标注情绪', color: '#71717a', dotClass: 'bg-neutral-500' },
];

const moodValueMap = {
  unmarked: 0,
  hard: 1,
  neutral: 2,
  joy: 3,
};

const moodValueLabelMap = {
  0: '未填写',
  1: '艰难',
  2: '一般',
  3: '开心',
};

const moodColorByValue = {
  0: '#52525b',
  1: '#ef4444',
  2: '#eab308',
  3: '#22c55e',
};

const emojiPickerCategories = [
  { category: 'suggested', name: '常用' },
  { category: 'smileys_people', name: '笑脸与人物' },
  { category: 'animals_nature', name: '动物与自然' },
  { category: 'food_drink', name: '食物与饮品' },
  { category: 'travel_places', name: '旅行与地点' },
  { category: 'activities', name: '活动' },
  { category: 'objects', name: '物品' },
  { category: 'symbols', name: '符号' },
  { category: 'flags', name: '旗帜' }
];

const emojiPickerPreviewConfig = {
  defaultCaption: '你今天心情如何？',
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = MS_PER_DAY * 7;
const diffInDays = (d1, d2) => Math.floor((d1 - d2) / MS_PER_DAY);
const diffInWeeks = (d1, d2) => Math.floor((d1 - d2) / MS_PER_WEEK);
const formatDate = (dateLike) => {
  const date = new Date(dateLike);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const formatTimeLabel = (dateTimeLike) => {
  if (!dateTimeLike) return '--:--';
  const dt = new Date(dateTimeLike);
  if (Number.isNaN(dt.getTime())) return '--:--';
  return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
};

const parseDateKey = (dateKey) => {
  if (typeof dateKey !== 'string') return null;
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
};

const calculateLifeClock = (dob, lifeExpectancy = 100) => {
  const now = new Date();
  const birth = new Date(dob);
  const totalLifeDays = lifeExpectancy * 365.25;
  const daysLived = diffInDays(now, birth);
  const progress = Math.max(0, Math.min(1, daysLived / totalLifeDays));
  const totalMinutes = 1440 * progress;
  return {
    time: `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(Math.floor(totalMinutes % 60)).padStart(2, '0')}`,
    progress: (progress * 100).toFixed(1)
  };
};

const Card = ({ children, className = "", onClick }) => (
  <div className={`bg-neutral-800/50 backdrop-blur-sm border border-neutral-700/50 rounded-xl p-6 ${className}`} onClick={onClick}>
    {children}
  </div>
);

const Modal = ({ isOpen, onClose, title, children, maxWidth = "max-w-md" }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className={`bg-neutral-900 border border-neutral-700 rounded-2xl w-full ${maxWidth} shadow-2xl animate-in fade-in zoom-in-95 duration-200 my-8 max-h-[90vh] flex flex-col`}>
        <div className="flex justify-between items-center p-4 border-b border-neutral-800 sticky top-0 bg-neutral-900 z-10 rounded-t-2xl shrink-0">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-neutral-800 rounded-full transition-colors text-neutral-400">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};

export default function Dashboard({ userConfig, onLogout }) {
  const [config, setConfig] = useState(userConfig || {});
  const [events, setEvents] = useState({}); // 从后端获取的 Map
  const [chronicles, setChronicles] = useState(() => JSON.parse(localStorage.getItem('memento_chronicles') || '[]'));
  const [goals, setGoals] = useState([]);
  const [specialDays, setSpecialDays] = useState([]);
  const [upcomingReminders, setUpcomingReminders] = useState([]);
  const [todayHabits, setTodayHabits] = useState([]);

  // 即刻行动相关
  const [isInstantActionModalOpen, setIsInstantActionModalOpen] = useState(false);
  const [isSavingInstantAction, setIsSavingInstantAction] = useState(false);
  const [instantActionForm, setInstantActionForm] = useState({ content: '', tags: [], tagInput: '' });
  const [todayInstantTagFilter, setTodayInstantTagFilter] = useState('全部');

  // 长期行为打卡相关
  const [isHabitModalOpen, setIsHabitModalOpen] = useState(false);
  const [isCreatingHabit, setIsCreatingHabit] = useState(false);
  const [habitForm, setHabitForm] = useState({
    name: '',
    mode: 'binary',
    frequencyType: 'daily',
    frequencyTimes: 3,
    weeklyDays: [],
    targetValue: '',
    unit: '分钟',
    tags: [],
    tagInput: '',
    startDate: formatDate(new Date()),
    reminderTime: ''
  });
  const [habitValueDrafts, setHabitValueDrafts] = useState({});
  const [selectedDateHabitLogs, setSelectedDateHabitLogs] = useState([]);
  const [isLoadingHabitLogs, setIsLoadingHabitLogs] = useState(false);

  const [selectedDate, setSelectedDate] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  // 琛ㄦ儏閫夋嫨鍣ㄧ姸鎬?
  const [showTitleEmojiPicker, setShowTitleEmojiPicker] = useState(false);
  const [showContentEmojiPicker, setShowContentEmojiPicker] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false);
  const [previewImageSrc, setPreviewImageSrc] = useState(null);
  const [isPreviewFullScreen, setIsPreviewFullScreen] = useState(false);
  const [isGalleryFullScreen, setIsGalleryFullScreen] = useState(false);
  const [moodTrendHover, setMoodTrendHover] = useState(null);
  const [moodPieHoverKey, setMoodPieHoverKey] = useState(null);
  
  // 绠＄悊鍛樻敞鍐岀浉鍏?
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ username: '', password: '' });
  // 用户信息编辑相关
  const [isUserProfileModalOpen, setIsUserProfileModalOpen] = useState(false);
  const [userProfile, setUserProfile] = useState({
    nickname: config.nickname || config.username || '用户',
    avatar: config.avatar_url || config.avatar || ''
  });
  // 修改密码相关
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  // 绾康鏃?璁″垝鏃ョ浉鍏?
  const [isSpecialDaysModalOpen, setIsSpecialDaysModalOpen] = useState(false);
  const [tempSpecialDay, setTempSpecialDay] = useState({
    title: '',
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    day: new Date().getDate(),
    type: 'anniversary'
  });
  // 日历相关
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [calendarView, setCalendarView] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() });
  const [heatmapYear, setHeatmapYear] = useState(new Date().getFullYear());
  const quickInstantTags = ['运动', '学习', '工作', '家务', '社交'];
  const quickHabitTags = ['健康', '学习', '工作', '家庭', '成长'];
  const weekDayOptions = [
    { value: 0, label: '一' },
    { value: 1, label: '二' },
    { value: 2, label: '三' },
    { value: 3, label: '四' },
    { value: 4, label: '五' },
    { value: 5, label: '六' },
    { value: 6, label: '日' }
  ];
  const todayDateKey = formatDate(new Date());

  // 杈呭姪鍑芥暟锛氳绠楃粰瀹氱洰鏍囨棩鏈熸椂鐨勫勾榫勶紙瀹屾暣骞存暟锛?
  const getAgeAtDate = (targetDate) => {
    if (!config || !config.dob) return 0;
    let birthDate;
    if (typeof config.dob === 'string') {
      const dobParts = config.dob.split('-');
      birthDate = new Date(parseInt(dobParts[0]), parseInt(dobParts[1]) - 1, parseInt(dobParts[2]));
    } else {
      birthDate = new Date(config.dob);
    }
    const today = new Date(targetDate);
    let age = today.getFullYear() - birthDate.getFullYear();
    // 如果今年的生日还没到，年龄减1
    const thisYearBirthday = new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate());
    if (today < thisYearBirthday) {
      age -= 1;
    }
    return Math.max(0, age);
  };

  const [exportRange, setExportRange] = useState({ start: '', end: '' });

  // 涓存椂鐘舵€?
  const [tempEvent, setTempEvent] = useState({ title: '', content: '', mood: 'neutral', city: null, images: [], imagesOriginal: [], imageFiles: [] });
  const [tempGoal, setTempGoal] = useState('');
  const [dobYear, setDobYear] = useState(new Date().getFullYear() - 25); // 榛樿25宀?
  const [dobMonth, setDobMonth] = useState(1); // 1-12
  const [dobDay, setDobDay] = useState(1); // 1-31
  const [titleSelection, setTitleSelection] = useState({ start: null, end: null });
  const [contentSelection, setContentSelection] = useState({ start: null, end: null });
  const fileInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const titleInputRef = useRef(null);
  const contentTextareaRef = useRef(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // 鍒濆鍖栧姞杞芥暟鎹?
  useEffect(() => {
    if (config && config.dob && !isNaN(new Date(config.dob).getTime())) {
        setExportRange({ start: config.dob, end: formatDate(new Date()) });

        // 2. 浠庡悗绔姞杞芥暟鎹?
        fetchEvents().then(data => {
            setEvents(data);
        }).catch(err => console.error("加载数据失败", err));

        fetchTodayHabits().then(data => {
            setTodayHabits(Array.isArray(data) ? data : []);
        }).catch(err => console.error("加载今日打卡失败", err));
    }
  }, [config]);

  // 鍔犺浇鐩爣鏁版嵁锛堝寘鍚粠localStorage杩佺Щ锛?
  useEffect(() => {
    if (!config) return;

    const migrateLocalGoals = async () => {
      try {
        // 妫€鏌ocalStorage涓槸鍚︽湁鏃ф暟鎹?
        const localGoalsStr = localStorage.getItem('memento_goals');
        if (localGoalsStr) {
          const localGoals = JSON.parse(localGoalsStr);
          if (Array.isArray(localGoals) && localGoals.length > 0) {
            console.log(`鍙戠幇 ${localGoals.length} 涓湰鍦扮洰鏍囷紝寮€濮嬭縼绉诲埌浜戠...`);

            // 閫愪釜杩佺Щ鐩爣鍒板悗绔?
            for (const localGoal of localGoals) {
              try {
                const goalData = {
                  text: localGoal.text,
                  completed: localGoal.completed,
                  completed_at: localGoal.completedAt ?
                    localGoal.completedAt.split('T')[0] : null, // 转换为YYYY-MM-DD格式
                  week_year: localGoal.weekYear,
                  week_index: localGoal.weekIndex
                };

                await createGoal(goalData);
              } catch (err) {
                console.error(`迁移目标失败: ${localGoal.text}`, err);
              }
            }

            console.log('目标迁移完成，清除本地存储');
            localStorage.removeItem('memento_goals');
          }
        }
      } catch (err) {
        console.error('目标迁移过程中出错', err);
      }
    };

    const loadGoals = async () => {
      try {
        // 首先尝试迁移本地数据（如果存在）
        await migrateLocalGoals();

        // 鐒跺悗浠庡悗绔姞杞芥暟鎹?
        const data = await fetchGoals();
        // 转换字段名：从蛇形命名法转换为camelCase
        const convertedData = data.map(goal => ({
          id: goal.id,
          text: goal.text,
          completed: goal.completed,
          completedAt: goal.completed_at, // snake_case -> camelCase
          weekYear: goal.week_year, // snake_case -> camelCase
          weekIndex: goal.week_index, // snake_case -> camelCase
          createdAt: goal.created_at // snake_case -> camelCase
        }));
        setGoals(convertedData);
      } catch (err) {
        console.error("加载目标数据失败", err);
      }
    };

    loadGoals();
  }, [config]);

  // 鏈湴鎸佷箙鍖?(浠?Chronicles 瀛樺偍鍦ㄦ湰鍦帮紝鍥犱负 Events 鍜?Goals 宸蹭笂浜?
  useEffect(() => { localStorage.setItem('memento_chronicles', JSON.stringify(chronicles)); }, [chronicles]);

  // 更新用户信息
  useEffect(() => {
    if (config) {
      setUserProfile({
        nickname: config.nickname || config.username || '用户',
        avatar: config.avatar_url || config.avatar || ''
      });
      // 更新出生日期输入字段
      if (config.dob) {
        const dobDate = new Date(config.dob);
        setDobYear(dobDate.getFullYear());
        setDobMonth(dobDate.getMonth() + 1); // 鏈堜唤浠?寮€濮?
        setDobDay(dobDate.getDate());
      }
    }
  }, [config]);

  // 鍔犺浇绾康鏃ユ暟鎹?
  useEffect(() => {
    if (config && config.dob) {
      fetchSpecialDays().then(data => {
        setSpecialDays(data);
      }).catch(err => console.error('加载纪念日失败', err));
    }
  }, [config]);

  // 妫€鏌ョ邯蹇垫棩鎻愰啋
  useEffect(() => {
    if (specialDays.length > 0) {
      fetchUpcomingSpecialDays(7).then(data => {
        setUpcomingReminders(data);
        // 显示通知
        if (data.length > 0) {
          const notificationMessage = `你有 ${data.length} 个即将到来的纪念日：\n` +
            data.map(d => `${d.title}（${d.days_until}天后）`).join('\n');
          alert(notificationMessage);
          // 鏈潵鍙互鏀逛负娴忚鍣ㄩ€氱煡
          // if (Notification.permission === "granted") {
          //   new Notification("绾康鏃ユ彁閱?, { body: notificationMessage });
          // }
        }
      }).catch(err => console.error('检查提醒失败', err));
    }
  }, [specialDays]);

  // 璁＄畻灞炴€?
  const stats = useMemo(() => {
    if (!config || !config.dob) return null;
    return {
       ...calculateLifeClock(config.dob, config.lifeExpectancy),
       yearsLived: (diffInDays(new Date(), new Date(config.dob)) / 365.25).toFixed(1),
       weeksLived: diffInWeeks(new Date(), new Date(config.dob)),
       daysLived: diffInDays(new Date(), new Date(config.dob)),
       hoursSlept: (diffInDays(new Date(), new Date(config.dob)) * 8).toLocaleString()
    };
  }, [config]);

  const galleryImages = useMemo(() => {
    const imagesList = [];

    Object.entries(events).forEach(([dateKey, event]) => {
      if (!event) return;
      const entryDate = new Date(`${dateKey}T00:00:00`);
      if (Number.isNaN(entryDate.getTime())) return;

      // 获取事件的所有图片
      let images = [];
      if (event.images && event.images.length > 0) {
        // 浣跨敤澶氬浘鐗囨暟缁?
        images = event.images.map((imageUrl, index) => ({
          image: imageUrl,
          imageOriginal: event.imagesOriginal?.[index] || null,
          index
        }));
      } else if (event.image) {
        // 鍚戝悗鍏煎锛氬崟涓浘鐗?
        images = [{
          image: event.image,
          imageOriginal: event.imageOriginal || null,
          index: 0
        }];
      }

      // 为每张图片创建独立的相册项目
      images.forEach((img, imgIndex) => {
        imagesList.push({
          id: `${dateKey}-${imgIndex}`, // 唯一ID
          eventId: dateKey,
          dateKey,
          entryDate,
          image: img.image,
          imageOriginal: img.imageOriginal,
          eventTitle: event.title,
          eventContent: event.content,
          mood: event.mood
        });
      });
    });

    // 鎸夋椂闂村€掑簭
    return imagesList.sort((a, b) => b.entryDate - a.entryDate);
  }, [events]);

  // 杩囨护鐩爣锛氬彧鏄剧ず鏈畬鎴愭垨鏈€杩?澶╁唴瀹屾垚鐨勭洰鏍?
  const recentPhotoWall = useMemo(() => {
    return galleryImages.slice(0, 9);
  }, [galleryImages]);

  const filteredGoals = useMemo(() => {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    return goals.filter(g => {
      if (!g.completed) return true; // 未完成的目标总是显示
      if (!g.completedAt) return false; // 宸插畬鎴愪絾娌℃湁鏃堕棿鎴筹紝涓嶆樉绀?

      const completedDate = new Date(g.completedAt);
      return completedDate >= threeDaysAgo; // 鍙樉绀烘渶杩?澶╁唴瀹屾垚鐨?
    });
  }, [goals]);

  // 淇敼鐐?锛氶噸鍐?handleOnboarding锛岃皟鐢ㄥ悗绔繚瀛樼敓鏃?
  const handleOnboarding = async (e) => {
    e.preventDefault();
    // 鏋勫缓鏃ユ湡瀛楃涓?YYYY-MM-DD
    const dobStr = `${dobYear}-${dobMonth.toString().padStart(2, '0')}-${dobDay.toString().padStart(2, '0')}`;
    try {
        // 1. 调用后端保存
        const res = await updateUserConfig(dobStr, 100);
        // 2. 鏇存柊鏈湴鐘舵€侊紝瑙﹀彂鐣岄潰鍒锋柊
        const newConfig = { ...config, ...res.user_config };
        setConfig(newConfig);
        // 3. 鏇存柊缂撳瓨锛岄槻姝㈠埛鏂颁涪澶?
        localStorage.setItem('user_config', JSON.stringify(newConfig));
    } catch {
        alert("保存失败，请检查网络");
    }
  };


  const startOfDay = (dateLike) => {
    const d = new Date(dateLike);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const addDays = (dateLike, days) => {
    const d = startOfDay(dateLike);
    d.setDate(d.getDate() + days);
    return d;
  };

  const toDateKey = (dateLike) => {
    return formatDate(startOfDay(dateLike));
  };

  const lifeStats = useMemo(() => {
    const today = startOfDay(new Date());
    const todayTimestamp = today.getTime();
    const recordedTimestamps = [];
    let totalImageCount = 0;

    Object.entries(events).forEach(([dateKey, event]) => {
      if (!event) return;
      const parsedDate = parseDateKey(dateKey);
      if (!parsedDate) return;
      if (parsedDate.getTime() > todayTimestamp) return;

      recordedTimestamps.push(parsedDate.getTime());
      if (Array.isArray(event.images) && event.images.length > 0) {
        totalImageCount += event.images.length;
      } else if (event.image) {
        totalImageCount += 1;
      }
    });

    const uniqueRecordedTimestamps = Array.from(new Set(recordedTimestamps)).sort((a, b) => a - b);

    let longestStreak = 0;
    let currentStreak = 0;
    let previousTimestamp = null;
    uniqueRecordedTimestamps.forEach((timestamp) => {
      if (timestamp > todayTimestamp) return;
      if (previousTimestamp !== null && timestamp - previousTimestamp === MS_PER_DAY) {
        currentStreak += 1;
      } else {
        currentStreak = 1;
      }
      if (currentStreak > longestStreak) {
        longestStreak = currentStreak;
      }
      previousTimestamp = timestamp;
    });

    const currentYear = today.getFullYear();
    const yearStart = startOfDay(new Date(currentYear, 0, 1));
    const moodCounts = { joy: 0, neutral: 0, hard: 0, unmarked: 0 };
    const moodSeries = [];
    if (yearStart <= today) {
      for (let cursor = new Date(yearStart); cursor <= today; cursor = addDays(cursor, 1)) {
        const event = events[toDateKey(cursor)];
        const mood = event?.mood;
        if (mood === 'joy' || mood === 'neutral' || mood === 'hard') {
          moodCounts[mood] += 1;
        } else {
          moodCounts.unmarked += 1;
        }

        const dayOfYear = Math.floor((cursor.getTime() - yearStart.getTime()) / MS_PER_DAY) + 1;
        const moodValue = moodValueMap[mood] ?? moodValueMap.unmarked;
        const rawTitle = typeof event?.title === 'string' ? event.title.trim() : '';
        const title = event ? (rawTitle || '（无标题）') : '未填写';
        moodSeries.push({
          index: moodSeries.length,
          dayOfYear,
          dateKey: toDateKey(cursor),
          moodValue,
          moodLabel: moodValueLabelMap[moodValue],
          title,
          hasRecord: Boolean(event),
        });
      }
    }

    const moodSegments = moodDistributionMeta.map((item) => ({
      ...item,
      count: moodCounts[item.key],
    }));
    const moodTotal = moodSegments.reduce((sum, item) => sum + item.count, 0);
    const currentYearRecordedDays = moodCounts.joy + moodCounts.neutral + moodCounts.hard;

    let accumulatedDegrees = 0;
    const moodPieGradient = moodTotal > 0
      ? `conic-gradient(${moodSegments.map((item) => {
          const start = accumulatedDegrees;
          accumulatedDegrees += (item.count / moodTotal) * 360;
          return `${item.color} ${start.toFixed(2)}deg ${accumulatedDegrees.toFixed(2)}deg`;
        }).join(', ')})`
      : 'conic-gradient(#3f3f46 0deg 360deg)';

    return {
      recordedDays: uniqueRecordedTimestamps.length,
      totalImageCount,
      longestStreak,
      moodSegments,
      moodTotal,
      moodPieGradient,
      currentYear,
      currentYearRecordedDays,
      moodSeries,
    };
  }, [events]);

  const moodTrendChart = useMemo(() => {
    const data = lifeStats.moodSeries;
    const chartWidth = 980;
    const chartHeight = 300;
    const margin = { top: 20, right: 16, bottom: 36, left: 48 };
    const plotWidth = chartWidth - margin.left - margin.right;
    const plotHeight = chartHeight - margin.top - margin.bottom;
    const maxMoodValue = 3;
    const pointCount = data.length;
    const safeDivisor = Math.max(pointCount - 1, 1);
    const barWidth = Math.max(1.5, Math.min(5, (plotWidth / Math.max(pointCount, 1)) * 0.72));

    const getX = (index) => margin.left + (index / safeDivisor) * plotWidth;
    const getY = (moodValue) => margin.top + ((maxMoodValue - moodValue) / maxMoodValue) * plotHeight;

    const linePoints = data.map((point, index) => `${getX(index)},${getY(point.moodValue)}`).join(' ');
    const bars = data.map((point, index) => {
      const x = getX(index) - barWidth / 2;
      const y = getY(point.moodValue);
      const height = Math.max(1, getY(0) - y);
      return {
        key: point.dateKey,
        x,
        width: barWidth,
        y,
        height,
        color: moodColorByValue[point.moodValue] || moodColorByValue[0],
      };
    });

    const tickIndices = pointCount > 0
      ? Array.from(new Set([
          0,
          Math.floor((pointCount - 1) * 0.25),
          Math.floor((pointCount - 1) * 0.5),
          Math.floor((pointCount - 1) * 0.75),
          pointCount - 1,
        ]))
      : [];

    return {
      data,
      chartWidth,
      chartHeight,
      margin,
      plotHeight,
      linePoints,
      bars,
      tickIndices,
      pointCount,
      getX,
      getY,
    };
  }, [lifeStats.moodSeries]);

  const moodPieChart = useMemo(() => {
    const radius = 42;
    const strokeWidth = 12;
    const circumference = 2 * Math.PI * radius;
    let accumulatedLength = 0;
    const segments = lifeStats.moodSegments.map((segment) => {
      const ratio = lifeStats.moodTotal > 0 ? segment.count / lifeStats.moodTotal : 0;
      const dashLength = ratio * circumference;
      const dashOffset = -accumulatedLength;
      accumulatedLength += dashLength;
      return {
        ...segment,
        ratio,
        percent: ratio * 100,
        dashLength,
        dashOffset,
      };
    });

    return {
      radius,
      strokeWidth,
      circumference,
      segments,
    };
  }, [lifeStats.moodSegments, lifeStats.moodTotal]);

  const hoveredMoodPieSegment = moodPieHoverKey
    ? moodPieChart.segments.find((segment) => segment.key === moodPieHoverKey) || null
    : null;

  const hoveredTrendPoint = moodTrendHover ? moodTrendChart.data[moodTrendHover.index] : null;

  const heatmapYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = new Set([currentYear]);

    if (config?.dob) {
      const dobDate = new Date(config.dob);
      if (!Number.isNaN(dobDate.getTime())) {
        years.add(dobDate.getFullYear());
      }
    }

    Object.keys(events).forEach((dateKey) => {
      const y = Number(dateKey.slice(0, 4));
      if (!Number.isNaN(y)) {
        years.add(y);
      }
    });

    const allYears = Array.from(years);
    const minYear = Math.min(...allYears);
    const maxYear = Math.max(...allYears);
    const yearRange = [];
    for (let y = maxYear; y >= minYear; y--) {
      yearRange.push(y);
    }
    return yearRange;
  }, [config?.dob, events]);

  useEffect(() => {
    if (!heatmapYears.includes(heatmapYear) && heatmapYears.length > 0) {
      setHeatmapYear(heatmapYears[0]);
    }
  }, [heatmapYear, heatmapYears]);

  const heatmapWeeks = useMemo(() => {
    if (!heatmapYears.includes(heatmapYear)) {
      return [];
    }

    const today = startOfDay(new Date());
    const yearStart = startOfDay(new Date(heatmapYear, 0, 1));
    const yearEnd = startOfDay(new Date(heatmapYear, 11, 31));
    const startOffset = (yearStart.getDay() + 6) % 7; // Monday=0
    const endOffset = 6 - ((yearEnd.getDay() + 6) % 7); // Sunday=6
    const gridStart = addDays(yearStart, -startOffset);
    const gridEnd = addDays(yearEnd, endOffset);
    const weeks = [];

    for (let weekStart = gridStart; weekStart <= gridEnd; weekStart = addDays(weekStart, 7)) {
      const days = [];
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const currentDate = addDays(weekStart, dayOffset);
        const dateKey = toDateKey(currentDate);
        const inYear = currentDate.getFullYear() === heatmapYear;
        const evt = inYear ? events[dateKey] : null;
        const isFuture = inYear && currentDate > today;
        const isToday = currentDate.getTime() === today.getTime();
        const intensity = evt ? (evt.mood === 'hard' ? 3 : evt.mood === 'joy' ? 2 : 1) : 0;

        days.push({
          date: currentDate,
          dateKey,
          event: evt,
          inYear,
          isFuture,
          isToday,
          intensity,
        });
      }
      weeks.push({
        weekStart,
        days,
      });
    }

    return weeks;
  }, [events, heatmapYear, heatmapYears]);

  const onThisDayRecords = useMemo(() => {
    const today = startOfDay(new Date());
    const todayTimestamp = today.getTime();
    const month = today.getMonth();
    const day = today.getDate();
    const currentYear = today.getFullYear();

    return Object.entries(events)
      .map(([dateKey, event]) => {
        if (!event) return null;
        const parsedDate = parseDateKey(dateKey);
        if (!parsedDate) return null;
        if (parsedDate.getTime() >= todayTimestamp) return null;
        if (parsedDate.getMonth() !== month || parsedDate.getDate() !== day) return null;

        const yearsAgo = currentYear - parsedDate.getFullYear();
        if (yearsAgo <= 0) return null;

        const rawTitle = typeof event.title === 'string' ? event.title.trim() : '';
        const rawContent = typeof event.content === 'string' ? event.content.trim() : '';
        const preview = rawContent ? rawContent.replace(/\s+/g, ' ').slice(0, 100) : '';

        return {
          dateKey,
          date: parsedDate,
          yearsAgo,
          title: rawTitle || '（无标题）',
          preview,
          mood: event.mood,
          image: event.images?.[0] || event.image || null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [events]);

  const todayInstantActions = useMemo(() => {
    const actions = events[todayDateKey]?.instantActions;
    if (!Array.isArray(actions)) return [];
    return [...actions].sort((a, b) => {
      const aTime = new Date(a?.created_at || 0).getTime();
      const bTime = new Date(b?.created_at || 0).getTime();
      return bTime - aTime;
    });
  }, [events, todayDateKey]);

  const todayInstantActionTags = useMemo(() => {
    const tags = new Set();
    todayInstantActions.forEach(item => {
      if (Array.isArray(item?.tags)) {
        item.tags.forEach(tag => {
          if (typeof tag === 'string' && tag.trim()) tags.add(tag.trim());
        });
      }
    });
    return ['全部', ...Array.from(tags)];
  }, [todayInstantActions]);

  const filteredTodayInstantActions = useMemo(() => {
    if (todayInstantTagFilter === '全部') return todayInstantActions;
    return todayInstantActions.filter(item => Array.isArray(item?.tags) && item.tags.includes(todayInstantTagFilter));
  }, [todayInstantActions, todayInstantTagFilter]);

  useEffect(() => {
    if (!todayInstantActionTags.includes(todayInstantTagFilter)) {
      setTodayInstantTagFilter('全部');
    }
  }, [todayInstantActionTags, todayInstantTagFilter]);

  const selectedDateInstantActions = useMemo(() => {
    if (!selectedDate?.dateKey) return [];
    const actions = events[selectedDate.dateKey]?.instantActions;
    if (!Array.isArray(actions)) return [];
    return [...actions].sort((a, b) => {
      const aTime = new Date(a?.created_at || 0).getTime();
      const bTime = new Date(b?.created_at || 0).getTime();
      return bTime - aTime;
    });
  }, [events, selectedDate?.dateKey]);

  const updateTitleCursor = () => {
    const el = titleInputRef.current;
    if (!el) return;
    setTitleSelection({
      start: typeof el.selectionStart === 'number' ? el.selectionStart : null,
      end: typeof el.selectionEnd === 'number' ? el.selectionEnd : null
    });
  };

  const updateContentCursor = () => {
    const el = contentTextareaRef.current;
    if (!el) return;
    setContentSelection({
      start: typeof el.selectionStart === 'number' ? el.selectionStart : null,
      end: typeof el.selectionEnd === 'number' ? el.selectionEnd : null
    });
  };

  const insertEmojiAtCursor = (field, emoji) => {
    const isTitle = field === 'title';
    const ref = isTitle ? titleInputRef : contentTextareaRef;
    const fallbackSelection = isTitle ? titleSelection : contentSelection;
    const currentValue = `${tempEvent[field] || ''}`;

    let start = fallbackSelection.start;
    let end = fallbackSelection.end;
    const el = ref.current;
    if (el && typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number') {
      start = el.selectionStart;
      end = el.selectionEnd;
    }

    if (typeof start !== 'number' || typeof end !== 'number') {
      start = currentValue.length;
      end = currentValue.length;
    }

    const nextValue = currentValue.slice(0, start) + emoji + currentValue.slice(end);
    const nextCursor = start + emoji.length;

    setTempEvent(prev => ({ ...prev, [field]: nextValue }));
    if (isTitle) {
      setTitleSelection({ start: nextCursor, end: nextCursor });
    } else {
      setContentSelection({ start: nextCursor, end: nextCursor });
    }

    // 等待状态更新后恢复焦点与光标位置
    setTimeout(() => {
      const target = ref.current;
      if (!target) return;
      target.focus();
      target.setSelectionRange(nextCursor, nextCursor);
    }, 0);
  };

  const refreshEventsData = async () => {
    const updatedData = await fetchEvents();
    setEvents(updatedData);
  };

  const refreshTodayHabitsData = async () => {
    const habits = await fetchTodayHabits();
    setTodayHabits(Array.isArray(habits) ? habits : []);
  };

  const addInstantTag = (rawTag) => {
    const cleaned = `${rawTag || ''}`.trim();
    if (!cleaned) return;
    if (cleaned.length > 12) {
      alert('标签长度不能超过12个字符');
      return;
    }
    setInstantActionForm(prev => {
      if (prev.tags.includes(cleaned)) return { ...prev, tagInput: '' };
      if (prev.tags.length >= 5) {
        alert('标签最多添加5个');
        return prev;
      }
      return { ...prev, tags: [...prev.tags, cleaned], tagInput: '' };
    });
  };

  const removeInstantTag = (tag) => {
    setInstantActionForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));
  };

  const handleSaveInstantAction = async () => {
    const content = `${instantActionForm.content || ''}`.trim();
    if (!content) {
      alert('请输入即刻行动内容');
      return;
    }

    setIsSavingInstantAction(true);
    try {
      await createInstantAction(todayDateKey, content, instantActionForm.tags);
      await refreshEventsData();
      setInstantActionForm({ content: '', tags: [], tagInput: '' });
      setIsInstantActionModalOpen(false);
      alert('已记录到今日日记');
    } catch (err) {
      alert('记录失败: ' + (err.response?.data?.detail || '未知错误'));
    } finally {
      setIsSavingInstantAction(false);
    }
  };

  const handleDeleteInstantAction = async (dateKey, actionId) => {
    try {
      await deleteInstantAction(dateKey, actionId);
      await refreshEventsData();
    } catch (err) {
      alert('删除失败: ' + (err.response?.data?.detail || '未知错误'));
    }
  };

  const addHabitTag = (rawTag) => {
    const cleaned = `${rawTag || ''}`.trim();
    if (!cleaned) return;
    if (cleaned.length > 12) {
      alert('标签长度不能超过12个字符');
      return;
    }
    setHabitForm(prev => {
      if (prev.tags.includes(cleaned)) return { ...prev, tagInput: '' };
      if (prev.tags.length >= 5) {
        alert('标签最多添加5个');
        return prev;
      }
      return { ...prev, tags: [...prev.tags, cleaned], tagInput: '' };
    });
  };

  const removeHabitTag = (tag) => {
    setHabitForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));
  };

  const toggleHabitWeekDay = (dayValue) => {
    setHabitForm(prev => {
      const has = prev.weeklyDays.includes(dayValue);
      const nextDays = has
        ? prev.weeklyDays.filter(d => d !== dayValue)
        : [...prev.weeklyDays, dayValue].sort((a, b) => a - b);
      return { ...prev, weeklyDays: nextDays };
    });
  };

  const handleCreateHabit = async () => {
    const name = `${habitForm.name || ''}`.trim();
    if (!name) {
      alert('请输入行为名称');
      return;
    }

    const mode = habitForm.mode;
    const frequencyType = habitForm.frequencyType;
    let frequencyValue = null;

    if (frequencyType === 'weekly_n') {
      const n = Number(habitForm.frequencyTimes);
      if (!Number.isInteger(n) || n < 1 || n > 7) {
        alert('每周次数必须是 1-7 的整数');
        return;
      }
      frequencyValue = n;
    } else if (frequencyType === 'weekly_days') {
      if (habitForm.weeklyDays.length === 0) {
        alert('请至少选择一个打卡星期');
        return;
      }
      frequencyValue = habitForm.weeklyDays;
    }

    let targetValue = null;
    let unit = null;
    if (mode === 'quantity') {
      targetValue = Number(habitForm.targetValue);
      if (!Number.isFinite(targetValue) || targetValue <= 0) {
        alert('计量型行为的目标值必须大于0');
        return;
      }
      unit = `${habitForm.unit || ''}`.trim();
      if (!unit) {
        alert('计量型行为需要填写单位');
        return;
      }
    }

    setIsCreatingHabit(true);
    try {
      await createHabit({
        name,
        mode,
        frequency_type: frequencyType,
        frequency_value: frequencyValue,
        target_value: targetValue,
        unit,
        tags: habitForm.tags,
        start_date: habitForm.startDate,
        reminder_time: habitForm.reminderTime || null
      });
      await refreshTodayHabitsData();
      setHabitForm({
        name: '',
        mode: 'binary',
        frequencyType: 'daily',
        frequencyTimes: 3,
        weeklyDays: [],
        targetValue: '',
        unit: '分钟',
        tags: [],
        tagInput: '',
        startDate: formatDate(new Date()),
        reminderTime: ''
      });
      setIsHabitModalOpen(false);
      alert('长期行为创建成功');
    } catch (err) {
      alert('创建失败: ' + (err.response?.data?.detail || '未知错误'));
    } finally {
      setIsCreatingHabit(false);
    }
  };

  const handleHabitCheckin = async (habit) => {
    try {
      if (habit.mode === 'binary') {
        await upsertHabitLog(habit.id, {
          log_date: todayDateKey,
          completed: true
        });
      } else {
        const valueRaw = habitValueDrafts[habit.id] ?? habit.today?.value ?? '';
        const value = Number(valueRaw);
        if (!Number.isFinite(value) || value < 0) {
          alert('请输入有效的打卡数值');
          return;
        }
        await upsertHabitLog(habit.id, {
          log_date: todayDateKey,
          value
        });
      }
      await refreshTodayHabitsData();
      if (isEditModalOpen && selectedDate?.dateKey === todayDateKey) {
        const logs = await fetchHabitLogsByDate(todayDateKey);
        setSelectedDateHabitLogs(Array.isArray(logs) ? logs : []);
      }
    } catch (err) {
      alert('打卡失败: ' + (err.response?.data?.detail || '未知错误'));
    }
  };

  const handleHabitUndoToday = async (habitId) => {
    try {
      await deleteHabitLog(habitId, todayDateKey);
      await refreshTodayHabitsData();
      if (isEditModalOpen && selectedDate?.dateKey === todayDateKey) {
        const logs = await fetchHabitLogsByDate(todayDateKey);
        setSelectedDateHabitLogs(Array.isArray(logs) ? logs : []);
      }
    } catch (err) {
      alert('撤销失败: ' + (err.response?.data?.detail || '未知错误'));
    }
  };

  const handleDeleteHabitLogInDiary = async (habitId, logDate) => {
    try {
      await deleteHabitLog(habitId, logDate);
      const logs = await fetchHabitLogsByDate(logDate);
      setSelectedDateHabitLogs(Array.isArray(logs) ? logs : []);
      if (logDate === todayDateKey) {
        await refreshTodayHabitsData();
      }
    } catch (err) {
      alert('删除打卡记录失败: ' + (err.response?.data?.detail || '未知错误'));
    }
  };

  const handleFinishHabit = async (habitId, habitName) => {
    if (!confirm(`确认结束打卡行为「${habitName}」吗？结束后不会删除历史记录。`)) {
      return;
    }

    try {
      await finishHabit(habitId);
      await refreshTodayHabitsData();
      alert('打卡行为已结束');
    } catch (err) {
      alert('结束失败: ' + (err.response?.data?.detail || '未知错误'));
    }
  };

  // 处理目标完成/取消完成
  const handleGoalToggle = async (goalId) => {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;

    const isCompleting = !goal.completed;
    let updateData = { completed: isCompleting };

    if (isCompleting) {
      // 标记为完成：记录完成时间
      const now = new Date();
      updateData.completed_at = formatDate(now); // YYYY-MM-DD格式
      updateData.week_year = getAgeAtDate(now);
      updateData.week_index = null;
    } else {
      // 鍙栨秷瀹屾垚锛氭竻闄ゅ畬鎴愪俊鎭?
      updateData.completed_at = null;
      updateData.week_year = null;
      updateData.week_index = null;
    }

    try {
      const updatedGoal = await updateGoal(goalId, updateData);
      // 杞崲瀛楁鍚嶅苟鏇存柊鏈湴鐘舵€?
      const convertedGoal = {
        id: updatedGoal.id,
        text: updatedGoal.text,
        completed: updatedGoal.completed,
        completedAt: updatedGoal.completed_at,
        weekYear: updatedGoal.week_year,
        weekIndex: updatedGoal.week_index,
        createdAt: updatedGoal.created_at
      };
      setGoals(goals.map(g => g.id === goalId ? convertedGoal : g));
    } catch (err) {
      console.error("更新目标失败", err);
    }
  };

  // 娣诲姞鏂扮洰鏍?
  const handleAddGoal = async () => {
    if (!tempGoal.trim()) return;

    const newGoalData = {
      text: tempGoal.trim(),
      completed: false
    };

    try {
      const createdGoal = await createGoal(newGoalData);
      // 杞崲瀛楁鍚?
      const convertedGoal = {
        id: createdGoal.id,
        text: createdGoal.text,
        completed: createdGoal.completed,
        completedAt: createdGoal.completed_at,
        weekYear: createdGoal.week_year,
        weekIndex: createdGoal.week_index,
        createdAt: createdGoal.created_at
      };
      setGoals([...goals, convertedGoal]);
      setTempGoal('');
    } catch (err) {
      console.error("创建目标失败", err);
    }
  };

  // 删除目标
  const handleDeleteGoal = async (goalId) => {
    try {
      await deleteGoal(goalId);
      setGoals(goals.filter(g => g.id !== goalId));
    } catch (err) {
      console.error("删除目标失败", err);
    }
  };

  // Open event editor from the calendar grid.
  const handleGridClick = (dateKey, isFuture) => {
    if (isFuture) {
      alert("不能记录未来的时间！只能填写已经过去或今天的记忆。");
      return;
    }

    const existing = events[dateKey] || { title: '', content: '', mood: 'neutral', city: null, image: '', imageOriginal: '', images: [], imagesOriginal: [] };
    setSelectedDate({ dateKey, date: new Date(`${dateKey}T00:00:00`) });

    // 澶勭悊鍚戝悗鍏煎锛氬鏋滃彧鏈夊崟涓浘鐗囧瓧娈碉紝杞崲涓烘暟缁?
    const images = existing.images || (existing.image ? [existing.image] : []);
    const imagesOriginal = existing.imagesOriginal || (existing.imageOriginal ? [existing.imageOriginal] : []);

    setTempEvent({
      title: existing.title || '',
      content: existing.content || '',
      mood: existing.mood || 'neutral',
      city: existing.city || null,
      images,
      imagesOriginal,
      imageFiles: []
    });
    setTitleSelection({ start: null, end: null });
    setContentSelection({ start: null, end: null });
    setIsEditModalOpen(true);
  };

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      // 为每个新文件创建预览URL
      const newPreviewUrls = files.map(file => URL.createObjectURL(file));

      setTempEvent(prev => {
        // 合并现有图片和新图片
        const mergedImages = [...(prev.images || []), ...newPreviewUrls];
        const mergedImagesOriginal = [...(prev.imagesOriginal || []), ...files.map(() => null)]; // 新图片没有原始URL
        const mergedImageFiles = [...(prev.imageFiles || []), ...files];

        return {
          ...prev,
          images: mergedImages,
          imagesOriginal: mergedImagesOriginal,
          imageFiles: mergedImageFiles
        };
      });
    }
    // 娓呯┖鏂囦欢杈撳叆锛屽厑璁稿啀娆￠€夋嫨鐩稿悓鏂囦欢
    e.target.value = '';
  };

  // 澶勭悊绮樿创鏉垮浘鐗?
  const handlePaste = (e) => {
    // 鍙湪缂栬緫妯℃€佹鎵撳紑鏃跺鐞?
    if (!isEditModalOpen) return;

    const clipboardData = e.clipboardData || window.clipboardData;
    if (!clipboardData) return;

    // 妫€鏌ユ槸鍚︾矘璐村埌杈撳叆妗嗭紝濡傛灉鏄緭鍏ユ涓旀湁鏂囨湰鍐呭锛屼笉澶勭悊鍥剧墖
    const activeElement = document.activeElement;
    const isInputField = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA';
    const hasText = clipboardData.getData('text').trim().length > 0;

    // 如果是输入框且有文本，让默认粘贴行为生效
    if (isInputField && hasText) return;

    // 鏌ユ壘绮樿创鏉夸腑鐨勫浘鐗?
    const items = clipboardData.items;
    const imageFiles = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          // 涓虹矘璐寸殑鍥剧墖娣诲姞鍚堥€傜殑鏂囦欢鍚?
          const timestamp = Date.now();
          const ext = file.type.split('/')[1] || 'png';
          const renamedFile = new File([file], `clipboard-${timestamp}.${ext}`, { type: file.type });
          imageFiles.push(renamedFile);
        }
      }
    }

    // 如果找到图片，阻止默认行为并处理
    if (imageFiles.length > 0) {
      e.preventDefault();

      // 创建预览URL
      const newPreviewUrls = imageFiles.map(file => URL.createObjectURL(file));

      setTempEvent(prev => {
        const mergedImages = [...(prev.images || []), ...newPreviewUrls];
        const mergedImagesOriginal = [...(prev.imagesOriginal || []), ...imageFiles.map(() => null)];
        const mergedImageFiles = [...(prev.imageFiles || []), ...imageFiles];

        return {
          ...prev,
          images: mergedImages,
          imagesOriginal: mergedImagesOriginal,
          imageFiles: mergedImageFiles
        };
      });
    }
  };

  // 监听粘贴事件
  useEffect(() => {
    if (isEditModalOpen) {
      document.addEventListener('paste', handlePaste);
      return () => {
        document.removeEventListener('paste', handlePaste);
      };
    }
  }, [isEditModalOpen, tempEvent]);

  // 日记弹窗打开时，加载当前日期的长期行为打卡历史
  useEffect(() => {
    if (!isEditModalOpen || !selectedDate?.dateKey) {
      setSelectedDateHabitLogs([]);
      return;
    }

    setIsLoadingHabitLogs(true);
    fetchHabitLogsByDate(selectedDate.dateKey)
      .then(data => setSelectedDateHabitLogs(Array.isArray(data) ? data : []))
      .catch(err => {
        console.error('加载指定日期打卡记录失败', err);
        setSelectedDateHabitLogs([]);
      })
      .finally(() => setIsLoadingHabitLogs(false));
  }, [isEditModalOpen, selectedDate?.dateKey]);

  const handleSaveEvent = async () => {
    if (selectedDate) {
      try {
        // 调用后端 API 保存
        await saveEventToBackend(selectedDate.dateKey, tempEvent);
        
        // 閲嶆柊鑾峰彇鏈€鏂版暟鎹?(鎴栬€呭彲浠ヤ紭鍖栦负鍙洿鏂版湰鍦扮姸鎬?
        const updatedData = await fetchEvents();
        setEvents(updatedData);
        
        setIsEditModalOpen(false);
      } catch {
        alert("保存失败，请重试");
      }
    }
  };

  const handleRegister = async (e) => {
      e.preventDefault();
      try {
          await registerUser(newUserForm.username, newUserForm.password);
          alert("用户创建成功");
          setIsAdminModalOpen(false);
          setNewUserForm({username: '', password: ''});
      } catch (err) {
          alert("创建失败: " + (err.response?.data?.detail || "未知错误"));
      }
  };

  const handleSaveProfile = async (e) => {
      e.preventDefault();
      try {
          // 鏋勫缓鏃ユ湡瀛楃涓?YYYY-MM-DD
          const dobStr = `${dobYear}-${dobMonth.toString().padStart(2, '0')}-${dobDay.toString().padStart(2, '0')}`;
          const res = await updateUserProfile(
              dobStr,
              config.life_expectancy || 100,
              userProfile.nickname,
              userProfile.avatar
          );
          // 更新本地配置
          const newConfig = { ...config, ...res.user_config };
          setConfig(newConfig);
          localStorage.setItem('user_config', JSON.stringify(newConfig));
          // 鏇存柊鐢ㄦ埛璧勬枡鐘舵€?
          setUserProfile({
              nickname: res.user_config.nickname || userProfile.nickname,
              avatar: res.user_config.avatar_url || userProfile.avatar
          });
          alert("资料更新成功");
          setIsUserProfileModalOpen(false);
      } catch (err) {
          alert("更新失败: " + (err.response?.data?.detail || "未知错误"));
      }
  };

  // 修改密码处理
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');

    // 前端验证
    if (!passwordForm.oldPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setPasswordError('请填写所有密码字段');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('新密码与确认密码不一致');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setPasswordError('新密码长度至少为6位');
      return;
    }

    setIsChangingPassword(true);

    try {
      await updateUserPassword(
        passwordForm.oldPassword,
        passwordForm.newPassword,
        passwordForm.confirmPassword
      );

      alert('密码修改成功');
      // 重置表单并关闭模态框
      setPasswordForm({
        oldPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      setIsChangePasswordModalOpen(false);
      setPasswordError('');
    } catch (err) {
      setPasswordError(err.response?.data?.detail || '密码修改失败，请检查旧密码是否正确');
    } finally {
      setIsChangingPassword(false);
    }
  };

  // 头像上传处理
  const handleAvatarUpload = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsUploadingAvatar(true);
      try {
          const res = await uploadAvatar(file);
          // 更新用户资料
          setUserProfile(prev => ({ ...prev, avatar: res.avatar_url }));
          // 更新config
          const newConfig = { ...config, avatar_url: res.avatar_url };
          setConfig(newConfig);
          localStorage.setItem('user_config', JSON.stringify(newConfig));
          alert("头像上传成功");
      } catch (err) {
          alert("上传失败: " + (err.response?.data?.detail || "未知错误"));
      } finally {
          setIsUploadingAvatar(false);
          // 清空input
          if (avatarInputRef.current) {
              avatarInputRef.current.value = '';
          }
      }
  };

  // 导出逻辑
  const generateExport = async () => {
      setIsExporting(true);
      if (!await loadExportLibraries()) { setIsExporting(false); return; }

      const JSZip = window.JSZip;
      const saveAs = window.saveAs;
      const jsPDF = window.jspdf?.jsPDF;

      if (!JSZip || !saveAs || !jsPDF) {
          alert("导出组件加载失败，请刷新页面后重试");
          setIsExporting(false);
          return;
      }

      const zip = new JSZip();
      const imgFolder = zip.folder("images");

      const start = new Date(exportRange.start);
      const end = new Date(exportRange.end);

      // 按日期导出日记
      const eventsToExport = Object.entries(events).map(([dateKey, evt]) => {
          const entryDate = new Date(`${dateKey}T00:00:00`);
          return { ...evt, dateKey, date: entryDate };
      }).filter(evt => evt.date >= start && evt.date <= end).sort((a, b) => a.date - b.date);

      if (eventsToExport.length === 0) { alert("无记录"); setIsExporting(false); return; }

      // 辅助函数：清理文件名中的非法字符
      const sanitizeFileName = (name) => {
          return (name || '无标题').replace(/[\\/:*?"<>|]/g, '_').substring(0, 50);
      };

      // 辅助函数：生成随机防重编码
      const generateId = () => Math.random().toString(36).substring(2, 8);

      // 辅助函数：获取图片扩展名
      const getImageExt = (url) => {
          const match = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
          return match ? match[1].toLowerCase() : 'jpg';
      };

      const moodLabelMap = {
          joy: '开心',
          neutral: '一般',
          hard: '艰难',
      };

      const wrapCanvasText = (ctx, text, maxWidth) => {
          const source = `${text ?? ''}`;
          if (!source) return [''];

          const wrapped = [];
          let current = '';
          for (const ch of source) {
              const trial = current + ch;
              if (!current || ctx.measureText(trial).width <= maxWidth) {
                  current = trial;
              } else {
                  wrapped.push(current);
                  current = ch;
              }
          }
          if (current) wrapped.push(current);
          return wrapped;
      };

      const loadImageFromBlob = (blob) => {
          return new Promise((resolve, reject) => {
              const objectUrl = URL.createObjectURL(blob);
              const image = new Image();
              image.onload = () => {
                  URL.revokeObjectURL(objectUrl);
                  resolve(image);
              };
              image.onerror = (err) => {
                  URL.revokeObjectURL(objectUrl);
                  reject(err);
              };
              image.src = objectUrl;
          });
      };

      const createPdfFromEvent = async (evt, dateLabel, savedImages) => {
          if (typeof document === 'undefined') return null;

          const pageWidthPx = 1240;
          const pageHeightPx = 1754;
          const marginX = 88;
          const marginTop = 96;
          const marginBottom = 90;
          const contentWidth = pageWidthPx - marginX * 2;
          const pages = [];
          let pageCanvas = null;
          let ctx = null;
          let y = marginTop;

          const createNewPage = () => {
              pageCanvas = document.createElement('canvas');
              pageCanvas.width = pageWidthPx;
              pageCanvas.height = pageHeightPx;
              ctx = pageCanvas.getContext('2d');
              if (!ctx) return false;
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, pageWidthPx, pageHeightPx);
              y = marginTop;
              pages.push(pageCanvas);
              return true;
          };

          if (!createNewPage()) return null;

          const ensureSpace = (requiredHeight) => {
              if (y + requiredHeight <= pageHeightPx - marginBottom) return true;
              return createNewPage();
          };

          const drawParagraph = (text, options = {}) => {
              const {
                  font = '32px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif',
                  color = '#111111',
                  lineHeight = 46,
                  before = 0,
                  after = 0,
              } = options;

              y += before;
              if (!ensureSpace(lineHeight)) return;

              ctx.font = font;
              ctx.fillStyle = color;
              const blocks = `${text ?? ''}`.split(/\r?\n/);

              blocks.forEach((block, blockIndex) => {
                  const normalized = block || ' ';
                  const lines = wrapCanvasText(ctx, normalized, contentWidth);
                  lines.forEach((line) => {
                      if (!ensureSpace(lineHeight)) return;
                      ctx.fillText(line, marginX, y);
                      y += lineHeight;
                  });
                  if (blockIndex < blocks.length - 1) {
                      const gap = Math.round(lineHeight * 0.6);
                      if (!ensureSpace(gap)) return;
                      y += gap;
                  }
              });

              y += after;
          };

          const moodLabel = moodLabelMap[evt.mood] || '未记录';

          drawParagraph(evt.title || '无标题', {
              font: 'bold 52px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif',
              color: '#000000',
              lineHeight: 62,
              after: 20,
          });
          drawParagraph(`日期：${dateLabel}`, {
              font: '28px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif',
              color: '#374151',
              lineHeight: 40,
          });
          drawParagraph(`心情：${moodLabel}`, {
              font: '28px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif',
              color: '#374151',
              lineHeight: 40,
              after: 24,
          });
          drawParagraph('内容', {
              font: 'bold 34px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif',
              color: '#111111',
              lineHeight: 48,
              after: 8,
          });
          drawParagraph(evt.content || '（无内容）', {
              font: '30px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif',
              color: '#111111',
              lineHeight: 44,
              after: 20,
          });

          if (savedImages.length > 0) {
              drawParagraph('图片预览', {
                  font: 'bold 32px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif',
                  color: '#111111',
                  lineHeight: 44,
                  after: 6,
              });
              for (let idx = 0; idx < savedImages.length; idx++) {
                  const savedImage = savedImages[idx];
                  if (!savedImage?.blob) continue;

                  try {
                      const imageElement = await loadImageFromBlob(savedImage.blob);
                      const captionHeight = 34;
                      const imageTopGap = 8;
                      const imageBottomGap = 20;
                      const maxImageHeight = 520;

                      const ratio = Math.min(
                          contentWidth / imageElement.width,
                          maxImageHeight / imageElement.height,
                          1
                      );

                      const drawWidth = Math.max(1, Math.round(imageElement.width * ratio));
                      const drawHeight = Math.max(1, Math.round(imageElement.height * ratio));
                      const neededHeight = captionHeight + imageTopGap + drawHeight + imageBottomGap;

                      if (!ensureSpace(neededHeight)) continue;

                      ctx.font = '24px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif';
                      ctx.fillStyle = '#374151';
                      ctx.fillText(`图片 ${idx + 1}: images/${savedImage.name}`, marginX, y);
                      y += captionHeight;

                      const imageX = marginX + (contentWidth - drawWidth) / 2;
                      const imageY = y + imageTopGap;

                      ctx.strokeStyle = '#d1d5db';
                      ctx.lineWidth = 1;
                      ctx.strokeRect(imageX - 1, imageY - 1, drawWidth + 2, drawHeight + 2);
                      ctx.drawImage(imageElement, imageX, imageY, drawWidth, drawHeight);

                      y = imageY + drawHeight + imageBottomGap;
                  } catch {
                      drawParagraph(`图片 ${idx + 1} 预览加载失败：images/${savedImage.name}`, {
                          font: '24px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif',
                          color: '#6b7280',
                          lineHeight: 34,
                          after: 2,
                      });
                  }
              }
          }

          const pdf = new jsPDF({
              orientation: 'p',
              unit: 'pt',
              format: 'a4',
          });
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = pdf.internal.pageSize.getHeight();

          pages.forEach((canvas, pageIndex) => {
              if (pageIndex > 0) pdf.addPage();
              const pageImage = canvas.toDataURL('image/jpeg', 0.9);
              pdf.addImage(pageImage, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
          });

          return pdf.output('arraybuffer');
      };

      // 处理每一天的记录
      for (let i = 0; i < eventsToExport.length; i++) {
          const evt = eventsToExport[i];
          const dateLabel = evt.dateKey;
          const title = sanitizeFileName(evt.title);

          // 文件名格式：日期_标题
          const baseFileName = `${dateLabel}_${title}`;

          // 创建 Markdown 内容
          let mdContent = `# ${evt.title || '无标题'}\n\n`;
          mdContent += `**日期**: ${dateLabel}  \n`;
          mdContent += `**心情**: ${evt.mood || '无记录'}  \n\n`;

          if (evt.content) {
              mdContent += `## 内容\n\n${evt.content}\n\n`;
          }

          // 导出即刻行动记录
          const instantActions = Array.isArray(evt.instantActions) ? evt.instantActions : [];
          if (instantActions.length > 0) {
              const sortedActions = [...instantActions].sort((a, b) => {
                  const aTime = new Date(a?.created_at || 0).getTime();
                  const bTime = new Date(b?.created_at || 0).getTime();
                  return aTime - bTime;
              });
              mdContent += `## 即刻行动\n\n`;
              sortedActions.forEach((action) => {
                  const time = formatTimeLabel(action?.created_at);
                  const tags = Array.isArray(action?.tags) && action.tags.length > 0
                      ? ` ${action.tags.map(tag => `#${tag}`).join(' ')}`
                      : '';
                  mdContent += `- [${time}] ${action?.content || '（无内容）'}${tags}\n`;
              });
              mdContent += `\n`;
          }

          // 收集所有图片（优先原图）
          const allImages = [];
          if (evt.imagesOriginal && evt.imagesOriginal.length > 0) {
              allImages.push(...evt.imagesOriginal);
          } else if (evt.images && evt.images.length > 0) {
              allImages.push(...evt.images);
          }
          // 兼容旧的单图字段
          if (allImages.length === 0) {
              if (evt.imageOriginal) allImages.push(evt.imageOriginal);
              else if (evt.image) allImages.push(evt.image);
          }

          // 涓嬭浇骞朵繚瀛樺浘鐗?
          const savedImageNames = [];
          const savedImageFiles = [];
          for (let imgIdx = 0; imgIdx < allImages.length; imgIdx++) {
              const imgUrl = allImages[imgIdx];
              if (!imgUrl) continue;

              try {
                  let imgBlob;
                  const ext = getImageExt(imgUrl);
                  const imgFileName = `${dateLabel}_${title}_${generateId()}.${ext}`;

                  if (imgUrl.startsWith('/')) {
                      // 鐩稿璺緞锛屼粠鏈嶅姟鍣ㄤ笅杞?
                      const response = await fetch(imgUrl);
                      if (response.ok) {
                          imgBlob = await response.blob();
                      }
                  } else if (imgUrl.startsWith('data:')) {
                      // Base64 数据
                      const arr = imgUrl.split(',');
                      const mime = arr[0].match(/:(.*?);/)[1];
                      const bstr = atob(arr[1]);
                      let n = bstr.length;
                      const u8arr = new Uint8Array(n);
                      while (n--) {
                          u8arr[n] = bstr.charCodeAt(n);
                      }
                      imgBlob = new Blob([u8arr], { type: mime });
                  } else if (imgUrl.startsWith('http')) {
                      // 澶栭儴 URL锛屽皾璇曚笅杞?
                      try {
                          const response = await fetch(imgUrl);
                          if (response.ok) {
                              imgBlob = await response.blob();
                          }
                      } catch {
                          console.log('外部图片下载失败:', imgUrl);
                      }
                  }

                  if (imgBlob) {
                      imgFolder.file(imgFileName, imgBlob);
                      savedImageNames.push(imgFileName);
                      savedImageFiles.push({ name: imgFileName, blob: imgBlob });
                  }
              } catch (e) {
                  console.error('图片处理失败:', imgUrl, e);
              }
          }

          // 鍦?Markdown 涓坊鍔犲浘鐗囧紩鐢?
          if (savedImageNames.length > 0) {
              mdContent += `## 图片\n\n`;
              savedImageNames.forEach((imgName, idx) => {
                  mdContent += `![图片${idx + 1}](images/${imgName})\n\n`;
              });
          }

          // 保存 Markdown 文件
          zip.file(`${baseFileName}.md`, mdContent);

          try {
              const pdfBuffer = await createPdfFromEvent(evt, dateLabel, savedImageFiles);
              if (pdfBuffer) {
                  zip.file(`${baseFileName}.pdf`, pdfBuffer);
              }
          } catch (e) {
              console.error('PDF 导出失败:', evt.dateKey, e);
          }
      }

      const content = await zip.generateAsync({type:"blob"});
      saveAs(content, `拾光记忆_导出_${formatDate(new Date())}.zip`);
      setIsExporting(false);
      setIsExportModalOpen(false);
  };


  // 淇敼鐐?锛氬鏋滄病鏈夊嚭鐢熸棩鏈?(鏂扮敤鎴?锛屾樉绀哄叏灞忛粦鑹茶儗鏅紩瀵奸〉
  if (!config || !config.dob || isNaN(new Date(config.dob).getTime())) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-6 text-white relative overflow-hidden">
         {/* 背景装饰 */}
         <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_0%,rgba(120,119,198,0.1),transparent_50%)]" />
         
         <div className="z-10 w-full max-w-md space-y-8 text-center">
            <div className="space-y-2">
                <h1 className="text-5xl font-bold tracking-tighter">拾光记忆</h1>
                <p className="text-neutral-400">欢迎来到你的人生记录器。</p>
            </div>
            
            <Card className="bg-neutral-900 border-neutral-800 shadow-2xl text-left">
                <form onSubmit={handleOnboarding} className="space-y-6">
                   <div>
                       <label className="block text-sm font-medium text-neutral-400 mb-2">请选择您的出生日期</label>
                       <div className="flex space-x-2">
                         {/* 年份选择 */}
                         <div className="flex-1">
                           <select
                             value={dobYear}
                             onChange={e => setDobYear(parseInt(e.target.value))}
                             className="w-full bg-black border border-neutral-700 p-3 rounded-lg text-white focus:border-white focus:outline-none transition-colors appearance-none text-center"
                           >
                             {Array.from({length: 100}, (_, i) => new Date().getFullYear() - 99 + i).map(year => (
                               <option key={year} value={year}>{year}年</option>
                             ))}
                           </select>
                         </div>
                         {/* 月份选择 */}
                         <div className="flex-1">
                           <select
                             value={dobMonth}
                             onChange={e => {
                               const month = parseInt(e.target.value);
                               setDobMonth(month);
                               // 璋冩暣澶╂暟涓嶈秴杩囨柊鏈堜唤鐨勬渶澶уぉ鏁?
                               const maxDays = new Date(dobYear, month, 0).getDate();
                               if (dobDay > maxDays) {
                                 setDobDay(maxDays);
                               }
                             }}
                             className="w-full bg-black border border-neutral-700 p-3 rounded-lg text-white focus:border-white focus:outline-none transition-colors appearance-none text-center"
                           >
                             {Array.from({length: 12}, (_, i) => i + 1).map(month => (
                               <option key={month} value={month}>{month}月</option>
                             ))}
                           </select>
                         </div>
                         {/* 日期选择 */}
                         <div className="flex-1">
                           <select
                             value={dobDay}
                             onChange={e => setDobDay(parseInt(e.target.value))}
                             className="w-full bg-black border border-neutral-700 p-3 rounded-lg text-white focus:border-white focus:outline-none transition-colors appearance-none text-center"
                           >
                             {Array.from({length: new Date(dobYear, dobMonth, 0).getDate()}, (_, i) => i + 1).map(day => (
                               <option key={day} value={day}>{day}日</option>
                             ))}
                           </select>
                         </div>
                       </div>
                   </div>
                   <button className="w-full bg-white text-black p-3 rounded-lg font-bold hover:bg-neutral-200 transition-colors">
                       开启旅程
                   </button>
                </form>
            </Card>
            <button onClick={onLogout} className="text-sm text-neutral-500 hover:text-white underline">退出登录</button>
         </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans">
      <nav className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur sticky top-0 z-40 p-2 sm:p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-2 sm:gap-4">
                <span className="font-bold text-lg sm:text-xl">拾光记忆</span>
                <div className="flex items-center gap-2 cursor-pointer hover:bg-neutral-800/50 p-1 rounded transition-colors" onClick={() => setIsUserProfileModalOpen(true)}>
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-neutral-700 flex items-center justify-center overflow-hidden">
                        {userProfile.avatar ? (
                            <img src={userProfile.avatar} className="w-full h-full object-cover" alt="头像" />
                        ) : (
                            <span className="text-xs sm:text-sm font-bold">{userProfile.nickname.charAt(0)}</span>
                        )}
                    </div>
                    <span className="text-sm text-neutral-300 hidden sm:block">{userProfile.nickname}</span>
                </div>
                {config.is_admin && (
                    <button onClick={()=>setIsAdminModalOpen(true)} className="text-xs bg-neutral-800 px-2 py-1 rounded flex items-center gap-1 hover:bg-neutral-700 hidden sm:flex">
                        <UserPlus size={12}/> 管理员 · 添加用户
                    </button>
                )}
            </div>
            <div className="flex gap-2 sm:gap-4 text-sm items-center flex-wrap">
                <span className="text-neutral-400 hidden sm:block">
                    {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
                <button onClick={() => setIsInstantActionModalOpen(true)} className="hover:text-white flex items-center gap-1 sm:gap-2">
                  <Zap size={16}/> <span className="hidden sm:inline">即刻行动</span>
                </button>
                <button onClick={() => setIsHabitModalOpen(true)} className="hover:text-white flex items-center gap-1 sm:gap-2">
                  <Plus size={16}/> <span className="hidden sm:inline">新建打卡</span>
                </button>
                <button onClick={() => setIsGalleryOpen(true)} className="hover:text-white flex items-center gap-1 sm:gap-2"><LayoutGrid size={16}/> <span className="hidden sm:inline">相册</span></button>
                <button onClick={() => setIsSpecialDaysModalOpen(true)} className="hover:text-white flex items-center gap-1 sm:gap-2"><Calendar size={16}/> <span className="hidden sm:inline">纪念日</span></button>
                <button onClick={() => setIsExportModalOpen(true)} className="hover:text-white flex items-center gap-1 sm:gap-2"><Download size={16}/> <span className="hidden sm:inline">导出</span></button>
                <div className="w-px h-4 bg-neutral-800 hidden sm:block"></div>
                <button onClick={onLogout} className="hover:text-red-400 flex items-center gap-1 sm:gap-2"><LogOut size={16}/> <span className="hidden sm:inline">登出</span></button>
            </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-2 sm:p-4 space-y-4 sm:space-y-8">
        {/* 浠〃鐩樼粺璁?*/}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
           <Card className="p-3 sm:p-6"><div className="text-xs text-neutral-400">人生时钟</div><div className="text-xl sm:text-3xl font-bold">{stats?.time || '--:--'}</div></Card>
          <Card className="p-3 sm:p-6"><div className="text-xs text-neutral-400">出生天数</div><div className="text-xl sm:text-3xl font-bold">{stats?.daysLived || '--'}</div></Card>
          <Card className="p-3 sm:p-6"><div className="text-xs text-neutral-400">年龄</div><div className="text-xl sm:text-3xl font-bold">{stats?.yearsLived || '--'}</div></Card>
           <Card className="p-3 sm:p-6"><div className="text-xs text-neutral-400">人生进度</div><div className="text-xl sm:text-3xl font-bold">{stats?.progress || '--'}%</div></Card>
        </section>

        {/* 涓荤綉鏍煎尯鍩?*/}
        <div className="lg:grid lg:grid-cols-12 gap-4 sm:gap-8 space-y-4 lg:space-y-0">
            <div className="lg:col-span-8 space-y-4 sm:space-y-6">
                <div className="flex justify-between items-center bg-neutral-900 p-2 sm:p-4 rounded-xl border border-neutral-800">
                    <span className="font-bold text-sm sm:text-base">日记热力图（{heatmapYear} 年）</span>
                    <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const index = heatmapYears.indexOf(heatmapYear);
                            if (index < heatmapYears.length - 1) setHeatmapYear(heatmapYears[index + 1]);
                          }}
                          disabled={heatmapYears.indexOf(heatmapYear) >= heatmapYears.length - 1}
                          className="p-1 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed"
                          title="查看更早年份"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <select
                          value={heatmapYear}
                          onChange={(e) => setHeatmapYear(Number(e.target.value))}
                          className="bg-black border border-neutral-700 rounded px-2 py-1 text-xs text-white"
                        >
                          {heatmapYears.map((year) => (
                            <option key={year} value={year}>{year}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => {
                            const index = heatmapYears.indexOf(heatmapYear);
                            if (index > 0) setHeatmapYear(heatmapYears[index - 1]);
                          }}
                          disabled={heatmapYears.indexOf(heatmapYear) <= 0}
                          className="p-1 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed"
                          title="查看更新年份"
                        >
                          <ChevronRight size={14} />
                        </button>
                    </div>
                </div>

                {/* Heatmap */}
                <div className="bg-neutral-900/50 p-2 sm:p-4 rounded-lg border border-neutral-800 overflow-x-auto">
                    <div className="flex gap-1 min-w-[760px]">
                    {heatmapWeeks.map((week, weekIndex) => (
                        <div key={weekIndex} className="flex flex-col gap-1">
                            {week.days.map((day) => (
                                <button
                                    key={`${day.dateKey}-${day.inYear ? 'in' : 'out'}`}
                                    onClick={() => day.inYear && handleGridClick(day.dateKey, day.isFuture)}
                                    className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-sm border relative transition-all overflow-hidden
                                        ${day.isToday && day.inYear ? 'ring-1 ring-yellow-400' : ''}
                                        ${!day.inYear ? 'bg-transparent border-transparent cursor-default' : ''}
                                        ${day.event
                                          ? moodConfig[day.event.mood]?.color || 'bg-emerald-500 border-emerald-600'
                                          : (day.isFuture ? 'bg-neutral-900 border-neutral-800' : 'bg-neutral-700 border-neutral-700')}
                                        ${day.inYear ? (day.isFuture ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:brightness-110') : ''}
                                    `}
                                    title={day.inYear ? (day.isFuture ? `${day.dateKey}（未来）` : day.dateKey) : ""}
                                >
                                    {(day.event?.images?.[0] || day.event?.image) && (
                                        <div className="absolute inset-0 bg-cover bg-center opacity-45" style={{backgroundImage: `url(${day.event.images?.[0] || day.event.image})`}} />
                                    )}
                                </button>
                            ))}
                        </div>
                    ))}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-neutral-400">
                        <div className="flex items-center gap-1">
                            <span className="w-3 h-3 rounded-sm bg-neutral-700 border border-neutral-700 inline-block"></span>
                            <span>未记录</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="w-3 h-3 rounded-sm bg-green-500 border border-green-600 inline-block"></span>
                            <span>开心</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="w-3 h-3 rounded-sm bg-yellow-500 border border-yellow-600 inline-block"></span>
                            <span>一般</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="w-3 h-3 rounded-sm bg-red-500 border border-red-600 inline-block"></span>
                            <span>艰难</span>
                        </div>
                    </div>
                </div>

                <Card className="p-3 sm:p-4">
                    <div className="flex items-center justify-between mb-3">
                        <span className="font-bold text-sm sm:text-base">人生统计</span>
                        <span className="text-xs text-neutral-500">{lifeStats.currentYear} 年</span>
                    </div>
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 sm:gap-4">
                        <div className="xl:col-span-1 bg-neutral-900/50 border border-neutral-800 rounded-lg p-3">
                            <div className="grid grid-cols-3 xl:grid-cols-1 gap-2">
                                <div className="bg-neutral-900 border border-neutral-800 rounded-md p-2">
                                    <div className="text-[11px] text-neutral-400">已记录总天数</div>
                                    <div className="mt-1 text-lg sm:text-xl font-bold tabular-nums">{lifeStats.recordedDays.toLocaleString('zh-CN')}</div>
                                </div>
                                <div className="bg-neutral-900 border border-neutral-800 rounded-md p-2">
                                    <div className="text-[11px] text-neutral-400">累计上传图片量</div>
                                    <div className="mt-1 text-lg sm:text-xl font-bold tabular-nums">{lifeStats.totalImageCount.toLocaleString('zh-CN')}<span className="ml-1 text-sm text-neutral-400">张</span></div>
                                </div>
                                <div className="bg-neutral-900 border border-neutral-800 rounded-md p-2">
                                    <div className="text-[11px] text-neutral-400">最长连续记录</div>
                                    <div className="mt-1 text-lg sm:text-xl font-bold tabular-nums">{lifeStats.longestStreak.toLocaleString('zh-CN')}<span className="ml-1 text-sm text-neutral-400">天</span></div>
                                </div>
                            </div>
                            <div className="mt-3 pt-3 border-t border-neutral-800">
                                <div className="text-xs text-neutral-400 mb-2">本年情绪分布</div>
                                <div className="flex items-center gap-3">
                                    <div
                                        className="relative w-28 h-28 sm:w-32 sm:h-32 shrink-0"
                                        onMouseLeave={() => setMoodPieHoverKey(null)}
                                    >
                                        <svg viewBox="0 0 100 100" className="w-full h-full">
                                            <circle
                                                cx="50"
                                                cy="50"
                                                r={moodPieChart.radius}
                                                fill="none"
                                                stroke="#3f3f46"
                                                strokeWidth={moodPieChart.strokeWidth}
                                            />
                                            {moodPieChart.segments.map((segment) => {
                                              if (segment.dashLength <= 0) return null;
                                              return (
                                                <circle
                                                  key={`mood-pie-${segment.key}`}
                                                  cx="50"
                                                  cy="50"
                                                  r={moodPieChart.radius}
                                                  fill="none"
                                                  stroke={segment.color}
                                                  strokeWidth={moodPieChart.strokeWidth}
                                                  strokeDasharray={`${segment.dashLength} ${moodPieChart.circumference - segment.dashLength}`}
                                                  strokeDashoffset={segment.dashOffset}
                                                  transform="rotate(-90 50 50)"
                                                  className="cursor-pointer transition-opacity"
                                                  opacity={moodPieHoverKey && moodPieHoverKey !== segment.key ? 0.45 : 1}
                                                  onMouseEnter={() => setMoodPieHoverKey(segment.key)}
                                                />
                                              );
                                            })}
                                        </svg>
                                        <div className="absolute inset-5 rounded-full bg-neutral-900 border border-neutral-700 flex flex-col items-center justify-center text-center px-1">
                                            <div className="text-[10px] text-neutral-400">已记录</div>
                                            <div className="text-sm font-bold tabular-nums">{lifeStats.currentYearRecordedDays.toLocaleString('zh-CN')}</div>
                                        </div>
                                        {hoveredMoodPieSegment && (
                                          <div className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full pointer-events-none px-2 py-1 rounded-md bg-black/90 border border-neutral-700 text-[11px] leading-4 whitespace-nowrap">
                                              <div className="text-neutral-200">{hoveredMoodPieSegment.label}</div>
                                              <div className="text-neutral-400">{hoveredMoodPieSegment.percent.toFixed(1)}%</div>
                                          </div>
                                        )}
                                    </div>
                                    <div className="flex-1 space-y-1 text-[11px]">
                                        {lifeStats.moodSegments.map((segment) => {
                                          return (
                                            <div key={segment.key} className="flex items-center justify-between gap-2">
                                              <div className="flex items-center gap-1.5 min-w-0">
                                                <span className={`w-2 h-2 rounded-full inline-block ${segment.dotClass}`} />
                                                <span className="truncate text-neutral-300">{segment.label}</span>
                                              </div>
                                              <span className="text-neutral-400 tabular-nums">{segment.count.toLocaleString('zh-CN')}</span>
                                            </div>
                                          );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="xl:col-span-2 bg-neutral-900/50 border border-neutral-800 rounded-lg p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                                <div>
                                    <div className="text-sm font-semibold">本年情绪趋势（柱状 + 折线）</div>
                                    <div className="text-[11px] text-neutral-500">X 轴：今年第几天，Y 轴：情绪值（0 未填 / 1 艰难 / 2 一般 / 3 开心）</div>
                                </div>
                                <div className="flex items-center gap-3 text-[11px] text-neutral-400">
                                    <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded-sm bg-neutral-500 inline-block" />柱状</span>
                                    <span className="flex items-center gap-1"><span className="w-3 h-[2px] rounded bg-sky-400 inline-block" />折线</span>
                                </div>
                            </div>
                            <div
                                className="relative mt-2 rounded-md border border-neutral-800 bg-black/20 p-2"
                                onMouseMove={(e) => {
                                    if (moodTrendChart.pointCount <= 0) return;
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const xWithin = Math.min(Math.max(0, e.clientX - rect.left), rect.width);
                                    const ratio = rect.width > 0 ? xWithin / rect.width : 0;
                                    const index = Math.min(
                                      moodTrendChart.pointCount - 1,
                                      Math.max(0, Math.round(ratio * (moodTrendChart.pointCount - 1)))
                                    );
                                    setMoodTrendHover({ index, x: xWithin, width: rect.width });
                                }}
                                onMouseLeave={() => setMoodTrendHover(null)}
                            >
                                <svg
                                    viewBox={`0 0 ${moodTrendChart.chartWidth} ${moodTrendChart.chartHeight}`}
                                    className="w-full h-56 sm:h-64"
                                    preserveAspectRatio="none"
                                >
                                    {[0, 1, 2, 3].map((level) => {
                                      const y = moodTrendChart.getY(level);
                                      return (
                                        <g key={level}>
                                          <line
                                            x1={moodTrendChart.margin.left}
                                            y1={y}
                                            x2={moodTrendChart.chartWidth - moodTrendChart.margin.right}
                                            y2={y}
                                            stroke="rgba(115,115,115,0.35)"
                                            strokeWidth="1"
                                          />
                                          <text
                                            x={moodTrendChart.margin.left - 8}
                                            y={y + 4}
                                            textAnchor="end"
                                            fontSize="10"
                                            fill="#9ca3af"
                                          >
                                            {level}
                                          </text>
                                        </g>
                                      );
                                    })}
                                    {moodTrendChart.tickIndices.map((index) => {
                                      const point = moodTrendChart.data[index];
                                      if (!point) return null;
                                      const x = moodTrendChart.getX(index);
                                      return (
                                        <g key={`x-tick-${index}`}>
                                          <line
                                            x1={x}
                                            y1={moodTrendChart.chartHeight - moodTrendChart.margin.bottom}
                                            x2={x}
                                            y2={moodTrendChart.chartHeight - moodTrendChart.margin.bottom + 4}
                                            stroke="rgba(115,115,115,0.6)"
                                            strokeWidth="1"
                                          />
                                          <text
                                            x={x}
                                            y={moodTrendChart.chartHeight - moodTrendChart.margin.bottom + 16}
                                            textAnchor="middle"
                                            fontSize="10"
                                            fill="#9ca3af"
                                          >
                                            {point.dayOfYear}
                                          </text>
                                        </g>
                                      );
                                    })}
                                    {moodTrendChart.bars.map((bar) => (
                                      <rect
                                        key={`bar-${bar.key}`}
                                        x={bar.x}
                                        y={bar.y}
                                        width={Math.max(1, bar.width)}
                                        height={bar.height}
                                        fill={bar.color}
                                        opacity={0.55}
                                      />
                                    ))}
                                    <polyline
                                        points={moodTrendChart.linePoints}
                                        fill="none"
                                        stroke="#38bdf8"
                                        strokeWidth="2"
                                    />
                                    {hoveredTrendPoint && (
                                      <g>
                                        <line
                                          x1={moodTrendChart.getX(moodTrendHover.index)}
                                          y1={moodTrendChart.margin.top}
                                          x2={moodTrendChart.getX(moodTrendHover.index)}
                                          y2={moodTrendChart.chartHeight - moodTrendChart.margin.bottom}
                                          stroke="rgba(148,163,184,0.45)"
                                          strokeDasharray="4 3"
                                        />
                                        <circle
                                          cx={moodTrendChart.getX(moodTrendHover.index)}
                                          cy={moodTrendChart.getY(hoveredTrendPoint.moodValue)}
                                          r="4"
                                          fill="#38bdf8"
                                          stroke="#0f172a"
                                          strokeWidth="1.5"
                                        />
                                      </g>
                                    )}
                                </svg>
                                {hoveredTrendPoint && (
                                  <div
                                    className="absolute z-20 pointer-events-none px-2 py-1 rounded-md bg-black/90 border border-neutral-700 text-[11px] leading-4"
                                    style={{
                                      left: `${Math.min(Math.max(moodTrendHover.x, 84), Math.max(84, moodTrendHover.width - 84))}px`,
                                      top: '8px',
                                      transform: 'translateX(-50%)',
                                    }}
                                  >
                                    <div className="text-neutral-200">{hoveredTrendPoint.dateKey}（第 {hoveredTrendPoint.dayOfYear} 天）</div>
                                    <div className="text-neutral-300">情绪：{hoveredTrendPoint.moodLabel}（{hoveredTrendPoint.moodValue}）</div>
                                    <div className="text-neutral-400 max-w-[260px] truncate">标题：{hoveredTrendPoint.title}</div>
                                  </div>
                                )}
                            </div>
                        </div>
                    </div>
                </Card>

                <Card className="p-3 sm:p-4">
                    <div className="flex items-center justify-between mb-3">
                        <span className="font-bold text-sm sm:text-base">往年今日</span>
                        <span className="text-xs text-neutral-500">
                            {`${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`}
                        </span>
                    </div>
                    {onThisDayRecords.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-neutral-700 bg-neutral-900/40 px-3 py-6 text-center text-sm text-neutral-500">
                            这一天在往年还没有记录
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {onThisDayRecords.slice(0, 6).map((record) => (
                                <button
                                    key={record.dateKey}
                                    onClick={() => handleGridClick(record.dateKey, false)}
                                    className="w-full text-left rounded-lg border border-neutral-700/80 bg-neutral-900/50 hover:border-neutral-500 hover:bg-neutral-900 px-3 py-2 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        {record.image ? (
                                            <img
                                                src={record.image}
                                                alt={record.title}
                                                className="w-12 h-12 rounded-md object-cover border border-neutral-700 shrink-0"
                                            />
                                        ) : (
                                            <div className="w-12 h-12 rounded-md border border-neutral-700 bg-neutral-800/70 text-neutral-500 flex items-center justify-center text-[11px] shrink-0">
                                                无图
                                            </div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 text-xs text-neutral-400">
                                                <span>{record.dateKey}</span>
                                                <span>{record.yearsAgo} 年前</span>
                                                {record.mood && moodConfig[record.mood] && (
                                                    <span className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-[10px] text-neutral-300">
                                                        {moodConfig[record.mood].label}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="mt-1 text-sm font-medium text-neutral-100 truncate">{record.title}</div>
                                            {record.preview && (
                                                <div className="mt-0.5 text-xs text-neutral-500 truncate">{record.preview}</div>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </Card>
            </div>

            {/* 渚ц竟鏍?*/}
            <div className="lg:col-span-4 space-y-6">
                 {/* 今日即刻行动 */}
                 <Card className="p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold flex items-center gap-2"><Zap size={18}/> 今日即刻行动</h3>
                        <span className="text-xs text-neutral-500">{todayInstantActions.length} 条</span>
                    </div>
                    {todayInstantActionTags.length > 1 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                            {todayInstantActionTags.map(tag => (
                                <button
                                    key={tag}
                                    onClick={() => setTodayInstantTagFilter(tag)}
                                    className={`px-2 py-1 rounded text-xs border ${
                                      todayInstantTagFilter === tag
                                        ? 'bg-white text-black border-white'
                                        : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800'
                                    }`}
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>
                    )}
                    {filteredTodayInstantActions.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-neutral-700 bg-neutral-900/40 px-3 py-6 text-center text-sm text-neutral-500">
                            今天还没有即刻行动
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                            {filteredTodayInstantActions.map(action => (
                                <div key={action.id} className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-2">
                                    <div className="flex items-start gap-2">
                                        <div className="text-xs text-neutral-400 mt-0.5 shrink-0">{formatTimeLabel(action.created_at)}</div>
                                        <div className="text-sm text-neutral-100 flex-1">{action.content}</div>
                                        <button
                                            onClick={() => handleDeleteInstantAction(todayDateKey, action.id)}
                                            className="text-neutral-500 hover:text-red-400"
                                            title="删除"
                                        >
                                            <Trash2 size={14}/>
                                        </button>
                                    </div>
                                    {Array.isArray(action.tags) && action.tags.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1">
                                            {action.tags.map(tag => (
                                                <span key={`${action.id}-${tag}`} className="px-2 py-0.5 rounded bg-neutral-800 text-[11px] text-neutral-300">
                                                    #{tag}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                 </Card>

                 {/* 今日打卡 */}
                 <Card className="p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold flex items-center gap-2"><CheckCircle2 size={18}/> 今日打卡</h3>
                        <button
                            onClick={() => setIsHabitModalOpen(true)}
                            className="text-xs px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
                        >
                            新建
                        </button>
                    </div>
                    {todayHabits.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-neutral-700 bg-neutral-900/40 px-3 py-6 text-center text-sm text-neutral-500">
                            暂无长期行为，先创建一个吧
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
                            {todayHabits.map(habit => (
                                <div key={habit.id} className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="text-sm font-medium text-neutral-100 truncate">{habit.name}</div>
                                            <div className="text-xs text-neutral-400">
                                                连续 {habit.streak_days || 0} 天 · 累计 {habit.total_completed || 0} 次
                                            </div>
                                        </div>
                                        {habit.today?.completed ? (
                                            <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-300 border border-green-500/30">已完成</span>
                                        ) : (
                                            <span className="text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">未完成</span>
                                        )}
                                    </div>
                                    {Array.isArray(habit.tags) && habit.tags.length > 0 && (
                                        <div className="mt-1 flex flex-wrap gap-1">
                                            {habit.tags.map(tag => (
                                                <span key={`${habit.id}-${tag}`} className="px-2 py-0.5 rounded bg-neutral-800 text-[11px] text-neutral-300">#{tag}</span>
                                            ))}
                                        </div>
                                    )}

                                    <div className="mt-2">
                                        {habit.mode === 'quantity' ? (
                                            <div className="flex gap-2 items-center">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={habitValueDrafts[habit.id] ?? habit.today?.value ?? ''}
                                                    onChange={e => setHabitValueDrafts({ ...habitValueDrafts, [habit.id]: e.target.value })}
                                                    placeholder={`目标 ${habit.target_value ?? '-'} ${habit.unit || ''}`}
                                                    className="flex-1 bg-black border border-neutral-700 rounded px-2 py-1 text-sm text-white"
                                                />
                                                <button
                                                    onClick={() => handleHabitCheckin(habit)}
                                                    className="px-3 py-1 rounded bg-white text-black text-sm font-medium hover:bg-neutral-200"
                                                >
                                                    提交
                                                </button>
                                                {habit.today && (
                                                    <button
                                                        onClick={() => handleHabitUndoToday(habit.id)}
                                                        className="px-2 py-1 rounded border border-neutral-700 text-xs text-neutral-300 hover:bg-neutral-800"
                                                    >
                                                        撤销
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="flex gap-2">
                                                {!habit.today?.completed ? (
                                                    <button
                                                        onClick={() => handleHabitCheckin(habit)}
                                                        className="px-3 py-1 rounded bg-white text-black text-sm font-medium hover:bg-neutral-200"
                                                    >
                                                        打卡
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => handleHabitUndoToday(habit.id)}
                                                        className="px-3 py-1 rounded border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-800"
                                                    >
                                                        撤销
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <div className="mt-2 flex justify-end">
                                        <button
                                            onClick={() => handleFinishHabit(habit.id, habit.name)}
                                            className="px-2 py-1 rounded border border-emerald-700/60 text-xs text-emerald-300 hover:bg-emerald-900/20"
                                            title="结束该打卡行为（保留历史记录）"
                                        >
                                            完成行为
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                 </Card>

                 {/* 目标清单 */}
                 <Card>
                    <h3 className="font-bold mb-4 flex items-center gap-2"><Target size={18}/> 目标清单</h3>
                    <div className="flex gap-2 mb-4">
                        <input value={tempGoal} onChange={e=>setTempGoal(e.target.value)} className="flex-1 bg-black border border-neutral-700 rounded px-2 text-sm text-white" placeholder="添加目标..." />
                        <button onClick={handleAddGoal} className="bg-white text-black p-2 rounded hover:bg-neutral-200"><Plus size={16}/></button>
                    </div>
                    <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                        {filteredGoals.map(g => (
                            <div key={g.id} className="flex gap-2 items-center text-sm">
                                <button onClick={() => handleGoalToggle(g.id)}>{g.completed ? <CheckCircle2 size={16} className="text-yellow-500"/> : <Circle size={16}/>}</button>
                                <span className={g.completed ? "line-through text-neutral-500" : ""}>{g.text}</span>
                                {g.completedAt && g.weekYear !== undefined && (
                                    <span className="text-xs text-neutral-500 ml-1">(第{g.weekYear} 岁)</span>
                                )}
                                <button onClick={() => handleDeleteGoal(g.id)} className="ml-auto text-neutral-600 hover:text-red-500"><Trash2 size={14}/></button>
                            </div>
                        ))}
                    </div>
                 </Card>

                 {/* 最近照片墙 */}
                 <Card className="p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold flex items-center gap-2"><ImageIcon size={18}/> 最近照片墙</h3>
                        <button
                            onClick={() => setIsGalleryOpen(true)}
                            className="text-xs text-neutral-400 hover:text-white transition-colors"
                        >
                            查看全部
                        </button>
                    </div>
                    {recentPhotoWall.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-neutral-700 bg-neutral-900/40 px-3 py-8 text-center text-sm text-neutral-500">
                            还没有照片，记录一天就会出现在这里
                        </div>
                    ) : (
                        <div className="relative">
                            <div className="absolute -inset-3 bg-gradient-to-br from-white/[0.05] via-transparent to-yellow-400/[0.08] blur-2xl pointer-events-none" />
                            <div className="relative grid grid-cols-3 gap-2">
                                {Array.from({ length: 9 }).map((_, index) => {
                                    const photo = recentPhotoWall[index];
                                    if (!photo) {
                                        return (
                                            <div
                                                key={`photo-empty-${index}`}
                                                className="aspect-square rounded-lg border border-dashed border-neutral-700/80 bg-neutral-900/30 flex items-center justify-center text-[11px] text-neutral-600"
                                            >
                                                待记录
                                            </div>
                                        );
                                    }

                                    return (
                                        <button
                                            key={photo.id}
                                            onClick={() => {
                                                setPreviewImageSrc(photo.imageOriginal || photo.image);
                                                setIsImagePreviewOpen(true);
                                                setIsPreviewFullScreen(false);
                                            }}
                                            className="group relative aspect-square overflow-hidden rounded-lg border border-neutral-700/80 bg-neutral-900 hover:border-neutral-500 transition-all duration-200 hover:-translate-y-0.5"
                                            title={photo.eventTitle || photo.dateKey}
                                        >
                                            <img
                                                src={photo.image}
                                                alt={photo.eventTitle || `最近照片 ${index + 1}`}
                                                loading="lazy"
                                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                            <div className="absolute left-1 right-1 bottom-1 text-[10px] text-neutral-200 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                                                {photo.dateKey}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                 </Card>

                 {/* 日历 */}
                 <Card className="cursor-pointer hover:border-neutral-600 transition-colors" onClick={() => setIsCalendarModalOpen(true)}>
                    <h3 className="font-bold mb-4 flex items-center gap-2"><CalendarDays size={18}/> 日历 <span className="text-xs text-neutral-500 font-normal ml-auto">点击放大</span></h3>
                    <div className="space-y-4">
                        {/* 当前年月 */}
                        <div className="text-center font-bold">
                            {new Date().getFullYear()}年 {new Date().getMonth() + 1}月
                        </div>

                        {/* 星期标题 */}
                        <div className="grid grid-cols-7 gap-1">
                            {['一', '二', '三', '四', '五', '六', '日'].map(day => (
                                <div key={day} className="text-center text-xs text-neutral-400 font-medium py-1">
                                    {day}
                                </div>
                            ))}
                        </div>

                        {/* 日期网格 */}
                        <div className="grid grid-cols-7 gap-1">
                            {(() => {
                                const today = new Date();
                                const year = today.getFullYear();
                                const month = today.getMonth();
                                const firstDay = new Date(year, month, 1);
                                const lastDay = new Date(year, month + 1, 0);
                                const daysInMonth = lastDay.getDate();
                                const startingDay = (firstDay.getDay() + 6) % 7; // 鍛ㄤ竴涓?锛屽懆鏃ヤ负6

                                // 获取当月的纪念日/计划日（只有纪念日支持周年重复）
                                const monthSpecialDays = specialDays.filter(day => {
                                    const eventDate = typeof day.date === 'string' ? day.date.split('T')[0] :
                                        `${day.date.getFullYear()}-${String(day.date.getMonth() + 1).padStart(2, '0')}-${String(day.date.getDate()).padStart(2, '0')}`;
                                    const [eventYear, eventMonth] = eventDate.split('-').map(Number);

                                    // 鍙湁绾康鏃ョ被鍨嬫墠鍛ㄥ勾閲嶅锛岃鍒掓棩涓嶉噸澶?
                                    if (day.type === 'anniversary') {
                                        return eventMonth === month + 1;
                                    }
                                    // 璁″垝鏃ユ瘮杈冨畬鏁村勾鏈?
                                    return eventYear === year && eventMonth === month + 1;
                                });

                                const days = [];

                                // 上个月的空格
                                for (let i = 0; i < startingDay; i++) {
                                    days.push({ day: '', isCurrentMonth: false });
                                }

                                // 当月日期
                                for (let d = 1; d <= daysInMonth; d++) {
                                    const date = new Date(year, month, d);
                                    // 使用本地时间格式化，避免时区偏移问题
                                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

                                    // 妫€鏌ヨ繖涓€澶╂槸鍚︽湁绾康鏃?璁″垝鏃ワ紙鍙湁绾康鏃ユ敮鎸佸懆骞撮噸澶嶏級
                                    const dayEvents = monthSpecialDays.filter(event => {
                                        const eventDate = typeof event.date === 'string' ? event.date.split('T')[0] :
                                            `${event.date.getFullYear()}-${String(event.date.getMonth() + 1).padStart(2, '0')}-${String(event.date.getDate()).padStart(2, '0')}`;
                                        const [eventYear, eventMonth, eventDay] = eventDate.split('-').map(Number);

                                        // 只有纪念日类型才周年重复
                                        if (event.type === 'anniversary') {
                                            return eventMonth === month + 1 && eventDay === d;
                                        }
                                        // 璁″垝鏃ユ瘮杈冨畬鏁存棩鏈?
                                        return eventDate === dateStr;
                                    });

                                    const isToday = date.toDateString() === today.toDateString();

                                    days.push({
                                        day: d,
                                        isCurrentMonth: true,
                                        date: dateStr,
                                        events: dayEvents,
                                        isToday
                                    });
                                }

                                return days.map((dayInfo, index) => (
                                    <div
                                        key={index}
                                        className={`min-h-8 p-1 border border-neutral-700/30 rounded-sm text-xs flex flex-col items-center justify-center ${
                                            dayInfo.isCurrentMonth
                                                ? (dayInfo.isToday ? 'bg-yellow-500/20 border-yellow-500/50' : 'bg-neutral-800/20')
                                                : 'bg-neutral-900/10 opacity-30'
                                        }`}
                                    >
                                        {dayInfo.day && (
                                            <>
                                                <div className={`w-5 h-5 flex items-center justify-center rounded-full ${
                                                    dayInfo.isToday ? 'bg-yellow-500 text-black font-bold' : ''
                                                }`}>
                                                    {dayInfo.day}
                                                </div>
                                                {dayInfo.events && dayInfo.events.length > 0 && (
                                                    <div className="mt-1 flex gap-0.5">
                                                        {dayInfo.events.map((event, idx) => (
                                                            <div
                                                                key={idx}
                                                                className={`w-1 h-1 rounded-full ${
                                                                    event.type === 'anniversary' ? 'bg-blue-500' : 'bg-purple-500'
                                                                }`}
                                                                title={`${event.title} (${event.type === 'anniversary' ? '纪念日' : '计划'})`}
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                ));
                            })()}
                        </div>

                        {/* 图例 */}
                        <div className="flex flex-wrap gap-3 text-xs text-neutral-400 mt-2">
                            <div className="flex items-center gap-1">
                                <div className="w-3 h-3 rounded-sm bg-blue-500/30"></div>
                                <span>纪念日</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-3 h-3 rounded-sm bg-purple-500/30"></div>
                                <span>计划日</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-5 h-5 rounded-full bg-yellow-500"></div>
                                <span>今天</span>
                            </div>
                        </div>
                    </div>
                 </Card>
            </div>
        </div>

        {/* 寮圭獥锛氱紪杈戝洖蹇?*/}
        <Modal isOpen={isEditModalOpen} onClose={()=>setIsEditModalOpen(false)} title={selectedDate ? `记录日记 · ${selectedDate.dateKey}` : "记录日记"}>
            <div className="space-y-4">
                {/* 褰撴棩瀹屾垚鐨勭洰鏍?*/}
                {selectedDate && (() => {
                    const completedGoalsThisDay = goals.filter(g =>
                        g.completed &&
                        g.completedAt === selectedDate.dateKey
                    );
                    return completedGoalsThisDay.length > 0 && (
                        <div className="bg-neutral-800/50 border border-neutral-700 rounded-lg p-3">
                            <div className="text-sm font-medium text-neutral-400 mb-2">当日完成的目标</div>
                            <div className="space-y-1">
                                {completedGoalsThisDay.map(g => (
                                    <div key={g.id} className="flex items-center text-sm">
                                        <CheckCircle2 size={14} className="text-yellow-500 mr-2 flex-shrink-0" />
                                        <span className="line-through text-neutral-300">{g.text}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })()}

                {tempEvent.images && tempEvent.images.length > 0 ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-2">
                            {tempEvent.images.map((previewUrl, index) => (
                                <div key={index} className="relative aspect-square bg-black rounded overflow-hidden group">
                                    <img src={previewUrl} className="w-full h-full object-cover opacity-80" alt={`preview ${index}`} />
                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 transition-opacity gap-2">
                                        {tempEvent.imagesOriginal && tempEvent.imagesOriginal[index] && (
                                            <button onClick={()=>{setPreviewImageSrc(tempEvent.imagesOriginal[index]); setIsImagePreviewOpen(true); setIsPreviewFullScreen(false);}} className="p-1 bg-white text-black rounded-full" title="查看原图"><Maximize2 size={16}/></button>
                                        )}
                                        <button onClick={() => {
                                            // 删除这张图片
                                            const newImages = [...tempEvent.images];
                                            const newImagesOriginal = [...(tempEvent.imagesOriginal || [])];
                                            const newImageFiles = [...(tempEvent.imageFiles || [])];
                                            newImages.splice(index, 1);
                                            newImagesOriginal.splice(index, 1);
                                            newImageFiles.splice(index, 1);
                                            // 释放预览URL
                                            URL.revokeObjectURL(previewUrl);
                                            setTempEvent({
                                                ...tempEvent,
                                                images: newImages,
                                                imagesOriginal: newImagesOriginal,
                                                imageFiles: newImageFiles
                                            });
                                        }} className="p-1 bg-red-500 text-white rounded-full"><Trash2 size={16}/></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleImageSelect} multiple />
                            <button onClick={()=>fileInputRef.current?.click()} className="flex-1 border border-dashed border-neutral-600 p-2 rounded text-neutral-400 hover:bg-neutral-800 transition-colors flex justify-center gap-2 text-sm"><Upload size={14}/> 添加更多图片</button>
                            <button onClick={() => {
                                // 娓呯┖鎵€鏈夊浘鐗?
                                tempEvent.images.forEach(url => URL.revokeObjectURL(url));
                                setTempEvent({
                                    ...tempEvent,
                                    images: [],
                                    imagesOriginal: [],
                                    imageFiles: []
                                });
                            }} className="px-4 py-2 border border-red-700 text-red-400 hover:bg-red-900/30 rounded text-sm">清空</button>
                        </div>
                    </div>
                ) : (
                    <div className="flex gap-2">
                        <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleImageSelect} multiple />
                        <button onClick={()=>fileInputRef.current?.click()} className="flex-1 border border-dashed border-neutral-600 p-4 rounded text-neutral-400 hover:bg-neutral-800 transition-colors flex justify-center gap-2"><Upload size={16}/> 上传图片</button>
                    </div>
                )}

                {/* 粘贴提示 */}
                <div className="text-center text-neutral-500 text-sm flex items-center justify-center gap-2">
                    <span>或按</span>
                    <kbd className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-xs">Ctrl</kbd>
                    <span>+</span>
                    <kbd className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-xs">V</kbd>
                    <span>粘贴图片</span>
                </div>

                {/* 鏍囬杈撳叆 + 琛ㄦ儏閫夋嫨鍣?*/}
                <div className="space-y-2">
                    <div className="relative">
                        <input
                            ref={titleInputRef}
                            value={tempEvent.title || ''}
                            onChange={e=>setTempEvent({...tempEvent, title:e.target.value})}
                            onSelect={updateTitleCursor}
                            onKeyUp={updateTitleCursor}
                            onClick={updateTitleCursor}
                            onFocus={updateTitleCursor}
                            placeholder="标题"
                            className="w-full bg-black border border-neutral-700 p-3 pr-12 rounded text-white focus:outline-none focus:border-neutral-500"
                        />
                        <button
                            onClick={() => {
                                setShowTitleEmojiPicker(!showTitleEmojiPicker);
                                setShowContentEmojiPicker(false);
                            }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors p-1"
                            title="添加表情"
                        >
                            <Smile size={20} />
                        </button>
                    </div>
                    {showTitleEmojiPicker && (
                        <div className="absolute z-50 mt-1">
                            <div className="bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl">
                                <EmojiPicker
                                    onEmojiClick={(emojiData) => {
                                        insertEmojiAtCursor('title', emojiData.emoji);
                                        setShowTitleEmojiPicker(false);
                                    }}
                                    width={320}
                                    height={400}
                                    theme="dark"
                                    emojiData={emojisZhData}
                                    categories={emojiPickerCategories}
                                    previewConfig={emojiPickerPreviewConfig}
                                    searchPlaceholder="搜索表情..."
                                    searchClearButtonLabel="清除"
                                    emojiStyle="native"
                                />
                            </div>
                        </div>
                    )}
                </div>
                
                <div className="flex gap-2">
                    {Object.entries(moodConfig).map(([key, config]) => (
                        <button key={key} onClick={()=>setTempEvent({...tempEvent, mood:key})} className={`flex-1 p-2 rounded border text-sm ${tempEvent.mood===key ? 'bg-white text-black border-white' : 'border-neutral-700 hover:bg-neutral-800'}`}>{config.label}</button>
                    ))}
                </div>

                {tempEvent.city && (
                    <div className="text-xs text-neutral-400 bg-neutral-900/60 border border-neutral-800 rounded-md px-3 py-2">
                        拍摄城市（自动识别）：<span className="text-neutral-200">{tempEvent.city}</span>
                    </div>
                )}

                {/* 璇︽儏杈撳叆 + 琛ㄦ儏閫夋嫨鍣?*/}
                <div className="space-y-2">
                    <div className="relative">
                        <textarea
                            ref={contentTextareaRef}
                            value={tempEvent.content || ''}
                            onChange={e=>setTempEvent({...tempEvent, content:e.target.value})}
                            onSelect={updateContentCursor}
                            onKeyUp={updateContentCursor}
                            onClick={updateContentCursor}
                            onFocus={updateContentCursor}
                            placeholder="详情..."
                            className="w-full min-h-32 h-48 bg-black border border-neutral-700 p-3 pr-12 rounded text-white resize-y focus:outline-none focus:border-neutral-500"
                        />
                        <button
                            onClick={() => {
                                setShowContentEmojiPicker(!showContentEmojiPicker);
                                setShowTitleEmojiPicker(false);
                            }}
                            className="absolute right-3 bottom-3 text-neutral-400 hover:text-white transition-colors p-1"
                            title="添加表情"
                        >
                            <Smile size={20} />
                        </button>
                    </div>
                    {showContentEmojiPicker && (
                        <div className="absolute z-50 mt-1">
                            <div className="bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl">
                                <EmojiPicker
                                    onEmojiClick={(emojiData) => {
                                        insertEmojiAtCursor('content', emojiData.emoji);
                                        setShowContentEmojiPicker(false);
                                    }}
                                    width={320}
                                    height={400}
                                    theme="dark"
                                    emojiData={emojisZhData}
                                    categories={emojiPickerCategories}
                                    previewConfig={emojiPickerPreviewConfig}
                                    searchPlaceholder="搜索表情..."
                                    searchClearButtonLabel="清除"
                                    emojiStyle="native"
                                />
                            </div>
                        </div>
                    )}
                </div>
                
                <div className="flex justify-end gap-2 pt-2">
                    <button onClick={handleSaveEvent} className="px-6 py-2 bg-white text-black rounded font-bold hover:bg-neutral-200">保存</button>
                </div>

                {/* 当日即刻行动记录（自动形成，放在保存按钮下方） */}
                {selectedDate && (
                    <div className="bg-neutral-800/40 border border-neutral-700 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-sm font-medium text-neutral-200 flex items-center gap-2">
                                <Zap size={14}/> 即刻行动记录
                            </div>
                            <span className="text-xs text-neutral-500">{selectedDateInstantActions.length} 条</span>
                        </div>
                        {selectedDateInstantActions.length === 0 ? (
                            <div className="text-sm text-neutral-500">当天暂无即刻行动记录</div>
                        ) : (
                            <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                                {selectedDateInstantActions.map(action => (
                                    <div key={action.id} className="bg-neutral-900/60 border border-neutral-700 rounded p-2">
                                        <div className="flex items-start gap-2">
                                            <div className="text-xs text-neutral-400 mt-0.5">{formatTimeLabel(action.created_at)}</div>
                                            <div className="text-sm text-neutral-100 flex-1">{action.content}</div>
                                            <button
                                                onClick={() => handleDeleteInstantAction(selectedDate.dateKey, action.id)}
                                                className="text-neutral-500 hover:text-red-400"
                                                title="删除"
                                            >
                                                <Trash2 size={14}/>
                                            </button>
                                        </div>
                                        {Array.isArray(action.tags) && action.tags.length > 0 && (
                                            <div className="mt-1 flex flex-wrap gap-1">
                                                {action.tags.map(tag => (
                                                    <span key={`${action.id}-${tag}`} className="px-2 py-0.5 rounded bg-neutral-800 text-[11px] text-neutral-300">
                                                        #{tag}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* 当日长期行为打卡记录（自动形成，放在保存按钮下方） */}
                {selectedDate && (
                    <div className="bg-neutral-800/40 border border-neutral-700 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-sm font-medium text-neutral-200 flex items-center gap-2">
                                <CheckCircle2 size={14}/> 今日打卡记录
                            </div>
                            <span className="text-xs text-neutral-500">{selectedDateHabitLogs.length} 条</span>
                        </div>
                        {isLoadingHabitLogs ? (
                            <div className="text-sm text-neutral-500">加载中...</div>
                        ) : selectedDateHabitLogs.length === 0 ? (
                            <div className="text-sm text-neutral-500">当天暂无打卡记录</div>
                        ) : (
                            <div className="space-y-2 max-h-44 overflow-y-auto custom-scrollbar">
                                {selectedDateHabitLogs.map(log => (
                                    <div key={log.id} className="bg-neutral-900/60 border border-neutral-700 rounded p-2">
                                        <div className="flex items-start gap-2">
                                            <div className="text-xs text-neutral-400 mt-0.5">{formatTimeLabel(log.created_at)}</div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm text-neutral-100 truncate">
                                                    {log.habit_name || `行为 #${log.habit_id}`}
                                                    <span className="ml-2 text-xs text-neutral-400">
                                                        {log.completed ? '已完成' : '未完成'}
                                                    </span>
                                                </div>
                                                {(log.value !== null && log.value !== undefined) && (
                                                    <div className="text-xs text-neutral-400 mt-0.5">
                                                        数值：{log.value}{log.habit_unit ? ` ${log.habit_unit}` : ''}
                                                    </div>
                                                )}
                                                {Array.isArray(log.habit_tags) && log.habit_tags.length > 0 && (
                                                    <div className="mt-1 flex flex-wrap gap-1">
                                                        {log.habit_tags.map(tag => (
                                                            <span key={`${log.id}-${tag}`} className="px-2 py-0.5 rounded bg-neutral-800 text-[11px] text-neutral-300">
                                                                #{tag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => handleDeleteHabitLogInDiary(log.habit_id, selectedDate.dateKey)}
                                                className="text-neutral-500 hover:text-red-400"
                                                title="删除"
                                            >
                                                <Trash2 size={14}/>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </Modal>
        
        {/* 寮圭獥锛氱浉鍐?- 鏀寔鍏ㄥ睆 */}
        {isGalleryOpen && (
            <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm ${isGalleryFullScreen ? '' : 'p-4'}`}>
                <div className={`bg-neutral-900 border border-neutral-700 shadow-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col ${
                    isGalleryFullScreen
                        ? 'w-full h-full rounded-none'
                        : 'w-full max-w-4xl max-h-[90vh] rounded-2xl my-8'
                }`}>
                    <div className="flex justify-between items-center p-4 border-b border-neutral-800 sticky top-0 bg-neutral-900 z-10 rounded-t-2xl shrink-0">
                        <h3 className="text-lg font-semibold text-white">时光相册</h3>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setIsGalleryFullScreen(!isGalleryFullScreen)}
                                className="p-2 hover:bg-neutral-800 rounded-full transition-colors text-neutral-400"
                                title={isGalleryFullScreen ? "退出全屏" : "全屏显示"}
                            >
                                <Maximize2 size={18} />
                            </button>
                            <button
                                onClick={() => { setIsGalleryOpen(false); setIsGalleryFullScreen(false); }}
                                className="p-1 hover:bg-neutral-800 rounded-full transition-colors text-neutral-400"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>
                    <div className="p-4 overflow-y-auto flex-1 custom-scrollbar">
                        {galleryImages.length === 0 ? (
                            <div className="text-center py-20 text-neutral-500">空空如也</div>
                        ) : (
                            <div className={`gap-4 ${isGalleryFullScreen ? 'columns-2 md:columns-3 lg:columns-4 xl:columns-5' : 'columns-2 md:columns-3'}`}>
                                {galleryImages.map(img => (
                                    <div
                                        key={img.id}
                                        onClick={() => {
                                            setPreviewImageSrc(img.imageOriginal || img.image);
                                            setIsImagePreviewOpen(true);
                                            setIsPreviewFullScreen(false);
                                        }}
                                        className="break-inside-avoid relative group rounded overflow-hidden cursor-pointer mb-4"
                                    >
                                        <img src={img.image} className="w-full h-auto" loading="lazy" alt={img.eventTitle || '相册图片'} />
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 text-sm">
                                            <div className="font-bold">{img.dateKey}</div>
                                            {img.eventTitle && <div className="text-xs mt-1 truncate" title={img.eventTitle}>{img.eventTitle}</div>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* 窗口：管理员添加用户 */}
        <Modal isOpen={isAdminModalOpen} onClose={()=>setIsAdminModalOpen(false)} title="添加新用户">
             <form onSubmit={handleRegister} className="space-y-4">
                 <input placeholder="用户名" required value={newUserForm.username} onChange={e=>setNewUserForm({...newUserForm, username:e.target.value})} className="w-full bg-black border border-neutral-700 p-2 rounded text-white"/>
                 <input type="password" placeholder="密码" required value={newUserForm.password} onChange={e=>setNewUserForm({...newUserForm, password:e.target.value})} className="w-full bg-black border border-neutral-700 p-2 rounded text-white"/>
                 <button type="submit" className="w-full bg-white text-black p-2 rounded font-bold">创建</button>
             </form>
        </Modal>

        {/* 弹窗：即刻行动快速记录 */}
        <Modal isOpen={isInstantActionModalOpen} onClose={() => setIsInstantActionModalOpen(false)} title="⚡ 记录即刻行动">
            <div className="space-y-4">
                <div>
                    <label className="block text-sm text-neutral-400 mb-1">内容</label>
                    <textarea
                        value={instantActionForm.content}
                        onChange={e => setInstantActionForm({ ...instantActionForm, content: e.target.value })}
                        placeholder="现在立刻做了什么？"
                        className="w-full min-h-24 bg-black border border-neutral-700 p-3 rounded text-white resize-y"
                    />
                </div>

                <div>
                    <label className="block text-sm text-neutral-400 mb-1">快捷标签</label>
                    <div className="flex flex-wrap gap-2">
                        {quickInstantTags.map(tag => (
                            <button
                                key={tag}
                                onClick={() => addInstantTag(tag)}
                                className="px-2 py-1 rounded border border-neutral-700 text-xs text-neutral-300 hover:bg-neutral-800"
                            >
                                {tag}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="block text-sm text-neutral-400 mb-1">自定义标签</label>
                    <input
                        value={instantActionForm.tagInput}
                        onChange={e => setInstantActionForm({ ...instantActionForm, tagInput: e.target.value })}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addInstantTag(instantActionForm.tagInput);
                          }
                        }}
                        placeholder="输入后回车添加"
                        className="w-full bg-black border border-neutral-700 p-2 rounded text-white text-sm"
                    />
                </div>

                {instantActionForm.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {instantActionForm.tags.map(tag => (
                            <button
                                key={tag}
                                onClick={() => removeInstantTag(tag)}
                                className="px-2 py-1 rounded bg-neutral-800 text-xs text-neutral-200 hover:bg-neutral-700"
                            >
                                #{tag} ×
                            </button>
                        ))}
                    </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                    <button onClick={() => setIsInstantActionModalOpen(false)} className="px-4 py-2 border border-neutral-700 rounded text-sm hover:bg-neutral-800">
                        取消
                    </button>
                    <button
                        onClick={handleSaveInstantAction}
                        disabled={isSavingInstantAction}
                        className="px-4 py-2 bg-white text-black rounded text-sm font-bold hover:bg-neutral-200 disabled:opacity-50"
                    >
                        {isSavingInstantAction ? '保存中...' : '保存并记录'}
                    </button>
                </div>
            </div>
        </Modal>

        {/* 弹窗：新建长期行为 */}
        <Modal isOpen={isHabitModalOpen} onClose={() => setIsHabitModalOpen(false)} title="新建长期行为" maxWidth="max-w-2xl">
            <div className="space-y-4">
                <div>
                    <label className="block text-sm text-neutral-400 mb-1">行为名称</label>
                    <input
                        value={habitForm.name}
                        onChange={e => setHabitForm({ ...habitForm, name: e.target.value })}
                        placeholder="例如：晨跑、读书"
                        className="w-full bg-black border border-neutral-700 p-2 rounded text-white"
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm text-neutral-400 mb-1">行为类型</label>
                        <select
                            value={habitForm.mode}
                            onChange={e => setHabitForm({ ...habitForm, mode: e.target.value })}
                            className="w-full bg-black border border-neutral-700 p-2 rounded text-white"
                        >
                            <option value="binary">完成型（做/没做）</option>
                            <option value="quantity">计量型（数值）</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm text-neutral-400 mb-1">频率</label>
                        <select
                            value={habitForm.frequencyType}
                            onChange={e => setHabitForm({ ...habitForm, frequencyType: e.target.value })}
                            className="w-full bg-black border border-neutral-700 p-2 rounded text-white"
                        >
                            <option value="daily">每天</option>
                            <option value="weekly_n">每周 N 次</option>
                            <option value="weekly_days">固定星期几</option>
                        </select>
                    </div>
                </div>

                {habitForm.frequencyType === 'weekly_n' && (
                    <div>
                        <label className="block text-sm text-neutral-400 mb-1">每周次数（1-7）</label>
                        <input
                            type="number"
                            min="1"
                            max="7"
                            value={habitForm.frequencyTimes}
                            onChange={e => setHabitForm({ ...habitForm, frequencyTimes: e.target.value })}
                            className="w-full bg-black border border-neutral-700 p-2 rounded text-white"
                        />
                    </div>
                )}

                {habitForm.frequencyType === 'weekly_days' && (
                    <div>
                        <label className="block text-sm text-neutral-400 mb-1">选择星期</label>
                        <div className="flex flex-wrap gap-2">
                            {weekDayOptions.map(day => (
                                <button
                                    key={day.value}
                                    onClick={() => toggleHabitWeekDay(day.value)}
                                    className={`px-3 py-1 rounded border text-sm ${
                                      habitForm.weeklyDays.includes(day.value)
                                        ? 'bg-white text-black border-white'
                                        : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800'
                                    }`}
                                >
                                    周{day.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {habitForm.mode === 'quantity' && (
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm text-neutral-400 mb-1">目标值</label>
                            <input
                                type="number"
                                min="1"
                                value={habitForm.targetValue}
                                onChange={e => setHabitForm({ ...habitForm, targetValue: e.target.value })}
                                className="w-full bg-black border border-neutral-700 p-2 rounded text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-neutral-400 mb-1">单位</label>
                            <input
                                value={habitForm.unit}
                                onChange={e => setHabitForm({ ...habitForm, unit: e.target.value })}
                                placeholder="分钟/页/次"
                                className="w-full bg-black border border-neutral-700 p-2 rounded text-white"
                            />
                        </div>
                    </div>
                )}

                <div>
                    <label className="block text-sm text-neutral-400 mb-1">快捷标签</label>
                    <div className="flex flex-wrap gap-2">
                        {quickHabitTags.map(tag => (
                            <button
                                key={tag}
                                onClick={() => addHabitTag(tag)}
                                className="px-2 py-1 rounded border border-neutral-700 text-xs text-neutral-300 hover:bg-neutral-800"
                            >
                                {tag}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="block text-sm text-neutral-400 mb-1">自定义标签</label>
                    <input
                        value={habitForm.tagInput}
                        onChange={e => setHabitForm({ ...habitForm, tagInput: e.target.value })}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addHabitTag(habitForm.tagInput);
                          }
                        }}
                        placeholder="输入后回车添加"
                        className="w-full bg-black border border-neutral-700 p-2 rounded text-white text-sm"
                    />
                </div>

                {habitForm.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {habitForm.tags.map(tag => (
                            <button
                                key={tag}
                                onClick={() => removeHabitTag(tag)}
                                className="px-2 py-1 rounded bg-neutral-800 text-xs text-neutral-200 hover:bg-neutral-700"
                            >
                                #{tag} ×
                            </button>
                        ))}
                    </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm text-neutral-400 mb-1">开始日期</label>
                        <input
                            type="date"
                            value={habitForm.startDate}
                            onChange={e => setHabitForm({ ...habitForm, startDate: e.target.value })}
                            className="w-full bg-black border border-neutral-700 p-2 rounded text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-neutral-400 mb-1">提醒时间（可选）</label>
                        <input
                            type="time"
                            value={habitForm.reminderTime}
                            onChange={e => setHabitForm({ ...habitForm, reminderTime: e.target.value })}
                            className="w-full bg-black border border-neutral-700 p-2 rounded text-white"
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <button onClick={() => setIsHabitModalOpen(false)} className="px-4 py-2 border border-neutral-700 rounded text-sm hover:bg-neutral-800">
                        取消
                    </button>
                    <button
                        onClick={handleCreateHabit}
                        disabled={isCreatingHabit}
                        className="px-4 py-2 bg-white text-black rounded text-sm font-bold hover:bg-neutral-200 disabled:opacity-50"
                    >
                        {isCreatingHabit ? '创建中...' : '创建行为'}
                    </button>
                </div>
            </div>
        </Modal>

        {/* 寮圭獥锛氱敤鎴疯祫鏂欑紪杈?*/}
        <Modal isOpen={isUserProfileModalOpen} onClose={()=>setIsUserProfileModalOpen(false)} title="编辑个人资料">
             <form onSubmit={handleSaveProfile} className="space-y-4">
                 {/* 头像上传区域 */}
                 <div className="flex flex-col items-center gap-3 mb-4">
                     <div className="w-24 h-24 rounded-full bg-neutral-700 flex items-center justify-center overflow-hidden border-2 border-neutral-600">
                         {userProfile.avatar ? (
                             <img src={userProfile.avatar} className="w-full h-full object-cover" alt="头像" />
                         ) : (
                             <span className="text-3xl font-bold text-neutral-400">{userProfile.nickname?.charAt(0) || '?'}</span>
                         )}
                     </div>
                     <input
                         type="file"
                         ref={avatarInputRef}
                         accept="image/jpeg,image/png,image/gif,image/webp"
                         className="hidden"
                         onChange={handleAvatarUpload}
                     />
                     <button
                         type="button"
                         onClick={() => avatarInputRef.current?.click()}
                         disabled={isUploadingAvatar}
                         className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 rounded text-sm flex items-center gap-2 disabled:opacity-50"
                     >
                         <Upload size={14} />
                         {isUploadingAvatar ? "上传中..." : "上传头像"}
                     </button>
                     <p className="text-xs text-neutral-500">支持 JPG、PNG、GIF、WebP 格式，最大 5MB</p>
                 </div>

                 <div>
                     <label className="block text-sm text-neutral-400 mb-1">昵称</label>
                     <input
                         value={userProfile.nickname || ''}
                         onChange={e=>setUserProfile({...userProfile, nickname:e.target.value})}
                         placeholder="请输入昵称"
                         className="w-full bg-black border border-neutral-700 p-2 rounded text-white"
                     />
                 </div>
                 <div>
                     <label className="block text-sm text-neutral-400 mb-1">头像URL（可选，上传头像后自动填写）</label>
                     <input
                         value={userProfile.avatar || ''}
                         onChange={e=>setUserProfile({...userProfile, avatar:e.target.value})}
                         placeholder="https://example.com/avatar.jpg"
                         className="w-full bg-black border border-neutral-700 p-2 rounded text-white"
                     />
                 </div>
                 <div className="grid grid-cols-3 gap-2">
                     <div>
                         <label className="block text-sm text-neutral-400 mb-1">出生年份</label>
                         <input
                             type="number"
                             value={dobYear}
                             onChange={e=>setDobYear(parseInt(e.target.value) || new Date().getFullYear() - 25)}
                             className="w-full bg-black border border-neutral-700 p-2 rounded text-white"
                         />
                     </div>
                     <div>
                         <label className="block text-sm text-neutral-400 mb-1">月份</label>
                         <input
                             type="number"
                             min="1"
                             max="12"
                             value={dobMonth}
                             onChange={e=>setDobMonth(parseInt(e.target.value) || 1)}
                             className="w-full bg-black border border-neutral-700 p-2 rounded text-white"
                         />
                     </div>
                     <div>
                         <label className="block text-sm text-neutral-400 mb-1">日期</label>
                         <input
                             type="number"
                             min="1"
                             max="31"
                             value={dobDay}
                             onChange={e=>setDobDay(parseInt(e.target.value) || 1)}
                             className="w-full bg-black border border-neutral-700 p-2 rounded text-white"
                         />
                     </div>
                 </div>
                 <div>
                     <label className="block text-sm text-neutral-400 mb-1">预期寿命（年）</label>
                     <input
                         type="number"
                         value={config.life_expectancy || 100}
                         onChange={e=>setConfig({...config, life_expectancy: parseInt(e.target.value) || 100})}
                         className="w-full bg-black border border-neutral-700 p-2 rounded text-white"
                     />
                 </div>
                 <button type="submit" className="w-full bg-white text-black p-2 rounded font-bold">保存资料</button>
                 <button
                   type="button"
                   onClick={() => {
                     setIsUserProfileModalOpen(false);
                     setIsChangePasswordModalOpen(true);
                   }}
                   className="w-full bg-neutral-800 text-white p-2 rounded font-bold mt-2 hover:bg-neutral-700 transition-colors"
                 >
                   修改密码
                 </button>
             </form>
        </Modal>

        {/* 寮圭獥锛氫慨鏀瑰瘑鐮?*/}
        <Modal isOpen={isChangePasswordModalOpen} onClose={()=>{
          setIsChangePasswordModalOpen(false);
          setPasswordError('');
          setPasswordForm({
            oldPassword: '',
            newPassword: '',
            confirmPassword: ''
          });
        }} title="修改密码">
          <form onSubmit={handleChangePassword} className="space-y-4">
            {passwordError && (
              <div className="bg-red-900/50 border border-red-700 text-red-300 p-3 rounded text-sm">
                {passwordError}
              </div>
            )}

            <div>
              <label className="block text-sm text-neutral-400 mb-1">旧密码</label>
              <input
                type="password"
                value={passwordForm.oldPassword}
                onChange={e=>setPasswordForm({...passwordForm, oldPassword: e.target.value})}
                placeholder="请输入当前密码"
                className="w-full bg-black border border-neutral-700 p-2 rounded text-white"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-neutral-400 mb-1">新密码</label>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={e=>setPasswordForm({...passwordForm, newPassword: e.target.value})}
                placeholder="至少6位字符"
                className="w-full bg-black border border-neutral-700 p-2 rounded text-white"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-neutral-400 mb-1">确认新密码</label>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={e=>setPasswordForm({...passwordForm, confirmPassword: e.target.value})}
                placeholder="再次输入新密码"
                className="w-full bg-black border border-neutral-700 p-2 rounded text-white"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isChangingPassword}
              className="w-full bg-white text-black p-2 rounded font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-200 transition-colors"
            >
              {isChangingPassword ? "修改中..." : "确认修改"}
            </button>
          </form>
        </Modal>

        {/* 寮圭獥锛氬鍑?*/}
        <Modal isOpen={isExportModalOpen} onClose={()=>setIsExportModalOpen(false)} title="导出数据">
            <div className="space-y-4">
                <div className="text-sm text-neutral-400 bg-neutral-800 p-3 rounded">
                    <p>导出包含：PDF 文档、<b>原图归档</b>、文本备份。</p>
                </div>
                <div className="flex gap-2">
                    <input type="date" value={exportRange.start} onChange={e=>setExportRange({...exportRange, start:e.target.value})} className="flex-1 bg-black border border-neutral-700 p-2 rounded text-white"/>
                    <span className="self-center">至</span>
                    <input type="date" value={exportRange.end} onChange={e=>setExportRange({...exportRange, end:e.target.value})} className="flex-1 bg-black border border-neutral-700 p-2 rounded text-white"/>
                </div>
                <button onClick={generateExport} disabled={isExporting} className="w-full bg-white text-black p-3 rounded font-bold flex justify-center gap-2 disabled:opacity-50">
                    {isExporting ? "处理中..." : <><Download size={18}/> 下载 ZIP</>}
                </button>
            </div>
        </Modal>

        {/* 绾康鏃?璁″垝鏃ョ鐞?*/}
        <Modal isOpen={isSpecialDaysModalOpen} onClose={()=>setIsSpecialDaysModalOpen(false)} title="纪念日与计划日" maxWidth="max-w-2xl">
            <div className="space-y-6">
                {/* 添加新纪念日 */}
                <div className="bg-neutral-800/50 border border-neutral-700 rounded-lg p-4">
                    <h4 className="font-medium mb-3">添加新日期</h4>
                    <div className="space-y-3">
                        <input
                            value={tempSpecialDay.title}
                            onChange={e=>setTempSpecialDay({...tempSpecialDay, title:e.target.value})}
                            placeholder="例：生日、结婚纪念日等"
                            className="w-full bg-black border border-neutral-700 p-2 rounded text-white text-sm"
                        />
                        {/* 日期选择（年、月、日\ef */}
                        <div className="grid grid-cols-3 gap-2">
                            <div>
                                <label className="block text-xs text-neutral-400 mb-1">年</label>
                                <select
                                    value={tempSpecialDay.year}
                                    onChange={e=>setTempSpecialDay({...tempSpecialDay, year: parseInt(e.target.value)})}
                                    className="w-full bg-black border border-neutral-700 p-2 rounded text-white text-sm appearance-none cursor-pointer"
                                >
                                    {Array.from({length: 100}, (_, i) => new Date().getFullYear() - 50 + i).map(y => (
                                        <option key={y} value={y}>{y}年</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs text-neutral-400 mb-1">月</label>
                                <select
                                    value={tempSpecialDay.month}
                                    onChange={e=>setTempSpecialDay({...tempSpecialDay, month: parseInt(e.target.value)})}
                                    className="w-full bg-black border border-neutral-700 p-2 rounded text-white text-sm appearance-none cursor-pointer"
                                >
                                    {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                                        <option key={m} value={m}>{m}月</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs text-neutral-400 mb-1">日</label>
                                <select
                                    value={tempSpecialDay.day}
                                    onChange={e=>setTempSpecialDay({...tempSpecialDay, day: parseInt(e.target.value)})}
                                    className="w-full bg-black border border-neutral-700 p-2 rounded text-white text-sm appearance-none cursor-pointer"
                                >
                                    {Array.from({length: new Date(tempSpecialDay.year, tempSpecialDay.month, 0).getDate()}, (_, i) => i + 1).map(d => (
                                        <option key={d} value={d}>{d}日</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={()=>setTempSpecialDay({...tempSpecialDay, type:'anniversary'})}
                                className={`flex-1 p-2 rounded border text-sm ${tempSpecialDay.type==='anniversary'?'bg-blue-500 border-blue-600':'border-neutral-700'}`}
                            >
                                纪念日
                            </button>
                            <button
                                onClick={()=>setTempSpecialDay({...tempSpecialDay, type:'plan'})}
                                className={`flex-1 p-2 rounded border text-sm ${tempSpecialDay.type==='plan'?'bg-purple-500 border-purple-600':'border-neutral-700'}`}
                            >
                                计划日
                            </button>
                        </div>
                        <button
                            onClick={async () => {
                                if (!tempSpecialDay.title) {
                                    alert("请填写事件名称");
                                    return;
                                }
                                try {
                                    // 鏋勫缓鏃ユ湡瀛楃涓?YYYY-MM-DD
                                    const dateStr = `${tempSpecialDay.year}-${String(tempSpecialDay.month).padStart(2,'0')}-${String(tempSpecialDay.day).padStart(2,'0')}`;
                                    const newSpecialDay = await createSpecialDay({
                                        title: tempSpecialDay.title,
                                        date: dateStr,
                                        type: tempSpecialDay.type,
                                        repeat_yearly: true,
                                        notify_days_before: 0
                                    });
                                    setSpecialDays([...specialDays, newSpecialDay]);
                                    setTempSpecialDay({
                                        title: '',
                                        year: new Date().getFullYear(),
                                        month: new Date().getMonth() + 1,
                                        day: new Date().getDate(),
                                        type: 'anniversary'
                                    });
                                } catch (err) {
                                    alert("添加失败: " + (err.response?.data?.detail || "未知错误"));
                                }
                            }}
                            className="w-full bg-white text-black p-2 rounded font-bold text-sm hover:bg-neutral-200"
                        >
                            添加
                        </button>
                    </div>
                </div>

                {/* 纪念日列表 */}
                <div>
                    <h4 className="font-medium mb-3">已添加的日期</h4>
                    {specialDays.length === 0 ? (
                        <div className="text-center py-8 text-neutral-500">暂无纪念日或计划日</div>
                    ) : (
                        <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                            {specialDays.map(day => (
                                <div key={day.id} className="flex items-center justify-between p-3 bg-neutral-800/30 rounded border border-neutral-700">
                                    <div>
                                        <div className="font-medium">{day.title}</div>
                                        <div className="text-sm text-neutral-400">
                                            {new Date(day.date).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
                                            {/* 显示周年信息 */}
                                            {day.type === 'anniversary' && (() => {
                                                const originalDate = new Date(day.date);
                                                const today = new Date();
                                                let years = today.getFullYear() - originalDate.getFullYear();
                                                // 濡傛灉浠婂勾鐨勭邯蹇垫棩杩樻病鍒帮紝骞存暟鍑?
                                                const thisYearAnniversary = new Date(today.getFullYear(), originalDate.getMonth(), originalDate.getDate());
                                                if (today < thisYearAnniversary) {
                                                    years -= 1;
                                                }
                                                if (years > 0) {
                                                    return <span className="ml-2 text-yellow-400 font-medium">（第 {years} 周年）</span>;
                                                }
                                                return null;
                                            })()}
                                            <span className={`ml-2 px-2 py-0.5 rounded text-xs ${day.type==='anniversary'?'bg-blue-500/20 text-blue-300':'bg-purple-500/20 text-purple-300'}`}>
                                                {day.type==='anniversary'?'纪念日':'计划'}
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={async () => {
                                            try {
                                                await deleteSpecialDay(day.id);
                                                setSpecialDays(specialDays.filter(d=>d.id!==day.id));
                                            } catch (err) {
                                                alert("删除失败: " + (err.response?.data?.detail || "未知错误"));
                                            }
                                        }}
                                        className="text-neutral-500 hover:text-red-500 p-1"
                                    >
                                        <Trash2 size={14}/>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </Modal>

        {/* 日历视图 */}
        <Modal isOpen={isCalendarModalOpen} onClose={()=>setIsCalendarModalOpen(false)} title="日历" maxWidth="max-w-4xl">
            <div className="space-y-6">
                {/* 年月切换 */}
                <div className="flex justify-between items-center bg-neutral-800/50 p-3 rounded-lg">
                    <button
                        onClick={() => setCalendarView(prev => ({
                            ...prev,
                            year: prev.month === 0 ? prev.year - 1 : prev.year,
                            month: prev.month === 0 ? 11 : prev.month - 1
                        }))}
                        className="p-2 hover:bg-neutral-700 rounded"
                    >
                        <ChevronLeft size={20}/>
                    </button>
                    <div className="text-xl font-bold">
                        {calendarView.year}年 {calendarView.month + 1}月
                    </div>
                    <button
                        onClick={() => setCalendarView(prev => ({
                            ...prev,
                            year: prev.month === 11 ? prev.year + 1 : prev.year,
                            month: prev.month === 11 ? 0 : prev.month + 1
                        }))}
                        className="p-2 hover:bg-neutral-700 rounded"
                    >
                        <ChevronRight size={20}/>
                    </button>
                </div>

                {/* 月历网格 */}
                <div className="bg-neutral-800/30 border border-neutral-700 rounded-lg p-4">
                    {/* 星期标题 */}
                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {['一', '二', '三', '四', '五', '六', '日'].map(day => (
                            <div key={day} className="text-center text-sm text-neutral-400 font-medium py-2">
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* 日期网格 */}
                    <div className="grid grid-cols-7 gap-1">
                        {(() => {
                            // 生成当月日历数据
                            const year = calendarView.year;
                            const month = calendarView.month;
                            const firstDay = new Date(year, month, 1);
                            const lastDay = new Date(year, month + 1, 0);
                            const daysInMonth = lastDay.getDate();
                            const startingDay = (firstDay.getDay() + 6) % 7; // 鍛ㄤ竴涓?锛屽懆鏃ヤ负6

                            // 获取当月的纪念日/计划日（只有纪念日支持周年重复）
                            const monthSpecialDays = specialDays.filter(day => {
                                const eventDate = typeof day.date === 'string' ? day.date.split('T')[0] :
                                    `${day.date.getFullYear()}-${String(day.date.getMonth() + 1).padStart(2, '0')}-${String(day.date.getDate()).padStart(2, '0')}`;
                                const [eventYear, eventMonth] = eventDate.split('-').map(Number);

                                // 鍙湁绾康鏃ョ被鍨嬫墠鍛ㄥ勾閲嶅锛岃鍒掓棩涓嶉噸澶?
                                if (day.type === 'anniversary') {
                                    return eventMonth === month + 1;
                                }
                                // 璁″垝鏃ユ瘮杈冨畬鏁村勾鏈?
                                return eventYear === year && eventMonth === month + 1;
                            });

                            const days = [];

                            // 上个月的空格
                            for (let i = 0; i < startingDay; i++) {
                                days.push({ day: '', isCurrentMonth: false });
                            }

                            // 当月日期
                            for (let d = 1; d <= daysInMonth; d++) {
                                const date = new Date(year, month, d);
                                // 使用本地时间格式化，避免时区偏移问题
                                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

                                // 妫€鏌ヨ繖涓€澶╂槸鍚︽湁绾康鏃?璁″垝鏃ワ紙鍙湁绾康鏃ユ敮鎸佸懆骞撮噸澶嶏級
                                const dayEvents = monthSpecialDays.filter(event => {
                                    const eventDate = typeof event.date === 'string' ? event.date.split('T')[0] :
                                        `${event.date.getFullYear()}-${String(event.date.getMonth() + 1).padStart(2, '0')}-${String(event.date.getDate()).padStart(2, '0')}`;
                                    const [eventYear, eventMonth, eventDay] = eventDate.split('-').map(Number);

                                    // 只有纪念日类型才周年重复
                                    if (event.type === 'anniversary') {
                                        return eventMonth === month + 1 && eventDay === d;
                                    }
                                    // 璁″垝鏃ユ瘮杈冨畬鏁存棩鏈?
                                    return eventDate === dateStr;
                                });

                                const isToday = date.toDateString() === new Date().toDateString();

                                days.push({
                                    day: d,
                                    isCurrentMonth: true,
                                    date: dateStr,
                                    events: dayEvents,
                                    isToday
                                });
                            }

                            return days.map((dayInfo, index) => (
                                <div
                                    key={index}
                                    className={`min-h-20 p-1 border border-neutral-700/50 rounded-sm ${dayInfo.isCurrentMonth ? 'bg-neutral-800/30' : 'bg-neutral-900/20 opacity-40'} ${dayInfo.isToday ? 'border-yellow-500' : ''}`}
                                >
                                    {dayInfo.day && (
                                        <>
                                            <div className="text-right text-sm mb-1">
                                                <span className={`inline-block w-6 h-6 text-center leading-6 rounded-full ${dayInfo.isToday ? 'bg-yellow-500 text-black font-bold' : ''}`}>
                                                    {dayInfo.day}
                                                </span>
                                            </div>
                                            <div className="space-y-1 max-h-24 overflow-y-auto">
                                                {dayInfo.events && dayInfo.events.map(event => (
                                                    <div
                                                        key={event.id}
                                                        className={`text-xs p-1 rounded truncate ${event.type === 'anniversary' ? 'bg-blue-500/30 text-blue-300' : 'bg-purple-500/30 text-purple-300'}`}
                                                        title={`${event.title} (${event.type === 'anniversary' ? '纪念日' : '计划'})`}
                                                    >
                                                        {event.title}
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            ));
                        })()}
                    </div>
                </div>

                {/* 图例 */}
                <div className="flex gap-4 text-sm text-neutral-400">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm bg-blue-500/30"></div>
                        <span>纪念日</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm bg-purple-500/30"></div>
                        <span>计划日</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-yellow-500"></div>
                        <span>今天</span>
                    </div>
                </div>
            </div>
        </Modal>

        {/* Image Preview Modal */}
        {isImagePreviewOpen && (
            <div className={`fixed inset-0 z-[60] bg-black/90 flex items-center justify-center ${isPreviewFullScreen ? '' : 'p-4'}`} onClick={()=>setIsImagePreviewOpen(false)}>
                <div className="absolute top-4 right-4 flex gap-2">
                    <button onClick={(e) => { e.stopPropagation(); setIsPreviewFullScreen(!isPreviewFullScreen); }} className="text-white p-2 bg-neutral-800 rounded-full hover:bg-neutral-700" title={isPreviewFullScreen ? "退出全屏" : "全屏"}>
                        {isPreviewFullScreen ? <Maximize2 size={20} /> : <Maximize2 size={20}/>}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setIsImagePreviewOpen(false); }} className="text-white p-2 bg-neutral-800 rounded-full hover:bg-neutral-700"><X size={20}/></button>
                </div>
                <img src={previewImageSrc} className={`${isPreviewFullScreen ? 'w-full h-full object-contain' : 'max-w-full max-h-full rounded shadow-2xl'}`} onClick={e=>e.stopPropagation()} />
            </div>
        )}
      </main>
    </div>
  );
}
