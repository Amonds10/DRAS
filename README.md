# 성좌술사 (Starweaver)

별과 마법을 테마로 한 턴제 전투 프로토타입입니다. 술사 4명을 편성하고, 한 턴 안에서 마법 카드를 쏘는 순서를 정합니다. 앞 마법이 내보낸 성속을 다음 마법이 받으면 링크가 이어져 체인 배율과 성좌 반응이 발동합니다.

## 실행

```bash
npm install
npm run dev      # 개발 서버
npm test         # 전투 로직 단위 테스트
npm run build    # 타입 검사 + 배포용 빌드 (dist/)
```

## 구조

- `src/core/` 전투 규칙(DOM 의존 없음): 링크·체인, 전투 상태머신, 팀 궁합 분석, 런 진행과 저장
- `src/data/` 성속·반응, 마법, 술사, 적, 층 구성, 보상
- `src/render/` 배경 밤하늘, 별자리 형상(SVG)
- `src/ui/` 화면: 메인 → 편성 → 성도(지도) → 전투 → 보상 → 결과
- `tests/core/` Vitest 테스트

기획과 로드맵은 [docs/PLAN.md](docs/PLAN.md)에 있습니다.
