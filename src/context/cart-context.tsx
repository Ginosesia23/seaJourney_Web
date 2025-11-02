'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createCheckout, addLineItems, CartItem, ShopifyCheckout, getCheckout } from '@/lib/shopify';
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
  const { toast } = useToast();

  useEffect(() => {
    const storedCart = localStorage.getItem('cart');
    const storedCheckoutId = localStorage.getItem('checkoutId');
    if (storedCart) {
      setCart(JSON.parse(storedCart));
    }
    if (storedCheckoutId) {
      const fetchCheckout = async () => {
        const existingCheckout = await getCheckout(storedCheckoutId);
        if (existingCheckout && existingCheckout.id) {
          setCheckoutId(existingCheckout.id);
          setCheckoutUrl(existingCheckout.webUrl);
        } else {
          localStorage.removeItem('checkoutId');
        }
      };
      fetchCheckout();
    }
  }, []);

  const updateLocalStorage = (cart: CartItem[], checkoutId: string | null) => {
    localStorage.setItem('cart', JSON.stringify(cart));
    if (checkoutId) {
      localStorage.setItem('checkoutId', checkoutId);
    } else {
      localStorage.removeItem('checkoutId');
    }
  };
  
  const handleCheckoutUpdate = (checkout: ShopifyCheckout) => {
    setCheckoutId(checkout.id);
    setCheckoutUrl(checkout.webUrl);
    updateLocalStorage(cart, checkout.id);
  }

  const addToCart = async (item: CartItem) => {
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

    const lineItems = newCart.map(item => ({ variantId: item.variantId, quantity: item.quantity }));

    if (checkoutId) {
        const updatedCheckout = await addLineItems(checkoutId, lineItems);
        if(updatedCheckout) handleCheckoutUpdate(updatedCheckout)
    } else {
        const newCheckout = await createCheckout(lineItems);
        if(newCheckout) handleCheckoutUpdate(newCheckout)
    }
    
    toast({
      title: 'Item added to cart',
      description: `${item.title} has been added to your cart.`,
    });
  };

  const removeFromCart = async (variantId: string) => {
    const newCart = cart.filter((item) => item.variantId !== variantId);
    setCart(newCart);
    updateLocalStorage(newCart, checkoutId);
    
    if (checkoutId) {
        const lineItems = newCart.map(item => ({ variantId: item.variantId, quantity: item.quantity }));
        const updatedCheckout = await addLineItems(checkoutId, lineItems);
        if(updatedCheckout) handleCheckoutUpdate(updatedCheckout)
    }
  };

  const updateCartItemQuantity = async (variantId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(variantId);
      return;
    }
    const newCart = cart.map((item) =>
      item.variantId === variantId ? { ...item, quantity } : item
    );
    setCart(newCart);
    updateLocalStorage(newCart, checkoutId);
    
    if (checkoutId) {
        const lineItems = newCart.map(item => ({ variantId: item.variantId, quantity: item.quantity }));
        const updatedCheckout = await addLineItems(checkoutId, lineItems);
        if(updatedCheckout) handleCheckoutUpdate(updatedCheckout)
    }
  };

  const getCartTotal = () => {
    const total = cart.reduce((total, item) => total + parseFloat(item.price) * item.quantity, 0);
    const currencyCode = cart.length > 0 ? cart[0].currencyCode : 'GBP';
    return formatCurrency(total, currencyCode);
  };

  const checkout = async () => {
    setIsCheckingOut(true);
    if (!checkoutUrl) {
        toast({
            title: "Checkout Error",
            description: "Could not find a valid checkout URL. Please try adding an item to your cart again.",
            variant: "destructive"
        });
        setIsCheckingOut(false);
        return;
    }

    if (cart.length > 0) {
      window.location.href = checkoutUrl;
    } else {
        toast({
            title: "Your cart is empty",
            description: "Add items to your cart before checking out.",
            variant: "destructive"
        });
    }
    
    // The user is redirected, but we'll set this for robustness
    setTimeout(() => setIsCheckingOut(false), 5000);
  };

  return (
    <CartContext.Provider
      value={{ cart, addToCart, removeFromCart, updateCartItemQuantity, getCartTotal, checkout, isCheckingOut, checkoutUrl }}
    >
      {children}
    </CartContext.Provider>
  );
};
