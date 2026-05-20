import {
  applySafetyGuardrails,
  buildGroundedExplanation,
  buildSegmentFromPerception,
  buildStructuredLearningExplanation,
  matchGroundedRules,
  type GroundedRuleMatch,
} from '@ansimtrack/llm-orchestrator'
import type {
  LearningTeachBack,
  LearningTeachBackOptionKind,
  PerceptionPacket,
  RuleRecord,
  Segment,
  SegmentExplanation,
  StructuredLearningExplanation,
} from '@ansimtrack/shared-types'

import {
  earthquakeRuleCatalog,
  fireRuleCatalog,
  officialChunkCatalog,
} from './rule-catalog'

export type TheaterSegment = {
  actionSteps: string[]
  answerOptions: PracticeAnswerOption[]
  checkQuestion: string
  description: string
  endMs: number
  explanation: SegmentExplanation
  id: string
  label: string
  learnerExplanation: string
  learnerPrompt: string
  narration: TimedNarrationCue[]
  packet: PerceptionPacket
  practiceMode: SegmentPracticeMode
  primarySourceTitle: string | null
  ruleMatches: GroundedRuleMatch[]
  safetyWarnings: string[]
  safetyNotice: string
  segment: Segment
  startMs: number
  structuredExplanation: StructuredLearningExplanation
  teacherGuide: {
    correction: string
    observe: string
    prompt: string
    script: string
  }
  teachBack: LearningTeachBack | null
}

export type SegmentPracticeMode = 'intro' | 'action'

export type TimedNarrationCue = {
  endMs: number
  source: 'audio' | 'caption' | 'onscreen'
  startMs: number
  text: string
}

export type PracticeAnswerOption = LearningTeachBack['options'][number] & {
  correct: boolean
}

export type TheaterShow = {
  accentClassName: string
  homeNote?: string
  homeTitle?: string
  id: string
  note: string
  posterSrc: string
  practiceSequence?: boolean
  segments: TheaterSegment[]
  showOnHome?: boolean
  title: string
  videoSrc: string
}

type SegmentSeed = {
  actionSteps?: string[]
  description: string
  endMs: number
  id: string
  label: string
  learnerExplanation?: string
  learnerPrompt?: string
  narration?: TimedNarrationCue[]
  packet: PerceptionPacket
  practiceMode?: SegmentPracticeMode
  rules: RuleRecord[]
  segmentOverrides?: Partial<Segment>
  startMs: number
  teachBack: LearningTeachBack
  teacherGuide?: TheaterSegment['teacherGuide']
}

const defaultSafetyNotice =
  '이 앱은 연습용입니다. 실제로 위험할 때는 119·112, 주변 어른, 현장 안내를 먼저 따르세요.'

export const learningScenarios: TheaterShow[] = [
  {
    accentClassName: 'bg-rose-400',
    id: 'fire-grounded-flow',
    note: '문을 닫고, 계단을 찾고, 막히면 도움을 불러요',
    posterSrc: '/demo/fire-grounded-02.jpg',
    segments: [
      createSegment({
        description: '아파트 화재 연습을 시작해요.',
        endMs: 10_200,
        id: 'fire-full-alert',
        label: '화재 연습을 시작해요',
        learnerExplanation: '아파트 화재 연습을 시작해요.',
        learnerPrompt: '먼저 숫자와 제목을 보고 있어요.',
        actionSteps: [],
        narration: [
          {
            endMs: 3_000,
            source: 'onscreen',
            startMs: 0,
            text: '아파트 화재는 매년 평균 약 2,800여 건 발생합니다.',
          },
          {
            endMs: 7_400,
            source: 'onscreen',
            startMs: 3_000,
            text: '아파트 화재 사상자의 39.1%는 대피 중 발생합니다.',
          },
          {
            endMs: 10_200,
            source: 'onscreen',
            startMs: 7_400,
            text: '아파트 화재 시 이렇게 행동합시다.',
          },
        ],
        practiceMode: 'intro',
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 아직 행동을 고르는 장면은 아니에요.',
            id: 'act-now',
            label: '지금 바로 행동 고르기',
          },
          correct: {
            feedback: '맞아요. 먼저 화재 연습이 시작되는 장면이에요.',
            id: 'watch-intro',
            label: '연습 시작 보기',
          },
          kind: 'signal',
          prompt: '이 장면은 무엇을 알려줄까요?',
          ruleIds: ['KR_FIRE_01'],
        }),
        packet: createPacket({
          asrText:
            '아파트 화재는 매년 평균 약 2,800여 건 발생합니다. 아파트 화재 사상자의 39.1%는 대피 중 발생합니다. 아파트 화재 시 이렇게 행동합시다.',
          objectHints: ['아파트 화재 통계', '안전교육 오프닝', '제목 화면'],
          ocrTokens: ['아파트 화재', '2,800여 건', '39.1%', '행동요령'],
          sessionId: 'demo-fire-full-alert',
          startMs: 0,
          endMs: 10_200,
          uiElements: ['아파트 화재 시 이렇게 행동합시다'],
        }),
        rules: fireRuleCatalog,
        segmentOverrides: {
          confidence: 0.93,
          hazard: 'fire',
          officialRuleIds: ['KR_FIRE_01'],
          phase: 'alert_and_wake',
        },
        startMs: 0,
        teacherGuide: {
          correction:
            '오프닝에서는 아직 행동 카드를 고르지 않고, 영상이 어떤 연습인지 확인하게 합니다.',
          observe:
            '학습자가 통계와 제목을 본 뒤 다음 장면으로 넘어갈 수 있는지 봅니다.',
          prompt: '지금은 행동 장면인가요, 연습을 소개하는 장면인가요?',
          script:
            '오프닝은 아파트 화재가 자주 일어나고 대피 중 다칠 수 있음을 알려 주는 소개 장면입니다.',
        },
      }),
      createSegment({
        description: '문을 닫고 계단을 찾아요.',
        endMs: 18_000,
        id: 'fire-full-door-control',
        label: '문 닫고 계단을 봐요',
        learnerExplanation: '나갈 수 있으면 현관문을 닫아요.',
        learnerPrompt: '가족이 집 밖으로 나가고 있어요.',
        actionSteps: ['문을 닫아요', '계단 쪽을 봐요'],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 문을 닫는 장면을 다시 봐요.',
            id: 'open-door',
            label: '열어 두기',
          },
          correct: {
            feedback: '맞아요. 문을 닫으면 연기가 덜 퍼져요.',
            id: 'close-door',
            label: '닫기',
          },
          kind: 'state',
          prompt: '나갈 때 문은 어떻게 할까요?',
          ruleIds: ['KR_FIRE_04'],
        }),
        packet: createPacket({
          asrText: '우리 집 화재 시 현관문을 닫고 계단으로 대피합니다.',
          objectHints: [
            '출입문',
            '현관문',
            '연기',
            '복도',
            '비상구 표시',
            '계단 방향',
          ],
          ocrTokens: ['현관문', '계단', '비상구', '대피'],
          sessionId: 'demo-fire-full-door-control',
          startMs: 10_200,
          endMs: 18_000,
          uiElements: ['우리 집 화재 시', '계단으로 대피'],
        }),
        rules: fireRuleCatalog,
        segmentOverrides: {
          confidence: 0.94,
          hazard: 'fire',
          officialRuleIds: ['KR_FIRE_04', 'KR_FIRE_03'],
          phase: 'door_control',
        },
        startMs: 10_200,
        teacherGuide: {
          correction:
            '엘리베이터나 다시 집 안으로 들어가는 선택은 피하도록 짧게 바로잡습니다.',
          observe: '문 닫기, 몸 낮추기, 계단 이동을 순서대로 고르는지 봅니다.',
          prompt: '문을 닫은 뒤 어떤 표시를 보면 좋을까요?',
          script:
            '문 닫기와 계단 찾기를 한 장면으로 묶어 대피 시작 행동을 연습합니다.',
        },
      }),
      createSegment({
        description: '엘리베이터 말고 계단으로 가요.',
        endMs: 24_600,
        id: 'fire-full-stairs',
        label: '계단으로 대피해요',
        learnerExplanation: '불이 났을 때 엘리베이터는 타지 않아요.',
        learnerPrompt: '계단과 엘리베이터가 보여요.',
        actionSteps: ['계단을 찾아요', '천천히 내려가요'],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 불이 났을 때 엘리베이터는 위험해요.',
            id: 'elevator',
            label: '엘리베이터',
          },
          correct: {
            feedback: '맞아요. 불이 났을 때는 계단을 이용해요.',
            id: 'stairs',
            label: '계단',
          },
          kind: 'place',
          prompt: '어디로 대피할까요?',
          ruleIds: ['KR_FIRE_03'],
        }),
        packet: createPacket({
          asrText:
            '대피할 때는 엘리베이터를 이용하지 않고 계단으로 이동합니다.',
          objectHints: ['계단으로 대피 가능함', '엘리베이터', '복도', '비상구'],
          ocrTokens: ['엘리베이터 이용 금지', '계단', '대피'],
          sessionId: 'demo-fire-full-stairs',
          startMs: 18_000,
          endMs: 24_600,
          uiElements: ['엘리베이터 이용 금지'],
        }),
        rules: fireRuleCatalog,
        segmentOverrides: {
          confidence: 0.94,
          hazard: 'fire',
          officialRuleIds: ['KR_FIRE_03'],
          phase: 'stair_evacuation',
        },
        startMs: 18_000,
        teacherGuide: {
          correction: '엘리베이터 대신 계단을 선택하도록 짧게 반복합니다.',
          observe: '계단과 엘리베이터 선택을 구분하는지 봅니다.',
          prompt: '불이 났을 때 엘리베이터를 타면 왜 위험할까요?',
          script: '계단 대피와 엘리베이터 금지를 하나의 장면으로 연습합니다.',
        },
      }),
      createSegment({
        description: '못 나가면 대피공간으로 가요.',
        endMs: 34_600,
        id: 'fire-full-refuge',
        label: '대피공간으로 가요',
        learnerExplanation: '길이 막히면 대피공간에서 도움을 불러요.',
        learnerPrompt: '연기가 많아서 밖으로 나가기 어려워요.',
        actionSteps: [
          '대피공간으로 가요',
          '문을 닫아요',
          '119나 어른에게 알려요',
        ],
        teachBack: createTeachBack({
          contrast: {
            feedback:
              '괜찮아요. 이 장면에서는 안전한 곳을 찾는 것을 다시 봐요.',
            id: 'force-exit',
            label: '연기가 많은 길',
          },
          correct: {
            feedback: '맞아요. 대피공간에서 도움을 불러요.',
            id: 'refuge',
            label: '대피공간',
          },
          kind: 'place',
          prompt: '밖으로 나가기 어려우면 어디로 갈까요?',
          ruleIds: ['KR_FIRE_05'],
        }),
        packet: createPacket({
          asrText:
            '대피가 어렵다면 집 안 대피공간이나 피난 수단으로 이동합니다.',
          objectHints: ['대피가 어려움', '대피공간', '현관 쪽이 막힘'],
          ocrTokens: ['대피가 어렵다면', '집 안 대피공간'],
          sessionId: 'demo-fire-full-refuge',
          startMs: 24_600,
          endMs: 34_600,
          uiElements: ['대피가 어렵다면'],
        }),
        rules: fireRuleCatalog,
        segmentOverrides: {
          confidence: 0.9,
          hazard: 'fire',
          officialRuleIds: ['KR_FIRE_05'],
          phase: 'refuge_space',
        },
        startMs: 24_600,
        teacherGuide: {
          correction:
            '“무조건 나가기”가 아니라 상황에 따라 대피공간과 도움 요청이 필요함을 설명합니다.',
          observe: '무리하지 않기와 도움 요청을 함께 기억하는지 봅니다.',
          prompt: '문 쪽에 연기가 많으면 어디에서 기다리며 도움을 부를까요?',
          script:
            '나가기 어려울 때는 안전한 대피공간과 도움 요청을 연습합니다.',
        },
      }),
      createSegment({
        description: '연기가 들어오면 문틈을 막아요.',
        endMs: 43_800,
        id: 'fire-full-seal-room',
        label: '문틈을 막고 알려요',
        learnerExplanation: '연기가 들어오면 문틈을 막고 구조를 요청해요.',
        learnerPrompt: '방 안에서 기다려야 할 수 있어요.',
        actionSteps: ['문을 닫아요', '문틈을 막아요', '119에 알려요'],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 창문만 열기보다 문틈을 막는 장면을 봐요.',
            id: 'window-only',
            label: '창문만 열기',
          },
          correct: {
            feedback: '맞아요. 연기가 들어오면 문틈을 막고 알려요.',
            id: 'seal-gap',
            label: '문틈 막기',
          },
          kind: 'signal',
          prompt: '방 안에서 기다릴 때 무엇을 할까요?',
          ruleIds: ['KR_FIRE_06'],
        }),
        packet: createPacket({
          asrText:
            '밖으로 나가기 어렵다면 연기에서 먼 방으로 이동해 문을 닫고 젖은 수건으로 틈을 막습니다.',
          objectHints: ['젖은 수건', '문틈', '방 안 대기', '연기 유입'],
          ocrTokens: ['방문 틈새 차단', '구조 요청'],
          sessionId: 'demo-fire-full-seal-room',
          startMs: 34_600,
          endMs: 43_800,
          uiElements: ['방문 틈새 차단 후 구조 요청'],
        }),
        rules: fireRuleCatalog,
        segmentOverrides: {
          confidence: 0.92,
          hazard: 'fire',
          officialRuleIds: ['KR_FIRE_06'],
          phase: 'seal_room',
        },
        startMs: 34_600,
        teacherGuide: {
          correction:
            '방 안에 머무를 때는 연기 유입을 줄이고 위치를 알리는 행동으로 연결합니다.',
          observe: '문 닫기, 틈 막기, 119 알리기를 순서대로 기억하는지 봅니다.',
          prompt: '연기가 문틈으로 들어오면 무엇으로 막을 수 있을까요?',
          script:
            '대피가 어려운 경우 방 안에서 구조를 기다리는 행동을 연습합니다.',
        },
      }),
      createSegment({
        description: '밖으로 나온 뒤 다시 들어가지 않아요.',
        endMs: 60_000,
        id: 'fire-full-after-evacuation',
        label: '안전한 곳에서 확인해요',
        learnerExplanation: '밖으로 나오면 다시 들어가지 않고 기다려요.',
        learnerPrompt: '마지막으로 기억할 순서예요.',
        actionSteps: ['안전한 곳에 모여요', '사람을 확인해요', '119에 말해요'],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 물건을 찾으러 다시 들어가면 위험해요.',
            id: 'go-back',
            label: '다시 들어가기',
          },
          correct: {
            feedback: '맞아요. 안전한 곳에서 사람을 확인해요.',
            id: 'meet-safe',
            label: '안전한 곳',
          },
          kind: 'place',
          prompt: '밖으로 나온 뒤 어디에 있을까요?',
          ruleIds: ['KR_FIRE_10'],
        }),
        packet: createPacket({
          asrText:
            '건물 밖 대피가 끝나면 안전한 집결지에 모여 인원을 확인하고 필요하면 119에 알립니다.',
          objectHints: [
            '건물 밖 대피 완료',
            '안전한 집결지 도착',
            '인원 확인 단계',
          ],
          ocrTokens: ['생활별 대피 요령', '기억하세요'],
          sessionId: 'demo-fire-full-after-evacuation',
          startMs: 43_800,
          endMs: 60_000,
          uiElements: ['생활별 대피 요령을 기억하세요'],
        }),
        rules: fireRuleCatalog,
        segmentOverrides: {
          confidence: 0.9,
          hazard: 'fire',
          officialRuleIds: ['KR_FIRE_10'],
          phase: 'post_evacuation',
        },
        startMs: 43_800,
        teacherGuide: {
          correction:
            '대피 후에는 다시 들어가지 않고 안전한 곳에서 사람과 위치를 확인한다고 말합니다.',
          observe: '재진입하지 않기와 119 알리기를 기억하는지 봅니다.',
          prompt: '빠진 사람이 있으면 누구에게 알려야 할까요?',
          script: '마지막 장면에서 대피 후 행동과 재진입 금지를 확인합니다.',
        },
      }),
    ],
    title: '화재가 났을 때',
    videoSrc: '/demo-video/fire-full-practice-001.mp4',
  },
  {
    accentClassName: 'bg-sky-400',
    id: 'earthquake-protect-flow',
    homeNote:
      '오프닝부터 흔들릴 때, 멈춘 뒤, 가스와 전기 확인까지 이어서 연습해요',
    homeTitle: '지진이 났을 때',
    note: '머리를 보호하고, 멈춘 뒤에는 어른과 주변을 확인해요',
    posterSrc: '/demo/earthquake-review-02.jpg',
    segments: [
      createSegment({
        description: '지진은 갑자기 올 수 있어요.',
        endMs: 42_400,
        id: 'earthquake-full-opening',
        label: '지진 연습을 시작해요',
        learnerExplanation: '지진 행동요령을 소개해요.',
        learnerPrompt: '지진이 왜 위험한지 설명하고 있어요.',
        actionSteps: [],
        narration: [
          {
            endMs: 17_560,
            source: 'caption',
            startMs: 0,
            text: '언제 어디서 얼마나 강하게 발생할지 모르는 재난, 지진. 우리나라도 더 이상 지진의 안전지대가 아니고, 지진은 사전 예보가 불가능한 재난입니다.',
          },
          {
            endMs: 28_960,
            source: 'caption',
            startMs: 17_560,
            text: '따라서 평상시 지진 대처 요령을 숙지하고 올바르게 대응하는 것이 중요합니다.',
          },
          {
            endMs: 42_400,
            source: 'caption',
            startMs: 37_200,
            text: '지진 행동요령을 알아봅니다.',
          },
        ],
        practiceMode: 'intro',
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 아직 행동을 고르는 장면은 아니에요.',
            id: 'act-now',
            label: '지금 행동 고르기',
          },
          correct: {
            feedback: '맞아요. 지진 행동요령을 소개하는 장면이에요.',
            id: 'watch-intro',
            label: '소개 보기',
          },
          kind: 'signal',
          prompt: '이 장면은 무엇을 알려줄까요?',
          ruleIds: ['KR_EQ_01'],
        }),
        packet: createPacket({
          asrText:
            '언제 어디서 얼마나 강하게 발생할지 모르는 재난, 지진. 우리나라도 더 이상 지진의 안전지대가 아니고 지진은 사전 예보가 불가능한 재난입니다. 따라서 평상시 지진 대처 요령을 숙지하고 올바르게 대응하는 것이 중요합니다. 지진 행동요령을 알아봅니다.',
          objectHints: ['지진 안내 오프닝', '대처 요령 제목', '교육 시작'],
          ocrTokens: ['지진', '대처 요령', '평상시', '행동요령'],
          sessionId: 'demo-earthquake-full-opening',
          startMs: 0,
          endMs: 42_400,
          uiElements: ['지진 발생 시 행동요령'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.91,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_01'],
          phase: 'preparation',
        },
        startMs: 0,
        teacherGuide: {
          correction:
            '오프닝에서는 행동을 고르게 하지 말고 “왜 미리 연습하는지”만 짚습니다.',
          observe:
            '학습자가 실제 상황용이 아니라 사전 연습용이라는 점을 이해하는지 봅니다.',
          prompt: '지금 장면은 행동을 연습하나요, 지진을 소개하나요?',
          script:
            '오프닝은 지진은 예고하기 어렵고 평소 행동요령을 알아두어야 한다는 소개 장면입니다.',
        },
      }),
      createSegment({
        description: '흔들릴 때 머리를 보호해요.',
        endMs: 57_700,
        id: 'earthquake-full-table-protect',
        label: '탁자 아래로 들어가요',
        learnerExplanation: '흔들리면 탁자 아래에서 머리를 지켜요.',
        learnerPrompt: '집 안이 흔들려요. 물건이 떨어질 수 있어요.',
        actionSteps: ['몸을 낮춰요', '탁자 아래로 가요', '머리를 보호해요'],
        teachBack: createTeachBack({
          contrast: {
            feedback:
              '괜찮아요. 흔들릴 때는 밖으로 뛰기보다 먼저 머리를 지켜요.',
            id: 'run-out',
            label: '밖으로 뛰기',
          },
          correct: {
            feedback: '맞아요. 탁자 아래에서 머리를 보호해요.',
            id: 'under-table',
            label: '탁자 아래',
          },
          kind: 'place',
          prompt: '흔들릴 때 어디로 갈까요?',
          ruleIds: ['KR_EQ_03'],
        }),
        packet: createPacket({
          asrText:
            '지진으로 흔들리는 시간에는 튼튼한 탁자 아래로 들어가 탁자 다리를 잡고 머리와 몸을 보호합니다.',
          objectHints: ['탁자', '머리 보호 자세', '실내 흔들림'],
          ocrTokens: ['탁자 아래', '머리 보호', '몸 보호'],
          sessionId: 'demo-earthquake-full-table-protect',
          startMs: 42_600,
          endMs: 57_700,
          uiElements: ['튼튼한 탁자 아래로 피하기'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.94,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_03'],
          phase: 'during_shaking',
        },
        startMs: 42_600,
        teacherGuide: {
          correction: '뛰어나가기보다 머리 보호와 기다리기를 먼저 말해 줍니다.',
          observe:
            '몸 낮추기, 탁자 아래, 머리 보호를 순서대로 기억하는지 확인합니다.',
          prompt: '탁자가 없으면 무엇으로 머리를 보호할 수 있을까요?',
          script: '흔들리는 동안 떨어지는 물건에서 머리를 보호하는 연습입니다.',
        },
      }),
      createSegment({
        description: '가스와 전기는 어른에게 말해요.',
        endMs: 73_000,
        id: 'earthquake-full-gas-electric',
        label: '가스와 전기를 알려요',
        learnerExplanation:
          '가스 냄새나 전기 이상은 혼자 만지지 말고 어른에게 말해요.',
        learnerPrompt: '흔들림이 멈춘 뒤 부엌과 전기를 확인해요.',
        actionSteps: ['냄새 나는 곳에서 멀어져요', '어른에게 말해요'],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 가스와 전기는 혼자 만지지 않아요.',
            id: 'touch-alone',
            label: '혼자 만지기',
          },
          correct: {
            feedback: '맞아요. 어른에게 말하고 안전한 곳으로 가요.',
            id: 'tell-adult',
            label: '어른에게 말하기',
          },
          kind: 'signal',
          prompt: '가스 냄새가 나면 어떻게 할까요?',
          ruleIds: ['KR_EQ_05'],
        }),
        packet: createPacket({
          asrText:
            '흔들림이 멈추면 가스 냄새나 전기 이상을 직접 만지지 말고 어른이나 현장 안내에 알립니다.',
          objectHints: ['가스 밸브', '전기 차단기', '부엌', '가스 냄새'],
          ocrTokens: ['가스', '전기', '차단기'],
          sessionId: 'demo-earthquake-full-gas-electric',
          startMs: 57_700,
          endMs: 73_000,
          uiElements: ['가스 중간 밸브', '전기 차단기'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.92,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_05'],
          phase: 'after_shaking',
        },
        startMs: 57_700,
        teacherGuide: {
          correction:
            '영상은 성인 조작 장면을 포함하지만, 학습자에게는 “어른에게 말하기”로 바꿔 줍니다.',
          observe:
            '가스/전기를 직접 조작하지 않고 도움 요청으로 연결하는지 봅니다.',
          prompt: '가스 냄새가 나면 혼자 만져도 될까요?',
          script:
            '흔들림 뒤 설비 이상을 발견했을 때 어른에게 알리는 연습입니다.',
        },
      }),
      createSegment({
        description: '엘리베이터 말고 계단을 이용해요.',
        endMs: 80_400,
        id: 'earthquake-full-stairs',
        label: '계단으로 나가요',
        learnerExplanation: '밖으로 나갈 때는 엘리베이터 말고 계단으로 가요.',
        learnerPrompt: '밖으로 나가야 할 수 있어요.',
        actionSteps: ['계단을 찾아요', '천천히 내려가요'],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 지진 때 엘리베이터는 멈출 수 있어요.',
            id: 'elevator',
            label: '엘리베이터',
          },
          correct: {
            feedback: '맞아요. 계단으로 이동해요.',
            id: 'stairs',
            label: '계단',
          },
          kind: 'place',
          prompt: '건물 밖으로 나갈 때 어디를 이용할까요?',
          ruleIds: ['KR_EQ_07'],
        }),
        packet: createPacket({
          asrText:
            '밖으로 나갈 때는 엘리베이터를 타지 말고 계단을 이용해 건물 밖으로 대피합니다.',
          objectHints: ['계단', '엘리베이터', '건물 밖 대피'],
          ocrTokens: ['엘리베이터 금지', '계단 이용'],
          sessionId: 'demo-earthquake-full-stairs',
          startMs: 73_000,
          endMs: 80_400,
          uiElements: ['엘리베이터를 타지 말고 계단 이용'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.93,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_07'],
          phase: 'after_shaking',
        },
        startMs: 73_000,
        teacherGuide: {
          correction:
            '엘리베이터를 선택하면 “멈출 수 있어서 계단”이라고 짧게 바꿔 말합니다.',
          observe: '계단과 엘리베이터 선택을 구분하는지 봅니다.',
          prompt: '엘리베이터가 멈추면 어떻게 도움을 부를까요?',
          script: '지진 뒤 건물 밖으로 나갈 때 계단을 이용하는 장면입니다.',
        },
      }),
      createSegment({
        description: '밖에서는 머리를 보호하고 넓은 곳으로 가요.',
        endMs: 102_000,
        id: 'earthquake-full-outside-head',
        label: '밖에서 머리를 지켜요',
        learnerExplanation: '밖에서는 머리를 가리고 건물에서 멀어져요.',
        learnerPrompt: '밖에도 유리와 간판이 떨어질 수 있어요.',
        actionSteps: ['머리를 가려요', '건물에서 멀어져요', '넓은 곳으로 가요'],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 건물 벽 가까이는 위험할 수 있어요.',
            id: 'near-wall',
            label: '건물 바로 옆',
          },
          correct: {
            feedback: '맞아요. 머리를 보호하고 넓은 곳으로 가요.',
            id: 'open-space',
            label: '넓은 곳',
          },
          kind: 'place',
          prompt: '밖에서는 어디로 갈까요?',
          ruleIds: ['KR_EQ_08', 'KR_EQ_09'],
        }),
        packet: createPacket({
          asrText:
            '밖으로 나오면 담장, 유리창, 간판이 위험하므로 가방이나 손으로 머리를 보호하고 넓은 공간으로 이동합니다.',
          objectHints: ['건물 밖', '유리창', '간판', '머리 보호', '넓은 공간'],
          ocrTokens: ['머리 보호', '넓은 공간'],
          sessionId: 'demo-earthquake-full-outside-head',
          startMs: 80_600,
          endMs: 102_000,
          uiElements: ['건물에서 멀리 떨어진 곳'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.92,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_08', 'KR_EQ_09'],
          phase: 'evacuation_route',
        },
        startMs: 80_600,
        teacherGuide: {
          correction:
            '밖이라고 바로 안전한 것은 아니며, 머리 보호와 넓은 공간 이동을 강조합니다.',
          observe: '건물 옆이 아니라 넓은 곳을 고르는지 봅니다.',
          prompt: '밖에서는 무엇이 위에서 떨어질 수 있을까요?',
          script:
            '건물 밖 대피 시 낙하물을 피하고 넓은 공간으로 이동하는 연습입니다.',
        },
      }),
      createSegment({
        description: '공식 안내를 확인해요.',
        endMs: 130_400,
        id: 'earthquake-full-official-info',
        label: '안내를 확인해요',
        learnerExplanation: '넓은 곳에 도착하면 공공 안내를 들어요.',
        learnerPrompt: '대피한 뒤에도 안내를 확인해야 해요.',
        actionSteps: ['넓은 곳에 있어요', '라디오나 안내를 들어요'],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 소문보다 공식 안내를 확인해요.',
            id: 'rumor',
            label: '소문만 듣기',
          },
          correct: {
            feedback: '맞아요. 공공 안내를 확인해요.',
            id: 'official',
            label: '공공 안내',
          },
          kind: 'signal',
          prompt: '대피한 뒤 무엇을 확인할까요?',
          ruleIds: ['KR_EQ_12'],
        }),
        packet: createPacket({
          asrText:
            '지진 대피 후에는 라디오나 공공기관 안내 방송에서 제공하는 정보에 따라 행동합니다.',
          objectHints: ['라디오', '공공 안내', '대피소', '넓은 공간'],
          ocrTokens: ['안전디딤돌', '공공기관 안내'],
          sessionId: 'demo-earthquake-full-official-info',
          startMs: 102_000,
          endMs: 130_400,
          uiElements: ['라디오나 공공기관 안내 방송'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.9,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_12'],
          phase: 'post_quake_report',
        },
        startMs: 102_000,
        teacherGuide: {
          correction:
            '대피 뒤에는 임의 판단보다 공공 안내를 듣는다고 반복합니다.',
          observe: '공식 안내와 소문을 구분하는지 봅니다.',
          prompt: '휴대전화가 안 될 때는 어떤 안내를 들을 수 있을까요?',
          script: '대피 후 정보 확인을 공식 안내로 제한하는 연습입니다.',
        },
      }),
      createSegment({
        description: '학교와 사무실에서도 책상 아래로 가요.',
        endMs: 159_500,
        id: 'earthquake-full-school-desk',
        label: '학교에서도 머리를 보호해요',
        learnerExplanation: '학교와 사무실에서도 책상 아래에서 머리를 지켜요.',
        learnerPrompt: '장소가 바뀌어도 먼저 머리를 보호해요.',
        actionSteps: ['책상 아래로 들어가요', '책상 다리를 잡아요', '기다려요'],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 복도로 뛰기보다 먼저 책상 아래로 가요.',
            id: 'run-hall',
            label: '복도 뛰기',
          },
          correct: {
            feedback: '맞아요. 책상 아래에서 기다려요.',
            id: 'desk',
            label: '책상 아래',
          },
          kind: 'place',
          prompt: '학교에서 흔들리면 어디로 갈까요?',
          ruleIds: ['KR_EQ_03'],
        }),
        packet: createPacket({
          asrText:
            '사무실과 학교에서 지진을 맞닥뜨리면 즉시 책상 아래로 들어가 몸을 웅크리고 책상 다리를 잡습니다.',
          objectHints: ['사무실', '학교', '책상', '학생', '머리 보호 자세'],
          ocrTokens: ['책상 아래', '몸 보호', '선생님 안내'],
          sessionId: 'demo-earthquake-full-school-desk',
          startMs: 130_600,
          endMs: 159_500,
          uiElements: ['장소별 행동요령'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.94,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_03'],
          phase: 'during_shaking',
        },
        startMs: 130_600,
        teacherGuide: {
          correction:
            '장소가 달라도 “흔들릴 때는 머리 보호”가 먼저라는 원리를 연결합니다.',
          observe:
            '가정/사무실/교실처럼 장소가 바뀌어도 같은 행동을 고르는지 봅니다.',
          prompt: '학교에서는 누구의 안내를 들어야 할까요?',
          script: '교실과 사무실 장면을 통해 행동 일반화를 연습합니다.',
        },
      }),
      createSegment({
        description: '선생님 안내에 따라 움직여요.',
        endMs: 176_700,
        id: 'earthquake-full-school-evacuation',
        label: '선생님을 따라가요',
        learnerExplanation: '흔들림이 멈추면 선생님 안내에 따라 움직여요.',
        learnerPrompt: '교실 밖으로 나갈 때도 천천히 확인해요.',
        actionSteps: [
          '선생님 말을 들어요',
          '머리를 보호해요',
          '질서 있게 가요',
        ],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 혼자 뛰지 말고 안내를 따라가요.',
            id: 'alone',
            label: '혼자 뛰기',
          },
          correct: {
            feedback: '맞아요. 선생님 안내를 따라가요.',
            id: 'teacher',
            label: '선생님 안내',
          },
          kind: 'signal',
          prompt: '학교에서 멈춘 뒤 무엇을 따를까요?',
          ruleIds: ['KR_EQ_08'],
        }),
        packet: createPacket({
          asrText:
            '흔들림이 멈추면 선생님의 안내에 따라 질서를 지키며 이동하고 창문과 떨어져 이동합니다.',
          objectHints: ['교실', '복도', '선생님 안내', '창문 유리'],
          ocrTokens: ['선생님 안내', '질서', '창문 주의'],
          sessionId: 'demo-earthquake-full-school-evacuation',
          startMs: 159_500,
          endMs: 176_700,
          uiElements: ['선생님 안내에 따라 대피'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.91,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_08'],
          phase: 'evacuation_route',
        },
        startMs: 159_500,
        teacherGuide: {
          correction:
            '학생 단독 판단이 아니라 교사 안내와 질서 있는 이동으로 바꿔 말합니다.',
          observe: '혼자 뛰기보다 안내 따르기를 고르는지 봅니다.',
          prompt: '복도에서는 어느 쪽을 조심해야 할까요?',
          script: '학교 장면에서 안내, 질서, 창문과 떨어지기를 확인합니다.',
        },
      }),
      createSegment({
        description: '멈춘 뒤 부상자와 안내를 확인해요.',
        endMs: 218_000,
        id: 'earthquake-full-after-report',
        label: '멈춘 뒤 확인해요',
        learnerExplanation: '흔들림이 멈추면 다친 사람과 안내를 확인해요.',
        learnerPrompt: '멈췄다고 바로 뛰면 위험할 수 있어요.',
        actionSteps: ['다친 사람을 봐요', '119에 알려요', '공식 안내를 들어요'],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 바로 뛰지 말고 먼저 확인해요.',
            id: 'rush',
            label: '바로 뛰기',
          },
          correct: {
            feedback: '맞아요. 다친 사람과 안내를 확인해요.',
            id: 'check',
            label: '확인하기',
          },
          kind: 'signal',
          prompt: '흔들림이 멈춘 뒤 무엇을 할까요?',
          ruleIds: ['KR_EQ_12'],
        }),
        packet: createPacket({
          asrText:
            '흔들림이 멈춘 후 주변에 부상자가 있으면 119에 신고하고 라디오와 공공기관 안내에 따라 행동합니다.',
          objectHints: [
            '흔들림이 멈춤',
            '부상자 확인',
            '119 신고',
            '공공 안내',
          ],
          ocrTokens: ['119', '공공 안내', '흔들림이 멈춘 후'],
          sessionId: 'demo-earthquake-full-after-report',
          startMs: 176_900,
          endMs: 218_000,
          uiElements: ['흔들림이 멈춘 후'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.92,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_12'],
          phase: 'post_quake_report',
        },
        startMs: 176_900,
        teacherGuide: {
          correction:
            '“끝났다”가 아니라 부상자, 119, 공식 안내 확인으로 이어지게 돕습니다.',
          observe: '멈춘 뒤 행동과 흔들리는 중 행동을 구분하는지 봅니다.',
          prompt: '다친 사람이 있으면 어디에 알려야 할까요?',
          script: '흔들림 뒤 2차 피해와 신고/안내 확인을 연습합니다.',
        },
      }),
      createSegment({
        description: '문과 가스를 조심해서 확인해요.',
        endMs: 258_500,
        id: 'earthquake-full-door-gas',
        label: '문과 가스를 확인해요',
        learnerExplanation: '문을 열 때 조심하고, 가스 냄새는 어른에게 말해요.',
        learnerPrompt: '집에 돌아온 뒤에도 위험이 남아 있을 수 있어요.',
        actionSteps: [
          '문 주변을 봐요',
          '가스 냄새를 말해요',
          '안전한 곳으로 가요',
        ],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 가스가 의심되면 혼자 만지지 않아요.',
            id: 'touch-gas',
            label: '혼자 만지기',
          },
          correct: {
            feedback: '맞아요. 어른에게 말하고 안전한 곳으로 가요.',
            id: 'tell-gas',
            label: '어른에게 말하기',
          },
          kind: 'signal',
          prompt: '가스 냄새가 나면 어떻게 할까요?',
          ruleIds: ['KR_EQ_05'],
        }),
        packet: createPacket({
          asrText:
            '문을 열 때 주의하고 가스 냄새가 나거나 가스 새는 소리가 들리면 어른이나 현장 안내에 알립니다.',
          objectHints: ['문 주변 물건', '가스 냄새', '가스 밸브', '부엌'],
          ocrTokens: ['문을 열 때 주의', '가스 냄새', '가스 확인'],
          sessionId: 'demo-earthquake-full-door-gas',
          startMs: 218_000,
          endMs: 258_500,
          uiElements: ['가스 냄새가 나면'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.91,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_05'],
          phase: 'after_shaking',
        },
        startMs: 218_000,
        teacherGuide: {
          correction:
            '성인이 밸브를 만지는 장면은 학습자에게 “어른에게 말하기”로 바꿔 설명합니다.',
          observe:
            '가스 장면을 직접 조작이 아니라 도움 요청으로 이해하는지 봅니다.',
          prompt: '가스 냄새가 나면 창문과 대피는 누가 도와야 할까요?',
          script: '귀가 후 문 주변과 가스 이상을 조심해서 확인하는 장면입니다.',
        },
      }),
      createSegment({
        description: '전기 이상과 물 사용도 어른과 확인해요.',
        endMs: 307_300,
        id: 'earthquake-full-electric-final',
        label: '마지막으로 확인해요',
        learnerExplanation:
          '전기가 이상하면 어른에게 말하고 공식 안내를 기다려요.',
        learnerPrompt: '마지막으로 다시 기억해요.',
        actionSteps: [
          '전기에서 떨어져요',
          '어른에게 말해요',
          '안내를 기다려요',
        ],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 전기 이상은 혼자 만지지 않아요.',
            id: 'touch-electric',
            label: '혼자 만지기',
          },
          correct: {
            feedback: '맞아요. 어른에게 말하고 안내를 기다려요.',
            id: 'tell-electric',
            label: '어른에게 말하기',
          },
          kind: 'signal',
          prompt: '전기가 이상하면 어떻게 할까요?',
          ruleIds: ['KR_EQ_05', 'KR_EQ_12'],
        }),
        packet: createPacket({
          asrText:
            '전기에 이상이 있으면 직접 만지지 말고 어른에게 말하고, 여진이 있을 수 있으니 지역 방송과 공식 안내를 확인합니다.',
          objectHints: [
            '전기 이상',
            '차단기',
            '수도관',
            '지역 방송',
            '여진 대비',
          ],
          ocrTokens: ['전기 이상', '수도관', '여진', '지역 방송'],
          sessionId: 'demo-earthquake-full-electric-final',
          startMs: 258_500,
          endMs: 307_300,
          uiElements: ['사전 대비와 훈련'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.91,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_05', 'KR_EQ_12'],
          phase: 'after_shaking',
        },
        startMs: 258_500,
        teacherGuide: {
          correction:
            '전기와 수도 장면도 학습자에게는 직접 조작보다 어른에게 알리기로 제한합니다.',
          observe:
            '마지막 장면에서 안내 기다리기와 재확인을 기억하는지 봅니다.',
          prompt: '지진 뒤에도 또 흔들릴 수 있다는 말을 이해했나요?',
          script:
            '전기 이상, 물 사용, 여진 대비를 마지막 정리 장면으로 확인합니다.',
        },
      }),
    ],
    title: '지진이 났을 때',
    videoSrc: '/demo-video/earthquake-full-practice-001.mp4',
  },
  {
    accentClassName: 'bg-orange-400',
    id: 'fire-visual-flow',
    note: '소리 없이 표지와 행동을 보는 보조 연습이에요',
    posterSrc: '/demo/fire-visual-02.jpg',
    practiceSequence: false,
    showOnHome: false,
    segments: [
      createSegment({
        description: '소리가 없어도 문을 닫고 나가요.',
        endMs: 8_000,
        id: 'fire-visual-door-control',
        label: '문을 닫고 나가요',
        learnerExplanation: '소리가 없어도 문과 계단을 볼 수 있어요.',
        learnerPrompt: '소리가 없어도 장면을 보고 연습해요.',
        actionSteps: ['문을 닫아요', '계단 방향을 봐요'],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 문과 계단을 다시 봐요.',
            id: 'wait-audio',
            label: '색깔만 보기',
          },
          correct: {
            feedback: '맞아요. 문과 계단 방향을 보고 연습할 수 있어요.',
            id: 'visual-exit',
            label: '문과 계단 방향',
          },
          kind: 'signal',
          prompt: '소리가 없어도 무엇을 먼저 볼까요?',
          ruleIds: ['KR_FIRE_04'],
        }),
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
        learnerExplanation: '비상구 표지를 보고 계단을 찾아요.',
        learnerPrompt: '표지와 움직임을 보고 계단을 찾아요.',
        actionSteps: ['비상구 표지를 봐요', '계단을 찾아요'],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 이 장면에서는 비상구 표시를 다시 봐요.',
            id: 'elevator-sign',
            label: '엘리베이터 버튼',
          },
          correct: {
            feedback: '맞아요. 비상구와 계단 표시를 찾아요.',
            id: 'exit-sign',
            label: '비상구 표시',
          },
          kind: 'signal',
          prompt: '대피하려면 어떤 표시를 찾을까요?',
          ruleIds: ['KR_FIRE_03'],
        }),
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
        description: '못 나가면 대피공간으로 가요.',
        endMs: 24_023,
        id: 'fire-visual-refuge',
        label: '대피공간으로 가요',
        learnerExplanation: '길이 막히면 대피공간에서 도움을 불러요.',
        learnerPrompt: '길이 막혔을 때 대피공간을 찾아요.',
        actionSteps: ['대피공간을 찾아요', '도움을 요청해요'],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 이 장면에서는 안전한 곳 찾기를 다시 봐요.',
            id: 'visual-force',
            label: '막힌 길',
          },
          correct: {
            feedback: '맞아요. 무리하지 않고 대피공간에서 도움을 불러요.',
            id: 'visual-refuge',
            label: '대피공간',
          },
          kind: 'place',
          prompt: '길이 막히면 어디를 찾을까요?',
          ruleIds: ['KR_FIRE_05'],
        }),
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
    title: '보조 연습: 소리 없이 보기',
    videoSrc: '/demo-video/fire-stair-no-audio-001.mp4',
  },
  {
    accentClassName: 'bg-teal-400',
    id: 'earthquake-after-flow',
    note: '2단계: 흔들림이 멈춘 뒤 어른과 함께 확인해요',
    posterSrc: '/demo/earthquake-after-02.jpg',
    practiceSequence: false,
    showOnHome: false,
    segments: [
      createSegment({
        description: '나갈 길에 물건이 있는지 봐요.',
        endMs: 7_200,
        id: 'earthquake-after-exit',
        label: '나갈 길을 봐요',
        learnerExplanation: '나갈 길을 먼저 봐요.',
        learnerPrompt: '흔들림이 멈췄어요. 천천히 확인해요.',
        actionSteps: ['천천히 일어나요', '나갈 길을 봐요', '어른과 움직여요'],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 나갈 길을 다시 봐요.',
            id: 'run-fast',
            label: '좋아하는 물건',
          },
          correct: {
            feedback: '맞아요. 나갈 길과 주변을 확인해요.',
            id: 'check-exit',
            label: '나갈 길',
          },
          kind: 'object',
          prompt: '흔들림이 멈춘 뒤 무엇을 먼저 볼까요?',
          ruleIds: ['KR_EQ_05'],
        }),
        packet: createPacket({
          asrText:
            '흔들림이 멈추면 당황하지 말고 문과 주변 물건을 확인하며 출구를 확보합니다.',
          objectHints: ['출입문', '문 주변 물건', '출구 확보', '실내 이동'],
          ocrTokens: ['출구 확보', '주의'],
          sessionId: 'demo-earthquake-after-exit',
          startMs: 0,
          endMs: 7_200,
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
        description: '가스 냄새는 어른에게 말해요.',
        endMs: 24_500,
        id: 'earthquake-after-gas',
        label: '가스 냄새를 알려요',
        learnerExplanation: '가스 냄새가 나면 어른에게 말해요.',
        learnerPrompt: '이상한 냄새가 나면 혼자 만지지 않아요.',
        actionSteps: ['냄새 나는 곳에서 멀어져요', '어른에게 말해요'],
        teachBack: createTeachBack({
          contrast: {
            feedback:
              '괜찮아요. 혼자 만지지 말고 어른에게 말하는 장면을 다시 봐요.',
            id: 'touch-gas',
            label: '혼자 만지기',
          },
          correct: {
            feedback: '맞아요. 어른에게 말하고 안전한 곳으로 가요.',
            id: 'tell-adult',
            label: '어른에게 말하기',
          },
          kind: 'person',
          prompt: '가스 냄새가 나면 어떻게 할까요?',
          ruleIds: ['KR_EQ_05'],
        }),
        packet: createPacket({
          asrText:
            '가스 냄새가 나거나 가스 새는 소리가 들리면 직접 만지지 말고 어른에게 알린 뒤 안전한 곳으로 이동합니다.',
          objectHints: ['가스 밸브', '주방', '창문', '대피'],
          ocrTokens: ['가스', '냄새', '대피'],
          sessionId: 'demo-earthquake-after-gas',
          startMs: 7_200,
          endMs: 24_500,
          uiElements: ['가스가 샐 경우'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.94,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_05'],
          phase: 'after_shaking',
        },
        startMs: 7_200,
        teacherGuide: {
          correction:
            '가스/전기는 혼자 조작하지 않고 어른에게 알리는 쪽으로 안내합니다.',
          observe: '위험 단서를 발견했을 때 도움 요청을 선택하는지 확인합니다.',
          prompt: '가스 냄새가 나면 혼자 고쳐도 될까요?',
          script: '위험한 냄새나 전기 문제는 어른에게 알리는 연습입니다.',
        },
      }),
      createSegment({
        description: '전기 이상은 어른에게 알려요.',
        endMs: 30_030,
        id: 'earthquake-after-report',
        label: '전기 이상을 알려요',
        learnerExplanation: '전기 이상은 어른에게 말해요.',
        learnerPrompt: '전등이 꺼지거나 전기가 이상해요.',
        actionSteps: ['전기 스위치에서 떨어져요', '어른에게 말해요'],
        teachBack: createTeachBack({
          contrast: {
            feedback:
              '괜찮아요. 혼자 만지지 말고 어른에게 말하는 장면을 다시 봐요.',
            id: 'hide-alone',
            label: '혼자 만지기',
          },
          correct: {
            feedback: '맞아요. 전기 이상은 어른에게 알려요.',
            id: 'call-help',
            label: '어른에게 말하기',
          },
          kind: 'person',
          prompt: '전기가 이상하면 어떻게 할까요?',
          ruleIds: ['KR_EQ_05'],
        }),
        packet: createPacket({
          asrText:
            '흔들림이 멈춘 뒤 전깃불과 출구 안전을 어른과 함께 확인합니다. 이상하면 전문가의 확인을 받습니다.',
          objectHints: [
            '전기 차단기',
            '전깃불',
            '정전',
            '출구 확보',
            '실내 안전 확인',
          ],
          ocrTokens: ['전기', '전깃불', '출구 확보', '안전 확인', '주의'],
          sessionId: 'demo-earthquake-after-report',
          startMs: 24_500,
          endMs: 30_030,
          uiElements: ['대피 후 행동요령'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.92,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_05'],
          phase: 'after_shaking',
        },
        startMs: 24_500,
        teacherGuide: {
          correction:
            '전기나 가스 설비를 학습자가 직접 조작하지 않도록 어른에게 알리는 문장으로 교정합니다.',
          observe:
            '전기 이상을 혼자 만지지 않고 도움 요청으로 연결하는지 봅니다.',
          prompt: '전기가 이상하면 혼자 만져도 될까요?',
          script:
            '흔들림 뒤 전기 이상을 발견했을 때 어른에게 알리는 연습입니다.',
        },
      }),
    ],
    title: '지진이 났을 때: 멈춘 뒤',
    videoSrc: '/demo-video/earthquake-after-shaking-001.mp4',
  },
]

export const homeLearningScenarios = learningScenarios.filter(
  (scenario) => scenario.showOnHome !== false,
)

export const practiceSequenceScenarios = learningScenarios.filter(
  (scenario) => scenario.practiceSequence !== false,
)

export const theaterShows = learningScenarios

function createSegment(seed: SegmentSeed): TheaterSegment {
  const practiceMode = seed.practiceMode ?? 'action'
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
  const teacherGuide = seed.teacherGuide ?? {
    correction:
      '오답이 나오면 장면을 다시 보고 공식 행동요령을 한 문장으로 반복합니다.',
    observe:
      '학습자가 첫 행동을 고르고, 다시 보기와 다음 장면을 사용할 수 있는지 확인합니다.',
    prompt: seed.teachBack.prompt,
    script:
      safetyView.explanation.tracks.caregiver ??
      '장면을 짧게 멈추고 쉬운말과 행동 카드를 함께 확인합니다.',
  }
  const structuredExplanation = buildStructuredLearningExplanation({
    decisionPoint: seed.teachBack.prompt,
    evidence: seed.packet,
    explanation: safetyView.explanation,
    learnerActionSteps: seed.actionSteps,
    ruleMatches,
    rules: seed.rules,
    segment,
    sourceChunks: officialChunkCatalog,
    sourceId: seed.packet.sessionId,
    teachBack: seed.teachBack,
    teacherGuide: {
      correctionHint: teacherGuide.correction,
      script: teacherGuide.script,
    },
  })
  const teachBack = structuredExplanation.tracks.teachBack ?? null
  const actionSteps =
    practiceMode === 'intro'
      ? []
      : (seed.actionSteps ?? [
          safetyView.explanation.tracks.action ??
            safetyView.explanation.tracks.easy,
        ])

  return {
    actionSteps,
    answerOptions:
      practiceMode === 'intro' || !teachBack
        ? []
        : toPracticeAnswerOptions(teachBack),
    checkQuestion:
      practiceMode === 'intro'
        ? ''
        : (teachBack?.prompt ?? '먼저 무엇을 할까요?'),
    description: seed.description,
    endMs: seed.endMs,
    explanation: safetyView.explanation,
    id: seed.id,
    label: seed.label,
    learnerExplanation: seed.learnerExplanation ?? seed.description,
    learnerPrompt: seed.learnerPrompt ?? seed.description,
    narration: seed.narration ?? [
      {
        endMs: seed.endMs,
        source: seed.packet.asrText.trim() ? 'audio' : 'onscreen',
        startMs: seed.startMs,
        text: seed.packet.asrText || seed.description,
      },
    ],
    packet: seed.packet,
    practiceMode,
    primarySourceTitle: ruleMatches[0]?.rule.source_title ?? null,
    ruleMatches,
    safetyWarnings: safetyView.warnings,
    safetyNotice: defaultSafetyNotice,
    segment,
    startMs: seed.startMs,
    structuredExplanation,
    teachBack,
    teacherGuide,
  }
}

function createTeachBack(input: {
  contrast: {
    feedback: string
    id: string
    label: string
  }
  correct: {
    feedback: string
    id: string
    label: string
  }
  kind: LearningTeachBackOptionKind
  prompt: string
  ruleIds: string[]
}): LearningTeachBack {
  return {
    correctOptionId: input.correct.id,
    options: [
      {
        evidenceRefs: input.ruleIds.map((ruleId) => `rule:${ruleId}`),
        feedback: input.correct.feedback,
        id: input.correct.id,
        kind: input.kind,
        label: input.correct.label,
        officialRuleIds: input.ruleIds,
        role: 'correct',
      },
      {
        evidenceRefs: [`contrast:${input.contrast.id}`],
        feedback: ensureContrastFeedback(input.contrast.feedback),
        id: input.contrast.id,
        kind: input.kind,
        label: input.contrast.label,
        role: 'contrast',
      },
    ],
    prompt: input.prompt,
    reviewPrompt:
      '헷갈리면 이 장면을 다시 보고, 선생님이나 보호자와 같이 골라요.',
  }
}

function ensureContrastFeedback(feedback: string) {
  return feedback.includes('다시 봐요') ? feedback : `${feedback} 다시 봐요.`
}

function toPracticeAnswerOptions(
  teachBack: LearningTeachBack,
): PracticeAnswerOption[] {
  return teachBack.options.map((option) => ({
    ...option,
    correct: option.id === teachBack.correctOptionId,
  }))
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
