import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './Login';
import Dashboard from './Dashboard';

function App() {
  const [userConfig, setUserConfig] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    // 检查是否有 Token
    const token = localStorage.getItem('token');
    const savedConfig = localStorage.getItem('user_config');
    
    if (token && savedConfig) {
      setUserConfig(JSON.parse(savedConfig));
    }
    setIsCheckingAuth(false);
  }, []);

  const handleLoginSuccess = (config) => {
    setUserConfig(config);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user_config');
    setUserConfig(null);
  };

  if (isCheckingAuth) return <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading...</div>;

  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/login" 
          element={!userConfig ? <Login onLoginSuccess={handleLoginSuccess} /> : <Navigate to="/" />} 
        />
        <Route 
          path="/" 
          element={userConfig ? <Dashboard userConfig={userConfig} onLogout={handleLogout} /> : <Navigate to="/login" />} 
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;