export type SseEvent = { event: string; data: string }

const DEFAULT_EVENT = 'message'

/**
 * Incremental parser for the backend's SSE-style frames (`event:`/`data:` lines,
 * blank line between frames). A network read can stop anywhere, so the state is
 * kept between `push` calls: only a frame whose blank-line terminator has
 * arrived is returned. `id`, `retry` and comment (`:`) lines are ignored, and
 * exactly one space after `data:` is stripped.
 */
export function createSseParser(): { push(text: string): SseEvent[] } {
  let buffer = ''
  let eventName = ''
  let dataLines: string[] = []

  function handleLine(line: string, events: SseEvent[]): void {
    if (line === '') {
      if (dataLines.length > 0) {
        events.push({ event: eventName === '' ? DEFAULT_EVENT : eventName, data: dataLines.join('\n') })
      }
      eventName = ''
      dataLines = []
      return
    }
    if (line.startsWith(':')) return
    const separator = line.indexOf(':')
    const field = separator === -1 ? line : line.slice(0, separator)
    let value = separator === -1 ? '' : line.slice(separator + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'data') {
      dataLines.push(value)
    } else if (field === 'event') {
      eventName = value
    }
  }

  return {
    push(text: string): SseEvent[] {
      buffer += text
      const events: SseEvent[] = []
      let start = 0
      for (let index = 0; index < buffer.length; index += 1) {
        const char = buffer[index]
        if (char === '\r') {
          // A trailing \r may still become \r\n: wait for the next push.
          if (index + 1 === buffer.length) break
          handleLine(buffer.slice(start, index), events)
          if (buffer[index + 1] === '\n') index += 1
          start = index + 1
        } else if (char === '\n') {
          handleLine(buffer.slice(start, index), events)
          start = index + 1
        }
      }
      buffer = buffer.slice(start)
      return events
    },
  }
}
