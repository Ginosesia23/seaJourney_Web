'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createCheckout, addLineItems, CartItem } from '@/lib/shopify';
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
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const storedCart = localStorage.getItem('cart');
    const storedCheckoutId = localStorage.getItem('checkoutId');
    if (storedCart) {
      setCart(JSON.parse(storedCart));
    }
    if (storedCheckoutId) {
        setCheckoutId(storedCheckoutId);
    }
  }, []);

  const updateLocalStorage = (cart: CartItem[], checkoutId: string | null) => {
    localStorage.setItem('cart', JSON.stringify(cart));
    if (checkoutId) {
        localStorage.setItem('checkoutId', checkoutId);
    }
  };

  const addToCart = (item: CartItem) => {
    let newCart: CartItem[] = [];
    const existingItemIndex = cart.findIndex((cartItem) => cartItem.variantId === item.variantId);
    
    if (existingItemIndex > -1) {
      newCart = cart.map((cartItem, index) =>
        index === existingItemIndex ? { ...cartItem, quantity: cartItem.quantity + item.quantity } : cartItem
      );
    } else {
      newCart = [...cart, item];
    }
    
    setCart(newCart);
    updateLocalStorage(newCart, checkoutId);
    toast({
      title: 'Item added to cart',
      description: `${item.title} has been added to your cart.`,
    });
  };

  const removeFromCart = (variantId: string) => {
    const newCart = cart.filter((item) => item.variantId !== variantId);
    setCart(newCart);
    updateLocalStorage(newCart, checkoutId);
  };

  const updateCartItemQuantity = (variantId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(variantId);
      return;
    }
    const newCart = cart.map((item) =>
      item.variantId === variantId ? { ...item, quantity } : item
    );
    setCart(newCart);
    updateLocalStorage(newCart, checkoutId);
  };

  const getCartTotal = () => {
    const total = cart.reduce((total, item) => total + parseFloat(item.price) * item.quantity, 0);
    const currencyCode = cart.length > 0 ? cart[0].currencyCode : 'USD';
    return formatCurrency(total, currencyCode);
  };

  const checkout = useCallback(async () => {
    setIsCheckingOut(true);
    if(cart.length === 0) {
        toast({
            title: "Your cart is empty",
            description: "Add items to your cart before checking out.",
            variant: "destructive"
        });
        setIsCheckingOut(false);
        return;
    }
    try {
        const lineItems = cart.map(item => ({ variantId: item.variantId, quantity: item.quantity }));
        const checkoutResponse = await createCheckout(lineItems);

        if (checkoutResponse?.webUrl) {
            window.location.href = checkoutResponse.webUrl;
            // Clear cart after successful redirection preparation
            setCart([]);
            setCheckoutId(null);
            localStorage.removeItem('cart');
            localStorage.removeItem('checkoutId');
        } else {
            throw new Error("Failed to create checkout.");
        }
    } catch (error) {
        console.error("Checkout error:", error);
        toast({
            title: "Checkout Error",
            description: "Could not proceed to checkout. Please try again.",
            variant: "destructive"
        });
    } finally {
        setIsCheckingOut(false);
    }
}, [cart, toast]);


  return (
    <CartContext.Provider
      value={{ cart, addToCart, removeFromCart, updateCartItemQuantity, getCartTotal, checkout, isCheckingOut }}
    >
      {children}
    </CartContext.Provider>
  );
};
