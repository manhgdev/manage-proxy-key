'use client';

import { useState } from 'react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSize: number;
  totalItems: number;
  startItem: number;
  endItem: number;
}

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  onPageSizeChange,
  pageSize,
  totalItems,
  startItem,
  endItem
}: PaginationProps) {
  const validPage = Math.max(1, currentPage);
  const validPageSize = Math.max(1, pageSize);
  const validTotalItems = Math.max(0, totalItems);

  const renderPageNumbers = () => {
    const pages = [];
    const rangeSize = 1; // Số lượng trang hiển thị mỗi bên của trang hiện tại
    
    // Luôn hiển thị trang đầu
    pages.push(
      <button
        key={1}
        onClick={() => onPageChange(1)}
        className={`px-3 py-1 rounded ${
          validPage === 1
            ? 'bg-blue-500 text-white'
            : 'border border-gray-300 hover:bg-gray-100'
        }`}
      >
        1
      </button>
    );

    // Thêm dấu ... sau trang đầu nếu cần
    if (validPage - rangeSize > 2) {
      pages.push(
        <span key="ellipsis1" className="px-2">
          ...
        </span>
      );
    }

    // Thêm các trang ở giữa
    for (let i = Math.max(2, validPage - rangeSize); i <= Math.min(totalPages - 1, validPage + rangeSize); i++) {
      pages.push(
        <button
          key={i}
          onClick={() => onPageChange(i)}
          className={`px-3 py-1 rounded ${
            validPage === i
              ? 'bg-blue-500 text-white'
              : 'border border-gray-300 hover:bg-gray-100'
          }`}
        >
          {i}
        </button>
      );
    }

    // Thêm dấu ... trước trang cuối nếu cần
    if (validPage + rangeSize < totalPages - 1) {
      pages.push(
        <span key="ellipsis2" className="px-2">
          ...
        </span>
      );
    }

    // Luôn hiển thị trang cuối nếu có nhiều hơn 1 trang
    if (totalPages > 1) {
      pages.push(
        <button
          key={totalPages}
          onClick={() => onPageChange(totalPages)}
          className={`px-3 py-1 rounded ${
            validPage === totalPages
              ? 'bg-blue-500 text-white'
              : 'border border-gray-300 hover:bg-gray-100'
          }`}
        >
          {totalPages}
        </button>
      );
    }

    return pages;
  };

  return (
    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
      <div className="text-sm text-gray-600">
        Showing {startItem} to {endItem} of {totalItems} items
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(validPage - 1)}
          disabled={validPage === 1}
          className="px-3 py-1 rounded border border-gray-300 disabled:opacity-50 hover:bg-gray-100"
        >
          Previous
        </button>
        <div className="flex items-center gap-1">
          {renderPageNumbers()}
        </div>
        <button
          onClick={() => onPageChange(validPage + 1)}
          disabled={validPage === totalPages}
          className="px-3 py-1 rounded border border-gray-300 disabled:opacity-50 hover:bg-gray-100"
        >
          Next
        </button>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="px-2 py-1 rounded border border-gray-300"
        >
          <option value="10">10 / page</option>
          <option value="25">25 / page</option>
          <option value="50">50 / page</option>
          <option value="100">100 / page</option>
        </select>
      </div>
    </div>
  );
} 