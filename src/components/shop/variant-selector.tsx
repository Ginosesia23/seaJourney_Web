'use client';

import { useEffect, useState, useCallback } from 'react';
import { ShopifyProduct, ShopifyProductVariant } from '@/lib/shopify';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { VariantProps } from 'class-variance-authority';
import { buttonVariants } from '@/components/ui/button';

type ButtonSize = VariantProps<typeof buttonVariants>['size'];

export function VariantSelector({ 
  options, 
  variants, 
  onVariantChange,
  product,
  buttonSize = 'default'
}: { 
  options: ShopifyProduct['options'], 
  variants: ShopifyProductVariant[],
  onVariantChange: (variant: ShopifyProductVariant | null) => void,
  product: ShopifyProduct,
  buttonSize?: ButtonSize,
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
      // If no options, find first available, or just the first
      return variantsNodes.find(variant => variant.availableForSale) || variantsNodes[0] || null;
    }
    
    // Find variant that matches all selected options
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
  
  if (!options || options.every(o => o.name === 'Title' && o.values[0] === 'Default Title')) {
    const firstAvailableVariant = variants.find(v => v.availableForSale);
    if(firstAvailableVariant) {
      onVariantChange(firstAvailableVariant);
    } else if (variants.length > 0) {
      onVariantChange(variants[0]);
    }
    return null;
  };

  return (
    <div className="space-y-4">
      {options.map((option) => (
        <div key={option.id}>
          <h3 className="text-xs font-medium text-foreground">{option.name}</h3>
          <div className="flex flex-wrap gap-2 mt-2">
            {option.values.map((value) => {
              const isSelected = selectedOptions[option.name] === value;
              
              return (
                <Button
                  key={value}
                  variant={isSelected ? 'default' : 'outline'}
                  size={buttonSize}
                  onClick={() => handleOptionClick(option.name, value)}
                  className={cn(
                    "rounded-full h-auto min-h-8 px-3 py-1",
                    buttonSize === 'sm' && "min-h-7 px-2.5 py-0.5",
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
