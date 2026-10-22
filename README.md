# 성좌술사 (Starweaver)

별과 마법을 테마로 한 2.5D 턴제 전투 프로토타입입니다. 술사 6명 중 4명을 편성하고, 술사마다 주문 9개 중 5개를 장착합니다. 매 라운드 술사마다 장착한 주문 중 2장을 뽑습니다. 그중 무엇을 어떤 순서로 쓸지 정하면, 앞 스킬이 내보낸 성속을 다음 스킬이 받을 때 링크가 이어집니다. 링크가 이어지면 체인 배율과 성좌 반응이 발동합니다.

## 실행

```bash
npm install
npm run dev      # 개발 서버
npm test         # 전투 로직 단위 테스트
npm run build    # 타입 검사 + 배포용 빌드 (dist/)
```

WebGL이 필요합니다. 배경, 바닥 반사, 블룸, VFX는 three.js로 그립니다.

## 덱

링크와 반응 위에 덱을 규정하는 자원 세 가지가 있습니다.

| 자원 | 쌓이는 곳 | 쌓는 법 | 쓰는 법 |
|---|---|---|---|
| 예열 ▲ | 술사(최대 6) | 예열 주문 | 극딜 주문이 전부 소모. 중첩마다 피해가 크게 늘고 별빛 방벽을 꿰뚫음 |
| 별흔 ✧ | 적(최대 10) | 별흔 주문, 연타 | 아군 타격마다 중첩 × 0.4 고정 피해. 일부 주문은 터뜨려 소모 |
| 속성 공명 | 전투 전체(속성별 최대 10) | 시전마다 내보낸 성속 +1 | 공명 주문은 중첩당 +12%, 해방 주문은 소모해 중첩당 +25% |

예열은 눈으로 보이게 했습니다. 중첩마다 술사 뒤 오라가 커지고 발밑 마법진이 빨리 돌며 불씨가 오르고, 상승음이 반음씩 높아집니다. 분대 칸의 6칸 게이지가 3칸을 넘으면 READY가 뜨고, 극딜 카드에 지금 배율(예: ▲4 ×3.8)이 붙습니다. 극딜을 쓰면 컷인과 함께 시간이 잠깐 느려지고 큰 피해 숫자가 터집니다.

편성 화면의 추천 덱(`src/data/decks.ts`)은 팀과 주문서를 한 번에 맞춥니다.

| 덱 | 운영 | 핵심 술사 |
|---|---|---|
| 초신성 예열 | 두세 라운드 예열 후 초신성 창·종언의 별로 한 번에 끝냄 | 솔레아, 벨라 |
| 별흔 난사 | 연타로 별흔을 쌓아 고정 피해를 얹고 심연의 만찬으로 터뜨림 | 벨라, 녹스 |
| 태양 공명 | 태양을 내보낼 때마다 공명이 쌓여 태양 주문이 점점 강해짐 | 솔레아, 네비아 |
| 만월 해방 | 달 공명을 천천히 쌓으며 버티다 그믐의 종장으로 한꺼번에 풀어냄 | 루네 |
| 공허 종말 | 별흔과 지연 폭격을 겹치고 메아리로 앞당겨 터뜨림 | 녹스 |
| 성채 반격 | 보호막을 두껍게 두르고 반격·방패 강타로 갚음 | 아스트라 |

## 구조

- `src/core/`: 전투 규칙(DOM 의존 없음). 링크·체인, 전투 상태머신, 손패 뽑기, 팀 궁합 분석, 런 진행과 저장
- `src/data/`: 성속·반응, 주문 54종, 술사 6명(주문서 9개씩), 추천 덱 6종, 적, 층 구성, 보상
- `src/render/three/`: 2.5D 무대
  - `environment.ts`: 층별 배경 조립. 노을 해안, 안개 초원, 네온 운하, 사구, 오로라 설원, 하늘섬
  - `env/`: 배경 조각
    - `sky.ts`: 일러스트풍 하늘(세 색 그라데이션, 셀 구름, 별, 별의 강, 오로라, 해·달·일식)
    - `celestial.ts`: 별자리, 하늘의 마법진·아스트롤라베, 빛기둥, 별똥별
    - `arcana.ts`: 떠다니는 수정, 별가루, 땅의 룬 마법진
    - `layers.ts`: 먼 능선 실루엣 층
    - `toon.ts`, `magicCircle.ts`: 셀 셰이딩 재질, 셰이더 마법진
    - `terrain.ts`: 높이맵 지형
    - `props.ts`: 바위, 나무, 기둥, 떠 있는 섬
    - `vegetation.ts`: 바람에 흔들리는 풀
    - `water.ts`: 반사되는 바다, 구름 바다
    - `city.ts`: 네온 운하
    - `weather.ts`: 비, 안개, 입자
    - `maps.ts`: 절차적 표면 질감
  - `quality.ts`: 그래픽 품질(자동/높음/낮음). 높음은 그림자, MSAA, 빛줄기, 풀이 더 많다
  - `fx.ts`: 스킬 VFX
  - `stage.ts`: 카메라, 후처리, 캐릭터 판
- `src/render/rig.ts`: 술사 6명의 검은 실루엣 일러스트(SVG)를 뼈대 조각(머리·머리카락·팔·몸·다리·망토)으로 나눈 것
- `src/render/three/puppet.ts`: 조각을 판으로 세운 컷아웃 인형. 숨쉬기, 무기별 공격(찌르기·들어올리기·사격·베기·들이받기), 예열, 피격, 쓰러짐, 승리 자세
- `src/render/figures.ts`: 적 형상(SVG). 무대에서 몸을 젖혔다 덮치고, 맞으면 찌그러지고, 쓰러지면 돌며 사라진다
- `src/audio/sound.ts`: 효과음과 배경 음악. 마법 소리는 FM 합성 종소리(성속마다 음 높이가 다름), 배경 음악은 장면별 화음 진행 위에 패드·베이스·아르페지오·북을 실시간으로 엮는다
- `src/ui/`: 화면. 메인 → 편성 → 성도(지도) → 전투 → 보상 → 결과
- `tests/core/`: Vitest 테스트

기획과 로드맵은 [docs/PLAN.md](docs/PLAN.md)에, UI/UX 분석과 개편안은 [docs/UI_UX.md](docs/UI_UX.md)에 있습니다.

## 사용한 외부 자원

- VFX 텍스처: [Kenney Particle Pack](https://github.com/Calinou/kenney-particle-pack) by Kenney (CC0). 원본 중 42장을 흰색과 알파로 변환해 `public/fx/`에 넣었습니다. 라이선스는 `public/fx/LICENSE-kenney.txt`에 있습니다.
- 효과음: Kenney의 UI·Casino·RPG 사운드(CC0, [iwenzhou/kenney](https://github.com/iwenzhou/kenney) 미러에서). 16개를 골라 `public/sfx/`에 넣었습니다. 라이선스는 `public/sfx/LICENSE-kenney.md`에 있습니다. 마법 효과음과 배경 음악은 Web Audio로 직접 합성합니다.
- 배경 음악: [0 A.D.](https://play0ad.com/)의 음악(Wildfire Games, Omri Lahav 외, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)). 6곡을 MP3로 변환해 `public/bgm/`에 넣었습니다. 곡 목록과 바꾸는 법은 `public/bgm/CREDITS.md`에 있습니다. 파일을 못 읽으면 직접 생성하는 음악으로 돌아갑니다.
- [three.js](https://threejs.org/) (MIT)
- 글꼴: Noto Serif KR, Bodoni Moda ([Fontsource](https://fontsource.org/)로 번들, OFL)
- 디자인 스킬: [taste-skill](https://github.com/Leonxlnx/taste-skill) (MIT). Claude Code용 프런트엔드 디자인 지침으로 `.claude/skills/design-taste-frontend/`에 넣었습니다.
