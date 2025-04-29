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
  const [newKey, setNewKey] = useState({
    key: '',
    rotationInterval: 60,
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
    let errorMessage = '';

    // Xử lý keys từ textarea
    for (const key of keysToAdd) {
      try {
        const response = await fetch('/api/keys', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            key: key,
            rotationInterval: newKey.rotationInterval,
            isActive: true
          }),
        });

        const data = await response.json();
        if (response.ok) {
          successCount++;
        } else {
          errorCount++;
          errorMessage = data.error || 'Failed to add key';
          console.error(`Failed to add key ${key}:`, data.error);
        }
      } catch (error) {
        errorCount++;
        errorMessage = 'Failed to add key';
        console.error(`Failed to add key ${key}:`, error);
      }
    }

    // Nếu có uploadedKeys
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
              rotationInterval: newKey.rotationInterval,
              isActive: true
            }),
          });

          const data = await response.json();
          if (response.ok) {
            successCount++;
          } else {
            errorCount++;
            errorMessage = data.error || 'Failed to add key';
            console.error(`Failed to add key ${key}:`, data.error);
          }
        } catch (error) {
          errorCount++;
          errorMessage = 'Failed to add key';
          console.error(`Failed to add key ${key}:`, error);
        }
      }
    }

    await fetchKeys();
    setNewKey({ key: '', rotationInterval: 60 });
    setUploadedKeys([]);
    setIsEditModalOpen(false);

    if (successCount > 0) {
      showToast(`Added ${successCount} keys${errorCount > 0 ? `, ${errorCount} failed` : ''}`, 'success');
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
    setNewKey({
      key: proxyKey.key,
      rotationInterval: proxyKey.rotationInterval,
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
      url: '',
      expirationDate: '',
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
        setNewKey({ key: '', rotationInterval: 60 });
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
    setNewKey({ key: '', rotationInterval: 60 });
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
      if (!response.ok) throw new Error(data.error || 'Failed to toggle auto run');

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

      // Kiểm tra key trùng
      const existingKeys = proxyKeys.map(k => k.key);
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
      console.error('Failed to read file:', error);
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
            rotationInterval: bulkRotationInterval
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
      showToast(`Updated rotation interval for ${keysToUpdate.length} keys`, 'success');
      setIsBulkEditModalOpen(false);
    } catch (error) {
      console.error('Failed to update rotation interval:', error);
      showToast('Failed to update rotation interval', 'error');
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
    setNewKey({ key: '', rotationInterval: 60 });
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
              Update Rotation Interval ({selectedKeys.size})
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-2xl w-full mx-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{editingId ? 'Edit Key' : 'Add New Key'}</h2>
                <button
                  onClick={handleCancel}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Key</label>
                  {editingId ? (
                    <input
                      type="text"
                      value={newKey.key}
                      onChange={(e) => setNewKey({ ...newKey, key: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 
                               shadow-sm focus:border-blue-500 focus:ring-blue-500
                               bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="Enter key"
                    />
                  ) : (
                    <>
                      <textarea
                        value={newKey.key}
                        onChange={(e) => setNewKey({ ...newKey, key: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 
                                 shadow-sm focus:border-blue-500 focus:ring-blue-500
                                 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="Enter keys, one per line..."
                        rows={4}
                      />
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">One key per line</p>
                    </>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Rotation Interval (seconds)</label>
                  <input
                    type="number"
                    value={newKey.rotationInterval}
                    onChange={(e) => setNewKey({ ...newKey, rotationInterval: parseInt(e.target.value) || 60 })}
                    min="1"
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 
                             shadow-sm focus:border-blue-500 focus:ring-blue-500
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              {!editingId && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Upload Keys from TXT</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt"
                    onChange={handleFileUpload}
                    className="mt-1 block w-full text-sm text-gray-500 dark:text-gray-400
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-md file:border-0
                      file:text-sm file:font-semibold
                      file:bg-blue-50 file:text-blue-700
                      hover:file:bg-blue-100
                      dark:file:bg-gray-700 dark:file:text-blue-300
                      dark:hover:file:bg-gray-600"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">One key per line</p>
                </div>
              )}
              {uploadedKeys.length > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Keys to add ({uploadedKeys.length})</h3>
                  </div>
                  <div className="max-h-40 overflow-y-auto bg-gray-50 dark:bg-gray-700 p-2 rounded">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {uploadedKeys.map((key, index) => (
                        <div key={index} className="text-sm text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 p-2 rounded border dark:border-gray-600">
                          {key}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div className="mt-6 flex justify-end space-x-2">
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  onClick={editingId ? handleSave : handleAddKey}
                  className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                >
                  {editingId ? 'Save Changes' : 'Add Key'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isBulkEditModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-md w-full">
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Update Rotation Interval</h2>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Rotation Interval (seconds)
                </label>
                <input
                  type="number"
                  value={bulkRotationInterval}
                  onChange={(e) => setBulkRotationInterval(parseInt(e.target.value) || 60)}
                  min="1"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                           focus:outline-none focus:ring-2 focus:ring-blue-500
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => setIsBulkEditModalOpen(false)}
                  className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkUpdateRotationInterval}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Update
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