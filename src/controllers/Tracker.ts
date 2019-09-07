import { EventEmitter } from 'events';

import * as Promise from 'bluebird';

import { TRssiPool } from './Aggregator';
import TrackerAlarm from './TrackerAlarm';
import Exporter from './Exporter';

import * as logger from '../lib/logger';
import RunawayBounds, { PointXY } from '../lib/RunawayBounds';
import { BeaconConfig, config } from '../config';
import * as trilateration from '../lib/trilateration';

export default class Tracker extends EventEmitter {
  public exporter: Exporter;
  private bounds: RunawayBounds;
  private alarm: TrackerAlarm;
  private beaconConfig: BeaconConfig;

  constructor(peripheral, beaconConfig) {
    super();
    this.bounds = new RunawayBounds(config.tracker.runawayBounds);
    this.exporter = new Exporter(peripheral.uuid);
    this.alarm = new TrackerAlarm(peripheral, beaconConfig);
  }

  newData(pool) {
    if (config.tracker.mode === 'coordinates') {
      const { missingAPs } = this.approximatePosition(pool);

      if (missingAPs.length) {
        return this.partialData(pool);
      }

      return this.newPosition(
        trilateration.findCoordinates(this.beaconConfig, pool),
        pool,
      );
    } else {

    }
  }

  private partialData(pool: TRssiPool): Promise<any> {
    logger.log(`partial position ${JSON.stringify(pool)}`, 2);

    return this.exporter.append({ pool });
  }

  private newPosition(coords: PointXY, pool: TRssiPool): Promise<any> {
    let logInfo = '';
    let distFromZone = this.bounds.distancefromZone(coords);
    console.log('__');

    if (distFromZone < 0 && !config.tracker.precisionCondition(pool)) {
      logInfo = 'imprecise';
      distFromZone = 0;
    }
    const isAllowed = distFromZone >= 0;

    return Promise.try(() => {
      if (isAllowed) {
        logger.log(`Position ok ${JSON.stringify(coords)}`);

        return this.alarm.stop();
      }

      // Update alert timing
      logger.log(`Forbidden position ${JSON.stringify(coords)}`);
      const alarmDuration = this.alarm.updateAlarmDuration(distFromZone);
      this.emit('alarm', alarmDuration);
      logInfo = `alarm ${alarmDuration}s}`;

      return this.alarm.play();
    })
      .then(() => this.exporter.append({ pool, coords, distFromZone, logInfo }));
  }

  private approximatePosition(pool) {
    const approximateConfig = config.aggregate.approximate;
    const apNames = Object.keys(config.accessPoints);

    let missingAPs = apNames.reduce((missing, apName) => {
      if (!pool[apName]) {
        missing.push(apName);
      }

      return missing;
    }, []);

    if (missingAPs.length === 1) {
      for (const approxConfig of approximateConfig) {
        if (approxConfig.missing === missingAPs[0]) {
          logger.log(`Faking ${approxConfig.missing} with ${approxConfig.rssi} - too far`);

          pool[approxConfig.missing] = approxConfig.rssi;
          missingAPs = [];
        }
      }
    }

    return { missingAPs };
  }
}
