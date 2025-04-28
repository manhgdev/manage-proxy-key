'use client';

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

export default function ProxyTable({
  proxyKeys,
  selectedKeys,
  onSelectKey,
  onSelectAll,
  onToggle,
  onEdit,
  onDelete
}: ProxyTableProps) {
  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={selectedKeys.size === proxyKeys.length}
                  onChange={onSelectAll}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">#</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Key</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Expiration</th>
              <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Rotation Interval (s)</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Actions</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Proxy Data</th>
            </tr>
          </thead>
          <tbody>
            {proxyKeys.map((proxyKey, index) => (
              <tr key={proxyKey.id} className="border-b">
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={selectedKeys.has(proxyKey.id)}
                    onChange={() => onSelectKey(proxyKey.id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </td>
                <td className="px-4 py-3 text-center">{index + 1}</td>
                <td className="px-4 py-3">{proxyKey.key}</td>
                <td className="px-4 py-3">
                  {proxyKey.proxyData && proxyKey.proxyData["Token expiration date"] 
                    ? proxyKey.proxyData["Token expiration date"]
                    : 'N/A'}
                </td>
                <td className="px-4 py-3 text-center">{proxyKey.rotationInterval}</td>
                <td className="px-4 py-3">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => onToggle(proxyKey.id)}
                      className={`px-3 py-1 rounded ${
                        proxyKey.isActive ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-700'
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
                        <div className="text-gray-500 text-xs mb-2">
                          Last updated: {formatDateTime(proxyKey.lastRotatedAt)}
                        </div>
                        <div className="font-medium">Status: {proxyKey.proxyData.status}</div>
                        <div className="text-gray-600">Message: {proxyKey.proxyData.message}</div>
                        <div className="text-gray-600">HTTP: {proxyKey.proxyData.proxyhttp}</div>
                        <div className="text-gray-600">SOCKS5: {proxyKey.proxyData.proxysocks5}</div>
                        <div className="text-gray-600">Network: {proxyKey.proxyData["Nha Mang"]}</div>
                        <div className="text-gray-600">Location: {proxyKey.proxyData["Vi Tri"]}</div>
                        <div className="text-gray-600">Expiration: {proxyKey.proxyData["Token expiration date"]}</div>
                      </div>
                    ) : (
                      <div className="text-gray-500 text-sm">No data available</div>
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