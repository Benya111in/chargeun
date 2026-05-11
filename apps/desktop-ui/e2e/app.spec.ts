import { expect, test } from '@playwright/test'

test('renders the web live landing with beta gating', async ({ page }) => {
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

  await page.goto('/')

  await expect(page.getByText('안심트랙 Live')).toBeVisible()
  await expect(
    page.getByRole('heading', {
      name: '화면을 공유하면 위험한 장면을 4초 늦게 다시 설명합니다.',
    }),
  ).toBeVisible()
  await expect(page.getByText('내부 QA')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: '화면 공유 시작' }),
  ).toBeDisabled()

  await page.getByPlaceholder('코드 입력').fill('judge-demo')
  await page.getByRole('button', { name: '저장' }).click()

  await expect(page.getByText('베타 코드 연결됨')).toBeVisible()
  await expect(
    page.getByRole('button', { name: '화면 공유 시작' }),
  ).toBeEnabled()
  await expect(
    page.getByRole('link', { name: '샘플로 먼저 보기' }),
  ).toHaveAttribute('href', '/demo')
})

test('runs the API-free demo route', async ({ page }) => {
  await page.goto('/demo')

  await expect(page.getByRole('button', { name: '시작하기' })).toBeVisible()
  await page.getByRole('button', { name: '시작하기' }).click()

  await expect(page.getByText('문을 닫고 밖으로 나가요.')).toBeVisible()
  await expect(
    page.getByRole('button', { name: '화재가 났을 때' }),
  ).toBeVisible()
})

test('keeps the operator workspace on /qa only', async ({ page }) => {
  await page.goto('/qa')

  await expect(
    page.getByText('4초 Shadow Player로 행동 판단을 붙잡아 줍니다.'),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '현재 모니터 읽기 시작' }),
  ).toBeVisible()
})

test('connects mocked screen share frames to grounded live explanation', async ({
  page,
}) => {
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
  await page.route('**/api/analyze-frame-window', async (route) => {
    const body = route.request().postDataJSON() as {
      sessionId: string
      tEndMs: number
      tStartMs: number
    }

    await route.fulfill({
      contentType: 'application/json',
      json: {
        packet: {
          asrText: '연기가 보이면 비상구 표지를 따라 계단으로 이동하세요.',
          keyframes: ['web-frame://e2e/1/0'],
          objectHints: [
            {
              bbox: [0.12, 0.16, 0.24, 0.2],
              conf: 0.86,
              label: '비상구',
            },
            {
              bbox: [0.34, 0.4, 0.28, 0.24],
              conf: 0.84,
              label: '연기',
            },
          ],
          ocrTokens: ['화재', '연기', '비상구', '계단', '대피'],
          sessionId: body.sessionId,
          tEndMs: body.tEndMs,
          tStartMs: body.tStartMs,
          uiElements: [],
        },
        source: 'e2e-mock',
      },
    })
  })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getDisplayMedia: async () => {
          const canvas = document.createElement('canvas')
          canvas.width = 640
          canvas.height = 360
          const context = canvas.getContext('2d')!
          let frame = 0

          const drawFrame = () => {
            frame += 1
            context.fillStyle = frame % 2 === 0 ? '#1f2937' : '#111827'
            context.fillRect(0, 0, canvas.width, canvas.height)
            context.fillStyle = '#f8fafc'
            context.font = '32px sans-serif'
            context.fillText('화재 연기 비상구 계단', 48, 96)
            context.fillStyle = '#f97316'
            context.fillRect(44, 132, 180, 88)
          }

          drawFrame()
          window.setInterval(drawFrame, 250)
          return canvas.captureStream(30)
        },
      },
    })
  })

  await page.goto('/')
  await page.getByPlaceholder('코드 입력').fill('judge-demo')
  await page.getByRole('button', { name: '저장' }).click()
  await page.getByRole('button', { name: '화면 공유 시작' }).click()

  await expect(page.getByText('현재 장면의 근거를 읽었습니다.')).toBeVisible({
    timeout: 12_000,
  })
  await expect(page.getByText('비상구', { exact: true })).toBeVisible()
  await expect(page.getByText('라이브 세그먼트')).toBeVisible()
})
