export type ShadowFrame = {
  id: string
  tsMs: number
  durationMs: number
}

export type ShadowMarker = {
  id: string
  tsMs: number
  label: string
  autoPause?: boolean
}

export type ShadowBufferConfig = {
  delayMs: number
  capacityMs: number
}

export type ShadowSnapshot = {
  liveEdgeMs: number
  bufferStartMs: number
  delayedCursorMs: number
  isUnderrun: boolean
}

export class ShadowBuffer {
  readonly #config: ShadowBufferConfig
  readonly #frames: ShadowFrame[] = []
  readonly #markers: ShadowMarker[] = []

  constructor(config: ShadowBufferConfig) {
    this.#config = config
  }

  appendFrame(frame: ShadowFrame) {
    this.#frames.push(frame)
    this.#pruneFrames()
  }

  setMarkers(markers: ShadowMarker[]) {
    this.#markers.splice(
      0,
      this.#markers.length,
      ...markers
        .slice()
        .sort((a: ShadowMarker, b: ShadowMarker) => a.tsMs - b.tsMs),
    )
  }

  getFrames() {
    return [...this.#frames]
  }

  getMarkers() {
    return [...this.#markers]
  }

  getLiveEdgeMs() {
    return this.#frames.at(-1)?.tsMs ?? 0
  }

  getBufferStartMs() {
    return this.#frames[0]?.tsMs ?? 0
  }

  getDelayedCursorMs() {
    const liveEdgeMs = this.getLiveEdgeMs()
    return Math.max(this.getBufferStartMs(), liveEdgeMs - this.#config.delayMs)
  }

  getSnapshot(): ShadowSnapshot {
    const liveEdgeMs = this.getLiveEdgeMs()
    const bufferStartMs = this.getBufferStartMs()
    const delayedCursorMs = this.getDelayedCursorMs()

    return {
      liveEdgeMs,
      bufferStartMs,
      delayedCursorMs,
      isUnderrun: liveEdgeMs - bufferStartMs < this.#config.delayMs,
    }
  }

  seekBack(cursorMs: number, amountMs: number) {
    return Math.max(this.getBufferStartMs(), cursorMs - amountMs)
  }

  clampToBufferedRange(cursorMs: number) {
    return Math.min(
      this.getLiveEdgeMs(),
      Math.max(this.getBufferStartMs(), cursorMs),
    )
  }

  getMarkerCrossing(previousMs: number, nextMs: number) {
    return this.#markers.find(
      (marker) => marker.tsMs > previousMs && marker.tsMs <= nextMs,
    )
  }

  replaySegment(markerId: string) {
    return (
      this.#markers.find((marker) => marker.id === markerId)?.tsMs ??
      this.getDelayedCursorMs()
    )
  }

  #pruneFrames() {
    const liveEdgeMs = this.getLiveEdgeMs()
    const minTs = liveEdgeMs - this.#config.capacityMs

    while (this.#frames.length > 0 && this.#frames[0].tsMs < minTs) {
      this.#frames.shift()
    }
  }
}
