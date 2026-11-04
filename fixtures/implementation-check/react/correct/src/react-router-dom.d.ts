declare module "react-router-dom" {
  import type { ReactNode } from "react";
  export function createBrowserRouter(routes: { path: string; element: ReactNode }[]): unknown;
}
