// El RUC que empieza con 10 es de una persona natural y contiene su DNI: en las listas públicas no se muestra.
// Solo se devuelve si la persona lo escribió ella misma en la consulta por RUC.
const RE_RUC_PERSONA = /\b10\d{9}\b/g;
export const PERSONA_NATURAL = 'Persona natural (RUC no se muestra)';

/** Reemplaza los RUC de persona natural en todos los textos de una respuesta, salvo el que se consultó. */
export function ocultarRucPersonas<T>(dato: T, permitido?: string): T {
  const texto = JSON.stringify(dato).replace(RE_RUC_PERSONA, (r) => (r === permitido ? r : 'de persona natural'));
  return JSON.parse(texto.replace(/"ruc":"de persona natural"/g, '"ruc":""')) as T;
}
