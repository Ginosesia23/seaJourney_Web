import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Card, CardContent } from '@/components/ui/card';
import Image from 'next/image';
import { getProducts, ShopifyProduct } from '@/lib/shopify';
import Link from 'next/link';

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

            <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-8 sm:grid-cols-2 lg:max-w-none lg:grid-cols-4">
              {products.map((product: ShopifyProduct) => {
                const image = product.images.edges[0]?.node;
                return (
                  <Link href={`https://${process.env.SHOPIFY_STORE_DOMAIN}/products/${product.handle}`} target="_blank" rel="noopener noreferrer" key={product.id}>
                    <Card className="overflow-hidden transition-shadow duration-300 hover:shadow-xl h-full">
                      {image && (
                         <Image
                          src={image.url}
                          alt={product.title}
                          width={600}
                          height={400}
                          className="h-48 w-full object-cover"
                        />
                      )}
                      <CardContent className="p-4">
                        <h3 className="font-headline text-lg font-bold">{product.title}</h3>
                        <p className="mt-2 text-base text-foreground/80">
                          ${product.priceRange.minVariantPrice.amount}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
