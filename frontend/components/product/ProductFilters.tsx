'use client';
import { useRouter, useSearchParams } from 'next/navigation';

const categories = ['saree', 'nighty', 'petticoat', 'women', 'men', 'popline'];

export default function ProductFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get('category') ?? '';

  const navigate = (category: string) => {
    const url = category ? `/products?category=${category}` : '/products';
    router.push(url);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <h3 className="font-semibold text-sm text-gray-700 mb-3">Categories</h3>
      <ul className="space-y-1">
        <li>
          <button onClick={() => navigate('')}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
              !current ? 'bg-[#8B1A1A] text-white' : 'hover:bg-gray-50 text-gray-600'}`}>
            All Products
          </button>
        </li>
        {categories.map(c => (
          <li key={c}>
            <button onClick={() => navigate(c)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm capitalize transition-colors ${
                current === c ? 'bg-[#8B1A1A] text-white' : 'hover:bg-gray-50 text-gray-600'}`}>
              {c}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
