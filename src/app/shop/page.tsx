import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Card, CardContent } from '@/components/ui/card';
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';

const products = [
  {
    id: 'product-tshirt',
    name: 'SeaJourney Tee',
    price: '$25.00',
  },
  {
    id: 'product-hat',
    name: 'SeaJourney Cap',
    price: '$20.00',
  },
  {
    id: 'product-mug',
    name: 'SeaJourney Mug',
    price: '$15.00',
  },
  {
    id: 'product-hoodie',
    name: 'SeaJourney Hoodie',
    price: '$45.00',
  },
];

export default function ShopPage() {
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
              {products.map((product) => {
                const image = PlaceHolderImages.find(p => p.id === product.id);
                return (
                  <Card key={product.name} className="overflow-hidden transition-shadow duration-300 hover:shadow-xl">
                    {image && (
                       <Image
                        src={image.imageUrl}
                        alt={product.name}
                        width={600}
                        height={400}
                        className="h-48 w-full object-cover"
                        data-ai-hint={image.imageHint}
                      />
                    )}
                    <CardContent className="p-4">
                      <h3 className="font-headline text-lg font-bold">{product.name}</h3>
                      <p className="mt-2 text-base text-foreground/80">{product.price}</p>
                    </CardContent>
                  </Card>
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
