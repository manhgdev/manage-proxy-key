import { NextResponse } from 'next/server';
import { dbService } from '@server/database';
import { proxyService } from '@server/services/proxyService';

export async function GET() {
  try {
    const keys = await dbService.getKeys();
    const activeKeys = keys.filter(key => key.isActive);
    
    if (activeKeys.length === 0) {
      return NextResponse.json(
        { error: 'No active keys found' },
        { status: 404 }
      );
    }

    // Lấy key ngẫu nhiên
    const randomKey = activeKeys[Math.floor(Math.random() * activeKeys.length)];
    
    // Cập nhật dữ liệu proxy cho key này
    await proxyService.fetchProxyDataForRandom(randomKey);
    
    // Lấy key mới nhất từ database
    const updatedKey = await dbService.getKeyById(randomKey.id);
    
    if (!updatedKey || !updatedKey.proxyData) {
      return NextResponse.json(
        { error: 'Failed to get proxy data' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      proxyData: updatedKey.proxyData,
      key: updatedKey.key
    });
  } catch (error) {
    console.error('Failed to get random proxy:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get random proxy' },
      { status: 500 }
    );
  }
} 