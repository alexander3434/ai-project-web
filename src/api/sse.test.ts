import { describe, expect, it } from 'vitest'
import { createSseParser } from './sse'

const CHUNK = 'event: chunk\ndata: {"text":"Сейчас "}\n\n'
const DONE = 'event: done\ndata: {"answer":"Сейчас +15.4°C","model":"deepseek"}\n\n'

describe('createSseParser', () => {
  it('parses whole frames separated by blank lines', () => {
    const parser = createSseParser()

    expect(parser.push(CHUNK + DONE)).toEqual([
      { event: 'chunk', data: '{"text":"Сейчас "}' },
      { event: 'done', data: '{"answer":"Сейчас +15.4°C","model":"deepseek"}' },
    ])
  })

  it('accepts \\r\\n and a bare \\r as line endings', () => {
    const parser = createSseParser()

    expect(parser.push('event: chunk\r\ndata: {"text":"а"}\r\n\r\n')).toEqual([
      { event: 'chunk', data: '{"text":"а"}' },
    ])
    // The final bare \r may still become \r\n, so it is held until the next push.
    expect(parser.push('event: done\rdata: {"answer":"а"}\r\r')).toEqual([])
    expect(parser.push('\n')).toEqual([{ event: 'done', data: '{"answer":"а"}' }])
  })

  it('strips exactly one space after data: and keeps the rest', () => {
    const parser = createSseParser()

    expect(parser.push('event: chunk\ndata:  two\n\n')).toEqual([{ event: 'chunk', data: ' two' }])
  })

  it('joins multiple data lines with a newline and ignores id/retry/comments', () => {
    const parser = createSseParser()

    expect(parser.push(': keep-alive\nid: 42\nretry: 3000\nevent: done\ndata: first\ndata: second\n\n')).toEqual([
      { event: 'done', data: 'first\nsecond' },
    ])
  })

  it('uses the default event name when the frame has no event line', () => {
    const parser = createSseParser()

    expect(parser.push('data: {"text":"а"}\n\n')).toEqual([{ event: 'message', data: '{"text":"а"}' }])
  })

  it('emits nothing for a comment-only frame', () => {
    const parser = createSseParser()

    expect(parser.push(': keep-alive\n\n')).toEqual([])
  })

  it('keeps a partial frame between pushes and emits it when the terminator arrives', () => {
    const parser = createSseParser()

    expect(parser.push('event: chunk\ndata: {"text":"Сей')).toEqual([])
    expect(parser.push('час "}')).toEqual([])
    expect(parser.push('\n\n')).toEqual([{ event: 'chunk', data: '{"text":"Сейчас "}' }])
  })

  it('survives a frame split between \\r and \\n', () => {
    const parser = createSseParser()

    expect(parser.push('event: chunk\r\ndata: {"text":"а"}\r')).toEqual([])
    expect(parser.push('\n\r\n')).toEqual([{ event: 'chunk', data: '{"text":"а"}' }])
  })

  it('survives a data line split across pushes', () => {
    const parser = createSseParser()

    expect(parser.push('event: done\ndata: {"ans')).toEqual([])
    expect(parser.push('wer":"готово"}\n')).toEqual([])
    expect(parser.push('\n')).toEqual([{ event: 'done', data: '{"answer":"готово"}' }])
  })

  it('returns two frames in one push and keeps the third incomplete one', () => {
    const parser = createSseParser()

    expect(parser.push(CHUNK + DONE + 'event: chunk\ndata: {"text":"хвос')).toEqual([
      { event: 'chunk', data: '{"text":"Сейчас "}' },
      { event: 'done', data: '{"answer":"Сейчас +15.4°C","model":"deepseek"}' },
    ])
    expect(parser.push('т"}\n')).toEqual([])
    expect(parser.push('\n')).toEqual([{ event: 'chunk', data: '{"text":"хвост"}' }])
  })

  it('emits nothing for a trailing incomplete frame', () => {
    const parser = createSseParser()

    expect(parser.push(CHUNK + 'event: chunk\ndata: {"text":"обрыв"}')).toEqual([
      { event: 'chunk', data: '{"text":"Сейчас "}' },
    ])
  })
})
