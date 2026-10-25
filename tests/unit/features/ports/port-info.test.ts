import { describe, it, expect } from 'vitest';
import { getPortInfo, getAllPorts, canonicalPortName } from '@/features/ports/port-info';

/**
 * Unit tests for src/features/ports/port-info.ts
 *
 * Tests static port information:
 * - Port info lookup (dock address, arrival buffer, coordinates)
 * - All ports enumeration
 * - Port name canonicalization (aliases and normalization)
 *
 * No mocking needed — pure static data.
 */

describe('getPortInfo', () => {
  it('returns info for known port', () => {
    const info = getPortInfo('Sanur');

    expect(info).toHaveProperty('address');
    expect(info).toHaveProperty('dockTip');
    expect(info).toHaveProperty('arrivalBuffer');
    expect(info).toHaveProperty('lat');
    expect(info).toHaveProperty('lng');
    expect(info.address).toContain('Sanur');
  });

  it('returns default info for unknown port', () => {
    const info = getPortInfo('Unknown Port');

    expect(info.address).toBe('Unknown Port');
    expect(info.dockTip).toContain('Check with your operator');
    expect(info.arrivalBuffer).toBe(30);
    expect(info.lat).toBe(0);
    expect(info.lng).toBe(0);
  });

  it('returns correct coordinates for Gili Trawangan', () => {
    const info = getPortInfo('Gili Trawangan');

    expect(info.lat).toBe(-8.351);
    expect(info.lng).toBe(116.042);
  });

  it('handles arrival buffer variance by port', () => {
    const sanur = getPortInfo('Sanur');
    const labuan = getPortInfo('Labuan Bajo');
    const lembar = getPortInfo('Lembar');

    expect(sanur.arrivalBuffer).toBe(30);
    expect(labuan.arrivalBuffer).toBe(45);
    expect(lembar.arrivalBuffer).toBe(60);
  });
});

describe('getAllPorts', () => {
  it('returns array of all ports with names', () => {
    const ports = getAllPorts();

    expect(Array.isArray(ports)).toBe(true);
    expect(ports.length).toBeGreaterThan(0);
  });

  it('includes port name in each entry', () => {
    const ports = getAllPorts();

    ports.forEach((port) => {
      expect(port).toHaveProperty('name');
      expect(port).toHaveProperty('address');
      expect(port).toHaveProperty('dockTip');
    });
  });

  it('contains expected major ports', () => {
    const ports = getAllPorts();
    const names = ports.map((p) => p.name);

    expect(names).toContain('Sanur');
    expect(names).toContain('Gili Trawangan');
    expect(names).toContain('Labuan Bajo');
  });

  it('all ports have valid coordinates', () => {
    const ports = getAllPorts();

    ports.forEach((port) => {
      expect(typeof port.lat).toBe('number');
      expect(typeof port.lng).toBe('number');
      expect(port.lat).not.toBeNaN();
      expect(port.lng).not.toBeNaN();
    });
  });
});

describe('canonicalPortName', () => {
  it('handles exact match (Sanur)', () => {
    const canonical = canonicalPortName('Sanur');

    expect(canonical).toBe('Sanur');
  });

  it('normalizes lowercase alias (sanur (bali))', () => {
    const canonical = canonicalPortName('sanur (bali)');

    expect(canonical).toBe('Sanur');
  });

  it('normalizes Padang Bai variations', () => {
    expect(canonicalPortName('padangbai')).toBe('Padang Bai');
    expect(canonicalPortName('Padang Bai')).toBe('Padang Bai');
    expect(canonicalPortName('padang bai (bali)')).toBe('Padang Bai');
  });

  it('handles case-insensitive matching', () => {
    const canonical = canonicalPortName('SANUR');

    expect(canonical).toBe('Sanur');
  });

  it('trims whitespace', () => {
    const canonical = canonicalPortName('  Sanur  ');

    expect(canonical).toBe('Sanur');
  });

  it('returns trimmed input for unknown port', () => {
    const canonical = canonicalPortName('  Unknown Port  ');

    expect(canonical).toBe('Unknown Port');
  });

  it('handles Gili Islands aliases', () => {
    expect(canonicalPortName('gili trawangan (lombok)')).toBe('Gili Trawangan');
    expect(canonicalPortName('gili air (lombok)')).toBe('Gili Air');
  });
});
