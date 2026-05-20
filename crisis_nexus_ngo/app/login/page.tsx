"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../components/AuthProvider";
import { auth } from "../../lib/firebase";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendEmailVerification, 
  sendPasswordResetEmail,
  signOut
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { 
  ShieldAlert, 
  Lock, 
  ArrowRight, 
  RefreshCw, 
  AlertCircle,
  CheckCircle2,
  Info,
  User as UserIcon,
  Briefcase,
  UserCheck,
  UserPlus,
  Mail,
  Eye,
  EyeOff,
  Send,
  ArrowLeft,
  Phone,
  Building
} from "lucide-react";

type AuthErrorLike = { code?: string; message?: string };

const getAuthErrorMessage = (error: unknown, fallback: string) => {
  const authError = error as AuthErrorLike;
  if (authError?.message) return authError.message;
  return fallback;
};

export default function LoginPage() {
  const router = useRouter();
  const { authState, reloadProfile } = useAuth();
  
  // Custom Dynamic Login States
  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin");
  const [viewState, setViewState] = useState<"form" | "reset_password" | "verify_email">("form");
  const [showPassword, setShowPassword] = useState(false);
  
  // Registration Inputs
  const [fullName, setFullName] = useState("");
  const [operatorRole, setOperatorRole] = useState("coordinator");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [ngoId, setNgoId] = useState("EDHI-PK");
  
  // Common Inputs
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  // Intercept authentication flow
  useEffect(() => {
    if (authState === "authenticated" && auth.currentUser) {
      router.push("/");
    }
  }, [authState, router]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailAddress || !password) {
      setError("Please fill in all credentials.");
      return;
    }

    setError("");
    setInfoMessage("");
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, emailAddress.trim(), password);
      
      const profileExists = await reloadProfile();
      if (!profileExists) {
        await signOut(auth);
        setError("Access Denied: Operator profile not found in centralized registry. Please register first.");
      } else {
        router.push("/");
      }
      setLoading(false);
    } catch (err: unknown) {
      console.error("Sign-in failure:", err);
      if (auth.currentUser) {
        try {
          await signOut(auth);
        } catch {
          // ignore secondary sign-out failure
        }
      }
      const authError = err as AuthErrorLike;
      if (authError.code === "auth/invalid-credential" || authError.code === "auth/user-not-found" || authError.code === "auth/wrong-password") {
        setError("Invalid operator credentials. Please confirm email and password.");
      } else if (authError.code === "auth/too-many-requests") {
        setError("Account temporarily locked due to consecutive failed login attempts. Try again later.");
      } else {
        setError(getAuthErrorMessage(err, "Authentication failed. Please check network coordinates."));
      }
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !emailAddress || !password || !phoneNumber || !ngoId) {
      setError("Please fill in all registration parameters.");
      return;
    }

    if (password.length < 6) {
      setError("Security password must be at least 6 characters.");
      return;
    }

    // Pakistani phone number format validation
    const cleanPhone = phoneNumber.trim();
    if (!/^(?:\+92|03)[0-9]{9}$/.test(cleanPhone)) {
      setError("Valid Pakistani format required (e.g. +923001234567 or 03001234567).");
      return;
    }

    setError("");
    setInfoMessage("");
    setLoading(true);

    const targetEmail = emailAddress.trim().toLowerCase();

    try {
      // Create user credential
      const userCredential = await createUserWithEmailAndPassword(auth, targetEmail, password);
      const user = userCredential.user;

      // Write user operator profile record to centralized Firestore `/users`
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        name: fullName,
        phone: cleanPhone,
        ngoId: ngoId,
        role: operatorRole, // coordinator | medical_team | logistics | rescue | observer
        isActive: true,
        email: targetEmail,
        createdAt: new Date().toISOString()
      });

      // Bypass email verification
      setLoading(false);
      router.push("/");
    } catch (err: unknown) {
      console.error("Sign-up failure:", err);
      const authError = err as AuthErrorLike;
      if (authError.code === "auth/email-already-in-use") {
        setError("This operator email address is already registered in the National Portal.");
      } else if (authError.code === "auth/invalid-email") {
        setError("Invalid email syntax. Verify your domain identifier.");
      } else {
        setError(getAuthErrorMessage(err, "Failed to register operator unit."));
      }
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) {
      setError("Please specify the operator email address.");
      return;
    }

    setError("");
    setInfoMessage("");
    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, resetEmail.trim());
      setInfoMessage(`Password reset link dispatched to ${resetEmail.trim()}. Check your inbox.`);
      setLoading(false);
    } catch (err: unknown) {
      console.error("Password reset failure:", err);
      const authError = err as AuthErrorLike;
      if (authError.code === "auth/user-not-found") {
        setError("Operator email is not registered in the National Portal.");
      } else {
        setError(getAuthErrorMessage(err, "Failed to dispatch password recovery link."));
      }
      setLoading(false);
    }
  };

  const checkVerificationStatus = async () => {
    setError("");
    setInfoMessage("");
    setLoading(true);

    if (auth.currentUser) {
      try {
        await auth.currentUser.reload();
        if (auth.currentUser.emailVerified) {
          const profileExists = await reloadProfile();
          if (!profileExists) {
            await signOut(auth);
            setError("Access Denied: Operator profile not found in centralized registry. Please register first.");
          } else {
            setInfoMessage("Email verified successfully! Authorizing portal entry...");
            setTimeout(() => {
              router.push("/");
            }, 1200);
          }
        } else {
          setError("Portal Verification Lock: You have not verified your email yet. Please click the security link in your inbox.");
        }
      } catch (err: unknown) {
        console.error("Email reload failed:", err);
        if (auth.currentUser) {
          try {
            await signOut(auth);
          } catch {
            // ignore secondary sign-out failure
          }
        }
        setError(getAuthErrorMessage(err, "Failed to refresh operator verification status. Try again."));
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  };

  const resendVerification = async () => {
    setError("");
    setInfoMessage("");
    setLoading(true);

    if (auth.currentUser) {
      try {
        await sendEmailVerification(auth.currentUser);
        setInfoMessage("A fresh verification security link has been sent to your email.");
      } catch (err: unknown) {
        console.error("Verification resend error:", err);
        setError("Failed to dispatch fresh email activation link. Try again later.");
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  };

  const handleAbortSession = async () => {
    setError("");
    setInfoMessage("");
    setLoading(true);
    try {
      await signOut(auth);
      setViewState("form");
    } catch (err) {
      console.error("Session abort failure:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 selection:bg-red-500/30">
      
      {/* Glow ambient background elements */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-red-950/10 blur-[120px] pointer-events-none z-0" />
      <div className="absolute bottom-1/4 left-1/3 w-[300px] h-[300px] rounded-full bg-blue-950/10 blur-[100px] pointer-events-none z-0" />

      {/* Main card */}
      <div className="relative w-full max-w-md backdrop-blur-md bg-zinc-950/80 border border-zinc-900 rounded-3xl p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-10 space-y-6">
        
        {/* Top Branding Section */}
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="flex items-center justify-center drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]">
            <img src="/crisisnexus-loader.svg" alt="CrisisNexus Logo" className="w-14 h-14 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-100 uppercase tracking-widest">CrisisNexus NGO</h1>
            <p className="text-[10px] text-zinc-550 font-bold uppercase tracking-wider mt-1 leading-relaxed">
              National Incident Coordination Portal
            </p>
          </div>
        </div>

        {/* Global messages notifications */}
        {error && (
          <div className="p-3.5 bg-red-950/20 border border-red-900/40 text-red-400 text-xs rounded-xl flex items-start space-x-2 animate-shake">
            <AlertCircle className="w-4.5 h-4.5 flex-shrink-0 mt-0.5" />
            <span className="font-semibold leading-relaxed">{error}</span>
          </div>
        )}

        {infoMessage && (
          <div className="p-3.5 bg-emerald-950/20 border border-emerald-900/40 text-emerald-400 text-xs rounded-xl flex items-start space-x-2">
            <CheckCircle2 className="w-4.5 h-4.5 flex-shrink-0 mt-0.5" />
            <span className="font-semibold leading-relaxed">{infoMessage}</span>
          </div>
        )}

        {/* VIEW 1: STANDARD SIGNIN / SIGNUP CARD */}
        {viewState === "form" && (
          <>
            {/* Sliding tab switcher */}
            <div className="flex bg-zinc-900/50 p-1.5 rounded-2xl border border-zinc-900/80 relative">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("signin");
                  setError("");
                  setInfoMessage("");
                }}
                className={`flex-1 flex items-center justify-center space-x-2 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
                  activeTab === "signin" 
                    ? "bg-zinc-950 text-slate-100 border border-zinc-800 shadow" 
                    : "text-zinc-500 hover:text-zinc-350"
                }`}
              >
                <UserCheck className="w-4.5 h-4.5" />
                <span>Sign In Unit</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("signup");
                  setError("");
                  setInfoMessage("");
                }}
                className={`flex-1 flex items-center justify-center space-x-2 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
                  activeTab === "signup" 
                    ? "bg-zinc-950 text-slate-100 border border-zinc-800 shadow" 
                    : "text-zinc-500 hover:text-zinc-350"
                }`}
              >
                <UserPlus className="w-4.5 h-4.5" />
                <span>Register Unit</span>
              </button>
            </div>

            {activeTab === "signin" ? (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Operator Email</label>
                  <div className="relative rounded-lg shadow-inner">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      required
                      placeholder="operator@crisisnexus.pk"
                      value={emailAddress}
                      onChange={(e) => setEmailAddress(e.target.value)}
                      className="block w-full pl-10 pr-4 py-3 bg-zinc-900/50 border border-zinc-800 focus:border-red-900/50 focus:ring-1 focus:ring-red-900/20 rounded-lg text-sm text-slate-200 placeholder-zinc-655 focus:outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Access Password</label>
                    <button
                      type="button"
                      onClick={() => {
                        setViewState("reset_password");
                        setError("");
                        setInfoMessage("");
                      }}
                      className="text-[9px] font-bold text-zinc-500 hover:text-red-400 transition cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative rounded-lg shadow-inner">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder="Password credentials"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full pl-10 pr-10 py-3 bg-zinc-900/50 border border-zinc-800 focus:border-red-900/50 focus:ring-1 focus:ring-red-900/20 rounded-lg text-sm text-slate-200 placeholder-zinc-655 focus:outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500 hover:text-zinc-350"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center space-x-2 py-3 px-4 mt-6 bg-red-600 hover:bg-red-700 disabled:bg-zinc-850 disabled:text-zinc-500 rounded-lg text-sm font-bold text-slate-100 hover:shadow-[0_0_20px_rgba(220,38,38,0.2)] transition-all duration-200 cursor-pointer disabled:cursor-not-allowed uppercase tracking-wider"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Verifying Operators...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In Unit</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleSignUp} className="space-y-4">
                
                {/* Full Name */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Full Operator Name</label>
                  <div className="relative rounded-lg shadow-inner">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                      <UserIcon className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Capt. Haris Khan"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="block w-full pl-10 pr-4 py-3 bg-zinc-900/50 border border-zinc-800 focus:border-red-900/50 focus:ring-1 focus:ring-red-900/20 rounded-lg text-sm text-slate-200 placeholder-zinc-655 focus:outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Role select */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Operational Role Profile</label>
                  <div className="relative rounded-lg shadow-inner">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                      <Briefcase className="w-4 h-4" />
                    </div>
                    <select
                      value={operatorRole}
                      onChange={(e) => setOperatorRole(e.target.value)}
                      className="block w-full pl-10 pr-4 py-3 bg-zinc-900/50 border border-zinc-800 focus:border-red-900/50 focus:ring-1 focus:ring-red-900/20 rounded-lg text-sm text-slate-350 focus:outline-none transition-all appearance-none cursor-pointer"
                    >
                      <option className="bg-zinc-950 text-slate-350" value="coordinator">Coordinator</option>
                      <option className="bg-zinc-950 text-slate-350" value="medical_team">Medical Team</option>
                      <option className="bg-zinc-950 text-slate-350" value="logistics">Logistics Officer</option>
                      <option className="bg-zinc-950 text-slate-350" value="rescue">Rescue Squad Commander</option>
                      <option className="bg-zinc-950 text-slate-350" value="observer">Observer (Read-Only)</option>
                    </select>
                  </div>
                </div>

                {/* NGO ID dropdown */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">NGO / Organization ID</label>
                  <div className="relative rounded-lg shadow-inner">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                      <Building className="w-4 h-4" />
                    </div>
                    <select
                      value={ngoId}
                      onChange={(e) => setNgoId(e.target.value)}
                      className="block w-full pl-10 pr-4 py-3 bg-zinc-900/50 border border-zinc-800 focus:border-red-900/50 focus:ring-1 focus:ring-red-900/20 rounded-lg text-sm text-slate-355 focus:outline-none transition-all appearance-none cursor-pointer"
                    >
                      <option className="bg-zinc-950 text-slate-350" value="EDHI-PK">Edhi Foundation (Pakistan)</option>
                      <option className="bg-zinc-950 text-slate-350" value="CHHIPA-KHI">Chhipa Welfare (Karachi)</option>
                      <option className="bg-zinc-950 text-slate-350" value="RESCUE-1122">Emergency Rescue Service 1122</option>
                      <option className="bg-zinc-950 text-slate-350" value="NDMA-PK">NDMA Pakistan</option>
                      <option className="bg-zinc-950 text-slate-350" value="GLOBAL">Global Oversight Observer</option>
                    </select>
                  </div>
                </div>

                {/* Pakistani Phone Number input */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Operator Phone (Pakistan)</label>
                  <div className="relative rounded-lg shadow-inner">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                      <Phone className="w-4 h-4" />
                    </div>
                    <input
                      type="tel"
                      required
                      placeholder="e.g. +923001234567 or 03001234567"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="block w-full pl-10 pr-4 py-3 bg-zinc-900/50 border border-zinc-800 focus:border-red-900/50 focus:ring-1 focus:ring-red-900/20 rounded-lg text-sm text-slate-200 placeholder-zinc-655 focus:outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Email Address */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Operator Email</label>
                  <div className="relative rounded-lg shadow-inner">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      required
                      placeholder="operator@crisisnexus.pk"
                      value={emailAddress}
                      onChange={(e) => setEmailAddress(e.target.value)}
                      className="block w-full pl-10 pr-4 py-3 bg-zinc-900/50 border border-zinc-800 focus:border-red-900/50 focus:ring-1 focus:ring-red-900/20 rounded-lg text-sm text-slate-200 placeholder-zinc-655 focus:outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Access Password */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Access Password</label>
                  <div className="relative rounded-lg shadow-inner">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder="Minimum 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full pl-10 pr-10 py-3 bg-zinc-900/50 border border-zinc-800 focus:border-red-900/50 focus:ring-1 focus:ring-red-900/20 rounded-lg text-sm text-slate-200 placeholder-zinc-655 focus:outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500 hover:text-zinc-350"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center space-x-2 py-3 px-4 mt-6 bg-red-600 hover:bg-red-700 disabled:bg-zinc-850 disabled:text-zinc-500 rounded-lg text-sm font-bold text-slate-100 hover:shadow-[0_0_20px_rgba(220,38,38,0.2)] transition-all duration-200 cursor-pointer disabled:cursor-not-allowed uppercase tracking-wider"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Creating Operator Profile...</span>
                    </>
                  ) : (
                    <>
                      <span>Register Account</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}
          </>
        )}

        {/* VIEW 2: PASSWORD RECOVERY RESET FORM */}
        {viewState === "reset_password" && (
          <form onSubmit={handleResetPassword} className="space-y-5">
            <div className="flex items-center space-x-2 mb-2">
              <button
                type="button"
                onClick={() => {
                  setViewState("form");
                  setError("");
                  setInfoMessage("");
                }}
                className="p-1 hover:bg-zinc-900 rounded-lg text-zinc-400 hover:text-zinc-200 transition text-zinc-500 hover:text-zinc-300"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-450">Recover Password Coordinates</h2>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Registered Operator Email</label>
              <div className="relative rounded-lg shadow-inner">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  placeholder="operator@crisisnexus.pk"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="block w-full pl-10 pr-4 py-3 bg-zinc-900/50 border border-zinc-800 focus:border-red-900/50 focus:ring-1 focus:ring-red-900/20 rounded-lg text-sm text-slate-200 placeholder-zinc-655 focus:outline-none transition-all"
                />
              </div>
              <p className="text-[10px] text-zinc-650 font-semibold leading-relaxed">
                A password resetting token link will be sent dynamically via Firebase server nodes.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center space-x-2 py-3 px-4 bg-red-600 hover:bg-red-700 disabled:bg-zinc-850 disabled:text-zinc-500 rounded-lg text-sm font-bold text-slate-100 hover:shadow-[0_0_20px_rgba(220,38,38,0.2)] transition-all duration-200 cursor-pointer disabled:cursor-not-allowed uppercase tracking-wider"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Dispatching Link...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Dispatch Reset Link</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* VIEW 3: SECURE EMAIL VERIFICATION CHECK STATE */}
        {viewState === "verify_email" && (
          <div className="space-y-6 text-center py-2">
            <div className="flex flex-col items-center space-y-3.5">
              <div className="p-4 bg-yellow-950/20 border border-yellow-900/40 rounded-full shadow-inner animate-pulse">
                <Mail className="w-8 h-8 text-yellow-500" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-100 uppercase tracking-widest">Email Verification Required</h2>
                <p className="text-[10px] text-zinc-550 font-bold uppercase tracking-wider mt-1.5 leading-relaxed">
                  Security Activation Link Sent
                </p>
              </div>
            </div>

            <div className="p-4 bg-zinc-900/40 border border-zinc-900 rounded-2xl text-xs text-zinc-450 leading-relaxed text-left space-y-2">
              <p>
                A dynamic security clearance verification link has been dispatched to:
              </p>
              <p className="font-mono text-zinc-250 bg-zinc-950/60 p-2 rounded border border-zinc-900 break-all select-all text-center">
                {auth.currentUser?.email || emailAddress || "haris@crisisnexus.pk"}
              </p>
              <p className="text-[10px] text-zinc-550 font-medium">
                Please check your inbox (including your spam/junk folder) and click the link to authorize your NGO operator credentials.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={checkVerificationStatus}
                disabled={loading}
                className="w-full flex items-center justify-center space-x-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-850 disabled:text-zinc-500 rounded-lg text-sm font-bold text-slate-100 hover:shadow-[0_0_20px_rgba(16,185,129,0.2)] transition-all duration-200 cursor-pointer disabled:cursor-not-allowed uppercase tracking-wider"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Verify & Unlock Portal</span>
                )}
              </button>

              <div className="grid grid-cols-2 gap-3.5">
                <button
                  type="button"
                  onClick={resendVerification}
                  disabled={loading}
                  className="py-2.5 px-3 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 rounded-lg text-xs font-bold text-slate-300 cursor-pointer disabled:opacity-50"
                >
                  Resend Link
                </button>
                <button
                  type="button"
                  onClick={handleAbortSession}
                  disabled={loading}
                  className="py-2.5 px-3 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 rounded-lg text-xs font-bold text-red-400 cursor-pointer disabled:opacity-50"
                >
                  Return to Login
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Helper Diagnostics */}
        <div className="mt-8 pt-6 border-t border-zinc-900 space-y-2.5">
          <div className="flex items-start space-x-2.5 p-3.5 bg-zinc-900/30 border border-zinc-900 rounded-xl text-[10px] text-zinc-500 leading-normal">
            <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-zinc-400 block mb-1">Secure Operator Protocols:</span>
              Ensure you input credentials matching the Pakistani regional coordinate layout. Complete your email verification to fully unlock dashboard operations.
            </div>
          </div>
        </div>

        {/* Anchor reCAPTCHA */}
        <div id="recaptcha-container" className="absolute bottom-0 left-0 animate-pulse"></div>
      </div>
    </div>
  );
}
