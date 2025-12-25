import { createContext, useContext, useEffect, useState } from "react";
import { User, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./config";
import { Chrome } from "lucide-react"; // Using Chrome icon as Google proxy
import { Link, useLocation } from "react-router-dom";

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
    const [lang, setLang] = useState<"en" | "jp">("jp");
    const isJP = lang === "jp";
    const location = useLocation();
    const isDemoRoute = location.pathname === "/demo";

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

    if (loading && !isDemoRoute) {
        return <div className="h-[100dvh] w-screen flex items-center justify-center text-primary">Loading...</div>;
    }

    if (!user && !isDemoRoute) {
        return (
            <div className="min-h-[100dvh] w-screen bg-gradient-to-br from-emerald-50 via-white to-slate-50 text-gray-800">
                <div className="mx-auto w-full max-w-6xl px-6 py-10 lg:py-16">
                    <div className="flex items-center justify-end">
                        <LanguageToggle isJP={isJP} onToggle={() => setLang(l => (l === "jp" ? "en" : "jp"))} />
                    </div>

                    <div className="mt-8 grid gap-10 lg:grid-cols-[1.3fr_0.7fr] lg:items-start">
                        <div>
                            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-gray-500 shadow-sm border border-gray-100">
                                <span className="material-symbols-outlined text-[16px]">lightbulb</span>
                                {isJP ? "思考の流れを止めないノート" : "Notes that keep thinking in motion"}
                            </div>
                            <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight">
                                {isJP ? "Titanium" : "Titanium"}
                            </h1>
                            <p className="mt-3 text-lg text-gray-600">
                                {isJP
                                    ? "書く -> つながる -> 混ざる。AIを触媒に、アイデア同士が自然に反応する場を作ります。"
                                    : "Write -> connect -> synthesize. AI acts as a catalyst so ideas can naturally react."}
                            </p>
                            <p className="mt-4 text-gray-600 leading-relaxed">
                                {isJP
                                    ? "今書いている内容から関連ノートを引き寄せ、Mixで新しい視点を作る。Markdown対応で数秒ごとに自動保存されます。"
                                    : "It pulls related notes from what you’re writing and creates new angles with Mix. Markdown-ready and auto-saved in seconds."}
                            </p>

                            <div className="mt-6 rounded-2xl border border-emerald-100 bg-white/90 p-5 shadow-sm">
                                <div className="text-sm font-semibold text-gray-600">
                                    {isJP ? "コンセプト図" : "Concept Flow"}
                                </div>
                                <div className="mt-4 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
                                    <ConceptStep
                                        icon="edit"
                                        title={isJP ? "書く" : "Write"}
                                        description={isJP ? "素早く書いて、自動保存。" : "Write fast with auto-save."}
                                    />
                                    <span className="material-symbols-outlined mx-auto text-gray-300 rotate-90 sm:rotate-0">arrow_forward</span>
                                    <ConceptStep
                                        icon="link"
                                        title={isJP ? "つながる" : "Connect"}
                                        description={isJP ? "文脈で関連ノートを発見。" : "Discover related notes by context."}
                                    />
                                    <span className="material-symbols-outlined mx-auto text-gray-300 rotate-90 sm:rotate-0">arrow_forward</span>
                                    <ConceptStep
                                        icon="science"
                                        title={isJP ? "混ざる" : "Mix"}
                                        description={isJP ? "アイデアを合成して発展。" : "Synthesize ideas into new insights."}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-8 rounded-2xl shadow-xl w-full text-center border border-gray-100">
                            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-white font-bold text-xl mx-auto mb-4">
                                T
                            </div>
                            <h2 className="text-2xl font-bold mb-2 text-gray-800">
                                {isJP ? "ようこそ、Titaniumへ" : "Welcome to Titanium"}
                            </h2>
                            <p className="text-gray-500 mb-8">
                                {isJP ? "Googleでログインして、あなたのノートを始めましょう。" : "Sign in with Google to start your notes."}
                            </p>

                            <button
                                onClick={handleGoogleLogin}
                                className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-3 px-4 rounded-xl transition-all active:scale-95"
                                type="button"
                            >
                                {/* Simple Google Icon representation */}
                                <Chrome size={20} className="text-blue-500" />
                                {isJP ? "Googleでログイン" : "Sign in with Google"}
                            </button>
                            <Link
                                to="/demo"
                                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
                            >
                                <span className="material-symbols-outlined text-[18px]">play_circle</span>
                                {isJP ? "デモを試す (編集不可)" : "Try demo (read-only)"}
                            </Link>
                            <p className="mt-4 text-xs text-gray-400">
                                {isJP
                                    ? "ログイン後、利用には管理者の承認が必要な場合があります。"
                                    : "After signing in, admin approval may be required."}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (isAllowed === false && !isDemoRoute) {
        return (
            <div className="min-h-[100dvh] w-screen flex items-center justify-center bg-gray-50 text-gray-700 p-6">
                <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl border border-gray-100 text-center">
                    <div className="flex justify-end">
                        <LanguageToggle isJP={isJP} onToggle={() => setLang(l => (l === "jp" ? "en" : "jp"))} />
                    </div>
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                        <span className="material-symbols-outlined text-[22px]">hourglass_top</span>
                    </div>
                    <h2 className="text-2xl font-bold mb-2">
                        {isJP ? "承認待ちです" : "Approval Pending"}
                    </h2>
                    <p className="text-gray-600 leading-relaxed">
                        {isJP
                            ? "Googleログインは完了しました。現在、このアカウントは承認待ちです。管理者の承認が完了するまでお待ちください。"
                            : "You’re signed in with Google, but this account isn’t approved yet. Please wait for admin approval."}
                    </p>
                    <div className="mt-4 text-xs text-gray-500">
                        {isJP ? "ユーザーID" : "User ID"}:{" "}
                        <code className="bg-gray-100 px-2 py-1 rounded select-all">{user?.uid ?? "unknown"}</code>
                    </div>
                    <p className="mt-3 text-xs text-gray-400">
                        {isJP
                            ? "必要に応じて、このIDを管理者に共有してください。"
                            : "Share this ID with the admin if needed."}
                    </p>
                    <button
                        onClick={() => auth.signOut()}
                        className="mt-6 text-sm text-gray-400 hover:underline"
                        type="button"
                    >
                        {isJP ? "サインアウト" : "Sign Out"}
                    </button>
                </div>
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

const LanguageToggle = ({ isJP, onToggle }: { isJP: boolean; onToggle: () => void }) => (
    <button
        onClick={onToggle}
        className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 shadow-sm hover:bg-gray-50"
        type="button"
    >
        <span className="material-symbols-outlined text-[18px]">language</span>
        {isJP ? "English" : "日本語"}
    </button>
);

const ConceptStep = ({
    icon,
    title,
    description
}: {
    icon: string;
    title: string;
    description: string;
}) => (
    <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
        <span className="material-symbols-outlined text-[20px] text-emerald-600">{icon}</span>
        <div className="text-left">
            <div className="text-sm font-semibold text-gray-700">{title}</div>
            <div className="text-xs text-gray-500">{description}</div>
        </div>
    </div>
);
