import { describe, expect, it } from 'vitest';
import { greeting } from './dashboard';

describe('greeting', () => {
  it('says good morning until noon', () => {
    expect(greeting(8)).toBe('Καλημέρα');
    expect(greeting(11)).toBe('Καλημέρα');
  });
  it('says good evening from noon and through the night', () => {
    expect(greeting(12)).toBe('Καλησπέρα');
    expect(greeting(23)).toBe('Καλησπέρα');
    expect(greeting(2)).toBe('Καλησπέρα');
  });
});
