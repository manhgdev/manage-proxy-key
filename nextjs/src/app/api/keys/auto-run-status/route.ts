import { NextResponse } from 'next/server';
import { dbService } from '@server/database';
import { AutoRunResponse } from '@/types/api';

export async function GET() {
  try {
    const isAutoRunning = await dbService.getAutoRunStatus();
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