import axios from 'axios';

// 创建一个 axios 实例
const api = axios.create({
  baseURL: '/api', // 这里会通过 vite.config.js 代理到后端
});

// 请求拦截器：每次请求自动带上 Token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器：如果 Token 过期(401)，自动跳回登录页
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

export const loginUser = async (username, password) => {
  const formData = new FormData();
  formData.append('username', username);
  formData.append('password', password);
  const res = await api.post('/token', formData);
  return res.data;
};

export const fetchEvents = async () => {
  const res = await api.get('/events');
  return res.data;
};

export const saveEventToBackend = async (entryDate, data) => {
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

  // 发送要保留的现有图片URL（过滤掉null/无效值）
  if (data.imagesOriginal && Array.isArray(data.imagesOriginal)) {
    const validOriginalUrls = data.imagesOriginal.filter(url => url && typeof url === 'string' && url.trim() !== '');
    formData.append('keep_images', JSON.stringify(validOriginalUrls));
  } else {
    // 如果没有现有图片，发送空数组以清空已删除的图片
    formData.append('keep_images', JSON.stringify([]));
  }

  const res = await api.post('/events', formData);
  return res.data;
};

// 注册仅管理员可用
export const registerUser = async (username, password) => {
    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);
    const res = await api.post('/register', formData);
    return res.data;
}

// 新增：更新用户配置 (生日等)
export const updateUserConfig = async (dob, lifeExpectancy = 100) => {
    // FastAPI 接收 JSON Body，所以不需要 FormData，直接传对象即可
    const res = await api.put('/users/me', {
        dob: dob,
        life_expectancy: lifeExpectancy
    });
    return res.data;
}

// 目标管理API
export const fetchGoals = async () => {
  const res = await api.get('/goals');
  return res.data;
};

export const createGoal = async (goalData) => {
  const res = await api.post('/goals', goalData);
  return res.data;
};

export const updateGoal = async (goalId, goalData) => {
  const res = await api.put(`/goals/${goalId}`, goalData);
  return res.data;
};

export const deleteGoal = async (goalId) => {
  const res = await api.delete(`/goals/${goalId}`);
  return res.data;
};

// 修改密码
export const updateUserPassword = async (oldPassword, newPassword, confirmPassword) => {
  const res = await api.put('/users/me/password', {
    old_password: oldPassword,
    new_password: newPassword,
    confirm_password: confirmPassword
  });
  return res.data;
};

export default api;
