import React, { useState } from 'react';
import { loginUser } from './api';

export default function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const data = await loginUser(username, password);
      // 保存 Token 和用户配置
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('user_config', JSON.stringify(data.user_config));
      onLoginSuccess(data.user_config);
    } catch (err) {
      setError('登录失败：用户名或密码错误');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6 text-white font-sans">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 w-full max-w-sm shadow-2xl">
        <h1 className="text-3xl font-bold mb-2 text-center">Memento</h1>
        <p className="text-neutral-500 text-center mb-8 text-sm">记录你的人生周记</p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-neutral-400 mb-1">用户名</label>
            <input 
              type="text" 
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-black border border-neutral-700 rounded p-3 text-sm focus:border-white focus:outline-none transition-colors"
            />
          </div>
          
          <div>
            <label className="block text-xs text-neutral-400 mb-1">密码</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black border border-neutral-700 rounded p-3 text-sm focus:border-white focus:outline-none transition-colors"
            />
          </div>

          {error && <div className="text-red-500 text-xs text-center">{error}</div>}

          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full bg-white text-black font-bold py-3 rounded hover:bg-neutral-200 transition-colors disabled:opacity-50"
          >
            {isLoading ? '登录中...' : '进入我的宇宙'}
          </button>
        </form>
      </div>
    </div>
  );
}