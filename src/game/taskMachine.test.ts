import { describe, expect, it } from 'vitest';
import { advanceTask, isDrivingStage, type TaskEvent, type TaskStage } from './taskMachine';

describe('DashEats task flow', () => {
  it('completes the full delivery lifecycle in order', () => {
    const events: TaskEvent[] = [
      'ACCEPT',
      'ARRIVE_PICKUP',
      'VERIFY_OTP',
      'ORDER_READY',
      'ARRIVE_DROPOFF',
      'CONFIRM_PHOTO',
    ];
    let stage: TaskStage = 'offer';
    for (const event of events) stage = advanceTask(stage, event);
    expect(stage).toBe('complete');
  });

  it('ignores invalid events and identifies driving stages', () => {
    expect(advanceTask('offer', 'ARRIVE_DROPOFF')).toBe('offer');
    expect(isDrivingStage('toPickup')).toBe(true);
    expect(isDrivingStage('pickupOtp')).toBe(false);
  });
});
