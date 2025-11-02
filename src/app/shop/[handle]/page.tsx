'use client';

import { useEffect, useState, useMemo, useCallback, use } from 'react';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { getProductByHandle, ShopifyProduct, ShopifyProductVariant } from '@/lib/shopify';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ShoppingCart, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { cn, formatCurrency } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useCart } from '@/context/cart-context';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

type ProductPageParams = {
  params: {
    handle: string;
  };
};

function VariantSelector({ 
  options, 
  variants, 
  onVariantChange,
  product
}: { 
  options: ShopifyProduct['options'], 
  variants: ShopifyProductVariant[],
  onVariantChange: (variant: ShopifyProductVariant | null) => void,
  product: ShopifyProduct
}) {
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});

  useEffect(() => {
    const initialSelection: Record<string, string> = {};
    if (options && options.length > 0) {
      options.forEach(option => {
        if (option.values.length > 0) {
          initialSelection[option.name] = option.values[0];
        }
      });
    }
    setSelectedOptions(initialSelection);
  }, [options]);
  
  const findVariant = useCallback(() => {
    if (!product || !product.variants) return null;
    const variantsNodes = product.variants.edges.map(e => e.node);

    if (Object.keys(selectedOptions).length === 0) {
      return variantsNodes.find(variant => variant.availableForSale) || variantsNodes[0] || null;
    }
    return variantsNodes.find(variant => 
      variant.selectedOptions.every(
        option => selectedOptions[option.name] === option.value
      )
    ) || null;
  }, [selectedOptions, product]);

  useEffect(() => {
    const variant = findVariant();
    onVariantChange(variant);
  }, [selectedOptions, findVariant, onVariantChange]);


  const handleOptionClick = (optionName: string, value: string) => {
    setSelectedOptions(prev => ({ ...prev, [optionName]: value }));
  };
  
  if (!options || options.length === 0) {
    const firstAvailableVariant = variants.find(v => v.availableForSale);
    if(firstAvailableVariant) {
      onVariantChange(firstAvailableVariant);
    } else if (variants.length > 0) {
      onVariantChange(variants[0]);
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {options.map((option) => (
        <div key={option.id}>
          <h3 className="text-sm font-medium text-foreground">{option.name}</h3>
          <div className="flex flex-wrap gap-2 mt-2">
            {option.values.map((value) => {
              const isSelected = selectedOptions[option.name] === value;
              
              return (
                <Button
                  key={value}
                  variant={isSelected ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleOptionClick(option.name, value)}
                  className={cn(
                    "rounded-full",
                    isSelected && "ring-2 ring-primary ring-offset-2",
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

const ProductDetailsAccordion = ({ description }: { description: string }) => {
  const details = useMemo(() => {
    if (!description) return {};

    const detailsMap: Record<string, string> = {};
    const regex = /(?<key>[A-Z][a-z\s]+):(?<value>.*?)(?=(?:[A-Z][a-z\s]+:)|$)/g;
    
    // Custom logic to handle the description string
    const parts = description.split(/(?=[A-Z][a-zA-Z\s]+:)/).filter(p => p.trim());

    parts.forEach(part => {
      const [key, ...valueParts] = part.split(':');
      if (key && valueParts.length > 0) {
        detailsMap[key.trim()] = valueParts.join(':').trim();
      }
    });

    return {
      details: {
        "Item Number": detailsMap["Item Number"],
        "Gender": detailsMap["Gender"],
        "Model": detailsMap["Model"],
        "Print Size": detailsMap["Print Size"],
      },
      fabric: {
        "Fabric": detailsMap["Fabric"],
        "Fabric Weight": detailsMap["Fabric Weight"],
        "Fabric Thickness": detailsMap["Fabric Thickness"],
        "Fabric Strench": detailsMap["Fabric Strench"], // Typo from source
        "Care Instructions": detailsMap["Care Instructions"],
      },
      features: {
        "Features": detailsMap["Features"],
      },
      notes: {
        "Notes": detailsMap["Notes"]
      }
    };
  }, [description]);
  
  if (Object.keys(details).length === 0) {
    return <div
      className="prose prose-sm mt-8 max-w-none text-foreground/80"
      dangerouslySetInnerHTML={{ __html: description }}
    />;
  }

  return (
    <Accordion type="single" collapsible className="w-full mt-8" defaultValue="item-0">
        {details.details && (
             <AccordionItem value="item-0">
                <AccordionTrigger className="font-bold">Details</AccordionTrigger>
                <AccordionContent>
                    <ul className="list-disc pl-5 space-y-1 text-sm text-foreground/80">
                        {Object.entries(details.details).map(([key, value]) => value && <li key={key}><strong>{key}:</strong> {value}</li>)}
                    </ul>
                </AccordionContent>
            </AccordionItem>
        )}
        {details.fabric && (
             <AccordionItem value="item-1">
                <AccordionTrigger className="font-bold">Fabric & Care</AccordionTrigger>
                <AccordionContent>
                    <ul className="list-disc pl-5 space-y-1 text-sm text-foreground/80">
                         {Object.entries(details.fabric).map(([key, value]) => value && <li key={key}><strong>{key}:</strong> {value}</li>)}
                    </ul>
                </AccordionContent>
            </AccordionItem>
        )}
        {details.features && (
             <AccordionItem value="item-2">
                <AccordionTrigger className="font-bold">Features</AccordionTrigger>
                <AccordionContent>
                    <p className="text-sm text-foreground/80">{details.features.Features}</p>
                </AccordionContent>
            </AccordionItem>
        )}
         {details.notes && (
             <AccordionItem value="item-3">
                <AccordionTrigger className="font-bold">Notes</AccordionTrigger>
                <AccordionContent>
                    <p className="text-sm text-foreground/80">{details.notes.Notes}</p>
                </AccordionContent>
            </AccordionItem>
        )}
    </Accordion>
  )
}

export default function ProductPage({ params }: ProductPageParams) {
  const { handle } = params;
  const [product, setProduct] = useState<ShopifyProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedVariant, setSelectedVariant] = useState<ShopifyProductVariant | null>(null);
  const [mainImage, setMainImage] = useState<{url: string, altText: string | null} | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const { addToCart } = useCart();
  
  useEffect(() => {
    const fetchProduct = async () => {
      setLoading(true);
      const fetchedProduct = await getProductByHandle(handle);
      if (!fetchedProduct) {
        notFound();
      }
      setProduct(fetchedProduct);
      if (fetchedProduct.images.edges[0]) {
        setMainImage(fetchedProduct.images.edges[0].node);
      }
      
      const firstAvailableVariant = fetchedProduct.variants.edges.map(e => e.node).find(v => v.availableForSale);
      if (firstAvailableVariant) {
        setSelectedVariant(firstAvailableVariant);
        if (firstAvailableVariant.image) {
          setMainImage(firstAvailableVariant.image);
        }
      } else if (fetchedProduct.variants.edges.length > 0) {
        const firstVariant = fetchedProduct.variants.edges[0].node;
        setSelectedVariant(firstVariant);
         if (firstVariant.image) {
          setMainImage(firstVariant.image);
        }
      }

      setLoading(false);
    };
    fetchProduct();
  }, [handle]);
  
  const handleVariantChange = useCallback((variant: ShopifyProductVariant | null) => {
    setSelectedVariant(variant);
    if (variant?.image) {
      setMainImage(variant.image);
    }
  }, []);

  const handleAddToCart = () => {
    if (selectedVariant) {
      setIsAdding(true);
      addToCart({
        variantId: selectedVariant.id,
        quantity: 1,
        title: product!.title,
        price: selectedVariant.price.amount,
        currencyCode: selectedVariant.price.currencyCode,
        image: mainImage?.url || '',
        variantTitle: selectedVariant.title
      });
      setTimeout(() => setIsAdding(false), 1000); 
    }
  };
  
  const images = useMemo(() => product?.images.edges.map(edge => edge.node) || [], [product]);
  const variants = useMemo(() => product?.variants.edges.map(edge => edge.node) || [], [product]);

  if (loading) {
    return <ProductPageSkeleton />;
  }

  if (!product) {
    return null; 
  }
  
  const price = selectedVariant?.price.amount || product.priceRange.minVariantPrice.amount;
  const currencyCode = selectedVariant?.price.currencyCode || product.priceRange.minVariantPrice.currencyCode;
  const formattedPrice = formatCurrency(price, currencyCode);
  const isSoldOut = selectedVariant ? !selectedVariant.availableForSale : product.variants.edges.every(e => !e.node.availableForSale);

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

            <div className="flex flex-col">
              <h1 className="font-headline text-3xl font-bold tracking-tight text-primary sm:text-4xl">
                {product.title}
              </h1>
              <p className="mt-3 text-3xl font-bold text-foreground">
                {formattedPrice}
              </p>
              
              <div className="mt-6">
                <VariantSelector 
                  options={product.options} 
                  variants={variants} 
                  onVariantChange={handleVariantChange}
                  product={product}
                />
              </div>
              
              <div className="mt-10">
                <Button 
                  size="lg" 
                  className="w-full sm:w-auto bg-accent hover:bg-accent/90 text-accent-foreground"
                  disabled={isSoldOut || isAdding}
                  onClick={handleAddToCart}
                >
                  {isAdding ? (
                     <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Adding...</>
                  ) : (
                     <><ShoppingCart className="mr-2 h-5 w-5" /> {isSoldOut ? 'Sold Out' : 'Add to Cart'}</>
                  )}
                </Button>
              </div>

             <ProductDetailsAccordion description={product.descriptionHtml.replace(/<[^>]*>/g, '') || product.description} />
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

    