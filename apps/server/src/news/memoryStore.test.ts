import { describe, expect, it } from 'vitest';
import { encodeNewsCursor } from './cursor.js';
import { MemoryNewsStore } from './memoryStore.js';
import { NewsDuplicateError, type NewsDocument } from './types.js';

function doc(
  partial: Partial<NewsDocument> & Pick<NewsDocument, 'id' | 'sortAt' | 'status'>,
): NewsDocument {
  const createdAt = partial.createdAt ?? partial.sortAt;
  return {
    sourceUrl: 'https://example.com/a',
    normalizedUrl: `https://example.com/${partial.id}`,
    title: 'Title',
    summary: 'Summary text at least twenty chars.',
    publisher: 'Pub',
    sourceDomain: 'example.com',
    tags: [],
    createdAt,
    updatedAt: createdAt,
    ...partial,
  };
}

describe('MemoryNewsStore', () => {
  it('sorts published items by sortAt desc then id desc', async () => {
    const t1 = new Date('2024-01-02T00:00:00Z');
    const t2 = new Date('2024-01-03T00:00:00Z');
    const store = new MemoryNewsStore([
      doc({ id: 'a', sortAt: t1, status: 'published' }),
      doc({ id: 'b', sortAt: t2, status: 'published' }),
      doc({ id: 'c', sortAt: t2, status: 'published' }),
    ]);

    const { items } = await store.list({ limit: 10 });
    expect(items.map((i) => i.id)).toEqual(['c', 'b', 'a']);
  });

  it('paginates with cursors without gaps or duplicates', async () => {
    const base = new Date('2024-06-01T00:00:00Z');
    const seed = Array.from({ length: 5 }, (_, i) =>
      doc({
        id: `id-${i}`,
        sortAt: new Date(base.getTime() - i * 86_400_000),
        status: 'published',
      }),
    );
    const store = new MemoryNewsStore(seed);

    const page1 = await store.list({ limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await store.list({ limit: 2, cursor: page1.nextCursor! });
    expect(page2.items).toHaveLength(2);

    const page3 = await store.list({ limit: 2, cursor: page2.nextCursor! });
    expect(page3.items).toHaveLength(1);
    expect(page3.nextCursor).toBeNull();

    const ids = [...page1.items, ...page2.items, ...page3.items].map((x) => x.id);
    expect(new Set(ids).size).toBe(5);
  });

  it('throws duplicate error on normalizedUrl collision', async () => {
    const store = new MemoryNewsStore();
    await store.create({
      sourceUrl: 'https://ex.com/a?utm=1',
      normalizedUrl: 'https://ex.com/a',
      sourceDomain: 'ex.com',
      title: '',
      summary: '',
      publisher: '',
      tags: [],
      status: 'draft',
    });

    await expect(
      store.create({
        sourceUrl: 'https://ex.com/a',
        normalizedUrl: 'https://ex.com/a',
        sourceDomain: 'ex.com',
        title: '',
        summary: '',
        publisher: '',
        tags: [],
        status: 'draft',
      }),
    ).rejects.toBeInstanceOf(NewsDuplicateError);
  });

  it('rejects invalid cursor via list', async () => {
    const store = new MemoryNewsStore([doc({ id: 'x', sortAt: new Date(), status: 'published' })]);
    await expect(store.list({ limit: 1, cursor: 'not-valid' })).rejects.toMatchObject({
      code: 'invalid_cursor',
    });
  });

  it('encodes cursor from last item sortAt and id', () => {
    const sortAt = new Date('2024-01-01T00:00:00.000Z');
    const cursor = encodeNewsCursor(sortAt, 'abc');
    expect(cursor.length).toBeGreaterThan(10);
  });
});
