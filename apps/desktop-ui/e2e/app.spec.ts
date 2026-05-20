import { expect, test, type Page } from '@playwright/test'

test('renders the learning home and opens a scenario', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByText('안심트랙 연습')).toBeVisible()
  await expect(
    page.getByRole('heading', {
      name: '재난 영상을 짧게 멈춰 보고, 쉬운말과 카드로 연습해요.',
    }),
  ).toBeVisible()
  await expect(
    page.getByText(
      '이 앱은 연습용입니다. 실제 위험하면 119·112·주변 어른·현장 안내를 먼저 따르세요.',
    ),
  ).toBeVisible()
  await expect(page.getByText('화면 공유 시작')).toHaveCount(0)
  await expect(page.getByText('화면공유 AI 분석')).toHaveCount(0)

  await page.getByRole('link', { name: /화재가 났을 때/ }).click()
  await expect(page).toHaveURL(/\/scenario\/fire-grounded-flow$/)
  await expect(
    page.getByRole('button', { name: '영상 시작하기' }),
  ).toBeVisible()
})

test('runs the scenario practice loop', async ({ page }) => {
  await page.goto('/scenario/fire-grounded-flow')

  await page.getByRole('button', { name: '영상 시작하기' }).click()
  await expect(page.getByText('지금 할 일')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('지금 할 일')).toBeVisible()
  await expect(
    page.getByRole('listitem').filter({ hasText: '문을 닫아요' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '다음 장면 보기' }),
  ).toBeDisabled()

  await page.getByRole('button', { name: '엘리베이터' }).click()
  await expect(
    page.getByText('괜찮아요. 엘리베이터보다 계단과 출구를 찾아요.'),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '다음 장면 보기' }),
  ).toBeDisabled()

  await page.getByRole('button', { name: '문을 닫고 나가요' }).click()
  await expect(
    page.getByText('맞아요. 나갈 때 문을 닫으면 연기가 천천히 퍼져요.'),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '다음 장면 보기' }),
  ).toBeEnabled()
  await expect(page.getByRole('button', { name: '엘리베이터' })).toBeDisabled()

  await page.getByRole('button', { name: '왜요?' }).click()
  await expect(page.getByRole('button', { name: '이유 닫기' })).toBeVisible()
  await expect(page.getByText('이유', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '쉬기' }).click()
  await expect(page.getByText('잠깐 쉬어도 괜찮아요.')).toBeVisible()
})

test('keeps /demo as the fire scenario compatibility route', async ({
  page,
}) => {
  await page.goto('/demo')

  await expect(page.getByText('화재가 났을 때').first()).toBeVisible()
  await expect(
    page.getByRole('button', { name: '영상 시작하기' }),
  ).toBeVisible()
})

test('renders the teacher guide with hidden tracks and official evidence', async ({
  page,
}) => {
  await page.goto('/teacher')

  await expect(page.getByText('선생님/보호자 진행')).toBeVisible()
  await expect(page.getByText('진행자 설명').first()).toBeVisible()
  await expect(page.getByText('오해 교정').first()).toBeVisible()
  await expect(page.getByText('공식 근거').first()).toBeVisible()
  await expect(page.getByText('구조적 멀티트랙').first()).toBeVisible()
  await expect(page.getByText('억제 후보').first()).toBeVisible()
  await expect(
    page.getByText('KR_FIRE_04 · 국민재난안전포털 - 화재 발생시 행동요령'),
  ).toBeVisible()
})

test('keeps live screen-share analysis isolated under /live-lab', async ({
  page,
}) => {
  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        betaAccessConfigured: true,
        hasOpenAiKey: false,
        maxFramesPerAnalysis: 3,
        maxSessionMinutes: 10,
        models: {
          analysis: 'gpt-5.4-mini',
          transcription: 'gpt-4o-mini-transcribe',
        },
        rateLimit: {
          analyzePerMinute: 18,
          transcribePerMinute: 10,
        },
        status: 'missing-openai-key',
        version: 'e2e',
      },
    })
  })

  await page.goto('/live-lab')

  await expect(page.getByText('안심트랙 Live Lab')).toBeVisible()
  await expect(page.getByLabel('베타 접근 코드')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: '화면공유 AI 분석을 테스트합니다.' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '화면 공유 시작' }),
  ).toBeDisabled()
})

test('runs live-lab screen share with a synthetic browser stream', async ({
  page,
}) => {
  await installSyntheticScreenShare(page)
  await mockLiveLabApis(page)

  await page.goto('/live-lab')

  await expect(page.getByText('분석 서버 준비됨 · gpt-5.4-mini')).toBeVisible()
  await page.getByLabel('베타 접근 코드').fill('live')
  await page.getByRole('button', { name: '확인' }).click()
  await expect(page.getByText('베타 코드가 확인되었습니다.')).toBeVisible()

  await page.getByRole('button', { name: '화면 공유 시작' }).click()
  await expect(page.getByText(/화면 공유가 시작되었습니다/)).toBeVisible()
  await expect(page.getByAltText('Shadow replay frame')).toBeVisible({
    timeout: 8_000,
  })
  await expect(page.getByText('Shadow Replay')).toBeVisible()
  await expect(page.getByText('현재 장면의 근거를 읽었습니다.')).toBeVisible({
    timeout: 14_000,
  })
  await expect(
    page.getByText('화재 대응 판단을 읽는 라이브 장면'),
  ).toBeVisible()
})

test('gates the operator workspace on direct /qa access', async ({ page }) => {
  await page.goto('/qa')

  await expect(
    page.getByRole('heading', { name: 'QA 화면은 공개되어 있지 않습니다.' }),
  ).toBeVisible()
})

test('keeps the operator workspace behind the internal QA flag', async ({
  page,
}) => {
  await page.goto('/qa?internal=qa')

  await expect(
    page.getByText('4초 Shadow Player로 행동 판단을 붙잡아 줍니다.'),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '현재 모니터 읽기 시작' }),
  ).toBeVisible()
  await expect(page.getByText('LRS 초안').first()).toBeVisible()
})

test('renders a clear not-found state for unknown routes', async ({ page }) => {
  await page.goto('/does-not-exist')

  await expect(
    page.getByRole('heading', { name: '연습 화면을 찾지 못했어요.' }),
  ).toBeVisible()
})

async function installSyntheticScreenShare(page: Page) {
  await page.addInitScript(() => {
    const makeStream = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 960
      canvas.height = 540
      const context = canvas.getContext('2d')
      let frame = 0

      const paint = () => {
        if (!context) {
          return
        }

        frame += 1
        context.fillStyle = frame % 2 === 0 ? '#201217' : '#111827'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.fillStyle = '#e11d48'
        context.fillRect(94, 120, 280, 220)
        context.fillStyle = '#f8fafc'
        context.font = '52px sans-serif'
        context.fillText('화재 대피 연습', 430, 190)
        context.font = '34px sans-serif'
        context.fillText('출입문을 닫고 계단으로 나가요', 430, 260)
      }

      paint()
      const intervalId = window.setInterval(paint, 250)
      const stream = canvas.captureStream(4)
      const [videoTrack] = stream.getVideoTracks()

      try {
        Object.defineProperty(videoTrack, 'label', {
          configurable: true,
          value: '합성 화면공유',
        })
      } catch {
        // Browser implementations differ on whether MediaStreamTrack.label is configurable.
      }

      videoTrack.addEventListener(
        'ended',
        () => window.clearInterval(intervalId),
        { once: true },
      )

      return stream
    }

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        ...(navigator.mediaDevices ?? {}),
        getDisplayMedia: async () => makeStream(),
      },
    })
  })
}

async function mockLiveLabApis(page: Page) {
  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        betaAccessConfigured: true,
        hasOpenAiKey: true,
        maxFramesPerAnalysis: 3,
        maxSessionMinutes: 10,
        models: {
          analysis: 'gpt-5.4-mini',
          transcription: 'gpt-4o-mini-transcribe',
        },
        rateLimit: {
          analyzePerMinute: 18,
          transcribePerMinute: 10,
        },
        status: 'ready',
        version: 'e2e',
      },
    })
  })
  await page.route('**/api/verify-beta-code', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: { ok: true },
    })
  })
  await page.route('**/api/analyze-frame-window', async (route) => {
    const body = route.request().postDataJSON() as {
      frames?: Array<{ imageRef: string; tsMs: number }>
      sessionId?: string
      tEndMs?: number
      tStartMs?: number
    }

    await route.fulfill({
      contentType: 'application/json',
      json: {
        packet: {
          asrText: '',
          keyframes: (body.frames ?? []).map((frame) => frame.imageRef),
          objectHints: [
            { bbox: [0.1, 0.18, 0.28, 0.38], conf: 0.86, label: '연기' },
            { bbox: [0.58, 0.36, 0.18, 0.24], conf: 0.8, label: '출입문' },
          ],
          ocrTokens: ['화재', '출입문'],
          sessionId: body.sessionId ?? 'synthetic-session',
          tEndMs: body.tEndMs ?? 4_000,
          tStartMs: body.tStartMs ?? 0,
          uiElements: [],
        },
        source: 'mock-openai',
      },
    })
  })
  await page.route('**/api/transcribe-audio', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        durationMs: 0,
        source: 'no-audio',
        transcript: '',
      },
    })
  })
  await page.route('**/api/client-event', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: { ok: true },
    })
  })
}
