import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '../../src/data/schemas');

describe('data schemas', () => {
  const files = readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.schema.json'));

  it('all five schemas exist', () => {
    const names = files.map((f) => f.replace('.schema.json', '')).sort();
    expect(names).toEqual(['dialogue', 'map', 'quest', 'save', 'sprite']);
  });

  it.each(files)('%s is valid JSON with $schema and $id', (file) => {
    const schema = JSON.parse(readFileSync(join(SCHEMA_DIR, file), 'utf-8'));
    expect(schema.$schema).toContain('json-schema.org');
    expect(schema.$id).toContain('keystone/');
    expect(schema.type).toBe('object');
  });
});
