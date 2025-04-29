'use client';

import { useState } from 'react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  startItem: number;
  endItem: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export default function Pagination({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  startItem,
  endItem,
  onPageChange,
  onPageSizeChange
}: PaginationProps) {
  const pageSizeOptions = [10, 25, 50, 100];

  return (
    <div className="flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0">
      <div className="text-sm text-gray-700 dark:text-gray-300">
        Showing {startItem} to {endItem} of {totalItems} entries
      </div>
      <div className="flex items-center space-x-2">
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 
                   bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                   focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size} per page
            </option>
          ))}
        </select>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 
                     bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                     hover:bg-gray-50 dark:hover:bg-gray-600
                     disabled:opacity-50 disabled:cursor-not-allowed
                     focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
          >
            Previous
          </button>
          <span className="px-3 py-1 text-gray-700 dark:text-gray-300">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 
                     bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                     hover:bg-gray-50 dark:hover:bg-gray-600
                     disabled:opacity-50 disabled:cursor-not-allowed
                     focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
} 