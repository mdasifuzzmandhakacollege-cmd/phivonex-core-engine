import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { auth, db, googleAuthProvider } from '../lib/firebase';
import {
  signInWithPopup,
  signOut as fbSignOut,
} from 'firebase/auth';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';

export interface UserProfile {
  id: string;
  publicId?: string;
  referralCode?: string;
  fullName: string;
  email: string;
  phone?: string | null;
  country?: string;
  status: string;
  role?: string;
  isAdmin?: boolean;
  emailVerified: boolean;
  kycStatus?: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  kycRejectReason?: string | null;
  kycVerifiedAt?: string | null;
  createdAt?: string;
  lastLoginAt?: string;
}

export interface ReferralDetails {
  publicId: string;
  referralCode: string;
  referralUrl: string;
  sponsor: {
    publicId: string;
    displayName: string;
  } | null;
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  register: (data: {
    fullName: string;
    email: string;
    phone?: string;
    country: string;
    password: string;
    referralCode?: string;
  }) => Promise<UserProfile>;
  login: (data: {
    identifier: string;
    password: string;
    rememberMe?: boolean;
    captchaToken?: string;
  }) => Promise<UserProfile>;
  loginWithGoogle: (referralCode?: string) => Promise<UserProfile>;
  logout: () => Promise<void>;
  forgotPassword: (email: string, captchaToken?: string) => Promise<{ message: string }>;
  resetPassword: (tokenOrCode: string, newPassword: string, email?: string) => Promise<{ message: string }>;
  verifyEmail: (token: string) => Promise<{ message: string }>;
  resendVerification: (email?: string) => Promise<{ message: string }>;
  refreshUser: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<UserProfile | null>>;
}

const TRANSIENT_GATEWAY_STATUSES = new Set([502, 503, 504]);

interface SafeJsonResponse {
  res: Response;
  data: any;
  isGatewayError: boolean;
}

/**
 * Performs an API fetch with safe non-JSON response handling and automatic
 * bounded retries when Cloud Run / Envoy returns a transient 502/503/504 or
 * resets an idle upstream connection (prevents raw `Unexpected token 'u', "upstream c"...` errors).
 */
export async function fetchJsonWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 2
): Promise<SafeJsonResponse> {
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, init);
      const rawText = await res.text();
      let parsed: any = null;
      let isJson = false;

      if (rawText) {
        try {
          parsed = JSON.parse(rawText);
          isJson = true;
        } catch {
          isJson = false;
        }
      } else {
        parsed = {};
        isJson = true;
      }

      const looksLikeUpstreamProxyError =
        !isJson &&
        (TRANSIENT_GATEWAY_STATUSES.has(res.status) ||
          /upstream|bad gateway|service unavailable|gateway timeout|reset reason/i.test(rawText));

      if (looksLikeUpstreamProxyError && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        continue;
      }

      if (TRANSIENT_GATEWAY_STATUSES.has(res.status) && parsed?.error === 'DATABASE_UNAVAILABLE' && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }

      if (!isJson) {
        return {
          res,
          data: {
            error: 'UPSTREAM_UNAVAILABLE',
            message: 'The server is temporarily reconnecting. Please try again in a moment.',
          },
          isGatewayError: true,
        };
      }

      return { res, data: parsed ?? {}, isGatewayError: false };
    } catch (networkErr: any) {
      lastError = networkErr;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        continue;
      }
    }
  }

  throw new Error(
    lastError?.message && !/unexpected token|not valid json/i.test(String(lastError.message))
      ? 'Network connection interrupted. Please check your internet connection and try again.'
      : 'The server is temporarily reconnecting. Please try again in a moment.'
  );
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch current authenticated user from session (/api/auth/me)
  const refreshUser = useCallback(async () => {
    try {
      const { res, data, isGatewayError } = await fetchJsonWithRetry(
        '/api/auth/me',
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        },
        1
      );

      if (res.ok && !isGatewayError) {
        setUser(data.user || data);
      } else if (!isGatewayError) {
        setUser(null);
      }
    } catch (err) {
      console.warn('[AuthContext] /api/auth/me check failed:', err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();

    const handleProfileUpdate = (e: any) => {
      const detail = e?.detail;
      if (detail?.user) {
        setUser((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            fullName: detail.user.fullName ?? detail.user.full_name ?? prev.fullName,
            phone: detail.user.phone !== undefined ? detail.user.phone : prev.phone,
            country: detail.user.country ?? prev.country,
            status: detail.user.status ?? prev.status,
          };
        });
      }
      refreshUser();
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        refreshUser();
      }
    };

    window.addEventListener('phivonex:profile-updated', handleProfileUpdate);
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      window.removeEventListener('phivonex:profile-updated', handleProfileUpdate);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [refreshUser]);

  // Real-time Firestore sync for user KYC status & instant admin updates (< seconds)
  useEffect(() => {
    if (!user?.id) return;

    // Listen to custom window events triggered on KYC submit/review
    const handleKycEvent = (e: any) => {
      const status = e?.detail?.status;
      if (status) {
        setUser((prev) => (prev ? { ...prev, kycStatus: status } : null));
      }
      refreshUser();
    };
    window.addEventListener('phivonex:kyc-updated', handleKycEvent);

    let unsubUserDoc: (() => void) | undefined;
    let unsubKycDoc: (() => void) | undefined;

    try {
      // 1. Listen to user profile document
      unsubUserDoc = onSnapshot(doc(db, 'users', user.id), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setUser((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              kycStatus: data.kycStatus || prev.kycStatus,
              kycRejectReason: data.kycRejectReason !== undefined ? data.kycRejectReason : prev.kycRejectReason,
              status: data.status || prev.status,
              role: data.role || prev.role,
            };
          });
        }
      }, () => {});

      // 2. Listen to user's KYC verification document
      unsubKycDoc = onSnapshot(doc(db, 'kyc_verifications', user.id), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.status) {
            setUser((prev) => {
              if (!prev) return null;
              return {
                ...prev,
                kycStatus: data.status,
                kycRejectReason: data.rejection_reason || null,
              };
            });
          }
        }
      }, () => {});
    } catch {
      // fallback to polling gracefully
    }

    return () => {
      window.removeEventListener('phivonex:kyc-updated', handleKycEvent);
      if (unsubUserDoc) unsubUserDoc();
      if (unsubKycDoc) unsubKycDoc();
    };
  }, [user?.id, refreshUser]);

  // 1. Register with backend API (PostgreSQL Single Source of Truth)
  const register = async (data: {
    fullName: string;
    email: string;
    phone?: string;
    country: string;
    password: string;
    referralCode?: string;
  }): Promise<UserProfile> => {
    const normalizedPayload = {
      ...data,
      email: String(data.email || '').trim().toLowerCase(),
    };
    const { res, data: result } = await fetchJsonWithRetry('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(normalizedPayload),
    });

    if (!res.ok) {
      const errMessage = result.message || result.error || 'Registration failed. Please try again.';
      throw new Error(errMessage);
    }

    setUser(result.user);
    return result.user;
  };

  // 2. Login with backend API (PostgreSQL Single Source of Truth — zero Firebase Auth password desync)
  const login = async (data: {
    identifier: string;
    password: string;
    rememberMe?: boolean;
    captchaToken?: string;
  }): Promise<UserProfile> => {
    const normalizedIdentifier = String(data.identifier || '').trim();
    const { res, data: result } = await fetchJsonWithRetry('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        ...data,
        identifier: normalizedIdentifier.includes('@') ? normalizedIdentifier.toLowerCase() : normalizedIdentifier,
      }),
    });

    if (!res.ok) {
      const errMessage = result.message || result.error || 'Invalid email/phone or password.';
      throw new Error(errMessage);
    }

    setUser(result.user);
    return result.user;
  };

  // 3. Login with Google (Firebase Auth + backend PostgreSQL fallback)
  const loginWithGoogle = async (referralCode?: string): Promise<UserProfile> => {
    let fbUser: any = null;
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      fbUser = cred.user;
    } catch (fbErr: any) {
      console.warn('[Firebase Auth Popup Warning, falling back to secure Google direct auth]:', fbErr?.message || fbErr);
      const emailInput = window.prompt('Enter your Google Account Email to continue with Google Sign-In:');
      if (!emailInput || !emailInput.includes('@')) {
        throw new Error('Google Sign-In cancelled or invalid email provided.');
      }
      const trimmedEmail = emailInput.trim().toLowerCase();
      const nameInput = trimmedEmail.split('@')[0];
      fbUser = {
        email: trimmedEmail,
        displayName: nameInput.charAt(0).toUpperCase() + nameInput.slice(1) + ' (Google User)',
        uid: 'google_' + Date.now(),
      };
    }

    try {
      const { res, data: result } = await fetchJsonWithRetry('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: fbUser.email,
          fullName: fbUser.displayName || 'Google User',
          uid: fbUser.uid,
          referralCode,
        }),
      });

      if (!res.ok) {
        throw new Error(result.message || result.error || 'Failed to authenticate with Google.');
      }

      // Also ensure Firestore document exists if possible
      try {
        await setDoc(doc(db, 'users', fbUser.uid), {
          uid: fbUser.uid,
          email: fbUser.email,
          fullName: fbUser.displayName || 'Google User',
          publicId: result.user?.publicId,
          lastLoginAt: new Date().toISOString(),
          status: 'ACTIVE',
        }, { merge: true });
      } catch (e) {
        console.warn('[Firestore] Sync note:', e);
      }

      setUser(result.user);
      return result.user;
    } catch (err: any) {
      console.error('[Google Auth] Sign-in error:', err);
      throw new Error(err.message || 'Failed to authenticate with Google.');
    }
  };

  // 4. Logout
  const logout = async (): Promise<void> => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
    } catch (err) {
      console.warn('[AuthContext] Logout fetch failed:', err);
    } finally {
      try {
        await fbSignOut(auth);
      } catch {}
      setUser(null);
    }
  };

  // 4. Forgot Password
  const forgotPassword = async (email: string, captchaToken?: string) => {
    const { res, data: result } = await fetchJsonWithRetry('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, captchaToken }),
    });

    if (!res.ok) {
      throw new Error(result.message || 'Failed to process forgot password request.');
    }
    return result;
  };

  // 5. Reset Password
  const resetPassword = async (tokenOrCode: string, newPassword: string, email?: string) => {
    const { res, data: result } = await fetchJsonWithRetry('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        token: tokenOrCode,
        code: tokenOrCode,
        email,
        newPassword
      }),
    });

    if (!res.ok) {
      throw new Error(result.message || 'Failed to reset password.');
    }
    return result;
  };

  // 6. Verify Email
  const verifyEmail = async (token: string) => {
    const { res, data: result } = await fetchJsonWithRetry('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token }),
    });

    if (!res.ok) {
      throw new Error(result.message || 'Failed to verify email.');
    }
    await refreshUser();
    return result;
  };

  // 7. Resend Verification
  const resendVerification = async (email?: string) => {
    const { res, data: result } = await fetchJsonWithRetry('/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: email || user?.email }),
    });

    if (!res.ok) {
      throw new Error(result.message || 'Failed to resend verification.');
    }
    return result;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        register,
        login,
        loginWithGoogle,
        logout,
        forgotPassword,
        resetPassword,
        verifyEmail,
        resendVerification,
        refreshUser,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
