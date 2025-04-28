'use client';

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { ProxyKey } from '@/types/proxy';
import Toast from '@components/common/Toast';
import Pagination from '../common/Pagination';
import SearchInput from '../common/SearchInput';
import ProxyTable from './ProxyTable';

interface ToastMessage {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

interface PaginationData {
  totalItems: number;
  currentPage: number;
  pageSize: number;
  totalPages: number;
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
  const [isAdding, setIsAdding] = useState(false);
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
    totalPages: 1
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

  useEffect(() => {
    if (isAutoRunning) {
      const checkAndRotate = async () => {
        const now = Date.now();
        const keysToRotate = proxyKeys.filter(key => {
          if (!key.isActive) return false;
          const lastRotated = new Date(key.lastRotatedAt).getTime();
          const nextRotation = lastRotated + (key.rotationInterval * 1000);
          return now >= nextRotation;
        });

        if (keysToRotate.length > 0) {
          log('Keys to rotate:', keysToRotate.map(k => ({
            key: k.key,
            lastRotated: new Date(k.lastRotatedAt).toLocaleString(),
            nextRotation: new Date(new Date(k.lastRotatedAt).getTime() + (k.rotationInterval * 1000)).toLocaleString()
          })));

          for (const key of keysToRotate) {
            try {
              const response = await fetch('/api/keys/apply', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ id: key.id }),
              });
              if (response.ok) {
                const updatedKey = await response.json();
                setProxyKeys(prevKeys => 
                  prevKeys.map(k => k.id === key.id ? updatedKey : k)
                );
                log('Rotated key:', {
                  key: key.key,
                  lastRotated: new Date(updatedKey.lastRotatedAt).toLocaleString(),
                  nextRotation: new Date(new Date(updatedKey.lastRotatedAt).getTime() + (updatedKey.rotationInterval * 1000)).toLocaleString()
                });
              }
            } catch (error) {
              console.error('Failed to rotate key:', error);
            }
          }
        }
      };

      if (!intervalRef.current) {
        checkAndRotate();
        intervalRef.current = setInterval(checkAndRotate, 1000);
        log('Auto run started');
      }
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      log('Auto run stopped');
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        log('Auto run cleaned up');
      }
    };
  }, [isAutoRunning]);

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
    if (!newKey.key && uploadedKeys.length === 0) {
      showToast('Please fill in key field or upload keys from file', 'error');
      return;
    }

    let successCount = 0;
    let errorCount = 0;
    let errorMessage = '';

    // Nếu có key đơn lẻ
    if (newKey.key) {
      const proxyKey: ProxyKey = {
        id: Date.now().toString(),
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
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(proxyKey),
        });

        const data = await response.json();
        if (response.ok) {
          successCount++;
        } else {
          errorCount++;
          errorMessage = data.error || 'Failed to add key';
          console.error(`Failed to add key ${newKey.key}:`, data.error);
        }
      } catch (error) {
        errorCount++;
        errorMessage = 'Failed to add key';
        console.error(`Failed to add key ${newKey.key}:`, error);
      }
    }

    // Nếu có uploadedKeys
    if (uploadedKeys.length > 0) {
      for (const key of uploadedKeys) {
        const proxyKey: ProxyKey = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          key: key,
          url: '',
          expirationDate: '',
          isActive: true,
          createdAt: new Date().toISOString(),
          lastRotatedAt: new Date().toISOString(),
          rotationInterval: newKey.rotationInterval,
        };

        try {
          const response = await fetch('/api/keys', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(proxyKey),
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
    setIsAdding(false);

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
      const response = await fetch('/api/keys', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id }),
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
    setIsAdding(true);
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
        setIsAdding(false);
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
    setIsAdding(false);
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
      showToast(data.message || `Auto run ${data.isAutoRunning ? 'enabled' : 'disabled'}`, 'success');
      
      // Refresh keys after toggling auto run
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
        const response = await fetch('/api/keys', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id }),
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen p-4 md:p-8 bg-gray-100">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <h1 className="text-2xl md:text-3xl font-bold">Proxy Key Manager</h1>
          <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-4 w-full md:w-auto">
            <SearchInput 
              onSearch={handleSearch}
              placeholder="Search keys..."
            />
            <button
              onClick={handleToggleAutoRun}
              className={`px-4 py-2 rounded transition-colors duration-200 ${
                isAutoRunning ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-500 hover:bg-gray-600'
              } text-white w-full md:w-auto`}
            >
              Auto Run: {isAutoRunning ? 'ON' : 'OFF'}
            </button>
            {!isAdding && (
              <button
                onClick={() => setIsAdding(true)}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 w-full md:w-auto"
              >
                + Add New Key
              </button>
            )}
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

        {isAdding && (
          <div className="mb-6 p-4 bg-white rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4">{editingId ? 'Edit Key' : 'Add New Key'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Key</label>
                <input
                  type="text"
                  value={newKey.key}
                  onChange={(e) => setNewKey({ ...newKey, key: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Rotation Interval (seconds)</label>
                <input
                  type="number"
                  value={newKey.rotationInterval}
                  onChange={(e) => setNewKey({ ...newKey, rotationInterval: parseInt(e.target.value) || 60 })}
                  min="1"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Upload Keys from TXT</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt"
                  onChange={handleFileUpload}
                  className="mt-1 block w-full text-sm text-gray-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-md file:border-0
                    file:text-sm file:font-semibold
                    file:bg-blue-50 file:text-blue-700
                    hover:file:bg-blue-100"
                />
                <p className="mt-1 text-xs text-gray-500">One key per line</p>
              </div>
            </div>
            {uploadedKeys.length > 0 && (
              <div className="mt-4">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-medium text-gray-700">Keys to add ({uploadedKeys.length})</h3>
                </div>
                <div className="max-h-40 overflow-y-auto bg-gray-50 p-2 rounded">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {uploadedKeys.map((key, index) => (
                      <div key={index} className="text-sm text-gray-600 bg-white p-2 rounded border">
                        {key}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div className="mt-4 flex space-x-2">
              <button
                onClick={editingId ? handleSave : handleAddKey}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
              >
                {editingId ? 'Save' : 'Add'}
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {isBulkEditModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
              <h2 className="text-xl font-semibold mb-4">Update Rotation Interval</h2>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rotation Interval (seconds)
                </label>
                    <input
                  type="number"
                  value={bulkRotationInterval}
                  onChange={(e) => setBulkRotationInterval(parseInt(e.target.value) || 60)}
                  min="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          paginationData={paginationData}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
      </div>
    </main>
  );
} 