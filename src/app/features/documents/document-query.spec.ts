import { describe, expect, it } from 'vitest';
import { parseDocumentQuery, toDocumentParams } from './document-query';

describe('document query', () => {
  it('leaves server defaults unset when the URL is empty', () => {
    const s = parseDocumentQuery({});
    expect(s).toMatchObject({ folder: null, q: '', searchType: null, period: null, page: 1, size: 20, sort: null });
  });

  it('reads folder, search, period, paging and sort', () => {
    const s = parseDocumentQuery({ f: '1.11.GroupOwned', q: '123', st: '1', pr: '0', from: '2026-01-01', to: '2026-02-01', p: '3', ps: '50', o: '-IssueDate' });
    expect(s).toEqual({
      folder: '1.11.GroupOwned', q: '123', searchType: 1, period: 0, from: '2026-01-01', to: '2026-02-01',
      page: 3, size: 50, sort: { Column: 'IssueDate', Direction: 'desc' },
    });
  });

  it('keeps period 0 (custom) apart from "no period"', () => {
    expect(parseDocumentQuery({ pr: '0' }).period).toBe(0);
    expect(parseDocumentQuery({ pr: 'x' }).period).toBeNull();
  });

  it('rejects bad values', () => {
    const s = parseDocumentQuery({ p: '-2', ps: '33', from: '1/1/2026', o: '-<script>' });
    expect(s).toMatchObject({ page: 1, size: 20, from: null, sort: null });
  });

  it('writes a short URL: defaults and dates without a custom period are dropped', () => {
    const p = toDocumentParams({
      folder: '3.0.Global', q: '', searchType: 9, period: 4, from: '2026-01-01', to: null, page: 1, size: 20,
      sort: { Column: 'Subject', Direction: 'asc' },
    });
    expect(p).toEqual({ f: '3.0.Global', q: null, st: 9, pr: 4, from: null, to: null, p: null, ps: null, o: 'Subject' });
  });
});
