import { createBrowserRouter } from "react-router-dom";
import { ProductDetailPage } from "./pages/ProductDetailPage";
import { SettingsPage } from "./screens/settings/SettingsPage";

// 채점 시험용: 설계도에 없는 화면(설정)도 라우터에 연결돼 있다. 라우터는 화면 진입 파일로 읽히지만, 라우터가 가져오는 설정 화면은 따라가지 않아야 한다.
export const router = createBrowserRouter([
  { path: "/products/:id", element: <ProductDetailPage /> },
  { path: "/settings", element: <SettingsPage /> },
]);
