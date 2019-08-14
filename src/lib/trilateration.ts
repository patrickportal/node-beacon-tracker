import * as trilateration from 'node-trilateration';

import { PointXY } from './RunawayBounds';

import { round } from '../utils/strings';
import { config } from '../config';

/**
 * Distance = 10 ^ ((Measured Power – RSSI)/(10 * N))
 * https://iotandelectronics.wordpress.com/2016/10/07/how-to-calculate-distance-from-the-rssi-value-of-the-ble-beacon/
 */
export function rssiToMeters(rssi: number, referenceRssi, referenceDistance = 1): number {
  const meters = Math.pow(10, ((referenceRssi - rssi) / 20)) * referenceDistance;

  return round(meters);
}

/**
 * @param {Object} beaconConfig value in config.beacons
 * @param {Object} data BeaconName => rssi
 * @return Object({x: number, y: number})
 */
export function findCoordinates(beaconConfig, data: any): PointXY {
  const beacons = Object.keys(data)
    .map((beaconName: string) => ({
      x: config.accessPoints[beaconName].x,
      y: config.accessPoints[beaconName].y,
      distance: rssiToMeters(
        data[beaconName],
        beaconConfig.reference.rssi[beaconName],
        beaconConfig.reference.distance[beaconName],
      ),
    }));


  const coords = trilateration.calculate(beacons);

  return {
    x: round(coords.x),
    y: round(coords.y),
  };
}
