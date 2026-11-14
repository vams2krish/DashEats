export type Powertrain = 'gasoline' | 'hybrid' | 'electric';

export interface VehicleSpec {
  powertrain: Powertrain;
  label: string;
  capacity: number;
  capacityUnit: 'gal' | 'kWh';
  efficiency: number;
  efficiencyLabel: string;
  price: number;
  priceUnit: '/gal' | '/kWh';
  engineForce: number;
  brakeForce: number;
  massKg: number;
  maxSpeedMps: number;
}

export const VEHICLE_SPECS: Record<Powertrain, VehicleSpec> = {
  gasoline: {
    powertrain: 'gasoline',
    label: 'Gas sedan',
    capacity: 14.5,
    capacityUnit: 'gal',
    efficiency: 31,
    efficiencyLabel: '31 mpg',
    price: 4.79,
    priceUnit: '/gal',
    engineForce: 2550,
    brakeForce: 92,
    massKg: 1480,
    maxSpeedMps: 30,
  },
  hybrid: {
    powertrain: 'hybrid',
    label: 'Hybrid hatch',
    capacity: 11.3,
    capacityUnit: 'gal',
    efficiency: 52,
    efficiencyLabel: '52 mpg',
    price: 4.79,
    priceUnit: '/gal',
    engineForce: 2380,
    brakeForce: 98,
    massKg: 1560,
    maxSpeedMps: 28,
  },
  electric: {
    powertrain: 'electric',
    label: 'Electric crossover',
    capacity: 78,
    capacityUnit: 'kWh',
    efficiency: 0.31,
    efficiencyLabel: '31 kWh/100 mi',
    price: 0.43,
    priceUnit: '/kWh',
    engineForce: 2900,
    brakeForce: 108,
    massKg: 1940,
    maxSpeedMps: 31,
  },
};

const METERS_PER_MILE = 1609.344;

export function energyUsedPercent(spec: VehicleSpec, distanceMeters: number, loadFactor = 1): number {
  const miles = Math.max(0, distanceMeters) / METERS_PER_MILE;
  const unitsUsed = spec.powertrain === 'electric'
    ? miles * spec.efficiency
    : miles / spec.efficiency;
  return (unitsUsed / spec.capacity) * 100 * Math.max(0.75, loadFactor);
}

export function remainingRangeMiles(spec: VehicleSpec, energyPercent: number): number {
  const remainingUnits = spec.capacity * Math.max(0, Math.min(100, energyPercent)) / 100;
  return spec.powertrain === 'electric'
    ? remainingUnits / spec.efficiency
    : remainingUnits * spec.efficiency;
}

export function refillCost(spec: VehicleSpec, energyPercent: number): number {
  const missingUnits = spec.capacity * (100 - Math.max(0, Math.min(100, energyPercent))) / 100;
  return missingUnits * spec.price;
}
