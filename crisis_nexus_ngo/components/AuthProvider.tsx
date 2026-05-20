"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User, signOut } from "firebase/auth";
import { db, auth } from "../lib/firebase";
import { doc, getDoc } from "firebase/firestore";

export type AuthState = "loading" | "unauthenticated" | "authenticated";
export type ProfileState = "loading" | "missing" | "exists" | "error";
export type OperatorRole = "coordinator" | "medical_team" | "logistics" | "rescue" | "observer";

export interface OperatorProfile {
  uid: string;
  email: string;
  displayName: string; // mapped to Firestore name
  phone: string;
  ngoId: string;
  role: OperatorRole;
  isActive: boolean;
  createdAt: string;
}

interface AuthContextProps {
  user: User | null;
  operatorProfile: OperatorProfile | null;
  authState: AuthState;
  profileState: ProfileState;
  logout: () => Promise<void>;
  reloadProfile: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextProps | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [operatorProfile, setOperatorProfile] = useState<OperatorProfile | null>(null);
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [profileState, setProfileState] = useState<ProfileState>("loading");

  const loadProfile = async (uid: string): Promise<boolean> => {
    try {
      setProfileState("loading");
      const docRef = doc(db, "users", uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        
        // Force a token refresh to ensure custom claims are synchronized locally
        if (auth.currentUser) {
          try {
            await auth.currentUser.getIdToken(true);
            // Allow Firestore's internal AuthCredentialsProvider time to asynchronously ingest the refreshed token
            await new Promise(r => setTimeout(r, 500));
          } catch (tokenErr) {
            console.warn("[AUTH] Token refresh warning (non-fatal):", tokenErr);
          }
        }

        // Gate check 1: Prevent citizen accounts from entering the NGO dashboard
        if (data.role === "citizen") {
          console.warn("[SECURITY] Citizen profile blocked from NGO portal access:", uid);
          setOperatorProfile(null);
          setProfileState("error");
          setAuthState("unauthenticated");
          await signOut(auth);
          throw new Error("Access Denied: Citizen accounts are restricted from the NGO portal.");
        }
        
        // Gate check 2: Verify active state
        if (data.isActive === false) {
          console.warn("[SECURITY] Blocked inactive NGO operator profile access:", uid);
          setOperatorProfile(null);
          setProfileState("error");
          setAuthState("unauthenticated");
          await signOut(auth);
          throw new Error("Access Denied: Your operator profile has been deactivated.");
        }

        setOperatorProfile({
          uid: data.uid || uid,
          email: data.email || auth.currentUser?.email || "",
          displayName: data.name || "NGO Operator",
          phone: data.phone || "",
          ngoId: data.ngoId || "",
          role: ["coordinator", "medical_team", "logistics", "rescue", "observer"].includes(data.role)
            ? data.role
            : "observer",
          isActive: data.isActive !== false,
          createdAt: data.createdAt || ""
        });
        setProfileState("exists");
        setAuthState("authenticated");
        return true;
      } else {
        // Gate check 3: Block ghost users (authenticated in Auth but profile not in Firestore)
        console.warn("[SECURITY] Ghost profile detected:", uid);
        setOperatorProfile(null);
        setProfileState("missing");
        return false;
      }
    } catch (error: unknown) {
      console.error("Error loading operator profile from Firestore:", error);
      setOperatorProfile(null);
      setProfileState("error");
      throw error;
    }
  };

  const reloadProfile = async (): Promise<boolean> => {
    if (auth.currentUser) {
      return await loadProfile(auth.currentUser.uid);
    }
    return false;
  };

  useEffect(() => {
    // Standard Firebase Auth listener with strict gating
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setAuthState("loading");
      setProfileState("loading");
      if (currentUser) {
        setUser(currentUser);
        setAuthState("authenticated");
        try {
          await loadProfile(currentUser.uid);
        } catch (e) {
          // If profile loading fails, loadProfile already handles state changes
          console.warn("[AUTH] Initial profile load failed:", e);
        }
      } else {
        setUser(null);
        setOperatorProfile(null);
        setAuthState("unauthenticated");
        setProfileState("loading");
      }
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    setAuthState("loading");
    setProfileState("loading");
    setUser(null);
    setOperatorProfile(null);
    try {
      await signOut(auth);
    } catch (error: unknown) {
      console.error("Sign out error:", error);
    } finally {
      setAuthState("unauthenticated");
      setProfileState("loading");
    }
  };

  return (
    <AuthContext.Provider value={{ user, operatorProfile, authState, profileState, logout, reloadProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
