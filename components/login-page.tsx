"use client"

import { useState, type FormEvent } from "react"
import Image from "next/image"
import { Lock, User } from "lucide-react"

interface LoginPageProps {
  onLogin: () => void
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    // 簡易的な認証シミュレーション
    // 実際の実装ではAPI呼び出しなどを行う
    await new Promise(resolve => setTimeout(resolve, 1000))

    if (username === "MANABU" && password === "TANOUESB") {
      onLogin()
    } else {
      setError("ユーザー名またはパスワードが正しくありません")
    }
    setIsLoading(false)
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden flex items-center justify-center">
      {/* 背景画像 */}
      <Image
        src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?q=80&w=2070&auto=format&fit=crop"
        alt="Background"
        fill
        className="object-cover -z-10"
        priority
      />
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950/90 via-blue-900/82 to-cyan-900/70 backdrop-blur-sm -z-10" />

      <div className="w-full max-w-md p-8 rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl animate-fade-in">
        <div className="text-center mb-8">
          <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 p-1 shadow-lg">
            <div className="w-full h-full rounded-full overflow-hidden bg-white">
              <Image 
                src="/TANOUE.png" 
                alt="TANOUE AGENT" 
                width={96} 
                height={96} 
                className="w-full h-full object-cover scale-110"
              />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">TANOUE AGENT</h1>
          <p className="text-blue-100">田上本部長へのアクセス</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <div className="relative group">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/60 group-focus-within:text-cyan-300 transition-colors" />
              <input
                type="text"
                placeholder="ユーザー名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-xl py-3 pl-12 pr-4 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-transparent transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/60 group-focus-within:text-cyan-300 transition-colors" />
              <input
                type="password"
                placeholder="パスワード"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-xl py-3 pl-12 pr-4 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-transparent transition-all"
              />
            </div>
          </div>

          {error && (
            <div className="text-red-300 text-sm text-center bg-red-500/20 py-2 rounded-lg border border-red-500/30">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold py-3.5 rounded-xl shadow-lg transform transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>認証中...</span>
              </>
            ) : (
              <span>ログイン</span>
            )}
          </button>
        </form>
        
        <p className="mt-6 text-center text-sm text-white/40">
          Authorized Personnel Only
        </p>
      </div>
    </div>
  )
}

