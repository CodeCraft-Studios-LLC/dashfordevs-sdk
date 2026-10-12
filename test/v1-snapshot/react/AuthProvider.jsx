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
 * @typedef {Object} Customer
 * @property {string} id - Customer ID
 * @property {string} email - Customer email
 * @property {string} firstName - First name
 * @property {string} lastName - Last name
 * @property {string} phone - Phone number
 * @property {boolean} emailVerified - Email verification status
 * @property {boolean} hasPassword - Whether customer has set a password
 * @property {Object} metadata - Arbitrary key-value metadata
 */

/**
 * @typedef {Object} AuthContextType
 * @property {Customer|null} customer - Current customer
 * @property {boolean} isLoading - Loading state
 * @property {boolean} isAuthenticated - Authentication status
 * @property {(email: string) => Promise} requestOTP - Request OTP code
 * @property {(email: string, code: string) => Promise} loginWithOTP - Verify OTP and authenticate
 * @property {(email: string, password: string) => Promise} login - Login with password
 * @property {(password: string) => Promise} setPassword - Set password for authenticated customer
 * @property {() => Promise<void>} logout - Logout
 * @property {(data: Object) => Promise} updateProfile - Update customer profile
 * @property {() => Promise<void>} refreshProfile - Refresh customer data from server
 */

const AuthContext = createContext(undefined);

const ACCESS_TOKEN_KEY = "devdash_access_token";
const REFRESH_TOKEN_KEY = "devdash_refresh_token";
const CUSTOMER_KEY = "devdash_customer";

/**
 * Transform backend customer data to frontend format.
 * @param {Object} data - Raw customer data from API
 * @returns {Customer|null}
 */
function transformCustomer(data) {
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

/**
 * Auth Provider Component
 *
 * Manages OTP-based authentication state and syncs with the DevDash backend.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @param {Object} props.client - DashClient instance
 * @param {Object} [props.initialCustomer] - Server-fetched customer for SSR hydration
 * @param {string} [props.accessTokenKey] - localStorage key for access token
 * @param {string} [props.refreshTokenKey] - localStorage key for refresh token
 * @param {string} [props.customerKey] - localStorage key for customer data
 * @param {function} [props.onLogin] - Called after successful authentication
 * @param {function} [props.onLogout] - Called after logout
 */
export function AuthProvider({
  children,
  client,
  initialCustomer = null,
  accessTokenKey = ACCESS_TOKEN_KEY,
  refreshTokenKey = REFRESH_TOKEN_KEY,
  customerKey = CUSTOMER_KEY,
  onLogin,
  onLogout,
}) {
  const [customer, setCustomer] = useState(
    initialCustomer ? transformCustomer(initialCustomer) : null
  );
  const [isLoading, setIsLoading] = useState(!initialCustomer);

  // Restore session from localStorage on mount
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
      const token = localStorage.getItem(accessTokenKey);
      const refreshToken = localStorage.getItem(refreshTokenKey);
      const savedCustomer = localStorage.getItem(customerKey);

      if (token && savedCustomer) {
        try {
          client.auth.setToken(token, refreshToken);

          const response = await client.auth.getProfile();
          setCustomer(transformCustomer(response.customer));
          localStorage.setItem(customerKey, JSON.stringify(response.customer));
        } catch (error) {
          localStorage.removeItem(accessTokenKey);
          localStorage.removeItem(refreshTokenKey);
          localStorage.removeItem(customerKey);
          client.auth.setToken(null);
        }
      }
      setIsLoading(false);
    };

    loadAuth();
  }, [client, accessTokenKey, refreshTokenKey, customerKey, initialCustomer]);

  const saveAuth = useCallback(
    (accessToken, refreshToken, customerData) => {
      if (typeof window === "undefined") return;
      localStorage.setItem(accessTokenKey, accessToken);
      if (refreshToken) {
        localStorage.setItem(refreshTokenKey, refreshToken);
      }
      localStorage.setItem(customerKey, JSON.stringify(customerData));
    },
    [accessTokenKey, refreshTokenKey, customerKey]
  );

  const clearAuth = useCallback(() => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(accessTokenKey);
    localStorage.removeItem(refreshTokenKey);
    localStorage.removeItem(customerKey);
  }, [accessTokenKey, refreshTokenKey, customerKey]);

  const requestOTP = useCallback(
    async (email) => {
      return client.auth.requestOTP(email);
    },
    [client]
  );

  const loginWithOTP = useCallback(
    async (email, code) => {
      setIsLoading(true);
      try {
        const response = await client.auth.verifyOTP({ email, code });

        const transformed = transformCustomer(response.customer);
        setCustomer(transformed);
        saveAuth(response.access_token, response.refresh_token, response.customer);

        if (onLogin) {
          onLogin(transformed);
        }

        return response;
      } finally {
        setIsLoading(false);
      }
    },
    [client, saveAuth, onLogin]
  );

  const login = useCallback(
    async (email, password) => {
      setIsLoading(true);
      try {
        const response = await client.auth.login({ email, password });

        const transformed = transformCustomer(response.customer);
        setCustomer(transformed);
        saveAuth(response.access_token, response.refresh_token, response.customer);

        if (onLogin) {
          onLogin(transformed);
        }

        return response;
      } finally {
        setIsLoading(false);
      }
    },
    [client, saveAuth, onLogin]
  );

  const setPassword = useCallback(
    async (password) => {
      const response = await client.auth.setPassword(password);
      if (response.customer) {
        setCustomer(transformCustomer(response.customer));
      }
      return response;
    },
    [client]
  );

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await client.auth.logout();
    } catch (error) {
      // Ignore logout errors
    } finally {
      setCustomer(null);
      clearAuth();
      setIsLoading(false);

      if (onLogout) {
        onLogout();
      }
    }
  }, [client, clearAuth, onLogout]);

  const updateProfile = useCallback(
    async (data) => {
      setIsLoading(true);
      try {
        const response = await client.auth.updateProfile(data);

        const transformed = transformCustomer(response.customer);
        setCustomer(transformed);

        if (typeof window !== "undefined") {
          localStorage.setItem(customerKey, JSON.stringify(response.customer));
        }

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
      const transformed = transformCustomer(response.customer);
      setCustomer(transformed);

      if (typeof window !== "undefined") {
        localStorage.setItem(customerKey, JSON.stringify(response.customer));
      }
    } finally {
      setIsLoading(false);
    }
  }, [client, customerKey]);

  const isAuthenticated = !!customer;

  const value = useMemo(
    () => ({
      customer,
      isLoading,
      isAuthenticated,
      requestOTP,
      loginWithOTP,
      login,
      setPassword,
      logout,
      updateProfile,
      refreshProfile,
    }),
    [
      customer,
      isLoading,
      isAuthenticated,
      requestOTP,
      loginWithOTP,
      login,
      setPassword,
      logout,
      updateProfile,
      refreshProfile,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access the auth context.
 * Must be used within an AuthProvider.
 * @returns {AuthContextType}
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export default AuthProvider;
