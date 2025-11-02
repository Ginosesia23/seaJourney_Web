import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { getProductByHandle } from '@/lib/shopify';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ShoppingCart } from 'lucide-react';
import Link from 'next/link';

type ProductPageParams = {
  params: {
    handle: string;
  };
};

export default async function ProductPage({ params }: ProductPageParams) {
  const product = await getProductByHandle(params.handle);

  if (!product) {
    notFound();
  }

  const mainImage = product.images.edges[0]?.node;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1 py-12 sm:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <Button asChild variant="outline" className="text-sm">
              <Link href="/shop">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Shop
              </Link>
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
            <div className="flex justify-center">
              {mainImage && (
                <Image
                  src={mainImage.url}
                  alt={mainImage.altText || product.title}
                  width={600}
                  height={600}
                  className="rounded-xl shadow-xl object-cover aspect-square"
                />
              )}
            </div>
            <div className="flex flex-col justify-center">
              <h1 className="font-headline text-4xl font-bold tracking-tight text-primary sm:text-5xl">
                {product.title}
              </h1>
              <p className="mt-4 text-3xl font-bold text-foreground">
                ${product.priceRange.minVariantPrice.amount}
              </p>
              <div
                className="prose prose-lg mt-6 text-foreground/80 max-w-none"
                dangerouslySetInnerHTML={{ __html: product.description }}
              />
              <div className="mt-10">
                <Button size="lg" className="w-full sm:w-auto bg-accent hover:bg-accent/90 text-accent-foreground">
                  <ShoppingCart className="mr-2 h-5 w-5" />
                  Add to Cart
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
