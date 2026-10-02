import "./index.css";
import "./admin.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import Admin from "./Admin";
import Mapa from "./pages/Mapa";
import Cronograma from "./pages/Cronograma";
import Mensajes from "./pages/Mensajes";
import { loadConfig } from "./lib/config";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Admin />,
    children: [
      { index: true, element: <Navigate to="/mapa" replace /> },
      { path: "mapa", element: <Mapa /> },
      { path: "cronograma", element: <Cronograma /> },
      { path: "mensajes", element: <Mensajes /> },
    ],
  },
]);

void loadConfig().finally(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
});

