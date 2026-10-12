"use client";

/**
 * AuthProvider / useAuth - OTP and password sign-in state for React.
 *
 * Tokens are kept in localStorage under the same keys as v1
 * (devdash_access_token, devdash_refresh_token, devdash_customer) so a store
 * upgrading keeps its signed-in customers signed in.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { DashClient } from "../client.js";

export interface Customer {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  emailVerified: boolean;
  hasPassword?: boolean;
  metadata?: Record<string, any>;
}

export interface AuthContextType {
  customer: Customer | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<any>;
  /**
   * Declared by v1's types but never implemented. There is no password
   * sign-up endpoint: customers are created by OTP sign-in or checkout.
   * Rejects with guidance (v1 threw "register is not a function").
   */
  register: (email: string, password: string, additionalData?: Record<string, any>) => Promise<any>;
  requestOTP: (email: string) => Promise<any>;
  loginWithOTP: (email: string, code: string) => Promise<any>;
  /** Set a password for the signed-in customer (present at runtime; optional in the type for v1 compatibility). */
  setPassword?: (password: string) => Promise<any>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<Customer> | Record<string, any>) => Promise<any>;
  refreshProfile: () => Promise<void>;
}

export interface AuthProviderProps {
  children: React.ReactNode;
  client: DashClient;
  initialCustomer?: Record<string, any> | null;
  accessTokenKey?: string;
  refreshTokenKey?: string;
  /** v1's declared name for the access-token storage key (alias of accessTokenKey). */
  tokenKey?: string;
  customerKey?: string;
  onLogin?: (customer: Customer) => void;
  onLogout?: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ACCESS_TOKEN_KEY = "devdash_access_token";
const REFRESH_TOKEN_KEY = "devdash_refresh_token";
const CUSTOMER_KEY = "devdash_customer";

function transformCustomer(data: any): Customer | null {
  if (!data) return null;
  return {
    id: data.id,
    email: data.email,
    firstName: data.first_name || "",
    lastName: data.last_name || "",
    phone: data.phone || "",
    emailVerified: data.email_verified || false,
    hasPassword: data.has_password || false,
    metadata: data.metadata || {},
  };
}

function ls(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function AuthProvider({
  children,
  client,
  initialCustomer = null,
  accessTokenKey,
  tokenKey,
  refreshTokenKey = REFRESH_TOKEN_KEY,
  customerKey = CUSTOMER_KEY,
  onLogin,
  onLogout,
}: AuthProviderProps): React.JSX.Element {
  const accessKey = accessTokenKey || tokenKey || ACCESS_TOKEN_KEY;
  const [customer, setCustomer] = useState<Customer | null>(initialCustomer ? transformCustomer(initialCustomer) : null);
  const [isLoading, setIsLoading] = useState(!initialCustomer);

  useEffect(() => {
    if (typeof window === "undefined") {
      setIsLoading(false);
      return;
    }
    if (initialCustomer) {
      setIsLoading(false);
      return;
    }

    const loadAuth = async () => {
      const store = ls();
      const token = store?.getItem(accessKey);
      const refreshToken = store?.getItem(refreshTokenKey);
      const savedCustomer = store?.getItem(customerKey);

      if (token && savedCustomer) {
        try {
          client.auth.setToken(token, refreshToken);
          const response = await client.auth.getProfile();
          setCustomer(transformCustomer(response.customer));
          store?.setItem(customerKey, JSON.stringify(response.customer));
        } catch {
          store?.removeItem(accessKey);
          store?.removeItem(refreshTokenKey);
          store?.removeItem(customerKey);
          client.auth.setToken(null);
        }
      }
      setIsLoading(false);
    };

    loadAuth();
  }, [client, accessKey, refreshTokenKey, customerKey, initialCustomer]);

  const saveAuth = useCallback(
    (accessToken: string, refreshToken: string | undefined, customerData: unknown) => {
      const store = ls();
      if (!store) return;
      store.setItem(accessKey, accessToken);
      if (refreshToken) store.setItem(refreshTokenKey, refreshToken);
      store.setItem(customerKey, JSON.stringify(customerData));
    },
    [accessKey, refreshTokenKey, customerKey]
  );

  const clearAuth = useCallback(() => {
    const store = ls();
    if (!store) return;
    store.removeItem(accessKey);
    store.removeItem(refreshTokenKey);
    store.removeItem(customerKey);
  }, [accessKey, refreshTokenKey, customerKey]);

  const requestOTP = useCallback(async (email: string) => client.auth.requestOTP(email), [client]);

  const loginWithOTP = useCallback(
    async (email: string, code: string) => {
      setIsLoading(true);
      try {
        const response = await client.auth.verifyOTP({ email, code });
        const transformed = transformCustomer(response.customer);
        setCustomer(transformed);
        saveAuth(response.access_token, response.refresh_token, response.customer);
        if (onLogin && transformed) onLogin(transformed);
        return response;
      } finally {
        setIsLoading(false);
      }
    },
    [client, saveAuth, onLogin]
  );

  const login = useCallback(
    async (email: string, password: string) => {
      setIsLoading(true);
      try {
        const response = await client.auth.login({ email, password });
        const transformed = transformCustomer(response.customer);
        setCustomer(transformed);
        saveAuth(response.access_token, response.refresh_token, response.customer);
        if (onLogin && transformed) onLogin(transformed);
        return response;
      } finally {
        setIsLoading(false);
      }
    },
    [client, saveAuth, onLogin]
  );

  const register = useCallback(async () => {
    throw new Error(
      "useAuth().register is not available: DashForDevs creates customers through OTP sign-in " +
        "(requestOTP + loginWithOTP) or checkout. Call setPassword() afterwards to add a password."
    );
  }, []);

  const setPassword = useCallback(
    async (password: string) => {
      const response = await client.auth.setPassword(password);
      if (response.customer) setCustomer(transformCustomer(response.customer));
      return response;
    },
    [client]
  );

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await client.auth.logout();
    } catch {
      // ignore
    } finally {
      setCustomer(null);
      clearAuth();
      setIsLoading(false);
      if (onLogout) onLogout();
    }
  }, [client, clearAuth, onLogout]);

  const updateProfile = useCallback(
    async (data: Record<string, any>) => {
      setIsLoading(true);
      try {
        const response = await client.auth.updateProfile(data);
        setCustomer(transformCustomer(response.customer));
        ls()?.setItem(customerKey, JSON.stringify(response.customer));
        return response;
      } finally {
        setIsLoading(false);
      }
    },
    [client, customerKey]
  );

  const refreshProfile = useCallback(async () => {
    if (!client.auth.token) return;
    setIsLoading(true);
    try {
      const response = await client.auth.getProfile();
      setCustomer(transformCustomer(response.customer));
      ls()?.setItem(customerKey, JSON.stringify(response.customer));
    } finally {
      setIsLoading(false);
    }
  }, [client, customerKey]);

  const isAuthenticated = !!customer;

  const value = useMemo<AuthContextType>(
    () => ({
      customer,
      isLoading,
      isAuthenticated,
      requestOTP,
      loginWithOTP,
      login,
      register,
      setPassword,
      logout,
      updateProfile,
      refreshProfile,
    }),
    [customer, isLoading, isAuthenticated, requestOTP, loginWithOTP, login, register, setPassword, logout, updateProfile, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export default AuthProvider;
