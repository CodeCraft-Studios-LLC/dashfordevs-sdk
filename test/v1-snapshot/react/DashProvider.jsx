"use client";

import React, { createContext, useContext, useMemo } from "react";
import { CartProvider, useCart } from "./CartProvider.jsx";
import { AuthProvider, useAuth } from "./AuthProvider.jsx";

const DashContext = createContext(undefined);

/**
 * Combined Dash Provider
 * Wraps both AuthProvider and CartProvider with automatic cart transfer on login
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components
 * @param {Object} props.client - DashClient instance
 */
export function DashProvider({ children, client }) {
  const value = useMemo(() => ({ client }), [client]);

  return (
    <DashContext.Provider value={value}>
      <AuthProvider
        client={client}
        onLogin={() => {
          // Cart transfer is handled by CartProvider
        }}
      >
        <CartProvider client={client}>
          <CartAuthSync>{children}</CartAuthSync>
        </CartProvider>
      </AuthProvider>
    </DashContext.Provider>
  );
}

/**
 * Internal component to sync cart with auth state
 * Transfers guest cart to user on login
 */
function CartAuthSync({ children }) {
  const { isAuthenticated, customer } = useAuth();
  const { cartId, transferToUser } = useCart();

  // Transfer cart when user logs in
  React.useEffect(() => {
    if (isAuthenticated && cartId) {
      transferToUser();
    }
  }, [isAuthenticated, cartId, transferToUser]);

  return children;
}

/**
 * Hook to access Dash client from context
 * @returns {{ client: DashClient }}
 */
export function useDash() {
  const context = useContext(DashContext);
  if (context === undefined) {
    throw new Error("useDash must be used within a DashProvider");
  }
  return context;
}

export default DashProvider;
