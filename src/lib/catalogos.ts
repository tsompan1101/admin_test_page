// Deben coincidir exactamente con los enums de PostgreSQL (db.sql).
export const SECTORES = [
  'Sector Educativo/Académico',
  'Sector Privado',
  'Sector Público',
  'Sector Social',
  'Otro',
] as const

export const PARTICIPACIONES = [
  'Conferencista Magistral',
  'Panelista',
  'Expositor con stand',
  'Tallerista',
  'Moderador',
] as const

// Enums de charlas. Tipados como string[] porque las páginas usan .includes(valor: string).
export const SALONES: string[] = ['Escenario', 'Salón 1', 'Salón 2', 'Salón 3', 'Salón 4']
export const TIPOS: string[] = ['Conferencia Magistral', 'Panel', 'Taller', 'Conferencia', 'Evento']

// Pega aquí los valores del CHECK de participantes.area_experiencia (db.sql).
// Mientras esté vacío, el formulario usa un campo libre separado por comas.
export const AREAS: string[] = []

// Secciones del dashboard que se pueden asignar a un usuario "editor".
export const PERMISOS = [
  { id: 'mapa', etiqueta: 'Mapa y stands' },
  { id: 'cronograma', etiqueta: 'Cronograma y charlas' },
  { id: 'participantes', etiqueta: 'Participantes y fotos' },
  { id: 'mensajes', etiqueta: 'Correos y SMS' },
] as const
