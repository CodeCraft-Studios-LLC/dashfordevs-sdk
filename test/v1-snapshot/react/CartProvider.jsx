"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";

/**
 * @typedef {Object} BulkDiscount
 * @property {number} min_quantity
 * @property {number|null} max_quantity
 * @property {string} discount_type
 * @property {string} discount_value
 */

/**
 * @typedef {Object} CartItem
 * @property {string} id - Cart item ID
 * @property {string} product_id - Product ID
 * @property {string} product_name - Product name
 * @property {string} product_slug - Product slug
 * @property {string|null} product_image - Product image URL
 * @property {string} size_id - Size ID
 * @property {string} size_label - Size label
 * @property {number} quantity - Quantity
 * @property {string} unit_price - Unit price
 * @property {string} total_price - Total price
 * @property {number} stock_available - Available stock
 * @property {BulkDiscount[]} bulk_discounts - Bulk discount tiers
 */

/**
 * @typedef {Object} CartContextType
 * @property {CartItem[]} items - Cart items
 * @property {string|null} cartId - Cart ID
 * @property {number} itemCount - Number of unique items
 * @property {number} totalItemCount - Total quantity of all items
 * @property {string} subtotal - Cart subtotal
 * @property {boolean} isLoading - Initial loading state
 * @property {boolean} isUpdating - Update operation in progress
 * @property {string|null} error - Error message
 * @property {function} addItem - Add item to cart
 * @property {function} updateItem - Update item quantity
 * @property {function} removeItem - Remove item from cart
 * @property {function} clearCart - Clear all items
 * @property {function} refreshCart - Refresh cart from server
 * @property {function} transferToUser - Transfer cart to authenticated user
 */

const CartContext = createContext(undefined);

const CART_ID_KEY = "devdash_cart_id";

/**
 * Cart Provider Component
 * Manages cart state and syncs with DevDash backend
 *
 * SSR Support:
 * - Pass `initialCart` prop with server-fetched cart data
 * - Component hydrates immediately without loading flash
 * - Client-side interactions work seamlessly after hydration
 *
 * @example Server-side fetch + client hydration:
 * ```jsx
 * // In your layout or page (server component)
 * import { cookies } from "next/headers";
 *
 * export default async function Layout({ children }) {
 *   const cartId = cookies().get("cart_id")?.value;
 *   let initialCart = null;
 *
 *   if (cartId) {
 *     initialCart = await dash.cart.get(cartId);
 *   }
 *
 *   return (
 *     <CartProvider client={dash} initialCart={initialCart}>
 *       {children}
 *     </CartProvider>
 *   );
 * }
 * ```
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components
 * @param {Object} props.client - DashClient instance
 * @param {Object} [props.initialCart] - Server-fetched cart for SSR (no loading flash)
 * @param {string} [props.storageKey] - Custom localStorage key for cart ID
 * @param {boolean} [props.optimisticUpdates=true] - Enable optimistic UI updates
 */
export function CartProvider({
  children,
  client,
  initialCart = null,
  storageKey = CART_ID_KEY,
  optimisticUpdates = true,
}) {
  // Initialize from SSR data if provided
  const [items, setItems] = useState(initialCart?.items || []);
  const [cartId, setCartId] = useState(initialCart?.cart_id || null);
  const [subtotal, setSubtotal] = useState(initialCart?.subtotal || "0.00");
  const [isLoading, setIsLoading] = useState(!initialCart); // Skip loading if SSR data provided
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState(null);

  // Load cart from localStorage on mount (only if no SSR data)
  useEffect(() => {
    if (typeof window === "undefined") {
      setIsLoading(false);
      return;
    }

    // If we have SSR data, just sync cartId to localStorage
    if (initialCart?.cart_id) {
      localStorage.setItem(storageKey, initialCart.cart_id);
      setIsLoading(false);
      return;
    }

    // Otherwise, try to load from localStorage
    const loadCart = async () => {
      const savedCartId = localStorage.getItem(storageKey);
      if (savedCartId) {
        try {
          const cart = await client.cart.get(savedCartId);
          setCartId(cart.cart_id);
          setItems(cart.items || []);
          setSubtotal(cart.subtotal || "0.00");
        } catch (err) {
          // Cart might have expired or been cleared
          localStorage.removeItem(storageKey);
          setError(err.message);
        }
      }
      setIsLoading(false);
    };

    loadCart();
  }, [client, storageKey, initialCart]);

  // Save cart ID to localStorage when it changes
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (cartId) {
      localStorage.setItem(storageKey, cartId);
    }
  }, [cartId, storageKey]);

  const refreshCart = useCallback(
    async (overrideCartId = null) => {
      const targetCartId = overrideCartId || cartId;
      if (!targetCartId) {
        setItems([]);
        setSubtotal("0.00");
        return;
      }

      try {
        setIsLoading(true);
        const cart = await client.cart.get(targetCartId);
        setCartId(cart.cart_id);
        setItems(cart.items || []);
        setSubtotal(cart.subtotal || "0.00");
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    },
    [cartId, client]
  );

  const addItem = useCallback(
    async (productId, sizeId, quantity = 1) => {
      setIsUpdating(true);
      setError(null);

      try {
        const response = await client.cart.add(productId, sizeId, quantity, cartId);

        if (response.cart_id) {
          setCartId(response.cart_id);
          if (typeof window !== "undefined") {
            localStorage.setItem(storageKey, response.cart_id);
          }
        }

        // Refresh full cart state
        const cart = await client.cart.get(response.cart_id);
        setItems(cart.items || []);
        setSubtotal(cart.subtotal || "0.00");

        return response;
      } catch (err) {
        setError(err.message);
        throw err;
      } finally {
        setIsUpdating(false);
      }
    },
    [client, cartId, storageKey]
  );

  const updateItem = useCallback(
    async (sizeId, quantity) => {
      if (!cartId) return;

      setIsUpdating(true);
      setError(null);

      // Optimistic update
      const previousItems = items;
      const previousSubtotal = subtotal;

      if (optimisticUpdates) {
        if (quantity <= 0) {
          setItems((prev) => prev.filter((item) => item.size_id !== sizeId));
        } else {
          setItems((prev) =>
            prev.map((item) =>
              item.size_id === sizeId
                ? {
                    ...item,
                    quantity,
                    total_price: (parseFloat(item.unit_price) * quantity).toFixed(2),
                  }
                : item
            )
          );
        }
        // Recalculate subtotal
        setSubtotal((prev) => {
          const newItems =
            quantity <= 0
              ? items.filter((item) => item.size_id !== sizeId)
              : items.map((item) =>
                  item.size_id === sizeId ? { ...item, quantity } : item
                );
          return newItems
            .reduce(
              (sum, item) =>
                sum +
                parseFloat(item.unit_price) *
                  (item.size_id === sizeId ? quantity : item.quantity),
              0
            )
            .toFixed(2);
        });
      }

      try {
        await client.cart.update(cartId, sizeId, quantity);
        // Refresh to get accurate server state
        const cart = await client.cart.get(cartId);
        setItems(cart.items || []);
        setSubtotal(cart.subtotal || "0.00");
      } catch (err) {
        // Rollback on error
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
    [cartId, client, items, subtotal, optimisticUpdates]
  );

  const removeItem = useCallback(
    async (sizeId) => {
      if (!cartId) return;

      setIsUpdating(true);
      setError(null);

      // Optimistic update
      const previousItems = items;
      const previousSubtotal = subtotal;

      if (optimisticUpdates) {
        const removedItem = items.find((item) => item.size_id === sizeId);
        setItems((prev) => prev.filter((item) => item.size_id !== sizeId));
        if (removedItem) {
          setSubtotal((prev) =>
            (parseFloat(prev) - parseFloat(removedItem.total_price)).toFixed(2)
          );
        }
      }

      try {
        await client.cart.remove(cartId, sizeId);
        const cart = await client.cart.get(cartId);
        setItems(cart.items || []);
        setSubtotal(cart.subtotal || "0.00");
      } catch (err) {
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
    [cartId, client, items, subtotal, optimisticUpdates]
  );

  const clearCart = useCallback(async () => {
    if (!cartId) return;

    setIsUpdating(true);
    setError(null);

    // Optimistic update
    const previousItems = items;
    const previousSubtotal = subtotal;

    if (optimisticUpdates) {
      setItems([]);
      setSubtotal("0.00");
    }

    try {
      await client.cart.clear(cartId);
      setItems([]);
      setSubtotal("0.00");
    } catch (err) {
      if (optimisticUpdates) {
        setItems(previousItems);
        setSubtotal(previousSubtotal);
      }
      setError(err.message);
      throw err;
    } finally {
      setIsUpdating(false);
    }
  }, [cartId, client, items, subtotal, optimisticUpdates]);

  // Transfer guest cart to authenticated user
  const transferToUser = useCallback(async () => {
    if (!cartId) return;

    try {
      await client.auth.mergeCart(cartId);
      // Cart is now associated with user, refresh
      await refreshCart();
    } catch (err) {
      console.error("Failed to transfer cart:", err);
      setError(err.message);
    }
  }, [client, cartId, refreshCart]);

  const itemCount = items.length;
  const totalItemCount = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items]
  );

  const value = useMemo(
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
    [
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
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/**
 * Hook to access cart context
 * @returns {CartContextType}
 */
export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}

export default CartProvider;
