import { NextRequest, NextResponse } from "next/server"

type SummaryRequest = {
    mode: "briefing" | "question"
    question?: string
    pageContext: unknown
}

const BRIEFING_PROMPT = `You are the briefing writer inside an HR Copilot intake dashboard.
You will receive the current page data as JSON. Write a short daily briefing the HR user
will enjoy scanning. Format it in light markdown:

- Open with one warm, plain sentence summarizing today (volume + how much the Copilot absorbed).
- Then a "**Needs you first**" line followed by 2-4 bullets, most urgent at top. Each bullet:
  **bold item name** — one short clause on why it's urgent (due date, cutoff, blocker).
- If something is time-critical today (payroll cutoff, same-day deadline), give it its own
  line starting with "⏰ " so it stands out.
- Close with one reassuring sentence about what's already handled.

Rules: under 130 words total. Bullets one line each. Bold sparingly — item names and
key deadlines only. No headers (#), no tables, no emoji except the single ⏰.`

const QUESTION_PROMPT = `You are an assistant embedded in an HR Copilot intake dashboard.
You will receive the current page data as JSON, plus a question from the user about
something on the page (a status label, an item, a metric, a term, or what to prioritize).

Answer using only the page data and general HR-tooling knowledge, formatted in light
markdown so it's pleasant to scan:

- Lead with the direct answer in one sentence. Bold the key term or item name.
- If listing items or steps (e.g. "what should I tackle first?"), use short bullets,
  one line each, ordered by urgency — reason from due dates, "Needs your judgement"
  status, and time-critical notes like payroll cutoffs.
- If defining a term, give the definition first, then one bullet showing an example
  from the current page data if one exists.
- If the question refers to something not in the data, say so plainly.

Rules: under 100 words. Bold sparingly. No headers, no tables, no emoji.`

function extractText(data: any): string {
    if (typeof data.output_text === "string" && data.output_text.trim()) {
        return data.output_text
    }
    if (Array.isArray(data.output)) {
        const text = data.output
            .flatMap((item: any) => item?.content ?? [])
            .map((c: any) => (typeof c?.text === "string" ? c.text : ""))
            .filter(Boolean)
            .join("\n")
        if (text.trim()) return text
    }
    const chat = data?.choices?.[0]?.message?.content
    if (typeof chat === "string" && chat.trim()) return chat
    return ""
}

export async function POST(req: NextRequest) {
    const apiKey = process.env.OPENAI_API_KEY
    const baseUrl = process.env.OPENAI_BASE_URL?.replace(/\/+$/, "")
    const model = process.env.OPENAI_MODEL ?? "gpt-5.2"

    if (!apiKey || !baseUrl) {
        return NextResponse.json(
            {
                error:
                    "OPENAI_API_KEY and OPENAI_BASE_URL must be set in .env.local. Restart the dev server after adding them.",
            },
            { status: 500 }
        )
    }

    let body: SummaryRequest
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
    }

    const isQuestion = body.mode === "question"
    if (isQuestion && !body.question?.trim()) {
        return NextResponse.json({ error: "Question mode requires a question." }, { status: 400 })
    }

    const systemPrompt = isQuestion ? QUESTION_PROMPT : BRIEFING_PROMPT
    const userContent = isQuestion
        ? `Page data:\n${JSON.stringify(body.pageContext, null, 2)}\n\nUser question: ${body.question}`
        : `Page data:\n${JSON.stringify(body.pageContext, null, 2)}`

    const headers = {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "api-key": apiKey,
    }

    try {
        let res = await fetch(`${baseUrl}/responses`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model,
                instructions: systemPrompt,
                input: userContent,
                max_output_tokens: 600,
            }),
        })

        if (res.status === 404 || res.status === 405) {
            res = await fetch(`${baseUrl}/chat/completions`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    model,
                    max_tokens: 600,
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userContent },
                    ],
                }),
            })
        }

        if (!res.ok) {
            const detail = await res.text()
            console.error("AI endpoint error:", res.status, detail)
            return NextResponse.json({ error: `AI request failed (${res.status}).` }, { status: 502 })
        }

        const data = await res.json()
        const text = extractText(data)

        if (!text) {
            console.error("Unrecognized AI response shape:", JSON.stringify(data).slice(0, 500))
            return NextResponse.json({ error: "AI returned an empty response." }, { status: 502 })
        }

        return NextResponse.json({ text })
    } catch (err) {
        console.error("AI summary route error:", err)
        return NextResponse.json({ error: "Could not reach the AI service." }, { status: 502 })
    }
}