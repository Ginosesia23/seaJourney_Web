
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ShoppingBag } from 'lucide-react';

const ShopPromo = () => {
  return (
    <section id="shop-promo" className="border-r border-white/10 md:border-y-0 border-y border-white/10" style={{ backgroundColor: '#000b15' }}>
      <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8 h-full flex items-center">
        <div className="mx-auto max-w-2xl text-center w-full">
          <ShoppingBag className="mx-auto h-12 w-12 text-blue-400" />
          <h2 className="mt-4 font-headline text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Support SeaJourney
          </h2>
          <p className="mt-4 text-lg leading-8 text-blue-100">
            Love the app? Check out our online store for branded merchandise and help support future development.
          </p>
          <div className="mt-10">
            <Button asChild size="lg" className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg px-8">
              <Link href="/shop">Visit the Shop</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ShopPromo;

    