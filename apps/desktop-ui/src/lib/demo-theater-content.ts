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
  seasonalRuleCatalog,
} from './rule-catalog'
import { simplifyLearnerCopy, simplifyTeachBack } from './learner-copy'

export type TheaterSegment = {
  actionReasons: string[]
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
  learnerSequence: LearnerSequenceStep[]
  narration: TimedNarrationCue[]
  packet: PerceptionPacket
  pauseMs?: number
  previewMs?: number
  practiceMode: SegmentPracticeMode
  primarySourceTitle: string | null
  requiredLearnerKeywords: string[]
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

export type LearnerSequenceStepKind = 'action' | 'situation'

export type LearnerSequenceStep = {
  kind: LearnerSequenceStepKind
  text: string
}

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
  generatedArtifactManifest?: {
    provider?: 'cloudflare-r2' | 'render-local'
    qualityVersion?: string
    scenarioJsonUrl?: string
    sourceVideoUrl?: string
  }
  generatedSourceTitle?: string
  generatedSourceUrl?: string
  generatedThumbnailUrl?: string
  generatedTopicLabel?: string
  generationEvidenceReport?: {
    issues?: Array<{ code?: string; message?: string; severity?: string }>
    passed?: boolean
    warnings?: string[]
  }
  generationPipelineTrace?: {
    agentRuns?: unknown[]
    attempts?: number
    pipelineVersion?: string
  }
  generationQualityReport?: {
    groundingPassed?: boolean
    issues?: Array<{ code?: string; message?: string; severity?: string }>
    passed?: boolean
    repairAttemptCount?: number
    sourceCoveragePassed?: boolean
    uiPlaybackPassed?: boolean
  }
  homeNote?: string
  homeTitle?: string
  id: string
  localOnly?: boolean
  note: string
  posterSrc: string
  practiceSequence?: boolean
  segments: TheaterSegment[]
  showOnHome?: boolean
  title: string
  videoPlaybackKind?: 'file' | 'youtube'
  videoSrc: string
  youtubeVideoId?: string
}

type SegmentSeed = {
  actionReasons?: string[]
  actionSteps?: string[]
  description: string
  endMs: number
  id: string
  label: string
  learnerExplanation?: string
  learnerPrompt?: string
  learnerSequence?: Array<string | LearnerSequenceStep>
  narration?: TimedNarrationCue[]
  packet: PerceptionPacket
  pauseMs?: number
  previewMs?: number
  practiceMode?: SegmentPracticeMode
  requiredLearnerKeywords?: string[]
  rules: RuleRecord[]
  segmentOverrides?: Partial<Segment>
  startMs: number
  teachBack: LearningTeachBack
  teacherGuide?: TheaterSegment['teacherGuide']
}

const defaultSafetyNotice =
  '이 앱은 연습용입니다. 실제로 위험할 때는 119·112, 주변 어른, 현장 안내를 우선 따르세요.'

export const learningScenarios: TheaterShow[] = [
  {
    accentClassName: 'bg-rose-400',
    id: 'fire-grounded-flow',
    note: '문을 닫고, 계단을 찾고, 막히면 도움을 불러요',
    posterSrc: '/demo/fire-grounded-02.jpg',
    segments: [
      createSegment({
        description: '아파트 화재 연습을 시작해요.',
        endMs: 11_500,
        id: 'fire-full-alert',
        label: '화재 연습을 시작해요',
        learnerExplanation: '아파트 화재 연습을 시작해요.',
        learnerPrompt: '숫자와 제목을 보고 있어요.',
        learnerSequence: [
          '아파트에서 불이 날 수 있어요.',
          '나갈 때 다칠 수 있어요.',
          '이제 행동을 연습해요.',
        ],
        actionSteps: [],
        narration: [
          {
            endMs: 11_500,
            source: 'audio',
            startMs: 0,
            text: '매년 약 2,800건이 발생하는 아파트 화재. 사상자의 약 40%는 대피 중 발생했습니다. 아파트에 화재가 발생했을 때 다음과 같이 행동합시다.',
          },
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
            endMs: 11_500,
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
            feedback: '맞아요. 화재 연습이 시작되는 장면이에요.',
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
          endMs: 11_500,
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
        endMs: 22_500,
        id: 'fire-full-door-control',
        label: '문 닫고 계단으로 가요',
        learnerExplanation: '현관문을 닫고 계단으로 나가요.',
        learnerPrompt: '우리 집에서 불이 났어요.',
        actionSteps: ['현관문을 닫아요', '계단으로 나가요'],
        requiredLearnerKeywords: ['현관문', '계단'],
        narration: [
          {
            endMs: 22_500,
            source: 'audio',
            startMs: 11_500,
            text: '우리 집 화재로 대피할 때는 연기와 화염을 차단하기 위해 반드시 현관문을 닫고 계단을 이용해 외부로 빠져나와야 합니다.',
          },
          {
            endMs: 22_500,
            source: 'onscreen',
            startMs: 11_500,
            text: '우리 집 화재 시 현관문 닫고 계단으로 대피',
          },
        ],
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
          startMs: 11_500,
          endMs: 22_500,
          uiElements: ['우리 집 화재 시', '계단으로 대피'],
        }),
        rules: fireRuleCatalog,
        segmentOverrides: {
          confidence: 0.94,
          hazard: 'fire',
          officialRuleIds: ['KR_FIRE_04', 'KR_FIRE_03'],
          phase: 'door_control',
        },
        startMs: 11_500,
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
        endMs: 27_500,
        id: 'fire-full-stairs',
        label: '계단으로 나가요',
        learnerExplanation: '불이 났을 때 엘리베이터는 타지 않아요.',
        learnerPrompt: '계단과 엘리베이터가 보여요.',
        actionSteps: ['계단을 찾아요', '천천히 내려가요'],
        requiredLearnerKeywords: ['엘리베이터', '계단'],
        narration: [
          {
            endMs: 27_500,
            source: 'audio',
            startMs: 22_500,
            text: '이때 엘리베이터는 이용하면 안 됩니다.',
          },
          {
            endMs: 27_500,
            source: 'onscreen',
            startMs: 22_500,
            text: '대피 시 엘리베이터는 절대 이용 금지',
          },
        ],
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
          startMs: 22_500,
          endMs: 27_500,
          uiElements: ['엘리베이터 이용 금지'],
        }),
        rules: fireRuleCatalog,
        segmentOverrides: {
          confidence: 0.94,
          hazard: 'fire',
          officialRuleIds: ['KR_FIRE_03'],
          phase: 'stair_evacuation',
        },
        startMs: 22_500,
        teacherGuide: {
          correction: '엘리베이터 대신 계단을 선택하도록 짧게 반복합니다.',
          observe: '계단과 엘리베이터 선택을 구분하는지 봅니다.',
          prompt: '불이 났을 때 엘리베이터를 타면 왜 위험할까요?',
          script: '계단 대피와 엘리베이터 금지를 하나의 장면으로 연습합니다.',
        },
      }),
      createSegment({
        description: '못 나가면 대피공간으로 가요.',
        endMs: 35_500,
        id: 'fire-full-refuge',
        label: '대피공간으로 가요',
        learnerExplanation: '길이 막히면 대피공간에서 도움을 불러요.',
        learnerPrompt: '연기가 많아서 밖으로 나가기 어려워요.',
        actionSteps: [
          '대피공간으로 가요',
          '문을 닫아요',
          '대피공간 위치를 119나 어른에게 알려요',
        ],
        requiredLearnerKeywords: ['연기', '대피공간', '119'],
        narration: [
          {
            endMs: 30_000,
            source: 'onscreen',
            startMs: 27_500,
            text: '대피가 어렵다면 집 안 대피공간으로 이동',
          },
          {
            endMs: 35_500,
            source: 'audio',
            startMs: 30_000,
            text: '연기나 화염으로 대피가 어렵다면 집 안의 대피공간에서 자신의 위치를 알리고 구조를 기다립니다.',
          },
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
          startMs: 27_500,
          endMs: 35_500,
          uiElements: ['대피가 어렵다면'],
        }),
        rules: fireRuleCatalog,
        segmentOverrides: {
          confidence: 0.9,
          hazard: 'fire',
          officialRuleIds: ['KR_FIRE_05'],
          phase: 'refuge_space',
        },
        startMs: 27_500,
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
        endMs: 43_500,
        id: 'fire-full-seal-room',
        label: '문틈을 막고 알려요',
        learnerExplanation: '방문을 닫고 문틈을 막아 119에 알려요.',
        learnerPrompt: '연기가 들어와서 바로 나가기 어려워요.',
        actionSteps: [
          '방문을 닫아요',
          '젖은 수건으로 문틈을 막아요',
          '방 안 위치를 119에 알려요',
        ],
        requiredLearnerKeywords: ['방문', '젖은 수건', '문틈', '119'],
        narration: [
          {
            endMs: 43_500,
            source: 'audio',
            startMs: 35_500,
            text: '대피공간이 없다면 방문을 닫고 젖은 수건 등으로 틈새를 차단한 뒤 구조를 요청합니다.',
          },
          {
            endMs: 43_500,
            source: 'onscreen',
            startMs: 35_500,
            text: '방문 틈새 차단 후 구조 요청',
          },
        ],
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
          startMs: 35_500,
          endMs: 43_500,
          uiElements: ['방문 틈새 차단 후 구조 요청'],
        }),
        rules: fireRuleCatalog,
        segmentOverrides: {
          confidence: 0.92,
          hazard: 'fire',
          officialRuleIds: ['KR_FIRE_06'],
          phase: 'seal_room',
        },
        startMs: 35_500,
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
        description: '다른 집 불이면 안내를 들어요.',
        endMs: 53_000,
        id: 'fire-full-after-evacuation',
        label: '집 안에서 안내를 들어요',
        learnerExplanation: '연기가 안 들어오면 집 안에서 안내를 들어요.',
        learnerPrompt: '다른 집에 불이 났지만 우리 집은 괜찮아 보여요.',
        actionSteps: [
          '창문을 닫아요',
          '집 안에서 기다려요',
          '안내 방송을 들어요',
        ],
        requiredLearnerKeywords: ['다른 집', '창문', '집 안', '안내 방송'],
        narration: [
          {
            endMs: 53_000,
            source: 'audio',
            startMs: 43_500,
            text: '다른 집에 불이 났지만 화염이나 연기가 우리 집으로 들어오지 않는다면 창문은 닫고 집 안에서 안내 방송에 따라 행동합니다.',
          },
          {
            endMs: 53_000,
            source: 'onscreen',
            startMs: 43_500,
            text: '다른 집 화재 시 직접적인 영향이 없다면 창문을 닫고 집 안에서 대기하며 화재 상황 주시',
          },
        ],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 바로 복도나 계단으로 나가지 않아요.',
            id: 'go-hallway',
            label: '복도로 나가기',
          },
          correct: {
            feedback: '맞아요. 창문을 닫고 안내 방송을 들어요.',
            id: 'listen-inside',
            label: '안내 방송 듣기',
          },
          kind: 'signal',
          prompt: '연기가 들어오지 않으면 무엇을 할까요?',
          ruleIds: ['KR_FIRE_11'],
        }),
        packet: createPacket({
          asrText:
            '다른 집에 불이 났지만 화염이나 연기가 우리 집으로 들어오지 않는다면 창문은 닫고 집 안에서 안내 방송에 따라 행동합니다.',
          objectHints: [
            '다른 집 화재',
            '연기 유입 없음',
            '창문 닫기',
            '집 안 대기',
            '안내 방송',
          ],
          ocrTokens: ['다른 집 화재', '창문 닫기', '집 안 대기', '안내 방송'],
          sessionId: 'demo-fire-full-after-evacuation',
          startMs: 43_500,
          endMs: 53_000,
          uiElements: ['다른 집 화재 시', '집 안에서 대기'],
        }),
        rules: fireRuleCatalog,
        segmentOverrides: {
          confidence: 0.9,
          hazard: 'fire',
          officialRuleIds: ['KR_FIRE_11'],
          phase: 'apartment_monitoring',
        },
        startMs: 43_500,
        teacherGuide: {
          correction:
            '무조건 대피가 아니라, 연기와 불길이 들어오지 않는 상황에서는 창문을 닫고 안내를 따른다고 정리합니다.',
          observe:
            '학습자가 “다른 집 화재”와 “우리 집에 연기 유입 없음” 조건을 구분하는지 봅니다.',
          prompt: '우리 집에 연기가 들어오지 않으면 바로 계단으로 나갈까요?',
          script:
            '다른 세대 화재에서 직접 영향이 없을 때는 실내 대기와 안내 방송 확인을 연습합니다.',
        },
      }),
      createSegment({
        description: '상황별 행동을 다시 기억해요.',
        endMs: 60_000,
        id: 'fire-full-summary',
        label: '마지막 정리',
        learnerExplanation: '무조건 나가기보다 상황에 맞게 행동해요.',
        learnerPrompt: '마지막으로 전체 행동을 다시 말해요.',
        actionSteps: [],
        narration: [
          {
            endMs: 59_000,
            source: 'audio',
            startMs: 53_000,
            text: '아파트 화재. 무조건 대피보다 상황별 올바른 대처가 중요합니다.',
          },
          {
            endMs: 60_000,
            source: 'onscreen',
            startMs: 53_000,
            text: '아파트 화재, 상황별 대피 요령을 꼭 기억하세요.',
          },
        ],
        practiceMode: 'intro',
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 이 장면은 마지막 정리예요.',
            id: 'new-action',
            label: '새 행동 고르기',
          },
          correct: {
            feedback: '맞아요. 오늘 배운 행동을 다시 기억하는 장면이에요.',
            id: 'review',
            label: '다시 기억하기',
          },
          kind: 'signal',
          prompt: '마지막 장면은 무엇을 할까요?',
          ruleIds: ['KR_FIRE_11'],
        }),
        packet: createPacket({
          asrText:
            '아파트 화재. 무조건 대피보다 상황별 올바른 대처가 중요합니다. 아파트 화재, 상황별 대피 요령을 꼭 기억하세요.',
          objectHints: ['아파트 화재 정리', '상황별 대피 요령', '마무리 화면'],
          ocrTokens: ['상황별 대피 요령', '기억하세요'],
          sessionId: 'demo-fire-full-summary',
          startMs: 53_000,
          endMs: 60_000,
          uiElements: ['상황별 대피 요령을 꼭 기억하세요'],
        }),
        rules: fireRuleCatalog,
        segmentOverrides: {
          confidence: 0.9,
          hazard: 'fire',
          officialRuleIds: ['KR_FIRE_11'],
          phase: 'apartment_monitoring',
        },
        startMs: 53_000,
        teacherGuide: {
          correction:
            '정리 장면에서는 새 행동을 추가하지 않고 오늘 배운 조건별 행동을 다시 떠올리게 합니다.',
          observe:
            '학습자가 “무조건 대피”가 아니라 상황별 행동이라는 핵심을 말할 수 있는지 봅니다.',
          prompt: '오늘 영상은 왜 무조건 나가라고만 하지 않았을까요?',
          script:
            '마지막 문장은 아파트 화재에서 상황별 대피 요령을 기억하라는 정리입니다.',
        },
      }),
    ],
    title: '화재가 났을 때',
    videoSrc: '/demo-video/fire-full-practice-001.mp4',
  },
  {
    accentClassName: 'bg-sky-400',
    id: 'earthquake-protect-flow',
    homeNote: '흔들릴 때, 밖으로 나갈 때, 집에 돌아온 뒤까지 이어서 연습해요',
    homeTitle: '지진이 났을 때',
    note: '머리를 지키고, 멈춘 뒤에는 어른과 주변을 봐요',
    posterSrc: '/demo/earthquake-review-02.jpg',
    segments: [
      createSegment({
        description: '지진 연습을 시작해요.',
        endMs: 35_760,
        id: 'earthquake-full-opening',
        label: '지진 연습을 시작해요',
        learnerExplanation: '지진 때 어떻게 할지 배워요.',
        learnerPrompt: '지진은 갑자기 올 수 있어요.',
        learnerSequence: [
          '지진은 갑자기 올 수 있어요.',
          '미리 연습하면 덜 다쳐요.',
          '다음 장면부터 따라 해요.',
        ],
        actionSteps: [],
        narration: [
          {
            endMs: 9_080,
            source: 'audio',
            startMs: 0,
            text: '언제 어디서 얼마나 강하게 발생할지 모르는 재난, 지진.',
          },
          {
            endMs: 18_040,
            source: 'audio',
            startMs: 9_080,
            text: '우리나라도 더 이상 지진의 안전지대가 아니고 특히 지진은 사전 예보가 불가능한 재난입니다.',
          },
          {
            endMs: 27_120,
            source: 'audio',
            startMs: 18_040,
            text: '따라서 평상시 지진 대처 요령을 숙지하고 만약 지진이 발생하면 올바르게 대응하는 것이 무엇보다 중요합니다.',
          },
          {
            endMs: 35_760,
            source: 'audio',
            startMs: 27_120,
            text: '지진의 위협으로부터 나와 내 가족의 안전을 지킬 수 있는 안전수칙, 지금부터 알아봅니다.',
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
            feedback: '맞아요. 지진 연습을 시작하는 장면이에요.',
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
          endMs: 35_760,
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
        endMs: 54_880,
        id: 'earthquake-full-table-protect',
        label: '탁자 아래로 들어가요',
        learnerExplanation: '탁자 아래에서 다리를 꼭 잡아요.',
        learnerPrompt: '흔들림은 1~2분쯤 이어져요.',
        actionSteps: ['몸을 낮춰요', '탁자 아래로 가요', '탁자 다리를 잡아요'],
        requiredLearnerKeywords: ['1~2분', '탁자', '탁자 다리'],
        narration: [
          {
            endMs: 48_000,
            source: 'audio',
            startMs: 35_760,
            text: '지진으로 크게 흔들리는 시간은 길어야 1, 2분 정도입니다.',
          },
          {
            endMs: 54_880,
            source: 'audio',
            startMs: 48_000,
            text: '중심이 낮고 튼튼한 탁자 아래로 들어가 탁자 다리를 꼭 잡고 몸을 보호합니다.',
          },
        ],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 흔들릴 때는 먼저 몸을 낮춰요.',
            id: 'run-out',
            label: '밖으로 뛰기',
          },
          correct: {
            feedback: '맞아요. 탁자 아래에서 다리를 잡아요.',
            id: 'under-table',
            label: '탁자 아래',
          },
          kind: 'place',
          prompt: '흔들릴 때 어디로 갈까요?',
          ruleIds: ['KR_EQ_03'],
        }),
        packet: createPacket({
          asrText:
            '지진으로 흔들리는 시간은 보통 짧습니다. 튼튼한 탁자 아래로 들어가 탁자 다리를 잡고 몸을 보호합니다.',
          objectHints: ['탁자', '탁자 다리', '실내 흔들림'],
          ocrTokens: ['탁자 아래', '탁자 다리', '몸 보호'],
          sessionId: 'demo-earthquake-full-table-protect',
          startMs: 35_760,
          endMs: 54_880,
          uiElements: ['튼튼한 탁자 아래로 피하기'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.94,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_03'],
          phase: 'during_shaking',
        },
        startMs: 35_760,
        teacherGuide: {
          correction: '뛰어나가기보다 머리 보호와 기다리기를 먼저 말해 줍니다.',
          observe:
            '몸 낮추기, 탁자 아래, 머리 보호를 순서대로 기억하는지 확인합니다.',
          prompt: '탁자가 없으면 무엇으로 머리를 보호할 수 있을까요?',
          script: '흔들리는 동안 떨어지는 물건에서 머리를 보호하는 연습입니다.',
        },
      }),
      createSegment({
        description: '탁자가 없으면 방석으로 머리를 가려요.',
        endMs: 66_200,
        id: 'earthquake-full-cushion-glass',
        label: '방석으로 머리를 가려요',
        learnerExplanation: '방석으로 머리를 가리고 유리에 등을 돌려요.',
        learnerPrompt: '탁자가 없을 수 있어요.',
        actionSteps: ['방석을 들어요', '머리를 가려요', '유리에 등을 돌려요'],
        requiredLearnerKeywords: ['탁자', '방석', '유리'],
        narration: [
          {
            endMs: 60_680,
            source: 'audio',
            startMs: 54_880,
            text: '탁자 아래와 같은 피할 곳이 없을 때는 방석 등으로 머리를 보호합니다.',
          },
          {
            endMs: 66_200,
            source: 'audio',
            startMs: 60_680,
            text: '유리 파편이 날아올 우려가 있을 경우 물건을 등지고 돌아섭니다.',
          },
        ],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 유리 쪽으로 얼굴을 돌리지 않아요.',
            id: 'face-glass',
            label: '유리 쪽',
          },
          correct: {
            feedback: '맞아요. 탁자가 없으면 방석으로 머리를 가려요.',
            id: 'cushion',
            label: '방석',
          },
          kind: 'object',
          prompt: '탁자가 없으면 무엇으로 머리를 가릴까요?',
          ruleIds: ['KR_EQ_04'],
        }),
        packet: createPacket({
          asrText:
            '탁자 아래와 같은 피할 곳이 없으면 방석 등으로 머리를 보호합니다. 유리 조각이 날아올 수 있으면 물건을 등지고 돌아섭니다.',
          objectHints: ['방석', '머리 보호', '유리 파편', '등지고 돌아서기'],
          ocrTokens: ['방석', '머리 보호', '유리 파편'],
          sessionId: 'demo-earthquake-full-cushion-glass',
          startMs: 54_880,
          endMs: 66_200,
          uiElements: ['방석 등으로 머리 보호'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.93,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_04'],
          phase: 'during_shaking',
        },
        startMs: 54_880,
        teacherGuide: {
          correction:
            '탁자가 없을 때는 방석, 가방처럼 가까운 물건으로 머리를 가린다고 알려 줍니다.',
          observe: '학습자가 “탁자 없을 때 대체 행동”을 말할 수 있는지 봅니다.',
          prompt: '탁자가 없으면 무엇으로 머리를 가릴까요?',
          script:
            '탁자 아래로 갈 수 없을 때 방석 등으로 머리를 보호하고 유리에서 돌아서는 장면입니다.',
        },
      }),
      createSegment({
        description: '가스와 전기는 어른에게 말해요.',
        endMs: 74_920,
        id: 'earthquake-full-gas-electric',
        label: '가스와 전기는 어른에게 말해요',
        learnerExplanation: '가스 중간 밸브와 전기 고장은 어른에게 말해요.',
        learnerPrompt: '흔들림이 멈추면 가스와 전기를 봐요.',
        actionSteps: [
          '가스 냄새를 어른에게 말해요',
          '가스 중간 밸브가 보이면 어른에게 말해요',
          '전기 고장이 보이면 어른에게 말해요',
        ],
        requiredLearnerKeywords: [
          '가스 냄새',
          '가스 중간 밸브',
          '전기 고장',
          '어른',
        ],
        narration: [
          {
            endMs: 74_920,
            source: 'audio',
            startMs: 66_200,
            text: '흔들림이 멈춘 후에는 당황하지 말고 화재에 대비해 가스 중간 밸브를 잠그고 전기 차단기를 내립니다.',
          },
        ],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 가스와 전기는 혼자 만지지 않아요.',
            id: 'touch-alone',
            label: '혼자 만지기',
          },
          correct: {
            feedback: '맞아요. 가스 냄새는 어른에게 말해요.',
            id: 'tell-adult',
            label: '어른',
          },
          kind: 'person',
          prompt: '가스 냄새가 나면 누구에게 말할까요?',
          ruleIds: ['KR_EQ_05'],
        }),
        packet: createPacket({
          asrText:
            '흔들림이 멈춘 후에는 가스 중간 밸브와 전기 차단기를 살핍니다. 학습자는 가스 냄새나 전기 고장을 어른에게 말합니다.',
          objectHints: ['가스 밸브', '전기 차단기', '부엌', '가스 냄새'],
          ocrTokens: ['가스 중간 밸브', '전기 차단기'],
          sessionId: 'demo-earthquake-full-gas-electric',
          startMs: 66_200,
          endMs: 74_920,
          uiElements: ['가스 중간 밸브', '전기 차단기'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.92,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_05'],
          phase: 'after_shaking',
        },
        startMs: 66_200,
        teacherGuide: {
          correction:
            '영상은 성인 조작 장면을 포함하지만, 학습자에게는 “어른에게 말하기”로 바꿔 줍니다.',
          observe: '가스와 전기를 직접 만지지 않고 도움으로 연결하는지 봅니다.',
          prompt: '가스 냄새가 나면 혼자 만져도 될까요?',
          script:
            '흔들림 뒤 설비 이상을 발견했을 때 어른에게 알리는 연습입니다.',
        },
      }),
      createSegment({
        description: '밖으로 나갈 때는 계단으로 가요.',
        endMs: 81_520,
        id: 'earthquake-full-stairs',
        label: '계단으로 나가요',
        learnerExplanation: '엘리베이터가 보여도 계단으로 건물 밖에 나가요.',
        learnerPrompt: '밖으로 나가야 할 수 있어요.',
        actionSteps: ['계단을 찾아요', '건물 밖으로 천천히 내려가요'],
        requiredLearnerKeywords: ['엘리베이터', '계단', '건물 밖'],
        narration: [
          {
            endMs: 81_520,
            source: 'audio',
            startMs: 74_920,
            text: '밖으로 나갈 때는 엘리베이터를 타지 말고 계단을 이용해 건물 밖으로 대피합니다.',
          },
        ],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 엘리베이터는 멈출 수 있어요.',
            id: 'elevator',
            label: '엘리베이터',
          },
          correct: {
            feedback: '맞아요. 밖으로 나갈 때는 계단으로 가요.',
            id: 'stairs',
            label: '계단',
          },
          kind: 'place',
          prompt: '밖으로 나갈 때 어디로 갈까요?',
          ruleIds: ['KR_EQ_07'],
        }),
        packet: createPacket({
          asrText:
            '밖으로 나갈 때는 엘리베이터를 타지 말고 계단으로 이동합니다.',
          objectHints: ['계단', '엘리베이터', '건물 밖'],
          ocrTokens: ['엘리베이터 금지', '계단 이용'],
          sessionId: 'demo-earthquake-full-stairs',
          startMs: 74_920,
          endMs: 81_520,
          uiElements: ['엘리베이터를 타지 말고 계단'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.93,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_07'],
          phase: 'after_shaking',
        },
        startMs: 74_920,
        teacherGuide: {
          correction:
            '엘리베이터를 선택하면 “멈출 수 있어서 계단”이라고 짧게 바꿔 말합니다.',
          observe: '계단과 엘리베이터 선택을 구분하는지 봅니다.',
          prompt: '밖으로 나갈 때 엘리베이터와 계단 중 무엇을 고를까요?',
          script: '지진 뒤 건물 밖으로 나갈 때 계단을 이용하는 장면입니다.',
        },
      }),
      createSegment({
        description: '밖에서는 머리를 가리고 건물에서 멀어져요.',
        endMs: 102_640,
        id: 'earthquake-full-outside-head',
        label: '밖에서 머리를 가려요',
        learnerExplanation: '가방으로 머리를 가리고 멀어져요.',
        learnerPrompt: '밖에도 유리와 간판이 떨어져요.',
        actionSteps: [
          '가방으로 머리를 가려요',
          '건물에서 멀어져요',
          '담장에서 멀어져요',
        ],
        requiredLearnerKeywords: ['유리', '간판', '담장', '가방'],
        actionReasons: [
          '유리와 간판이 떨어질 수 있어요',
          '벽에서 물건이 떨어질 수 있어요',
          '담장이 무너질 수 있어요',
        ],
        pauseMs: 102_640,
        narration: [
          {
            endMs: 89_840,
            source: 'audio',
            startMs: 81_520,
            text: '떨어지는 유리, 간판, 기와 등에 주의하며 소지품으로 몸을 보호하면서 침착하게 대피합니다.',
          },
          {
            endMs: 102_640,
            source: 'audio',
            startMs: 89_840,
            text: '밖으로 나오면 담장, 유리창 등이 파손돼 다칠 수 있으니 가방이나 손으로 머리를 보호하면서 건물과 담장에서 최대한 멀리 떨어진 곳으로 대피합니다.',
          },
        ],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 건물 옆에는 떨어지는 물건이 있어요.',
            id: 'near-wall',
            label: '건물 바로 옆',
          },
          correct: {
            feedback: '맞아요. 밖에서는 먼저 머리를 가려요.',
            id: 'head',
            label: '머리',
          },
          kind: 'place',
          prompt: '밖에서는 무엇을 가릴까요?',
          ruleIds: ['KR_EQ_08'],
        }),
        packet: createPacket({
          asrText:
            '밖에서는 유리, 간판, 담장을 조심하고 가방이나 손으로 머리를 보호합니다.',
          objectHints: ['건물 밖', '유리창', '간판', '담장', '머리 보호'],
          ocrTokens: ['머리 보호', '건물에서 멀리'],
          sessionId: 'demo-earthquake-full-outside-head',
          startMs: 81_520,
          endMs: 102_640,
          uiElements: ['건물에서 멀리 떨어진 곳'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.91,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_08'],
          phase: 'evacuation_route',
        },
        startMs: 81_520,
        teacherGuide: {
          correction:
            '밖으로 나온 뒤에도 머리를 가리고 건물에서 떨어져야 한다는 점을 먼저 말합니다.',
          observe: '학습자가 밖에서도 머리 보호를 계속 기억하는지 봅니다.',
          prompt: '밖에서는 무엇이 위에서 떨어질 수 있을까요?',
          script:
            '건물 밖에서 떨어지는 물건을 피하고 머리를 보호하는 장면입니다.',
        },
      }),
      createSegment({
        description: '안전한 곳을 찾아 걸어가요.',
        endMs: 121_240,
        id: 'earthquake-full-open-space',
        label: '안전한 곳으로 걸어가요',
        learnerExplanation:
          '안전디딤돌 앱에서 지진 대피소를 보고 넓은 곳으로 가요.',
        learnerPrompt: '밖으로 나온 뒤 갈 곳을 찾아요.',
        actionSteps: [
          '안전디딤돌 앱에서 지진 대피소를 찾아요',
          '넓은 공원으로 걸어가요',
          '넓은 운동장으로 걸어가요',
        ],
        requiredLearnerKeywords: [
          '안전디딤돌',
          '지진 대피소',
          '공원',
          '운동장',
          '차',
        ],
        actionReasons: [
          '가까운 갈 곳을 볼 수 있어요',
          '넓어서 건물에서 떨어져요',
          '넓어서 건물에서 떨어져요',
        ],
        narration: [
          {
            endMs: 108_960,
            source: 'audio',
            startMs: 102_640,
            text: '지진 대피소는 스마트폰 앱 안전디딤돌에서 확인할 수 있습니다.',
          },
          {
            endMs: 114_320,
            source: 'audio',
            startMs: 108_960,
            text: '하지만 지진이 발생했을 때 지진 대피소를 확인할 수 없는 상황이라면',
          },
          {
            endMs: 121_240,
            source: 'audio',
            startMs: 114_320,
            text: '주변의 넓은 공원이나 운동장으로 차량을 이용하지 않고 신속히 이동합니다.',
          },
        ],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 차를 타고 급하게 가지 않아요.',
            id: 'car',
            label: '차',
          },
          correct: {
            feedback: '맞아요. 공원이나 운동장으로 걸어가요.',
            id: 'open-space',
            label: '공원이나 운동장',
          },
          kind: 'place',
          prompt: '안전디딤돌을 못 보면 어디로 갈까요?',
          ruleIds: ['KR_EQ_09'],
        }),
        packet: createPacket({
          asrText:
            '지진 대피소는 스마트폰 앱 안전디딤돌에서 확인할 수 있습니다. 확인할 수 없다면 주변의 넓은 공원이나 운동장으로 차량을 이용하지 않고 이동합니다.',
          objectHints: ['안전디딤돌', '공원', '운동장', '넓은 공간'],
          ocrTokens: [
            '안전디딤돌',
            '지진 대피소',
            '넓은 공간',
            '차량 이용 금지',
          ],
          sessionId: 'demo-earthquake-full-open-space',
          startMs: 102_640,
          endMs: 121_240,
          uiElements: ['넓은 공원이나 운동장'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.9,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_09'],
          phase: 'open_space',
        },
        startMs: 102_640,
        teacherGuide: {
          correction:
            '앱 확인이 안 되면 차가 아니라 가까운 넓은 공간으로 이동한다고 정리합니다.',
          observe: '학습자가 넓은 곳과 차를 구분하는지 봅니다.',
          prompt: '안전한 곳 앱을 볼 수 없으면 어디로 갈까요?',
          script:
            '안전디딤돌, 공원·운동장, 차량 이용 금지를 함께 다루는 장면입니다.',
        },
      }),
      createSegment({
        description: '넓은 곳이 없으면 튼튼한 건물로 가요.',
        endMs: 130_400,
        id: 'earthquake-full-sturdy-building',
        label: '튼튼한 건물로 가요',
        learnerExplanation: '넓은 곳이 없으면 튼튼한 건물로 가요.',
        learnerPrompt: '공원이나 운동장이 안 보일 수 있어요.',
        actionSteps: ['튼튼한 건물을 찾아요', '안으로 들어가요', '몸을 지켜요'],
        requiredLearnerKeywords: ['공원', '운동장', '튼튼한 건물'],
        narration: [
          {
            endMs: 130_400,
            source: 'audio',
            startMs: 121_240,
            text: '가까운 공원이나 넓은 공간마저 없다면 최근에 지은 튼튼한 건물 안으로 들어가 우선 몸을 보호합니다.',
          },
        ],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 건물 옆에는 물건이 떨어질 수 있어요.',
            id: 'near-building',
            label: '건물 바로 옆',
          },
          correct: {
            feedback: '맞아요. 넓은 곳이 없으면 튼튼한 건물로 가요.',
            id: 'strong-building',
            label: '튼튼한 건물',
          },
          kind: 'place',
          prompt: '넓은 곳이 없으면 어디로 갈까요?',
          ruleIds: ['KR_EQ_19'],
        }),
        packet: createPacket({
          asrText:
            '가까운 공원이나 넓은 공간이 없다면 최근에 지은 튼튼한 건물 안으로 들어가 몸을 보호합니다.',
          objectHints: ['튼튼한 건물', '넓은 공간 없음', '몸 보호'],
          ocrTokens: ['튼튼한 건물', '몸 보호'],
          sessionId: 'demo-earthquake-full-sturdy-building',
          startMs: 121_240,
          endMs: 130_400,
          uiElements: ['튼튼한 건물 안으로 들어가기'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.9,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_19'],
          phase: 'open_space',
        },
        startMs: 121_240,
        teacherGuide: {
          correction:
            '넓은 공원이나 운동장이 없을 때는 건물 바로 옆이 아니라 튼튼한 건물 안에서 몸을 보호한다고 정리합니다.',
          observe:
            '학습자가 “넓은 곳이 없을 때”의 다음 선택을 말할 수 있는지 봅니다.',
          prompt: '넓은 곳이 전혀 없으면 어디에서 몸을 보호할까요?',
          script:
            '공원이나 운동장을 찾기 어려운 경우 튼튼한 건물 안에서 몸을 보호하는 장면입니다.',
        },
      }),
      createSegment({
        description: '사무실에서는 책상 아래로 가요.',
        endMs: 145_600,
        id: 'earthquake-full-office-desk',
        label: '책상 아래로 가요',
        learnerExplanation: '책상 아래에서 다리를 잡아요.',
        learnerPrompt: '사무실에서 지진이 났어요.',
        actionSteps: [
          '책상 아래로 가요',
          '책상 다리를 잡아요',
          '몸을 작게 해요',
        ],
        requiredLearnerKeywords: ['사무실', '책상', '책상 다리'],
        narration: [
          {
            endMs: 145_600,
            source: 'audio',
            startMs: 130_400,
            text: '사무실은 컴퓨터 본체, 모니터 등 무거운 물건들이 많아 다칠 위험이 크므로 즉시 책상 아래로 들어가 몸을 웅크리고 책상 다리를 꼭 잡고 몸을 보호합니다.',
          },
        ],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 흔들릴 때는 먼저 책상 아래로 가요.',
            id: 'hall',
            label: '복도',
          },
          correct: {
            feedback: '맞아요. 책상 아래에서 몸을 지켜요.',
            id: 'desk',
            label: '책상 아래',
          },
          kind: 'place',
          prompt: '사무실에서는 어디로 갈까요?',
          ruleIds: ['KR_EQ_03'],
        }),
        packet: createPacket({
          asrText:
            '사무실에서는 책상 아래로 들어가 몸을 웅크리고 책상 다리를 꼭 잡고 몸을 보호합니다.',
          objectHints: ['사무실', '책상', '모니터', '책상 다리'],
          ocrTokens: ['책상 아래', '책상 다리'],
          sessionId: 'demo-earthquake-full-office-desk',
          startMs: 130_400,
          endMs: 145_600,
          uiElements: ['책상 아래'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.92,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_03'],
          phase: 'during_shaking',
        },
        startMs: 130_400,
        teacherGuide: {
          correction:
            '장소가 바뀌어도 흔들릴 때는 몸을 낮추고 책상 아래로 간다고 정리합니다.',
          observe:
            '가정과 사무실처럼 장소가 바뀌어도 머리 보호를 고르는지 봅니다.',
          prompt: '사무실에서 무엇이 떨어질 수 있을까요?',
          script:
            '사무실 장면에서 무거운 물건과 책상 아래 머리 보호를 연결합니다.',
        },
      }),
      createSegment({
        description: '학교에서는 선생님 말을 들어요.',
        endMs: 175_400,
        id: 'earthquake-full-school-evacuation',
        label: '선생님 말을 들어요',
        learnerExplanation: '선생님 말을 듣고 창문에서 떨어져요.',
        learnerPrompt: '학교에서 지진이 났어요.',
        actionSteps: [
          '선생님 말을 들어요',
          '창문에서 떨어져요',
          '운동장이나 넓은 공원으로 가요',
        ],
        requiredLearnerKeywords: ['학교', '선생님', '창문', '운동장', '공원'],
        narration: [
          {
            endMs: 162_440,
            source: 'audio',
            startMs: 145_600,
            text: '흔들림이 멈추면 선생님의 안내에 따라 질서를 지키면서 운동장으로 대피합니다.',
          },
          {
            endMs: 168_760,
            source: 'audio',
            startMs: 162_440,
            text: '복도에서는 창문 유리가 깨질 우려가 크므로 창문과 떨어져 이동합니다.',
          },
          {
            endMs: 175_400,
            source: 'audio',
            startMs: 168_760,
            text: '운동장이 건물과 너무 가까이 있다면 주변의 넓은 공원을 찾아서 대피합니다.',
          },
        ],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 혼자 뛰지 말고 선생님 말을 들어요.',
            id: 'alone',
            label: '혼자 뛰기',
          },
          correct: {
            feedback: '맞아요. 멈춘 뒤에는 선생님 말을 들어요.',
            id: 'teacher',
            label: '선생님',
          },
          kind: 'person',
          prompt: '학교에서는 누구 말을 들을까요?',
          ruleIds: ['KR_EQ_14'],
        }),
        packet: createPacket({
          asrText:
            '흔들림이 멈추면 선생님의 안내에 따라 질서를 지키며 이동하고 창문과 떨어져 이동합니다.',
          objectHints: ['교실', '복도', '선생님 안내', '창문 유리'],
          ocrTokens: ['선생님의 안내', '창문 주의', '운동장'],
          sessionId: 'demo-earthquake-full-school-evacuation',
          startMs: 145_600,
          endMs: 175_400,
          uiElements: ['선생님 안내에 따라 대피'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.91,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_14'],
          phase: 'evacuation_route',
        },
        startMs: 145_600,
        teacherGuide: {
          correction:
            '학생 단독 판단이 아니라 선생님 말과 줄 서서 이동으로 바꿔 말합니다.',
          observe: '혼자 뛰기보다 선생님 말 듣기를 고르는지 봅니다.',
          prompt: '복도에서는 어느 쪽을 조심해야 할까요?',
          script: '학교 장면에서 안내, 질서, 창문과 떨어지기를 확인합니다.',
        },
      }),
      createSegment({
        description: '다친 사람이 있으면 119에 알려요.',
        endMs: 214_400,
        id: 'earthquake-full-after-report',
        label: '119와 방송을 기억해요',
        learnerExplanation: '다친 사람은 119에 알리고 방송을 들어요.',
        learnerPrompt: '다친 사람이 있을 수 있어요.',
        actionSteps: [
          '다친 사람을 봐요',
          '다친 사람을 119에 알려요',
          '라디오나 공공기관 안내를 들어요',
        ],
        requiredLearnerKeywords: ['다친 사람', '119', '라디오', '공공기관'],
        narration: [
          {
            endMs: 202_160,
            source: 'audio',
            startMs: 194_500,
            text: '흔들림이 멈춘 후 주변에 부상자가 있으면 119에 먼저 신고하고 이웃과 서로 협력해 응급 처치합니다.',
          },
          {
            endMs: 214_400,
            source: 'audio',
            startMs: 202_160,
            text: '지진이 발생하면 통신기기 사용이 폭주해 일시적인 장애가 발생할 수 있으니 당황하지 말고 라디오 및 공공기관이 제공하는 정보에 따라 행동합니다.',
          },
        ],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 잘 모르는 말만 믿지 말고 다시 봐요.',
            id: 'rumor',
            label: '소문',
          },
          correct: {
            feedback: '맞아요. 다친 사람이 있으면 119에 알려요.',
            id: 'call-119',
            label: '119',
          },
          kind: 'signal',
          prompt: '다친 사람이 있으면 어디에 알릴까요?',
          ruleIds: ['KR_EQ_12'],
        }),
        packet: createPacket({
          asrText:
            '흔들림이 멈춘 후 주변에 부상자가 있으면 119에 신고하고 라디오와 공공기관 안내에 따라 행동합니다.',
          objectHints: ['부상자 확인', '119 신고', '라디오', '공공 안내'],
          ocrTokens: ['119', '라디오 및 공공기관'],
          sessionId: 'demo-earthquake-full-after-report',
          startMs: 194_500,
          endMs: 214_400,
          uiElements: ['119', '라디오 및 공공기관'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.92,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_12'],
          phase: 'post_quake_report',
        },
        startMs: 194_500,
        teacherGuide: {
          correction:
            '“끝났다”가 아니라 부상자, 119, 방송 듣기로 이어지게 돕습니다.',
          observe: '멈춘 뒤 행동과 흔들리는 중 행동을 구분하는지 봅니다.',
          prompt: '다친 사람이 있으면 어디에 알려야 할까요?',
          script: '흔들림 뒤 부상자 신고와 방송 듣기를 연습합니다.',
        },
      }),
      createSegment({
        description: '집에 돌아오면 문을 천천히 열어요.',
        endMs: 230_450,
        id: 'earthquake-full-return-door',
        label: '문은 천천히 열어요',
        learnerExplanation: '옷장이나 보관함 문을 천천히 열어요.',
        learnerPrompt: '옷장이나 보관함 문 뒤에 물건이 있을 수 있어요.',
        pauseMs: 230_450,
        actionSteps: [
          '옷장 문 주변을 봐요',
          '보관함 문을 천천히 열어요',
          '쏟아진 물건이 있으면 어른에게 말해요',
        ],
        requiredLearnerKeywords: ['옷장', '보관함', '문', '물건', '어른'],
        narration: [
          {
            endMs: 223_240,
            source: 'audio',
            startMs: 214_400,
            text: '가정이나 사무실로 돌아간 후에는 피해 상태를 확인하고 안전이 의심되면 전문가의 확인을 받도록 합니다.',
          },
          {
            endMs: 230_450,
            source: 'audio',
            startMs: 223_240,
            text: '옷장이나 보관함 등의 내용물이 쏟아져 내려 부상을 입을 수도 있으므로 문을 열 때 주의합니다.',
          },
        ],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 문을 확 열지 말고 다시 봐요.',
            id: 'open-fast',
            label: '확 열기',
          },
          correct: {
            feedback: '맞아요. 문은 천천히 열어요.',
            id: 'slow-open',
            label: '천천히',
          },
          kind: 'state',
          prompt: '옷장 문을 열 때 어떻게 할까요?',
          ruleIds: ['KR_EQ_18'],
        }),
        packet: createPacket({
          asrText:
            '가정이나 사무실로 돌아간 후에는 피해 상태를 확인하고 문을 열 때 주의합니다.',
          objectHints: ['문 주변 물건', '문 열기', '피해 확인'],
          ocrTokens: ['문을 열 때 주의', '피해 확인'],
          sessionId: 'demo-earthquake-full-return-door',
          startMs: 214_400,
          endMs: 230_450,
          uiElements: ['문을 열 때 주의'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.91,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_18'],
          phase: 'after_shaking',
        },
        startMs: 214_400,
        teacherGuide: {
          correction:
            '집에 돌아온 뒤에는 문 주변 물건과 실내 상태를 먼저 보게 합니다.',
          observe: '문을 급하게 열지 않고 천천히 여는 선택을 하는지 봅니다.',
          prompt: '집에 돌아오면 문을 바로 확 열어도 될까요?',
          script:
            '귀가 후 문 주변 물건과 실내 설비 이상을 조심해서 살피는 장면입니다.',
        },
      }),
      createSegment({
        description: '가스 냄새가 나면 어른에게 말해요.',
        endMs: 251_880,
        id: 'earthquake-full-door-gas',
        label: '가스 냄새를 말해요',
        learnerExplanation: '가스 냄새를 어른에게 말하고 밖으로 나가요.',
        learnerPrompt: '가스 냄새나 새는 소리가 나요.',
        previewMs: 231_000,
        actionSteps: [
          '가스 냄새나 새는 소리를 어른에게 말해요',
          '밖으로 나가요',
          '다시 쓰기 전 어른에게 물어봐요',
        ],
        requiredLearnerKeywords: ['가스 냄새', '새는 소리', '어른', '밖'],
        narration: [
          {
            endMs: 235_400,
            source: 'audio',
            startMs: 230_500,
            text: '가스, 전기, 수도관 등의 확인도 필수입니다.',
          },
          {
            endMs: 243_920,
            source: 'audio',
            startMs: 235_400,
            text: '가스 냄새가 나거나 가스 새는 소리가 들릴 경우에는 밸브를 잠근 후 창문을 열고 우선 대피합니다.',
          },
          {
            endMs: 251_880,
            source: 'audio',
            startMs: 243_920,
            text: '대피 후에는 지역 도시가스, 한국가스안전공사 등 가스 관련 기관에 조치 후 사용합니다.',
          },
        ],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 가스가 의심되면 혼자 만지지 않아요.',
            id: 'touch-gas',
            label: '혼자 만지기',
          },
          correct: {
            feedback: '맞아요. 가스 냄새는 어른에게 말해요.',
            id: 'tell-gas',
            label: '어른',
          },
          kind: 'person',
          prompt: '가스 냄새가 나면 누구에게 말할까요?',
          ruleIds: ['KR_EQ_16'],
        }),
        packet: createPacket({
          asrText:
            '가스, 전기, 수도관 등의 확인도 필수입니다. 가스 냄새가 나거나 가스 새는 소리가 들리면 직접 만지지 말고 어른에게 말한 뒤 안전한 곳으로 갑니다.',
          objectHints: ['가스 냄새', '가스 밸브', '창문', '안전한 곳'],
          ocrTokens: ['가스 냄새', '가스 확인'],
          sessionId: 'demo-earthquake-full-door-gas',
          startMs: 230_500,
          endMs: 251_880,
          uiElements: ['가스 냄새가 나면'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.91,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_16'],
          phase: 'after_shaking',
        },
        startMs: 230_500,
        teacherGuide: {
          correction:
            '성인이 밸브를 만지는 장면은 학습자에게 “어른에게 말하기”로 바꿔 설명합니다.',
          observe:
            '가스 장면을 직접 조작이 아니라 도움 요청으로 이해하는지 봅니다.',
          prompt: '가스 냄새가 나면 창문과 대피는 누가 도와야 할까요?',
          script:
            '가스 냄새가 나거나 새는 소리가 들릴 때 안전한 곳으로 가고 어른에게 말하는 장면입니다.',
        },
      }),
      createSegment({
        description: '전기가 이상하면 손전등을 써요.',
        endMs: 267_960,
        id: 'earthquake-full-electric-water',
        label: '전기는 어른에게 말해요',
        learnerExplanation: '정전이면 손전등을 쓰고 전선은 어른에게 말해요.',
        learnerPrompt: '전기가 고장 난 것 같아요.',
        actionSteps: [
          '전선에서 떨어져요',
          '정전이면 손전등을 써요',
          '전선 문제를 어른에게 말해요',
        ],
        requiredLearnerKeywords: ['전기', '정전', '손전등', '전선', '어른'],
        narration: [
          {
            endMs: 259_960,
            source: 'audio',
            startMs: 251_880,
            text: '전기에 이상이 발견됐을 때는 원인이 파악될 때까지 엘리베이터 사용을 금지합니다.',
          },
          {
            endMs: 267_960,
            source: 'audio',
            startMs: 259_960,
            text: '정전이 되었다면 손전등을 사용하고 차단기를 내린 후 전선의 이상 유무를 확인합니다.',
          },
        ],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 전기는 혼자 만지지 않아요.',
            id: 'elevator',
            label: '엘리베이터',
          },
          correct: {
            feedback: '맞아요. 정전이면 손전등을 써요.',
            id: 'flashlight',
            label: '손전등',
          },
          kind: 'object',
          prompt: '정전이면 무엇을 쓸까요?',
          ruleIds: ['KR_EQ_17'],
        }),
        packet: createPacket({
          asrText:
            '전기에 이상이 있으면 엘리베이터를 쓰지 않습니다. 정전이 되면 손전등을 사용하고 전선 문제는 어른에게 말합니다.',
          objectHints: ['전기 이상', '차단기', '손전등', '전선'],
          ocrTokens: ['전기 이상', '손전등', '전선'],
          sessionId: 'demo-earthquake-full-electric-water',
          startMs: 251_880,
          endMs: 267_960,
          uiElements: ['전기 이상', '손전등'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.91,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_17'],
          phase: 'after_shaking',
        },
        startMs: 251_880,
        teacherGuide: {
          correction:
            '전기 장면은 직접 만지는 행동이 아니라 전선에서 떨어지고 어른에게 말하기로 제한합니다.',
          observe:
            '학습자가 정전과 손전등을 연결하고 전선을 혼자 만지지 않는지 봅니다.',
          prompt: '정전이면 무엇을 쓸까요?',
          script:
            '전기 이상, 정전, 손전등, 전선에서 떨어지기를 다루는 장면입니다.',
        },
      }),
      createSegment({
        description: '물은 어른과 먼저 살펴요.',
        endMs: 285_640,
        id: 'earthquake-full-water-report',
        label: '물은 어른에게 먼저 말해요',
        learnerExplanation: '수도꼭지나 화장실 물은 어른에게 먼저 말해요.',
        learnerPrompt: '수도관이 고장 난 것 같아요.',
        actionSteps: [
          '수도관 고장을 어른에게 말해요',
          '수도꼭지 물은 기다려요',
          '화장실 물도 어른에게 물어봐요',
        ],
        requiredLearnerKeywords: ['수도관', '수도꼭지', '화장실', '물', '어른'],
        narration: [
          {
            endMs: 278_840,
            source: 'audio',
            startMs: 267_960,
            text: '수도관에 피해가 있다면 밸브를 잠그고 하수관의 피해 여부를 확인하기 전까지 수도꼭지나 화장실 등 물을 사용하지 않습니다.',
          },
          {
            endMs: 285_640,
            source: 'audio',
            startMs: 278_840,
            text: '피해가 확인되었다면 살고 있는 곳의 시군구청에 신고합니다.',
          },
        ],
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 물 문제는 혼자 만지지 않아요.',
            id: 'touch-water',
            label: '혼자 만지기',
          },
          correct: {
            feedback: '맞아요. 물 쓰기 전에 어른에게 말해요.',
            id: 'tell-adult',
            label: '어른',
          },
          kind: 'person',
          prompt: '물 쓰기 전에 누구에게 말할까요?',
          ruleIds: ['KR_EQ_13'],
        }),
        packet: createPacket({
          asrText:
            '수도관에 피해가 있으면 물을 쓰기 전에 어른에게 말합니다. 문제가 있으면 살고 있는 곳에 신고합니다.',
          objectHints: ['수도관', '밸브', '수도꼭지', '화장실', '물 사용'],
          ocrTokens: ['수도관', '수도꼭지나 화장실', '신고'],
          sessionId: 'demo-earthquake-full-water-report',
          startMs: 267_960,
          endMs: 285_640,
          uiElements: ['수도관 피해', '물 사용 주의'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.91,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_13'],
          phase: 'after_shaking',
        },
        startMs: 267_960,
        teacherGuide: {
          correction:
            '수도관과 물 사용 장면은 직접 고치는 행동이 아니라 어른에게 말하고 기다리기로 제한합니다.',
          observe: '학습자가 물을 바로 쓰기보다 어른에게 먼저 말하는지 봅니다.',
          prompt: '물 쓰기 전에 누구와 먼저 살필까요?',
          script:
            '수도관, 수도꼭지, 화장실 물 사용을 어른과 먼저 확인하는 장면입니다.',
        },
      }),
      createSegment({
        description: '마지막으로 다시 기억해요.',
        endMs: 307_440,
        id: 'earthquake-full-outro-review',
        label: '마지막 복습',
        learnerExplanation: '또 흔들리면 다시 연습해요.',
        learnerPrompt: '마지막으로 다시 기억해요.',
        learnerSequence: [
          '또 흔들릴 수 있어요.',
          '방송을 들어요.',
          '다시 연습해요.',
        ],
        actionSteps: [],
        narration: [
          {
            endMs: 295_640,
            source: 'audio',
            startMs: 285_640,
            text: '끝으로 여진이 발생할 수 있으므로 지역 방송 등이 제공하는 정보를 주시하며 만일의 사태에 대비합니다.',
          },
          {
            endMs: 301_140,
            source: 'audio',
            startMs: 295_640,
            text: '사전 대비와 훈련만이 예측 불가의 재난을 예방할 최선의 방법입니다.',
          },
          {
            endMs: 307_440,
            source: 'audio',
            startMs: 301_140,
            text: '지진으로부터 모두 안전하도록 다 같이 관심을 갖고 노력해야겠습니다.',
          },
        ],
        practiceMode: 'intro',
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 마지막은 오늘 배운 것을 다시 보는 장면이에요.',
            id: 'new-action',
            label: '새 행동 고르기',
          },
          correct: {
            feedback: '맞아요. 오늘 배운 행동을 다시 기억하는 장면이에요.',
            id: 'review',
            label: '다시 기억하기',
          },
          kind: 'signal',
          prompt: '마지막 장면은 무엇을 할까요?',
          ruleIds: ['KR_EQ_12'],
        }),
        packet: createPacket({
          asrText:
            '여진이 발생할 수 있으므로 지역 방송을 듣고 다시 대비합니다. 사전 대비와 훈련이 중요합니다.',
          objectHints: ['지진 마무리', '지역 방송', '여진 대비', '훈련'],
          ocrTokens: ['여진', '지역 방송', '사전 대비', '훈련'],
          sessionId: 'demo-earthquake-full-outro-review',
          startMs: 285_640,
          endMs: 307_440,
          uiElements: ['사전 대비와 훈련'],
        }),
        rules: earthquakeRuleCatalog,
        segmentOverrides: {
          confidence: 0.9,
          hazard: 'earthquake',
          officialRuleIds: ['KR_EQ_12'],
          phase: 'post_quake_report',
        },
        startMs: 285_640,
        teacherGuide: {
          correction:
            '마무리에서는 새 행동을 추가하지 않고, 장면별 행동을 카드뉴스처럼 다시 보게 합니다.',
          observe:
            '학습자가 또 흔들릴 수 있다는 점과 반복 연습을 기억하는지 봅니다.',
          prompt: '지진 연습은 왜 한 번만 보지 않고 다시 볼까요?',
          script:
            '마지막 아웃트로는 여진과 반복 훈련을 말하며, 화면에서는 전체 복습으로 연결됩니다.',
        },
      }),
    ],
    title: '지진이 났을 때',
    videoSrc: '/demo-video/earthquake-full-practice-001.mp4',
  },
  ...createSeasonalScenarios(),
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
          prompt: '소리가 없어도 무엇을 볼까요?',
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
        learnerExplanation: '나갈 길을 확인해요.',
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
          prompt: '흔들림이 멈춘 뒤 무엇을 볼까요?',
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
        actionSteps: [
          '가스 냄새 나는 곳에서 멀어져요',
          '가스 냄새를 어른에게 말해요',
        ],
        requiredLearnerKeywords: ['가스 냄새', '어른'],
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
        description: '전기가 이상하면 어른에게 알려요.',
        endMs: 30_030,
        id: 'earthquake-after-report',
        label: '전기가 이상하면 알려요',
        learnerExplanation: '전기가 이상하면 어른에게 말해요.',
        learnerPrompt: '전등이 꺼지거나 전기가 이상해요.',
        actionSteps: [
          '전기 스위치에서 떨어져요',
          '전기가 고장 나면 어른에게 말해요',
        ],
        requiredLearnerKeywords: ['전기', '버튼', '어른'],
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

type SeasonalScenarioSeed = {
  accentClassName: string
  hazard: Segment['hazard']
  homeNote: string
  homeTitle: string
  id: string
  note: string
  posterSrc: string
  segments: SeasonalSegmentSeed[]
  title: string
  videoSrc: string
}

type SeasonalSegmentSeed = {
  actionReasons?: string[]
  actionSteps?: string[]
  asrText: string
  description: string
  endMs: number
  id: string
  label: string
  learnerExplanation: string
  learnerPrompt: string
  learnerSequence?: Array<string | LearnerSequenceStep>
  objectHints: string[]
  ocrTokens?: string[]
  phase: string
  practiceMode?: SegmentPracticeMode
  previewMs?: number
  requiredLearnerKeywords?: string[]
  ruleIds: string[]
  startMs: number
  teachBack: LearningTeachBack
  uiElements?: string[]
}

function getSeasonalScenarioSeeds(): SeasonalScenarioSeed[] {
  return [
    {
      accentClassName: 'bg-cyan-400',
      hazard: 'heavy_rain',
      homeNote: '비가 많이 올 때, 물가와 낮은 길을 멀리해요',
      homeTitle: '비가 많이 올 때',
      id: 'heavy-rain-safety-flow',
      note: '날씨를 보고, 낮은 길과 물가를 피하고, 물이 빠진 뒤에도 어른과 봐요',
      posterSrc: '/demo-video/seasonal/heavy-rain-practice-001.jpg',
      title: '비가 많이 올 때',
      videoSrc: '/demo-video/seasonal/heavy-rain-practice-001.mp4',
      segments: [
        {
          asrText:
            '집중호우는 짧은 시간에 많은 비가 내리는 자연재난입니다. 집이 잠기고 하천이 넘칠 수 있으니 미리 대비하면 피해를 줄일 수 있습니다.',
          description: '비가 많이 올 수 있어요.',
          endMs: 40_000,
          id: 'heavy-rain-intro',
          label: '비가 많이 올 때 배워요',
          learnerExplanation: '비가 많이 올 때를 배워요.',
          learnerPrompt: '비가 갑자기 많이 올 수 있어요.',
          learnerSequence: [
            '비가 갑자기 많이 올 수 있어요.',
            '물이 빨리 불어날 수 있어요.',
            '다음 장면부터 따라 해요.',
          ],
          objectHints: ['폭우', '하천', '집중호우 소개', '물에 잠긴 길'],
          ocrTokens: ['집중호우', '강한 비', '하천', '침수'],
          phase: 'forecast',
          practiceMode: 'intro',
          ruleIds: ['KR_HR_01'],
          startMs: 0,
          teachBack: createTeachBack({
            contrast: {
              feedback: '괜찮아요. 아직 행동을 고르는 장면은 아니에요.',
              id: 'rain-act-now',
              label: '행동 카드',
            },
            correct: {
              feedback: '맞아요. 비가 많이 올 때 배우는 시작 장면이에요.',
              id: 'rain-intro',
              label: '연습 시작',
            },
            kind: 'signal',
            prompt: '이 장면은 무엇을 알려줄까요?',
            ruleIds: ['KR_HR_01'],
          }),
          uiElements: ['집중호우 발생 시 행동요령'],
        },
        {
          actionReasons: ['비가 오기 전 미리 정해야 해요.'],
          actionSteps: [
            '날씨 알림을 봐요',
            '밖에 덜 나가요',
            '가족과 갈 곳을 정해요',
          ],
          asrText:
            '호우예보가 발령되면 거주지역에 영향을 주는 시기를 미리 파악해 외출을 자제합니다. 안전디딤돌을 설치하면 재난안전 정보를 받아볼 수 있습니다. 가족과 연락 방법을 공유하고 대피할 장소도 확인해 둡니다.',
          description: '비가 오기 전 미리 봐요.',
          endMs: 105_000,
          id: 'heavy-rain-forecast-prepare',
          label: '비 오기 전 준비해요',
          learnerExplanation: '비 오기 전 미리 준비해요.',
          learnerPrompt: '비가 많이 온다는 알림이 왔어요.',
          learnerSequence: [
            '비가 많이 온다는 알림이 왔어요.',
            '날씨 알림을 봐요.',
            '밖에 덜 나가요.',
            '가족과 갈 곳을 정해요.',
          ],
          objectHints: [
            '스마트폰 알림',
            '안전디딤돌',
            '가족 연락',
            '비상 물건',
          ],
          ocrTokens: ['안전디딤돌', '가족과 연락 방법 공유', '식수', '손전등'],
          phase: 'forecast',
          previewMs: 60_000,
          requiredLearnerKeywords: ['날씨', '가족'],
          ruleIds: ['KR_HR_01', 'KR_HR_02'],
          startMs: 40_000,
          teachBack: createTeachBack({
            contrast: {
              feedback: '괜찮아요. 밖에 나가기 전 알림을 다시 봐요.',
              id: 'rain-outside',
              label: '밖',
            },
            correct: {
              feedback: '맞아요. 날씨 알림을 먼저 봐요.',
              id: 'rain-alert',
              label: '날씨 알림',
            },
            kind: 'signal',
            prompt: '비가 오기 전 무엇을 먼저 볼까요?',
            ruleIds: ['KR_HR_01'],
          }),
          uiElements: ['재난안전정보 앱 안전디딤돌 설치'],
        },
        {
          actionReasons: ['물이 빨리 불어날 수 있어요.'],
          actionSteps: [
            '낮은 길에서 멀어져요',
            '하천에서 멀어져요',
            '맨홀에서 멀어져요',
          ],
          asrText:
            '밖에 있다면 지하차도, 보도 등 저지대를 벗어나 안전지대로 대피합니다. 상습 침수지역과 공사장, 가로등, 신호등, 전신주, 지하공간 같은 위험지역에는 가지 말고 맨홀 가까이에도 가지 말아야 합니다.',
          description: '물이 찬 낮은 길은 피해요.',
          endMs: 205_000,
          id: 'heavy-rain-avoid-water',
          label: '물가와 낮은 길을 멀리해요',
          learnerExplanation: '물이 찬 길에서 멀어져요.',
          learnerPrompt: '길에 물이 많이 찼어요.',
          learnerSequence: [
            '길에 물이 많이 찼어요.',
            '낮은 길에서 멀어져요.',
            '하천에서 멀어져요.',
            '맨홀에서 멀어져요.',
          ],
          objectHints: ['지하차도', '맨홀', '하천', '물에 잠긴 길', '계곡'],
          ocrTokens: ['저지대', '지하차도', '맨홀', '하천', '계곡'],
          phase: 'avoid_water',
          previewMs: 170_000,
          requiredLearnerKeywords: ['맨홀', '하천'],
          ruleIds: ['KR_HR_03'],
          startMs: 105_000,
          teachBack: createTeachBack({
            contrast: {
              feedback: '괜찮아요. 물이 있는 길은 다시 봐요.',
              id: 'rain-low-road',
              label: '낮은 길',
            },
            correct: {
              feedback: '맞아요. 높은 곳이 더 나아요.',
              id: 'rain-high-place',
              label: '높은 곳',
            },
            kind: 'place',
            prompt: '물이 찬 길이 보이면 어디로 갈까요?',
            ruleIds: ['KR_HR_03'],
          }),
          uiElements: ['맨홀은 접근 금지', '침수된 도로 건너지 않기'],
        },
        {
          actionReasons: ['집 안도 아직 조심해야 해요.'],
          actionSteps: [
            '집은 어른과 봐요',
            '냄새가 나면 창문을 열어요',
            '음식은 어른과 봐요',
          ],
          asrText:
            '호우가 지나간 뒤 집이 침수되었다면 바로 들어가지 말고 붕괴 가능성을 점검해야 합니다. 물에 잠긴 집안은 가스가 차 있을 수 있으니까 환기시킨 뒤 들어갑니다. 침수된 음식물은 먹거나 요리재료로 쓰지 않습니다.',
          description: '물이 빠진 뒤에도 조심해요.',
          endMs: 273_000,
          id: 'heavy-rain-after-flood',
          label: '물이 빠진 뒤 어른과 봐요',
          learnerExplanation: '물이 빠진 뒤에도 조심해요.',
          learnerPrompt: '물이 빠지고 집으로 돌아왔어요.',
          learnerSequence: [
            '물이 빠지고 집으로 돌아왔어요.',
            '집은 어른과 봐요.',
            '냄새가 나면 창문을 열어요.',
            '음식은 어른과 봐요.',
          ],
          objectHints: [
            '물에 잠긴 집',
            '창문 열기',
            '가스 냄새',
            '젖은 음식',
            '파손된 길',
          ],
          ocrTokens: ['환기', '가스배출', '침수된 음식물', '관청에 신고'],
          phase: 'after_flood',
          previewMs: 225_000,
          requiredLearnerKeywords: ['어른', '음식'],
          ruleIds: ['KR_HR_04'],
          startMs: 205_000,
          teachBack: createTeachBack({
            contrast: {
              feedback: '괜찮아요. 젖은 음식 장면을 다시 봐요.',
              id: 'rain-wet-food',
              label: '젖은 음식',
            },
            correct: {
              feedback: '맞아요. 어른과 같이 봐요.',
              id: 'rain-adult',
              label: '어른',
            },
            kind: 'person',
            prompt: '물이 빠진 집은 누구와 볼까요?',
            ruleIds: ['KR_HR_04'],
          }),
          uiElements: [
            '침수 시 구조적 붕괴 가능성 점검',
            '수돗물, 저장식수는 안전한 것만 사용',
          ],
        },
      ],
    },
    {
      accentClassName: 'bg-teal-400',
      hazard: 'typhoon',
      homeNote: '문과 창문을 닫고, 물가와 공사장에서 멀어져요',
      homeTitle: '태풍이 올 때',
      id: 'typhoon-safety-flow',
      note: '바람과 비가 강할 때 집 안에 있고, 물가와 공사장을 멀리해요',
      posterSrc: '/demo-video/seasonal/typhoon-practice-001.jpg',
      title: '태풍이 올 때',
      videoSrc: '/demo-video/seasonal/typhoon-practice-001.mp4',
      segments: [
        {
          asrText:
            '매년 여름이면 찾아오는 자연재난, 태풍입니다. 태풍은 강한 바람과 많은 비를 함께 몰고 와 피해를 키울 수 있습니다.',
          description: '태풍 연습을 시작해요.',
          endMs: 24_000,
          id: 'typhoon-intro',
          label: '태풍 연습을 시작해요',
          learnerExplanation: '태풍 때 어떻게 할지 배워요.',
          learnerPrompt: '태풍은 바람과 비가 함께 와요.',
          learnerSequence: [
            '태풍은 바람과 비가 함께 와요.',
            '물건이 날아올 수 있어요.',
            '다음 장면부터 따라 해요.',
          ],
          objectHints: ['강한 바람', '태풍 피해', '해안 파도', '뉴스 화면'],
          ocrTokens: ['태풍', '강풍', '집중호우'],
          phase: 'indoor',
          practiceMode: 'intro',
          ruleIds: ['KR_TY_01'],
          startMs: 0,
          teachBack: createTeachBack({
            contrast: {
              feedback: '괜찮아요. 아직 행동을 고르는 장면은 아니에요.',
              id: 'typhoon-act-card',
              label: '행동 카드',
            },
            correct: {
              feedback: '맞아요. 태풍 연습이 시작되는 장면이에요.',
              id: 'typhoon-start',
              label: '연습 시작',
            },
            kind: 'signal',
            prompt: '이 장면은 무엇을 알려줄까요?',
            ruleIds: ['KR_TY_01'],
          }),
          uiElements: ['태풍 발생 시 행동요령'],
        },
        {
          actionReasons: ['바람에 물건이 날아올 수 있어요.'],
          actionSteps: [
            '문과 창문을 닫아요',
            '집 안에 있어요',
            '날씨 알림을 봐요',
          ],
          asrText:
            '태풍이 발생하면 실내에서는 문과 창문을 닫고, 외출을 하지 말며, 수시로 기상상황을 확인합니다.',
          description: '집 안에서는 문과 창문을 닫아요.',
          endMs: 49_000,
          id: 'typhoon-indoor',
          label: '문과 창문을 닫아요',
          learnerExplanation: '문과 창문을 닫고 집에 있어요.',
          learnerPrompt: '태풍 바람이 강해졌어요.',
          learnerSequence: [
            '태풍 바람이 강해졌어요.',
            '문과 창문을 닫아요.',
            '집 안에 있어요.',
            '날씨 알림을 봐요.',
          ],
          objectHints: ['창문', '강한 바람', '휴대전화 날씨', '집 안'],
          ocrTokens: ['문 창문 닫고 외출하지 않기', '기상상황 수시 확인'],
          phase: 'indoor',
          previewMs: 38_000,
          requiredLearnerKeywords: ['문', '창문'],
          ruleIds: ['KR_TY_01'],
          startMs: 24_000,
          teachBack: createTeachBack({
            contrast: {
              feedback: '괜찮아요. 창문 장면을 다시 봐요.',
              id: 'typhoon-window-open',
              label: '열린 창문',
            },
            correct: {
              feedback: '맞아요. 문과 창문을 닫아요.',
              id: 'typhoon-window-closed',
              label: '닫힌 창문',
            },
            kind: 'object',
            prompt: '바람이 강할 때 창문은 어떤 모습이어야 할까요?',
            ruleIds: ['KR_TY_01'],
          }),
          uiElements: ['문 창문 닫고 외출하지 않기'],
        },
        {
          actionReasons: ['물이 갑자기 불어날 수 있어요.'],
          actionSteps: [
            '하천에서 멀어져요',
            '바닷가에서 멀어져요',
            '산길에서 나와요',
          ],
          asrText:
            '물에 자주 잠기는 곳이나 산사태가 일어날 수 있는 위험한 곳은 피하고, 개울가나 하천 변, 해안가 같은 곳은 침수될 수 있고 급류에 휩쓸릴 수도 있어 가까이 가지 않습니다.',
          description: '물가와 산길은 멀리해요.',
          endMs: 68_000,
          id: 'typhoon-water-mountain',
          label: '물가와 산길을 멀리해요',
          learnerExplanation: '물가와 산길에서 멀어져요.',
          learnerPrompt: '비와 바람이 더 세졌어요.',
          learnerSequence: [
            '비와 바람이 더 세졌어요.',
            '하천에서 멀어져요.',
            '바닷가에서 멀어져요.',
            '산길에서 나와요.',
          ],
          objectHints: ['하천', '해안가', '산길', '급류', '침수'],
          ocrTokens: ['산사태', '안전한 곳', '하천', '해안가'],
          phase: 'avoid_water',
          previewMs: 52_000,
          requiredLearnerKeywords: ['하천', '바닷가'],
          ruleIds: ['KR_TY_02'],
          startMs: 49_000,
          teachBack: createTeachBack({
            contrast: {
              feedback: '괜찮아요. 물가 장면을 다시 봐요.',
              id: 'typhoon-river',
              label: '하천',
            },
            correct: {
              feedback: '맞아요. 높은 곳이 더 나아요.',
              id: 'typhoon-safe-place',
              label: '높은 곳',
            },
            kind: 'place',
            prompt: '물이 많은 곳 대신 어디가 나을까요?',
            ruleIds: ['KR_TY_02'],
          }),
          uiElements: ['개울가, 하천 변, 해안가 등 침수 위험지역은 가지 않기'],
        },
        {
          actionReasons: ['바람에 물건이 날아올 수 있어요.'],
          actionSteps: [
            '공사장에서 멀어져요',
            '산과 계곡에서 나와요',
            '집 안으로 가요',
          ],
          asrText:
            '큰바람이 불면 공사자재가 넘어지거나 날릴 수 있으니까 공사장 근처에 가까이 가지 않습니다. 산이나 계곡을 찾은 등산객은 신속하게 안전한 곳으로 대피합니다. 농촌에서는 논둑이나 물꼬를 점검하기 위해 무리하게 나서는 일이 없도록 해야 합니다.',
          description: '공사장과 산길도 멀리해요.',
          endMs: 90_000,
          id: 'typhoon-wind-rural',
          label: '공사장과 산길을 멀리해요',
          learnerExplanation: '공사장과 산길에서 멀어져요.',
          learnerPrompt: '큰바람이 불고 있어요.',
          learnerSequence: [
            '큰바람이 불고 있어요.',
            '공사장에서 멀어져요.',
            '산과 계곡에서 나와요.',
            '집 안으로 가요.',
          ],
          objectHints: ['공사장', '공사 자재', '산길', '계곡', '논둑'],
          ocrTokens: ['공사장 근처 가지 않기', '논둑 물꼬 점검하러 가지 않기'],
          phase: 'wind_hazard',
          previewMs: 72_000,
          requiredLearnerKeywords: ['공사장', '산'],
          ruleIds: ['KR_TY_03', 'KR_TY_04'],
          startMs: 68_000,
          teachBack: createTeachBack({
            contrast: {
              feedback: '괜찮아요. 공사장 장면을 다시 봐요.',
              id: 'typhoon-worksite',
              label: '공사장',
            },
            correct: {
              feedback: '맞아요. 집 안이나 어른이 정한 곳이 나아요.',
              id: 'typhoon-inside',
              label: '집 안',
            },
            kind: 'place',
            prompt: '큰바람이 불 때 어디가 더 나을까요?',
            ruleIds: ['KR_TY_03'],
          }),
          uiElements: ['공사장 근처 가지 않기', '논둑 물꼬 점검하러 가지 않기'],
        },
      ],
    },
    {
      accentClassName: 'bg-amber-400',
      hazard: 'heatwave',
      homeNote: '너무 더울 때 물을 마시고 시원한 곳에서 쉬어요',
      homeTitle: '너무 더울 때',
      id: 'heatwave-safety-flow',
      note: '물을 마시고, 더운 곳을 피하고, 몸이 아프면 어른에게 말해요',
      posterSrc: '/demo-video/seasonal/heatwave-practice-001.jpg',
      title: '너무 더울 때',
      videoSrc: '/demo-video/seasonal/heatwave-practice-001.mp4',
      segments: [
        {
          asrText:
            '폭염은 매우 더운 날씨가 이어지는 자연재난입니다. 오래 더위에 있으면 온열질환이 생길 수 있고 열사병은 매우 조심해야 합니다.',
          description: '너무 더운 날을 배워요.',
          endMs: 35_000,
          id: 'heatwave-intro',
          label: '더운 날을 배워요',
          learnerExplanation: '더운 날 어떻게 할지 배워요.',
          learnerPrompt: '날씨가 아주 더워졌어요.',
          learnerSequence: [
            '날씨가 아주 더워졌어요.',
            '몸이 뜨거워질 수 있어요.',
            '다음 장면부터 따라 해요.',
          ],
          objectHints: [
            '뜨거운 햇빛',
            '폭염 특보',
            '땀 흘리는 사람',
            '건설 현장',
          ],
          ocrTokens: ['폭염', '열사병', '33도 이상'],
          phase: 'cool_body',
          practiceMode: 'intro',
          ruleIds: ['KR_HW_01'],
          startMs: 0,
          teachBack: createTeachBack({
            contrast: {
              feedback: '괜찮아요. 아직 행동을 고르는 장면은 아니에요.',
              id: 'heat-action-card',
              label: '행동 카드',
            },
            correct: {
              feedback: '맞아요. 더운 날 연습이 시작되는 장면이에요.',
              id: 'heat-start',
              label: '연습 시작',
            },
            kind: 'signal',
            prompt: '이 장면은 무엇을 알려줄까요?',
            ruleIds: ['KR_HW_01'],
          }),
          uiElements: ['폭염 발생 시 행동요령'],
        },
        {
          actionReasons: ['몸이 너무 뜨거워질 수 있어요.'],
          actionSteps: [
            '시원한 곳에서 쉬어요',
            '물을 자주 마셔요',
            '햇빛을 가려요',
          ],
          asrText:
            '폭염이 발생하면 되도록 야외활동을 자제하고, 꼭 외출해야 할 경우 햇빛을 최대한 가리는 옷차림을 하며, 물을 자주 마십니다.',
          description: '물 마시고 햇빛을 피해요.',
          endMs: 58_000,
          id: 'heatwave-water-shade',
          label: '물 마시고 햇빛을 피해요',
          learnerExplanation: '물을 마시고 햇빛을 피해요.',
          learnerPrompt: '밖이 너무 더워요.',
          learnerSequence: [
            '밖이 너무 더워요.',
            '시원한 곳에서 쉬어요.',
            '물을 자주 마셔요.',
            '햇빛을 가려요.',
          ],
          objectHints: ['물병', '모자', '부채', '햇빛', '야외'],
          ocrTokens: ['야외활동 자제', '물 자주 마시기', '햇빛 차단'],
          phase: 'cool_body',
          previewMs: 50_000,
          requiredLearnerKeywords: ['물', '햇빛'],
          ruleIds: ['KR_HW_01'],
          startMs: 35_000,
          teachBack: createTeachBack({
            contrast: {
              feedback: '괜찮아요. 물 마시는 장면을 다시 봐요.',
              id: 'heat-soda',
              label: '간식',
            },
            correct: {
              feedback: '맞아요. 물을 자주 마셔요.',
              id: 'heat-water',
              label: '물',
            },
            kind: 'object',
            prompt: '더운 날 자주 마실 것은 무엇일까요?',
            ruleIds: ['KR_HW_01'],
          }),
          uiElements: ['야외활동 자제', '물 자주 마시기'],
        },
        {
          actionReasons: ['혼자 있으면 도움을 못 받을 수 있어요.'],
          actionSteps: [
            '어르신과 어린이를 살펴요',
            '차 안 사람을 어른에게 말해요',
            '시원한 곳으로 가요',
          ],
          asrText:
            '거동이 불편한 분들은 잘 보살피고, 창문이 닫힌 자동차 안에 노약자나 어린이를 남겨두면 안 됩니다. 집에 냉방기가 없는 분들은 인근 무더위쉼터에서 더위를 피할 수 있습니다.',
          description: '더위에 약한 사람을 봐요.',
          endMs: 78_000,
          id: 'heatwave-care-shelter',
          label: '혼자 두지 않고 시원한 곳으로 가요',
          learnerExplanation: '시원한 곳으로 가요.',
          learnerPrompt: '더위에 약한 사람이 있어요.',
          learnerSequence: [
            '더위에 약한 사람이 있어요.',
            '어르신과 어린이를 살펴요.',
            '차 안 사람을 어른에게 말해요.',
            '시원한 곳으로 가요.',
          ],
          objectHints: [
            '자동차',
            '어린이',
            '어르신',
            '무더위쉼터',
            '시원한 장소',
          ],
          ocrTokens: ['장시간 외출 시 안부 확인', '무더위쉼터 이용'],
          phase: 'care_people',
          previewMs: 61_000,
          requiredLearnerKeywords: ['차', '시원한 곳'],
          ruleIds: ['KR_HW_02', 'KR_HW_03'],
          startMs: 58_000,
          teachBack: createTeachBack({
            contrast: {
              feedback: '괜찮아요. 차 안 장면을 다시 봐요.',
              id: 'heat-car',
              label: '차 안',
            },
            correct: {
              feedback: '맞아요. 시원한 곳이 나아요.',
              id: 'heat-cool-place',
              label: '시원한 곳',
            },
            kind: 'place',
            prompt: '너무 더울 때 어디가 나을까요?',
            ruleIds: ['KR_HW_03'],
          }),
          uiElements: ['노약자나 어린이 남겨두지 않기', '무더위쉼터 이용'],
        },
        {
          actionReasons: ['빨리 식혀야 몸이 나아져요.'],
          actionSteps: [
            '시원한 곳으로 가요',
            '물이나 이온 음료를 마셔요',
            '계속 아프면 병원에 가요',
          ],
          asrText:
            '피부가 뜨겁고 건조하고 붉게 변하거나 고열과 심한 두통, 식은땀, 탈진 증세 혹은 얼굴이 창백해지며 무력감 현기증이 난다면 시원한 장소로 이동하여 찬물이나 이온 음료를 마셔야 합니다. 증상이 회복되지 않으면 병원으로 이동해야 합니다.',
          description: '몸이 아프면 바로 쉬어요.',
          endMs: 104_000,
          id: 'heatwave-symptoms',
          label: '몸이 아프면 시원한 곳으로 가요',
          learnerExplanation: '몸이 아프면 바로 말해요.',
          learnerPrompt: '어지럽고 머리가 아파요.',
          learnerSequence: [
            '어지럽고 머리가 아파요.',
            '시원한 곳으로 가요.',
            '물이나 이온 음료를 마셔요.',
            '계속 아프면 병원에 가요.',
          ],
          objectHints: ['두통', '식은땀', '물', '이온 음료', '병원'],
          ocrTokens: ['고열', '두통', '탈진', '현기증', '병원'],
          phase: 'symptoms',
          previewMs: 90_000,
          requiredLearnerKeywords: ['병원', '물'],
          ruleIds: ['KR_HW_04'],
          startMs: 78_000,
          teachBack: createTeachBack({
            contrast: {
              feedback: '괜찮아요. 아픈 몸은 다시 봐요.',
              id: 'heat-hot-room',
              label: '더운 방',
            },
            correct: {
              feedback: '맞아요. 시원한 곳에서 쉬어요.',
              id: 'heat-cool-room',
              label: '시원한 곳',
            },
            kind: 'place',
            prompt: '어지럽고 머리가 아프면 어디로 갈까요?',
            ruleIds: ['KR_HW_04'],
          }),
          uiElements: ['찬물이나 이온 음료', '병원으로 이동'],
        },
      ],
    },
    {
      accentClassName: 'bg-indigo-400',
      hazard: 'coldwave',
      homeNote: '추울 때 따뜻하게 입고 얼음길을 천천히 걸어요',
      homeTitle: '너무 추울 때',
      id: 'coldwave-safety-flow',
      note: '집을 따뜻하게 하고, 따뜻한 옷과 장갑을 챙기고, 얼음길을 조심해요',
      posterSrc: '/demo-video/seasonal/coldwave-practice-001.jpg',
      title: '너무 추울 때',
      videoSrc: '/demo-video/seasonal/coldwave-practice-001.mp4',
      segments: [
        {
          asrText:
            '매서운 추위로 건강과 안전을 위협하는 한파 피해. 한파 피해 예방을 위해 이렇게 행동해 주세요.',
          description: '한파 연습을 시작해요.',
          endMs: 10_000,
          id: 'coldwave-intro',
          label: '추운 날을 배워요',
          learnerExplanation: '추운 날 어떻게 할지 배워요.',
          learnerPrompt: '날씨가 아주 추워졌어요.',
          learnerSequence: [
            '날씨가 아주 추워졌어요.',
            '몸이 차가워질 수 있어요.',
            '다음 장면부터 따라 해요.',
          ],
          objectHints: ['겨울', '눈길', '한파 제목', '추위'],
          ocrTokens: ['한파 피해', '행동요령'],
          phase: 'indoor_warm',
          practiceMode: 'intro',
          ruleIds: ['KR_CW_01'],
          startMs: 0,
          teachBack: createTeachBack({
            contrast: {
              feedback: '괜찮아요. 아직 행동을 고르는 장면은 아니에요.',
              id: 'cold-action-card',
              label: '행동 카드',
            },
            correct: {
              feedback: '맞아요. 추운 날 연습이 시작되는 장면이에요.',
              id: 'cold-start',
              label: '연습 시작',
            },
            kind: 'signal',
            prompt: '이 장면은 무엇을 알려줄까요?',
            ruleIds: ['KR_CW_01'],
          }),
          uiElements: ['한파 대비 5가지 행동요령'],
        },
        {
          actionReasons: ['몸이 너무 차가워지면 아파요.'],
          actionSteps: [
            '날씨를 봐요',
            '집 안을 따뜻하게 해요',
            '몸이 떨리면 어른에게 말해요',
          ],
          asrText:
            '한파가 발생하는 겨울철에는 수시로 기상상황을 확인하고 건강을 위해 실내 적정 온도를 유지합니다.',
          description: '집 안을 따뜻하게 해요.',
          endMs: 25_000,
          id: 'coldwave-indoor',
          label: '집 안을 따뜻하게 해요',
          learnerExplanation: '집 안을 따뜻하게 해요.',
          learnerPrompt: '밖이 많이 추워요.',
          learnerSequence: [
            '밖이 많이 추워요.',
            '날씨를 봐요.',
            '집 안을 따뜻하게 해요.',
            '몸이 떨리면 어른에게 말해요.',
          ],
          objectHints: ['실내 온도', '날씨 화면', '난방', '집 안'],
          ocrTokens: ['실내 적정 온도', '기상상황 확인'],
          phase: 'indoor_warm',
          previewMs: 15_000,
          requiredLearnerKeywords: ['따뜻하게', '어른'],
          ruleIds: ['KR_CW_01'],
          startMs: 10_000,
          teachBack: createTeachBack({
            contrast: {
              feedback: '괜찮아요. 집 안 온도 장면을 다시 봐요.',
              id: 'cold-outside',
              label: '밖',
            },
            correct: {
              feedback: '맞아요. 따뜻한 집 안이 나아요.',
              id: 'cold-inside',
              label: '집 안',
            },
            kind: 'place',
            prompt: '너무 추울 때 어디가 나을까요?',
            ruleIds: ['KR_CW_01'],
          }),
          uiElements: ['실내 적정 온도 유지'],
        },
        {
          actionReasons: ['넘어질 때 손으로 몸을 지켜요.'],
          actionSteps: [
            '따뜻한 옷을 입어요',
            '장갑을 껴요',
            '작게 천천히 걸어요',
          ],
          asrText:
            '외출 시에는 내복, 목도리, 장갑 등 방한용품을 착용해 보온에 유의하고 굽이 낮고 미끄럼이 방지되는 신발을 신은 후 평소보다 보폭을 줄여 걷는 것이 좋습니다.',
          description: '따뜻하게 입고 천천히 걸어요.',
          endMs: 43_000,
          id: 'coldwave-clothes-walk',
          label: '따뜻하게 입고 천천히 걸어요',
          learnerExplanation: '따뜻하게 입고 천천히 걸어요.',
          learnerPrompt: '밖에 나가야 해요.',
          learnerSequence: [
            '밖에 나가야 해요.',
            '따뜻한 옷을 입어요.',
            '장갑을 껴요.',
            '작게 천천히 걸어요.',
          ],
          objectHints: ['목도리', '장갑', '미끄럼 적은 신발', '얼음길'],
          ocrTokens: ['내복', '목도리', '장갑', '미끄럼 방지 신발'],
          phase: 'outside_clothes',
          previewMs: 30_000,
          requiredLearnerKeywords: ['장갑', '천천히'],
          ruleIds: ['KR_CW_02'],
          startMs: 25_000,
          teachBack: createTeachBack({
            contrast: {
              feedback: '괜찮아요. 장갑 장면을 다시 봐요.',
              id: 'cold-pocket',
              label: '주머니',
            },
            correct: {
              feedback: '맞아요. 장갑을 끼면 손이 따뜻해요.',
              id: 'cold-gloves',
              label: '장갑',
            },
            kind: 'object',
            prompt: '눈길을 걸을 때 손에는 무엇이 좋을까요?',
            ruleIds: ['KR_CW_02'],
          }),
          uiElements: ['방한용품 착용', '보폭 줄여 걷기'],
        },
        {
          actionReasons: ['수도관이 얼면 물을 쓰기 어려워요.'],
          actionSteps: [
            '수도관은 어른이 감싸요',
            '물을 조금 틀어 둬요',
            '고장나면 어른에게 말해요',
          ],
          asrText:
            '수도 계량기와 수도관 내부, 보일러 배관 등은 헌옷, 테이프 등으로 찬공기를 막아 보온하고 장시간 외출 시에는 온수를 약하게 틀어 수도관이 얼지 않도록 합니다.',
          description: '수도관은 어른과 봐요.',
          endMs: 60_000,
          id: 'coldwave-pipes',
          label: '수도관을 따뜻하게 해요',
          learnerExplanation: '수도관은 어른과 봐요.',
          learnerPrompt: '수도관이 얼 수 있어요.',
          learnerSequence: [
            '수도관이 얼 수 있어요.',
            '수도관은 어른이 감싸요.',
            '물을 조금 틀어 둬요.',
            '고장나면 어른에게 말해요.',
          ],
          objectHints: ['수도 계량기', '수도관', '보일러 배관', '온수'],
          ocrTokens: ['수도계량기', '수도관', '보일러 배관', '온수'],
          phase: 'pipes_farm',
          previewMs: 48_000,
          requiredLearnerKeywords: ['수도관', '어른'],
          ruleIds: ['KR_CW_03'],
          startMs: 43_000,
          teachBack: createTeachBack({
            contrast: {
              feedback: '괜찮아요. 어른과 보는 장면을 다시 봐요.',
              id: 'cold-alone',
              label: '혼자',
            },
            correct: {
              feedback: '맞아요. 수도관은 어른과 봐요.',
              id: 'cold-adult',
              label: '어른',
            },
            kind: 'person',
            prompt: '수도관이 얼면 누구에게 말할까요?',
            ruleIds: ['KR_CW_03'],
          }),
          uiElements: ['수도관 보온', '온수 약하게 틀기'],
        },
        {
          actionReasons: ['얼음길에서는 차가 미끄러질 수 있어요.'],
          actionSteps: [
            '겨울 물건을 챙겨요',
            '차 유리의 얼음을 없애요',
            '천천히 가요',
          ],
          asrText:
            '운전자의 경우 스노우체인과 같은 월동용품을 미리 준비하고 앞유리의 성에를 완전히 제거한 후 운전해야 합니다. 평소보다 속도를 낮추고 도로결빙이 생기기 쉬운 곳에서 더욱 주의해 운행하도록 합니다.',
          description: '차는 천천히 가야 해요.',
          endMs: 89_000,
          id: 'coldwave-driving',
          label: '눈길에서는 차도 천천히 가요',
          learnerExplanation: '차도 천천히 가야 해요.',
          learnerPrompt: '길이 얼어 미끄러워요.',
          learnerSequence: [
            '길이 얼어 미끄러워요.',
            '겨울 물건을 챙겨요.',
            '차 유리의 얼음을 없애요.',
            '천천히 가요.',
          ],
          objectHints: ['스노우체인', '앞유리 성에', '빙판길', '자동차'],
          ocrTokens: ['월동용품', '성에 제거', '속도 낮추기', '도로결빙'],
          phase: 'winter_driving',
          previewMs: 70_000,
          requiredLearnerKeywords: ['차', '천천히'],
          ruleIds: ['KR_CW_04'],
          startMs: 60_000,
          teachBack: createTeachBack({
            contrast: {
              feedback: '괜찮아요. 얼음길 장면을 다시 봐요.',
              id: 'cold-fast-car',
              label: '빠른 차',
            },
            correct: {
              feedback: '맞아요. 천천히 가는 차가 나아요.',
              id: 'cold-slow-car',
              label: '천천히 가는 차',
            },
            kind: 'object',
            prompt: '얼음길에서는 어떤 차가 나을까요?',
            ruleIds: ['KR_CW_04'],
          }),
          uiElements: ['속도 낮추기', '도로결빙 주의'],
        },
      ],
    },
    {
      accentClassName: 'bg-slate-400',
      hazard: 'heavy_snow',
      homeNote: '눈이 많이 올 때 밖에 덜 나가고 눈길을 조심해요',
      homeTitle: '눈이 많이 올 때',
      id: 'heavy-snow-safety-flow',
      note: '눈이 많이 오면 밖에 덜 나가고, 신발과 장갑을 챙기고, 차도 천천히 가요',
      posterSrc: '/demo-video/seasonal/heavy-snow-practice-001.jpg',
      title: '눈이 많이 올 때',
      videoSrc: '/demo-video/seasonal/heavy-snow-practice-001.mp4',
      segments: [
        {
          asrText:
            '적설 피해, 눈사태 피해, 교통사고 피해. 대설로 인해 발생하는 수많은 피해를 안전행동요령으로 막을 수 있습니다.',
          description: '눈이 많이 올 때를 배워요.',
          endMs: 13_000,
          id: 'heavy-snow-intro',
          label: '눈 오는 날을 배워요',
          learnerExplanation: '눈 오는 날 어떻게 할지 배워요.',
          learnerPrompt: '눈이 많이 올 수 있어요.',
          learnerSequence: [
            '눈이 많이 올 수 있어요.',
            '길이 미끄러울 수 있어요.',
            '다음 장면부터 따라 해요.',
          ],
          objectHints: ['대설', '눈길', '눈사태', '교통사고'],
          ocrTokens: ['대설 피해', '눈사태', '교통사고'],
          phase: 'home_snow',
          practiceMode: 'intro',
          ruleIds: ['KR_SN_01'],
          startMs: 0,
          teachBack: createTeachBack({
            contrast: {
              feedback: '괜찮아요. 아직 행동을 고르는 장면은 아니에요.',
              id: 'snow-action-card',
              label: '행동 카드',
            },
            correct: {
              feedback: '맞아요. 눈 오는 날 연습이 시작되는 장면이에요.',
              id: 'snow-start',
              label: '연습 시작',
            },
            kind: 'signal',
            prompt: '이 장면은 무엇을 알려줄까요?',
            ruleIds: ['KR_SN_01'],
          }),
          uiElements: ['대설 피해 예방 5가지 행동수칙'],
        },
        {
          actionReasons: ['눈길에서는 넘어지기 쉬워요.'],
          actionSteps: [
            '집에 머물러요',
            '집 주변 눈은 어른과 치워요',
            '낮은 곳에서 치워요',
          ],
          asrText:
            '대설이 예보되면 외출을 자제하고 집 근처와 지붕 위에 눈이 쌓이지 않도록 수시로 치워야 합니다.',
          description: '밖에 덜 나가고 눈을 치워요.',
          endMs: 28_000,
          id: 'heavy-snow-home',
          label: '밖에 덜 나가고 눈은 어른과 치워요',
          learnerExplanation: '밖에 덜 나가고 눈은 어른과 치워요.',
          learnerPrompt: '눈이 많이 온다고 해요.',
          learnerSequence: [
            '눈이 많이 온다고 해요.',
            '집에 머물러요.',
            '집 주변 눈은 어른과 치워요.',
            '낮은 곳에서 치워요.',
          ],
          objectHints: ['눈 치우기', '집 근처', '지붕', '외출 자제'],
          ocrTokens: ['외출 자제', '집 근처', '지붕 위 눈 치우기'],
          phase: 'home_snow',
          previewMs: 18_000,
          requiredLearnerKeywords: ['눈', '어른'],
          ruleIds: ['KR_SN_01'],
          startMs: 13_000,
          teachBack: createTeachBack({
            contrast: {
              feedback: '괜찮아요. 어른과 하는 장면을 다시 봐요.',
              id: 'snow-alone-roof',
              label: '지붕',
            },
            correct: {
              feedback: '맞아요. 어른과 같이 해요.',
              id: 'snow-adult',
              label: '어른',
            },
            kind: 'person',
            prompt: '집 주변 눈은 누구와 치울까요?',
            ruleIds: ['KR_SN_01'],
          }),
          uiElements: ['외출 자제', '집 근처와 지붕 위 눈 치우기'],
        },
        {
          actionReasons: ['눈이 쌓이면 길이 막힐 수 있어요.'],
          actionSteps: [
            '먹을 것과 약을 챙겨요',
            '산길에서 나와요',
            '안전한 곳으로 가요',
          ],
          asrText:
            '산간 고립이나 눈사태 피해가 우려되는 위험지역에서는 식량, 응급용품과 같은 비상용품을 준비한 후 안전한 곳으로 이동해야 합니다.',
          description: '산길에서는 안전한 곳으로 가요.',
          endMs: 42_000,
          id: 'heavy-snow-isolated',
          label: '산길에서는 안전한 곳으로 가요',
          learnerExplanation: '산길에서 나와요.',
          learnerPrompt: '산이나 외딴 곳에 있어요.',
          learnerSequence: [
            '산이나 외딴 곳에 있어요.',
            '먹을 것과 약을 챙겨요.',
            '산길에서 나와요.',
            '안전한 곳으로 가요.',
          ],
          objectHints: ['산간', '눈사태', '비상용품', '식량', '응급용품'],
          ocrTokens: ['산간 고립', '눈사태', '비상용품', '안전한 곳'],
          phase: 'isolated_area',
          previewMs: 32_000,
          requiredLearnerKeywords: ['산', '먹을 것'],
          ruleIds: ['KR_SN_02'],
          startMs: 28_000,
          teachBack: createTeachBack({
            contrast: {
              feedback: '괜찮아요. 산길 장면을 다시 봐요.',
              id: 'snow-mountain',
              label: '산길',
            },
            correct: {
              feedback: '맞아요. 어른이 정한 안전한 곳으로 가요.',
              id: 'snow-safe-place',
              label: '안전한 곳',
            },
            kind: 'place',
            prompt: '눈이 많이 쌓인 산길에서는 어디가 나을까요?',
            ruleIds: ['KR_SN_02'],
          }),
          uiElements: ['비상용품 준비', '안전한 곳으로 이동'],
        },
        {
          actionReasons: ['손을 빼고 걸어야 몸을 지켜요.'],
          actionSteps: [
            '미끄럼 적은 신발을 신어요',
            '장갑을 껴요',
            '손을 빼고 걸어요',
          ],
          asrText:
            '외출할 시에는 바닥면이 넓은 운동화나 등산화를 착용해 미끄럼 사고를 예방하고 주머니에 손을 넣는 대신 보온장갑을 이용해 체온을 유지해야 합니다.',
          description: '눈길에서는 신발과 장갑을 챙겨요.',
          endMs: 55_000,
          id: 'heavy-snow-walk',
          label: '신발과 장갑을 챙겨요',
          learnerExplanation: '신발과 장갑을 챙겨요.',
          learnerPrompt: '눈길을 걸어야 해요.',
          learnerSequence: [
            '눈길을 걸어야 해요.',
            '미끄럼 적은 신발을 신어요.',
            '장갑을 껴요.',
            '손을 빼고 걸어요.',
          ],
          objectHints: ['운동화', '등산화', '장갑', '눈길', '주머니'],
          ocrTokens: ['운동화', '등산화', '보온장갑', '주머니'],
          phase: 'walk_safely',
          previewMs: 46_000,
          requiredLearnerKeywords: ['신발', '장갑'],
          ruleIds: ['KR_SN_03'],
          startMs: 42_000,
          teachBack: createTeachBack({
            contrast: {
              feedback: '괜찮아요. 장갑 장면을 다시 봐요.',
              id: 'snow-pocket',
              label: '주머니',
            },
            correct: {
              feedback: '맞아요. 장갑을 끼고 손을 빼고 걸어요.',
              id: 'snow-gloves',
              label: '장갑',
            },
            kind: 'object',
            prompt: '눈길을 걸을 때 손에는 무엇이 좋을까요?',
            ruleIds: ['KR_SN_03'],
          }),
          uiElements: ['미끄럼 사고 예방', '보온장갑 이용'],
        },
        {
          actionReasons: ['눈길에서는 차가 미끄러질 수 있어요.'],
          actionSteps: [
            '차 물건을 챙겨요',
            '천천히 가요',
            '앞차와 멀리 떨어져요',
          ],
          asrText:
            '운전시에는 체인, 염화칼슘, 삽과 같은 차량용 안전장비를 반드시 구비하고 사고 위험이 높은 구간에서의 서행 및 안전거리를 유지하여 눈길 교통사고를 예방할 수 있도록 합니다.',
          description: '눈길에서는 차도 천천히 가요.',
          endMs: 79_000,
          id: 'heavy-snow-driving',
          label: '눈길에서는 차도 천천히 가요',
          learnerExplanation: '차도 천천히 가야 해요.',
          learnerPrompt: '차가 눈길을 가야 해요.',
          learnerSequence: [
            '차가 눈길을 가야 해요.',
            '차 물건을 챙겨요.',
            '천천히 가요.',
            '앞차와 멀리 떨어져요.',
          ],
          objectHints: ['체인', '삽', '염화칼슘', '자동차', '눈길'],
          ocrTokens: ['체인', '염화칼슘', '삽', '서행', '안전거리'],
          phase: 'snow_driving',
          previewMs: 62_000,
          requiredLearnerKeywords: ['차', '천천히'],
          ruleIds: ['KR_SN_04'],
          startMs: 55_000,
          teachBack: createTeachBack({
            contrast: {
              feedback: '괜찮아요. 눈길 차 장면을 다시 봐요.',
              id: 'snow-fast-car',
              label: '빠른 차',
            },
            correct: {
              feedback: '맞아요. 천천히 가는 차가 나아요.',
              id: 'snow-slow-car',
              label: '천천히 가는 차',
            },
            kind: 'object',
            prompt: '눈길에서는 어떤 차가 나을까요?',
            ruleIds: ['KR_SN_04'],
          }),
          uiElements: ['서행', '안전거리 유지'],
        },
      ],
    },
  ]
}

function getRefinedSeasonalScenarioSeeds(): SeasonalScenarioSeed[] {
  const legacyById = new Map(
    getSeasonalScenarioSeeds().map((scenario) => [scenario.id, scenario]),
  )
  const withSegments = (
    id: SeasonalScenarioSeed['id'],
    segments: SeasonalSegmentSeed[],
  ): SeasonalScenarioSeed => {
    const scenario = legacyById.get(id)

    if (!scenario) {
      throw new Error(`Missing seasonal scenario seed: ${id}`)
    }

    return { ...scenario, segments }
  }

  return [
    withSegments('heavy-rain-safety-flow', [
      {
        asrText:
          '집중호우는 짧은 시간에 많은 비가 내리는 자연재난입니다. 집이 잠기고 하천이 넘칠 수 있으니 미리 대비하면 피해를 줄일 수 있습니다.',
        description: '비가 많이 올 수 있어요.',
        endMs: 25_000,
        id: 'heavy-rain-intro',
        label: '비가 많이 올 때 배워요',
        learnerExplanation: '비가 많이 올 때를 배워요.',
        learnerPrompt: '비가 갑자기 많이 올 수 있어요.',
        learnerSequence: [
          '비가 갑자기 많이 올 수 있어요.',
          '물이 빨리 불어날 수 있어요.',
          '다음 장면부터 따라 해요.',
        ],
        objectHints: ['폭우', '하천', '집중호우 소개', '물에 잠긴 길'],
        ocrTokens: ['집중호우', '강한 비', '하천', '침수'],
        phase: 'forecast',
        practiceMode: 'intro',
        ruleIds: ['KR_HR_01'],
        startMs: 0,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 아직 행동을 고르는 장면은 아니에요.',
            id: 'rain-act-now',
            label: '행동 카드',
          },
          correct: {
            feedback: '맞아요. 비가 많이 올 때 배우는 시작 장면이에요.',
            id: 'rain-intro',
            label: '연습 시작',
          },
          kind: 'signal',
          prompt: '이 장면은 무엇을 알려줄까요?',
          ruleIds: ['KR_HR_01'],
        }),
        uiElements: ['집중호우 발생 시 행동요령'],
      },
      {
        actionReasons: ['비가 오기 전 미리 알아야 해요.'],
        actionSteps: ['날씨 알림을 봐요', '밖에 덜 나가요'],
        asrText:
          '호우예보가 발령되면 내가 사는 곳에 비가 언제 많이 오는지 미리 파악하고 외출을 자제합니다.',
        description: '비 오기 전 날씨를 봐요.',
        endMs: 55_000,
        id: 'heavy-rain-forecast-timing',
        label: '비 오기 전 날씨를 봐요',
        learnerExplanation: '비 오기 전 알림을 봐요.',
        learnerPrompt: '비가 많이 온다는 알림이 왔어요.',
        learnerSequence: [
          '비가 많이 온다는 알림이 왔어요.',
          '날씨 알림을 봐요.',
          '밖에 덜 나가요.',
        ],
        objectHints: ['스마트폰 알림', '날씨 화면', '호우예보'],
        ocrTokens: ['호우예보', '기상상황', '외출 자제'],
        phase: 'forecast',
        previewMs: 40_000,
        requiredLearnerKeywords: ['날씨'],
        ruleIds: ['KR_HR_01'],
        startMs: 25_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 밖에 나가기 전 알림을 다시 봐요.',
            id: 'rain-trip-plan',
            label: '놀이 계획',
          },
          correct: {
            feedback: '맞아요. 날씨 알림을 먼저 봐요.',
            id: 'rain-alert',
            label: '날씨 알림',
          },
          kind: 'signal',
          prompt: '비가 오기 전 무엇을 먼저 볼까요?',
          ruleIds: ['KR_HR_01'],
        }),
        uiElements: ['호우예보 발령 시 기상상황 확인'],
      },
      {
        actionReasons: ['재난 알림을 바로 볼 수 있어요.'],
        actionSteps: ['안전디딤돌 앱을 봐요', '재난 알림을 봐요'],
        asrText:
          '스마트폰에는 안전디딤돌 앱을 설치해 재난안전 정보를 받아볼 수 있도록 합니다.',
        description: '재난 알림을 받을 준비를 해요.',
        endMs: 78_000,
        id: 'heavy-rain-safety-app',
        label: '안전디딤돌 앱을 봐요',
        learnerExplanation: '재난 알림을 봐요.',
        learnerPrompt: '재난 알림을 볼 수 있어요.',
        learnerSequence: [
          '재난 알림을 볼 수 있어요.',
          '안전디딤돌 앱을 봐요.',
          '재난 알림을 봐요.',
        ],
        objectHints: ['스마트폰', '안전디딤돌', '재난 알림'],
        ocrTokens: ['안전디딤돌', '재난안전정보'],
        phase: 'forecast',
        previewMs: 62_000,
        requiredLearnerKeywords: ['안전디딤돌'],
        ruleIds: ['KR_HR_01'],
        startMs: 55_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 재난 알림 장면을 다시 봐요.',
            id: 'rain-game-app',
            label: '게임 앱',
          },
          correct: {
            feedback: '맞아요. 안전디딤돌 앱을 봐요.',
            id: 'rain-safe-app',
            label: '안전디딤돌',
          },
          kind: 'signal',
          prompt: '재난 알림은 어디에서 볼까요?',
          ruleIds: ['KR_HR_01'],
        }),
        uiElements: ['재난안전정보 앱 안전디딤돌 설치'],
      },
      {
        actionReasons: ['헤어져도 만날 곳을 알아야 해요.'],
        actionSteps: ['가족과 연락 방법을 정해요', '갈 곳을 정해요'],
        asrText:
          '가족과 연락 방법을 공유하고 대피할 장소도 확인해 둡니다. 식수와 손전등 같은 비상 물건도 준비합니다.',
        description: '가족과 만날 곳을 정해요.',
        endMs: 102_000,
        id: 'heavy-rain-family-shelter',
        label: '가족과 만날 곳을 정해요',
        learnerExplanation: '가족과 갈 곳을 정해요.',
        learnerPrompt: '비가 많이 오기 전에 정해요.',
        learnerSequence: [
          '비가 많이 오기 전에 정해요.',
          '가족과 연락 방법을 정해요.',
          '갈 곳을 정해요.',
        ],
        objectHints: ['가족 연락', '대피 장소', '식수', '손전등'],
        ocrTokens: ['가족과 연락 방법 공유', '대피 장소', '식수', '손전등'],
        phase: 'prepare_home',
        previewMs: 88_000,
        requiredLearnerKeywords: ['가족'],
        ruleIds: ['KR_HR_02'],
        startMs: 78_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 가족 연락 장면을 다시 봐요.',
            id: 'rain-unknown-place',
            label: '모르는 곳',
          },
          correct: {
            feedback: '맞아요. 가족과 정한 곳을 기억해요.',
            id: 'rain-family-place',
            label: '가족과 정한 곳',
          },
          kind: 'place',
          prompt: '비가 많이 오기 전 어디를 정할까요?',
          ruleIds: ['KR_HR_02'],
        }),
        uiElements: ['가족 연락 방법 공유', '대피 장소 확인'],
      },
      {
        actionReasons: ['물이 잘 빠져야 집이 덜 잠겨요.'],
        actionSteps: ['배수로를 어른과 봐요', '무너질 곳은 어른에게 말해요'],
        asrText:
          '집 주변 배수로는 깨끗하게 관리하고, 산사태가 날 수 있는 비탈면이나 담장은 미리 살핀 뒤 위험하면 어른이나 관청에 알려야 합니다.',
        description: '집 주변 물길을 봐요.',
        endMs: 126_000,
        id: 'heavy-rain-drain-slope',
        label: '집 주변 물길을 봐요',
        learnerExplanation: '물길은 어른과 봐요.',
        learnerPrompt: '집 주변에 물이 막힐 수 있어요.',
        learnerSequence: [
          '집 주변에 물이 막힐 수 있어요.',
          '배수로를 어른과 봐요.',
          '무너질 곳은 어른에게 말해요.',
        ],
        objectHints: ['배수로', '비탈면', '담장', '무너질 곳'],
        ocrTokens: ['배수로', '비탈면', '담장', '위험지역'],
        phase: 'prepare_home',
        previewMs: 112_000,
        requiredLearnerKeywords: ['어른'],
        ruleIds: ['KR_HR_02'],
        startMs: 102_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 배수로 장면을 다시 봐요.',
            id: 'rain-toy',
            label: '장난감',
          },
          correct: {
            feedback: '맞아요. 배수로를 어른과 봐요.',
            id: 'rain-drain',
            label: '배수로',
          },
          kind: 'object',
          prompt: '물이 막히지 않게 무엇을 볼까요?',
          ruleIds: ['KR_HR_02'],
        }),
        uiElements: ['배수로 관리', '비탈면과 담장 점검'],
      },
      {
        actionReasons: ['물이 차면 차와 집이 위험해요.'],
        actionSteps: ['차를 높은 곳에 세워요', '가스와 전기는 어른과 봐요'],
        asrText:
          '차량은 높은 곳으로 옮기고 연료를 채워 둡니다. 집이 잠길 수 있으면 가스밸브와 전기 차단기는 어른이 미리 봅니다.',
        description: '차와 집도 미리 준비해요.',
        endMs: 153_000,
        id: 'heavy-rain-car-gas-power',
        label: '차와 집도 미리 준비해요',
        learnerExplanation: '차와 집은 어른과 봐요.',
        learnerPrompt: '물이 차기 전에 준비해요.',
        learnerSequence: [
          '물이 차기 전에 준비해요.',
          '차를 높은 곳에 세워요.',
          '가스와 전기는 어른과 봐요.',
        ],
        objectHints: ['자동차', '높은 곳', '가스밸브', '전기 차단기'],
        ocrTokens: ['차량은 높은 곳', '가스밸브', '전기 차단기'],
        phase: 'prepare_home',
        previewMs: 137_000,
        requiredLearnerKeywords: ['가스', '전기'],
        ruleIds: ['KR_HR_02'],
        startMs: 126_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 높은 곳 장면을 다시 봐요.',
            id: 'rain-low-parking',
            label: '낮은 주차장',
          },
          correct: {
            feedback: '맞아요. 차는 높은 곳에 세워요.',
            id: 'rain-high-parking',
            label: '높은 곳',
          },
          kind: 'place',
          prompt: '비가 많이 오기 전 차는 어디가 나을까요?',
          ruleIds: ['KR_HR_02'],
        }),
        uiElements: ['차량은 높은 곳으로 이동', '가스밸브와 전기 차단기'],
      },
      {
        actionReasons: ['낮은 길은 물이 빨리 차요.'],
        actionSteps: ['낮은 길에서 멀어져요', '안전한 곳으로 가요'],
        asrText:
          '밖에 있다면 지하차도와 낮은 길을 벗어나 안전한 곳으로 이동합니다.',
        description: '낮은 길에서 멀어져요.',
        endMs: 174_000,
        id: 'heavy-rain-low-road',
        label: '낮은 길에서 멀어져요',
        learnerExplanation: '낮은 길에서 멀어져요.',
        learnerPrompt: '길에 물이 많이 찼어요.',
        learnerSequence: [
          '길에 물이 많이 찼어요.',
          '낮은 길에서 멀어져요.',
          '안전한 곳으로 가요.',
        ],
        objectHints: ['지하차도', '낮은 길', '물에 잠긴 길'],
        ocrTokens: ['저지대', '지하차도', '안전지대'],
        phase: 'avoid_water',
        previewMs: 162_000,
        requiredLearnerKeywords: ['낮은 길'],
        ruleIds: ['KR_HR_03'],
        startMs: 153_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 물이 찬 길 장면을 다시 봐요.',
            id: 'rain-low-road',
            label: '낮은 길',
          },
          correct: {
            feedback: '맞아요. 높은 곳이 더 나아요.',
            id: 'rain-high-place',
            label: '높은 곳',
          },
          kind: 'place',
          prompt: '물이 찬 길이 보이면 어디가 나을까요?',
          ruleIds: ['KR_HR_03'],
        }),
        uiElements: ['저지대와 지하차도 벗어나기'],
      },
      {
        actionReasons: ['물이 차면 구멍과 전기가 위험해요.'],
        actionSteps: [
          '공사장에서 멀어져요',
          '전신주에서 멀어져요',
          '맨홀에서 멀어져요',
        ],
        asrText:
          '공사장, 가로등, 신호등, 전신주와 지하공간 같은 위험한 곳에는 가까이 가지 않습니다. 맨홀도 물에 가려 보이지 않을 수 있어 멀리합니다.',
        description: '공사장과 맨홀에서 멀어져요.',
        endMs: 193_000,
        id: 'heavy-rain-danger-objects',
        label: '공사장과 맨홀에서 멀어져요',
        learnerExplanation: '다칠 수 있는 곳에서 멀어져요.',
        learnerPrompt: '물속에 다칠 수 있는 것이 있을 수 있어요.',
        learnerSequence: [
          '물속에 다칠 수 있는 것이 있을 수 있어요.',
          '공사장에서 멀어져요.',
          '전신주에서 멀어져요.',
          '맨홀에서 멀어져요.',
        ],
        objectHints: ['공사장', '전신주', '맨홀', '가로등', '지하공간'],
        ocrTokens: ['공사장', '전신주', '맨홀', '지하공간'],
        phase: 'avoid_water',
        previewMs: 184_000,
        requiredLearnerKeywords: ['맨홀'],
        ruleIds: ['KR_HR_03'],
        startMs: 174_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 맨홀 장면을 다시 봐요.',
            id: 'rain-manhole',
            label: '맨홀 근처',
          },
          correct: {
            feedback: '맞아요. 맨홀에서 떨어진 곳이 나아요.',
            id: 'rain-away-manhole',
            label: '떨어진 곳',
          },
          kind: 'place',
          prompt: '맨홀이 보이면 어디가 나을까요?',
          ruleIds: ['KR_HR_03'],
        }),
        uiElements: ['공사장과 전신주 접근 금지', '맨홀 접근 금지'],
      },
      {
        actionReasons: ['물살이 세면 몸이 떠밀릴 수 있어요.'],
        actionSteps: ['높은 곳으로 돌아가요', '계곡에서 나와요'],
        asrText:
          '물에 잠긴 도로와 다리, 계곡은 건너지 않습니다. 물살이 세면 휩쓸릴 수 있으니 높은 곳으로 돌아갑니다.',
        description: '물 찬 길을 건너지 않아요.',
        endMs: 214_000,
        id: 'heavy-rain-flood-road-valley',
        label: '물 찬 길을 건너지 않아요',
        learnerExplanation: '높은 곳으로 돌아가요.',
        learnerPrompt: '도로와 계곡에 물이 찼어요.',
        learnerSequence: [
          '도로와 계곡에 물이 찼어요.',
          '높은 곳으로 돌아가요.',
          '계곡에서 나와요.',
        ],
        objectHints: ['침수 도로', '다리', '계곡', '급류'],
        ocrTokens: ['침수된 도로', '다리', '계곡', '급류'],
        phase: 'avoid_water',
        previewMs: 203_000,
        requiredLearnerKeywords: ['계곡'],
        ruleIds: ['KR_HR_03'],
        startMs: 193_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 물 찬 길 장면을 다시 봐요.',
            id: 'rain-bridge-water',
            label: '물 찬 다리',
          },
          correct: {
            feedback: '맞아요. 높은 곳으로 돌아가요.',
            id: 'rain-high-return',
            label: '높은 곳',
          },
          kind: 'place',
          prompt: '물이 찬 다리 대신 어디로 갈까요?',
          ruleIds: ['KR_HR_03'],
        }),
        uiElements: ['침수된 도로, 다리, 계곡 건너지 않기'],
      },
      {
        actionReasons: ['집이 약해졌을 수 있어요.'],
        actionSteps: ['밖에서 기다려요', '어른과 같이 들어가요'],
        asrText:
          '호우가 지나간 뒤 집이 침수되었다면 바로 들어가지 말고 무너질 곳이 없는지 먼저 봅니다.',
        description: '집은 어른과 같이 봐요.',
        endMs: 232_000,
        id: 'heavy-rain-return-home',
        label: '집은 어른과 같이 봐요',
        learnerExplanation: '집은 어른과 봐요.',
        learnerPrompt: '물이 빠지고 집으로 돌아왔어요.',
        learnerSequence: [
          '물이 빠지고 집으로 돌아왔어요.',
          '밖에서 기다려요.',
          '어른과 같이 들어가요.',
        ],
        objectHints: ['물에 잠긴 집', '문', '무너질 곳', '밖에서 기다림'],
        ocrTokens: ['침수', '붕괴 가능성', '점검'],
        phase: 'after_flood',
        previewMs: 222_000,
        requiredLearnerKeywords: ['어른'],
        ruleIds: ['KR_HR_04'],
        startMs: 214_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 집에 들어가기 전 장면을 다시 봐요.',
            id: 'rain-home-alone',
            label: '혼자',
          },
          correct: {
            feedback: '맞아요. 어른과 같이 봐요.',
            id: 'rain-adult-home',
            label: '어른과 같이',
          },
          kind: 'person',
          prompt: '물이 빠진 집은 누구와 볼까요?',
          ruleIds: ['KR_HR_04'],
        }),
        uiElements: ['침수 시 구조적 붕괴 가능성 점검'],
      },
      {
        actionReasons: ['가스 냄새와 젖은 음식은 위험해요.'],
        actionSteps: [
          '냄새가 나면 창문을 열어요',
          '깨끗한 물만 마셔요',
          '젖은 음식은 어른에게 말해요',
        ],
        asrText:
          '물에 잠긴 집안은 가스가 차 있을 수 있으니까 환기시킨 뒤 들어갑니다. 수돗물과 저장식수는 안전한 것만 사용하고 침수된 음식물은 먹거나 요리재료로 쓰지 않습니다.',
        description: '냄새와 음식도 조심해요.',
        endMs: 257_000,
        id: 'heavy-rain-vent-food-water',
        label: '냄새와 음식도 조심해요',
        learnerExplanation: '냄새와 음식은 어른과 봐요.',
        learnerPrompt: '집 안에서 냄새가 날 수 있어요.',
        learnerSequence: [
          '집 안에서 냄새가 날 수 있어요.',
          '냄새가 나면 창문을 열어요.',
          '깨끗한 물만 마셔요.',
          '젖은 음식은 어른에게 말해요.',
        ],
        objectHints: ['창문 열기', '가스 냄새', '수돗물', '젖은 음식'],
        ocrTokens: ['환기', '가스배출', '안전한 식수', '침수된 음식물'],
        phase: 'after_flood',
        previewMs: 244_000,
        requiredLearnerKeywords: ['젖은 음식', '어른'],
        ruleIds: ['KR_HR_04'],
        startMs: 232_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 젖은 음식 장면을 다시 봐요.',
            id: 'rain-wet-food',
            label: '젖은 음식',
          },
          correct: {
            feedback: '맞아요. 깨끗한 물만 마셔요.',
            id: 'rain-clean-water',
            label: '깨끗한 물',
          },
          kind: 'object',
          prompt: '물이 빠진 뒤 어떤 물을 마실까요?',
          ruleIds: ['KR_HR_04'],
        }),
        uiElements: [
          '가스 환기',
          '수돗물과 저장식수 안전 확인',
          '침수 음식물 금지',
        ],
      },
      {
        actionReasons: ['망가진 길은 다른 사람도 다칠 수 있어요.'],
        actionSteps: ['망가진 길은 어른에게 말해요', '관청이나 119에 알려요'],
        asrText:
          '망가진 상하수도와 축대, 도로가 보이면 관청이나 119에 신고합니다.',
        description: '망가진 곳은 알려요.',
        endMs: 273_000,
        id: 'heavy-rain-damage-report',
        label: '망가진 곳은 알려요',
        learnerExplanation: '망가진 곳은 어른에게 말해요.',
        learnerPrompt: '길이나 벽이 망가졌어요.',
        learnerSequence: [
          '길이나 벽이 망가졌어요.',
          '망가진 길은 어른에게 말해요.',
          '관청이나 119에 알려요.',
        ],
        objectHints: ['파손된 길', '무너진 벽', '상하수도', '119'],
        ocrTokens: ['상하수도', '축대', '도로', '관청', '119'],
        phase: 'after_flood_report',
        previewMs: 264_000,
        requiredLearnerKeywords: ['119'],
        ruleIds: ['KR_HR_05'],
        startMs: 257_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 망가진 길 장면을 다시 봐요.',
            id: 'rain-broken-road',
            label: '망가진 길',
          },
          correct: {
            feedback: '맞아요. 어른이나 119에 알려요.',
            id: 'rain-report-adult',
            label: '어른이나 119',
          },
          kind: 'person',
          prompt: '망가진 길은 누구에게 말할까요?',
          ruleIds: ['KR_HR_05'],
        }),
        uiElements: ['관청이나 119에 신고'],
      },
    ]),
    withSegments('typhoon-safety-flow', [
      {
        asrText:
          '매년 여름이면 찾아오는 자연재난, 태풍입니다. 태풍은 강한 바람과 많은 비를 함께 몰고 와 피해를 키울 수 있습니다.',
        description: '태풍 연습을 시작해요.',
        endMs: 24_000,
        id: 'typhoon-intro',
        label: '태풍 연습을 시작해요',
        learnerExplanation: '태풍 때 어떻게 할지 배워요.',
        learnerPrompt: '태풍은 바람과 비가 함께 와요.',
        learnerSequence: [
          '태풍은 바람과 비가 함께 와요.',
          '물건이 날아올 수 있어요.',
          '다음 장면부터 따라 해요.',
        ],
        objectHints: ['강한 바람', '태풍 피해', '해안 파도', '뉴스 화면'],
        ocrTokens: ['태풍', '강풍', '집중호우'],
        phase: 'indoor',
        practiceMode: 'intro',
        ruleIds: ['KR_TY_01'],
        startMs: 0,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 아직 행동을 고르는 장면은 아니에요.',
            id: 'typhoon-act-card',
            label: '행동 카드',
          },
          correct: {
            feedback: '맞아요. 태풍 연습이 시작되는 장면이에요.',
            id: 'typhoon-start',
            label: '연습 시작',
          },
          kind: 'signal',
          prompt: '이 장면은 무엇을 알려줄까요?',
          ruleIds: ['KR_TY_01'],
        }),
        uiElements: ['태풍 발생 시 행동요령'],
      },
      {
        actionReasons: ['바람에 물건이 날아올 수 있어요.'],
        actionSteps: [
          '문과 창문을 닫아요',
          '집 안에 있어요',
          '날씨 알림을 봐요',
        ],
        asrText:
          '태풍이 발생하면 실내에서는 문과 창문을 닫고, 외출을 하지 말며, 수시로 기상상황을 확인합니다.',
        description: '집 안에서는 문과 창문을 닫아요.',
        endMs: 42_000,
        id: 'typhoon-indoor',
        label: '문과 창문을 닫아요',
        learnerExplanation: '문과 창문을 닫고 집에 있어요.',
        learnerPrompt: '태풍 바람이 강해졌어요.',
        learnerSequence: [
          '태풍 바람이 강해졌어요.',
          '문과 창문을 닫아요.',
          '집 안에 있어요.',
          '날씨 알림을 봐요.',
        ],
        objectHints: ['창문', '강한 바람', '휴대전화 날씨', '집 안'],
        ocrTokens: ['문 창문 닫고 외출하지 않기', '기상상황 수시 확인'],
        phase: 'indoor',
        previewMs: 32_000,
        requiredLearnerKeywords: ['문', '창문'],
        ruleIds: ['KR_TY_01'],
        startMs: 24_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 창문 장면을 다시 봐요.',
            id: 'typhoon-window-open',
            label: '열린 창문',
          },
          correct: {
            feedback: '맞아요. 문과 창문을 닫아요.',
            id: 'typhoon-window-closed',
            label: '닫힌 창문',
          },
          kind: 'object',
          prompt: '바람이 강할 때 창문은 어떤 모습이어야 할까요?',
          ruleIds: ['KR_TY_01'],
        }),
        uiElements: ['문 창문 닫고 외출하지 않기'],
      },
      {
        actionReasons: ['물이 갑자기 불어날 수 있어요.'],
        actionSteps: ['하천에서 멀어져요', '바닷가에서 멀어져요'],
        asrText:
          '물에 자주 잠기는 곳이나 산사태가 날 수 있는 곳은 피하고, 개울가와 하천 변, 해안가는 물이 차거나 급류에 휩쓸릴 수 있어 가까이 가지 않습니다.',
        description: '하천과 바닷가를 멀리해요.',
        endMs: 55_000,
        id: 'typhoon-water-coast',
        label: '하천과 바닷가를 멀리해요',
        learnerExplanation: '물가에서 멀어져요.',
        learnerPrompt: '비가 많이 와서 물이 불었어요.',
        learnerSequence: [
          '비가 많이 와서 물이 불었어요.',
          '하천에서 멀어져요.',
          '바닷가에서 멀어져요.',
        ],
        objectHints: ['하천', '해안가', '급류', '침수'],
        ocrTokens: ['하천', '해안가', '침수', '급류'],
        phase: 'avoid_water',
        previewMs: 49_000,
        requiredLearnerKeywords: ['하천', '바닷가'],
        ruleIds: ['KR_TY_02'],
        startMs: 42_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 물가 장면을 다시 봐요.',
            id: 'typhoon-river',
            label: '하천',
          },
          correct: {
            feedback: '맞아요. 높은 곳이 더 나아요.',
            id: 'typhoon-safe-place',
            label: '높은 곳',
          },
          kind: 'place',
          prompt: '물이 많은 곳 대신 어디가 나을까요?',
          ruleIds: ['KR_TY_02'],
        }),
        uiElements: ['개울가, 하천 변, 해안가 등 침수 위험지역은 가지 않기'],
      },
      {
        actionReasons: ['바람에 물건이 날아올 수 있어요.'],
        actionSteps: ['공사장에서 멀어져요', '집 안으로 가요'],
        asrText:
          '큰바람이 불면 공사자재가 넘어지거나 날릴 수 있으니까 공사장 근처에 가까이 가지 않습니다.',
        description: '공사장에서 멀어져요.',
        endMs: 65_000,
        id: 'typhoon-worksite',
        label: '공사장에서 멀어져요',
        learnerExplanation: '공사장에서 멀어져요.',
        learnerPrompt: '큰바람에 물건이 날아올 수 있어요.',
        learnerSequence: [
          '큰바람에 물건이 날아올 수 있어요.',
          '공사장에서 멀어져요.',
          '집 안으로 가요.',
        ],
        objectHints: ['공사장', '공사 자재', '강한 바람'],
        ocrTokens: ['공사장 근처 가지 않기', '공사자재'],
        phase: 'wind_hazard',
        previewMs: 60_000,
        requiredLearnerKeywords: ['공사장'],
        ruleIds: ['KR_TY_03'],
        startMs: 55_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 공사장 장면을 다시 봐요.',
            id: 'typhoon-worksite-place',
            label: '공사장',
          },
          correct: {
            feedback: '맞아요. 집 안이나 어른이 정한 곳이 나아요.',
            id: 'typhoon-inside',
            label: '집 안',
          },
          kind: 'place',
          prompt: '큰바람이 불 때 어디가 더 나을까요?',
          ruleIds: ['KR_TY_03'],
        }),
        uiElements: ['공사장 근처 가지 않기'],
      },
      {
        actionReasons: ['계곡 물은 빨리 불어날 수 있어요.'],
        actionSteps: ['산과 계곡에서 나와요', '안전한 곳으로 가요'],
        asrText: '산이나 계곡에 있는 사람은 빨리 안전한 곳으로 이동합니다.',
        description: '산과 계곡에서 나와요.',
        endMs: 75_000,
        id: 'typhoon-mountain-valley',
        label: '산과 계곡에서 나와요',
        learnerExplanation: '산과 계곡에서 나와요.',
        learnerPrompt: '산이나 계곡에 있어요.',
        learnerSequence: [
          '산이나 계곡에 있어요.',
          '산과 계곡에서 나와요.',
          '안전한 곳으로 가요.',
        ],
        objectHints: ['산길', '계곡', '급류', '안전한 곳'],
        ocrTokens: ['산', '계곡', '안전한 곳'],
        phase: 'mountain_rural',
        previewMs: 70_000,
        requiredLearnerKeywords: ['계곡'],
        ruleIds: ['KR_TY_04'],
        startMs: 65_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 계곡 장면을 다시 봐요.',
            id: 'typhoon-valley',
            label: '계곡',
          },
          correct: {
            feedback: '맞아요. 안전한 곳으로 가요.',
            id: 'typhoon-valley-safe',
            label: '안전한 곳',
          },
          kind: 'place',
          prompt: '계곡에 있을 때 어디로 갈까요?',
          ruleIds: ['KR_TY_04'],
        }),
        uiElements: ['산과 계곡에서 안전한 곳으로 이동'],
      },
      {
        actionReasons: ['물길을 보러 가면 넘어질 수 있어요.'],
        actionSteps: ['논둑에서 멀어져요', '집 안에서 기다려요'],
        asrText:
          '농촌에서는 논둑이나 물꼬를 점검하기 위해 무리하게 나서는 일이 없도록 해야 합니다.',
        description: '논둑과 물꼬를 보러 가지 않아요.',
        endMs: 84_000,
        id: 'typhoon-rural-waterway',
        label: '논둑과 물꼬를 보러 가지 않아요',
        learnerExplanation: '논둑에서 멀어져요.',
        learnerPrompt: '논과 물길이 궁금할 수 있어요.',
        learnerSequence: [
          '논과 물길이 궁금할 수 있어요.',
          '논둑에서 멀어져요.',
          '집 안에서 기다려요.',
        ],
        objectHints: ['논둑', '물꼬', '농촌', '강한 비'],
        ocrTokens: ['논둑', '물꼬', '점검하지 않기'],
        phase: 'mountain_rural',
        previewMs: 80_000,
        requiredLearnerKeywords: ['논둑'],
        ruleIds: ['KR_TY_04'],
        startMs: 75_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 논둑 장면을 다시 봐요.',
            id: 'typhoon-rice-bank',
            label: '논둑',
          },
          correct: {
            feedback: '맞아요. 집 안에서 기다려요.',
            id: 'typhoon-rural-inside',
            label: '집 안',
          },
          kind: 'place',
          prompt: '태풍 때 논둑 대신 어디에 있을까요?',
          ruleIds: ['KR_TY_04'],
        }),
        uiElements: ['논둑 물꼬 점검하러 가지 않기'],
      },
      {
        asrText:
          '태풍 때는 바람과 물을 조심하고, 위험한 곳에 가까이 가지 않는 것이 중요합니다.',
        description: '태풍 행동을 다시 말해요.',
        endMs: 90_000,
        id: 'typhoon-outro',
        label: '태풍 행동을 다시 말해요',
        learnerExplanation: '배운 것을 다시 봐요.',
        learnerPrompt: '마지막으로 다시 기억해요.',
        learnerSequence: [
          '마지막으로 다시 기억해요.',
          '문과 창문을 닫아요.',
          '물가와 공사장에서 멀어져요.',
          '어른과 같이 움직여요.',
        ],
        objectHints: ['태풍 요약', '강한 바람', '위험 장소'],
        ocrTokens: ['태풍', '행동요령'],
        phase: 'indoor',
        practiceMode: 'intro',
        ruleIds: ['KR_TY_01', 'KR_TY_02', 'KR_TY_03', 'KR_TY_04'],
        startMs: 84_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 다시 복습해요.',
            id: 'typhoon-final-card',
            label: '행동 카드',
          },
          correct: {
            feedback: '맞아요. 태풍 연습을 마치는 장면이에요.',
            id: 'typhoon-final-review',
            label: '마무리',
          },
          kind: 'signal',
          prompt: '이 장면은 무엇을 알려줄까요?',
          ruleIds: ['KR_TY_01'],
        }),
        uiElements: ['태풍 행동요령 마무리'],
      },
    ]),
    withSegments('heatwave-safety-flow', [
      {
        asrText:
          '폭염은 매우 더운 날씨가 이어지는 자연재난입니다. 오래 더위에 있으면 온열질환이 생길 수 있고 열사병은 매우 조심해야 합니다.',
        description: '너무 더운 날을 배워요.',
        endMs: 30_000,
        id: 'heatwave-intro',
        label: '더운 날을 배워요',
        learnerExplanation: '더운 날 어떻게 할지 배워요.',
        learnerPrompt: '날씨가 아주 더워졌어요.',
        learnerSequence: [
          '날씨가 아주 더워졌어요.',
          '몸이 뜨거워질 수 있어요.',
          '다음 장면부터 따라 해요.',
        ],
        objectHints: ['뜨거운 햇빛', '폭염 특보', '땀 흘리는 사람'],
        ocrTokens: ['폭염', '열사병', '33도 이상'],
        phase: 'cool_body',
        practiceMode: 'intro',
        ruleIds: ['KR_HW_01'],
        startMs: 0,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 아직 행동을 고르는 장면은 아니에요.',
            id: 'heat-action-card',
            label: '행동 카드',
          },
          correct: {
            feedback: '맞아요. 더운 날 연습이 시작되는 장면이에요.',
            id: 'heat-start',
            label: '연습 시작',
          },
          kind: 'signal',
          prompt: '이 장면은 무엇을 알려줄까요?',
          ruleIds: ['KR_HW_01'],
        }),
        uiElements: ['폭염 발생 시 행동요령'],
      },
      {
        actionReasons: ['밖에 오래 있으면 몸이 뜨거워져요.'],
        actionSteps: ['밖 활동을 줄여요', '시원한 곳에서 쉬어요'],
        asrText: '폭염이 발생하면 되도록 야외활동을 자제합니다.',
        description: '밖 활동을 줄여요.',
        endMs: 45_000,
        id: 'heatwave-reduce-outdoor',
        label: '밖 활동을 줄여요',
        learnerExplanation: '더울 때는 쉬어요.',
        learnerPrompt: '밖이 너무 더워요.',
        learnerSequence: [
          '밖이 너무 더워요.',
          '밖 활동을 줄여요.',
          '시원한 곳에서 쉬어요.',
        ],
        objectHints: ['뜨거운 햇빛', '야외', '그늘'],
        ocrTokens: ['야외활동 자제'],
        phase: 'cool_body',
        previewMs: 37_000,
        requiredLearnerKeywords: ['시원한 곳'],
        ruleIds: ['KR_HW_01'],
        startMs: 30_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 더운 밖 장면을 다시 봐요.',
            id: 'heat-hot-yard',
            label: '뜨거운 밖',
          },
          correct: {
            feedback: '맞아요. 시원한 곳에서 쉬어요.',
            id: 'heat-cool-place-main',
            label: '시원한 곳',
          },
          kind: 'place',
          prompt: '밖이 너무 더우면 어디가 나을까요?',
          ruleIds: ['KR_HW_01'],
        }),
        uiElements: ['야외활동 자제'],
      },
      {
        actionReasons: ['땀을 흘리면 물이 필요해요.'],
        actionSteps: ['물을 자주 마셔요', '모자로 햇빛을 가려요'],
        asrText:
          '꼭 외출해야 할 경우 햇빛을 최대한 가리는 옷차림을 하고 물을 자주 마십니다.',
        description: '물 마시고 햇빛을 가려요.',
        endMs: 58_000,
        id: 'heatwave-water-shade',
        label: '물 마시고 햇빛을 가려요',
        learnerExplanation: '물을 마시고 햇빛을 가려요.',
        learnerPrompt: '밖에 꼭 나가야 해요.',
        learnerSequence: [
          '밖에 꼭 나가야 해요.',
          '물을 자주 마셔요.',
          '모자로 햇빛을 가려요.',
        ],
        objectHints: ['물병', '모자', '부채', '햇빛'],
        ocrTokens: ['물 자주 마시기', '햇빛 차단'],
        phase: 'cool_body',
        previewMs: 52_000,
        requiredLearnerKeywords: ['물'],
        ruleIds: ['KR_HW_01'],
        startMs: 45_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 물 마시는 장면을 다시 봐요.',
            id: 'heat-snack',
            label: '간식',
          },
          correct: {
            feedback: '맞아요. 물을 자주 마셔요.',
            id: 'heat-water',
            label: '물',
          },
          kind: 'object',
          prompt: '더운 날 자주 마실 것은 무엇일까요?',
          ruleIds: ['KR_HW_01'],
        }),
        uiElements: ['물 자주 마시기', '햇빛 차단'],
      },
      {
        actionReasons: ['차 안은 빨리 더워져요.'],
        actionSteps: [
          '어르신과 어린이를 살펴요',
          '차 안 사람을 어른에게 말해요',
        ],
        asrText:
          '거동이 불편한 분들은 잘 보살피고, 창문이 닫힌 자동차 안에 노약자나 어린이를 남겨두면 안 됩니다.',
        description: '더위에 약한 사람을 봐요.',
        endMs: 70_000,
        id: 'heatwave-care-car',
        label: '더위에 약한 사람을 봐요',
        learnerExplanation: '혼자 두지 않아요.',
        learnerPrompt: '더위에 약한 사람이 있어요.',
        learnerSequence: [
          '더위에 약한 사람이 있어요.',
          '어르신과 어린이를 살펴요.',
          '차 안 사람을 어른에게 말해요.',
        ],
        objectHints: ['자동차', '어린이', '어르신', '닫힌 창문'],
        ocrTokens: ['노약자', '어린이', '자동차 안'],
        phase: 'care_people',
        previewMs: 63_000,
        requiredLearnerKeywords: ['차 안'],
        ruleIds: ['KR_HW_02'],
        startMs: 58_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 차 안 장면을 다시 봐요.',
            id: 'heat-closed-car',
            label: '닫힌 차',
          },
          correct: {
            feedback: '맞아요. 어른에게 바로 말해요.',
            id: 'heat-tell-adult',
            label: '어른',
          },
          kind: 'person',
          prompt: '닫힌 차 안에 사람이 있으면 누구에게 말할까요?',
          ruleIds: ['KR_HW_02'],
        }),
        uiElements: ['노약자나 어린이 남겨두지 않기'],
      },
      {
        actionReasons: ['집이 너무 더우면 쉴 곳이 필요해요.'],
        actionSteps: ['무더위쉼터로 가요', '어른과 같이 가요'],
        asrText:
          '집에 냉방기가 없는 분들은 인근 무더위쉼터에서 더위를 피할 수 있습니다.',
        description: '무더위쉼터에서 쉬어요.',
        endMs: 80_000,
        id: 'heatwave-cooling-shelter',
        label: '무더위쉼터에서 쉬어요',
        learnerExplanation: '시원한 쉼터로 가요.',
        learnerPrompt: '집 안도 너무 더워요.',
        learnerSequence: [
          '집 안도 너무 더워요.',
          '무더위쉼터로 가요.',
          '어른과 같이 가요.',
        ],
        objectHints: ['무더위쉼터', '시원한 장소', '어른과 이동'],
        ocrTokens: ['무더위쉼터', '더위 피하기'],
        phase: 'cool_place',
        previewMs: 74_000,
        requiredLearnerKeywords: ['무더위쉼터'],
        ruleIds: ['KR_HW_03'],
        startMs: 70_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 쉼터 장면을 다시 봐요.',
            id: 'heat-hot-room',
            label: '더운 방',
          },
          correct: {
            feedback: '맞아요. 무더위쉼터가 나아요.',
            id: 'heat-shelter',
            label: '무더위쉼터',
          },
          kind: 'place',
          prompt: '집 안도 너무 더우면 어디로 갈까요?',
          ruleIds: ['KR_HW_03'],
        }),
        uiElements: ['무더위쉼터 이용'],
      },
      {
        actionReasons: ['일하는 사람과 동물도 더위를 먹을 수 있어요.'],
        actionSteps: ['그늘에서 쉬어요', '축사는 바람이 통하게 해요'],
        asrText:
          '야외에서 일하는 사람은 그늘에서 쉬고 물을 마셔야 합니다. 축사와 양식장은 바람이 통하게 하고 물을 뿌려 더위를 낮춥니다.',
        description: '일터와 축사도 시원하게 해요.',
        endMs: 92_000,
        id: 'heatwave-work-farm',
        label: '일터와 축사도 시원하게 해요',
        learnerExplanation: '더운 곳은 식혀요.',
        learnerPrompt: '밖에서 일하는 사람이 있어요.',
        learnerSequence: [
          '밖에서 일하는 사람이 있어요.',
          '그늘에서 쉬어요.',
          '축사는 바람이 통하게 해요.',
        ],
        objectHints: ['야외 작업', '축사', '양식장', '물 뿌리기'],
        ocrTokens: ['야외 작업', '축사', '양식장', '환기'],
        phase: 'cool_place',
        previewMs: 86_000,
        requiredLearnerKeywords: ['축사'],
        ruleIds: ['KR_HW_03'],
        startMs: 80_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 그늘 장면을 다시 봐요.',
            id: 'heat-sun-work',
            label: '뜨거운 햇빛',
          },
          correct: {
            feedback: '맞아요. 그늘에서 쉬어요.',
            id: 'heat-shade-work',
            label: '그늘',
          },
          kind: 'place',
          prompt: '밖에서 일할 때 어디에서 쉴까요?',
          ruleIds: ['KR_HW_03'],
        }),
        uiElements: ['야외 작업 시 휴식', '축사와 양식장 관리'],
      },
      {
        actionReasons: ['빨리 식혀야 몸이 나아져요.'],
        actionSteps: [
          '시원한 곳으로 가요',
          '물이나 이온 음료를 마셔요',
          '계속 아프면 병원에 가요',
        ],
        asrText:
          '피부가 뜨겁고 건조하거나 붉게 변하고, 고열과 심한 두통, 식은땀, 탈진, 현기증이 나면 시원한 장소로 이동하여 찬물이나 이온 음료를 마셔야 합니다. 증상이 회복되지 않으면 병원으로 이동해야 합니다.',
        description: '몸이 아프면 바로 쉬어요.',
        endMs: 104_000,
        id: 'heatwave-symptoms',
        label: '몸이 아프면 시원한 곳으로 가요',
        learnerExplanation: '몸이 아프면 바로 말해요.',
        learnerPrompt: '어지럽고 머리가 아파요.',
        learnerSequence: [
          '어지럽고 머리가 아파요.',
          '시원한 곳으로 가요.',
          '물이나 이온 음료를 마셔요.',
          '계속 아프면 병원에 가요.',
        ],
        objectHints: ['두통', '식은땀', '물', '이온 음료', '병원'],
        ocrTokens: ['고열', '두통', '탈진', '현기증', '병원'],
        phase: 'symptoms',
        previewMs: 97_000,
        requiredLearnerKeywords: ['병원', '물'],
        ruleIds: ['KR_HW_04'],
        startMs: 92_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 아픈 몸은 다시 봐요.',
            id: 'heat-wait-alone',
            label: '혼자 기다림',
          },
          correct: {
            feedback: '맞아요. 시원한 곳에서 쉬어요.',
            id: 'heat-cool-room',
            label: '시원한 곳',
          },
          kind: 'place',
          prompt: '어지럽고 머리가 아프면 어디로 갈까요?',
          ruleIds: ['KR_HW_04'],
        }),
        uiElements: ['찬물이나 이온 음료', '병원으로 이동'],
      },
    ]),
    withSegments('coldwave-safety-flow', [
      {
        asrText:
          '매서운 추위로 건강과 안전을 위협하는 한파 피해. 한파 피해 예방을 위해 이렇게 행동해 주세요.',
        description: '한파 연습을 시작해요.',
        endMs: 10_000,
        id: 'coldwave-intro',
        label: '추운 날을 배워요',
        learnerExplanation: '추운 날 어떻게 할지 배워요.',
        learnerPrompt: '날씨가 아주 추워졌어요.',
        learnerSequence: [
          '날씨가 아주 추워졌어요.',
          '몸이 차가워질 수 있어요.',
          '다음 장면부터 따라 해요.',
        ],
        objectHints: ['겨울', '눈길', '한파 제목', '추위'],
        ocrTokens: ['한파 피해', '행동요령'],
        phase: 'indoor_warm',
        practiceMode: 'intro',
        ruleIds: ['KR_CW_01'],
        startMs: 0,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 아직 행동을 고르는 장면은 아니에요.',
            id: 'cold-action-card',
            label: '행동 카드',
          },
          correct: {
            feedback: '맞아요. 추운 날 연습이 시작되는 장면이에요.',
            id: 'cold-start',
            label: '연습 시작',
          },
          kind: 'signal',
          prompt: '이 장면은 무엇을 알려줄까요?',
          ruleIds: ['KR_CW_01'],
        }),
        uiElements: ['한파 대비 5가지 행동요령'],
      },
      {
        actionReasons: ['몸이 너무 차가워지면 아파요.'],
        actionSteps: ['날씨를 봐요', '집 안을 따뜻하게 해요'],
        asrText:
          '한파가 발생하는 겨울철에는 수시로 기상상황을 확인하고 건강을 위해 실내 적정 온도를 유지합니다.',
        description: '집 안을 따뜻하게 해요.',
        endMs: 22_000,
        id: 'coldwave-indoor',
        label: '집 안을 따뜻하게 해요',
        learnerExplanation: '집 안을 따뜻하게 해요.',
        learnerPrompt: '밖이 많이 추워요.',
        learnerSequence: [
          '밖이 많이 추워요.',
          '날씨를 봐요.',
          '집 안을 따뜻하게 해요.',
        ],
        objectHints: ['실내 온도', '날씨 화면', '난방', '집 안'],
        ocrTokens: ['실내 적정 온도', '기상상황 확인'],
        phase: 'indoor_warm',
        previewMs: 15_000,
        requiredLearnerKeywords: ['따뜻하게'],
        ruleIds: ['KR_CW_01'],
        startMs: 10_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 집 안 온도 장면을 다시 봐요.',
            id: 'cold-outside',
            label: '밖',
          },
          correct: {
            feedback: '맞아요. 따뜻한 집 안이 나아요.',
            id: 'cold-inside',
            label: '집 안',
          },
          kind: 'place',
          prompt: '너무 추울 때 어디가 나을까요?',
          ruleIds: ['KR_CW_01'],
        }),
        uiElements: ['실내 적정 온도 유지'],
      },
      {
        actionReasons: ['넘어질 때 손으로 몸을 지켜요.'],
        actionSteps: [
          '따뜻한 옷을 입어요',
          '장갑을 껴요',
          '작게 천천히 걸어요',
        ],
        asrText:
          '외출 시에는 내복, 목도리, 장갑 등 방한용품을 착용해 보온에 유의하고, 굽이 낮고 미끄럼이 방지되는 신발을 신은 후 평소보다 보폭을 줄여 걷는 것이 좋습니다.',
        description: '따뜻하게 입고 천천히 걸어요.',
        endMs: 38_000,
        id: 'coldwave-clothes-walk',
        label: '따뜻하게 입고 천천히 걸어요',
        learnerExplanation: '따뜻하게 입고 천천히 걸어요.',
        learnerPrompt: '밖에 나가야 해요.',
        learnerSequence: [
          '밖에 나가야 해요.',
          '따뜻한 옷을 입어요.',
          '장갑을 껴요.',
          '작게 천천히 걸어요.',
        ],
        objectHints: ['목도리', '장갑', '미끄럼 적은 신발', '얼음길'],
        ocrTokens: ['내복', '목도리', '장갑', '미끄럼 방지 신발'],
        phase: 'outside_clothes',
        previewMs: 30_000,
        requiredLearnerKeywords: ['장갑', '천천히'],
        ruleIds: ['KR_CW_02'],
        startMs: 22_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 장갑 장면을 다시 봐요.',
            id: 'cold-pocket',
            label: '주머니',
          },
          correct: {
            feedback: '맞아요. 장갑을 끼면 손이 따뜻해요.',
            id: 'cold-gloves',
            label: '장갑',
          },
          kind: 'object',
          prompt: '눈길을 걸을 때 손에는 무엇이 좋을까요?',
          ruleIds: ['KR_CW_02'],
        }),
        uiElements: ['방한용품 착용', '보폭 줄여 걷기'],
      },
      {
        actionReasons: ['수도관이 얼면 물을 쓰기 어려워요.'],
        actionSteps: ['수도관은 어른이 감싸요', '물을 조금 틀어 둬요'],
        asrText:
          '수도 계량기와 수도관 내부, 보일러 배관 등은 헌옷과 테이프 등으로 찬공기를 막아 보온하고, 오래 밖에 나갈 때에는 온수를 약하게 틀어 수도관이 얼지 않도록 합니다.',
        description: '수도관은 어른과 봐요.',
        endMs: 53_000,
        id: 'coldwave-pipes',
        label: '수도관을 따뜻하게 해요',
        learnerExplanation: '수도관은 어른과 봐요.',
        learnerPrompt: '수도관이 얼 수 있어요.',
        learnerSequence: [
          '수도관이 얼 수 있어요.',
          '수도관은 어른이 감싸요.',
          '물을 조금 틀어 둬요.',
        ],
        objectHints: ['수도 계량기', '수도관', '보일러 배관', '온수'],
        ocrTokens: ['수도계량기', '수도관', '보일러 배관', '온수'],
        phase: 'pipes_farm',
        previewMs: 46_000,
        requiredLearnerKeywords: ['수도관', '어른'],
        ruleIds: ['KR_CW_03'],
        startMs: 38_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 어른과 보는 장면을 다시 봐요.',
            id: 'cold-alone',
            label: '혼자',
          },
          correct: {
            feedback: '맞아요. 수도관은 어른과 봐요.',
            id: 'cold-adult',
            label: '어른',
          },
          kind: 'person',
          prompt: '수도관이 얼면 누구에게 말할까요?',
          ruleIds: ['KR_CW_03'],
        }),
        uiElements: ['수도관 보온', '온수 약하게 틀기'],
      },
      {
        actionReasons: ['농장과 물고기도 추위에 약해요.'],
        actionSteps: ['비닐하우스를 덮어요', '축사와 양식장을 따뜻하게 해요'],
        asrText:
          '비닐하우스와 축사, 양식장 같은 시설은 따뜻하게 덮고 찬바람이 들어오지 않도록 관리합니다.',
        description: '농장도 따뜻하게 해요.',
        endMs: 64_000,
        id: 'coldwave-farm',
        label: '농장도 따뜻하게 해요',
        learnerExplanation: '농장도 추위를 막아요.',
        learnerPrompt: '농장과 물고기도 추울 수 있어요.',
        learnerSequence: [
          '농장과 물고기도 추울 수 있어요.',
          '비닐하우스를 덮어요.',
          '축사와 양식장을 따뜻하게 해요.',
        ],
        objectHints: ['비닐하우스', '축사', '양식장', '찬바람'],
        ocrTokens: ['비닐하우스', '축사', '양식장'],
        phase: 'pipes_farm',
        previewMs: 58_000,
        requiredLearnerKeywords: ['비닐하우스'],
        ruleIds: ['KR_CW_03'],
        startMs: 53_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 농장 장면을 다시 봐요.',
            id: 'cold-open-farm',
            label: '찬바람',
          },
          correct: {
            feedback: '맞아요. 비닐하우스를 덮어요.',
            id: 'cold-cover-greenhouse',
            label: '비닐하우스',
          },
          kind: 'object',
          prompt: '추운 날 농장에서는 무엇을 덮을까요?',
          ruleIds: ['KR_CW_03'],
        }),
        uiElements: ['비닐하우스', '축사', '양식장 보온'],
      },
      {
        actionReasons: ['얼음길에서는 차가 미끄러질 수 있어요.'],
        actionSteps: [
          '겨울 물건을 챙겨요',
          '차 유리의 얼음을 없애요',
          '천천히 가요',
        ],
        asrText:
          '운전자의 경우 스노우체인과 같은 월동용품을 미리 준비하고 앞유리의 성에를 완전히 제거한 후 운전해야 합니다. 평소보다 속도를 낮추고 도로결빙이 생기기 쉬운 곳에서 더욱 주의해 운행하도록 합니다.',
        description: '차는 천천히 가야 해요.',
        endMs: 80_000,
        id: 'coldwave-driving',
        label: '눈길에서는 차도 천천히 가요',
        learnerExplanation: '차도 천천히 가야 해요.',
        learnerPrompt: '길이 얼어 미끄러워요.',
        learnerSequence: [
          '길이 얼어 미끄러워요.',
          '겨울 물건을 챙겨요.',
          '차 유리의 얼음을 없애요.',
          '천천히 가요.',
        ],
        objectHints: ['스노우체인', '앞유리 성에', '빙판길', '자동차'],
        ocrTokens: ['월동용품', '성에 제거', '속도 낮추기', '도로결빙'],
        phase: 'winter_driving',
        previewMs: 70_000,
        requiredLearnerKeywords: ['차', '천천히'],
        ruleIds: ['KR_CW_04'],
        startMs: 64_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 얼음길 장면을 다시 봐요.',
            id: 'cold-fast-car',
            label: '빠른 차',
          },
          correct: {
            feedback: '맞아요. 천천히 가는 차가 나아요.',
            id: 'cold-slow-car',
            label: '천천히 가는 차',
          },
          kind: 'object',
          prompt: '얼음길에서는 어떤 차가 나을까요?',
          ruleIds: ['KR_CW_04'],
        }),
        uiElements: ['속도 낮추기', '도로결빙 주의'],
      },
      {
        asrText:
          '한파 때는 몸을 따뜻하게 하고, 얼음길과 차길을 천천히 움직이는 것이 중요합니다.',
        description: '추운 날 행동을 다시 말해요.',
        endMs: 89_000,
        id: 'coldwave-outro',
        label: '추운 날 행동을 다시 말해요',
        learnerExplanation: '배운 것을 다시 봐요.',
        learnerPrompt: '마지막으로 다시 기억해요.',
        learnerSequence: [
          '마지막으로 다시 기억해요.',
          '몸을 따뜻하게 해요.',
          '장갑을 껴요.',
          '얼음길은 천천히 가요.',
        ],
        objectHints: ['한파 마무리', '겨울길', '따뜻한 옷'],
        ocrTokens: ['한파', '행동요령'],
        phase: 'indoor_warm',
        practiceMode: 'intro',
        ruleIds: ['KR_CW_01', 'KR_CW_02', 'KR_CW_04'],
        startMs: 80_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 다시 복습해요.',
            id: 'cold-final-card',
            label: '행동 카드',
          },
          correct: {
            feedback: '맞아요. 한파 연습을 마치는 장면이에요.',
            id: 'cold-final-review',
            label: '마무리',
          },
          kind: 'signal',
          prompt: '이 장면은 무엇을 알려줄까요?',
          ruleIds: ['KR_CW_01'],
        }),
        uiElements: ['한파 행동요령 마무리'],
      },
    ]),
    withSegments('heavy-snow-safety-flow', [
      {
        asrText:
          '적설 피해, 눈사태 피해, 교통사고 피해. 대설로 인해 발생하는 수많은 피해를 안전행동요령으로 막을 수 있습니다.',
        description: '눈이 많이 올 때를 배워요.',
        endMs: 13_000,
        id: 'heavy-snow-intro',
        label: '눈 오는 날을 배워요',
        learnerExplanation: '눈 오는 날 어떻게 할지 배워요.',
        learnerPrompt: '눈이 많이 올 수 있어요.',
        learnerSequence: [
          '눈이 많이 올 수 있어요.',
          '길이 미끄러울 수 있어요.',
          '다음 장면부터 따라 해요.',
        ],
        objectHints: ['대설', '눈길', '눈사태', '교통사고'],
        ocrTokens: ['대설 피해', '눈사태', '교통사고'],
        phase: 'home_snow',
        practiceMode: 'intro',
        ruleIds: ['KR_SN_01'],
        startMs: 0,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 아직 행동을 고르는 장면은 아니에요.',
            id: 'snow-action-card',
            label: '행동 카드',
          },
          correct: {
            feedback: '맞아요. 눈 오는 날 연습이 시작되는 장면이에요.',
            id: 'snow-start',
            label: '연습 시작',
          },
          kind: 'signal',
          prompt: '이 장면은 무엇을 알려줄까요?',
          ruleIds: ['KR_SN_01'],
        }),
        uiElements: ['대설 피해 예방 5가지 행동수칙'],
      },
      {
        actionReasons: ['눈길에서는 넘어지기 쉬워요.'],
        actionSteps: ['집에 머물러요', '집 주변 눈은 어른과 치워요'],
        asrText:
          '대설이 예보되면 외출을 자제하고 집 근처와 지붕 위에 눈이 쌓이지 않도록 수시로 치워야 합니다.',
        description: '밖에 덜 나가고 눈을 치워요.',
        endMs: 26_000,
        id: 'heavy-snow-home',
        label: '밖에 덜 나가고 눈은 어른과 치워요',
        learnerExplanation: '밖에 덜 나가요.',
        learnerPrompt: '눈이 많이 온다고 해요.',
        learnerSequence: [
          '눈이 많이 온다고 해요.',
          '집에 머물러요.',
          '집 주변 눈은 어른과 치워요.',
        ],
        objectHints: ['눈 치우기', '집 근처', '지붕', '외출 자제'],
        ocrTokens: ['외출 자제', '집 근처', '지붕 위 눈 치우기'],
        phase: 'home_snow',
        previewMs: 18_000,
        requiredLearnerKeywords: ['눈', '어른'],
        ruleIds: ['KR_SN_01'],
        startMs: 13_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 어른과 하는 장면을 다시 봐요.',
            id: 'snow-alone-roof',
            label: '지붕',
          },
          correct: {
            feedback: '맞아요. 어른과 같이 해요.',
            id: 'snow-adult',
            label: '어른',
          },
          kind: 'person',
          prompt: '집 주변 눈은 누구와 치울까요?',
          ruleIds: ['KR_SN_01'],
        }),
        uiElements: ['외출 자제', '집 근처와 지붕 위 눈 치우기'],
      },
      {
        actionReasons: ['눈이 쌓이면 길이 막힐 수 있어요.'],
        actionSteps: ['먹을 것과 약을 챙겨요', '안전한 곳으로 가요'],
        asrText:
          '산간 고립이나 눈사태 피해가 우려되는 위험지역에서는 식량, 응급용품과 같은 비상용품을 준비한 후 안전한 곳으로 이동해야 합니다.',
        description: '산길에서는 안전한 곳으로 가요.',
        endMs: 38_000,
        id: 'heavy-snow-isolated',
        label: '산길에서는 안전한 곳으로 가요',
        learnerExplanation: '산길에서 나와요.',
        learnerPrompt: '산이나 외딴 곳에 있어요.',
        learnerSequence: [
          '산이나 외딴 곳에 있어요.',
          '먹을 것과 약을 챙겨요.',
          '안전한 곳으로 가요.',
        ],
        objectHints: ['산간', '눈사태', '비상용품', '식량', '응급용품'],
        ocrTokens: ['산간 고립', '눈사태', '비상용품', '안전한 곳'],
        phase: 'isolated_area',
        previewMs: 32_000,
        requiredLearnerKeywords: ['산', '먹을 것'],
        ruleIds: ['KR_SN_02'],
        startMs: 26_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 산길 장면을 다시 봐요.',
            id: 'snow-mountain',
            label: '산길',
          },
          correct: {
            feedback: '맞아요. 어른이 정한 안전한 곳으로 가요.',
            id: 'snow-safe-place',
            label: '안전한 곳',
          },
          kind: 'place',
          prompt: '눈이 많이 쌓인 산길에서는 어디가 나을까요?',
          ruleIds: ['KR_SN_02'],
        }),
        uiElements: ['비상용품 준비', '안전한 곳으로 이동'],
      },
      {
        actionReasons: ['넓은 신발은 덜 미끄러워요.'],
        actionSteps: ['미끄럼 적은 신발을 신어요', '천천히 걸어요'],
        asrText:
          '외출할 시에는 바닥면이 넓은 운동화나 등산화를 착용해 미끄럼 사고를 예방합니다.',
        description: '눈길 신발을 챙겨요.',
        endMs: 49_000,
        id: 'heavy-snow-shoes',
        label: '눈길 신발을 챙겨요',
        learnerExplanation: '미끄럼 적은 신발을 신어요.',
        learnerPrompt: '눈길을 걸어야 해요.',
        learnerSequence: [
          '눈길을 걸어야 해요.',
          '미끄럼 적은 신발을 신어요.',
          '천천히 걸어요.',
        ],
        objectHints: ['운동화', '등산화', '눈길', '미끄럼'],
        ocrTokens: ['운동화', '등산화', '미끄럼 사고 예방'],
        phase: 'walk_safely',
        previewMs: 44_000,
        requiredLearnerKeywords: ['신발'],
        ruleIds: ['KR_SN_03'],
        startMs: 38_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 신발 장면을 다시 봐요.',
            id: 'snow-smooth-shoes',
            label: '미끄러운 신발',
          },
          correct: {
            feedback: '맞아요. 미끄럼 적은 신발을 신어요.',
            id: 'snow-safe-shoes',
            label: '미끄럼 적은 신발',
          },
          kind: 'object',
          prompt: '눈길에는 어떤 신발이 좋을까요?',
          ruleIds: ['KR_SN_03'],
        }),
        uiElements: ['미끄럼 사고 예방'],
      },
      {
        actionReasons: ['넘어질 때 손으로 몸을 지켜요.'],
        actionSteps: ['장갑을 껴요', '손을 빼고 걸어요'],
        asrText:
          '주머니에 손을 넣는 대신 보온장갑을 이용해 체온을 유지해야 합니다.',
        description: '장갑을 끼고 손을 빼요.',
        endMs: 57_000,
        id: 'heavy-snow-gloves',
        label: '장갑을 끼고 손을 빼요',
        learnerExplanation: '장갑을 끼고 걸어요.',
        learnerPrompt: '눈길에서 손이 추워요.',
        learnerSequence: [
          '눈길에서 손이 추워요.',
          '장갑을 껴요.',
          '손을 빼고 걸어요.',
        ],
        objectHints: ['장갑', '손', '주머니', '눈길'],
        ocrTokens: ['보온장갑', '주머니'],
        phase: 'walk_safely',
        previewMs: 52_000,
        requiredLearnerKeywords: ['장갑'],
        ruleIds: ['KR_SN_03'],
        startMs: 49_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 장갑 장면을 다시 봐요.',
            id: 'snow-pocket',
            label: '주머니',
          },
          correct: {
            feedback: '맞아요. 장갑을 끼고 손을 빼고 걸어요.',
            id: 'snow-gloves',
            label: '장갑',
          },
          kind: 'object',
          prompt: '눈길을 걸을 때 손에는 무엇이 좋을까요?',
          ruleIds: ['KR_SN_03'],
        }),
        uiElements: ['보온장갑 이용'],
      },
      {
        actionReasons: ['눈길 차에는 준비물이 필요해요.'],
        actionSteps: ['체인을 챙겨요', '삽을 챙겨요'],
        asrText:
          '운전시에는 체인, 염화칼슘, 삽과 같은 차량용 안전장비를 반드시 구비합니다.',
        description: '차 준비물을 챙겨요.',
        endMs: 66_000,
        id: 'heavy-snow-car-equipment',
        label: '차 준비물을 챙겨요',
        learnerExplanation: '차 물건을 챙겨요.',
        learnerPrompt: '차가 눈길을 가야 해요.',
        learnerSequence: [
          '차가 눈길을 가야 해요.',
          '체인을 챙겨요.',
          '삽을 챙겨요.',
        ],
        objectHints: ['체인', '삽', '염화칼슘', '자동차'],
        ocrTokens: ['체인', '염화칼슘', '삽'],
        phase: 'snow_driving',
        previewMs: 61_000,
        requiredLearnerKeywords: ['체인'],
        ruleIds: ['KR_SN_04'],
        startMs: 57_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 차 준비물 장면을 다시 봐요.',
            id: 'snow-empty-car',
            label: '빈 차',
          },
          correct: {
            feedback: '맞아요. 체인을 챙겨요.',
            id: 'snow-chain',
            label: '체인',
          },
          kind: 'object',
          prompt: '눈길 차에는 무엇을 챙길까요?',
          ruleIds: ['KR_SN_04'],
        }),
        uiElements: ['체인', '염화칼슘', '삽'],
      },
      {
        actionReasons: ['천천히 가야 덜 미끄러져요.'],
        actionSteps: ['천천히 가요', '앞차와 멀리 떨어져요'],
        asrText:
          '사고 위험이 높은 구간에서는 천천히 가고 앞차와 거리를 두어 눈길 교통사고를 예방합니다.',
        description: '눈길에서는 차도 천천히 가요.',
        endMs: 72_000,
        id: 'heavy-snow-drive-slow',
        label: '눈길에서는 차도 천천히 가요',
        learnerExplanation: '차도 천천히 가야 해요.',
        learnerPrompt: '길이 눈으로 미끄러워요.',
        learnerSequence: [
          '길이 눈으로 미끄러워요.',
          '천천히 가요.',
          '앞차와 멀리 떨어져요.',
        ],
        objectHints: ['눈길', '자동차', '앞차', '거리'],
        ocrTokens: ['서행', '안전거리', '교통사고 예방'],
        phase: 'snow_driving',
        previewMs: 69_000,
        requiredLearnerKeywords: ['천천히'],
        ruleIds: ['KR_SN_04'],
        startMs: 66_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 눈길 차 장면을 다시 봐요.',
            id: 'snow-fast-car',
            label: '빠른 차',
          },
          correct: {
            feedback: '맞아요. 천천히 가는 차가 나아요.',
            id: 'snow-slow-car',
            label: '천천히 가는 차',
          },
          kind: 'object',
          prompt: '눈길에서는 어떤 차가 나을까요?',
          ruleIds: ['KR_SN_04'],
        }),
        uiElements: ['서행', '안전거리 유지'],
      },
      {
        actionReasons: ['눈 무게로 시설이 무너질 수 있어요.'],
        actionSteps: ['비닐을 걷어내요', '양식장은 따뜻하게 해요'],
        asrText:
          '비닐하우스는 사용하지 않는 비닐을 걷어내고, 양식장과 농장 시설은 난방과 안전을 살펴야 합니다.',
        description: '농장도 눈을 조심해요.',
        endMs: 79_000,
        id: 'heavy-snow-farm-summary',
        label: '농장도 눈을 조심해요',
        learnerExplanation: '농장도 어른과 봐요.',
        learnerPrompt: '비닐하우스에 눈이 쌓일 수 있어요.',
        learnerSequence: [
          '비닐하우스에 눈이 쌓일 수 있어요.',
          '비닐을 걷어내요.',
          '양식장은 따뜻하게 해요.',
        ],
        objectHints: ['비닐하우스', '양식장', '농장', '눈 무게'],
        ocrTokens: ['비닐하우스', '양식장', '난방'],
        phase: 'farm_snow',
        previewMs: 75_000,
        requiredLearnerKeywords: ['비닐'],
        ruleIds: ['KR_SN_05'],
        startMs: 72_000,
        teachBack: createTeachBack({
          contrast: {
            feedback: '괜찮아요. 비닐하우스 장면을 다시 봐요.',
            id: 'snow-heavy-roof',
            label: '눈 쌓인 비닐',
          },
          correct: {
            feedback: '맞아요. 비닐을 걷어내요.',
            id: 'snow-remove-vinyl',
            label: '비닐',
          },
          kind: 'object',
          prompt: '눈이 많이 오면 비닐하우스는 무엇을 볼까요?',
          ruleIds: ['KR_SN_05'],
        }),
        uiElements: ['비닐하우스', '양식장 관리'],
      },
    ]),
  ]
}

function createSeasonalScenarios(): TheaterShow[] {
  return getRefinedSeasonalScenarioSeeds().map((scenario) => ({
    accentClassName: scenario.accentClassName,
    homeNote: scenario.homeNote,
    homeTitle: scenario.homeTitle,
    id: scenario.id,
    localOnly: true,
    note: scenario.note,
    posterSrc: scenario.posterSrc,
    practiceSequence: false,
    segments: scenario.segments.map((segment) =>
      createSegment({
        actionReasons: segment.actionReasons,
        actionSteps: segment.actionSteps,
        description: segment.description,
        endMs: segment.endMs,
        id: segment.id,
        label: segment.label,
        learnerExplanation: segment.learnerExplanation,
        learnerPrompt: segment.learnerPrompt,
        learnerSequence: segment.learnerSequence,
        narration: [
          {
            endMs: segment.endMs,
            source: 'audio',
            startMs: segment.startMs,
            text: segment.asrText,
          },
        ],
        packet: createPacket({
          asrText: segment.asrText,
          endMs: segment.endMs,
          objectHints: segment.objectHints,
          ocrTokens: segment.ocrTokens ?? [],
          sessionId: `demo-${segment.id}`,
          startMs: segment.startMs,
          uiElements: segment.uiElements ?? [],
        }),
        practiceMode: segment.practiceMode,
        previewMs: segment.previewMs,
        requiredLearnerKeywords: segment.requiredLearnerKeywords,
        rules: seasonalRuleCatalog,
        segmentOverrides: {
          confidence: 0.93,
          hazard: scenario.hazard,
          officialRuleIds: segment.ruleIds,
          phase: segment.phase,
        },
        startMs: segment.startMs,
        teachBack: segment.teachBack,
        teacherGuide: {
          correction:
            '오답이 나오면 장면을 다시 보고 쉬운 문장으로 한 번 더 말합니다.',
          observe:
            '학습자가 장면과 행동을 구분하고, 하지 말 일을 말할 수 있는지 봅니다.',
          prompt: segment.teachBack.prompt,
          script:
            '공식 대본을 짧게 나눈 장면입니다. 한 장면에 한 판단만 다룹니다.',
        },
      }),
    ),
    title: scenario.title,
    videoSrc: scenario.videoSrc,
  }))
}

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
  const actionSteps =
    practiceMode === 'intro'
      ? []
      : (
          seed.actionSteps ?? [
            safetyView.explanation.tracks.action ??
              safetyView.explanation.tracks.easy,
          ]
        ).map(simplifyLearnerCopy)
  const actionReasons =
    practiceMode === 'intro'
      ? []
      : (seed.actionReasons ?? []).map(simplifyLearnerCopy)
  const learnerTeachBack = simplifyTeachBack(seed.teachBack)
  const structuredExplanation = buildStructuredLearningExplanation({
    decisionPoint: learnerTeachBack.prompt,
    evidence: seed.packet,
    explanation: safetyView.explanation,
    learnerActionSteps: actionSteps,
    ruleMatches,
    rules: seed.rules,
    segment,
    sourceChunks: officialChunkCatalog,
    sourceId: seed.packet.sessionId,
    teachBack: learnerTeachBack,
    teacherGuide: {
      correctionHint: teacherGuide.correction,
      script: teacherGuide.script,
    },
  })
  const teachBack = structuredExplanation.tracks.teachBack ?? null
  const learnerExplanation = simplifyLearnerCopy(
    seed.learnerExplanation ?? seed.description,
  )
  const learnerPrompt = simplifyLearnerCopy(
    seed.learnerPrompt ?? seed.description,
  )

  return {
    actionReasons,
    actionSteps,
    answerOptions:
      practiceMode === 'intro' || !teachBack
        ? []
        : toPracticeAnswerOptions(teachBack),
    checkQuestion:
      practiceMode === 'intro' ? '' : (teachBack?.prompt ?? '무엇을 할까요?'),
    description: simplifyLearnerCopy(seed.description),
    endMs: seed.endMs,
    explanation: safetyView.explanation,
    id: seed.id,
    label: simplifyLearnerCopy(seed.label),
    learnerExplanation,
    learnerPrompt,
    learnerSequence: buildLearnerSequence({
      actionSteps,
      learnerExplanation,
      learnerPrompt,
      practiceMode,
      seed,
    }),
    narration: seed.narration ?? [
      {
        endMs: seed.endMs,
        source: seed.packet.asrText.trim() ? 'audio' : 'onscreen',
        startMs: seed.startMs,
        text: seed.packet.asrText || seed.description,
      },
    ],
    packet: seed.packet,
    pauseMs: seed.pauseMs,
    previewMs: seed.previewMs,
    practiceMode,
    primarySourceTitle: ruleMatches[0]?.rule.source_title ?? null,
    requiredLearnerKeywords: seed.requiredLearnerKeywords ?? [],
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

function buildLearnerSequence({
  actionSteps,
  learnerExplanation,
  learnerPrompt,
  practiceMode,
  seed,
}: {
  actionSteps: string[]
  learnerExplanation: string
  learnerPrompt: string
  practiceMode: SegmentPracticeMode
  seed: SegmentSeed
}) {
  const fallbackSteps =
    practiceMode === 'intro'
      ? [
          { kind: 'situation' as const, text: learnerPrompt },
          { kind: 'situation' as const, text: learnerExplanation },
          {
            kind: 'situation' as const,
            text: '다음 장면에서 행동을 연습해요.',
          },
        ]
      : [
          { kind: 'situation' as const, text: learnerPrompt },
          ...actionSteps.map((step) => ({
            kind: 'action' as const,
            text: step,
          })),
        ]

  const normalized = (seed.learnerSequence ?? fallbackSteps)
    .map((step, index) =>
      typeof step === 'string'
        ? {
            kind:
              practiceMode === 'action' && index > 0
                ? ('action' as const)
                : ('situation' as const),
            text: simplifyLearnerCopy(step.trim()),
          }
        : { kind: step.kind, text: simplifyLearnerCopy(step.text.trim()) },
    )
    .filter((step) => step.text)

  const seen = new Set<string>()

  return normalized.filter((step) => {
    const key = `${step.kind}:${step.text}`

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
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
