import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readdir, unlink } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from '@playwright/test'

const __dirname = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(__dirname, '..')
const outputDir = resolve(appRoot, 'public/cardnews')
const pagesDir = resolve(outputDir, 'pages')
const pdfPath = resolve(outputDir, 'ansimtrack-ai-helper-cardnews.pdf')
const execFileAsync = promisify(execFile)

const cards = [
  {
    eyebrow: '느린학습자를 위한 재난안전 연습',
    title: '차근차근 AI 도우미',
    body: [
      '재난 영상을 혼자 빨리 따라가지 않아도 되게 도와요.',
      '영상이 잠깐 멈추고, 쉬운 말과 카드로 다시 알려줘요.',
    ],
    note: '안심트랙 연습을 소개합니다.',
    visual: 'helper',
    theme: 'mint',
  },
  {
    eyebrow: '왜 필요할까요?',
    title: '재난 영상은 한 번에 너무 많이 말해요',
    body: [
      '말소리, 자막, 장면이 함께 지나가요.',
      '무엇을 먼저 해야 하는지 놓치기 쉬워요.',
    ],
    note: '느린학습자에게는 천천히 확인할 시간이 필요합니다.',
    visual: 'video',
    theme: 'sky',
  },
  {
    eyebrow: '느린학습자에게 필요한 도움',
    title: '그래서 한 장면씩 천천히 봐요',
    body: [
      '짧은 설명',
      '큰 글씨',
      '반복 보기',
      '눈에 보이는 행동 카드',
    ],
    note: '짧은 설명과 단계 안내는 이해를 도울 수 있습니다.',
    visual: 'cards',
    theme: 'yellow',
  },
  {
    eyebrow: '첫 번째 AI: 영상 전문',
    title: '영상 분석 AI가 장면 설명을 만들어요',
    body: [
      '이 AI는 영상의 흐름을 보는 전문가입니다.',
      '장면을 나누고, 각 장면에 필요한 설명을 먼저 씁니다.',
    ],
    note: '긴 영상을 작은 학습 장면으로 나누면 무엇을 볼지 더 분명해집니다.',
    visual: 'split',
    theme: 'mint',
  },
  {
    eyebrow: '두 번째 AI: 재난안전 전문',
    title: '재난안전 AI가 내용을 검사해요',
    body: [
      '이 AI는 공식 재난 행동요령을 기준으로 설명을 봅니다.',
      '위험하거나 애매한 말은 학습자에게 보여주지 않아요.',
    ],
    note: '참고 출처',
    sources: [
      '국민재난안전포털 행동요령',
      '행정안전부 안전한TV',
      '한국장애인개발원 장애인 재난안전 가이드',
    ],
    visual: 'shield',
    theme: 'coral',
  },
  {
    eyebrow: '세 번째 AI: 느린학습자 연구',
    title: '느린학습자 연구 AI가 쉬운 말로 바꿔요',
    body: [
      '이 AI는 느린학습자 연구를 참고한 전문가입니다.',
      '긴 문장은 짧게, 어려운 말은 쉬운 말로 바꿉니다.',
      '따라 읽고 행동을 떠올리기 좋게 다시 정리해요.',
    ],
    note: '참고 문헌',
    sources: [
      'W3C COGA: Making Content Usable',
      'Easy Read | Australian Style Manual',
      'Mayer: Multimedia Learning - Segmenting Principle',
      '경계선 지능·느린학습자 국내 문헌 검토',
    ],
    visual: 'speech',
    theme: 'lavender',
  },
  {
    eyebrow: '영상이 연습 자료로 바뀌어요',
    title: '영상 하나가 연습 자료가 돼요',
    body: [
      '원하는 재난안전 영상을 올리면 장면별 학습 자료로 변환됩니다.',
    ],
    note: '지금은 화재와 지진 예시로 먼저 보여드립니다.',
    noteLines: ['테스트 결과 새로운 영상도 10분 안에 학습 가능 형태로 만들어져요.'],
    visual: 'upload',
    theme: 'sky',
  },
  {
    eyebrow: '네 칸으로 나눠서 설명',
    title: '한 장면을 네 칸으로 나눠요',
    body: [
      '무슨 일이 생겼나요?',
      '무엇을 해야 하나요?',
      '왜 해야 하나요?',
      '무엇은 하지 말아야 하나요?',
    ],
    note: '섞어서 말하지 않고 나눠 보여주면 행동을 더 쉽게 따라갈 수 있습니다.',
    visual: 'tracks',
    theme: 'mint',
  },
  {
    eyebrow: '퀴즈는 시험이 아니에요',
    title: '눌러 보며 다시 기억해요',
    body: [
      '맞히는지 평가하려는 화면이 아닙니다.',
      '직접 눌러 보며 중요한 행동을 한 번 더 떠올립니다.',
    ],
    note: '정답이 가까이 보여도 괜찮습니다. 목적은 기억을 돕는 반복입니다.',
    visual: 'quiz',
    theme: 'yellow',
  },
  {
    eyebrow: '지금 들어 있는 기능',
    title: '지금 만든 화면에서 할 수 있는 것',
    body: [
      '영상이 장면마다 멈춰요',
      '쉬운 말로 다시 알려줘요',
      '하지 말아야 할 일도 보여줘요',
      '마지막에 한 번 더 복습해요',
    ],
    note: '화재 연습이 끝나면 지진 연습으로 이어집니다.',
    visual: 'flow',
    theme: 'sky',
  },
  {
    eyebrow: '가장 중요한 약속',
    title: '가장 중요한 약속',
    body: [
      '이 서비스는 실제 재난 때 쓰는 앱이 아닙니다.',
      '위험하면 119·112, 주변 어른, 현장 안내를 먼저 따릅니다.',
    ],
    note: '미리 연습해서 더 잘 기억하도록 돕는 도구입니다.',
    visual: 'safety',
    theme: 'coral',
  },
]

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function renderVisual(type) {
  const visuals = {
    helper: `
      <svg class="visual-svg" viewBox="0 0 360 250" role="img" aria-label="선생님과 학습자가 함께 영상 보는 그림">
        <rect x="32" y="34" width="296" height="174" rx="24" fill="#ffffff" stroke="#243329" stroke-width="8"/>
        <rect x="58" y="62" width="244" height="106" rx="16" fill="#c8eef8"/>
        <polygon points="162,88 162,142 210,115" fill="#ff7d6e"/>
        <circle cx="110" cy="210" r="38" fill="#ffd8a8"/>
        <circle cx="238" cy="210" r="42" fill="#ffd8a8"/>
        <path d="M76 210c15-39 55-38 69 0" fill="#3f7d58"/>
        <path d="M199 210c18-42 64-42 82 0" fill="#4e8dd7"/>
        <path d="M93 176c19-24 49-20 59 3" stroke="#3b2b24" stroke-width="12" stroke-linecap="round" fill="none"/>
        <path d="M218 172c24-22 58-16 67 10" stroke="#3b2b24" stroke-width="12" stroke-linecap="round" fill="none"/>
        <path d="M165 214c20 18 48 18 70 0" stroke="#ff9b73" stroke-width="10" stroke-linecap="round" fill="none"/>
      </svg>`,
    video: `
      <svg class="visual-svg" viewBox="0 0 360 250" role="img" aria-label="빠르게 지나가는 영상 그림">
        <rect x="38" y="42" width="284" height="166" rx="24" fill="#ffffff" stroke="#243329" stroke-width="8"/>
        <rect x="64" y="70" width="84" height="98" rx="16" fill="#9bd7ef"/>
        <rect x="158" y="70" width="74" height="98" rx="16" fill="#ffd16a"/>
        <rect x="242" y="70" width="54" height="98" rx="16" fill="#ff9b8c"/>
        <path d="M84 194h190" stroke="#243329" stroke-width="10" stroke-linecap="round"/>
        <path d="M282 194l-28-22m28 22l-28 22" stroke="#243329" stroke-width="10" stroke-linecap="round"/>
        <circle cx="88" cy="104" r="12" fill="#243329"/>
        <circle cx="184" cy="104" r="12" fill="#243329"/>
        <circle cx="266" cy="104" r="12" fill="#243329"/>
      </svg>`,
    cards: `
      <svg class="visual-svg" viewBox="0 0 360 250" role="img" aria-label="행동 카드 그림">
        <rect x="42" y="38" width="128" height="82" rx="18" fill="#e0f7e9" stroke="#20b486" stroke-width="6"/>
        <rect x="190" y="38" width="128" height="82" rx="18" fill="#fff1bf" stroke="#f5b544" stroke-width="6"/>
        <rect x="72" y="140" width="216" height="76" rx="18" fill="#e8f2ff" stroke="#73aef4" stroke-width="6"/>
        <path d="M78 80h56M224 80h58M124 178h112" stroke="#243329" stroke-width="10" stroke-linecap="round"/>
        <circle cx="106" cy="202" r="10" fill="#20b486"/>
        <circle cx="254" cy="202" r="10" fill="#ff7d6e"/>
      </svg>`,
    split: `
      <svg class="visual-svg" viewBox="0 0 360 250" role="img" aria-label="장면을 나누는 그림">
        <rect x="36" y="58" width="288" height="134" rx="22" fill="#ffffff" stroke="#243329" stroke-width="8"/>
        <line x1="132" y1="58" x2="132" y2="192" stroke="#243329" stroke-width="7"/>
        <line x1="228" y1="58" x2="228" y2="192" stroke="#243329" stroke-width="7"/>
        <rect x="58" y="84" width="50" height="60" rx="12" fill="#ff9b8c"/>
        <rect x="154" y="84" width="50" height="60" rx="12" fill="#ffd16a"/>
        <rect x="250" y="84" width="50" height="60" rx="12" fill="#9bd7ef"/>
        <path d="M91 214h178" stroke="#20b486" stroke-width="10" stroke-linecap="round"/>
      </svg>`,
    shield: `
      <svg class="visual-svg" viewBox="0 0 360 250" role="img" aria-label="안전 검사 방패 그림">
        <path d="M180 26l108 42v64c0 70-44 106-108 128C116 238 72 202 72 132V68l108-42z" fill="#e0f7e9" stroke="#243329" stroke-width="8"/>
        <path d="M128 132l36 36 76-84" fill="none" stroke="#20b486" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="54" y="178" width="92" height="42" rx="14" fill="#fff1bf" stroke="#f5b544" stroke-width="6"/>
        <rect x="214" y="178" width="92" height="42" rx="14" fill="#ffe3df" stroke="#ff7d6e" stroke-width="6"/>
      </svg>`,
    speech: `
      <svg class="visual-svg" viewBox="0 0 360 250" role="img" aria-label="쉬운 말로 바꾸는 말풍선 그림">
        <rect x="42" y="42" width="126" height="84" rx="24" fill="#ffe3df" stroke="#ff7d6e" stroke-width="6"/>
        <rect x="192" y="92" width="126" height="84" rx="24" fill="#e0f7e9" stroke="#20b486" stroke-width="6"/>
        <path d="M168 84h34" stroke="#243329" stroke-width="8" stroke-linecap="round"/>
        <path d="M194 70l22 14-22 14" stroke="#243329" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <path d="M72 78h62M72 102h44M222 128h64M222 152h42" stroke="#243329" stroke-width="8" stroke-linecap="round"/>
        <circle cx="92" cy="188" r="26" fill="#ffd8a8"/>
        <path d="M72 218c12-32 48-32 60 0" fill="#4e8dd7"/>
      </svg>`,
    upload: `
      <svg class="visual-svg" viewBox="0 0 360 250" role="img" aria-label="업로드와 변환 그림">
        <rect x="56" y="46" width="110" height="150" rx="20" fill="#ffffff" stroke="#243329" stroke-width="8"/>
        <rect x="194" y="46" width="110" height="150" rx="20" fill="#e0f7e9" stroke="#20b486" stroke-width="8"/>
        <path d="M94 142V82m0 0l-24 24m24-24l24 24" stroke="#4e8dd7" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M210 96h78M210 126h58M210 156h68" stroke="#243329" stroke-width="9" stroke-linecap="round"/>
        <path d="M166 120h38" stroke="#243329" stroke-width="8" stroke-linecap="round"/>
        <path d="M192 106l22 14-22 14" stroke="#243329" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </svg>`,
    tracks: `
      <svg class="visual-svg" viewBox="0 0 360 250" role="img" aria-label="네 가지 설명 트랙 그림">
        <rect x="44" y="34" width="122" height="78" rx="18" fill="#e8f2ff" stroke="#73aef4" stroke-width="6"/>
        <rect x="194" y="34" width="122" height="78" rx="18" fill="#e0f7e9" stroke="#20b486" stroke-width="6"/>
        <rect x="44" y="138" width="122" height="78" rx="18" fill="#fff1bf" stroke="#f5b544" stroke-width="6"/>
        <rect x="194" y="138" width="122" height="78" rx="18" fill="#ffe3df" stroke="#ff7d6e" stroke-width="6"/>
        <path d="M74 72h62M224 72h62M74 176h62M224 176h62" stroke="#243329" stroke-width="9" stroke-linecap="round"/>
      </svg>`,
    quiz: `
      <svg class="visual-svg" viewBox="0 0 360 250" role="img" aria-label="직접 눌러 보는 퀴즈 그림">
        <rect x="44" y="46" width="272" height="148" rx="24" fill="#ffffff" stroke="#243329" stroke-width="8"/>
        <rect x="72" y="84" width="92" height="64" rx="18" fill="#e0f7e9" stroke="#20b486" stroke-width="6"/>
        <rect x="196" y="84" width="92" height="64" rx="18" fill="#fff1bf" stroke="#f5b544" stroke-width="6"/>
        <path d="M94 116h48M218 116h48" stroke="#243329" stroke-width="8" stroke-linecap="round"/>
        <path d="M151 184l28 28 52-70" stroke="#20b486" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </svg>`,
    flow: `
      <svg class="visual-svg" viewBox="0 0 360 250" role="img" aria-label="연습 흐름 그림">
        <circle cx="76" cy="118" r="38" fill="#9bd7ef" stroke="#243329" stroke-width="7"/>
        <circle cx="180" cy="118" r="38" fill="#ffd16a" stroke="#243329" stroke-width="7"/>
        <circle cx="284" cy="118" r="38" fill="#e0f7e9" stroke="#243329" stroke-width="7"/>
        <path d="M114 118h28M218 118h28" stroke="#243329" stroke-width="8" stroke-linecap="round"/>
        <path d="M136 104l18 14-18 14M240 104l18 14-18 14" stroke="#243329" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <path d="M50 184h260" stroke="#ff7d6e" stroke-width="10" stroke-linecap="round"/>
      </svg>`,
    care: `
      <svg class="visual-svg" viewBox="0 0 360 250" role="img" aria-label="따뜻하게 함께 확인하는 그림">
        <circle cx="126" cy="104" r="40" fill="#ffd8a8"/>
        <circle cx="234" cy="104" r="40" fill="#ffd8a8"/>
        <path d="M82 206c18-62 70-72 102-20" fill="#9bd7ef"/>
        <path d="M184 186c32-52 84-42 102 20" fill="#e0f7e9"/>
        <path d="M104 72c22-26 60-22 72 8" stroke="#3b2b24" stroke-width="12" stroke-linecap="round" fill="none"/>
        <path d="M212 72c24-22 60-18 72 8" stroke="#3b2b24" stroke-width="12" stroke-linecap="round" fill="none"/>
        <path d="M154 156c26 22 52 22 78 0" stroke="#ff7d6e" stroke-width="12" stroke-linecap="round" fill="none"/>
        <path d="M178 42c8-18 30-18 38 0 8-18 30-18 38 0 0 30-38 48-38 48s-38-18-38-48z" fill="#ff9b8c"/>
      </svg>`,
    safety: `
      <svg class="visual-svg" viewBox="0 0 360 250" role="img" aria-label="안전 약속 그림">
        <rect x="58" y="38" width="244" height="170" rx="26" fill="#fff1bf" stroke="#243329" stroke-width="8"/>
        <path d="M100 94h160M100 130h132M100 166h96" stroke="#243329" stroke-width="10" stroke-linecap="round"/>
        <circle cx="278" cy="176" r="34" fill="#ff7d6e"/>
        <path d="M278 152v28" stroke="#fff" stroke-width="10" stroke-linecap="round"/>
        <circle cx="278" cy="194" r="5" fill="#fff"/>
      </svg>`,
  }

  return visuals[type] ?? visuals.helper
}

function renderCard(card, index) {
  const body =
    card.body.length > 3
      ? `<ul class="bullet-list">${card.body
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join('')}</ul>`
      : `<div class="body-lines">${card.body
          .map((item) => `<p>${escapeHtml(item)}</p>`)
          .join('')}</div>`
  const footer = card.sources?.length
    ? `<footer>
        <p>${escapeHtml(card.note)}</p>
        <ul>${card.sources.map((source) => `<li>${escapeHtml(source)}</li>`).join('')}</ul>
      </footer>`
    : `<footer>
        <p>${escapeHtml(card.note)}</p>
        ${card.noteLines?.map((line) => `<p>${escapeHtml(line)}</p>`).join('') ?? ''}
      </footer>`

  return `
    <section class="card theme-${card.theme}">
      <div class="card-bg-shape shape-one"></div>
      <div class="card-bg-shape shape-two"></div>
      <header class="topline">
        <span>${String(index + 1).padStart(2, '0')}</span>
        <strong>${escapeHtml(card.eyebrow)}</strong>
      </header>
      <main class="card-main">
        <h1>${escapeHtml(card.title)}</h1>
        ${body}
      </main>
      <figure class="visual">${renderVisual(card.visual)}</figure>
      ${footer}
    </section>`
}

function renderHtml() {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>차근차근 AI 도우미 카드뉴스</title>
    <style>
      @page {
        size: 1080px 1080px;
        margin: 0;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: #f4f5f3;
        color: #182019;
        font-family: "Apple SD Gothic Neo", "AppleGothic", "Noto Sans Gothic", sans-serif;
      }

      .card {
        position: relative;
        display: grid;
        width: 1080px;
        height: 1080px;
        overflow: hidden;
        padding: 72px;
        page-break-after: always;
        break-after: page;
        grid-template-rows: auto 1fr auto;
        border: 0;
      }

      .card:last-child {
        page-break-after: auto;
        break-after: auto;
      }

      .theme-mint {
        background: linear-gradient(135deg, #f2fff8 0%, #dff8eb 100%);
      }

      .theme-sky {
        background: linear-gradient(135deg, #f3fbff 0%, #dceffd 100%);
      }

      .theme-yellow {
        background: linear-gradient(135deg, #fffaf0 0%, #ffedba 100%);
      }

      .theme-coral {
        background: linear-gradient(135deg, #fff7f4 0%, #ffe0d9 100%);
      }

      .theme-lavender {
        background: linear-gradient(135deg, #fbf8ff 0%, #eadfff 100%);
      }

      .card-bg-shape {
        position: absolute;
        border-radius: 50%;
        opacity: 0.42;
        filter: blur(0.2px);
      }

      .shape-one {
        right: -120px;
        top: -110px;
        width: 360px;
        height: 360px;
        background: #ffffff;
      }

      .shape-two {
        left: -140px;
        bottom: -150px;
        width: 360px;
        height: 360px;
        background: rgba(255, 255, 255, 0.72);
      }

      .topline {
        position: relative;
        z-index: 1;
        display: inline-flex;
        width: fit-content;
        max-width: 880px;
        align-items: center;
        gap: 18px;
        border: 5px solid #182019;
        border-radius: 999px;
        background: #ffffff;
        padding: 14px 24px;
        font-size: 30px;
        font-weight: 800;
        letter-spacing: 0;
        box-shadow: 0 12px 0 rgba(24, 32, 25, 0.1);
      }

      .topline span {
        display: inline-flex;
        width: 54px;
        height: 54px;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: #182019;
        color: #ffffff;
        font-size: 25px;
        line-height: 1;
      }

      .card-main {
        position: relative;
        z-index: 1;
        align-self: center;
        max-width: 900px;
      }

      h1 {
        margin: 0;
        font-size: 78px;
        font-weight: 900;
        letter-spacing: 0;
        line-height: 1.07;
        word-break: keep-all;
      }

      .body-lines {
        display: grid;
        gap: 18px;
        margin-top: 42px;
      }

      .body-lines p,
      .bullet-list li {
        margin: 0;
        border: 4px solid rgba(24, 32, 25, 0.12);
        border-radius: 28px;
        background: rgba(255, 255, 255, 0.82);
        padding: 22px 28px;
        font-size: 42px;
        font-weight: 800;
        letter-spacing: 0;
        line-height: 1.32;
        word-break: keep-all;
        box-shadow: 0 8px 0 rgba(24, 32, 25, 0.06);
      }

      .bullet-list {
        display: grid;
        gap: 16px;
        margin: 38px 0 0;
        padding: 0;
        list-style: none;
      }

      .bullet-list li::before {
        content: "✓";
        margin-right: 14px;
        color: #079b72;
      }

      .visual {
        position: absolute;
        right: 58px;
        bottom: 82px;
        z-index: 0;
        width: 360px;
        height: 250px;
        margin: 0;
      }

      .visual-svg {
        width: 100%;
        height: 100%;
      }

      footer {
        position: relative;
        z-index: 1;
        max-width: 840px;
        border-left: 10px solid #182019;
        padding-left: 22px;
        color: #4f5a52;
        font-size: 27px;
        font-weight: 800;
        line-height: 1.35;
        word-break: keep-all;
      }

      footer p {
        margin: 0 0 8px;
      }

      footer p:last-child {
        margin-bottom: 0;
      }

      footer ul {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 16px;
        margin: 10px 0 0;
        padding: 0;
        list-style: none;
        font-size: 22px;
        line-height: 1.28;
      }

      footer li::before {
        content: "· ";
      }
    </style>
  </head>
  <body>
    ${cards.map(renderCard).join('\n')}
  </body>
</html>`
}

await mkdir(pagesDir, { recursive: true })
const existingPageFiles = await readdir(pagesDir)
await Promise.all(
  existingPageFiles
    .filter((fileName) => /^page-\d+\.png$/.test(fileName))
    .map((fileName) => unlink(resolve(pagesDir, fileName))),
)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1080, height: 1080 } })
await page.setContent(renderHtml(), { waitUntil: 'networkidle' })

const cardLocators = await page.locator('.card').all()
for (const [index, card] of cardLocators.entries()) {
  await card.screenshot({
    path: resolve(pagesDir, `page-${String(index + 1).padStart(2, '0')}.png`),
  })
}

await browser.close()

await execFileAsync('python3', [
  '-c',
  `
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image

pages_dir = Path(${JSON.stringify(pagesDir)})
pdf_path = Path(${JSON.stringify(pdfPath)})
pages = sorted(pages_dir.glob("page-*.png"))

if not pages:
    raise SystemExit("No card news PNG pages were generated.")

c = canvas.Canvas(str(pdf_path), pagesize=(1080, 1080))
for page_path in pages:
    image = Image.open(page_path)
    if image.size != (1080, 1080):
        raise SystemExit(f"{page_path} is {image.size}, expected 1080x1080")
    c.drawImage(ImageReader(image), 0, 0, width=1080, height=1080)
    c.showPage()
c.save()
`,
])

console.log(`Rendered ${cards.length} card news pages.`)
console.log(pdfPath)
