'use client';

import { useState, useEffect } from 'react';

export default function DarkMode() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Kiểm tra theme đã lưu trong localStorage
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // Nếu chưa có theme được lưu, sử dụng theme mặc định của hệ thống
    if (!savedTheme) {
      setIsDark(prefersDark);
      if (prefersDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } else {
      // Nếu có theme được lưu, sử dụng theme đó
      const isDarkMode = savedTheme === 'dark';
      setIsDark(isDarkMode);
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, []);

  const toggleDarkMode = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    
    // Lưu theme vào localStorage
    localStorage.setItem('theme', newIsDark ? 'dark' : 'light');
    
    // Thêm/xóa class dark trên html element
    if (newIsDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  return (
    <button
      onClick={toggleDarkMode}
      className="fixed bottom-4 right-4 p-3 rounded-full bg-gray-200 dark:bg-gray-700 
                 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200
                 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                 shadow-lg z-50"
      aria-label="Toggle dark mode"
    >
      {isDark ? (
        <svg 
          className="w-6 h-6 text-yellow-500" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" 
          />
        </svg>
      ) : (
        <svg 
          className="w-6 h-6 text-gray-700" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" 
          />
        </svg>
      )}
    </button>
  );
} 