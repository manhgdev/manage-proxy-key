'use client';

import { useState } from 'react';
import { ProxyKey } from '@/types/proxy';

interface ProxyTableProps {
  proxyKeys: ProxyKey[];
  selectedKeys: Set<string>;
  onSelectKey: (id: string) => void;
  onSelectAll: () => void;
  onToggle: (id: string) => void;
  onEdit: (proxyKey: ProxyKey) => void;
  onDelete: (id: string) => void;
}

type SortField = 'key' | 'expirationDate' | 'rotationInterval' | 'isActive' | 'lastRotatedAt';
type SortOrder = 'asc' | 'desc';

export default function ProxyTable({
  proxyKeys,
  selectedKeys,
  onSelectKey,
  onSelectAll,
  onToggle,
  onEdit,
  onDelete
}: ProxyTableProps) {
  const [sortField, setSortField] = useState<SortField>('lastRotatedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Nếu đang sắp xếp theo trường này, đảo ngược thứ tự
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Nếu chưa sắp xếp theo trường này, sắp xếp tăng dần
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const getSortedKeys = () => {
    return [...proxyKeys].sort((a, b) => {
      let aValue: any = a[sortField];
      let bValue: any = b[sortField];

      // Xử lý đặc biệt cho trường proxyData
      if (sortField === 'expirationDate' && a.proxyData && b.proxyData) {
        aValue = a.proxyData["Token expiration date"] || '';
        bValue = b.proxyData["Token expiration date"] || '';
      }

      // So sánh giá trị
      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return (
        <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    
    return sortOrder === 'asc' ? (
      <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  const sortedKeys = getSortedKeys();

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-center text-sm font-medium text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={selectedKeys.size === proxyKeys.length}
                  onChange={onSelectAll}
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th className="px-4 py-3 text-center text-sm font-medium text-gray-700 dark:text-gray-300">#</th>
              <th 
                className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                onClick={() => handleSort('key')}
              >
                <div className="flex items-center">
                  Key
                  <span className="ml-1">{renderSortIcon('key')}</span>
                </div>
              </th>
              <th 
                className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                onClick={() => handleSort('expirationDate')}
              >
                <div className="flex items-center">
                  Expiration
                  <span className="ml-1">{renderSortIcon('expirationDate')}</span>
                </div>
              </th>
              <th 
                className="px-4 py-3 text-center text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                onClick={() => handleSort('rotationInterval')}
              >
                <div className="flex items-center justify-center">
                  Rotation Interval (s)
                  <span className="ml-1">{renderSortIcon('rotationInterval')}</span>
                </div>
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Actions</th>
              <th 
                className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                onClick={() => handleSort('lastRotatedAt')}
              >
                <div className="flex items-center">
                  Proxy Data
                  <span className="ml-1">{renderSortIcon('lastRotatedAt')}</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {sortedKeys.map((proxyKey, index) => (
              <tr key={proxyKey.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={selectedKeys.has(proxyKey.id)}
                    onChange={() => onSelectKey(proxyKey.id)}
                    className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                </td>
                <td className="px-4 py-3 text-center text-gray-900 dark:text-gray-300">{index + 1}</td>
                <td className="px-4 py-3 text-gray-900 dark:text-gray-300">{proxyKey.key}</td>
                <td className="px-4 py-3 text-gray-900 dark:text-gray-300">
                  {proxyKey.proxyData && proxyKey.proxyData["Token expiration date"] 
                    ? proxyKey.proxyData["Token expiration date"]
                    : 'N/A'}
                </td>
                <td className="px-4 py-3 text-center text-gray-900 dark:text-gray-300">{proxyKey.rotationInterval}</td>
                <td className="px-4 py-3">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => onToggle(proxyKey.id)}
                      className={`px-3 py-1 rounded ${
                        proxyKey.isActive ? 'bg-green-500 text-white' : 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {proxyKey.isActive ? 'Active' : 'Inactive'}
                    </button>
                    <button
                      onClick={() => onEdit(proxyKey)}
                      className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDelete(proxyKey.id)}
                      className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-sm max-h-10 overflow-y-auto">
                    {proxyKey.proxyData ? (
                      <div>
                        <div className="text-gray-500 dark:text-gray-400 text-xs mb-2">
                          Last updated: {formatDateTime(proxyKey.lastRotatedAt)}
                        </div>
                        <div className="font-medium text-gray-900 dark:text-gray-300">Status: {proxyKey.proxyData.status}</div>
                        <div className="text-gray-600 dark:text-gray-400">Message: {proxyKey.proxyData.message}</div>
                        <div className="text-gray-600 dark:text-gray-400">HTTP: {proxyKey.proxyData.proxyhttp}</div>
                        <div className="text-gray-600 dark:text-gray-400">SOCKS5: {proxyKey.proxyData.proxysocks5}</div>
                        <div className="text-gray-600 dark:text-gray-400">Network: {proxyKey.proxyData["Nha Mang"]}</div>
                        <div className="text-gray-600 dark:text-gray-400">Location: {proxyKey.proxyData["Vi Tri"]}</div>
                        <div className="text-gray-600 dark:text-gray-400">Expiration: {proxyKey.proxyData["Token expiration date"]}</div>
                      </div>
                    ) : (
                      <div className="text-gray-500 dark:text-gray-400 text-sm">No data available</div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
} 