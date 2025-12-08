'use client';

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { ProxyKey } from '@/types/proxy';
import Toast from '@components/common/Toast';
import Pagination from '../common/Pagination';
import SearchInput from '../common/SearchInput';
import ProxyTable from './ProxyTable';
import DarkMode from '@components/common/DarkMode';

interface ToastMessage {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

interface PaginationData {
  totalItems: number;
  currentPage: number;
  pageSize: number;
  totalPages: number;
  startItem: number;
  endItem: number;
}

// Tạo component SearchInput riêng
const SearchInputComponent = memo(({ 
  value, 
  onChange 
}: { 
  value: string; 
  onChange: (value: string) => void;
}) => {
  return (
    <input
      type="text"
      placeholder="Search keys..."
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-4 py-2 rounded border-gray-300 focus:border-blue-500 focus:ring-blue-500"
    />
  );
});

SearchInputComponent.displayName = 'SearchInput';

export default function ProxyKeyManager() {
  const [proxyKeys, setProxyKeys] = useState<ProxyKey[]>([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const DEFAULT_PROXY_API_URL = 'https://api.proxyxoay.org//api/key_xoay.php?key=';
  const [newKey, setNewKey] = useState({
    key: '',
    url: DEFAULT_PROXY_API_URL,
    rotationInterval: 60,
    expirationDate: '',
  });
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAutoRunning, setIsAutoRunning] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [uploadedKeys, setUploadedKeys] = useState<string[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [paginationData, setPaginationData] = useState<PaginationData>({
    totalItems: 0,
    currentPage: 1,
    pageSize: 25,
    totalPages: 1,
    startItem: 1,
    endItem: 25
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
  const [bulkRotationInterval, setBulkRotationInterval] = useState(60);
  const [bulkExpirationDate, setBulkExpirationDate] = useState('');
  const [bulkUrl, setBulkUrl] = useState('');

  useEffect(() => {
    const initializeAutoRun = async () => {
      try {
        const response = await fetch('/api/keys/auto-run-status');
        const data = await response.json();
        if (response.ok) {
          setIsAutoRunning(data.isAutoRunning);
        }
      } catch (error) {
        console.error('Failed to get auto run status:', error);
      }
    };

    fetchKeys();
    initializeAutoRun();
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchKeys = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/keys?page=${currentPage}&pageSize=${pageSize}&search=${searchQuery}`);
      const data = await response.json();
      if (response.ok) {
        setProxyKeys(data.keys);
        setPaginationData(data.pagination);
      } else {
        showToast(data.error || 'Failed to fetch keys', 'error');
      }
    } catch (error) {
      console.error('Failed to fetch keys:', error);
      showToast('Failed to fetch keys', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, [currentPage, pageSize, searchQuery]);

  const handleAddKey = async () => {
    const keysToAdd = newKey.key.split('\n')
      .map(key => key.trim())
      .filter(key => key.length > 0);

    if (keysToAdd.length === 0 && uploadedKeys.length === 0) {
      showToast('Please enter keys or upload file', 'error');
      return;
    }

    let successCount = 0;
    let errorCount = 0;
    let duplicateCount = 0;
    let errorMessage = '';

    for (const key of keysToAdd) {
      try {
        const response = await fetch('/api/keys', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            key: key,
            url: newKey.url,
            rotationInterval: newKey.rotationInterval,
            expirationDate: newKey.expirationDate,
            isActive: true
          }),
        });

        const data = await response.json();
        if (response.ok) {
          successCount++;
        } else {
          if (response.status === 409) {
            duplicateCount++;
          } else {
            errorCount++;
            errorMessage = data.error || 'Failed to add key';
          }
        }
      } catch (error) {
        errorCount++;
        errorMessage = 'Failed to add key';
      }
    }

    if (uploadedKeys.length > 0) {
      for (const key of uploadedKeys) {
        try {
          const response = await fetch('/api/keys', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              key: key,
              url: newKey.url,
              rotationInterval: newKey.rotationInterval,
              expirationDate: newKey.expirationDate,
              isActive: true
            }),
          });

          const data = await response.json();
          if (response.ok) {
            successCount++;
          } else {
            if (response.status === 409) {
              duplicateCount++;
            } else {
              errorCount++;
              errorMessage = data.error || 'Failed to add key';
            }
          }
        } catch (error) {
          errorCount++;
          errorMessage = 'Failed to add key';
        }
      }
    }

    await fetchKeys();
  setNewKey({ key: '', url: DEFAULT_PROXY_API_URL, rotationInterval: 60, expirationDate: '' });
    setUploadedKeys([]);
    setIsEditModalOpen(false);

    if (successCount > 0 || duplicateCount > 0 || errorCount > 0) {
      const parts: string[] = [];
      if (successCount > 0) parts.push(`added ${successCount}`);
      if (duplicateCount > 0) parts.push(`${duplicateCount} duplicates`);
      if (errorCount > 0) parts.push(`${errorCount} failed`);
      showToast(parts.join(', '), successCount > 0 && errorCount === 0 ? 'success' : 'warning');
    } else {
      showToast(errorMessage || 'Failed to add any keys', 'error');
    }
  };

  const handleToggle = async (id: string) => {
    try {
      const key = proxyKeys.find(k => k.id === id);
      if (!key) {
        showToast('Key not found', 'error');
        return;
      }

      const updatedKey: ProxyKey = {
        ...key,
        isActive: !key.isActive
      };

      const response = await fetch('/api/keys', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedKey),
      });

      if (response.ok) {
        setProxyKeys(prevKeys => 
          prevKeys.map(k => k.id === id ? updatedKey : k)
        );
        showToast('Key status updated', 'success');
      } else {
        const error = await response.json();
        showToast(error.error || 'Failed to toggle key', 'error');
      }
    } catch (error) {
      console.error('Failed to toggle key:', error);
      showToast('Failed to toggle key', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this key?')) return;

    try {
      const response = await fetch(`/api/keys?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchKeys();
        showToast('Key deleted successfully', 'success');
      } else {
        const error = await response.json();
        showToast(error.error || 'Failed to delete key', 'error');
      }
    } catch (error) {
      console.error('Failed to delete key:', error);
      showToast('Failed to delete key', 'error');
    }
  };

  const handleEdit = (proxyKey: ProxyKey) => {
    // Convert datetime to local datetime format for input
    let formattedDate = '';
    if (proxyKey.expirationDate) {
      try {
        const date = new Date(proxyKey.expirationDate);
        // Format to YYYY-MM-DDTHH:mm for datetime-local input
        formattedDate = date.toISOString().slice(0, 16);
      } catch (error) {
        formattedDate = '';
      }
    }

    setNewKey({
      key: proxyKey.key,
  url: proxyKey.url || DEFAULT_PROXY_API_URL,
      rotationInterval: proxyKey.rotationInterval,
      expirationDate: formattedDate,
    });
    setEditingId(proxyKey.id);
    setIsEditModalOpen(true);
  };

  const handleSave = async () => {
    if (!newKey.key) {
      showToast('Please fill in key field', 'error');
      return;
    }

    const updatedKey: ProxyKey = {
      id: editingId || Date.now().toString(),
      key: newKey.key,
  url: newKey.url,
      expirationDate: newKey.expirationDate,
      isActive: true,
      createdAt: new Date().toISOString(),
      lastRotatedAt: new Date().toISOString(),
      rotationInterval: newKey.rotationInterval,
    };

    try {
      const response = await fetch('/api/keys', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedKey),
      });

      const data = await response.json();
      if (response.ok) {
        await fetchKeys();
  setNewKey({ key: '', url: DEFAULT_PROXY_API_URL, rotationInterval: 60, expirationDate: '' });
        setEditingId(null);
        setIsEditModalOpen(false);
        showToast('Key updated successfully', 'success');
      } else {
        showToast(data.error || 'Failed to update key', 'error');
      }
    } catch (error) {
      console.error('Failed to save key:', error);
      showToast('Failed to update key', 'error');
    }
  };

  const handleCancel = () => {
  setNewKey({ key: '', url: DEFAULT_PROXY_API_URL, rotationInterval: 60, expirationDate: '' });
    setEditingId(null);
    setIsEditModalOpen(false);
    setUploadedKeys([]);
  };

  const handleToggleAutoRun = async () => {
    try {
      const response = await fetch('/api/keys/toggle-auto-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();
      if (!response.ok) {
        showToast(data.error || 'Failed to toggle auto run', 'error');
        return;
      }

      setIsAutoRunning(data.isAutoRunning);
      showToast(
        data.message + (data.currentProcessId ? ` (Process ID: ${data.currentProcessId})` : ''),
        'success'
      );
      
      await fetchKeys();
    } catch (error) {
      console.error('Failed to toggle auto run:', error);
      showToast(error instanceof Error ? error.message : 'Failed to toggle auto run', 'error');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const keys = text.split('\n')
        .map(key => key.trim())
        .filter(key => key.length > 0);

      if (keys.length === 0) {
        showToast('No valid keys found in file', 'error');
        return;
      }

      let existingKeys = proxyKeys.map(k => k.key);
      try {
        const resp = await fetch(`/api/keys?page=1&pageSize=100000`);
        const data = await resp.json();
        if (resp.ok && Array.isArray(data.keys)) {
          existingKeys = data.keys.map((k: any) => k.key);
        }
      } catch {}

      const duplicateKeys = keys.filter(key => existingKeys.includes(key));
      const newKeys = keys.filter(key => !existingKeys.includes(key));

      if (duplicateKeys.length > 0) {
        showToast(`Found ${duplicateKeys.length} duplicate keys`, 'warning');
      }

      setUploadedKeys(newKeys);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      showToast('Failed to read file', 'error');
    }
  };
  
  const handleSelectKey = (id: string) => {
    setSelectedKeys(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedKeys.size === proxyKeys.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(proxyKeys.map(key => key.id)));
    }
  };

  const handleBulkToggle = async () => {
    const keysToToggle = Array.from(selectedKeys);
    if (keysToToggle.length === 0) {
      showToast('Please select at least one key', 'error');
      return;
    }

    try {
      for (const id of keysToToggle) {
        const key = proxyKeys.find(k => k.id === id);
        if (key) {
          const updatedKey: ProxyKey = {
            ...key,
            isActive: !key.isActive
          };
          const response = await fetch('/api/keys', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(updatedKey),
          });
          if (response.ok) {
            setProxyKeys(prevKeys => 
              prevKeys.map(k => k.id === id ? updatedKey : k)
            );
          }
        }
      }
      showToast(`Updated ${keysToToggle.length} keys`, 'success');
    } catch (error) {
      console.error('Failed to toggle keys:', error);
      showToast('Failed to toggle keys', 'error');
    }
  };

  const handleBulkDelete = async () => {
    const keysToDelete = Array.from(selectedKeys);
    if (keysToDelete.length === 0) {
      showToast('Please select at least one key', 'error');
      return;
    }

    if (!confirm(`Are you sure you want to delete ${keysToDelete.length} keys?`)) return;

    try {
      for (const id of keysToDelete) {
        const response = await fetch(`/api/keys?id=${id}`, {
          method: 'DELETE',
        });
        if (response.ok) {
          setProxyKeys(prevKeys => prevKeys.filter(k => k.id !== id));
        }
      }
      setSelectedKeys(new Set());
      showToast(`Deleted ${keysToDelete.length} keys`, 'success');
    } catch (error) {
      console.error('Failed to delete keys:', error);
      showToast('Failed to delete keys', 'error');
    }
  };

  const handleBulkUpdateRotationInterval = async () => {
    const keysToUpdate = Array.from(selectedKeys);
    if (keysToUpdate.length === 0) {
      showToast('Please select at least one key', 'error');
      return;
    }

    try {
      for (const id of keysToUpdate) {
        const key = proxyKeys.find(k => k.id === id);
        if (key) {
          const updatedKey: ProxyKey = {
            ...key,
            rotationInterval: bulkRotationInterval,
    expirationDate: bulkExpirationDate || key.expirationDate,
    url: bulkUrl || key.url
          };
          const response = await fetch('/api/keys', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(updatedKey),
          });
          if (response.ok) {
            setProxyKeys(prevKeys => 
              prevKeys.map(k => k.id === id ? updatedKey : k)
            );
          }
        }
      }
      showToast(`Updated ${keysToUpdate.length} keys`, 'success');
      setIsBulkEditModalOpen(false);
  setBulkExpirationDate(''); // Reset after successful update
  setBulkUrl('');
    } catch (error) {
      console.error('Failed to update keys:', error);
      showToast('Failed to update keys', 'error');
    }
  };

  const log = (message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handleAddNew = () => {
  setNewKey({ key: '', url: DEFAULT_PROXY_API_URL, rotationInterval: 60, expirationDate: '' });
    setEditingId(null);
    setIsEditModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen p-4 md:p-8 bg-gray-100 dark:bg-gray-900">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-8">Proxy Key Manager</h1>

        <div className="mb-4 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">API Endpoints</h2>
          <div className="flex flex-col space-y-2">
            <div className="flex items-center">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">proxy-list:</span>
              <a 
                href="/api/proxy/list" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-mono"
              >
                /api/proxy/list
              </a>
            </div>
            <div className="flex items-center">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">proxy-random:</span>
              <a 
                href="/api/proxy/random" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-mono"
              >
                /api/proxy/random
              </a>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Click the link to open the API based on server IP or configured domain
            </p>
          </div>
        </div>

        <div className="flex flex-col space-y-4 mb-4">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-2">
            <div className="flex-1">
              <SearchInput 
                onSearch={handleSearch}
                placeholder="Search keys..."
              />
            </div>
            <div className="flex gap-2 md:gap-4 md:ml-4">
              <button
                onClick={handleToggleAutoRun}
                className={`flex-1 md:flex-none px-3 py-2 md:px-4 rounded transition-colors duration-200 ${
                  isAutoRunning ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-500 hover:bg-gray-600'
                } text-white text-sm md:text-base`}
              >
                Auto Run: {isAutoRunning ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={handleAddNew}
                className="flex-1 md:flex-none px-3 py-2 md:px-4 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm md:text-base"
              >
                + Add New Key
              </button>
            </div>
          </div>
        </div>

        {selectedKeys.size > 0 && (
          <div className="mb-4 flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-4">
            <button
              onClick={handleBulkToggle}
              className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 w-full md:w-auto"
            >
              Toggle Selected ({selectedKeys.size})
            </button>
            <button
              onClick={() => setIsBulkEditModalOpen(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 w-full md:w-auto"
            >
              Edit Selected ({selectedKeys.size})
            </button>
            <button
              onClick={handleBulkDelete}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 w-full md:w-auto"
            >
              Delete Selected ({selectedKeys.size})
            </button>
          </div>
        )}

        {isEditModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full">
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 rounded-t-xl flex items-center justify-between">
                <h2 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white">
                  {editingId ? 'Edit Proxy Key' : 'Add Proxy Key'}
                </h2>
                <button
                  onClick={handleCancel}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white"
                >
                  ×
                </button>
              </div>

              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    API URL
                  </label>
                  <input
                    type="text"
                    value={newKey.url}
                    onChange={(e) => setNewKey({ ...newKey, url: e.target.value })}
                    className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono"
                    placeholder="https://example.com/api/get.php?key={KEY}"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Use {`{KEY}`} placeholder or ensure a "key" query param will be appended.
                  </p>
                </div>
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Proxy Key{editingId ? '' : 's'}
                  </label>
                  {editingId ? (
                    <input
                      type="text"
                      value={newKey.key}
                      onChange={(e) => setNewKey({ ...newKey, key: e.target.value })}
                      className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      placeholder="Enter your proxy key"
                    />
                  ) : (
                    <textarea
                      value={newKey.key}
                      onChange={(e) => setNewKey({ ...newKey, key: e.target.value })}
                      className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      placeholder="Enter proxy keys, one per line..."
                      rows={4}
                    />
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Rotation Interval
                    </label>
                    <input
                      type="number"
                      value={newKey.rotationInterval}
                      onChange={(e) => setNewKey({ ...newKey, rotationInterval: parseInt(e.target.value) || 60 })}
                      min="1"
                      className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      placeholder="60"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Expiration Date
                    </label>
                    <input
                      type="datetime-local"
                      value={newKey.expirationDate}
                      onChange={(e) => setNewKey({ ...newKey, expirationDate: e.target.value })}
                      className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>

                {!editingId && (
                  <div className="space-y-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt"
                      onChange={handleFileUpload}
                      className="w-full text-sm text-gray-500 dark:text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-500 file:text-white hover:file:bg-blue-600 cursor-pointer"
                    />
                  </div>
                )}

                {uploadedKeys.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">Keys Ready to Add ({uploadedKeys.length})</div>
                    <div className="max-h-24 overflow-y-auto bg-white dark:bg-gray-800 p-3 rounded-lg border border-green-200 dark:border-green-700">
                      <div className="grid grid-cols-1 gap-2">
                        {uploadedKeys.map((key, index) => (
                          <div key={index} className="text-xs text-gray-700 dark:text-gray-300 bg-green-50 dark:bg-green-900/30 p-2 rounded border border-green-200 dark:border-green-600 font-mono">
                            {key}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 rounded-b-xl flex justify-end gap-2">
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  onClick={editingId ? handleSave : handleAddKey}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  {editingId ? 'Save' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isBulkEditModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full">
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-6 rounded-t-2xl">
                <div className="flex justify-between items-center">
                  <div className="flex items-center space-x-3">
                    <div className="bg-white bg-opacity-20 p-2 rounded-lg">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-white">Bulk Edit Keys</h2>
                      <p className="text-blue-100 text-sm">
                        Update {selectedKeys.size} selected key{selectedKeys.size > 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setIsBulkEditModalOpen(false);
                      setBulkExpirationDate('');
                    }}
                    className="text-white hover:text-red-200 transition-colors duration-200 p-2 hover:bg-white hover:bg-opacity-20 rounded-lg"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                <div className="bg-gray-50 dark:bg-gray-700 p-6 rounded-xl space-y-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                    <svg className="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Update Settings
                  </h3>

                  {/* Rotation Interval */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Rotation Interval
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={bulkRotationInterval}
                        onChange={(e) => setBulkRotationInterval(parseInt(e.target.value) || 60)}
                        min="1"
                        className="w-full px-4 py-3 pr-20 rounded-lg border border-gray-300 dark:border-gray-600 
                                 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200
                                 bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                                 transition-all duration-200"
                        placeholder="60"
                      />
                      <span className="absolute right-3 top-3 text-sm text-gray-500 dark:text-gray-400">seconds</span>
                    </div>
                  </div>

                  {/* API URL (optional) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      API URL (optional)
                    </label>
                    <input
                      type="text"
                      value={bulkUrl}
                      onChange={(e) => setBulkUrl(e.target.value)}
                      placeholder="Leave empty to keep existing URLs"
                      className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 
                               shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200
                               bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                               transition-all duration-200 font-mono"
                    />
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Use {`{KEY}`} placeholder or a key query param will be appended automatically.
                    </p>
                  </div>

                  {/* Expiration Date */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Expiration Date
                    </label>
                    <input
                      type="datetime-local"
                      value={bulkExpirationDate}
                      onChange={(e) => setBulkExpirationDate(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 
                               shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200
                               bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                               transition-all duration-200"
                    />
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center">
                      <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Leave empty to keep existing expiration dates
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="bg-gray-50 dark:bg-gray-700 px-6 py-4 rounded-b-2xl flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setIsBulkEditModalOpen(false);
                    setBulkExpirationDate('');
                    setBulkUrl('');
                  }}
                  className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 
                           transition-colors duration-200 flex items-center space-x-2 font-medium"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span>Cancel</span>
                </button>
                <button
                  onClick={handleBulkUpdateRotationInterval}
                  className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg 
                           hover:from-blue-600 hover:to-purple-700 transition-all duration-200 
                           flex items-center space-x-2 font-medium shadow-lg"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Update Keys</span>
                </button>
              </div>
            </div>
          </div>
        )}

        <ProxyTable
          proxyKeys={proxyKeys}
          selectedKeys={selectedKeys}
          onSelectKey={handleSelectKey}
          onSelectAll={handleSelectAll}
          onToggle={handleToggle}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />

        <div className="mt-4">
          <Pagination
            currentPage={paginationData.currentPage}
            totalPages={paginationData.totalPages}
            pageSize={paginationData.pageSize}
            totalItems={paginationData.totalItems}
            startItem={paginationData.startItem}
            endItem={paginationData.endItem}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
        </div>

        <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
          © manhgdev - {new Date().getFullYear()}
        </div>
      </div>
      <DarkMode />
    </main>
  );
} 