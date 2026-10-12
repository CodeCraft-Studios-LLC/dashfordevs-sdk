"use client";

/**
 * CartProvider / useCart - cart state for React, synced with the API.
 *
 * Same context value and props as v1, and the same localStorage key
 * (devdash_cart_id). v1's provider called the cart module with positional
 * arguments it does not take (`cart.add(productId, sizeId, qty, cartId)`,
 * `cart.get(cartId)`...), so add/update/remove failed or read an empty cart;
 * v2 calls the module correctly.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { DashClient } from "../client.js";
import type { CartGetResponse } from "../types.js";

export interface CartItem {
  id: string;
  product_id: string;
  product_name: string;
  product_slug: string;
  product_image: string | null;
  size_id: string;
  size_label: string;
  quantity: number;
  unit_price: string;
  total_price: string;
  stock_available: number;
  [key: string]: any;
}

export interface CartContextType {
  items: CartItem[];
  cartId: string | null;
  itemCount: number;
  totalItemCount: number;
  subtotal: string;
  isLoading: boolean;
  /** v2: an add/update/remove/clear is in flight (always present at runtime). */
  isUpdating?: boolean;
  /** v2: last error message, or null (always present at runtime). */
  error?: string | null;
  addItem: (productId: string, sizeId: string, quantity?: number) => Promise<any>;
  updateItem: (sizeId: string, quantity: number) => Promise<void>;
  removeItem: (sizeId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  refreshCart: (overrideCartId?: string | null) => Promise<void>;
  transferToUser: (authToken?: string) => Promise<void>;
}

export interface CartProviderProps {
  children: React.ReactNode;
  client: DashClient;
  /** Server-fetched cart for SSR hydration (no loading flash). */
  initialCart?: CartGetResponse | null;
  storageKey?: string;
  optimisticUpdates?: boolean;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_ID_KEY = "devdash_cart_id";

function ls(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function CartProvider({
  children,
  client,
  initialCart = null,
  storageKey = CART_ID_KEY,
  optimisticUpdates = true,
}: CartProviderProps): React.JSX.Element {
  const [items, setItems] = useState<CartItem[]>((initialCart?.items as CartItem[]) || []);
  const [cartId, setCartId] = useState<string | null>(initialCart?.cart_id || null);
  const [subtotal, setSubtotal] = useState<string>(initialCart?.subtotal || "0.00");
  const [isLoading, setIsLoading] = useState(!initialCart);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Point the cart module at the provider's cart before calling it. */
  const bind = useCallback(
    (id: string | null) => {
      if (id && client.cart.cartId !== id) client.cart._cartId = id;
    },
    [client]
  );

  const applyCart = useCallback((cart: CartGetResponse) => {
    if (cart.cart_id) setCartId(cart.cart_id);
    setItems((cart.items as CartItem[]) || []);
    setSubtotal(cart.subtotal || "0.00");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      setIsLoading(false);
      return;
    }

    if (initialCart?.cart_id) {
      ls()?.setItem(storageKey, initialCart.cart_id);
      bind(initialCart.cart_id);
      setIsLoading(false);
      return;
    }

    const loadCart = async () => {
      const savedCartId = ls()?.getItem(storageKey);
      if (savedCartId) {
        try {
          applyCart(await client.cart.load(savedCartId));
        } catch (err: any) {
          ls()?.removeItem(storageKey);
          setError(err.message);
        }
      }
      setIsLoading(false);
    };

    loadCart();
  }, [client, storageKey, initialCart, bind, applyCart]);

  useEffect(() => {
    if (cartId) ls()?.setItem(storageKey, cartId);
  }, [cartId, storageKey]);

  const refreshCart = useCallback(
    async (overrideCartId: string | null = null) => {
      const targetCartId = overrideCartId || cartId;
      if (!targetCartId) {
        setItems([]);
        setSubtotal("0.00");
        return;
      }

      try {
        setIsLoading(true);
        applyCart(await client.cart.load(targetCartId));
        setError(null);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    },
    [cartId, client, applyCart]
  );

  const addItem = useCallback(
    async (productId: string, sizeId: string, quantity = 1) => {
      setIsUpdating(true);
      setError(null);

      try {
        bind(cartId);
        const response: any = await client.cart.add({ productId, sizeId, quantity });

        if (response.cart_id) {
          setCartId(response.cart_id);
          ls()?.setItem(storageKey, response.cart_id);
        }

        // add() already re-read the cart into the module.
        setItems((client.cart.items as CartItem[]) || []);
        setSubtotal(client.cart.getTotals().subtotal || "0.00");

        return response;
      } catch (err: any) {
        setError(err.message);
        throw err;
      } finally {
        setIsUpdating(false);
      }
    },
    [client, cartId, storageKey, bind]
  );

  const updateItem = useCallback(
    async (sizeId: string, quantity: number) => {
      if (!cartId) return;

      setIsUpdating(true);
      setError(null);

      const previousItems = items;
      const previousSubtotal = subtotal;

      if (optimisticUpdates) {
        const next =
          quantity <= 0
            ? items.filter((item) => item.size_id !== sizeId)
            : items.map((item) =>
                item.size_id === sizeId
                  ? { ...item, quantity, total_price: (parseFloat(item.unit_price) * quantity).toFixed(2) }
                  : item
              );
        setItems(next);
        setSubtotal(next.reduce((sum, item) => sum + parseFloat(item.unit_price) * item.quantity, 0).toFixed(2));
      }

      try {
        bind(cartId);
        await client.cart.update(sizeId, quantity);
        applyCart(await client.cart.get());
      } catch (err: any) {
        if (optimisticUpdates) {
          setItems(previousItems);
          setSubtotal(previousSubtotal);
        }
        setError(err.message);
        throw err;
      } finally {
        setIsUpdating(false);
      }
    },
    [cartId, client, items, subtotal, optimisticUpdates, bind, applyCart]
  );

  const removeItem = useCallback(
    async (sizeId: string) => {
      if (!cartId) return;

      setIsUpdating(true);
      setError(null);

      const previousItems = items;
      const previousSubtotal = subtotal;

      if (optimisticUpdates) {
        const removedItem = items.find((item) => item.size_id === sizeId);
        setItems((prev) => prev.filter((item) => item.size_id !== sizeId));
        if (removedItem) {
          setSubtotal((prev) => (parseFloat(prev) - parseFloat(removedItem.total_price)).toFixed(2));
        }
      }

      try {
        bind(cartId);
        await client.cart.remove(sizeId);
        applyCart(await client.cart.get());
      } catch (err: any) {
        if (optimisticUpdates) {
          setItems(previousItems);
          setSubtotal(previousSubtotal);
        }
        setError(err.message);
        throw err;
      } finally {
        setIsUpdating(false);
      }
    },
    [cartId, client, items, subtotal, optimisticUpdates, bind, applyCart]
  );

  const clearCart = useCallback(async () => {
    if (!cartId) return;

    setIsUpdating(true);
    setError(null);

    const previousItems = items;
    const previousSubtotal = subtotal;

    if (optimisticUpdates) {
      setItems([]);
      setSubtotal("0.00");
    }

    try {
      bind(cartId);
      await client.cart.clear();
      setItems([]);
      setSubtotal("0.00");
    } catch (err: any) {
      if (optimisticUpdates) {
        setItems(previousItems);
        setSubtotal(previousSubtotal);
      }
      setError(err.message);
      throw err;
    } finally {
      setIsUpdating(false);
    }
  }, [cartId, client, items, subtotal, optimisticUpdates, bind]);

  const transferToUser = useCallback(async () => {
    if (!cartId) return;

    try {
      await client.auth.mergeCart(cartId);
      await refreshCart();
    } catch (err: any) {
      console.error("Failed to transfer cart:", err);
      setError(err.message);
    }
  }, [client, cartId, refreshCart]);

  const itemCount = items.length;
  const totalItemCount = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);

  const value = useMemo<CartContextType>(
    () => ({
      items,
      cartId,
      itemCount,
      totalItemCount,
      subtotal,
      isLoading,
      isUpdating,
      error,
      addItem,
      updateItem,
      removeItem,
      clearCart,
      refreshCart,
      transferToUser,
    }),
    [items, cartId, itemCount, totalItemCount, subtotal, isLoading, isUpdating, error, addItem, updateItem, removeItem, clearCart, refreshCart, transferToUser]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextType {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}

export default CartProvider;
