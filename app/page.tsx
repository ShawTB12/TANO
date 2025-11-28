"use client"

import { useEffect, useRef, useState } from "react"
import type { KeyboardEvent } from "react"
import Image from "next/image"
import { Menu, MessageSquare, Plus, Search, Send, Settings, Sparkles, User, Bot, Loader2 } from "lucide-react"
import { LoginPage } from "@/components/login-page"

type Role = "assistant" | "user"

interface Message {
  id: string
  role: Role
  content: string
  isReferencingProfile?: boolean // プロフィール参照中かどうか
}

const INTRO_MESSAGE =
  "お疲れさん。今日は何について話そうか"

const FOLLOW_UP_MESSAGE =
  "例：「新しいプロジェクトのアイデアを出して」「ReactのuseEffectについて教えて」など。どのようなことでも聞いてください。"

const SUGGESTED_PROMPTS = [
  "営業戦略についてのご相談",
  "アカウントプラン作成について",
  "今後のキャリアについて",
]

const SAMPLE_THREADS = [
  { id: "thread-1", title: "来期の営業戦略について", timestamp: "今日 08:10" },
  { id: "thread-2", title: "A社への提案アプローチ", timestamp: "昨日 17:22" },
  { id: "thread-3", title: "チームマネジメントの悩み", timestamp: "昨日 09:05" },
  { id: "thread-4", title: "新規開拓の優先順位", timestamp: "日曜 21:14" },
]

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  // ログインしていない場合はログイン画面を表示
  if (!isLoggedIn) {
    return <LoginPage onLogin={() => setIsLoggedIn(true)} />
  }

  return <ChatInterface />
}

function ChatInterface() {
  const [isLoaded, setIsLoaded] = useState(false)
  const [messages, setMessages] = useState<Message[]>([{ id: "assistant-1", role: "assistant", content: "" }])
  const [inputValue, setInputValue] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isReferencingHR, setIsReferencingHR] = useState(false)
  const [isReferencingSalesforce, setIsReferencingSalesforce] = useState(false)
  const hasQueuedFollowUp = useRef(false)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  const [chatHistory, setChatHistory] = useState(SAMPLE_THREADS)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 100)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!isLoaded) return

    // 新規チャット（activeThreadIdがない）の場合のみアニメーションを実行
    if (activeThreadId) return

    let index = 0
    const interval = setInterval(() => {
      index += 1
      setMessages((prev) =>
        prev.map((message) =>
          message.id === "assistant-1"
            ? {
                ...message,
                content: INTRO_MESSAGE.slice(0, index),
              }
            : message,
        ),
      )
      if (index >= INTRO_MESSAGE.length) {
        clearInterval(interval)
      }
    }, 35)

    return () => clearInterval(interval)
  }, [isLoaded, activeThreadId])

  useEffect(() => {
    const intro = messages.find((message) => message.id === "assistant-1")
    if (intro && intro.content === INTRO_MESSAGE && !hasQueuedFollowUp.current) {
      hasQueuedFollowUp.current = true
      // フォローアップメッセージを表示しないようにコメントアウトまたは削除
      // const timeout = setTimeout(() => {
      //   setMessages((prev) => [
      //     ...prev,
      //     {
      //       id: "assistant-2",
      //       role: "assistant",
      //       content: FOLLOW_UP_MESSAGE,
      //     },
      //   ])
      // }, 500)
      // return () => clearTimeout(timeout)
    }
  }, [messages])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isGenerating])

  const handleSend = async (preset?: string) => {
    if (isGenerating) return

    const content = (preset ?? inputValue).trim()
    if (!content) return

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
    }

    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInputValue("")
    setIsGenerating(true)

    // 初めてのメッセージ送信時に履歴に追加
    if (!activeThreadId) {
      const newThreadId = `thread-${Date.now()}`
      setActiveThreadId(newThreadId)
      const newHistoryItem = {
        id: newThreadId,
        title: content.length > 20 ? content.slice(0, 20) + "..." : content,
        timestamp: "たった今"
      }
      setChatHistory(prev => [newHistoryItem, ...prev])
    }

    // キャリアや評価に関するキーワードが含まれている場合、HRデータ参照演出を表示
    const hrKeywords = ["キャリア", "評価", "強み", "経歴", "実績", "相談", "プロフィール"]
    
    // ユーザー入力が"キャリア"などのキーワードを含んでいるか、またはサジェストチップ（SUGGESTED_PROMPTSの3番目）からの入力であるかを判定
    // ただし、一般的な質問には反応しないように、キーワード一致の条件を厳しくするか、文脈を考慮する必要がありますが、
    // ここでは簡易的にキーワードマッチングを行っています。
    // 誤検知を防ぐため、"React"や"営業戦略"などの他の明確なトピックが含まれている場合は除外することも検討できますが、
    // 今回はシンプルにキーワードが含まれているかどうかで判定します。
    
    const isHrQuery = hrKeywords.some(keyword => content.includes(keyword))

    // 修正案: "営業戦略" や "アカウントプラン" は除外キーワードとして設定するか、
    // 逆にHR関連のキーワードをより具体的にする（"私のキャリア"など）
    // ここでは、「営業戦略」や「アカウントプラン」が含まれていない場合のみHR参照とするロジックに修正します。
    const businessKeywords = ["営業戦略", "アカウントプラン", "提案", "案件", "プロジェクト"]
    const isBusinessQuery = businessKeywords.some(keyword => content.includes(keyword))

    // HRキーワードが含まれていて、かつビジネスキーワードが含まれていない、または明示的に「キャリア」などの強いキーワードが含まれている場合
    const shouldShowHrAnimation = isHrQuery && (!isBusinessQuery || content.includes("キャリア") || content.includes("プロフィール"))

    // トヨタ、トヨタ自動車などのキーワードが含まれている場合
    const salesforceKeywords = ["トヨタ", "トヨタ自動車"]
    const shouldShowSalesforceAnimation = salesforceKeywords.some(keyword => content.includes(keyword))

    if (shouldShowHrAnimation) {
      setIsReferencingHR(true)
      // 演出のために少し待機
      await new Promise(resolve => setTimeout(resolve, 2000))
      setIsReferencingHR(false)
    } else if (shouldShowSalesforceAnimation) {
      setIsReferencingSalesforce(true)
      // 演出のために少し待機
      await new Promise(resolve => setTimeout(resolve, 2000))
      setIsReferencingSalesforce(false)
    }

    try {
      // API呼び出し用のメッセージ配列を作成（idを除外）
      const apiMessages = newMessages.map(({ role, content }) => ({
        role,
        content,
      }))

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: apiMessages }),
      })

      if (!response.ok) {
        throw new Error("API request failed")
      }

      const data = await response.json()

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.content,
        isReferencingProfile: shouldShowHrAnimation // プロフィールを参照した回答であることをマーク
      }
      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      console.error("Error:", error)
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: "申し訳ありません。エラーが発生しました。APIキーが正しく設定されているか確認してください。",
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsGenerating(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enterキーでの送信を無効化（Shift+Enterで改行はデフォルトの挙動なのでそのままでOK）
    // ただし、日本語入力（IME）確定時のEnterは無視する必要がある（ReactのonKeyDownはIME確定時も発火するが、isComposingプロパティで判定可能）
    if (event.nativeEvent.isComposing || event.key !== "Enter") return

    if (!event.shiftKey) {
      // Enterのみ押された場合、改行させずに何もしない（フォーム送信を防ぐ）
      event.preventDefault()
    }
  }

  const handleNewChat = () => {
    // チャット履歴をリセットして初期状態に戻す
    setMessages([{ id: "assistant-1", role: "assistant", content: "続いて何を話そうか？なんでも相談してくれ" }])
    setInputValue("")
    setIsLoaded(false) // ローディングアニメーションを再実行させるため
    setActiveThreadId(null)
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden text-white">
      <Image
        src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?q=80&w=2070&auto=format&fit=crop"
        alt="Background"
        fill
        className="object-cover -z-10"
        priority
      />
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950/90 via-blue-900/82 to-cyan-900/70 backdrop-blur-sm -z-10" />

      <header
        className={`absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-8 py-6 ${isLoaded ? "opacity-100 animate-fade-in" : "opacity-100"}`}
        style={{ animationDelay: "0.15s" }}
      >
        <div className="flex items-center gap-4">
          <Menu className="h-8 w-8 text-white/95" />
          <span className="text-4xl font-semibold text-white drop-shadow-lg">TANOUE AGENT</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-6 w-6 -translate-y-1/2 text-white/90" />
            <input
              type="text"
              placeholder="検索"
              className="rounded-full bg-white/50 backdrop-blur-sm pl-10 pr-4 py-2.5 text-xl text-white placeholder:text-white/90 border border-white/35 focus:outline-none focus:ring-2 focus:ring-white/45"
            />
          </div>
          <Settings className="h-6 w-6 text-white/95 drop-shadow-md" />
          <div className="h-10 w-10 rounded-full bg-white/40 flex items-center justify-center text-white font-semibold shadow-md">
            AI
          </div>
        </div>
      </header>

      <main className="relative h-screen w-full pt-20 flex z-0">
        <aside
          className={`w-72 h-full bg-white/50 backdrop-blur-lg px-5 py-6 shadow-xl border-r border-white/30 rounded-tr-3xl ${
            isLoaded ? "opacity-100 animate-fade-in" : "opacity-100"
          } flex flex-col z-0`}
          style={{ animationDelay: "0.3s" }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-wide text-white uppercase">チャット履歴</h2>
            <button 
              onClick={handleNewChat}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/50 text-white transition hover:bg-white/60"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="relative mt-5 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-6 w-6 -translate-y-1/2 text-white" />
              <input
                type="text"
                placeholder="履歴を検索"
                className="w-full rounded-xl bg-white/40 px-10 py-2.5 text-xl text-white placeholder:text-white/85 border border-white/30 focus:outline-none focus:ring-2 focus:ring-white/40"
              />
            </div>
            
            <button
              onClick={handleNewChat}
              className="w-full flex items-center gap-3 rounded-xl bg-gradient-to-r from-cyan-500/80 to-blue-600/80 px-4 py-3 text-white shadow-lg transition hover:from-cyan-400/90 hover:to-blue-500/90 border border-white/20"
            >
              <Plus className="h-5 w-5" />
              <span className="font-bold">新規チャット</span>
            </button>
          </div>

          <div className="mt-6 space-y-3 overflow-y-auto pr-1">
            {chatHistory.map((thread) => (
              <button
                key={thread.id}
                className={`w-full rounded-2xl border px-4 py-3.5 text-left text-xl transition ${
                  activeThreadId === thread.id 
                    ? "border-white/60 bg-white/60 text-white" 
                    : "border-white/30 bg-white/35 text-white hover:border-white/45 hover:bg-white/50"
                }`}
              >
                <div className="flex items-center gap-2 text-white">
                  <MessageSquare className="h-6 w-6" />
                  <span className="text-lg">{thread.timestamp}</span>
                </div>
                <div className="mt-1.5 font-medium text-white">{thread.title}</div>
              </button>
            ))}
          </div>
        </aside>

        <section
          className={`relative flex-1 flex flex-col z-0 ${isLoaded ? "opacity-100 animate-fade-in" : "opacity-100"}`}
          style={{ animationDelay: "0.45s" }}
        >
          <div className="flex items-center justify-between border-b border-white/30 px-8 py-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/50 shadow-lg">
                <Sparkles className="h-6 w-6 text-cyan-200" />
              </div>
              <div>
                <h1 className="text-4xl font-semibold text-white">TANOUE AGENT</h1>
                <p className="text-xl text-white">あなたの創造性をサポートします</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="rounded-full border border-white/35 bg-white/40 px-4 py-2 text-xl text-white transition hover:bg-white/50">
                モデル: GPT-5.1 (Preview)
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-8 py-8 space-y-4">
            {messages.map((message) => {
              const isAssistant = message.role === "assistant"
              const containerWidth = isAssistant ? "max-w-[80%]" : "max-w-[68%]"
              return (
                <div
                  key={message.id}
                  className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}
                >
                  <div className={`flex gap-3 ${containerWidth} ${isAssistant ? "flex-row" : "flex-row-reverse"}`}>
                    <div className={`flex-shrink-0 h-16 w-16 rounded-full flex items-center justify-center overflow-hidden ${isAssistant ? "bg-cyan-600" : "bg-blue-600"}`}>
                        {isAssistant ? (
                          <Image 
                            src="/TANOUE.png" 
                            alt="TANOUE AGENT" 
                            width={64} 
                            height={64} 
                            className="w-full h-full object-cover scale-125"
                          />
                        ) : (
                          <User className="h-6 w-6 text-white" />
                        )}
                    </div>
                    <div
                      className={`w-full rounded-3xl px-6 py-5 text-xl leading-relaxed shadow-xl whitespace-pre-wrap ${
                        isAssistant
                          ? "bg-white/55 text-white backdrop-blur-lg border border-white/35"
                          : "bg-cyan-500/90 text-white"
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                </div>
              )
            })}

            {isGenerating && (
              <div className="flex justify-start">
                <div className="flex items-center gap-3 rounded-3xl border border-white/35 bg-white/45 px-5 py-4 text-xl text-white shadow-lg backdrop-blur-lg">
                  {isReferencingHR ? (
                    <>
                      <Loader2 className="h-7 w-7 animate-spin text-yellow-300" />
                      <span className="text-yellow-100 font-medium">HRデータ参照中...</span>
                    </>
                  ) : isReferencingSalesforce ? (
                    <>
                      <Loader2 className="h-7 w-7 animate-spin text-blue-300" />
                      <span className="text-blue-100 font-medium">Salesforceデータ参照中...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-7 w-7 animate-pulse text-cyan-200" />
                      <span>田上本部長が考え中...</span>
                    </>
                  )}
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="px-8 pb-10">
            <div className="flex flex-wrap gap-3 pb-4">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSend(prompt)}
                  className="rounded-full border border-white/35 bg-white/40 px-5 py-2.5 text-lg text-white transition hover:border-white/50 hover:bg-white/50"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="flex items-end gap-3 rounded-3xl border border-white/35 bg-white/50 p-5 shadow-2xl backdrop-blur-lg">
              <textarea
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="メッセージを入力..."
                className="h-12 flex-1 resize-none bg-transparent text-xl text-white placeholder:text-white/85 focus:outline-none"
                disabled={isGenerating}
              />
              <button
                onClick={() => handleSend()}
                disabled={isGenerating || !inputValue.trim()}
                className="mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/90 text-white transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-white/40"
                aria-label="送信"
              >
                <Send className="h-6 w-6" />
              </button>
            </div>
            <p className="mt-4 text-center text-lg text-white">
              AIは不正確な情報を生成する可能性があります。重要な情報は確認してください。
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}
