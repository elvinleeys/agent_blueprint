import { createBrowserRouter } from "react-router-dom";
import { ProductDetailPage } from "./pages/ProductDetailPage";

export const router = createBrowserRouter([{ path: "/products/:id", element: <ProductDetailPage /> }]);
