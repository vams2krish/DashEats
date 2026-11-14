import { describe, expect, it } from 'vitest';
import { energyUsedPercent, refillCost, remainingRangeMiles, VEHICLE_SPECS } from './vehicleSpecs';

describe('vehicle energy models', () => {
  it('gives the hybrid more range than the gasoline sedan', () => {
    expect(remainingRangeMiles(VEHICLE_SPECS.hybrid, 100)).toBeGreaterThan(
      remainingRangeMiles(VEHICLE_SPECS.gasoline, 100),
    );
  });

  it('uses energy and prices a partial refill', () => {
    expect(energyUsedPercent(VEHICLE_SPECS.electric, 1609.344)).toBeCloseTo(0.397, 2);
    expect(refillCost(VEHICLE_SPECS.gasoline, 50)).toBeCloseTo(34.73, 1);
  });
});
