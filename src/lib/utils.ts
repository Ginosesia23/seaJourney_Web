import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const currencySymbols: { [key: string]: string } = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
};

export function formatCurrency(amount: string | number, currencyCode: string) {
  const symbol = currencySymbols[currencyCode] || currencyCode;
  const amountAsNumber = typeof amount === 'string' ? parseFloat(amount) : amount;
  return `${symbol}${amountAsNumber.toFixed(2)}`;
}
