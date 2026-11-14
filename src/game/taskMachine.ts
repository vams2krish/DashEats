export type TaskStage =
  | 'offer'
  | 'toPickup'
  | 'pickupOtp'
  | 'storeWait'
  | 'toDropoff'
  | 'photoProof'
  | 'complete';

export type TaskEvent =
  | 'ACCEPT'
  | 'ARRIVE_PICKUP'
  | 'VERIFY_OTP'
  | 'ORDER_READY'
  | 'ARRIVE_DROPOFF'
  | 'CONFIRM_PHOTO'
  | 'RESET';

const transitions: Record<TaskStage, Partial<Record<TaskEvent, TaskStage>>> = {
  offer: { ACCEPT: 'toPickup' },
  toPickup: { ARRIVE_PICKUP: 'pickupOtp' },
  pickupOtp: { VERIFY_OTP: 'storeWait' },
  storeWait: { ORDER_READY: 'toDropoff' },
  toDropoff: { ARRIVE_DROPOFF: 'photoProof' },
  photoProof: { CONFIRM_PHOTO: 'complete' },
  complete: { RESET: 'offer' },
};

export function advanceTask(stage: TaskStage, event: TaskEvent): TaskStage {
  return transitions[stage][event] ?? stage;
}

export function isDrivingStage(stage: TaskStage): boolean {
  return stage === 'toPickup' || stage === 'toDropoff';
}
