import { NextResponse } from 'next/server';
import { dbService } from '@server/database';
import { proxyService } from '@server/services/proxyService';
import { KeyResponse } from '@/types/api';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '25');
    const search = searchParams.get('search') || '';

    const keys = dbService.getKeys();
    const filteredKeys = search 
      ? keys.filter(key => key.key.toLowerCase().includes(search.toLowerCase()))
      : keys;

    const totalItems = filteredKeys.length;
    const startIndex = (page - 1) * pageSize;
    const endIndex = pageSize === -1 ? filteredKeys.length : startIndex + pageSize;
    const paginatedKeys = filteredKeys.slice(startIndex, endIndex);

    return NextResponse.json({
      keys: paginatedKeys,
      pagination: {
        totalItems,
        currentPage: page,
        pageSize,
        totalPages: pageSize === -1 ? 1 : Math.ceil(totalItems / pageSize)
      }
    });
  } catch (error) {
    console.error('Failed to fetch keys:', error);
    return NextResponse.json(
      { error: 'Failed to fetch keys' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const key = await request.json() as KeyResponse;
    
    // Kiểm tra key trùng
    const existingKey = dbService.getKeys().find(k => k.key === key.key);
    if (existingKey) {
      return NextResponse.json(
        { error: 'Key already exists' },
        { status: 400 }
      );
    }

    dbService.addKey(key);
    proxyService.startKey(key);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to add key:', error);
    return NextResponse.json(
      { error: 'Failed to add key' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const key = await request.json() as KeyResponse;
    const existingKey = dbService.getKeys().find(k => k.id === key.id);
    if (!existingKey) {
      return NextResponse.json(
        { error: 'Key not found' },
        { status: 404 }
      );
    }

    // Kiểm tra key trùng khi edit
    const duplicateKey = dbService.getKeys().find(k => 
      k.key === key.key && k.id !== key.id
    );
    if (duplicateKey) {
      return NextResponse.json(
        { error: 'Key already exists' },
        { status: 400 }
      );
    }

    const updatedKey: KeyResponse = {
      ...existingKey,
      ...key,
      rotationInterval: key.rotationInterval || existingKey.rotationInterval || 62,
      isActive: key.isActive ?? existingKey.isActive,
    };

    dbService.updateKey(updatedKey);
    proxyService.updateKey(updatedKey);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update key:', error);
    return NextResponse.json(
      { error: 'Failed to update key' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();
    dbService.deleteKey(id);
    proxyService.stopKey(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete key:', error);
    return NextResponse.json(
      { error: 'Failed to delete key' },
      { status: 500 }
    );
  }
} 