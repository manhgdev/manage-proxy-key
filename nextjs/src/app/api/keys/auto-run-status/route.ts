import { NextResponse } from 'next/server';
import { AutoRunResponse } from '@/types/api';
import { getProxyService } from '@/server/services/proxyService';

export async function GET() {
  try {
    const proxyService = await getProxyService();
    const isAutoRunning = proxyService.getAutoRunStatus();

    const response: AutoRunResponse = {
      isAutoRunning,
      message: `Auto run is ${isAutoRunning ? 'enabled' : 'disabled'}`
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error('Failed to get auto run status:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get auto run status' },
      { status: 500 }
    );
  }
} 