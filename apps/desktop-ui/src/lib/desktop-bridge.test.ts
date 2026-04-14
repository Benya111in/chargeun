import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockConvertFileSrc, mockIsTauri } = vi.hoisted(() => ({
  mockConvertFileSrc: vi.fn((path: string) => `asset://${path}`),
  mockIsTauri: vi.fn(() => false),
}))

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: mockConvertFileSrc,
  invoke: vi.fn(),
  isTauri: mockIsTauri,
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}))

import { resolveLocalMediaSrc } from './desktop-bridge'

describe('resolveLocalMediaSrc', () => {
  beforeEach(() => {
    mockConvertFileSrc.mockClear()
    mockIsTauri.mockReset()
    mockIsTauri.mockReturnValue(false)
  })

  it('returns null for an empty path', () => {
    expect(resolveLocalMediaSrc('')).toBeNull()
  })

  it('passes through already-resolved URLs', () => {
    expect(resolveLocalMediaSrc('https://example.com/demo.mp4')).toBe(
      'https://example.com/demo.mp4',
    )
    expect(resolveLocalMediaSrc('asset://fixture.mov')).toBe(
      'asset://fixture.mov',
    )
    expect(mockConvertFileSrc).not.toHaveBeenCalled()
  })

  it('converts local file paths in tauri mode', () => {
    mockIsTauri.mockReturnValue(true)

    expect(resolveLocalMediaSrc('/Users/demo/fire-clip.mov')).toBe(
      'asset:///Users/demo/fire-clip.mov',
    )
    expect(mockConvertFileSrc).toHaveBeenCalledWith('/Users/demo/fire-clip.mov')
  })

  it('keeps local file paths unchanged in browser preview mode', () => {
    expect(resolveLocalMediaSrc('/Users/demo/fire-clip.mov')).toBe(
      '/Users/demo/fire-clip.mov',
    )
    expect(mockConvertFileSrc).not.toHaveBeenCalled()
  })
})
