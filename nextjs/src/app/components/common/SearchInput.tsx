'use client';

import { useState, useCallback } from 'react';

interface SearchInputProps {
  onSearch: (query: string) => void;
  placeholder?: string;
}

export default function SearchInput({ onSearch, placeholder = 'Search...' }: SearchInputProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = useCallback(() => {
    onSearch(searchQuery);
  }, [searchQuery, onSearch]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full px-4 py-2 pl-10 pr-12 rounded-lg border border-gray-300 dark:border-gray-600 
                 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
      />
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <svg className="h-5 w-5 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <button
        onClick={handleSearch}
        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
        </svg>
      </button>
    </div>
  );
} 