import slugify from 'slugify';

export type GenerateUniqueSlugOptions = {
  title: string;
  findExisting: (baseSlug: string) => Promise<string[]>;
};

export async function generateUniqueSlug({
  title,
  findExisting,
}: GenerateUniqueSlugOptions): Promise<string> {
  const baseSlug =
    slugify(title, { lower: true, strict: true, trim: true }) || 'item';

  const existing = await findExisting(baseSlug);
  if (!existing.length) return baseSlug;

  const suffixRe = new RegExp(
    `^${baseSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`,
  );
  const suffixes = existing.map((slug) => {
    if (slug === baseSlug) return 0;
    const match = slug.match(suffixRe);
    return match ? Number(match[1]) : 0;
  });

  return `${baseSlug}-${Math.max(...suffixes) + 1}`;
}
