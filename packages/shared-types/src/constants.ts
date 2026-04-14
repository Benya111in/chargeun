export const captureEvents = {
  sessionStarted: 'capture/session-started',
  frame: 'capture/frame',
  audio: 'capture/audio',
  sessionStopped: 'capture/session-stopped',
  packetReady: 'perception/packet-ready',
  segmentCreated: 'segment/created',
  explanationReady: 'segment/explanation-ready',
  voiceReply: 'voice/reply',
  systemError: 'error/system',
} as const

export const voiceIntentLabels = {
  repeat: '다시 말해줘',
  easy: '더 쉽게 말해줘',
  why: '왜 그래?',
  action: '지금 뭐 해야 해?',
  report: '119에 뭐라고 말해?',
} as const
