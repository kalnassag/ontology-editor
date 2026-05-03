import { describe, it, expect } from 'vitest';
import { parseTurtle, buildModelFromTriples } from '../turtle-parser';
import * as fs from 'fs';

describe('Turtle Parser', () => {
  it('should parse the sample ontology without errors', () => {
    const samplePath = new URL('../../../docs/sample.ttl', import.meta.url);
    const turtle = fs.readFileSync(samplePath, 'utf-8');
    
    const parsed = parseTurtle(turtle);
    
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.triples.length).toBeGreaterThan(0);
    expect(Object.keys(parsed.prefixes)).toContain('owl');
    expect(Object.keys(parsed.prefixes)).toContain('rdfs');
  });

  it('should build a model from parsed triples', () => {
    const samplePath = new URL('../../../docs/sample.ttl', import.meta.url);
    const turtle = fs.readFileSync(samplePath, 'utf-8');
    const parsed = parseTurtle(turtle);
    const model = buildModelFromTriples(parsed);
    
    expect(model.metadata.ontologyUri).toBeTruthy();
    expect(model.classes.length).toBeGreaterThan(0);
    expect(model.properties.length).toBeGreaterThan(0);
  });
});
