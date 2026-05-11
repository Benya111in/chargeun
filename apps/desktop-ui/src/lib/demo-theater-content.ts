import {
  applySafetyGuardrails,
  buildGroundedExplanation,
  buildSegmentFromPerception,
  matchGroundedRules,
  type GroundedRuleMatch,
} from '@ansimtrack/llm-orchestrator'
import type {
  PerceptionPacket,
  RuleRecord,
  Segment,
  SegmentExplanation,
} from '@ansimtrack/shared-types'

import { earthquakeRuleCatalog, fireRuleCatalog } from './rule-catalog'

export type TheaterSegment = {
  actionSteps: string[]
  answerOptions: Array<{
    correct: boolean
    feedback: string
    id: string
    label: string
  }>
  checkQuestion: string
  description: string
  endMs: number
  explanation: SegmentExplanation
  id: string
  label: string
  learnerPrompt: string
  packet: PerceptionPacket
  primarySourceTitle: string | null
  ruleMatches: GroundedRuleMatch[]
  safetyWarnings: string[]
  safetyNotice: string
  segment: Segment
  startMs: number
  teacherGuide: {
    correction: string
    observe: string
    prompt: string
    script: string
  }
}

export type TheaterShow = {
  accentClassName: string
  id: string
  note: string
  posterSrc: string
  segments: TheaterSegment[]
  title: string
  videoSrc: string
}

type SegmentSeed = {
  actionSteps?: string[]
  answerOptions?: TheaterSegment['answerOptions']
  checkQuestion?: string
  description: string
  endMs: number
  id: string
  label: string
  learnerPrompt?: string
  packet: PerceptionPacket
  rules: RuleRecord[]
  segmentOverrides?: Partial<Segment>
  startMs: number
  teacherGuide?: TheaterSegment['teacherGuide']
}

const defaultSafetyNotice =
  '이 앱은 연습용입니다. 실제 위험하면 119·112·주변 어른·현장 안내를 먼저 따르세요.'

export const learningScenarios: TheaterShow[] = [
  {
    accentClassName: 'bg-rose-400',
    id: 'fire-grounded-flow',
    note: '문 닫기 -> 계단 대피 -> 대피공간 전환',
    posterSrc: '/demo/fire-grounded-02.jpg',
    segments: [
      createSegment({
        description: '문을 닫고 밖으로 나가요.',
        endMs: 7_800,
        id: 'fire-grounded-door-control',
        label: '문을 닫고 나가요',
        learnerPrompt: '불이 났어요. 연기가 퍼질 수 있어요.',
        actionSteps: ['문을 닫아요', '몸을 낮춰요', '계단 쪽으로 가요'],
        checkQuestion: '먼저 무엇을 할까요?',
        answerOptions: [
          {
            correct: true,
            feedback: '맞아요. 나갈 때 문을 닫으면 연기가 천천히 퍼져요.',
            id: 'close-door',
            label: '문을 닫고 나가요',
          },
          {
            correct: false,
            feedback: '괜찮아요. 엘리베이터보다 계단과 출구를 찾아요.',
            id: 'use-elevator',
            label: '엘리베이터를 타요',
          },
        ],
        packet: createPacket({
          asrText: '우리 집 화재 시 현관문을 닫고 계단으로 대피합니다.',
          objectHints: ['출입문', '현관문', '연기', '복도', '계단 방향'],
          ocrTokens: ['현관문', '계단', '대피'],
          sessionId: 'demo-fire-grounded-door-control',
          startMs: 0,
          endMs: 7_800,
          uiElements: ['우리 집 화재 시'],
        }),
        rules: fireRuleCatalog,
        segmentOverrides: {
          confidence: 0.94,
          hazard: 'fire',
          officialRuleIds: ['KR_FIRE_04'],
          phase: 'door_control',
        },
        startMs: 0,
        teacherGuide: {
          correction:
            '엘리베이터나 다시 집 안으로 들어가는 선택은 피하도록 짧게 바로잡습니다.',
          observe: '문 닫기, 몸 낮추기, 계단 이동을 순서대로 고르는지 봅니다.',
          prompt: '불이 났을 때 문을 그냥 열어 두면 어떻게 될까요?',
          script:
            '문을 닫는 행동은 연기와 불길이 퍼지는 것을 늦추기 위한 연습입니다.',
        },
      }),
      createSegment({
        description: '계단으로 가요.',
        endMs: 16_000,
        id: 'fire-grounded-stairs',
        label: '계단으로 가요',
        learnerPrompt: '나갈 수 있으면 계단을 찾아요.',
        actionSteps: [
          '비상구를 봐요',
          '계단으로 가요',
          '엘리베이터는 타지 않아요',
        ],
        checkQuestion: '어디로 가야 할까요?',
        answerOptions: [
          {
            correct: true,
            feedback: '맞아요. 화재 때는 계단으로 이동해요.',
            id: 'stairs',
            label: '계단',
          },
          {
            correct: false,
            feedback: '괜찮아요. 화재 때 엘리베이터는 멈출 수 있어요.',
            id: 'elevator',
            label: '엘리베이터',
          },
        ],
        packet: createPacket({
          asrText: '계단을 이용해 낮은 자세로 안전한 곳으로 이동합니다.',
          objectHints: ['계단으로 대피 가능함', '복도', '출구가 보임'],
          ocrTokens: ['계단', '출구', '대피'],
          sessionId: 'demo-fire-grounded-stairs',
          startMs: 7_800,
          endMs: 16_000,
          uiElements: ['계단으로 대피'],
        }),
        rules: fireRuleCatalog,
        segmentOverrides: {
          confidence: 0.94,
          hazard: 'fire',
          officialRuleIds: ['KR_FIRE_03'],
          phase: 'stair_evacuation',
        },
        startMs: 7_800,
        teacherGuide: {
          correction:
            '엘리베이터 선택이 나오면 “멈출 수 있어서 위험해요” 한 문장으로 교정합니다.',
          observe: '비상구 표지와 계단을 연결해서 말할 수 있는지 확인합니다.',
          prompt: '화재 때 엘리베이터 대신 무엇을 찾아야 할까요?',
          script: '비상구 표지를 보고 계단으로 가는 연습입니다.',
        },
      }),
      createSegment({
        description: '못 나가면 다른 대피공간으로 가요.',
        endMs: 28_028,
        id: 'fire-grounded-refuge',
        label: '다른 대피공간으로 가요',
        learnerPrompt: '문 밖으로 나가기 어려울 수 있어요.',
        actionSteps: [
          '억지로 나가지 않아요',
          '대피공간으로 가요',
          '어른이나 119에 알려요',
        ],
        checkQuestion: '밖으로 나가기 어려우면 어떻게 할까요?',
        answerOptions: [
          {
            correct: true,
            feedback: '맞아요. 무리하지 말고 대피공간과 도움 요청을 떠올려요.',
            id: 'refuge',
            label: '대피공간으로 가요',
          },
          {
            correct: false,
            feedback: '괜찮아요. 연기가 많으면 무리해서 지나가지 않아요.',
            id: 'force-exit',
            label: '연기 속으로 뛰어가요',
          },
        ],
        packet: createPacket({
          asrText:
            '대피가 어렵다면 집 안 대피공간이나 피난 수단으로 이동합니다.',
          objectHints: ['대피가 어려움', '대피공간', '현관 쪽이 막힘'],
          ocrTokens: ['대피가 어렵다면', '집 안 대피공간'],
          sessionId: 'demo-fire-grounded-refuge',
          startMs: 16_000,
          endMs: 28_028,
          uiElements: ['대피가 어렵다면'],
        }),
        rules: fireRuleCatalog,
        segmentOverrides: {
          confidence: 0.9,
          hazard: 'fire',
          officialRuleIds: ['KR_FIRE_05'],
          phase: 'refuge_space',
        },
        startMs: 16_000,
        teacherGuide: {
          correction:
            '“무조건 나가기”가 아니라 상황에 따라 대피공간과 도움 요청이 필요함을 설명합니다.',
          observe: '무리하지 않기와 도움 요청을 함께 기억하는지 봅니다.',
          prompt: '문 쪽에 연기가 많으면 어디에서 기다리며 도움을 부를까요?',
          script:
            '나가기 어려울 때는 안전한 대피공간과 도움 요청을 연습합니다.',
        },
      }),
    ],
    title: '화재가 났을 때',
    videoSrc: '/demo-video/fire-door-control-001.mp4',
  },
  {
    accentClassName: 'bg-sky-400',
    id: 'earthquake-protect-flow',
    note: 'review -> 책상 아래 보호 -> 방석 머리 보호',
    posterSrc: '/demo/earthquake-review-02.jpg',
    segments: [
      createSegment({
        description: '책상 아래로 들어가요.',
        endMs: 14_000,
        id: 'earthquake-review-office-desk',
        label: '책상 아래로 들어가요',
        learnerPrompt: '땅이 흔들려요. 물건이 떨어질 수 있어요.',
        actionSteps: [
          '책상 아래로 들어가요',
          '머리를 보호해요',
          '흔들림이 멈출 때까지 기다려요',
        ],
        checkQuestion: '흔들릴 때 먼저 어디로 갈까요?',
        answerOptions: [
          {
            correct: true,
            feedback: '맞아요. 흔들릴 때는 머리를 보호해요.',
            id: 'under-desk',
            label: '책상 아래',
          },
          {
            correct: false,
            feedback: '괜찮아요. 흔들리는 동안 뛰어나가면 다칠 수 있어요.',
            id: 'run-out',
            label: '밖으로 뛰어나가요',
          },
        ],
        packet: createPacket({
          asrText:
            '지진으로 흔들릴 때는 책상이나 탁자 아래로 들어가 머리를 보호합니다.',
          objectHints: ['탁자', '책상', '머리 보호 자세', '사무실'],
          ocrTokens: ['탁자 아래', '책상 아래', '머리 보호'],
          sessionId: 'demo-earthquake-review-office-desk',
          startMs: 6_000,
          endMs: 14_000,
          uiElements: ['사무실에 있을 때는 책상 아래로 피하기'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.94,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_03'],
          phase: 'during_shaking',
        },
        startMs: 6_000,
        teacherGuide: {
          correction: '뛰어나가기보다 머리 보호와 기다리기를 먼저 말해 줍니다.',
          observe:
            '책상 아래, 머리 보호, 기다리기를 순서대로 기억하는지 확인합니다.',
          prompt: '흔들릴 때 머리를 무엇으로 보호할 수 있을까요?',
          script: '흔들리는 동안 떨어지는 물건에서 머리를 보호하는 연습입니다.',
        },
      }),
      createSegment({
        description: '학교에서도 책상 아래로 가요.',
        endMs: 22_000,
        id: 'earthquake-review-school-desk',
        label: '학교에서도 책상 아래로 가요',
        learnerPrompt: '교실에서도 같은 방법을 써요.',
        actionSteps: [
          '책상 아래로 들어가요',
          '책상 다리를 잡아요',
          '선생님 말을 들어요',
        ],
        checkQuestion: '학교에서 흔들리면 무엇을 할까요?',
        answerOptions: [
          {
            correct: true,
            feedback: '맞아요. 교실에서는 책상 아래에서 선생님 안내를 들어요.',
            id: 'school-desk',
            label: '책상 아래로 가요',
          },
          {
            correct: false,
            feedback: '괜찮아요. 먼저 뛰지 말고 선생님 안내를 들어요.',
            id: 'run-hall',
            label: '복도로 뛰어나가요',
          },
        ],
        packet: createPacket({
          asrText:
            '지진으로 흔들릴 때 학교에서도 책상이나 탁자 아래로 피해서 머리를 보호합니다.',
          objectHints: ['학생', '탁자', '책상', '머리 보호 자세', '교실'],
          ocrTokens: ['탁자 아래', '책상 아래', '머리 보호'],
          sessionId: 'demo-earthquake-review-school-desk',
          startMs: 14_000,
          endMs: 22_000,
          uiElements: ['학교에 있을 때는 책상 아래로 피하기'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.94,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_03'],
          phase: 'during_shaking',
        },
        startMs: 14_000,
        teacherGuide: {
          correction:
            '복도로 뛰어나가기보다 책상 아래 보호와 선생님 안내를 강조합니다.',
          observe:
            '가정/사무실/교실처럼 장소가 바뀌어도 같은 원리를 적용하는지 봅니다.',
          prompt: '학교에서는 누구의 안내를 들어야 할까요?',
          script:
            '장소가 달라져도 흔들릴 때는 머리를 보호하고 안내를 듣는 연습입니다.',
        },
      }),
      createSegment({
        description: '책상이 없으면 머리를 감싸요.',
        endMs: 28_028,
        id: 'earthquake-review-cushion',
        label: '머리를 감싸요',
        learnerPrompt: '책상이 없을 때도 머리를 보호해요.',
        actionSteps: [
          '몸을 낮춰요',
          '가방이나 방석으로 머리를 감싸요',
          '흔들림이 멈추길 기다려요',
        ],
        checkQuestion: '책상이 없으면 무엇을 보호할까요?',
        answerOptions: [
          {
            correct: true,
            feedback: '맞아요. 머리를 보호하는 것이 먼저예요.',
            id: 'protect-head',
            label: '머리',
          },
          {
            correct: false,
            feedback: '괜찮아요. 흔들릴 때는 물건보다 머리와 몸이 먼저예요.',
            id: 'protect-bag',
            label: '가방만 챙겨요',
          },
        ],
        packet: createPacket({
          asrText:
            '지진으로 흔들릴 때 탁자가 없으면 방석이나 가방으로 머리를 보호하고 낮게 자세를 유지합니다.',
          objectHints: ['방석', '머리 보호 자세', '몸을 낮춤', '탁자가 없음'],
          ocrTokens: ['방석', '머리 보호'],
          sessionId: 'demo-earthquake-review-cushion',
          startMs: 22_000,
          endMs: 28_028,
          uiElements: ['머리 보호'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.92,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_04'],
          phase: 'during_shaking',
        },
        startMs: 22_000,
        teacherGuide: {
          correction:
            '물건 챙기기보다 몸과 머리 보호가 먼저임을 짧게 반복합니다.',
          observe: '책상이 없는 상황에서도 대체 행동을 고르는지 확인합니다.',
          prompt: '책상이 없으면 무엇으로 머리를 가릴 수 있을까요?',
          script: '책상이 없을 때도 몸을 낮추고 머리를 보호하는 연습입니다.',
        },
      }),
    ],
    title: '지진이 흔들릴 때',
    videoSrc: '/demo-video/earthquake-desk-001.mp4',
  },
  {
    accentClassName: 'bg-orange-400',
    id: 'fire-visual-flow',
    note: '무음에서도 장면 단위 grounded 전환 유지',
    posterSrc: '/demo/fire-visual-02.jpg',
    segments: [
      createSegment({
        description: '소리가 없어도 문을 닫고 나가요.',
        endMs: 8_000,
        id: 'fire-visual-door-control',
        label: '문을 닫고 나가요',
        learnerPrompt: '소리가 없어도 장면을 보고 연습해요.',
        actionSteps: ['문을 닫아요', '계단 방향을 봐요', '어른에게 알려요'],
        checkQuestion: '소리가 없어도 먼저 무엇을 볼까요?',
        answerOptions: [
          {
            correct: true,
            feedback: '맞아요. 문과 계단 방향을 보고 연습할 수 있어요.',
            id: 'visual-exit',
            label: '문과 계단 방향',
          },
          {
            correct: false,
            feedback: '괜찮아요. 소리가 없어도 화면 단서를 볼 수 있어요.',
            id: 'wait-audio',
            label: '소리가 날 때까지 기다려요',
          },
        ],
        packet: createPacket({
          asrText: '',
          objectHints: ['출입문', '복도', '계단 방향'],
          ocrTokens: ['현관문', '계단', '대피'],
          sessionId: 'demo-fire-visual-door-control',
          startMs: 0,
          endMs: 8_000,
          uiElements: ['우리 집 화재 시'],
        }),
        rules: fireRuleCatalog,
        segmentOverrides: {
          confidence: 0.91,
          hazard: 'fire',
          officialRuleIds: ['KR_FIRE_04'],
          phase: 'door_control',
        },
        startMs: 0,
        teacherGuide: {
          correction:
            '오디오가 없어도 자막, 표지, 행동 장면을 함께 보도록 돕습니다.',
          observe: '소리 없이도 핵심 단서를 찾는지 봅니다.',
          prompt: '소리가 없을 때 화면에서 무엇을 볼 수 있을까요?',
          script: '듣기 정보가 없어도 눈으로 단서를 찾는 연습입니다.',
        },
      }),
      createSegment({
        description: '소리가 없어도 계단으로 가요.',
        endMs: 15_500,
        id: 'fire-visual-stairs',
        label: '계단으로 가요',
        learnerPrompt: '표지와 움직임을 보고 계단을 찾아요.',
        actionSteps: [
          '비상구 표지를 봐요',
          '계단을 찾아요',
          '엘리베이터는 피해요',
        ],
        checkQuestion: '화면에서 어떤 표시를 찾을까요?',
        answerOptions: [
          {
            correct: true,
            feedback: '맞아요. 비상구와 계단 표시를 찾아요.',
            id: 'exit-sign',
            label: '비상구 표시',
          },
          {
            correct: false,
            feedback: '괜찮아요. 화재 연습에서는 계단 표시를 찾아요.',
            id: 'elevator-sign',
            label: '엘리베이터 표시',
          },
        ],
        packet: createPacket({
          asrText: '',
          objectHints: ['계단으로 대피 가능함', '출구가 보임', '복도'],
          ocrTokens: ['계단', '출구', '대피'],
          sessionId: 'demo-fire-visual-stairs',
          startMs: 8_000,
          endMs: 15_500,
          uiElements: ['현관문 닫고 계단으로 대피'],
        }),
        rules: fireRuleCatalog,
        segmentOverrides: {
          confidence: 0.92,
          hazard: 'fire',
          officialRuleIds: ['KR_FIRE_03'],
          phase: 'stair_evacuation',
        },
        startMs: 8_000,
        teacherGuide: {
          correction: '표지판과 방향 단서를 천천히 짚어 줍니다.',
          observe: '비상구/계단 같은 시각 단어를 고르는지 봅니다.',
          prompt: '계단을 찾을 때 어떤 글자나 그림을 볼까요?',
          script: '소리 없이도 비상구와 계단 표시를 찾는 연습입니다.',
        },
      }),
      createSegment({
        description: '못 나가면 다른 대피공간으로 가요.',
        endMs: 24_023,
        id: 'fire-visual-refuge',
        label: '다른 대피공간으로 가요',
        learnerPrompt: '길이 막혔을 때 다른 안전한 곳을 찾아요.',
        actionSteps: [
          '무리해서 지나가지 않아요',
          '대피공간을 찾아요',
          '도움을 요청해요',
        ],
        checkQuestion: '길이 막히면 무엇을 할까요?',
        answerOptions: [
          {
            correct: true,
            feedback: '맞아요. 무리하지 않고 대피공간과 도움 요청을 기억해요.',
            id: 'visual-refuge',
            label: '대피공간을 찾아요',
          },
          {
            correct: false,
            feedback: '괜찮아요. 위험한 길로 억지로 가지 않아요.',
            id: 'visual-force',
            label: '막힌 길로 가요',
          },
        ],
        packet: createPacket({
          asrText: '',
          objectHints: ['대피가 어려움', '대피공간', '실내 대기'],
          ocrTokens: ['대피가 어렵다면', '집 안 대피공간'],
          sessionId: 'demo-fire-visual-refuge',
          startMs: 15_500,
          endMs: 24_023,
          uiElements: ['대피가 어렵다면'],
        }),
        rules: fireRuleCatalog,
        segmentOverrides: {
          confidence: 0.9,
          hazard: 'fire',
          officialRuleIds: ['KR_FIRE_05'],
          phase: 'refuge_space',
        },
        startMs: 15_500,
        teacherGuide: {
          correction:
            '막힌 길로 가지 않고 안전한 장소와 도움 요청으로 바꿔 말해 줍니다.',
          observe:
            'visual-only 상황에서도 “무리하지 않기”를 선택하는지 봅니다.',
          prompt: '길이 막혔을 때 그냥 지나가도 될까요?',
          script: '장면을 보고 대피공간과 도움 요청을 떠올리는 연습입니다.',
        },
      }),
    ],
    title: '소리가 없어도 볼 수 있어요',
    videoSrc: '/demo-video/fire-stair-no-audio-001.mp4',
  },
  {
    accentClassName: 'bg-teal-400',
    id: 'earthquake-after-flow',
    note: '출구 확보 -> 가스/전기 확인 -> 신고 전환',
    posterSrc: '/demo/earthquake-after-02.jpg',
    segments: [
      createSegment({
        description: '문을 열어 나갈 길을 만들어요.',
        endMs: 9_500,
        id: 'earthquake-after-exit',
        label: '문을 열어요',
        learnerPrompt: '흔들림이 멈췄어요. 나갈 길을 확인해요.',
        actionSteps: [
          '천천히 일어나요',
          '문을 열어 출구를 확인해요',
          '주변 어른과 함께 움직여요',
        ],
        checkQuestion: '흔들림이 멈춘 뒤 무엇을 확인할까요?',
        answerOptions: [
          {
            correct: true,
            feedback: '맞아요. 출구와 주변 안내를 확인해요.',
            id: 'check-exit',
            label: '나갈 길',
          },
          {
            correct: false,
            feedback: '괜찮아요. 바로 뛰지 말고 출구와 안내를 확인해요.',
            id: 'run-fast',
            label: '바로 뛰어나가요',
          },
        ],
        packet: createPacket({
          asrText: '흔들림이 멈추면 문을 열어 출구를 확보합니다.',
          objectHints: ['출입문', '출구 확보', '실내 이동'],
          ocrTokens: ['출구 확보'],
          sessionId: 'demo-earthquake-after-exit',
          startMs: 0,
          endMs: 9_500,
          uiElements: ['대피 후 행동요령'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.94,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_05'],
          phase: 'after_shaking',
        },
        startMs: 0,
        teacherGuide: {
          correction:
            '뛰어나가기보다 출구 확인과 주변 안내를 먼저 말해 줍니다.',
          observe: '흔들리는 중 행동과 멈춘 뒤 행동을 구분하는지 봅니다.',
          prompt: '흔들림이 멈춘 뒤에는 무엇이 달라질까요?',
          script: '흔들림이 멈춘 뒤 출구를 확인하는 연습입니다.',
        },
      }),
      createSegment({
        description: '가스와 전기를 살펴요.',
        endMs: 19_500,
        id: 'earthquake-after-gas',
        label: '가스와 전기를 살펴요',
        learnerPrompt: '다친 곳과 위험한 냄새를 확인해요.',
        actionSteps: [
          '가스 냄새를 맡으면 멀리 가요',
          '전기 스위치를 함부로 만지지 않아요',
          '어른에게 말해요',
        ],
        checkQuestion: '가스 냄새가 나면 누구에게 말할까요?',
        answerOptions: [
          {
            correct: true,
            feedback: '맞아요. 어른에게 말하고 안전한 곳으로 가요.',
            id: 'tell-adult',
            label: '어른에게 말해요',
          },
          {
            correct: false,
            feedback: '괜찮아요. 혼자 만지지 말고 어른에게 알려요.',
            id: 'touch-gas',
            label: '혼자 만져요',
          },
        ],
        packet: createPacket({
          asrText: '가스와 전깃불을 확인하고 위험이 있으면 바로 차단합니다.',
          objectHints: ['가스 밸브', '전기 차단기', '주방'],
          ocrTokens: ['가스', '전기', '출구'],
          sessionId: 'demo-earthquake-after-gas',
          startMs: 9_500,
          endMs: 19_500,
          uiElements: ['가스가 샐 경우'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.94,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_05'],
          phase: 'after_shaking',
        },
        startMs: 9_500,
        teacherGuide: {
          correction:
            '가스/전기는 혼자 조작하지 않고 어른에게 알리는 쪽으로 안내합니다.',
          observe: '위험 단서를 발견했을 때 도움 요청을 선택하는지 확인합니다.',
          prompt: '가스 냄새가 나면 혼자 고쳐도 될까요?',
          script: '위험한 냄새나 전기 문제는 어른에게 알리는 연습입니다.',
        },
      }),
      createSegment({
        description: '위험하면 바로 알려요.',
        endMs: 30_030,
        id: 'earthquake-after-report',
        label: '위험하면 바로 알려요',
        learnerPrompt: '다친 사람이나 불이 있으면 도움을 불러요.',
        actionSteps: [
          '다친 사람이 있는지 봐요',
          '불이나 가스 냄새를 알려요',
          '119 또는 주변 어른에게 도움을 요청해요',
        ],
        checkQuestion: '크게 위험하면 어디에 도움을 요청할까요?',
        answerOptions: [
          {
            correct: true,
            feedback: '맞아요. 119나 주변 어른에게 바로 알려요.',
            id: 'call-help',
            label: '119와 주변 어른',
          },
          {
            correct: false,
            feedback: '괜찮아요. 위험하면 혼자 숨기지 말고 도움을 요청해요.',
            id: 'hide-alone',
            label: '혼자 조용히 있어요',
          },
        ],
        packet: createPacket({
          asrText:
            '흔들림이 멈춘 뒤 가족과 부상자를 확인하고 가스 냄새나 화재가 있으면 119에 알립니다.',
          objectHints: ['출입문', '안전 확인', '부상자 확인', '흔들림이 멈춤'],
          ocrTokens: ['안전 확인', '출구', '119 신고'],
          sessionId: 'demo-earthquake-after-report',
          startMs: 19_500,
          endMs: 30_030,
          uiElements: ['대피 후 행동요령'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.92,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_12'],
          phase: 'post_quake_report',
        },
        startMs: 19_500,
        teacherGuide: {
          correction:
            '위험을 혼자 해결하려 하지 않고 도움을 요청하는 문장을 연습합니다.',
          observe: '119와 주변 어른 도움 요청을 모두 말할 수 있는지 봅니다.',
          prompt: '다친 사람이나 불을 보면 누구에게 알려야 할까요?',
          script: '위험을 발견했을 때 신고와 주변 어른 도움 요청을 연습합니다.',
        },
      }),
    ],
    title: '흔들림이 멈춘 뒤',
    videoSrc: '/demo-video/earthquake-after-shaking-001.mp4',
  },
]

export const theaterShows = learningScenarios

function createSegment(seed: SegmentSeed): TheaterSegment {
  const detectedSegment = buildSegmentFromPerception({
    packet: seed.packet,
    rules: seed.rules,
  })
  const segment: Segment = {
    ...detectedSegment,
    ...seed.segmentOverrides,
    endMs: seed.endMs,
    id: seed.id,
    startMs: seed.startMs,
  }
  const ruleMatches = matchGroundedRules({
    evidence: seed.packet,
    rules: seed.rules,
    segment,
  })
  const explanation = buildGroundedExplanation({
    evidence: seed.packet,
    rules: seed.rules,
    segment,
  })
  const safetyView = applySafetyGuardrails({
    evidenceVisible: true,
    explanation,
    panicMode: false,
    privacyConsent: true,
    segment,
  })

  return {
    actionSteps: seed.actionSteps ?? [
      safetyView.explanation.tracks.action ??
        safetyView.explanation.tracks.easy,
    ],
    answerOptions: seed.answerOptions ?? [
      {
        correct: true,
        feedback: '맞아요. 이 장면을 다시 한 번 보며 기억해요.',
        id: `${seed.id}-correct`,
        label: safetyView.explanation.tracks.action ?? seed.description,
      },
    ],
    checkQuestion: seed.checkQuestion ?? '먼저 무엇을 할까요?',
    description: seed.description,
    endMs: seed.endMs,
    explanation: safetyView.explanation,
    id: seed.id,
    label: seed.label,
    learnerPrompt: seed.learnerPrompt ?? seed.description,
    packet: seed.packet,
    primarySourceTitle: ruleMatches[0]?.rule.source_title ?? null,
    ruleMatches,
    safetyWarnings: safetyView.warnings,
    safetyNotice: defaultSafetyNotice,
    segment,
    startMs: seed.startMs,
    teacherGuide: seed.teacherGuide ?? {
      correction:
        '오답이 나오면 장면을 다시 보고 공식 행동요령을 한 문장으로 반복합니다.',
      observe:
        '학습자가 첫 행동을 고르고, 다시 보기와 다음 장면을 사용할 수 있는지 확인합니다.',
      prompt: seed.checkQuestion ?? '먼저 무엇을 할까요?',
      script:
        safetyView.explanation.tracks.caregiver ??
        '장면을 짧게 멈추고 쉬운말과 행동 카드를 함께 확인합니다.',
    },
  }
}

function createPacket(input: {
  asrText: string
  endMs: number
  objectHints: string[]
  ocrTokens: string[]
  sessionId: string
  startMs: number
  uiElements: string[]
}): PerceptionPacket {
  return {
    asrText: input.asrText,
    keyframes: [`${input.sessionId}-a`, `${input.sessionId}-b`],
    objectHints: input.objectHints.map((label, index) => ({
      bbox: [0.12 + index * 0.04, 0.18, 0.28, 0.22],
      conf: 0.74 + index * 0.03,
      label,
    })),
    ocrTokens: input.ocrTokens,
    sessionId: input.sessionId,
    tEndMs: input.endMs,
    tStartMs: input.startMs,
    uiElements: input.uiElements.map((label, index) => ({
      bbox: [0.58, 0.1 + index * 0.08, 0.22, 0.08],
      conf: 0.8,
      label,
    })),
  }
}
