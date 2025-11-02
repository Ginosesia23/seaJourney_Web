import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import Image from 'next/image';
import { getProducts, ShopifyProduct } from '@/lib/shopify';
import Link from 'next/link';
import { shopifyConfig } from '@/lib/shopify-config';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

export default async function ShopPage() {
  const products = await getProducts();

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

            {products && products.length > 0 ? (
              <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-8 sm:grid-cols-2 lg:max-w-none lg:grid-cols-4">
                {products.map((product: ShopifyProduct) => {
                  const image = product.images.edges[0]?.node;
                  return (
                    <Card key={product.id} className="flex flex-col overflow-hidden transition-shadow duration-300 hover:shadow-xl">
                      {image && (
                         <div className="aspect-h-1 aspect-w-1 w-full overflow-hidden bg-gray-200">
                           <Image
                            src={image.url}
                            alt={image.altText || product.title}
                            fill
                            className="h-full w-full object-cover object-center group-hover:opacity-75"
                          />
                         </div>
                      )}
                      <CardContent className="flex flex-col flex-grow p-4">
                        <h3 className="font-headline text-lg font-bold flex-grow">{product.title}</h3>
                        <p className="mt-2 text-base font-semibold text-primary">
                          ${product.priceRange.minVariantPrice.amount}
                        </p>
                      </CardContent>
                      <CardFooter className="p-4 pt-0">
                         <Button asChild className="w-full bg-accent hover:bg-accent/90 text-accent-foreground rounded-lg">
                           <Link href={`https://${shopifyConfig.storeDomain}/products/${product.handle}`} target="_blank" rel="noopener noreferrer">
                              View Product
                              <ArrowRight className="ml-2 h-4 w-4" />
                           </Link>
                         </Button>
                      </CardFooter>
                    </Card>
                  )
                })}
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
