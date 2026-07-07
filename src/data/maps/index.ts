import type { MapData } from '../../game/types';
import greybox01 from './greybox_01.json';
import greybox02 from './greybox_02.json';
import spire01 from './spire_01.json';

/** Map registry: goto-trigger targets resolve through this. */
export const MAPS: Record<string, MapData> = {
  greybox_01: greybox01 as MapData,
  greybox_02: greybox02 as MapData,
  spire_01: spire01 as MapData,
};

export const START_MAP = 'greybox_01';
