'use client';

import { useEffect, useState, useMemo } from 'react';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { getProductByHandle, ShopifyProduct, ShopifyProductVariant } from '@/lib/shopify';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

type ProductPageParams = {
  params: {
    handle: string;
  };
};

function VariantSelector({ 
  options, 
  variants, 
  onVariantChange 
}: { 
  options: ShopifyProduct['options'], 
  variants: ShopifyProductVariant[],
  onVariantChange: (variant: ShopifyProductVariant | null) => void
}) {
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});

  useEffect(() => {
    // Pre-select the first available option for each category
    const initialSelection: Record<string, string> = {};
    options.forEach(option => {
      initialSelection[option.name] = option.values[0];
    });
    setSelectedOptions(initialSelection);
  }, [options]);

  useEffect(() => {
    const findVariant = () => {
      return variants.find(variant => 
        variant.selectedOptions.every(
          option => selectedOptions[option.name] === option.value
        )
      ) || null;
    };
    onVariantChange(findVariant());
  }, [selectedOptions, variants, onVariantChange]);

  const handleOptionClick = (optionName: string, value: string) => {
    setSelectedOptions(prev => ({ ...prev, [optionName]: value }));
  };

  const isOptionAvailable = (optionName: string, value: string) => {
    // Check if any variant is available with the current selection plus this new option
    const prospectiveOptions = { ...selectedOptions, [optionName]: value };
    return variants.some(variant => 
      variant.availableForSale &&
      variant.selectedOptions.every(
        opt => prospectiveOptions[opt.name] === opt.value
      )
    );
  };
  
  if (!options || options.length === 0) return null;

  return (
    <div className="space-y-6">
      {options.map((option) => (
        <div key={option.id}>
          <h3 className="text-sm font-medium text-foreground">{option.name}</h3>
          <div className="flex flex-wrap gap-2 mt-2">
            {option.values.map((value) => {
              const isSelected = selectedOptions[option.name] === value;
              const isAvailable = isOptionAvailable(option.name, value);

              return (
                <Button
                  key={value}
                  variant={isSelected ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleOptionClick(option.name, value)}
                  disabled={!isAvailable}
                  className={cn(
                    "rounded-full",
                    isSelected && "ring-2 ring-primary ring-offset-2",
                    !isAvailable && "text-muted-foreground line-through"
                  )}
                >
                  {value}
                </Button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}


export default function ProductPage({ params }: ProductPageParams) {
  const [product, setProduct] = useState<ShopifyProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedVariant, setSelectedVariant] = useState<ShopifyProductVariant | null>(null);
  const [mainImage, setMainImage] = useState<{url: string, altText: string | null} | null>(null);
  
  useEffect(() => {
    const fetchProduct = async () => {
      setLoading(true);
      const fetchedProduct = await getProductByHandle(params.handle);
      if (!fetchedProduct) {
        notFound();
      }
      setProduct(fetchedProduct);
      if (fetchedProduct.images.edges[0]) {
        setMainImage(fetchedProduct.images.edges[0].node);
      }
      setLoading(false);
    };
    fetchProduct();
  }, [params.handle]);

  const images = useMemo(() => product?.images.edges.map(edge => edge.node) || [], [product]);
  const variants = useMemo(() => product?.variants.edges.map(edge => edge.node) || [], [product]);

  if (loading) {
    return <ProductPageSkeleton />;
  }

  if (!product) {
    return null; // notFound() is called in useEffect
  }
  
  const price = selectedVariant?.price.amount || product.priceRange.minVariantPrice.amount;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1 py-12 sm:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <Button asChild variant="outline" size="sm" className="text-sm">
              <Link href="/shop">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Shop
              </Link>
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-16">
            {/* Image Gallery */}
            <div className="space-y-4">
              <div className="aspect-square w-full overflow-hidden rounded-xl border">
                 {mainImage ? (
                    <Image
                      src={mainImage.url}
                      alt={mainImage.altText || product.title}
                      width={600}
                      height={600}
                      className="h-full w-full object-cover"
                      priority
                    />
                  ) : (
                    <div className="h-full w-full bg-muted"></div>
                  )}
              </div>
              <div className="grid grid-cols-5 gap-2">
                {images.map((image, index) => (
                  <button 
                    key={index}
                    onClick={() => setMainImage(image)}
                    className={cn(
                      "aspect-square w-full overflow-hidden rounded-lg border-2",
                      mainImage?.url === image.url ? "border-primary" : "border-transparent"
                    )}
                  >
                    <Image
                      src={image.url}
                      alt={image.altText || `Thumbnail ${index + 1}`}
                      width={100}
                      height={100}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Product Info */}
            <div className="flex flex-col">
              <h1 className="font-headline text-3xl font-bold tracking-tight text-primary sm:text-4xl">
                {product.title}
              </h1>
              <p className="mt-3 text-3xl font-bold text-foreground">
                ${price}
              </p>
              
              <div className="mt-6">
                <VariantSelector options={product.options} variants={variants} onVariantChange={setSelectedVariant} />
              </div>
              
              <div className="mt-10">
                <Button 
                  size="lg" 
                  className="w-full sm:w-auto bg-accent hover:bg-accent/90 text-accent-foreground"
                  disabled={!selectedVariant?.availableForSale}
                >
                  <ShoppingCart className="mr-2 h-5 w-5" />
                  {selectedVariant?.availableForSale ? 'Add to Cart' : 'Sold Out'}
                </Button>
              </div>

              <div
                className="prose prose-lg mt-8 text-foreground/80 max-w-none"
                dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
              />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function ProductPageSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1 py-12 sm:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <Skeleton className="h-9 w-32" />
          </div>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-16">
            <div className="space-y-4">
              <Skeleton className="aspect-square w-full rounded-xl" />
              <div className="grid grid-cols-5 gap-2">
                <Skeleton className="aspect-square w-full rounded-lg" />
                <Skeleton className="aspect-square w-full rounded-lg" />
                <Skeleton className="aspect-square w-full rounded-lg" />
              </div>
            </div>
            <div className="space-y-6">
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-8 w-1/4" />
              <div className="space-y-4">
                <Skeleton className="h-6 w-16" />
                <div className="flex gap-2">
                  <Skeleton className="h-10 w-16 rounded-full" />
                  <Skeleton className="h-10 w-16 rounded-full" />
                  <Skeleton className="h-10 w-16 rounded-full" />
                </div>
              </div>
              <Skeleton className="h-12 w-full sm:w-48" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
