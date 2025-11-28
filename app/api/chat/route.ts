import { NextResponse } from "next/server"
import OpenAI from "openai"
import { PROFILE_DATA } from "@/lib/profile-data"
import { SALESFORCE_DATA } from "@/lib/salesforce-data"

// 田上本部長のシステムプロンプト
const SYSTEM_PROMPT = `
あなたは「田上（たのうえ）本部長」です。
部下（ユーザー）からの相談に乗る、経験豊富で頼れる営業本部長として振る舞ってください。

## キャラクター設定
- 役割: 営業本部長
- 口調: 「お疲れさん」「～だろ？」「～はどう考える？」「～じゃないか」など、フランクだが威厳と温かみのある口調。敬語は崩して構いません。
- 専門: 営業戦略、アカウントプラン、キャリア形成、組織マネジメント。
- スタイル: 一方的に答えを教えるのではなく、部下の考えを引き出すコーチングスタイルを好みます。
- 禁止事項: 「AIアシスタントです」といった自己紹介はせず、徹底して「田上本部長」になりきってください。

## HRデータ（黒田 憧）の参照について
- ユーザーから「キャリア相談」や「評価」「強み」など、この人物に関する質問があった場合は、以下のHRデータを参照して回答してください。
- 本人に対しても、客観的なHRデータを踏まえたアドバイスを行ってください。

--- HRデータ開始 ---
${PROFILE_DATA}
--- HRデータ終了 ---

## Salesforceデータ（トヨタ自動車案件）の参照について
- ユーザーから「トヨタ」や「トヨタ自動車」に関する質問があった場合は、以下のSalesforceデータを参照して回答してください。
- 具体的な案件内容、提案状況、Next Stepなどを踏まえたアドバイスを行ってください。

--- Salesforceデータ開始 ---
${SALESFORCE_DATA}
--- Salesforceデータ終了 ---

## ユーザーへの対応
- ユーザーはあなたの部下です。
- 相談に対しては、視座の高いアドバイス（経営視点や市場視点）を提供してください。
- 時に厳しく、時に優しく、部下の成長を後押ししてください。
`

export async function POST(req: Request) {
  try {
    const { messages } = await req.json()

    // ユーザーが "GPT5.1" を求めているため、現時点で利用可能な最新のフラグシップモデルを使用します
    // 将来的に "gpt-5.1" がリリースされた場合は、ここを更新してください
    // model = "gpt-4o" // デフォルトはコメントアウト
    // エラーハンドリングのため、一時的に gpt-3.5-turbo を使用するか、try-catch内でAPIキーの存在確認を行います

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenAI API Key not configured" },
        { status: 500 }
      )
    }

    const openai = new OpenAI({ apiKey })
    const model = "gpt-4o" 

    // システムプロンプトをメッセージ履歴の先頭に追加
    const messagesWithSystem = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages
    ]

    const completion = await openai.chat.completions.create({
      model: model,
      messages: messagesWithSystem,
    })

    const reply = completion.choices[0].message.content

    return NextResponse.json({ content: reply })
  } catch (error) {
    console.error("Error calling OpenAI API:", error)
    return NextResponse.json(
      { error: "Failed to generate response from OpenAI API" },
      { status: 500 }
    )
  }
}
