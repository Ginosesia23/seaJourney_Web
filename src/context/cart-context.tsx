
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createCheckout, updateLineItems, CartItem, ShopifyCheckout, getCheckout } from '@/lib/shopify';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';

interface CartContextType {
  cart: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (variantId: string) => void;
  updateCartItemQuantity: (variantId: string, quantity: number) => void;
  getCartTotal: () => string;
  checkout: () => void;
  isCheckingOut: boolean;
  checkoutUrl: string | null;
  isCartReady: boolean;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isCartReady, setIsCartReady] = useState(false);
  const { toast } = useToast();

  const updateLocalStorage = (cart: CartItem[], checkoutId: string | null) => {
    try {
      localStorage.setItem('cart', JSON.stringify(cart));
      if (checkoutId) {
        localStorage.setItem('checkoutId', checkoutId);
      } else {
        localStorage.removeItem('checkoutId');
      }
    } catch (e) {
      console.error("Failed to update local storage", e);
    }
  };

  useEffect(() => {
    const initializeCheckout = async () => {
      const storedCart = localStorage.getItem('cart');
      const storedCheckoutId = localStorage.getItem('checkoutId');

      if (storedCart) {
        try {
          setCart(JSON.parse(storedCart));
        } catch(e) {
            console.error("Failed to parse cart from local storage", e);
            setCart([]);
        }
      }

      if (storedCheckoutId) {
        try {
          const existingCheckout = await getCheckout(storedCheckoutId);
          if (existingCheckout && existingCheckout.id && !existingCheckout.completedAt) {
            setCheckoutId(existingCheckout.id);
            setCheckoutUrl(existingCheckout.webUrl);
            
            // Sync cart from Shopify
            const newCart = existingCheckout.lineItems.edges.map(edge => {
              const node = edge.node;
              return {
                  variantId: node.variant.id,
                  quantity: node.quantity,
                  title: node.title,
                  price: node.variant.price.amount,
                  currencyCode: node.variant.price.currencyCode,
                  image: node.variant.image.url,
                  variantTitle: node.variant.title,
              };
            });
            setCart(newCart);
            updateLocalStorage(newCart, existingCheckout.id);

          } else {
            // Checkout is completed or invalid, clear it
            localStorage.removeItem('checkoutId');
            localStorage.removeItem('cart');
            setCart([]);
            setCheckoutId(null);
            setCheckoutUrl(null);
          }
        } catch (error) {
           console.error("Failed to fetch existing checkout:", error);
           localStorage.removeItem('checkoutId');
           localStorage.removeItem('cart');
           setCart([]);
        }
      }
      setIsCartReady(true);
    };

    initializeCheckout();
  }, []);
  
  const handleCheckoutUpdate = useCallback((checkout: ShopifyCheckout | null) => {
    if (checkout && checkout.id) {
        setCheckoutId(checkout.id);
        setCheckoutUrl(checkout.webUrl);
        const newCart = checkout.lineItems.edges.map(edge => {
            const node = edge.node;
            return {
                variantId: node.variant.id,
                quantity: node.quantity,
                title: node.title,
                price: node.variant.price.amount,
                currencyCode: node.variant.price.currencyCode,
                image: node.variant.image.url,
                variantTitle: node.variant.title,
            };
        });
        setCart(newCart);
        updateLocalStorage(newCart, checkout.id);

        if (newCart.length === 0) {
            setCheckoutId(null);
            setCheckoutUrl(null);
            updateLocalStorage([], null);
        }
    } else {
        setCart([]);
        setCheckoutId(null);
        setCheckoutUrl(null);
        updateLocalStorage([], null);
    }
  }, []);

  const addToCart = async (item: CartItem) => {
    const existingItem = cart.find(cartItem => cartItem.variantId === item.variantId);
    const newQuantity = (existingItem?.quantity || 0) + item.quantity;
    
    const otherItems = cart.filter(i => i.variantId !== item.variantId);
    const lineItems = [
        ...otherItems.map(i => ({ variantId: i.variantId, quantity: i.quantity })),
        { variantId: item.variantId, quantity: newQuantity }
    ];

    try {
        let updatedCheckout: ShopifyCheckout | null = null;
        if (checkoutId) {
            updatedCheckout = await updateLineItems(checkoutId, lineItems);
        } else {
            updatedCheckout = await createCheckout(lineItems);
        }
        
        handleCheckoutUpdate(updatedCheckout);

        toast({
            title: 'Item added to cart',
            description: `${item.title} has been added to your cart.`,
        });
    } catch(e) {
        console.error('Failed to add to cart:', e);
        toast({ title: 'Error', description: 'Could not add item to cart.', variant: 'destructive' });
    }
  };

  const updateCartItemQuantity = async (variantId: string, quantity: number) => {
    if (!checkoutId) return;

    const lineItems = cart.map(item =>
        item.variantId === variantId ? { variantId, quantity } : { variantId: item.variantId, quantity: item.quantity }
    ).filter(item => item.quantity > 0);

    try {
        const updatedCheckout = await updateLineItems(checkoutId, lineItems);
        handleCheckoutUpdate(updatedCheckout);
    } catch (e) {
        console.error('Failed to update quantity:', e);
        toast({ title: 'Error', description: 'Could not update item quantity.', variant: 'destructive' });
    }
  };
  
  const removeFromCart = async (variantId: string) => {
    updateCartItemQuantity(variantId, 0);
  };


  const getCartTotal = () => {
    if (cart.length === 0) return formatCurrency(0, 'GBP');
    const total = cart.reduce((total, item) => total + parseFloat(item.price) * item.quantity, 0);
    const currencyCode = cart[0]?.currencyCode || 'GBP';
    return formatCurrency(total, currencyCode);
  };

  const checkout = async () => {
    if (!checkoutUrl) {
        toast({
            title: "Checkout Error",
            description: "Could not find a valid checkout URL. Please try again.",
            variant: "destructive"
        });
        return;
    }

    if (cart.length > 0) {
      setIsCheckingOut(true);
      window.location.href = checkoutUrl;
    } else {
        toast({
            title: "Your cart is empty",
            description: "Add items to your cart before checking out.",
        });
    }
  };

  return (
    <CartContext.Provider
      value={{ cart, addToCart, removeFromCart, updateCartItemQuantity, getCartTotal, checkout, isCheckingOut, checkoutUrl, isCartReady }}
    >
      {children}
    </CartContext.Provider>
  );
};
