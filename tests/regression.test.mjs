import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const [id, file, name] of [
  ['REG-014', 'test-settings-link.cjs', '설정 URL 내보내기·붙여넣기·자동 복원·실패 보호'],
  ['REG-015', 'test-fund-help.cjs', '종목 설명·일반 등록·색상 팔레트·퇴직금 사용 상태'],
  ['REG-016', 'test-projection-dividends.cjs', '계산 내역의 사용 종목·연간 세후 배당과 CSV'],
  ['REG-001', 'test-planner.cjs', '기존 연간 계산과 인출 우선순위'],
  ['REG-002', 'test-records.cjs', '이름 있는 기록 저장·복원·실패 보호'],
  ['REG-003', 'test-stress.cjs', '기존 연간 확률 경로와 순서 위험'],
  ['REG-004', 'test-stress-ui.cjs', '스트레스 실행·무효화·취소·CSV'],
  ['REG-005', 'test-budget-allocation.cjs', '연도별 안전자산·생활비 항목·수익률 표시'],
  ['REG-006', 'test-buffer.cjs', '월별 자금 조달·세 보충 전략·추가 자산'],
  ['REG-007', 'test-severance-hover.cjs', '퇴직금 패널과 차트 포인터·키보드·저장·내보내기'],
  ['REG-012', 'test-allocation-view.cjs', '사용·미사용 종목과 투자 비율 카드·미리보기·설정 보존'],
  ['REG-013', 'test-starting-allocation.cjs', '시작 자금 총액·배분과 기존 보유액·현금 투자 호환'],
  ['REG-011', 'test-fund-manager.cjs', '종목 관리·동적 배분·탭·저장·CSV·스트레스 통합'],
  ['REG-010', 'test-final-saving.cjs', '마지막 저축 연도 옵션의 표시·원본 비율 보존·저장 복원'],
  ['REG-009', 'test-multi-etf.cjs', 'AOR·AOA 입력·배분·차트·저장·CSV와 스트레스 통합'],
  ['REG-008', 'test-withdrawal-cap.cjs', '인출률 상한 설정·근로 필요 연도 음영·CSV·기록'],
]) {
  test(`${id} ${name}`, { timeout: 30000 }, () => {
    execFileSync(process.execPath, [`tests/regression/${file}`], { cwd: root, timeout: 25000, stdio: 'pipe' });
  });
}
