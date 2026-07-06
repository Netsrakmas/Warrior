/** Runtime shapes for data files (authoritative schemas live in src/data/schemas). */

export interface MapObject {
  type: string;
  tx: number;
  ty: number;
}

export interface MapEntity {
  type: string;
  tx: number;
  ty: number;
  props?: Record<string, unknown>;
}

export interface MapTrigger {
  shape: 'rect';
  tx: number;
  ty: number;
  w: number;
  h: number;
  action: 'goto' | 'flag';
  target?: string;
  set?: string;
}

export interface MapData {
  id: string;
  name: string;
  tileset: string;
  width: number;
  height: number;
  layers: {
    ground: number[][];
    overlay?: number[][];
    collision: number[][];
  };
  objects?: MapObject[];
  entities?: MapEntity[];
  triggers?: MapTrigger[];
  ambient?: { music?: string; restoredFlag?: string };
}
