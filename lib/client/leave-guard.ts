// 저장되지 않은 수정이 있을 때 페이지를 떠나기 전에 묻는다.
// 링크 이동(onNavigate)과 코드로 하는 이동(로그아웃 등)은 confirmLeave를, 탭 닫기·새로고침은 beforeunload를 쓴다.
// 알려진 한계: 브라우저 뒤로·앞으로 버튼은 App Router에서 막을 수 없다.
export const LEAVE_MESSAGE = "저장되지 않은 수정이 있습니다. 이 페이지를 떠나면 사라집니다. 떠날까요?";

let active = false;

/** 저장되지 않은 수정이 있는 동안 true로 둔다(작업공간이 켜고 끈다) */
export const setLeaveGuard = (value: boolean): void => {
  active = value;
};

export const isLeaveGuardActive = (): boolean => active;

/** 떠나도 되는가: 경고가 꺼져 있으면 묻지 않고 true, 켜져 있으면 확인을 받는다(ask는 테스트에서 바꿔 끼운다) */
export function confirmLeave(ask: (message: string) => boolean = (m) => window.confirm(m)): boolean {
  return !active || ask(LEAVE_MESSAGE);
}

/** 탭 닫기·새로고침·외부 주소로 나갈 때의 경고. 문구는 브라우저가 정한다 */
export function warnBeforeUnload(event: BeforeUnloadEvent): void {
  event.preventDefault();
  event.returnValue = "";
}
