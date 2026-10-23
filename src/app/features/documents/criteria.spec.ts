import { describe as group, expect, it } from 'vitest';
import { FilterDef } from '../../core/documents-models';
import { decodeValue, describe, encodeValue, isEmptyValue } from './criteria';

const status: FilterDef = {
  Key: 'Status', Label: 'Κατάσταση', Group: 'Έγγραφο', Kind: 'options',
  Options: [{ Id: 1, Label: 'Δημιουργήθηκε' }, { Id: 2, Label: 'Χρεώθηκε' }, { Id: 4, Label: 'Απαντήθηκε' }],
};
const read: FilterDef = { ...status, Key: 'IsRead', Single: true };
const sent: FilterDef = { Key: 'SendDate', Label: 'Ημ. Αποστολής', Group: 'Ημερομηνίες', Kind: 'dates' };
const ada: FilterDef = { Key: 'Ada', Label: 'ΑΔΑ', Group: 'Λοιπά', Kind: 'text' };
const signator: FilterDef = { Key: 'Signator', Label: 'Υπογράφων', Group: 'Πρόσωπα', Kind: 'users' };

group('criteria in the URL', () => {
  it('round-trips every kind', () => {
    expect(decodeValue(status, encodeValue(status, [4, 2, 2])!)).toEqual([2, 4]);
    expect(decodeValue(sent, encodeValue(sent, { From: '2026-10-01', To: null })!)).toEqual({ From: '2026-10-01', To: null });
    expect(decodeValue(ada, encodeValue(ada, '  ΨΩ12 ')!)).toBe('ΨΩ12');
    expect(decodeValue(signator, encodeValue(signator, [13, 11])!)).toEqual([11, 13]);
  });

  it('writes nothing for empty values', () => {
    expect(encodeValue(status, [])).toBeNull();
    expect(encodeValue(sent, { From: null, To: null })).toBeNull();
    expect(encodeValue(ada, '  ')).toBeNull();
    expect(isEmptyValue({ From: '2026-01-01' })).toBe(false);
  });

  it('drops malformed or unknown values', () => {
    expect(decodeValue(status, '2,99,x')).toEqual([2]);
    expect(decodeValue(status, '99')).toBeNull();
    expect(decodeValue(sent, '1/1/2026~')).toBeNull();
    expect(decodeValue(read, '1,2')).toEqual([1]);
  });

  it('describes a filter for its chip', () => {
    expect(describe(status, [1, 2, 4])).toBe('Κατάσταση: Δημιουργήθηκε, Χρεώθηκε +1');
    expect(describe(sent, { From: '2026-10-01', To: null })).toBe('Ημ. Αποστολής: από 01/10/2026');
    expect(describe(ada, 'ΨΩ12')).toBe('ΑΔΑ: «ΨΩ12»');
    expect(describe(signator, [13], new Map([['u:13', 'Ελένη Δημητρίου']]))).toBe('Υπογράφων: Ελένη Δημητρίου');
    expect(describe(signator, [99])).toBe('Υπογράφων: #99');
  });
});
