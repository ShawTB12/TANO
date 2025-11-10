"use client"

import { useEffect, useRef, useState } from "react"
import type { KeyboardEvent } from "react"
import Image from "next/image"
import { Loader2, Menu, MessageSquare, Plus, Search, Send, Settings, Sparkles } from "lucide-react"

type Role = "assistant" | "user"

interface Message {
  id: string
  role: Role
  content: string
}

const INTRO_MESSAGE =
  "株式会社ユニカ 納期回答エージェント『AgenticAI for Unica』です。案件名（型番）と数量を指定いただければ、コンセプトLT・在庫・製造負荷を自動参照し、出荷シミュレーションの最短案と代替案を提示します。"

const FOLLOW_UP_MESSAGE =
  "例：「案件名: 4CBTY2 8台で出荷シミュレーション」「4CBM10を5台で在庫優先案も」。型番をそのまま入力していただいて大丈夫です。"

const SUGGESTED_PROMPTS = [
  "案件名: 4CBTY2 8台で出荷シミュレーション",
  "4CBTYK4 を至急案件として4台で評価して",
  "案件名: 3CB5 5台 / 製造負荷を前提に提案して",
  "案件名: 4CBM10 6台 / 代替案も比較して",
]

const SAMPLE_THREADS = [
  { id: "thread-1", title: "4CBTY2 8台 最短案確認", timestamp: "今日 08:10" },
  { id: "thread-2", title: "4CBT3 6台 在庫優先案", timestamp: "昨日 17:22" },
  { id: "thread-3", title: "3cB10 7台 製造負荷チェック", timestamp: "昨日 09:05" },
  { id: "thread-4", title: "4CBM10 5台 需要計画連携", timestamp: "日曜 21:14" },
]

type LoadSeverity = "低負荷" | "中負荷" | "高負荷"

interface ReferenceSnapshot {
  conceptLT: {
    variant: string
    days: number
    reason: string
  }
  inventory: {
    sku: string
    available: number
    reserved: number
    comment: string
  }
  productionLoad: {
    line: string
    utilization: number
    severity: LoadSeverity
    comment: string
  }
}

interface SimulationPlan {
  label: string
  shipDate: string
  leadTimeDays: number
  allocation: string
  manufacturingWindow: string
  risk: string
  note: string
}

interface SimulationProfile {
  defaultQuantity: number
  priority: "通常" | "至急" | "試作"
  references: ReferenceSnapshot
  plans: SimulationPlan[]
}

const REFERENCE_NOTE =
  "コンセプトLTは量産立ち上がり時に確定したリードタイム指標です。製造負荷はロット計画から自動算出されます。"

const SIMULATION_LIBRARY: Record<string, SimulationProfile> = {
  "4CBTY2": {
    defaultQuantity: 8,
    priority: "通常",
    references: {
      conceptLT: {
        variant: "LT-β / 7日",
        days: 7,
        reason: "端末フレーム段取り替えに平均10hを見込む",
      },
      inventory: {
        sku: "4CBTY2-構成ユニット",
        available: 10,
        reserved: 2,
        comment: "安全在庫2台を保持。追加生産で即時補充可能。",
      },
      productionLoad: {
        line: "L2（筐体アセンブリ）",
        utilization: 68,
        severity: "中負荷",
        comment: "夜勤スロットが2枠空いており対応余地あり。",
      },
    },
    plans: [
      {
        label: "最短：在庫活用＋小ロット生産",
        shipDate: "2025-11-15",
        leadTimeDays: 5,
        allocation: "在庫6台 + 追加生産2台",
        manufacturingWindow: "11/11 夜勤で2台追加組立 → 11/13 QA",
        risk: "夜勤増員が必要。対応確保済みなら低リスク。",
        note: "安全在庫は0台になるが週末でリカバリ予定。",
      },
      {
        label: "代替：全量通常シフト",
        shipDate: "2025-11-18",
        leadTimeDays: 8,
        allocation: "通常シフトで8台新規生産",
        manufacturingWindow: "11/12〜11/15 日勤で分散生産",
        risk: "他案件を1日後ろ倒し。負荷平準化は確保。",
        note: "在庫は維持できるが納期は若干延伸。",
      },
    ],
  },
  "4CBTYK4": {
    defaultQuantity: 4,
    priority: "至急",
    references: {
      conceptLT: {
        variant: "LT-α / 4日",
        days: 4,
        reason: "部品共通化が進んでおり即日アロケーション可能",
      },
      inventory: {
        sku: "4CBTYK4-制御モジュール",
        available: 5,
        reserved: 1,
        comment: "出荷待ち1台あり。顧客承認後なら振替可。",
      },
      productionLoad: {
        line: "L1（実装セル）",
        utilization: 82,
        severity: "中負荷",
        comment: "夜間のみ余力。検査工程は混雑していない。",
      },
    },
    plans: [
      {
        label: "最短：在庫全振り＋夜間検査",
        shipDate: "2025-11-13",
        leadTimeDays: 3,
        allocation: "在庫4台（予約1台を差替え）",
        manufacturingWindow: "11/12 夜間に最終検査のみ実施",
        risk: "予約案件との調整が前提。営業承認が必要。",
        note: "至急フラグを維持しつつリードタイム最短化。",
      },
      {
        label: "代替：部分生産で補完",
        shipDate: "2025-11-15",
        leadTimeDays: 5,
        allocation: "在庫3台 + 新規生産1台",
        manufacturingWindow: "11/12〜11/13 夜間で1台増産",
        risk: "増産分のQAが翌日にずれ込む可能性あり。",
        note: "予約在庫を1台残せるため他案件影響が小さい。",
      },
    ],
  },
  "4CBT2": {
    defaultQuantity: 6,
    priority: "通常",
    references: {
      conceptLT: {
        variant: "LT-標準 / 6日",
        days: 6,
        reason: "サブ組立ラインの段取りが1日必要",
      },
      inventory: {
        sku: "4CBT2-ユニット",
        available: 4,
        reserved: 0,
        comment: "補用品として2台を確保中。差し替え容易。",
      },
      productionLoad: {
        line: "L3（モジュール組立）",
        utilization: 54,
        severity: "低負荷",
        comment: "週内に余裕があり、追い越し対応が容易。",
      },
    },
    plans: [
      {
        label: "最短：在庫4台＋即時増産2台",
        shipDate: "2025-11-16",
        leadTimeDays: 6,
        allocation: "在庫4台 + 新規生産2台",
        manufacturingWindow: "11/11〜11/13 で2台生産 → 11/14 QA",
        risk: "特記事項なし。負荷に余裕あり。",
        note: "在庫0台になるため補充計画を同時実行推奨。",
      },
      {
        label: "代替：増産を翌週へシフト",
        shipDate: "2025-11-19",
        leadTimeDays: 9,
        allocation: "在庫4台 + 翌週日勤で2台",
        manufacturingWindow: "11/15〜11/18 日勤枠",
        risk: "納期は延びるが在庫1台を保持可能。",
        note: "月末の需要ピークに備えたい場合に適合。",
      },
    ],
  },
  "4CBT3": {
    defaultQuantity: 7,
    priority: "通常",
    references: {
      conceptLT: {
        variant: "LT-β / 7日",
        days: 7,
        reason: "制御基板の調整工程が48h必要",
      },
      inventory: {
        sku: "4CBT3-制御基板",
        available: 5,
        reserved: 1,
        comment: "品質確認待ち1台。リリース見込みは翌営業日。",
      },
      productionLoad: {
        line: "L4（電装組立）",
        utilization: 71,
        severity: "中負荷",
        comment: "週後半に大型案件が入り稼働率上昇見込み。",
      },
    },
    plans: [
      {
        label: "最短：在庫5台＋電装ライン夜勤2台",
        shipDate: "2025-11-17",
        leadTimeDays: 7,
        allocation: "在庫5台 + 夜勤2台",
        manufacturingWindow: "11/12〜11/14 夜勤枠で組立",
        risk: "夜勤班のQA対応がタイト。補強が必要。",
        note: "週後半の大型案件開始前に完了可能。",
      },
      {
        label: "代替：全量通常シフトへの切替",
        shipDate: "2025-11-20",
        leadTimeDays: 10,
        allocation: "日勤で7台順次生産",
        manufacturingWindow: "11/13〜11/18 日勤枠",
        risk: "在庫を温存できるが大型案件と競合。",
        note: "夜勤対応が難しい場合の安全策。",
      },
    ],
  },
  "4CBTK4": {
    defaultQuantity: 5,
    priority: "試作",
    references: {
      conceptLT: {
        variant: "LT-試作 / 8日",
        days: 8,
        reason: "専用治具の調整とQAが長めに設定されている",
      },
      inventory: {
        sku: "4CBTK4-試作キット",
        available: 6,
        reserved: 0,
        comment: "試作セル用に常時6台をキープ中。",
      },
      productionLoad: {
        line: "L5（試作セル）",
        utilization: 38,
        severity: "低負荷",
        comment: "柔軟にスケジュール可能。週末メンテ前まで余裕。",
      },
    },
    plans: [
      {
        label: "最短：在庫引当＋QA重点",
        shipDate: "2025-11-16",
        leadTimeDays: 6,
        allocation: "在庫5台を即時引当",
        manufacturingWindow: "11/12〜11/14 で追加QA",
        risk: "ファームウェア更新が11/13予定。遅延に注意。",
        note: "試験結果を早期取得したい場合に最適。",
      },
      {
        label: "代替：評価工程を追加",
        shipDate: "2025-11-19",
        leadTimeDays: 9,
        allocation: "在庫5台 + 検証を48h延長",
        manufacturingWindow: "11/12〜11/17 逐次検証",
        risk: "納期は延びるが確認粒度が上がる。",
        note: "顧客レビュー前に精度を高めたい場合に推奨。",
      },
    ],
  },
  "3CB5": {
    defaultQuantity: 5,
    priority: "通常",
    references: {
      conceptLT: {
        variant: "LT-標準 / 5日",
        days: 5,
        reason: "構造がシンプルで即日ライン投入が可能",
      },
      inventory: {
        sku: "3CB5-ベースユニット",
        available: 7,
        reserved: 1,
        comment: "サービスパーツ向けに1台予約。代替あり。",
      },
      productionLoad: {
        line: "L2（筐体アセンブリ）",
        utilization: 46,
        severity: "低負荷",
        comment: "増産に充分な余裕あり。交代要員も確保済み。",
      },
    },
    plans: [
      {
        label: "最短：在庫全引当",
        shipDate: "2025-11-14",
        leadTimeDays: 4,
        allocation: "在庫5台をそのまま出荷",
        manufacturingWindow: "11/12 QAで再確認のみ",
        risk: "リスク極小。予約分は別SKUで代替予定。",
        note: "即日意思決定で翌営業日に出荷可能。",
      },
      {
        label: "代替：在庫3台＋増産2台",
        shipDate: "2025-11-17",
        leadTimeDays: 7,
        allocation: "在庫3台 + 追加生産2台",
        manufacturingWindow: "11/13〜11/15 で2台増産",
        risk: "増産分のQA負荷増。対応は可能。",
        note: "在庫を一部残しておきたい場合に適合。",
      },
    ],
  },
  "3CB10": {
    defaultQuantity: 7,
    priority: "通常",
    references: {
      conceptLT: {
        variant: "LT-拡張 / 8日",
        days: 8,
        reason: "大型筐体の物流調整に追加2日を見込む",
      },
      inventory: {
        sku: "3CB10-大型ユニット",
        available: 6,
        reserved: 0,
        comment: "大型機は在庫6台のみ。補充には4日必要。",
      },
      productionLoad: {
        line: "L6（大型セル）",
        utilization: 75,
        severity: "中負荷",
        comment: "フォークリフト手配が必要。夜間は作業不可。",
      },
    },
    plans: [
      {
        label: "最短：在庫6台＋日勤1台",
        shipDate: "2025-11-18",
        leadTimeDays: 8,
        allocation: "在庫6台 + 日勤で1台",
        manufacturingWindow: "11/12〜11/14 日勤枠で1台追加",
        risk: "物流調整がタイト。前倒しで輸送便を確保済み。",
        note: "在庫ゼロとなるため補充便の手配が必要。",
      },
      {
        label: "代替：在庫保持＋翌週生産",
        shipDate: "2025-11-21",
        leadTimeDays: 11,
        allocation: "在庫4台 + 翌週で3台増産",
        manufacturingWindow: "11/18〜11/20 日勤枠",
        risk: "物流便を翌週に再調整。コスト増。",
        note: "緊急案件とのバッファを残したい場合に。",
      },
    ],
  },
  "4CBM10": {
    defaultQuantity: 6,
    priority: "通常",
    references: {
      conceptLT: {
        variant: "LT-モジュール / 6日",
        days: 6,
        reason: "モーター調整工程が24h必要",
      },
      inventory: {
        sku: "4CBM10-モーターアッセン",
        available: 5,
        reserved: 1,
        comment: "試験用に1台キープ。優先度次第で解放可。",
      },
      productionLoad: {
        line: "L3（モジュール組立）",
        utilization: 63,
        severity: "中負荷",
        comment: "ラインシフトを追加すれば当週内に対応可能。",
      },
    },
    plans: [
      {
        label: "最短：在庫5台＋短時間増産1台",
        shipDate: "2025-11-16",
        leadTimeDays: 6,
        allocation: "在庫5台 + 追加生産1台",
        manufacturingWindow: "11/12 夜勤で1台追加 → 11/14 QA",
        risk: "夜勤工程の確保が前提。品質管理は通常通り。",
        note: "試験在庫を残すかは営業判断で調整可。",
      },
      {
        label: "代替：在庫優先で4台回答",
        shipDate: "2025-11-14",
        leadTimeDays: 4,
        allocation: "在庫4台を先行出荷、残り2台は翌便",
        manufacturingWindow: "11/16 日勤で残2台",
        risk: "分割出荷で輸送コストが上昇。",
        note: "顧客都合で部分納入が許容される場合の選択肢。",
      },
    ],
  },
}

const DEFAULT_SIMULATION: SimulationProfile = {
  defaultQuantity: 5,
  priority: "通常",
  references: {
    conceptLT: {
      variant: "LT-標準 / 6日",
      days: 6,
      reason: "詳細未登録のため標準リードタイムを適用",
    },
    inventory: {
      sku: "未登録型番",
      available: 6,
      reserved: 1,
      comment: "暫定値です。案件登録後に在庫情報を更新してください。",
    },
    productionLoad: {
      line: "未割当ライン",
      utilization: 55,
      severity: "中負荷",
      comment: "詳細計画未設定。需要計画チームに確認が必要です。",
    },
  },
  plans: [
    {
      label: "最短：標準ロット適用",
      shipDate: "2025-11-20",
      leadTimeDays: 10,
      allocation: "在庫3台 + 新規生産2台",
      manufacturingWindow: "標準LTに基づく自動スケジュール",
      risk: "前提情報が不足。担当者レビュー推奨。",
      note: "案件登録後に再計算してください。",
    },
  ],
}

const simulateShipment = (projectName: string): SimulationProfile & { matchedKey: string } => {
  const normalized = projectName.trim()
  const upper = normalized.toUpperCase()
  const key = Object.keys(SIMULATION_LIBRARY).find((candidate) => upper.includes(candidate))
  if (key) {
    return { ...SIMULATION_LIBRARY[key], matchedKey: key }
  }
  return { ...DEFAULT_SIMULATION, matchedKey: "default" }
}

const formatNumber = (value: number) => new Intl.NumberFormat("ja-JP").format(value)

const extractOrderInfo = (
  raw: string,
): {
  projectName: string | null
  quantity?: number
} => {
  const explicit = raw.match(/案件名\s*[:：]\s*([^\n\r]+)/i)
  let projectName = explicit ? explicit[1].trim() : null

  if (!projectName || projectName.length === 0) {
    const firstLine = raw.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0)
    projectName = firstLine ?? null
  }

  if (projectName) {
    const sanitized = projectName.replace(/出荷シミュレーション|納期回答|お願いします?|ください/g, "").trim()
    projectName = sanitized.length > 0 ? sanitized : projectName
  }

  const quantityMatch = raw.match(/(\d{1,4})\s*(台|個|本|セット|set)/i)
  const quantity = quantityMatch ? Number.parseInt(quantityMatch[1], 10) : undefined

  return {
    projectName: projectName && projectName.length > 0 ? projectName : null,
    quantity: Number.isFinite(quantity) ? quantity : undefined,
  }
}

const buildSimulationNarrative = (projectName: string, quantity?: number) => {
  const simulation = simulateShipment(projectName)
  const requestedQuantity = quantity ?? simulation.defaultQuantity
  const diff = quantity ? quantity - simulation.defaultQuantity : 0
  const diffLine = quantity
    ? diff === 0
      ? "数量差異: 標準ロットと同数です。"
      : `数量差異: ${diff > 0 ? "+" : ""}${diff}台（標準 ${formatNumber(simulation.defaultQuantity)}台）`
    : `数量差異: 標準ロット ${formatNumber(simulation.defaultQuantity)}台を基準に計算しています。`

  const { conceptLT, inventory, productionLoad } = simulation.references
  const [primaryPlan, ...alternativePlans] = simulation.plans

  const lines = [
    `案件名: ${projectName}`,
    `参照テンプレート: ${
      simulation.matchedKey === "default" ? "標準プロファイル（案件登録推奨）" : simulation.matchedKey
    }`,
    `優先度: ${simulation.priority} / リクエスト数量: ${formatNumber(requestedQuantity)}台`,
    diffLine,
    "",
    "■ 自動参照スナップショット",
    `・コンセプトLT: ${conceptLT.variant}（${conceptLT.days}日） - ${conceptLT.reason}`,
    `・在庫: ${inventory.sku} / 利用可能 ${formatNumber(inventory.available)}台（予約 ${formatNumber(
      inventory.reserved,
    )}台） - ${inventory.comment}`,
    `・製造負荷: ${productionLoad.line} / 稼働率 ${productionLoad.utilization}%（${productionLoad.severity}） - ${productionLoad.comment}`,
    "",
    "■ 出荷プラン",
    `◎ 最短案 | ${primaryPlan.label}`,
    `  出荷日: ${primaryPlan.shipDate} / LT ${primaryPlan.leadTimeDays}日`,
    `  アロケーション: ${primaryPlan.allocation}`,
    `  製造ウィンドウ: ${primaryPlan.manufacturingWindow}`,
    `  リスク: ${primaryPlan.risk}`,
    `  メモ: ${primaryPlan.note}`,
  ]

  alternativePlans.forEach((plan, index) => {
    lines.push(
      "",
      `▲ 代替案${index + 1} | ${plan.label}`,
      `  出荷日: ${plan.shipDate} / LT ${plan.leadTimeDays}日`,
      `  アロケーション: ${plan.allocation}`,
      `  製造ウィンドウ: ${plan.manufacturingWindow}`,
      `  リスク: ${plan.risk}`,
      `  メモ: ${plan.note}`,
    )
  })

  lines.push(
    "",
    `補足: ${REFERENCE_NOTE}`,
    "意思決定: 最短案で承認 / 代替案に切替 / 条件を修正 のいずれかをご指示ください。",
  )

  return lines.join("\n")
}

const GUIDANCE_MESSAGE =
  "案件名が特定できませんでした。例：「案件名: 4CBTY2 8台で出荷シミュレーション」と入力してください。"

export default function Home() {
  const [isLoaded, setIsLoaded] = useState(false)
  const [messages, setMessages] = useState<Message[]>([{ id: "assistant-1", role: "assistant", content: "" }])
  const [inputValue, setInputValue] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const hasQueuedFollowUp = useRef(false)
  const responseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setIsLoaded(true)

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

    return () => {
      clearInterval(interval)
      if (responseTimeoutRef.current) {
        clearTimeout(responseTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const intro = messages.find((message) => message.id === "assistant-1")
    if (intro && intro.content === INTRO_MESSAGE && !hasQueuedFollowUp.current) {
      hasQueuedFollowUp.current = true
      const timeout = setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: "assistant-2",
            role: "assistant",
            content: FOLLOW_UP_MESSAGE,
          },
        ])
      }, 500)
      return () => clearTimeout(timeout)
    }
  }, [messages])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isGenerating])

  const handleSend = (preset?: string) => {
    if (isGenerating) return

    const content = (preset ?? inputValue).trim()
    if (!content) return

    const orderInfo = extractOrderInfo(content)

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
    }

    setMessages((prev) => [...prev, userMessage])
    setInputValue("")
    setIsGenerating(true)

    responseTimeoutRef.current = setTimeout(() => {
      const assistantContent = orderInfo.projectName
        ? buildSimulationNarrative(orderInfo.projectName, orderInfo.quantity)
        : GUIDANCE_MESSAGE

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: assistantContent,
        },
      ])
      setIsGenerating(false)
    }, 750 + Math.random() * 600)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden text-white">
      <Image
        src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?q=80&w=2070&auto=format&fit=crop"
        alt="AgenticAI background"
        fill
        className="object-cover"
        priority
      />
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950/70 via-blue-900/60 to-cyan-900/40 backdrop-blur-sm" />

      <header
        className={`absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-8 py-6 opacity-0 ${isLoaded ? "animate-fade-in" : ""}`}
        style={{ animationDelay: "0.15s" }}
      >
        <div className="flex items-center gap-4">
          <Menu className="h-6 w-6 text-white/80" />
          <span className="text-2xl font-semibold text-white drop-shadow-lg">AgenticAI for Unica</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/70" />
            <input
              type="text"
              placeholder="案件・ドキュメントを検索"
              className="rounded-full bg-white/10 backdrop-blur-sm pl-10 pr-4 py-2 text-white placeholder:text-white/70 border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/30"
            />
          </div>
          <Settings className="h-6 w-6 text-white/80 drop-shadow-md" />
          <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center text-white font-semibold shadow-md">
            LG
          </div>
        </div>
      </header>

      <main className="relative h-screen w-full pt-20 flex">
        <aside
          className={`w-72 h-full bg-white/10 backdrop-blur-lg px-5 py-6 shadow-xl border-r border-white/10 rounded-tr-3xl opacity-0 ${
            isLoaded ? "animate-fade-in" : ""
          } flex flex-col`}
          style={{ animationDelay: "0.3s" }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-wide text-white/80 uppercase">案件シミュレーション履歴</h2>
            <button className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25">
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="relative mt-5">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
            <input
              type="text"
              placeholder="案件を検索"
              className="w-full rounded-xl bg-white/10 px-10 py-2 text-sm text-white placeholder:text-white/50 border border-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
            />
          </div>

          <div className="mt-6 space-y-3 overflow-y-auto pr-1">
            {SAMPLE_THREADS.map((thread) => (
              <button
                key={thread.id}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-white/80 transition hover:border-white/30 hover:bg-white/15"
              >
                <div className="flex items-center gap-2 text-white/70">
                  <MessageSquare className="h-4 w-4" />
                  <span className="text-xs">{thread.timestamp}</span>
                </div>
                <div className="mt-1 font-medium text-white">{thread.title}</div>
              </button>
            ))}
          </div>
        </aside>

        <section
          className={`flex-1 flex flex-col opacity-0 ${isLoaded ? "animate-fade-in" : ""}`}
          style={{ animationDelay: "0.45s" }}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-8 py-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 shadow-lg">
                <Sparkles className="h-6 w-6 text-cyan-200" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white">AgenticAI for Unica</h1>
                <p className="text-sm text-white/70">納期回答自動支援モジュール</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs uppercase tracking-wider text-white/60">
                UNICA
              </span>
              <button className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-white transition hover:bg-white/20">
                ステータス: 稼働中
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-8 py-8 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "assistant" ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[68%] rounded-3xl px-5 py-4 text-sm leading-relaxed shadow-xl ${
                    message.role === "assistant"
                      ? "bg-white/15 text-white backdrop-blur-lg border border-white/10"
                      : "bg-cyan-500/90 text-white"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}

            {isGenerating && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-3xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white/80 shadow-lg backdrop-blur-lg">
                  <Loader2 className="h-4 w-4 animate-spin text-cyan-200" />
                  <span>AgenticAIが出荷シミュレーションを計算しています...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="px-8 pb-10">
            <div className="flex flex-wrap gap-2 pb-4">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSend(prompt)}
                  className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs text-white/80 transition hover:border-white/40 hover:bg-white/20"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="flex items-end gap-3 rounded-3xl border border-white/15 bg-white/10 p-4 shadow-2xl backdrop-blur-lg">
              <textarea
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="案件名と数量を入力（例: 案件名: ユニカ_AZ-145 480台）"
                className="h-28 flex-1 resize-none bg-transparent text-sm text-white placeholder:text-white/60 focus:outline-none"
                disabled={isGenerating}
              />
              <button
                onClick={() => handleSend()}
                disabled={isGenerating || !inputValue.trim()}
                className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/90 text-white transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-white/20"
                aria-label="送信"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-3 text-center text-xs text-white/60">
              AgenticAIの提案はAIによる推論です。重要な意思決定は要確認のうえご利用ください。
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}
