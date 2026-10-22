# 성좌술사 (Starweaver)

별과 마법을 테마로 한 2.5D 턴제 전투 프로토타입입니다. 술사 6명 중 4명을 편성하고, 매 라운드 술사마다 스킬 5개 중 2장을 뽑습니다. 그중 무엇을 어떤 순서로 쓸지 정하면, 앞 스킬이 내보낸 성속을 다음 스킬이 받을 때 링크가 이어집니다. 링크가 이어지면 체인 배율과 성좌 반응이 발동합니다.

## 실행

```bash
npm install
npm run dev      # 개발 서버
npm test         # 전투 로직 단위 테스트
npm run build    # 타입 검사 + 배포용 빌드 (dist/)
```

WebGL이 필요합니다. 배경, 바닥 반사, 블룸, VFX는 three.js로 그립니다.

## 구조

- `src/core/`: 전투 규칙(DOM 의존 없음). 링크·체인, 전투 상태머신, 손패 뽑기, 팀 궁합 분석, 런 진행과 저장
- `src/data/`: 성속·반응, 스킬 30종, 술사 6명, 적, 층 구성, 보상
- `src/render/three/`: 2.5D 무대
  - `environment.ts`: 층별 배경 조립. 노을 해안, 안개 초원, 네온 운하, 사구, 오로라 설원, 하늘섬
  - `env/`: 배경 조각
    - `sky.ts`: 낮은 Preetham 산란 하늘(Sky.js), 밤은 별·은하수·오로라·일식 셰이더
    - `terrain.ts`: 높이맵 지형
    - `props.ts`: 바위, 나무, 기둥, 떠 있는 섬
    - `vegetation.ts`: 바람에 흔들리는 풀
    - `water.ts`: 반사되는 바다, 구름 바다
    - `city.ts`: 네온 운하
    - `weather.ts`: 비, 안개, 입자
    - `maps.ts`: 절차적 표면 질감
  - `quality.ts`: 그래픽 품질(자동/높음/낮음). 높음은 그림자, MSAA, 빛줄기, 풀 약 4만 포기
  - `fx.ts`: 스킬 VFX
  - `stage.ts`: 카메라, 후처리, 캐릭터 판
- `src/render/characters.ts`, `figures.ts`: 캐릭터와 적의 2D 일러스트(SVG)
- `src/ui/`: 화면. 메인 → 편성 → 성도(지도) → 전투 → 보상 → 결과
- `tests/core/`: Vitest 테스트

기획과 로드맵은 [docs/PLAN.md](docs/PLAN.md)에, UI/UX 분석과 개편안은 [docs/UI_UX.md](docs/UI_UX.md)에 있습니다.

## 사용한 외부 자원

- VFX 텍스처: [Kenney Particle Pack](https://github.com/Calinou/kenney-particle-pack) by Kenney (CC0). 원본 중 42장을 흰색과 알파로 변환해 `public/fx/`에 넣었습니다. 라이선스는 `public/fx/LICENSE-kenney.txt`에 있습니다.
- [three.js](https://threejs.org/) (MIT)
- 글꼴: Noto Sans KR, Barlow Condensed (Google Fonts, OFL)
