import { ShieldCheck, Trash2 } from 'lucide-react'

import { cn } from '../lib/utils'

export function PrivacyControlPanel({
  cacheBusy,
  cacheNotice,
  captureConsent,
  clearOnStop,
  onClearCache,
  onOpenConsent,
  onToggleClearOnStop,
  onToggleRetainCapturedMedia,
  retainCapturedMedia,
}: {
  cacheBusy: boolean
  cacheNotice: string
  captureConsent: boolean
  clearOnStop: boolean
  onClearCache: () => void | Promise<void>
  onOpenConsent: () => void
  onToggleClearOnStop: (next: boolean) => void
  onToggleRetainCapturedMedia: (next: boolean) => void
  retainCapturedMedia: boolean
}) {
  return (
    <section className="mt-4 grid gap-4 border-t border-[var(--line)] pt-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            Privacy & Safety
          </p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight">
            캡처 동의와 로컬 처리 상태
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            화면 캡처는 사용자의 동의가 있어야 시작됩니다. 기본 모드는 로컬 처리
            우선이며, 장기 저장은 opt-in으로만 켭니다.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <InlinePill tone="grounded">로컬 처리 우선</InlinePill>
          <InlinePill tone={captureConsent ? 'grounded' : 'review'}>
            {captureConsent ? '캡처 동의 확인됨' : '캡처 동의 필요'}
          </InlinePill>
          <InlinePill tone={retainCapturedMedia ? 'review' : 'grounded'}>
            {retainCapturedMedia ? '장기 저장 opt-in 켜짐' : '장기 저장 꺼짐'}
          </InlinePill>
          <InlinePill tone={clearOnStop ? 'grounded' : 'neutral'}>
            {clearOnStop ? '종료 시 캐시 자동 삭제' : '종료 후 수동 정리'}
          </InlinePill>
        </div>

        <div className="grid gap-3 text-sm text-[var(--muted)]">
          <PreferenceRow
            checked={retainCapturedMedia}
            description="원본 장기 저장은 기본값이 아닙니다. 켜면 종료 후 자동 삭제는 꺼집니다."
            label="원본/세션 캐시를 남겨 두기"
            onChange={onToggleRetainCapturedMedia}
          />
          <PreferenceRow
            checked={clearOnStop}
            description="캡처가 끝나면 로컬 cache/log/export를 바로 정리합니다."
            label="종료 시 캐시 자동 삭제"
            onChange={onToggleClearOnStop}
          />
        </div>
      </div>

      <div className="grid gap-3">
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md border border-[var(--ink)] bg-[var(--ink)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-92"
          onClick={onOpenConsent}
          type="button"
        >
          <ShieldCheck className="size-4" />
          {captureConsent ? '동의 안내 다시 보기' : '캡처 동의 열기'}
        </button>
        <button
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition',
            cacheBusy
              ? 'cursor-not-allowed border-[var(--line)] bg-[var(--soft)] text-[var(--muted)]'
              : 'border-[var(--line)] bg-white text-[var(--ink)] hover:border-[var(--ink)]/40',
          )}
          disabled={cacheBusy}
          onClick={onClearCache}
          type="button"
        >
          <Trash2 className="size-4" />
          {cacheBusy ? '캐시 정리 중' : '캐시 지우기'}
        </button>
        <div className="rounded-md bg-[var(--soft)] px-3 py-3 text-sm leading-6 text-[var(--muted)]">
          {cacheNotice}
        </div>
      </div>
    </section>
  )
}

export function PrivacyConsentDialog({
  clearOnStop,
  onClose,
  onConfirm,
  open,
  pendingActionLabel,
  retainCapturedMedia,
}: {
  clearOnStop: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  open: boolean
  pendingActionLabel: string
  retainCapturedMedia: boolean
}) {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-md bg-white p-5 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
          Capture Consent
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink)]">
          캡처 동의와 프라이버시 확인
        </h2>
        <div className="mt-4 grid gap-3 text-sm leading-6 text-[var(--muted)]">
          <p>이 앱의 행동 설명은 공식 재난행동요령에 근거해 재구성됩니다.</p>
          <p>확신이 낮을 때는 공식 원문 확인을 우선 안내합니다.</p>
          <p>화면 캡처는 사용자의 동의가 있어야 시작됩니다.</p>
        </div>

        <div className="mt-4 grid gap-2 rounded-md bg-[var(--soft)] px-4 py-4 text-sm text-[var(--muted)]">
          <ModalMeta label="처리 경로">로컬 우선</ModalMeta>
          <ModalMeta label="장기 저장">
            {retainCapturedMedia ? '사용자 opt-in 켜짐' : '기본값: 꺼짐'}
          </ModalMeta>
          <ModalMeta label="종료 후 정리">
            {clearOnStop ? '자동 삭제' : '수동 정리'}
          </ModalMeta>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            className="rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium text-[var(--ink)] transition hover:border-[var(--ink)]/40"
            onClick={onClose}
            type="button"
          >
            나중에
          </button>
          <button
            className="rounded-md border border-rose-700 bg-rose-700 px-3 py-2 text-sm font-medium text-white transition hover:border-rose-800 hover:bg-rose-800"
            onClick={onConfirm}
            type="button"
          >
            {pendingActionLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function PreferenceRow({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean
  description: string
  label: string
  onChange: (next: boolean) => void
}) {
  return (
    <label className="grid gap-1">
      <span className="inline-flex items-center gap-3 text-[var(--ink)]">
        <input
          checked={checked}
          className="size-4 rounded border-[var(--line)]"
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        <span className="font-medium">{label}</span>
      </span>
      <span className="pl-7 text-sm leading-6 text-[var(--muted)]">
        {description}
      </span>
    </label>
  )
}

function InlinePill({
  children,
  tone,
}: {
  children: React.ReactNode
  tone: 'grounded' | 'neutral' | 'review'
}) {
  const toneClass = {
    grounded: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    neutral: 'bg-white text-[var(--ink)] ring-[var(--line)]',
    review: 'bg-amber-50 text-amber-900 ring-amber-200',
  }[tone]

  return (
    <span
      className={cn(
        'inline-flex rounded-md px-3 py-1 text-sm font-medium ring-1',
        toneClass,
      )}
    >
      {children}
    </span>
  )
}

function ModalMeta({
  children,
  label,
}: {
  children: React.ReactNode
  label: string
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[88px_1fr]">
      <span className="font-semibold text-[var(--ink)]">{label}</span>
      <span>{children}</span>
    </div>
  )
}
