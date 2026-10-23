import { dash, formatDate, parseDate, personName, statusKind } from './format';

describe('format helpers', () => {
  it('parses the three date formats the API returns', () => {
    expect(parseDate('/Date(1655905399023-0000)/')?.getTime()).toBe(1655905399023);
    expect(parseDate('18/06/2025')?.getFullYear()).toBe(2025);
    expect(parseDate('2026-10-21T10:00:00Z')?.toISOString()).toBe('2026-10-21T10:00:00.000Z');
    expect(parseDate('0001-01-01T00:00:00')).toBeNull();
    expect(formatDate('2026-09-21T18:15:37.2570000')).toBe('21/09/2026');
    expect(parseDate('')).toBeNull();
  });

  it('formats dates in Greek order and shows a dash when missing', () => {
    expect(formatDate('18/06/2025')).toBe('18/06/2025');
    expect(formatDate(null)).toBe('—');
  });

  it('maps backend status strings to a badge kind', () => {
    expect(statusKind('Δημιουργήθηκε')).toBe('created');
    expect(statusKind('Σε εξέλιξη - Αίτηση για άδεια')).toBe('progress');
    expect(statusKind('Αρχειοθετήθηκε')).toBe('archived');
    expect(statusKind(undefined)).toBe('other');
  });

  it('builds person names and dashes', () => {
    expect(personName({ DisplayName: 'Μαρία Π.' })).toBe('Μαρία Π.');
    expect(personName({ FirstName: 'Νίκος', LastName: 'Κ.' })).toBe('Νίκος Κ.');
    expect(dash('-')).toBe('—');
    expect(dash('Αυτοψία')).toBe('Αυτοψία');
  });
});
