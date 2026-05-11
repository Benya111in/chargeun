import { expect, test } from '@playwright/test'

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
  await expect(page.getByText('KR_FIRE_04')).toBeVisible()
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
})

test('renders a clear not-found state for unknown routes', async ({ page }) => {
  await page.goto('/does-not-exist')

  await expect(
    page.getByRole('heading', { name: '연습 화면을 찾지 못했어요.' }),
  ).toBeVisible()
})
