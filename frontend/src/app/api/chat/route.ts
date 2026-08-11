import { NextRequest, NextResponse } from 'next/server'
import path from 'node:path'
import fs from 'node:fs'
import { HR_ACTION_TOOLS } from '@/lib/hr-actions'

// Server-side base URL for the HRAgents agent server. Secrets (the LLM API
// key) only ever live in this Next.js server process — they are never sent to
// the browser. The browser talks to the backend directly only for the
// (secret-free) event WebSocket.
const HRAGENT_API_URL = (process.env.HRAGENT_API_URL || 'http://127.0.0.1:8001').replace(/\/$/, '')

// Relative paths resolve against the backend process's working directory
// (the HRAgent_Main folder). Absolute paths also work.
const WORKSPACE_DIR = process.env.HRAGENT_WORKSPACE_DIR || 'workspace'

// Optional backend auth. When the HRAgents server is started with
// SESSION_API_KEY set, every /api/* call must carry X-Session-API-Key. We keep
// that key server-side here so it is never exposed to the browser. Empty =
// backend is open (local testing default).
const SESSION_API_KEY = process.env.HRAGENT_SESSION_API_KEY || ''

// Base headers for server-to-backend REST calls, including auth when configured.
function backendHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra }
  if (SESSION_API_KEY) headers['X-Session-API-Key'] = SESSION_API_KEY
  return headers
}

// ---------------------------------------------------------------------------
// hr-mcp: read-only HR data tools (Azure SQL + AI Search, mock-backed for now)
// ---------------------------------------------------------------------------
// The backend spawns the hr-mcp server as an MCP stdio subprocess using the
// backend's venv Python (so fastmcp + deps resolve). Paths default relative to
// the repo layout and are overridable via env. Set HR_MCP_ENABLED=false to run
// the agent without HR tools.
const HR_MCP_ENABLED = (process.env.HR_MCP_ENABLED ?? 'true').toLowerCase() !== 'false'
const REPO_ROOT = path.resolve(process.cwd(), '..')
const HR_MCP_PYTHON =
  process.env.HR_MCP_PYTHON ||
  path.join(REPO_ROOT, 'HRAgent_Main', '.venv', 'Scripts', 'python.exe')
const HR_MCP_DIR = process.env.HR_MCP_DIR || path.join(REPO_ROOT, 'hr_mcp')
const HR_MCP_SERVER = process.env.HR_MCP_SERVER || path.join(HR_MCP_DIR, 'server.py')
const HR_MCP_DATA_BACKEND = process.env.HR_MCP_DATA_BACKEND || 'mock'

// Build the agent.mcp_config map. Empty when disabled or the server/python is
// missing (so the agent still runs as a plain conversational assistant).
function buildMcpConfig(): Record<string, unknown> {
  if (!HR_MCP_ENABLED) return {}
  if (!fs.existsSync(HR_MCP_SERVER) || !fs.existsSync(HR_MCP_PYTHON)) {
    console.warn(
      `[hr-mcp] disabled: missing ${!fs.existsSync(HR_MCP_PYTHON) ? HR_MCP_PYTHON : HR_MCP_SERVER}`,
    )
    return {}
  }
  return {
    hr: {
      transport: 'stdio',
      command: HR_MCP_PYTHON,
      args: [HR_MCP_SERVER],
      cwd: HR_MCP_DIR,
      env: { HR_MCP_DATA_BACKEND },
    },
  }
}

// Active LLM provider. Default is "tokenrouter" (OpenAI-compatible router).
// Supported choices: "tokenrouter", "groq", "ollama", "openai", "azure", "gemini"
const LLM_PROVIDER = (process.env.LLM_PROVIDER || 'tokenrouter').toLowerCase()

// The `llm` block sent to the backend. The model *prefix* selects the provider
// client inside the backend's LiteLLM layer:
//   - "openai/<model>"      → TokenRouter / OpenAI-compatible endpoint with base_url
//   - "groq/<model>"        → Groq (testing; free tier, OpenAI-compatible)
//   - "ollama_chat/<model>" → local Ollama (testing; unlimited, no key, tools)
//   - "gemini/<model>"      → Google Gemini (alt testing)
//   - "<model>"             → OpenAI (final; e.g. gpt-4o)
//   - "azure/<deployment>"  → Azure OpenAI (final; enterprise)
type LlmConfig = Record<string, unknown>

function buildLlmConfig(): { llm?: LlmConfig; error?: string } {
  if (LLM_PROVIDER === 'tokenrouter') {
    const apiKey =
      process.env.TOKENROUTER_API_KEY ||
      'sk-v8NoCrajDilDlx1k53N2q8Iwevt3Jv0FLzL6xllGd0Xvi3jV'
    const baseUrl =
      process.env.TOKENROUTER_BASE_URL || 'https://api.tokenrouter.com/v1'
    const model = process.env.TOKENROUTER_MODEL || 'moonshotai/kimi-k3-free'

    if (!apiKey) {
      return {
        error:
          'TokenRouter is not configured. Missing: TOKENROUTER_API_KEY. ' +
          'Set it in .env.local.',
      }
    }
    return {
      llm: {
        usage_id: 'agent',
        model: model.startsWith('openai/') ? model : `openai/${model}`,
        base_url: baseUrl,
        api_key: apiKey,
      },
    }
  }

  if (LLM_PROVIDER === 'ollama') {
    // Local Ollama via LiteLLM. We use the "ollama_chat/" prefix (Ollama's
    // /api/chat endpoint) rather than legacy "ollama/" (/api/generate): only
    // ollama_chat does NATIVE function/tool calling, which the HR agent needs to
    // actually execute the MCP tools. The prefix carries the provider, so the
    // backend passes `base_url` straight through as LiteLLM's `api_base`. No API
    // key: Ollama has no auth and the backend's api_key is optional (nothing to
    // bypass). Set OLLAMA_MODEL without a prefix — the route adds "ollama_chat/".
    const model = process.env.OLLAMA_MODEL || 'llama3.1'
    const apiBase =
      process.env.OLLAMA_API_BASE || process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
    // LiteLLM's static metadata reports an 8k window for ollama/llama3.1, which
    // trips HRAgents' 16k minimum context-window guard. llama3.1 actually
    // supports up to 128k, so declare the real window explicitly — the backend
    // trusts `max_input_tokens` over LiteLLM's metadata. Override via env.
    const maxInputTokens = Number(process.env.OLLAMA_MAX_INPUT_TOKENS || '32768')
    return {
      llm: {
        usage_id: 'agent',
        model: `ollama_chat/${model}`,
        // Maps to LiteLLM's api_base so requests route to the local daemon.
        base_url: apiBase,
        max_input_tokens: maxInputTokens,
        // The backend defaults reasoning_effort="high", which LiteLLM turns into
        // Ollama's `think` flag — llama3.1 rejects it ("does not support
        // thinking"). Null disables reasoning so the request is a plain chat
        // completion (tool calling + streaming still work).
        reasoning_effort: null,
      },
    }
  }

  if (LLM_PROVIDER === 'groq') {
    const apiKey = process.env.GROQ_API_KEY
    // Llama 3.3 70B is a strong, tool-calling-capable Groq model. Override with
    // GROQ_MODEL (without the "groq/" prefix — the route adds it).
    const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
    if (!apiKey) {
      return {
        error:
          'Groq is not configured. Missing: GROQ_API_KEY. ' +
          'Set it in .env.local (get a free key at https://console.groq.com/keys).',
      }
    }
    return {
      llm: {
        usage_id: 'agent',
        // The "groq/" prefix routes LiteLLM to Groq's OpenAI-compatible API.
        model: `groq/${model}`,
        api_key: apiKey,
      },
    }
  }

  if (LLM_PROVIDER === 'azure') {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT
    const apiKey = process.env.AZURE_OPENAI_API_KEY
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview'
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT

    const missing: string[] = []
    if (!endpoint) missing.push('AZURE_OPENAI_ENDPOINT')
    if (!apiKey) missing.push('AZURE_OPENAI_API_KEY')
    if (!deployment) missing.push('AZURE_OPENAI_DEPLOYMENT')
    if (missing.length > 0) {
      return {
        error:
          `Azure OpenAI is not configured. Missing: ${missing.join(', ')}. ` +
          `Set these in .env.local (or switch LLM_PROVIDER=gemini for testing).`,
      }
    }
    return {
      llm: {
        usage_id: 'agent',
        model: `azure/${deployment}`,
        base_url: endpoint,
        api_version: apiVersion,
        api_key: apiKey,
      },
    }
  }

  if (LLM_PROVIDER === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY
    const model = process.env.OPENAI_MODEL || 'gpt-4o'
    const baseUrl = process.env.OPENAI_BASE_URL // optional (proxies / compatible endpoints)
    if (!apiKey) {
      return {
        error:
          'OpenAI is not configured. Missing: OPENAI_API_KEY. ' +
          'Set it in .env.local (or switch LLM_PROVIDER=gemini for testing).',
      }
    }
    return {
      llm: {
        usage_id: 'agent',
        // LiteLLM treats an unprefixed known model name as OpenAI.
        model,
        api_key: apiKey,
        ...(baseUrl ? { base_url: baseUrl } : {}),
      },
    }
  }

  // Default: Google Gemini (testing).
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest'
  if (!apiKey) {
    return {
      error:
        'Gemini is not configured. Missing: GEMINI_API_KEY. ' +
        'Copy .env.example to .env.local and set GEMINI_API_KEY.',
    }
  }
  return {
    llm: {
      usage_id: 'agent',
      model: `gemini/${model}`,
      api_key: apiKey,
      max_input_tokens: 1048576, // Gemini 1.5 Flash has a 1M token context window
    },
  }
}

// ---------------------------------------------------------------------------
// HR persona + guardrails
// ---------------------------------------------------------------------------
// Appended to the backend's built-in system prompt via agent_context so we keep
// the framework's tool-use/security scaffolding and layer the HR identity,
// scope limits, grounding rules, and human-in-the-loop policy on top.
const HR_SYSTEM_SUFFIX = `You are the AI HR Copilot for authorized HR staff at this company. Help with employee lookups, compensation, PTO/leave, benefits, org structure, policy Q&A, ticket triage, onboarding/offboarding, and drafting HR communications.

AUDIENCE — the user is authorized HR:
- They may view employee records for HR work (profile, salary, PTO, benefits, org chart). Never refuse an HR lookup on privacy grounds, and never ask them to re-confirm they are HR.
- Look data up with tools, then answer. Do not lecture about confidentiality.

SCOPE:
- Stay in HR. For off-topic asks (code, trivia, unrelated advice), decline in one short sentence and offer an HR alternative.

GROUNDING:
- Never invent employee facts, salaries, PTO, org structure, dates, or policy text. Use tools first for employee questions (employee_lookup, pto_balance, org_chart, benefits_lookup, policy_search), then answer only from tool results.
- If a field is missing from the tool result, say so plainly — do not invent it and do not refuse as a privacy matter.
- Cite policy document/section when answering from policies.

RESPONSE STYLE:
- Lead with the answer in the first sentence. Keep replies short and skimmable (usually 2–6 sentences or a tight bullet list).
- On greetings ("hi", "hello"), reply in 1–2 warm sentences and offer 2–3 concrete examples of what you can look up — no readiness check-ins ("confirm when you are ready").
- After a lookup, state the key fact(s) clearly (name numbers with units, e.g. "$165,000 / year" or "12 PTO days remaining"). Add one short helpful follow-up only if useful.
- Do not narrate your process ("I will now look that up", "Let me check"). Just use the tool and answer.
- Do not dump raw JSON or tool payloads into the chat.

HUMAN-IN-THE-LOOP:
- Reads/lookups are free — no approval needed.
- To SEND email/Slack/Teams, call send_email / send_slack_message / send_teams_message with a complete draft. These do NOT send immediately; tell the user you prepared it on the Side Canvas for Approve & Send. Never claim it was already sent.
- For other write actions without a tool, propose the change and ask for confirmation.

CONFIDENTIALITY:
- Answer the HR user fully for what they asked; do not volunteer extra sensitive fields they did not request.`

// Response tuning. Low temperature favors accuracy/consistency for HR facts.
// Overridable via env without code changes.
const LLM_TEMPERATURE = Number(process.env.HR_LLM_TEMPERATURE ?? '0.2')
const LLM_MAX_OUTPUT_TOKENS = Number(process.env.HR_LLM_MAX_OUTPUT_TOKENS ?? '2048')

// Token streaming. When true the backend wires the LLM stream callback and
// publishes StreamingDeltaEvents over the WebSocket, so the UI renders the
// answer token-by-token. The durable MessageEvent still arrives at the end
// (deltas are a transient UX affordance), so this is safe to leave on. Set
// HR_LLM_STREAM=false to fall back to whole-message delivery.
const LLM_STREAM = (process.env.HR_LLM_STREAM ?? 'true').toLowerCase() !== 'false'

// Health check (GET without query) and final-response fetch (GET ?final=1).
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const conversationId = searchParams.get('conversationId')
  const wantsFinal = searchParams.get('final')

  if (conversationId && wantsFinal) {
    try {
      const res = await fetch(
        `${HRAGENT_API_URL}/api/conversations/${conversationId}/agent_final_response`,
        { headers: backendHeaders() },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        return NextResponse.json(
          { error: body?.detail || 'Failed to fetch final response' },
          { status: res.status || 502 },
        )
      }
      return NextResponse.json({ response: body?.response ?? '' })
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to fetch final response' },
        { status: 502 },
      )
    }
  }

  try {
    const res = await fetch(`${HRAGENT_API_URL}/health`, { headers: backendHeaders() })
    if (!res.ok) {
      return NextResponse.json(
        { connected: false, detail: 'Agent health check failed' },
        { status: 503 },
      )
    }
    return NextResponse.json({ connected: true })
  } catch (error) {
    return NextResponse.json(
      { connected: false, detail: error instanceof Error ? error.message : 'Health check failed' },
      { status: 503 },
    )
  }
}

// Create a new backend conversation configured to use the selected LLM provider.
export async function POST() {
  const { llm, error } = buildLlmConfig()
  if (!llm) {
    return NextResponse.json({ error }, { status: 400 })
  }

  // Apply HR response tuning to whichever provider is active. LiteLLM maps
  // these per-provider; reasoning-only models strip temperature automatically.
  const tunedLlm: LlmConfig = {
    ...llm,
    temperature: LLM_TEMPERATURE,
    max_output_tokens: LLM_MAX_OUTPUT_TOKENS,
    stream: LLM_STREAM,
  }

  // The model prefix (gemini/… , azure/… , or bare OpenAI name) routes the
  // backend's LiteLLM layer to the matching provider client.
  //
  // NOTE: This HRAgents build ships the exec-tool *implementations* stripped out
  // ("removed during the cleanup"). We send no exec tools yet; enterprise data
  // and comms arrive as MCP tools in Phase 2. The agent keeps its built-in
  // finish/think tools and runs as a conversational HR assistant for now.
  //
  // Guardrails:
  // - agent_context.system_message_suffix installs the HR persona + scope +
  //   grounding + human-in-the-loop rules on top of the built-in prompt. This is
  //   the active enforcement for "stay in lane" and "draft, don't auto-send".
  // - No global confirmation_policy: ConfirmRisky confirms EVERY tool call here
  //   because, with no security_analyzer registered in this build, every action
  //   is UNKNOWN risk (confirm_unknown=true). That would force approval even on
  //   read-only lookups. So reads flow freely, and selective "Approve & Send"
  //   HITL for write/comms actions is implemented in Phase 4b via client_tools
  //   (those surface to the browser and execute only after canvas approval).
  const startConversationRequest = {
    workspace: { working_dir: WORKSPACE_DIR },
    agent: {
      kind: 'Agent',
      llm: tunedLlm,
      tools: [],
      // Read-only HR data tools (employee_lookup, pto_balance, org_chart,
      // benefits_lookup, policy_search). Mock-backed now; swappable to Azure.
      mcp_config: buildMcpConfig(),
      agent_context: {
        system_message_suffix: HR_SYSTEM_SUFFIX,
      },
    },
    confirmation_policy: {
      kind: 'ConfirmRisky'
    },
    security_analyzer: {
      kind: 'LLMSecurityAnalyzer'
    },
    // Human-in-the-loop action tools (send_email / send_slack_message /
    // send_teams_message). The backend registers these and, when the agent
    // calls one, emits an ActionEvent + immediately acks WITHOUT performing the
    // action. The frontend renders an "Approve & Send" card on the Side Canvas;
    // the human is the enforcement point. No secrets here — actual delivery is
    // wired in Phase 2b behind the same approval gate.
    client_tools: HR_ACTION_TOOLS,
    max_iterations: 100,
  }

  try {
    const res = await fetch(`${HRAGENT_API_URL}/api/conversations`, {
      method: 'POST',
      headers: backendHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(startConversationRequest),
    })

    const body = await res.json().catch(() => null)
    if (!res.ok) {
      const detail =
        (body && (body.detail || body.exception || body.error)) ||
        'Failed to create conversation on the HR Agent backend'
      console.error('HR Agent create-conversation error:', detail)
      return NextResponse.json(
        { error: typeof detail === 'string' ? detail : JSON.stringify(detail) },
        { status: res.status || 502 },
      )
    }

    if (!body?.id) {
      return NextResponse.json(
        { error: 'HR Agent backend did not return a conversation id' },
        { status: 502 },
      )
    }

    return NextResponse.json({ conversationId: body.id })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}

// Interrupt a running conversation.
export async function DELETE(request: NextRequest) {
  let conversationId: string | undefined
  try {
    const body = await request.json()
    conversationId = body?.conversationId
  } catch {
    /* no body */
  }
  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId is required' }, { status: 400 })
  }
  try {
    await fetch(`${HRAGENT_API_URL}/api/conversations/${conversationId}/interrupt`, {
      method: 'POST',
      headers: backendHeaders(),
    })
  } catch {
    /* best effort */
  }
  return NextResponse.json({ success: true })
}
