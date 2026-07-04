'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ordersApi, customersApi, productsApi } from '@/lib/api';
import { getAdminToken } from '@/lib/auth';

interface Stats {
  totalOrders: number;
  totalRevenue: number;
  totalCustomers: number;
  totalProducts: number;
  pendingOrders: number;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentOrders, setRecentOrders] = useState<import('@/types').Order[]>([]);

  useEffect(() => {
    const token = getAdminToken() ?? '';
    Promise.all([
      ordersApi.getAll(undefined, token),
      customersApi.getAll(token),
      productsApi.getAll({ pageSize: 1 }),
    ]).then(([ordersRes, customersRes, productsRes]) => {
      const orders = ordersRes.orders;
      setStats({
        totalOrders: orders.length,
        totalRevenue: orders.reduce((s, o) => s + o.total, 0),
        totalCustomers: customersRes.total,
        totalProducts: productsRes.total,
        pendingOrders: orders.filter(o => ['Order Received', 'Pending', 'Order Packed'].includes(o.status)).length,
      });
      setRecentOrders(orders.slice(0, 10));
    }).catch(console.error);
  }, []);

  const cards = stats ? [
    { label: 'Total Orders', value: stats.totalOrders, icon: '📦', color: 'bg-blue-50 text-blue-700', href: '/admin/orders' },
    { label: 'Total Revenue', value: `₹${stats.totalRevenue.toLocaleString('en-IN')}`, icon: '💰', color: 'bg-green-50 text-green-700', href: '/admin/reports' },
    { label: 'Customers', value: stats.totalCustomers, icon: '👥', color: 'bg-purple-50 text-purple-700', href: '/admin/customers' },
    { label: 'Products', value: stats.totalProducts, icon: '👗', color: 'bg-orange-50 text-orange-700', href: '/admin/products' },
    { label: 'Pending Orders', value: stats.pendingOrders, icon: '⏳', color: 'bg-yellow-50 text-yellow-700', href: '/admin/orders' },
  ] : [];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 text-gray-800">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {stats ? cards.map(c => (
          <Link key={c.label} href={c.href}
            className={`rounded-xl p-4 block transition hover:shadow-md hover:-translate-y-0.5 cursor-pointer ${c.color.split(' ')[0]}`}>
            <p className="text-2xl mb-1">{c.icon}</p>
            <p className={`text-xl font-bold ${c.color.split(' ')[1]}`}>{c.value}</p>
            <p className="text-xs text-gray-500">{c.label}</p>
          </Link>
        )) : [...Array(5)].map((_, i) => (
          <div key={i} className="bg-gray-100 rounded-xl p-4 animate-pulse h-24" />
        ))}
      </div>

      {/* Recent Orders */}
      <div className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="font-bold mb-4 text-gray-700">Recent Orders</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b">
                <th className="pb-2 pr-4">Order ID</th>
                <th className="pb-2 pr-4">Customer</th>
                <th className="pb-2 pr-4">Amount</th>
                <th className="pb-2 pr-4">Method</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {recentOrders.map(o => (
                <tr key={o.id} onClick={() => router.push('/admin/orders')}
                  className="cursor-pointer hover:bg-gray-50">
                  <td className="py-2 pr-4 font-mono text-xs">{o.id}</td>
                  <td className="py-2 pr-4">{o.customerName || '—'}</td>
                  <td className="py-2 pr-4 font-medium">₹{o.total.toLocaleString('en-IN')}</td>
                  <td className="py-2 pr-4 capitalize">{o.method}</td>
                  <td className="py-2">
                    <span className={`badge ${
                      o.status === 'Delivered' ? 'bg-green-100 text-green-700' :
                      o.status === 'Cancelled' ? 'bg-red-100 text-red-600' :
                      'bg-yellow-100 text-yellow-700'}`}>
                      {o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
