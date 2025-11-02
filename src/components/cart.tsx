'use client';

import { ShoppingCart, X, Plus, Minus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
  SheetClose
} from '@/components/ui/sheet';
import { useCart } from '@/context/cart-context';
import Image from 'next/image';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';

export function Cart() {
  const { cart, removeFromCart, updateCartItemQuantity, getCartTotal, isCheckingOut, checkout } = useCart();
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative hover:bg-white/10">
          <ShoppingCart className="h-6 w-6" />
          {itemCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
              {itemCount}
            </span>
          )}
          <span className="sr-only">Open cart</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col pr-0 sm:max-w-lg bg-background">
        <SheetHeader className="px-6">
          <SheetTitle>Shopping Cart</SheetTitle>
        </SheetHeader>
        <Separator />
        {cart.length > 0 ? (
          <>
            <div className="flex-1 overflow-y-auto px-6">
              <ul className="divide-y divide-border">
                {cart.map((item) => (
                  <li key={item.variantId} className="flex py-6">
                    <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-md border">
                      <Image
                        src={item.image}
                        alt={item.title}
                        width={96}
                        height={96}
                        className="h-full w-full object-cover"
                      />
                    </div>

                    <div className="ml-4 flex flex-1 flex-col">
                      <div>
                        <div className="flex justify-between text-base font-medium text-foreground">
                          <h3>
                            {item.title}
                          </h3>
                          <p className="ml-4">${(parseFloat(item.price) * item.quantity).toFixed(2)}</p>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{item.variantTitle}</p>
                      </div>
                      <div className="flex flex-1 items-end justify-between text-sm">
                        <div className="flex items-center">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => updateCartItemQuantity(item.variantId, item.quantity - 1)}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="w-8 text-center">{item.quantity}</span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => updateCartItemQuantity(item.variantId, item.quantity + 1)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="flex">
                          <Button
                            variant="ghost"
                            type="button"
                            className="font-medium text-accent hover:text-accent/80"
                            onClick={() => removeFromCart(item.variantId)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <SheetFooter className="border-t px-6 py-6 sm:px-6">
              <div className="w-full space-y-4">
                <div className="flex justify-between text-base font-medium text-foreground">
                  <p>Subtotal</p>
                  <p>${getCartTotal()}</p>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Shipping and taxes calculated at checkout.
                </p>
                <Button 
                  className="w-full bg-accent hover:bg-accent/90 text-accent-foreground" 
                  size="lg"
                  onClick={checkout}
                  disabled={isCheckingOut}
                >
                  {isCheckingOut ? (
                    <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Processing...</>
                  ) : 'Checkout'}
                </Button>
                <div className="mt-6 flex justify-center text-center text-sm text-muted-foreground">
                  <p>
                    or{' '}
                    <SheetClose asChild>
                       <Link href="/shop" className="font-medium text-accent hover:text-accent/80">
                         Continue Shopping<span aria-hidden="true"> &rarr;</span>
                       </Link>
                    </SheetClose>
                  </p>
                </div>
              </div>
            </SheetFooter>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
            <ShoppingCart className="h-16 w-16 text-muted-foreground" />
            <p className="text-lg text-muted-foreground">Your cart is empty</p>
            <SheetClose asChild>
              <Button asChild>
                <Link href="/shop">Start Shopping</Link>
              </Button>
            </SheetClose>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
