"use client";

/**
 * DashProvider - AuthProvider + CartProvider with guest-cart transfer on login.
 */

import React, { createContext, useContext, useEffect, useMemo } from "react";
import type { DashClient } from "../client.js";
import { CartProvider, useCart } from "./CartProvider.js";
import { AuthProvider, useAuth } from "./AuthProvider.js";

const DashContext = createContext<{ client: DashClient } | undefined>(undefined);

export interface DashProviderProps {
  children: React.ReactNode;
  client: DashClient;
}

export function DashProvider({ children, client }: DashProviderProps): React.JSX.Element {
  const value = useMemo(() => ({ client }), [client]);

  return (
    <DashContext.Provider value={value}>
      <AuthProvider client={client} onLogin={() => {}}>
        <CartProvider client={client}>
          <CartAuthSync>{children}</CartAuthSync>
        </CartProvider>
      </AuthProvider>
    </DashContext.Provider>
  );
}

function CartAuthSync({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { isAuthenticated } = useAuth();
  const { cartId, transferToUser } = useCart();

  useEffect(() => {
    if (isAuthenticated && cartId) {
      transferToUser();
    }
  }, [isAuthenticated, cartId, transferToUser]);

  return <>{children}</>;
}

/** The client from the nearest DashProvider. */
export function useDash(): { client: DashClient } {
  const context = useContext(DashContext);
  if (context === undefined) {
    throw new Error("useDash must be used within a DashProvider");
  }
  return context;
}

export default DashProvider;
