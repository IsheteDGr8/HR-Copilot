/**
 * Browser client for the FastAPI SSE chat stream
 * (POST /api/v1/chat/stream → proxied to localhost:8000).
 *
 * Event shapes from backend/core/agent/loop.py:
 *   { event: 'delta', data: string }
 *   { event: 'tool_start', tool: string, args: object }
 *   { event: 'tool_end', tool: string, result?: any, error?: string }
 *   { event: 'canvas_update', data: { view: string, data: object } }
 *   { event: 'done' }
 */

export type SseCanvasUpdate = {
  view: string
  data: Record<string, unknown>
}

export type SseHandlers = {
  onDelta?: (text: string) => void
  onToolStart?: (tool: string, args: Record<string, unknown>) => void
  onToolEnd?: (tool: string, result?: unknown, error?: string) => void
  onCanvasUpdate?: (update: SseCanvasUpdate) => void
  onDone?: () => void
  onError?: (error: Error) => void
}

const DEFAULT_ENDPOINT = '/api/v1/chat/stream'
const DEFAULT_TOKEN = 'mock-jwt-token'

/**
 * Stream a chat turn from the FastAPI backend. Resolves when the stream ends
 * (or rejects on hard network/HTTP failure). Callers should pass an
 * AbortSignal so Stop can cancel mid-stream.
 */
export async function streamChat(
  message: string,
  handlers: SseHandlers = {},
  options: {
    endpoint?: string
    token?: string | null
    signal?: AbortSignal
  } = {},
): Promise<void> {
  const endpoint = options.endpoint || DEFAULT_ENDPOINT
  const token = options.token || DEFAULT_TOKEN
  const url = `${endpoint}?message=${encodeURIComponent(message)}`

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
      },
      signal: options.signal,
    })
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') return
    const error = err instanceof Error ? err : new Error(String(err))
    handlers.onError?.(error)
    return
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    const error = new Error(
      detail || `Chat stream failed (${response.status} ${response.statusText})`,
    )
    handlers.onError?.(error)
    return
  }

  if (!response.body) {
    const error = new Error('No response body from chat stream')
    handlers.onError?.(error)
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      // SSE frames are separated by blank lines; keep a partial trailing frame.
      const frames = buffer.split('\n')
      buffer = frames.pop() ?? ''

      for (const line of frames) {
        dispatchSseLine(line, handlers)
      }
    }

    // Flush any leftover line that never saw a trailing newline.
    if (buffer.trim()) dispatchSseLine(buffer, handlers)
    handlers.onDone?.()
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') return
    const error = err instanceof Error ? err : new Error(String(err))
    handlers.onError?.(error)
  }
}

function dispatchSseLine(line: string, handlers: SseHandlers) {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return

  const dataStr = trimmed.replace(/^data:\s?/, '')
  if (!dataStr || dataStr === '[DONE]') return

  let payload: any
  try {
    payload = JSON.parse(dataStr)
  } catch {
    console.error('Error parsing SSE data', dataStr)
    return
  }

  const event = payload?.event
  if (event === 'delta' && typeof payload.data === 'string' && payload.data.length > 0) {
    handlers.onDelta?.(payload.data)
    return
  }
  if (event === 'tool_start') {
    handlers.onToolStart?.(
      String(payload.tool || 'tool'),
      (payload.args && typeof payload.args === 'object' ? payload.args : {}) as Record<
        string,
        unknown
      >,
    )
    return
  }
  if (event === 'tool_end') {
    handlers.onToolEnd?.(
      String(payload.tool || 'tool'),
      payload.result,
      typeof payload.error === 'string' ? payload.error : undefined,
    )
    return
  }
  if (event === 'canvas_update' && payload.data && typeof payload.data === 'object') {
    handlers.onCanvasUpdate?.({
      view: String(payload.data.view || ''),
      data: (payload.data.data && typeof payload.data.data === 'object'
        ? payload.data.data
        : {}) as Record<string, unknown>,
    })
  }
  // 'done' is handled by the reader loop after the stream closes so onDone
  // fires exactly once per request.
}
