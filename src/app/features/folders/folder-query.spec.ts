import { activeFilterCount, parseQuery, toOrderBy } from './folder-query';

describe('parseQuery (URL → list state)', () => {
  it('uses safe defaults for an empty URL', () => {
    const s = parseQuery({});
    expect(s).toEqual({
      type: null,
      q: '',
      searchType: 1,
      statuses: [],
      from: null,
      to: null,
      shared: false,
      unassigned: false,
      unread: false,
      page: 1,
      size: 20,
      sort: { column: 'UpdatedDate', dir: 'desc' },
    });
  });

  it('reads every parameter', () => {
    const s = parseQuery({
      t: '35', q: 'Λάρισα', st: '6', s: '2,3', from: '2026-01-01', to: '2026-02-01',
      sh: '1', na: '1', p: '3', ps: '50', o: 'FolderName',
    });
    expect(s.type).toBe(35);
    expect(s.q).toBe('Λάρισα');
    expect(s.searchType).toBe(6);
    expect(s.statuses).toEqual([2, 3]);
    expect([s.from, s.to]).toEqual(['2026-01-01', '2026-02-01']);
    expect([s.shared, s.unassigned]).toEqual([true, true]);
    expect([s.page, s.size]).toEqual([3, 50]);
    expect(s.sort).toEqual({ column: 'FolderName', dir: 'asc' });
    expect(toOrderBy(s)).toEqual([{ Column: 'FolderName', Direction: 'asc' }]);
  });

  it('ignores invalid values instead of sending them to the server', () => {
    const s = parseQuery({ t: 'abc', st: '99', s: '9,x,1', from: '1/1/2026', p: '-4', ps: '7', o: '-DROP TABLE' });
    expect(s.type).toBeNull();
    expect(s.searchType).toBe(1);
    expect(s.statuses).toEqual([1]);
    expect(s.from).toBeNull();
    expect(s.page).toBe(1);
    expect(s.size).toBe(20);
    expect(s.sort).toEqual({ column: 'UpdatedDate', dir: 'desc' });
  });

  it('counts active filters for the badge', () => {
    expect(activeFilterCount(parseQuery({ s: '1,2', sh: '1', from: '2026-01-01', ur: '1' }))).toBe(5);
    expect(activeFilterCount(parseQuery({ q: 'x', p: '2' }))).toBe(0);
  });
});
