export async function readSseEventsFromResponse(response, onEvent) {
  if (!response?.body || typeof response.body.getReader !== 'function') {
    throw new Error('Missing response stream')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const emitBlock = (block) => {
    if (!block.trim()) return

    let eventName = 'message'
    const dataLines = []
    const lines = block.split('\n')

    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, '')
      if (!line || line.startsWith(':')) continue
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim() || 'message'
        continue
      }
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart())
      }
    }

    onEvent?.(eventName, dataLines.join('\n'))
  }

  const flushEvents = (force = false) => {
    let delimiterIndex = buffer.indexOf('\n\n')
    while (delimiterIndex !== -1) {
      emitBlock(buffer.slice(0, delimiterIndex))
      buffer = buffer.slice(delimiterIndex + 2)
      delimiterIndex = buffer.indexOf('\n\n')
    }

    if (force && buffer.trim()) {
      emitBlock(buffer)
      buffer = ''
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      flushEvents(true)
      break
    }

    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
    flushEvents(false)
  }
}
