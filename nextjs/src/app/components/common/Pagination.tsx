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

  return (
    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Show</span>
        <select
          value={validPageSize}
          onChange={(e) => {
            const newSize = Math.max(1, Number(e.target.value));
            onPageSizeChange(newSize);
            onPageChange(1);
          }}
          className="rounded border-gray-300 text-sm"
        >
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
        <span className="text-sm text-gray-600">entries</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(validPage - 1)}
          disabled={validPage === 1}
          className="px-3 py-1 rounded border border-gray-300 disabled:opacity-50"
        >
          Previous
        </button>
        <span className="text-sm text-gray-600">
          Page {validPage} of {totalPages}
        </span>
        <button
          onClick={() => onPageChange(validPage + 1)}
          disabled={validPage === totalPages}
          className="px-3 py-1 rounded border border-gray-300 disabled:opacity-50"
        >
          Next
        </button>
      </div>

      <div className="text-sm text-gray-600">
        Showing {startItem} to {endItem} of {validTotalItems} entries
      </div>
    </div>
  );
} 