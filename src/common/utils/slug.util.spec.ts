import { generateUniqueSlug } from './slug.util';

describe('generateUniqueSlug', () => {
  it('slugifies and returns the base when free', async () => {
    const slug = await generateUniqueSlug({
      title: '  Delta Swim  ',
      findExisting: async () => [],
    });
    expect(slug).toBe('delta-swim');
  });

  it('suffixes the next free number', async () => {
    const slug = await generateUniqueSlug({
      title: 'delta-swim',
      findExisting: async () => ['delta-swim', 'delta-swim-1'],
    });
    expect(slug).toBe('delta-swim-2');
  });
});
