/**
 * T-12: парсер SSE-кадров. Тесты офлайн: только строки, без сети и DOM (NFR-01).
 * Отдельно проверяются разрезы кадров между вызовами `push` — главный риск R-07.
 */

import { describe, expect, it } from 'vitest'
import { createSseParser } from './sse'

describe('createSseParser', () => {
  it('разбирает кадр с event и data', () => {
    const parser = createSseParser()

    expect(parser.push('event: chunk\ndata: {"text":"Сейчас "}\n\n')).toEqual([
      { event: 'chunk', data: '{"text":"Сейчас "}' },
    ])
  })

  it('даёт кадру без строки event имя message', () => {
    const parser = createSseParser()

    expect(parser.push('data: {"text":"привет"}\n\n')).toEqual([
      { event: 'message', data: '{"text":"привет"}' },
    ])
  })

  it('склеивает несколько строк data через перевод строки', () => {
    const parser = createSseParser()

    expect(parser.push('event: chunk\ndata: первая\ndata: вторая\n\n')).toEqual([
      { event: 'chunk', data: 'первая\nвторая' },
    ])
  })

  it('отбрасывает ровно один ведущий пробел после data: и event:', () => {
    const parser = createSseParser()

    expect(parser.push('event:  chunk\ndata:  {"text":"a"}\n\n')).toEqual([
      { event: ' chunk', data: ' {"text":"a"}' },
    ])
  })

  it('игнорирует комментарии, id:, retry: и строки без двоеточия', () => {
    const parser = createSseParser()

    const events = parser.push(
      ': комментарий\nid: 42\nretry: 3000\nстрока без двоеточия\nunknown: поле\nevent: done\ndata: {"answer":"ок"}\n\n',
    )

    expect(events).toEqual([{ event: 'done', data: '{"answer":"ок"}' }])
  })

  it('разбирает кадры с переводами строк \\r\\n', () => {
    const parser = createSseParser()

    expect(parser.push('event: chunk\r\ndata: {"text":"а"}\r\n\r\n')).toEqual([
      { event: 'chunk', data: '{"text":"а"}' },
    ])
  })

  it('переживает разрез кадра между \\r и \\n двух push', () => {
    const parser = createSseParser()

    expect(parser.push('event: chunk\ndata: {"text":"а"}\r')).toEqual([])
    expect(parser.push('\n\r\n')).toEqual([{ event: 'chunk', data: '{"text":"а"}' }])
  })

  it('переживает разрез внутри JSON-payload', () => {
    const parser = createSseParser()

    expect(parser.push('event: chunk\ndata: {"text":"Сей')).toEqual([])
    expect(parser.push('час"}\n\n')).toEqual([{ event: 'chunk', data: '{"text":"Сейчас"}' }])
  })

  it('переживает разрез строки data: между push', () => {
    const parser = createSseParser()

    expect(parser.push('event: chunk\ndata')).toEqual([])
    expect(parser.push(': {"text":"ок"}\n')).toEqual([])
    expect(parser.push('\n')).toEqual([{ event: 'chunk', data: '{"text":"ок"}' }])
  })

  it('отдаёт два полных кадра из одного push и придерживает неполный третий', () => {
    const parser = createSseParser()

    const events = parser.push(
      'event: chunk\ndata: {"text":"1"}\n\nevent: chunk\ndata: {"text":"2"}\n\nevent: chunk\ndata: {"te',
    )

    expect(events).toEqual([
      { event: 'chunk', data: '{"text":"1"}' },
      { event: 'chunk', data: '{"text":"2"}' },
    ])
    expect(parser.push('xt":"3"}\n\n')).toEqual([{ event: 'chunk', data: '{"text":"3"}' }])
  })

  it('не эмитит ничего на кадр без data (только комментарий)', () => {
    const parser = createSseParser()

    expect(parser.push(': ping\n\n')).toEqual([])
    expect(parser.push('\n\n')).toEqual([])
  })

  it('не эмитит незавершённый последний кадр', () => {
    const parser = createSseParser()

    expect(parser.push('event: chunk\ndata: {"text":"хвост"}')).toEqual([])
    expect(parser.push('')).toEqual([])
  })

  it('сохраняет порядок кадров потока', () => {
    const parser = createSseParser()

    const events = parser.push(
      'event: chunk\ndata: {"text":"раз"}\n\nevent: chunk\ndata: {"text":"два"}\n\nevent: done\ndata: {"answer":"раз два"}\n\n',
    )

    expect(events.map((event) => event.event)).toEqual(['chunk', 'chunk', 'done'])
    expect(events[2].data).toBe('{"answer":"раз два"}')
  })

  it('ведёт независимые буферы у разных парсеров', () => {
    const first = createSseParser()
    const second = createSseParser()

    expect(first.push('event: chunk\ndata: {"text":"хвост')).toEqual([])
    expect(second.push('event: done\ndata: {"answer":"ок"}\n\n')).toEqual([
      { event: 'done', data: '{"answer":"ок"}' },
    ])
    expect(first.push('"}\n\n')).toEqual([{ event: 'chunk', data: '{"text":"хвост"}' }])
  })
})
