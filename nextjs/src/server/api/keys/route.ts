import { NextResponse } from 'next/server';
import { dbService } from '@server/database';
import { proxyService } from '@server/services/proxyService';
import { KeyResponse } from '@/types/api';

export async function GET() {
  try {
    const keys = dbService.getKeys();
    return NextResponse.json(keys);
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
      return NextResponse.json({ error: 'Key not found' }, { status: 404 });
    }

    const updatedKey: KeyResponse = {
      ...existingKey,
      ...key,
      rotationInterval: key.rotationInterval || existingKey.rotationInterval || 60,
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