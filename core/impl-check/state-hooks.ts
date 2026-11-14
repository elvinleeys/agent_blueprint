// 상태가 컴포넌트 밖의 값(Context·상태 관리 라이브러리)에서 올 수 있음을 알려 주는 훅 이름. 이 훅을 쓰는 컴포넌트에서
// 설계의 상태(useState·useReducer)가 보이지 않으면 "누락"으로 확정하지 않고 확인 필요로 보낸다. 새 라이브러리는 여기만 고친다.
export const EXTERNAL_STATE_HOOKS = new Set([
  "useContext", // React Context
  "useSyncExternalStore", // 외부 저장소 구독
  "useSelector", // Redux·react-redux
  "useStore", // Zustand·Redux·Pinia 같은 저장소 훅
  "useAtom", // Jotai
  "useAtomValue",
  "useRecoilState", // Recoil
  "useRecoilValue",
  "useSnapshot", // Valtio
]);
