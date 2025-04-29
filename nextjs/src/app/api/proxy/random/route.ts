import { NextResponse } from 'next/server';
import { dbService } from '@server/database';
import { KeyResponse } from '@/types/api';

// Chỉ export các hàm route handler
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const keys = await dbService.getKeys();
    const validKeys = keys.filter(key => 
      key.proxyData?.status === 100 && 
      key.isActive
    );

    if (validKeys.length === 0) {
      return NextResponse.json(
        { error: 'No valid proxy data available' },
        { status: 404 }
      );
    }

    // Random một key từ danh sách valid
    const randomKey = validKeys[Math.floor(Math.random() * validKeys.length)];
    
    // Cập nhật lastRotatedAt để đánh dấu key đã được sử dụng
    const updatedKey: KeyResponse = {
      ...randomKey,
      lastRotatedAt: new Date().toISOString()
    };

    await dbService.updateKey(updatedKey);

    return NextResponse.json({
      proxyData: randomKey.proxyData,
      key: randomKey.key,
      lastRotatedAt: updatedKey.lastRotatedAt
    });
  } catch (error) {
    console.error('Failed to get random proxy data:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get random proxy data' },
      { status: 500 }
    );
  }
} 