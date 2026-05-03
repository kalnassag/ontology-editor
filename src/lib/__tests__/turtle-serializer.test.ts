import { describe, it, expect } from 'vitest';
import { parseTurtle, buildModelFromTriples } from '../turtle-parser';
import { serializeToTurtle } from '../turtle-serializer';
import * as fs from 'fs';

describe('Turtle Serializer', () => {
  it('should serialize an ontology model back to Turtle without losing data', () => {
    const samplePath = new URL('../../../docs/sample.ttl', import.meta.url);
    const turtle = fs.readFileSync(samplePath, 'utf-8');
    
    // Parse
    const parsed = parseTurtle(turtle);
    const model = buildModelFromTriples(parsed);
    const ontology = model as any; // Cast for testing
    
    // Serialize
    const serializedTurtle = serializeToTurtle(ontology);
    
    expect(serializedTurtle).toContain('@prefix');
    expect(serializedTurtle).toContain('owl:Ontology');
    
    // Round trip: Parse the serialized turtle again
    const roundTripParsed = parseTurtle(serializedTurtle);
    const roundTripModel = buildModelFromTriples(roundTripParsed);
    
    // The number of classes and properties should be exactly the same
    expect(roundTripModel.classes.length).toBe(ontology.classes.length);
    expect(roundTripModel.properties.length).toBe(ontology.properties.length);
  });
});
