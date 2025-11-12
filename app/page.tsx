"use client"

import { useEffect, useRef, useState } from "react"
import type { KeyboardEvent } from "react"
import Image from "next/image"
import { Calendar, Loader2, Menu, MessageSquare, Plus, Search, Send, Settings, Sparkles, X } from "lucide-react"
import { format, parse, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addDays, subDays } from "date-fns"
import { ja } from "date-fns/locale"

type Role = "assistant" | "user"

interface Message {
  id: string
  role: Role
  content: string
  history?: SimilarCase[]
  schedule?: ScheduleBlock[]
  shipDate?: string
}

const INTRO_MESSAGE =
  "株式会社ユニカ 納期回答エージェント『AgenticAI for Unica』です。案件名（型番）と数量を指定いただければ、コンセプトLT・在庫・製造負荷を自動参照し、出荷シミュレーションの最短案と代替案を提示します。"

const FOLLOW_UP_MESSAGE =
  "例：「案件名: 4CBTY2 8台で出荷シミュレーション」「4CBM10を5台で在庫優先案も」。型番をそのまま入力していただいて大丈夫です。"

const SUGGESTED_PROMPTS = [
  "案件名: 4CBTY2 8台で出荷シミュレーション",
  "4CBTYK4 を至急案件として4台で評価して",
  "案件名: 3CB5 5台 / 製造負荷を前提に提案して",
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

interface SimilarCase {
  id: string
  title: string
  period: string
  quantity: number
  approach: string
  outcome: string
}

interface ScheduleBlock {
  id: string
  timeFrame: string
  focus: string
  owner: string
  status: "確定" | "調整中" | "要確認"
  note: string
}

interface SimulationProfile {
  defaultQuantity: number
  priority: "通常" | "至急" | "試作"
  references: ReferenceSnapshot
  plans: SimulationPlan[]
  history: SimilarCase[]
  schedule: ScheduleBlock[]
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
    history: [
      {
        id: "H-4CBTY2-01",
        title: "4CBTY2 10台 / 春季即応",
        period: "2025年4月",
        quantity: 10,
        approach: "在庫7台 + 夜勤で3台増産して前倒し",
        outcome: "LTを2日短縮。夜勤コスト4%増で許容範囲。",
      },
      {
        id: "H-4CBTY2-02",
        title: "4CBTY2 6台 / 緊急保守案件",
        period: "2024年12月",
        quantity: 6,
        approach: "在庫全振り＋翌週の補充ロットを先行手配",
        outcome: "在庫リスク最小で顧客SLAを維持。",
      },
    ],
    schedule: [
      {
        id: "S-4CBTY2-01",
        timeFrame: "11/11 夜",
        focus: "筐体組立 2台増産",
        owner: "L2夜勤リーダー",
        status: "調整中",
        note: "人員確保済み。QAリソースを追加割当。",
      },
      {
        id: "S-4CBTY2-02",
        timeFrame: "11/13 午前",
        focus: "最終QA・外観検査",
        owner: "品質保証チーム",
        status: "確定",
        note: "チェックリストは最新版#2025-10を使用。",
      },
      {
        id: "S-4CBTY2-03",
        timeFrame: "11/14 夕方",
        focus: "梱包・出荷便手配",
        owner: "SCMオペレーション",
        status: "要確認",
        note: "輸送会社と前日17時までに集荷確定が必要。",
      },
    ],
    history: [
      {
        id: "H-3CB5-01",
        title: "3CB5 7台 / メンテ補充",
        period: "2025年3月",
        quantity: 7,
        approach: "在庫全引当＋翌週補充で対応",
        outcome: "保守窓口への連絡を前倒しし顧客満足度維持。",
      },
      {
        id: "H-3CB5-02",
        title: "3CB5 4台 / 部材遅延時",
        period: "2024年6月",
        quantity: 4,
        approach: "代替ロットを振替えQAを追加で1日実施",
        outcome: "品質リスクゼロ、コスト増2%で抑制。",
      },
    ],
    schedule: [
      {
        id: "S-3CB5-01",
        timeFrame: "11/11 午前",
        focus: "在庫即時引当",
        owner: "需給オペレーション",
        status: "確定",
        note: "システム登録済み。補充ロットは11/18入庫。",
      },
      {
        id: "S-3CB5-02",
        timeFrame: "11/12 午前",
        focus: "QAスポットチェック",
        owner: "QAチーム",
        status: "確定",
        note: "サンプル抜き取り率20%。",
      },
      {
        id: "S-3CB5-03",
        timeFrame: "11/13 午後",
        focus: "出荷ドキュメント作成",
        owner: "SCMオペレーション",
        status: "要確認",
        note: "輸出仕様書の更新が必要。法務確認待ち。",
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
    history: [
      {
        id: "H-4CBTYK4-01",
        title: "4CBTYK4 5台 / 現地保守向け",
        period: "2025年7月",
        quantity: 5,
        approach: "予約在庫を解放しつつ夜間シフトでQA前倒し",
        outcome: "顧客サイト稼働停止を回避。評価◎。",
      },
      {
        id: "H-4CBTYK4-02",
        title: "4CBTYK4 3台 / 北米向け特急",
        period: "2024年11月",
        quantity: 3,
        approach: "試験在庫を流用し航空便で即納体制",
        outcome: "輸送費8%増だがSLA違反を回避。",
      },
    ],
    schedule: [
      {
        id: "S-4CBTYK4-01",
        timeFrame: "11/12 午後",
        focus: "予約在庫の差替え承認",
        owner: "CSプランナー",
        status: "調整中",
        note: "顧客B案件との優先度調整が必要。",
      },
      {
        id: "S-4CBTYK4-02",
        timeFrame: "11/12 夜",
        focus: "追加QA（信頼性試験）",
        owner: "品質保証チーム",
        status: "確定",
        note: "夜間QAの担当者割当済み。",
      },
      {
        id: "S-4CBTYK4-03",
        timeFrame: "11/13 午前",
        focus: "輸送便手配・書類更新",
        owner: "ロジ担当",
        status: "要確認",
        note: "航空便の枠確保が条件。AM9:00期限。",
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
    history: [
      {
        id: "H-4CBT2-01",
        title: "4CBT2 8台 / 量産立ち上げ前倒し",
        period: "2025年1月",
        quantity: 8,
        approach: "在庫4台 + 追加増産4台を分割手配",
        outcome: "ライン負荷平準化と在庫維持を両立。",
      },
      {
        id: "H-4CBT2-02",
        title: "4CBT2 5台 / 部材不足時対応",
        period: "2024年9月",
        quantity: 5,
        approach: "代替部材を使用しQA工程を延長",
        outcome: "出荷2日遅延も顧客合意済み。品質問題なし。",
      },
    ],
    schedule: [
      {
        id: "S-4CBT2-01",
        timeFrame: "11/11 午後",
        focus: "在庫引当と補充ロット登録",
        owner: "需給管理",
        status: "確定",
        note: "WMS反映済み。補充は11/20着予定。",
      },
      {
        id: "S-4CBT2-02",
        timeFrame: "11/12〜11/13",
        focus: "追加2台の組立",
        owner: "L3日勤リーダー",
        status: "調整中",
        note: "作業手順書Rev.12を使用。人員割当未確定。",
      },
      {
        id: "S-4CBT2-03",
        timeFrame: "11/14 午前",
        focus: "QA・最終検査",
        owner: "QAチーム",
        status: "要確認",
        note: "過去不具合の振返り項目を追加確認。",
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
    history: [
      {
        id: "H-4CBT3-01",
        title: "4CBT3 9台 / 大型案件前倒し",
        period: "2025年6月",
        quantity: 9,
        approach: "夜勤3枠を追加し制御基板を先行調整",
        outcome: "顧客立会い前にバッファ2日確保。",
      },
      {
        id: "H-4CBT3-02",
        title: "4CBT3 4台 / 短納期部品振替",
        period: "2024年11月",
        quantity: 4,
        approach: "他ラインの余剰在庫を流用しQA強化",
        outcome: "品質評価◎、CTQ項目ゼロ不具合。",
      },
    ],
    schedule: [
      {
        id: "S-4CBT3-01",
        timeFrame: "11/12 夜",
        focus: "制御基板調整 2台",
        owner: "L4夜勤SV",
        status: "調整中",
        note: "夜勤メンバーの超過勤務承認が必要。",
      },
      {
        id: "S-4CBT3-02",
        timeFrame: "11/13 午後",
        focus: "ファームウェア焼き付け・検証",
        owner: "ソフトQA",
        status: "確定",
        note: "バージョン1.2.6を展開予定。",
      },
      {
        id: "S-4CBT3-03",
        timeFrame: "11/15 午前",
        focus: "最終組立＆梱包",
        owner: "L4日勤",
        status: "要確認",
        note: "大型案件とのライン共有を事前調整。",
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
    history: [
      {
        id: "H-4CBTK4-01",
        title: "4CBTK4 6台 / 試作検証サイクル",
        period: "2025年5月",
        quantity: 6,
        approach: "在庫5台 + 追加1台で逐次評価、QA延長",
        outcome: "検証リードタイム-20%。品質指摘ゼロ。",
      },
      {
        id: "H-4CBTK4-02",
        title: "4CBTK4 4台 / 技術評価チーム案件",
        period: "2024年8月",
        quantity: 4,
        approach: "評価工程を3日延ばし成果物に反映",
        outcome: "顧客満足度向上。次期案件に繋がる。",
      },
    ],
    schedule: [
      {
        id: "S-4CBTK4-01",
        timeFrame: "11/12 午前",
        focus: "試作セル手配・治具事前チェック",
        owner: "試作セル管理者",
        status: "確定",
        note: "治具セットは前日夜に完了予定。",
      },
      {
        id: "S-4CBTK4-02",
        timeFrame: "11/13〜11/14",
        focus: "追加QA＋検証ログ取得",
        owner: "テクニカルQA",
        status: "調整中",
        note: "ログフォーマットRev.4.2を使用。",
      },
      {
        id: "S-4CBTK4-03",
        timeFrame: "11/15 午後",
        focus: "評価レビュー・顧客共有資料作成",
        owner: "プロジェクト担当",
        status: "要確認",
        note: "顧客レビュー会議 11/16 10:00予定。",
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
    history: [
      {
        id: "H-3CB10-01",
        title: "3CB10 9台 / 大型案件サポート",
        period: "2025年2月",
        quantity: 9,
        approach: "在庫6台 + 日勤3台で段階対応",
        outcome: "物流再調整でコスト+5%も顧客満足度◎。",
      },
      {
        id: "H-3CB10-02",
        title: "3CB10 6台 / 物流制約時",
        period: "2024年10月",
        quantity: 6,
        approach: "在庫分だけ先行出荷、残りを翌週便",
        outcome: "納期SLAを維持しリスクを低減。",
      },
    ],
    schedule: [
      {
        id: "S-3CB10-01",
        timeFrame: "11/12 午後",
        focus: "フォークリフト手配・搬送計画",
        owner: "物流チーム",
        status: "調整中",
        note: "夜間搬送不可。日勤リソース調整中。",
      },
      {
        id: "S-3CB10-02",
        timeFrame: "11/13〜11/14",
        focus: "大型梱包・補強検査",
        owner: "L6日勤",
        status: "確定",
        note: "梱包材#L6-2025を優先使用。",
      },
      {
        id: "S-3CB10-03",
        timeFrame: "11/17 午前",
        focus: "輸送便最終確定",
        owner: "SCMロジ",
        status: "要確認",
        note: "翌週便差替え時は顧客承認が必要。",
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
    history: [
      {
        id: "H-4CBM10-01",
        title: "4CBM10 7台 / 定期メンテ補充",
        period: "2025年5月",
        quantity: 7,
        approach: "在庫5台 + 夜勤で2台増産",
        outcome: "LTを1日短縮し現場稼働を維持。",
      },
      {
        id: "H-4CBM10-02",
        title: "4CBM10 5台 / 分割納入対応",
        period: "2024年11月",
        quantity: 5,
        approach: "在庫4台先行出荷、残1台を翌便",
        outcome: "輸送コスト+6%も顧客満足度改善。",
      },
    ],
    schedule: [
      {
        id: "S-4CBM10-01",
        timeFrame: "11/12 夜",
        focus: "モーター調整・1台増産",
        owner: "L3夜勤リーダー",
        status: "調整中",
        note: "調整治具の校正を11/12 18時に実施予定。",
      },
      {
        id: "S-4CBM10-02",
        timeFrame: "11/14 午前",
        focus: "品質確認・振動試験",
        owner: "品質保証チーム",
        status: "確定",
        note: "振動試験プロファイル#VG-7を使用。",
      },
      {
        id: "S-4CBM10-03",
        timeFrame: "11/15 午後",
        focus: "部分出荷の輸送手配",
        owner: "SCMオペレーション",
        status: "要確認",
        note: "顧客と受入時間帯の最終確認を実施。",
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
  history: [
    {
      id: "H-DEFAULT-01",
      title: "標準テンプレ 5台 / 仮シミュレーション",
      period: "参考",
      quantity: 5,
      approach: "在庫3台 + 新規2台での標準対応",
      outcome: "案件登録後に詳細を再確認してください。",
    },
  ],
  schedule: [
    {
      id: "S-DEFAULT-01",
      timeFrame: "未確定",
      focus: "案件詳細の登録",
      owner: "担当営業",
      status: "要確認",
      note: "型番・構成情報をシステム登録後に再計算します。",
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

const buildSimulationResponse = (projectName: string, quantity?: number) => {
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
    "",
    `参照テンプレート: ${
      simulation.matchedKey === "default" ? "標準プロファイル（案件登録推奨）" : simulation.matchedKey
    }`,
    `優先度: ${simulation.priority}  /  リクエスト数量: ${formatNumber(requestedQuantity)}台`,
    diffLine,
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
    "■ 自動参照スナップショット",
    "",
    `【コンセプトLT】`,
    `  ${conceptLT.variant}（${conceptLT.days}日） - ${conceptLT.reason}`,
    "",
    `【在庫】`,
    `  SKU: ${inventory.sku}  /  利用可能: ${formatNumber(inventory.available)}台（予約: ${formatNumber(inventory.reserved)}台）`,
    `  ${inventory.comment}`,
    "",
    `【製造負荷】`,
    `  ライン: ${productionLoad.line}  /  稼働率: ${productionLoad.utilization}%（${productionLoad.severity}）`,
    `  ${productionLoad.comment}`,
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
    "■ 出荷プラン",
    "",
    `◎ 最短案  |  ${primaryPlan.label}`,
    "",
    `  📅 出荷日: ${primaryPlan.shipDate}  /  LT: ${primaryPlan.leadTimeDays}日`,
    `  📦 アロケーション: ${primaryPlan.allocation}`,
    `  🏭 製造ウィンドウ: ${primaryPlan.manufacturingWindow}`,
    `  ⚠️  リスク: ${primaryPlan.risk}`,
    `  📝 メモ: ${primaryPlan.note}`,
  ]

  alternativePlans.forEach((plan, index) => {
    lines.push(
      "",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "",
      `▲ 代替案${index + 1}  |  ${plan.label}`,
      "",
      `  📅 出荷日: ${plan.shipDate}  /  LT: ${plan.leadTimeDays}日`,
      `  📦 アロケーション: ${plan.allocation}`,
      `  🏭 製造ウィンドウ: ${plan.manufacturingWindow}`,
      `  ⚠️  リスク: ${plan.risk}`,
      `  📝 メモ: ${plan.note}`,
    )
  })

  lines.push(
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
    `📌 補足: ${REFERENCE_NOTE}`,
    "",
    `💡 意思決定: 最短案で承認  /  代替案に切替  /  条件を修正 のいずれかをご指示ください。`,
  )

  return {
    narrative: lines.join("\n"),
    history: simulation.history,
    schedule: simulation.schedule,
    shipDate: "2025-11-30",
  }
}

const GUIDANCE_MESSAGE =
  "案件名が特定できませんでした。例：「案件名: 4CBTY2 8台で出荷シミュレーション」と入力してください。"

export default function Home() {
  const [isLoaded, setIsLoaded] = useState(false)
  const [messages, setMessages] = useState<Message[]>([{ id: "assistant-1", role: "assistant", content: "" }])
  const [inputValue, setInputValue] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [selectedSchedule, setSelectedSchedule] = useState<{ schedule: ScheduleBlock[]; shipDate?: string; messageId?: string } | null>(null)
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
    const hasValidProject = Boolean(orderInfo.projectName)

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
    }

    setMessages((prev) => [...prev, userMessage])
    setInputValue("")
    setIsGenerating(true)
    setIsScanning(hasValidProject)

    responseTimeoutRef.current = setTimeout(() => {
      if (orderInfo.projectName) {
        const assistantResponse = buildSimulationResponse(orderInfo.projectName, orderInfo.quantity)
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: assistantResponse.narrative,
            history: assistantResponse.history,
            schedule: assistantResponse.schedule,
            shipDate: assistantResponse.shipDate,
          },
        ])
        setIsScanning(false)
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: GUIDANCE_MESSAGE,
          },
        ])
        setIsScanning(false)
      }
      setIsGenerating(false)
    }, 3000)
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
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950/90 via-blue-900/82 to-cyan-900/70 backdrop-blur-sm" />

      <header
        className={`absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-8 py-6 opacity-0 ${isLoaded ? "animate-fade-in" : ""}`}
        style={{ animationDelay: "0.15s" }}
      >
        <div className="flex items-center gap-4">
          <Menu className="h-6 w-6 text-white/95" />
          <span className="text-2xl font-semibold text-white drop-shadow-lg">AgenticAI for Unica</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/90" />
            <input
              type="text"
              placeholder="案件・ドキュメントを検索"
              className="rounded-full bg-white/50 backdrop-blur-sm pl-10 pr-4 py-2.5 text-base text-white placeholder:text-white/90 border border-white/35 focus:outline-none focus:ring-2 focus:ring-white/45"
            />
          </div>
          <Settings className="h-6 w-6 text-white/95 drop-shadow-md" />
          <div className="h-10 w-10 rounded-full bg-white/40 flex items-center justify-center text-white font-semibold shadow-md">
            LG
          </div>
        </div>
      </header>

      <main className="relative h-screen w-full pt-20 flex">
        <aside
          className={`w-72 h-full bg-white/50 backdrop-blur-lg px-5 py-6 shadow-xl border-r border-white/30 rounded-tr-3xl opacity-0 ${
            isLoaded ? "animate-fade-in" : ""
          } flex flex-col`}
          style={{ animationDelay: "0.3s" }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold tracking-wide text-white uppercase">案件シミュレーション履歴</h2>
            <button className="flex h-8 w-8 items-center justify-center rounded-full bg-white/50 text-white transition hover:bg-white/60">
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="relative mt-5">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white" />
            <input
              type="text"
              placeholder="案件を検索"
              className="w-full rounded-xl bg-white/40 px-10 py-2.5 text-base text-white placeholder:text-white/85 border border-white/30 focus:outline-none focus:ring-2 focus:ring-white/40"
            />
          </div>

          <div className="mt-6 space-y-3 overflow-y-auto pr-1">
            {SAMPLE_THREADS.map((thread) => (
              <button
                key={thread.id}
                className="w-full rounded-2xl border border-white/30 bg-white/35 px-4 py-3.5 text-left text-base text-white transition hover:border-white/45 hover:bg-white/50"
              >
                <div className="flex items-center gap-2 text-white">
                  <MessageSquare className="h-4 w-4" />
                  <span className="text-sm">{thread.timestamp}</span>
                </div>
                <div className="mt-1.5 font-medium text-white">{thread.title}</div>
              </button>
            ))}
          </div>
        </aside>

        <section
          className={`relative flex-1 flex flex-col opacity-0 ${isLoaded ? "animate-fade-in" : ""}`}
          style={{ animationDelay: "0.45s" }}
        >
          <div className="flex items-center justify-between border-b border-white/30 px-8 py-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/50 shadow-lg">
                <Sparkles className="h-6 w-6 text-cyan-200" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-white">AgenticAI for Unica</h1>
                <p className="text-base text-white">納期回答自動支援モジュール</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-white/35 bg-white/35 px-3 py-1.5 text-sm uppercase tracking-wider text-white">
                UNICA
              </span>
              <button className="rounded-full border border-white/35 bg-white/40 px-4 py-2 text-base text-white transition hover:bg-white/50">
                ステータス: 稼働中
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
                  <div className={`flex flex-col gap-3 ${containerWidth} ${isAssistant ? "items-start" : "items-end"}`}>
                    <div
                      className={`w-full rounded-3xl px-6 py-5 text-base leading-relaxed shadow-xl whitespace-pre-wrap ${
                        isAssistant
                          ? "bg-white/55 text-white backdrop-blur-lg border border-white/35"
                          : "bg-cyan-500/90 text-white"
                      }`}
                    >
                      {message.content}
                    </div>
                    {isAssistant && message.history && message.history.length > 0 && (
                      <div className="grid w-full gap-4 md:grid-cols-2">
                        {message.history.map((caseItem) => (
                          <div
                            key={caseItem.id}
                            className="w-full rounded-2xl border border-white/35 bg-white/45 p-5 text-base text-white shadow-lg backdrop-blur-lg"
                          >
                            <div className="text-sm uppercase tracking-wide text-cyan-200">
                              {caseItem.period}
                            </div>
                            <div className="mt-2 text-lg font-semibold text-white">{caseItem.title}</div>
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-white">
                              <span className="rounded-full bg-white/40 px-3 py-1.5">
                                数量 {formatNumber(caseItem.quantity)}台
                              </span>
                            </div>
                            <p className="mt-4 text-sm text-white">アプローチ: {caseItem.approach}</p>
                            <p className="mt-2 text-sm text-white">結果: {caseItem.outcome}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {isAssistant && message.schedule && message.schedule.length > 0 && (
                      <div className="w-full rounded-2xl border border-white/35 bg-white/40 p-5 text-base text-white shadow-lg backdrop-blur-lg">
                        <button
                          onClick={() => setSelectedSchedule({ schedule: message.schedule!, shipDate: message.shipDate, messageId: message.id })}
                          className="w-full text-left"
                        >
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold uppercase tracking-wider text-white flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              仮日程プラン
                            </div>
                            <span className="text-xs text-white/70">クリックしてカレンダー表示</span>
                          </div>
                        </button>
                        <div className="mt-4 space-y-3">
                          {message.schedule.map((block) => (
                            <div
                              key={block.id}
                              className="rounded-xl border border-white/35 bg-white/35 px-5 py-4"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-base font-semibold text-white">{block.focus}</div>
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                                      block.status === "確定"
                                        ? "bg-emerald-400/40 text-emerald-100"
                                        : block.status === "調整中"
                                          ? "bg-amber-400/40 text-amber-100"
                                          : "bg-rose-400/40 text-rose-100"
                                    }`}
                                  >
                                    {block.status}
                                  </span>
                                  {block.status !== "確定" && (
                                    <button
                                      onClick={() => {
                                        const updatedSchedule = message.schedule!.map((b) =>
                                          b.id === block.id ? { ...b, status: "確定" as const } : b
                                        )
                                        setMessages((prev) =>
                                          prev.map((m) =>
                                            m.id === message.id ? { ...m, schedule: updatedSchedule } : m
                                          )
                                        )
                                      }}
                                      className="px-3 py-1 text-xs font-medium rounded-full bg-emerald-500/60 hover:bg-emerald-500/80 text-white transition"
                                    >
                                      確定
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-white">
                                <span>{block.timeFrame}</span>
                                <span>担当: {block.owner}</span>
                              </div>
                              <p className="mt-3 text-sm text-white">{block.note}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {isGenerating && (
              <div className="flex justify-start">
                <div className="flex items-center gap-3 rounded-3xl border border-white/35 bg-white/45 px-5 py-4 text-base text-white shadow-lg backdrop-blur-lg">
                  <Loader2 className="h-5 w-5 animate-spin text-cyan-200" />
                  <span>AgenticAIが出荷シミュレーションを計算しています...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {isScanning && (
            <div className="pointer-events-none absolute bottom-36 right-12 z-30 w-[360px] rounded-3xl border border-cyan-300/70 bg-cyan-500/75 p-6 shadow-2xl backdrop-blur-lg">
              <div className="flex items-center gap-3">
                <Loader2 className="h-6 w-6 text-white animate-spin" />
                <p className="text-base font-medium text-white">過去の類似案件を調査します</p>
              </div>
              <p className="mt-3 text-sm text-white">
                コンセプトLT・在庫・製造負荷の履歴を参照して最適な比較指標を抽出中です。
              </p>
              <div className="mt-4 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-white/90 animate-bounce" />
                <span className="h-2 w-2 rounded-full bg-white/70 animate-bounce" style={{ animationDelay: "0.15s" }} />
                <span className="h-2 w-2 rounded-full bg-white/50 animate-bounce" style={{ animationDelay: "0.3s" }} />
              </div>
            </div>
          )}

          <div className="px-8 pb-10">
            <div className="flex flex-wrap gap-3 pb-4">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSend(prompt)}
                  className="rounded-full border border-white/35 bg-white/40 px-5 py-2.5 text-sm text-white transition hover:border-white/50 hover:bg-white/50"
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
                placeholder="案件名と数量を入力（例: 案件名: ユニカ_AZ-145 480台）"
                className="h-8 flex-1 resize-none bg-transparent text-base text-white placeholder:text-white/85 focus:outline-none"
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
            <p className="mt-4 text-center text-sm text-white">
              AgenticAIの提案はAIによる推論です。重要な意思決定は要確認のうえご利用ください。
            </p>
          </div>
        </section>
      </main>

      {/* カレンダーモーダル */}
      {selectedSchedule && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setSelectedSchedule(null)}
        >
          <div
            className="relative w-full max-w-3xl mx-4 rounded-3xl border border-white/35 bg-white/55 p-6 shadow-2xl backdrop-blur-lg text-white animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedSchedule(null)}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/20 transition"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="mb-4">
              <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                仮日程プラン - カレンダー表示
              </h2>
              {selectedSchedule.shipDate && (
                <div className="mt-3 p-3 rounded-2xl bg-cyan-500/30 border-2 border-cyan-400/50">
                  <div className="text-base font-semibold text-cyan-100">📅 仮納期（出荷予定日）</div>
                  <div className="text-2xl font-bold text-white mt-1">
                    {format(parse(selectedSchedule.shipDate, "yyyy-MM-dd", new Date()), "yyyy年MM月dd日（E）", { locale: ja })}
                  </div>
                </div>
              )}
            </div>

            <CalendarView 
              schedule={selectedSchedule.schedule} 
              shipDate={selectedSchedule.shipDate}
              onScheduleUpdate={(updatedSchedule) => {
                setSelectedSchedule({ ...selectedSchedule, schedule: updatedSchedule })
                // メッセージも更新
                if (selectedSchedule.messageId) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === selectedSchedule.messageId
                        ? { ...m, schedule: updatedSchedule }
                        : m
                    )
                  )
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// カレンダー表示コンポーネント
function CalendarView({ 
  schedule, 
  shipDate,
  onScheduleUpdate 
}: { 
  schedule: ScheduleBlock[]
  shipDate?: string
  onScheduleUpdate?: (updatedSchedule: ScheduleBlock[]) => void
}) {
  // スケジュールから日付を抽出
  const parseScheduleDate = (timeFrame: string): Date | null => {
    // "11/11 夜" や "11/13 午前" のような形式をパース
    const match = timeFrame.match(/(\d{1,2})\/(\d{1,2})/)
    if (!match) return null
    const [, month, day] = match
    // 2025年を基準とする（スケジュールデータが2025年を前提としているため）
    const year = 2025
    return new Date(year, parseInt(month) - 1, parseInt(day))
  }

  // スケジュールを日付でグループ化
  const scheduleByDate = new Map<string, ScheduleBlock[]>()
  schedule.forEach((block) => {
    const date = parseScheduleDate(block.timeFrame)
    if (date) {
      const dateKey = format(date, "yyyy-MM-dd")
      if (!scheduleByDate.has(dateKey)) {
        scheduleByDate.set(dateKey, [])
      }
      scheduleByDate.get(dateKey)!.push(block)
    }
  })

  // カレンダー表示用の日付範囲を決定
  const allDates = Array.from(scheduleByDate.keys())
    .map((d) => parse(d, "yyyy-MM-dd", new Date()))
    .filter((d) => !isNaN(d.getTime()))
  
  if (allDates.length === 0) {
    return <div className="text-white">スケジュール情報がありません</div>
  }

  const minDate = new Date(Math.min(...allDates.map((d) => d.getTime())))
  const maxDate = new Date(Math.max(...allDates.map((d) => d.getTime())))
  
  // 納期日も含める
  if (shipDate) {
    const shipDateObj = parse(shipDate, "yyyy-MM-dd", new Date())
    if (shipDateObj.getTime() > maxDate.getTime()) {
      maxDate.setTime(shipDateObj.getTime())
    }
    if (shipDateObj.getTime() < minDate.getTime()) {
      minDate.setTime(shipDateObj.getTime())
    }
  }

  // カレンダーの開始日と終了日（月の最初と最後）
  const startDate = startOfMonth(minDate)
  const endDate = endOfMonth(maxDate)
  const days = eachDayOfInterval({ start: startDate, end: endDate })

  // 週の開始日（月曜日）
  const weekStart = startDate.getDay() === 0 ? 6 : startDate.getDay() - 1
  const emptyDays = Array.from({ length: weekStart }, (_, i) => i)

  const getStatusColor = (status: string) => {
    switch (status) {
      case "確定":
        return "bg-emerald-400/40 border-emerald-400/60"
      case "調整中":
        return "bg-amber-400/40 border-amber-400/60"
      case "要確認":
        return "bg-rose-400/40 border-rose-400/60"
      default:
        return "bg-white/20 border-white/30"
    }
  }

  const [hoveredBlock, setHoveredBlock] = useState<string | null>(null)

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[500px]">
        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 gap-1.5 mb-3">
          {["月", "火", "水", "木", "金", "土", "日"].map((day) => (
            <div key={day} className="text-center text-xs font-semibold text-white/80 py-1">
              {day}
            </div>
          ))}
        </div>

        {/* カレンダーグリッド */}
        <div className="grid grid-cols-7 gap-1.5">
          {/* 空のセル（週の開始位置調整） */}
          {emptyDays.map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square" />
          ))}

          {/* 日付セル */}
          {days.map((day) => {
            const dateKey = format(day, "yyyy-MM-dd")
            const daySchedule = scheduleByDate.get(dateKey) || []
            const isShipDate = shipDate === dateKey
            const isToday = isSameDay(day, new Date())
            const isPast = day < new Date() && !isSameDay(day, new Date())

            return (
              <div
                key={dateKey}
                className={`aspect-square rounded-lg border-2 p-1.5 ${
                  isShipDate
                    ? "bg-cyan-500/50 border-cyan-400 ring-2 ring-cyan-300/50"
                    : isToday
                      ? "bg-blue-500/30 border-blue-400/50"
                      : isPast
                        ? "bg-white/10 border-white/20"
                        : "bg-white/20 border-white/30"
                }`}
              >
                <div className="flex flex-col h-full">
                  <div className={`text-[10px] font-semibold mb-0.5 ${isShipDate ? "text-cyan-100" : "text-white"}`}>
                    {format(day, "d")}
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-0.5">
                    {isShipDate && (
                      <div className="text-[9px] font-bold text-cyan-100 bg-cyan-600/50 px-1 py-0.5 rounded">
                        納期
                      </div>
                    )}
                    {daySchedule.map((block) => (
                      <div
                        key={block.id}
                        className="relative group"
                        onMouseEnter={() => setHoveredBlock(block.id)}
                        onMouseLeave={() => setHoveredBlock(null)}
                      >
                        <div
                          className={`text-[9px] px-1 py-0.5 rounded border cursor-pointer ${getStatusColor(block.status)}`}
                          title={`${block.focus} - ${block.owner}`}
                        >
                          <div className="font-semibold truncate">{block.focus}</div>
                          <div className="text-[8px] opacity-80">{block.timeFrame.split(" ")[1] || ""}</div>
                        </div>
                        {hoveredBlock === block.id && (
                          <div className="absolute z-10 top-full left-0 mt-1 w-48 p-2 rounded-lg bg-white/90 backdrop-blur-lg border border-white/30 shadow-xl text-black">
                            <div className="text-xs font-semibold mb-1">{block.focus}</div>
                            <div className="text-[10px] text-gray-600 mb-2">
                              {block.timeFrame} / 担当: {block.owner}
                            </div>
                            <div className="text-[10px] text-gray-700 mb-2">{block.note}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* 凡例 */}
        <div className="mt-6 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-cyan-500/50 border-2 border-cyan-400" />
            <span>納期（出荷予定日）</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-emerald-400/40 border border-emerald-400/60" />
            <span>確定</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-amber-400/40 border border-amber-400/60" />
            <span>調整中</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-rose-400/40 border border-rose-400/60" />
            <span>要確認</span>
          </div>
        </div>

        {/* 確定ボタン（右下） */}
        {schedule.some((b) => b.status !== "確定") && onScheduleUpdate && (
          <div className="mt-6 flex justify-end">
            <button
              onClick={() => {
                const updatedSchedule = schedule.map((b) => ({ ...b, status: "確定" as const }))
                onScheduleUpdate(updatedSchedule)
              }}
              className="px-6 py-3 text-base font-semibold rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg transition hover:shadow-xl"
            >
              すべて確定する
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
