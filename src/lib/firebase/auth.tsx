import { createContext, useContext, useEffect, useState } from "react";
import { User, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./config";
import { Chrome } from "lucide-react"; // Using Chrome icon as Google proxy

interface AuthContextType {
    user: User | null;
    loading: boolean;
    isAllowed: boolean | null; // null = checking, false = denied, true = allowed
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true, isAllowed: null });

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [isAllowed, setIsAllowed] = useState<boolean | null>(null);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(async (u) => {
            setUser(u);

            if (u) {
                // Build: Check whitelist in Firestore
                try {
                    const userDocRef = doc(db, "allowedUsers", u.uid);
                    const userDoc = await getDoc(userDocRef);

                    if (userDoc.exists() && userDoc.data().allowed === true) {
                        setIsAllowed(true);
                    } else {
                        console.warn("User is not in whitelist or not allowed.");
                        setIsAllowed(false);
                    }
                } catch (e) {
                    console.error("Error checking whitelist:", e);
                    setIsAllowed(false);
                }
            } else {
                setIsAllowed(null);
                // No auto sign-in for Google Auth
            }
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    const handleGoogleLogin = async () => {
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("Google auth failed", error);
            alert("Google Sign-in failed. Please try again.");
        }
    };

    if (loading) {
        return <div className="h-screen w-screen flex items-center justify-center text-primary">Loading...</div>;
    }

    if (!user) {
        return (
            <div className="h-screen w-screen flex flex-col items-center justify-center bg-gray-50 p-4">
                <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full text-center">
                    <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-white font-bold text-xl mx-auto mb-4">
                        T
                    </div>
                    <h1 className="text-2xl font-bold mb-2 text-gray-800">Welcome to Titanium</h1>
                    <p className="text-gray-500 mb-8">Sign in to access your thought-support notes.</p>

                    <button
                        onClick={handleGoogleLogin}
                        className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-3 px-4 rounded-xl transition-all active:scale-95"
                    >
                        {/* Simple Google Icon representation */}
                        <Chrome size={20} className="text-blue-500" />
                        Sign in with Google
                    </button>
                </div>
            </div>
        );
    }

    if (isAllowed === false) {
        return (
            <div className="h-screen w-screen flex flex-col items-center justify-center bg-gray-50 text-gray-600 p-4 text-center">
                <h2 className="text-xl font-bold mb-2">Access Denied</h2>
                <p className="max-w-md mb-6">
                    Your User ID is <code className="bg-gray-200 px-2 py-1 rounded select-all">{user.uid}</code>.<br />
                    Please ask the administrator to approve this ID in the <code>allowedUsers</code> collection.
                </p>
                <button onClick={() => auth.signOut()} className="text-sm text-gray-400 hover:underline">
                    Sign Out
                </button>
            </div>
        );
    }

    return (
        <AuthContext.Provider value={{ user, loading, isAllowed }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
