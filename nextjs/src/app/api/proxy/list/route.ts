import { NextResponse } from 'next/server';
import { dbService } from '@server/database';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const keys = await dbService.getKeys();
    const validKeys = keys.filter(key => key.isActive);

    if (validKeys.length === 0) {
      return NextResponse.json(
        { error: 'No valid proxy data available' },
        { status: 404 }
      );
    }

    // Trả về danh sách tất cả proxy data
    const proxyList = validKeys.map(key => {
      try {
        return {
          key: key.key,
          lastRotatedAt: key.lastRotatedAt,
          rotationInterval: key.rotationInterval,
          ...key.proxyData
        };
      } catch (error) {
        // If spread fails, return minimal data
        return {
          key: key.key,
          lastRotatedAt: key.lastRotatedAt,
          rotationInterval: key.rotationInterval
        };
      }
    });

    return NextResponse.json({
      total: proxyList.length,
      proxies: proxyList
    });
  } catch (error) {
    console.error('Failed to get proxy list:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get proxy list' },
      { status: 500 }
    );
  }
}
