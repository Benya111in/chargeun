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
      '이 앱은 연습용입니다. 실제로 위험할 때는 119·112, 주변 어른, 현장 안내를 먼저 따르세요.',
    ),
  ).toBeVisible()
  await expect(page.getByText('화면 공유 시작')).toHaveCount(0)
  await expect(page.getByText('화면공유 AI 분석')).toHaveCount(0)
  await expect(page.getByRole('link', { name: /화재가 났을 때/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /지진이 났을 때/ })).toBeVisible()
  await expect(
    page.getByRole('link', { name: /소리가 없어도 볼 수 있어요/ }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('link', { name: /흔들림이 멈춘 뒤/ }),
  ).toHaveCount(0)

  await page.getByRole('link', { name: /화재가 났을 때/ }).click()
  await expect(page).toHaveURL(/\/scenario\/fire-grounded-flow$/)
  await expect(
    page.getByRole('button', { name: '영상 시작하기' }),
  ).toBeVisible()
})

test('runs the scenario practice loop', async ({ page }) => {
  await page.goto('/scenario/fire-grounded-flow')

  await page.getByRole('button', { name: '영상 시작하기' }).click()
  await page.locator('video').evaluate((video) => {
    video.dispatchEvent(new Event('ended', { bubbles: true }))
  })
  await expect(page.getByText('지금 할 일')).toBeVisible()
  await expect(
    page.getByRole('listitem').filter({ hasText: '문을 닫아요' }),
  ).toBeVisible()
  await expect(page.getByText('문을 닫고 계단으로 가요.')).toBeVisible()
  await expect(
    page.getByRole('button', { name: '다음 장면 보기' }),
  ).toBeDisabled()

  await page.getByRole('button', { name: '열린 문' }).click()
  await expect(page.getByText('괜찮아요. 닫힌 문을 다시 봐요.')).toBeVisible()
  await expect(
    page.getByRole('button', { name: '다음 장면 보기' }),
  ).toBeDisabled()

  await page.getByRole('button', { name: '닫힌 문' }).click()
  await expect(
    page.getByText('맞아요. 문을 닫으면 연기가 덜 퍼져요.'),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '다음 장면 보기' }),
  ).toBeEnabled()
  await expect(page.getByRole('button', { name: '열린 문' })).toBeDisabled()

  await page.getByRole('button', { name: '이유 보기' }).click()
  await expect(page.getByRole('button', { name: '이유 닫기' })).toBeVisible()
  await expect(page.getByText('이유', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '다음 장면 보기' }).click()
  await expect(page.getByText('2 / 2')).toBeVisible()
  await page.locator('video').evaluate((video) => {
    video.dispatchEvent(new Event('ended', { bubbles: true }))
  })
  await expect(
    page.getByText('길이 막히면 대피공간에서 도움을 불러요.'),
  ).toBeVisible()
  await expect(page.getByText('잊지 말아요')).toBeVisible()
  await expect(page.getByText('연기가 있으면 몸을 낮춰요.')).toBeVisible()
  await expect(page.getByText('헷갈릴 수 있어요')).toHaveCount(0)
  await expect(
    page.getByText('보일 수 있어요. 하지만 지금은 고르지 않아요.'),
  ).toHaveCount(0)
  await expect(page.getByText('2개 보관')).toHaveCount(0)

  await page.getByRole('button', { name: '쉬기' }).click()
  await expect(page.getByText('잠깐 쉬어도 괜찮아요.')).toBeVisible()
})

test('offers next practice and restart controls after the final scene', async ({
  page,
}) => {
  await page.goto('/scenario/fire-grounded-flow')

  await page.getByRole('button', { name: '2번째 장면' }).click()
  await expect(page.getByText('2 / 2')).toBeVisible()
  await page.locator('video').evaluate((video) => {
    video.dispatchEvent(new Event('ended', { bubbles: true }))
  })

  await expect(
    page.getByText('길이 막히면 대피공간에서 도움을 불러요.'),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '다음 장면 보기' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: '맞는 답을 고르면 다음 연습으로 가요' }),
  ).toBeDisabled()

  await page.getByRole('button', { name: '대피공간' }).click()
  await expect(
    page.getByRole('link', { name: '다음 연습으로 가기' }),
  ).toHaveAttribute('href', '/scenario/earthquake-protect-flow')
  await expect(
    page.getByRole('link', {
      name: '다음 연습 지진이 났을 때: 흔들릴 때 1단계: 흔들릴 때 책상 아래에서 머리를 보호해요',
    }),
  ).toBeVisible()

  await page.getByRole('button', { name: '처음부터 다시 보기' }).click()
  await expect(page.getByText('1 / 2')).toBeVisible()
  await expect
    .poll(async () =>
      page.locator('video').evaluate((video) => video.currentTime),
    )
    .toBeLessThan(1)
})

test('continues earthquake practice from shaking to after-shaking sequence', async ({
  page,
}) => {
  await page.goto('/scenario/earthquake-protect-flow')

  await page.getByRole('button', { name: '2번째 장면' }).click()
  await expect(page.getByText('2 / 2')).toBeVisible()
  await page.locator('video').evaluate((video) => {
    video.dispatchEvent(new Event('ended', { bubbles: true }))
  })

  await expect(page.getByText('교실에서도 책상 아래로 들어가요.')).toBeVisible()
  await page.getByRole('button', { name: '책상 아래' }).click()
  await expect(
    page.getByRole('link', { name: '다음 연습으로 가기' }),
  ).toHaveAttribute('href', '/scenario/earthquake-after-flow')
  await expect(
    page.getByRole('link', {
      name: '다음 연습 지진이 났을 때: 멈춘 뒤 2단계: 흔들림이 멈춘 뒤 어른과 함께 확인해요',
    }),
  ).toBeVisible()
})

test('ends the final earthquake after-shaking practice without looping', async ({
  page,
}) => {
  await page.goto('/scenario/earthquake-after-flow')

  await page.getByRole('button', { name: '3번째 장면' }).click()
  await expect(page.getByText('3 / 3')).toBeVisible()
  await page.locator('video').evaluate((video) => {
    video.dispatchEvent(new Event('ended', { bubbles: true }))
  })

  await expect(page.getByText('전기 이상은 어른에게 말해요.')).toBeVisible()
  await expect(
    page.getByRole('button', { name: '맞는 답을 고르면 마칠 수 있어요' }),
  ).toBeDisabled()

  await page.getByRole('button', { name: '어른에게 말하기' }).click()
  await expect(
    page.getByRole('link', { name: '오늘 연습 끝내기' }),
  ).toHaveAttribute('href', '/')
  await expect(page.getByText('연습 완료')).toBeVisible()
  await expect(page.getByText('화재가 났을 때')).toHaveCount(0)
})

test('keeps earthquake review scenario route as a compatibility alias', async ({
  page,
}) => {
  await page.goto('/scenario/earthquake-review-flow')

  await expect(
    page.getByText('지진이 났을 때: 흔들릴 때').first(),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '영상 시작하기' }),
  ).toBeVisible()
  await expect(
    page.getByText(
      '이 앱은 연습용입니다. 실제로 위험할 때는 119·112, 주변 어른, 현장 안내를 먼저 따르세요.',
    ),
  ).toBeVisible()
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

test('rejects empty live-lab screen share streams', async ({ page }) => {
  const clientEvents: Array<{ eventType?: string; route?: string }> = []

  await installEmptyScreenShare(page)
  await mockLiveLabApis(page, clientEvents)

  await page.goto('/live-lab')
  await page.getByLabel('베타 접근 코드').fill('live')
  await page.getByRole('button', { name: '확인' }).click()
  await expect(page.getByText('베타 코드가 확인되었습니다.')).toBeVisible()

  await page.getByRole('button', { name: '화면 공유 시작' }).click()

  await expect(
    page.getByText(
      '공유된 화면 영상을 찾지 못했습니다. 화면이나 탭을 다시 선택해 주세요.',
    ),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '화면 공유 시작' }),
  ).toBeEnabled()
  await expect(
    page.getByRole('button', { name: '화면 공유 중지' }),
  ).toBeDisabled()
  expect(clientEvents).toContainEqual(
    expect.objectContaining({
      eventType: 'screen-share-start-failed',
      route: '/live-lab',
    }),
  )
})

test('disables live-lab start when browser screen share is unsupported', async ({
  page,
}) => {
  await installUnsupportedScreenShare(page)
  await mockLiveLabApis(page)

  await page.goto('/live-lab')
  await page.getByLabel('베타 접근 코드').fill('live')
  await page.getByRole('button', { name: '확인' }).click()

  await expect(
    page.getByText(
      '이 브라우저에서는 화면 공유를 사용할 수 없습니다. 데스크톱 Chrome에서 열어 주세요.',
    ),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '화면 공유 시작' }),
  ).toBeDisabled()
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

async function installEmptyScreenShare(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        ...(navigator.mediaDevices ?? {}),
        getDisplayMedia: async () => new MediaStream(),
      },
    })
  })
}

async function installUnsupportedScreenShare(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {},
    })
  })
}

async function mockLiveLabApis(
  page: Page,
  clientEvents: Array<{ eventType?: string; route?: string }> = [],
) {
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
    clientEvents.push(route.request().postDataJSON() as { route?: string })
    await route.fulfill({
      contentType: 'application/json',
      json: { ok: true },
    })
  })
}
