# Retirement Simulator

저축·VTI/SCHD 배분·배당·생활비 인출·안전자산 보충을 비교하는 은퇴 자산 계산기입니다. 개발 코드는 모듈로 관리하고, 실행 결과는 인터넷 없이 열 수 있는 **HTML 한 파일**로 빌드합니다.

## 실행과 검증

Node.js 22 이상이 필요하며 개발 기준은 Node.js 24입니다. 설치해야 할 외부 패키지는 없습니다.

```sh
git clone https://github.com/Hamstory/retirement-simulator.git
cd retirement-simulator
npm test
npm run test:long
```

`npm test`는 HTML 빌드 → TC 정의·문서 일치 확인 → 자동 테스트 순서로 실행합니다. 완료 후 `dist/index.html`을 브라우저에서 열면 됩니다. npm이 없는 환경에서는 다음 명령도 동일하게 작동합니다.

```sh
node scripts/check.mjs
node --test tests/long-run.test.mjs
```

빌드 결과는 `dist/index.html`과 커밋하는 `docs/index.html`에 함께 생성됩니다. 빌드만 다시 하려면 `npm run build`, TC 문서를 다시 생성하려면 `npm run test:plan`을 실행하세요.

## 기능

- 연간 저축 증가, 은퇴 시점, 물가·주가·배당 증가율 조절
- 연도별 안전자산·VTI/SCHD 비중과 퇴직금 같은 세후 추가 자산 입력
- 월간·연간 생활비 항목 합산 후 목표 생활비에 적용
- 배당·이자와 인출 재원에 따른 연간 기본 계산
- 은퇴 후 월별 인출·시장 변동과 동일 경로에서의 세 보충 전략 비교
- 이름 있는 브라우저 기록, JSON 가져오기·내보내기, CSV

브라우저 기록은 브라우저와 파일 경로에 묶일 수 있습니다. 기존 HTML에서 새 HTML로 옮길 때에는 기존 파일에서 JSON을 내보내 새 파일에서 불러오세요. 기존 파일과 같은 위치에 새 빌드를 덮어쓸 경우에도 필요한 기록은 먼저 백업해두는 편이 좋습니다.

## 구조

```text
src/
  engine.js             계산·검증·시장 경로 생성 모듈
  app.js                입력·저장·그래프·내보내기
  styles.css            반응형 스타일
  index.template.html   화면 템플릿
scripts/
  build.mjs             단독 HTML 생성
  check.mjs             기본 검증 진입점
  test-plan.mjs         TC 문서 생성·연결 확인
tests/
  unit/                 ID별 계산 계약 테스트
  regression/           기존 6개 회귀 스위트 보존
  structure.test.mjs    빌드와 정적 HTML 검증
  long-run.test.mjs     1000개 경로 × 세 전략 × 은퇴 60년
docs/
  test-cases.json       TC 기준 데이터
  TEST_CASES.md         전제·절차·기대 결과
  MODEL.md              계산 순서와 모형 한계
  RELEASE_CHECKLIST.md  실제 브라우저 수동 확인
  index.html            Pages용 생성 HTML · 커밋 대상
  .nojekyll             Pages 정적 파일 제공
```

## 테스트 관리

[TC 목록](docs/TEST_CASES.md)에 **자동 36개, 장기 검증 1개, 수동 6개**를 정의했습니다. 기존 회귀 스위트의 여러 assertion은 해당 REG 케이스 안에 보존되어 있습니다.

계산 변경은 관련 TC ID의 기대 결과를 먼저 검토하고 코드와 함께 갱신합니다. 실제 브라우저 검증과 격리 DOM 검증은 구분합니다. 격리 DOM은 저장·복원과 이벤트 흐름을 확인하지만 실제 레이아웃, 파일 다운로드, 브라우저 보안 정책까지 보증하지 않습니다. 수동 6개는 [릴리스 체크리스트](docs/RELEASE_CHECKLIST.md)에 결과를 남깁니다.

GitHub Actions는 push/PR마다 Node.js 22·24에서 기본 검증을 실행하고, Node.js 24에서 장기 검증 후 단독 HTML을 `retirement-simulator-html` 아티팩트로 보관합니다. `docs/index.html`은 소스와 같은 저장소에서 관리합니다. Pages 배포 소스는 `main` 브랜치의 `/docs`를 선택합니다.

## 계산 범위

기본 화면은 연간 계산, 스트레스 테스트의 은퇴 구간은 월별 계산입니다. 추가 자산은 입력한 연도 말에 들어오며, 보충 매도는 생활비 수입으로 계산하지 않습니다. 안전자산 목표 3년·최소 1년·회복 허용 하락률 10%는 예시 가정입니다.

모형 결과는 실제 은퇴 성공 확률이나 투자 수익을 보장하지 않습니다. 계좌별 인출 제한·매도 세금·환율·실제 분기 배당 지급일 등은 반영하지 않습니다. 자세한 규칙은 [계산 명세](docs/MODEL.md)를 확인하세요.

개인 설정 JSON, 브라우저 저장 기록, 인증 정보는 저장소에 넣지 않습니다. 시작 값은 실제 사용자와 무관한 가상 예시이며 초기 자산은 0원입니다. 커밋 작성자·커미터는 GitHub noreply 이메일을 사용합니다. `npm test`는 공개 기본값·소스·빌드 산출물·가능한 Git 이력을 개인정보 검사에 포함합니다. 자동 검사와 별개로 공개 전에 기본값과 변경 내용을 검토합니다.

배포 HTML을 직접 수정하지 말고 `src/`를 수정한 뒤 다시 빌드하세요.

## GitHub Pages

1. `npm run build`로 빌드합니다.
2. 소스 변경과 함께 `docs/index.html`, `docs/.nojekyll`을 커밋합니다.
3. 저장소 Settings → Pages → Deploy from a branch → `main` / `/docs`를 선택합니다.
4. 배포가 끝나면 저장소의 Pages 주소에서 사용합니다.

`npm test`는 소스와 커밋된 Pages HTML이 일치하는지 검사합니다. 개인 입력은 방문자의 브라우저 저장소에 남으며 서버로 업로드하지 않습니다. 실제 개인 JSON을 예시 파일로 공개하지 마세요.
