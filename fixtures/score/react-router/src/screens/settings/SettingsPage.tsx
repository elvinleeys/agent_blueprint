import { SettingsForm } from "./SettingsForm";

// 설계도에 없는 화면. 라우터만 이 파일을 가져온다(설계도 위치 기준 읽기에서는 빠져야 함)
export function SettingsPage() {
  return (
    <main className="p-4">
      <SettingsForm />
    </main>
  );
}
