export const SCHEME_CATEGORIES = [
  'Комбінаційні схеми',
  'Тригери та лічильники',
  'ІМС та генератори',
  'Мікропроцесорні вузли',
  'Користувацькі проєкти',
] as const;

export function getSchemeCategoryOptions(currentCategory?: string) {
  const categories = currentCategory
    ? Array.from(new Set([...SCHEME_CATEGORIES, currentCategory]))
    : [...SCHEME_CATEGORIES];
  return categories.map((cat) => ({ value: cat, label: cat }));
}
