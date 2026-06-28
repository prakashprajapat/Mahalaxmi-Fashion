import Link from 'next/link';

const categories = [
  { name: 'Sarees', emoji: '🪭', href: '/products?category=saree', color: 'bg-rose-50' },
  { name: 'Nighty', emoji: '🌙', href: '/products?category=nighty', color: 'bg-indigo-50' },
  { name: 'Petticoat', emoji: '👘', href: '/products?category=petticoat', color: 'bg-pink-50' },
  { name: 'Women', emoji: '👗', href: '/products?category=women', color: 'bg-purple-50' },
  { name: 'Men', emoji: '👔', href: '/products?category=men', color: 'bg-blue-50' },
  { name: 'Popline', emoji: '🎀', href: '/products?category=popline', color: 'bg-yellow-50' },
];

export default function CategoryGrid() {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
      {categories.map(c => (
        <Link key={c.href} href={c.href}
          className={`${c.color} rounded-2xl p-4 text-center hover:shadow-md transition-shadow group`}>
          <div className="text-4xl mb-2 group-hover:scale-110 transition-transform">{c.emoji}</div>
          <p className="text-sm font-medium text-gray-700">{c.name}</p>
        </Link>
      ))}
    </div>
  );
}
