import { describe, expect, it } from 'vitest'

import {
  classifyVoiceIntentFromText,
  pickPreferredVoice,
} from './voice-runtime'

describe('pickPreferredVoice', () => {
  it('prefers a Korean voice when one is available', () => {
    const voices = [
      { default: false, lang: 'en-US', name: 'English' },
      { default: false, lang: 'ko-KR', name: 'Korean' },
    ] as SpeechSynthesisVoice[]

    expect(pickPreferredVoice(voices)?.name).toBe('Korean')
  })

  it('falls back to the default voice when Korean is unavailable', () => {
    const voices = [
      { default: false, lang: 'en-GB', name: 'English UK' },
      { default: true, lang: 'en-US', name: 'English US' },
    ] as SpeechSynthesisVoice[]

    expect(pickPreferredVoice(voices)?.name).toBe('English US')
  })

  it('classifies a supported Korean intent transcript', () => {
    expect(classifyVoiceIntentFromText('지금 뭐 해야 해?')).toBe('action')
    expect(classifyVoiceIntentFromText('신고 뭐라고 해')).toBe('report')
  })
})
