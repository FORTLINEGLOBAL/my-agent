import type { Config, Context } from "@netlify/functions"
import Anthropic from "@anthropic-ai/sdk"
import { createHash, timingSafeEqual } from "node:crypto"
import rulebook from "./lib/rulebook.mjs"

const DEFAULT_MODEL = "claude-sonnet-5-5"
const MAX_MESSAGES = 40
const MAX_CHARS_PER_MESSAGE = 20000

function passwordOk(given: string | null): boolean {
  const expected = Netlify.env.get("CHAT_PASSWORD")
  if (!expected || !given) return false
  const a = createHash("sha256").update(given).digest()
  const b = createHash("sha256").update(expected).digest()
  return timingSafeEqual(a, b)
}

function systemPrompt(): string {
  const now = new Date().toLocaleString("en-GB", {
    timeZone: "Europe/Vienna",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
  return `You are Forti's chief of staff, talking with Forti in a private web chat.
Follow the rule book below exactly. It is Forti's standing instruction.

Current date and time in Vienna: ${now}.

What you can and cannot do in this version:
- You can talk, plan, prioritise, prepare meetings and write drafts (emails, messages, agendas) right here in the chat.
- You cannot read or change Forti's email or calendar yet, and you cannot send anything, book anything or set reminders on your own.
- If Forti asks you to send, book, move or cancel something, say plainly that this version cannot do it yet, and offer a draft or a checklist instead. Never pretend an action happened.
- Even once tools are added, never send an email or touch the calendar without Forti's explicit yes in this chat.

Format: keep replies short, point first. Put each draft in its own block starting with "Draft:" and a one-line summary.

=== RULE BOOK ===
${rulebook}`
}

type Msg = { role: "user" | "assistant"; content: string }

function cleanMessages(input: unknown): Msg[] | null {
  if (!Array.isArray(input) || input.length === 0) return null
  const msgs = input.slice(-MAX_MESSAGES).map((m) => ({
    role: m?.role === "assistant" ? "assistant" : "user",
    content: String(m?.content ?? "").slice(0, MAX_CHARS_PER_MESSAGE),
  })) as Msg[]
  while (msgs.length && msgs[0].role !== "user") msgs.shift()
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return null
  return msgs.filter((m) => m.content.trim().length > 0)
}

export default async (req: Request, context: Context) => {
  if (!Netlify.env.get("CHAT_PASSWORD")) {
    return Response.json({ error: "The chat password is not set up yet." }, { status: 503 })
  }
  if (!passwordOk(req.headers.get("x-chat-password"))) {
    return Response.json({ error: "Wrong password." }, { status: 401 })
  }

  const url = new URL(req.url)
  if (url.pathname.endsWith("/login")) {
    return Response.json({ ok: true })
  }

  const body = await req.json().catch(() => null)
  const messages = cleanMessages(body?.messages)
  if (!messages) {
    return Response.json({ error: "Nothing to answer." }, { status: 400 })
  }

  if (!Netlify.env.get("ANTHROPIC_API_KEY") && !process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "No AI access yet: add ANTHROPIC_API_KEY in Netlify, or enable Netlify AI Gateway." },
      { status: 503 },
    )
  }

  const anthropic = new Anthropic()
  const model = Netlify.env.get("CHAT_MODEL") || DEFAULT_MODEL
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const res = anthropic.messages.stream({
          model,
          max_tokens: 4096,
          system: systemPrompt(),
          messages,
        })
        for await (const event of res) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }
      } catch (e) {
        console.error("chat error", e)
        controller.enqueue(encoder.encode("\n\n[Sorry, something went wrong reaching the model. Try again.]"))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  })
}

export const config: Config = {
  path: ["/api/chat", "/api/login"],
  method: "POST",
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ["ip", "domain"] },
}
