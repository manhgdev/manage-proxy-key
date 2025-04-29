import { NextResponse } from 'next/server';
import { getProxyService } from '@server/services/proxyService';
import { dbService } from '@server/database';
import { AutoRunResponse } from '@/types/api';

export async function POST() {
  try {
    const proxyService = await getProxyService();
    
    // Get current status
    const currentStatus = proxyService.getAutoRunStatus();
    
    // Toggle auto run status
    const newStatus = await proxyService.toggleAutoRun();
    
    // Return current status
    const response: AutoRunResponse = {
      isAutoRunning: newStatus,
      message: `Auto run ${newStatus ? 'enabled' : 'disabled'} successfully`,
      previousStatus: currentStatus
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Failed to toggle auto run:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to toggle auto run' },
      { status: 500 }
    );
  }
} 