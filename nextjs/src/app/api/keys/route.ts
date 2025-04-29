import { NextResponse } from 'next/server';
import { dbService } from '@server/database';
import { getProxyService } from '@server/services/proxyService';
import { KeyResponse } from '@/types/api';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.max(1, parseInt(searchParams.get('pageSize') || '25'));

    const keys = await dbService.getKeys();
    const filteredKeys = search 
      ? keys.filter(key => key.key.toLowerCase().includes(search.toLowerCase()))
      : keys;

    const totalItems = filteredKeys.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const startIndex = (page - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalItems);
    const paginatedKeys = filteredKeys.slice(startIndex, endIndex);

    return NextResponse.json({
      keys: paginatedKeys,
      pagination: {
        totalItems,
        totalPages,
        currentPage: page,
        pageSize,
        startItem: totalItems === 0 ? 0 : startIndex + 1,
        endItem: endIndex
      }
    });
  } catch (error) {
    console.error('Failed to get keys:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get keys' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const key: KeyResponse = {
      ...body,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      lastRotatedAt: new Date().toISOString(),
      isActive: true
    };

    await dbService.addKey(key);
    const proxyService = await getProxyService();
    proxyService.startKey(key);
    return NextResponse.json(key);
  } catch (error) {
    console.error('Failed to add key:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add key' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const key: KeyResponse = {
      ...body,
      lastRotatedAt: new Date().toISOString()
    };

    await dbService.updateKey(key);
    const proxyService = await getProxyService();
    proxyService.freshTimerKey(key);
    return NextResponse.json(key);
  } catch (error) {
    console.error('Failed to update key:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update key' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json(
        { error: 'Key ID is required' },
        { status: 400 }
      );
    }

    const keys = await dbService.getKeys();
    const key = keys.find((k: KeyResponse) => k.id === id);
    if (!key) {
      return NextResponse.json(
        { error: 'Key not found' },
        { status: 404 }
      );
    }

    const proxyService = await getProxyService();
    proxyService.stopKey(key.id);
    await dbService.deleteKey(id);
    
    return NextResponse.json({ message: 'Key deleted successfully' });
  } catch (error) {
    console.error('Failed to delete key:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete key' },
      { status: 500 }
    );
  }
} 