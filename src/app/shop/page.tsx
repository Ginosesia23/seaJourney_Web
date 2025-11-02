'use client';

import { useState, useEffect, useMemo } from 'react';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import Image from 'next/image';
import { getProducts, ShopifyProduct } from '@/lib/shopify';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

function ProductCard({ product }: { product: ShopifyProduct }) {
  const image = product.images.edges[0]?.node;
  return (
    <Card className="group flex flex-col overflow-hidden transition-shadow duration-300 hover:shadow-xl">
      <Link href={`/shop/${product.handle}`} className="flex flex-col h-full">
        <div className="relative w-full aspect-square overflow-hidden bg-gray-200">
          {image && (
            <Image
              src={image.url}
              alt={image.altText || product.title}
              fill
              className="h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
            />
          )}
        </div>
        <CardContent className="flex flex-col flex-grow p-4">
          <h3 className="font-headline text-lg font-bold flex-grow">{product.title}</h3>
          <p className="mt-2 text-base font-semibold text-primary">
            ${product.priceRange.minVariantPrice.amount}
          </p>
        </CardContent>
        <CardFooter className="p-4 pt-0 mt-auto">
          <Button asChild className="w-full bg-accent hover:bg-accent/90 text-accent-foreground rounded-lg">
            <div>
              View Product
              <ArrowRight className="ml-2 h-4 w-4" />
            </div>
          </Button>
        </CardFooter>
      </Link>
    </Card>
  );
}

function ProductGridSkeleton() {
    return (
        <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-8 sm:grid-cols-2 lg:max-w-none lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
                <Card key={i}>
                    <Skeleton className="w-full aspect-square" />
                    <CardContent className="p-4">
                        <Skeleton className="h-6 w-3/4 mb-2" />
                        <Skeleton className="h-5 w-1/4" />
                    </CardContent>
                    <CardFooter className="p-4 pt-0">
                        <Skeleton className="h-10 w-full" />
                    </CardFooter>
                </Card>
            ))}
        </div>
    );
}


export default function ShopPage() {
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('All');

  useEffect(() => {
    async function fetchProducts() {
      setLoading(true);
      const fetchedProducts = await getProducts();
      setProducts(fetchedProducts || []);
      setLoading(false);
    }
    fetchProducts();
  }, []);

  const categories = useMemo(() => {
    const tags = new Set<string>();
    products.forEach(p => p.tags.forEach(tag => tags.add(tag)));
    return ['All', ...Array.from(tags)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (selectedCategory === 'All') {
      return products;
    }
    return products.filter(p => p.tags.includes(selectedCategory));
  }, [products, selectedCategory]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <section className="py-16 sm:py-24">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h1 className="font-headline text-4xl font-bold tracking-tight text-primary sm:text-5xl">
                SeaJourney Store
              </h1>
              <p className="mt-4 text-lg leading-8 text-foreground/80">
                Support the development of SeaJourney by purchasing our branded merchandise.
              </p>
            </div>
            
            {!loading && categories.length > 1 && (
                <div className="mt-12 flex justify-center flex-wrap gap-2">
                    {categories.map(category => (
                        <Button
                            key={category}
                            variant={selectedCategory === category ? "default" : "outline"}
                            onClick={() => setSelectedCategory(category)}
                            className={cn("rounded-full", selectedCategory === category && "bg-accent text-accent-foreground hover:bg-accent/90")}
                        >
                            {category}
                        </Button>
                    ))}
                </div>
            )}


            {loading ? (
                <ProductGridSkeleton />
            ) : products && products.length > 0 ? (
              <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-8 sm:grid-cols-2 lg:max-w-none lg:grid-cols-4">
                {filteredProducts.map((product: ShopifyProduct) => (
                    <ProductCard key={product.id} product={product} />
                ))}
              </div>
            ) : (
              <div className="mt-16 text-center">
                <p>Could not load products. Please check the Shopify configuration in src/lib/shopify-config.ts.</p>
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
