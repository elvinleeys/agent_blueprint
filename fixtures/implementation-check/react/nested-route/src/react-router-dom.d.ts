declare module "react-router-dom" {
  import type { ReactNode } from "react";
  type RouteObject = { path: string; element?: ReactNode; children?: RouteObject[] };
  export function createBrowserRouter(routes: RouteObject[]): unknown;
}
