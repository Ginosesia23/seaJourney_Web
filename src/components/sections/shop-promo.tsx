import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ShoppingBag } from 'lucide-react';

const ShopPromo = () => {
  return (
    <section id="shop-promo" className="bg-background text-foreground">
      <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <ShoppingBag className="mx-auto h-12 w-12 text-primary" />
          <h2 className="mt-4 font-headline text-3xl font-bold tracking-tight text-primary sm:text-4xl">
            Support SeaJourney
          </h2>
          <p className="mt-4 text-lg leading-8 text-foreground/80">
            Love the app? Check out our online store for branded merchandise and help support future development.
          </p>
          <div className="mt-10">
            <Button asChild size="lg" className="rounded-full text-white">
              <Link href="/shop">Visit the Shop</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ShopPromo;
