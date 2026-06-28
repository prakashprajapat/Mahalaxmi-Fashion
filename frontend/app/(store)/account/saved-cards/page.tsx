'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getCustomer } from '@/lib/auth';

export default function SavedCardsPage() {
  const router = useRouter();
  useEffect(() => { if (!getCustomer()) router.push('/account'); }, [router]);

  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">My Account</p>
        <h1>Saved Cards</h1>
        <p>Your saved payment methods.</p>
      </section>

      <main className="account-shell" style={{ display: 'block' }}>
        <section>
          <div className="form-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💳</div>
            <h2 style={{ color: '#555' }}>No Saved Cards Yet</h2>
            <p style={{ color: '#888', marginTop: '.5rem', fontSize: '.95rem' }}>
              Cards are saved automatically after a successful online payment. Shop with us and your payment method will appear here for faster checkout.
            </p>
            <Link href="/products" className="button primary" style={{ display: 'inline-block', marginTop: '1.5rem' }}>
              Browse Products
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
