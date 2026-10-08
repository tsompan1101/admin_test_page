import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import './App.css'
import './admin.css'
import Admin from './Admin'
import RequierePermiso, { Inicio } from './components/RequierePermiso'
import Cronograma from './pages/Cronograma'
import Mapa from './pages/Mapa'
import Mensajes from './pages/Mensajes'
import Qr from './pages/Qr'
import Participantes from './pages/Participantes'
import Usuarios from './pages/Usuarios'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Admin />,
    children: [
      { index: true, element: <Inicio /> }, // lleva a la primera sección permitida
      { path: 'mapa', element: <RequierePermiso permiso="mapa"><Mapa /></RequierePermiso> },
      { path: 'cronograma', element: <RequierePermiso permiso="cronograma"><Cronograma /></RequierePermiso> },
      { path: 'participantes', element: <RequierePermiso permiso="participantes"><Participantes /></RequierePermiso> },
      { path: 'qr', element: <RequierePermiso permiso="participantes"><Qr /></RequierePermiso> },
      { path: 'mensajes', element: <RequierePermiso permiso="mensajes"><Mensajes /></RequierePermiso> },
      { path: 'usuarios', element: <RequierePermiso permiso="admin"><Usuarios /></RequierePermiso> },
      { path: '*', element: <Inicio /> },
    ],
  },
])


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
