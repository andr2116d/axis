import { sumarDias, fechaLarga } from '@/dominio/fechas';

// Anotaciones de ejemplo para probar el control de obra con un expediente revisado.
// Son textos sintéticos con la forma de un asiento del cuaderno de incidencias.

const HECHO: Record<string, { hecho: string; trabajo: string }> = {
  redes: { hecho: 'se encontró interferencia con tubería de desagüe existente y buzones existentes de SEDALIB en el eje de la calzada', trabajo: 'la reubicación de buzones y conexiones domiciliarias de desagüe' },
  napa: { hecho: 'al excavar la caja del pavimento apareció napa freática a 0.80 m, lo que impidió compactar la subrasante', trabajo: 'el bombeo y el subdrenaje para abatir la napa freática' },
  subrasante: { hecho: 'se encontró suelo inadecuado con capacidad portante baja que requiere mejoramiento de subrasante', trabajo: 'el mejoramiento de subrasante con material de préstamo' },
  drenaje: { hecho: 'las lluvias evidenciaron la necesidad de cunetas y drenaje pluvial que no figuran en los planos', trabajo: 'cunetas y alcantarillas de drenaje pluvial' },
  relleno: { hecho: 'se encontró relleno no controlado con desmonte y basura enterrada bajo la subrasante', trabajo: 'la eliminación del relleno y el reemplazo de material' },
  roca: { hecho: 'se encontró roca fija a 0.40 m que requiere excavación en roca', trabajo: 'la excavación en roca fija' },
  muros: { hecho: 'el desnivel con los lotes vecinos exige un muro de contención en el tramo final', trabajo: 'el muro de contención de concreto armado' },
};

export interface EjemploSolicitud { etiqueta: string; tipo: string; fecha: string; texto: string }

export function ejemplosSolicitud(inicio: string, condicion: string, contratista: string, monto?: number): EjemploSolicitud[] {
  const h = HECHO[condicion] ?? HECHO.napa;
  const desde = sumarDias(inicio, 16, false);
  const hasta = sumarDias(inicio, 22, false);
  const pedida = sumarDias(inicio, 26, false);
  const consulta = sumarDias(inicio, 12, false);
  const adicional = sumarDias(inicio, 29, false);
  const montoAdicional = monto ? Math.round(monto * 0.08 * 100) / 100 : 96500;
  return [
    {
      etiqueta: 'Ampliación de plazo', tipo: 'ampliacion', fecha: pedida,
      texto: `ASIENTO N.° 41 DEL RESIDENTE DE OBRA (${fechaLarga(pedida)}). ${contratista} solicita la AMPLIACIÓN DE PLAZO N.° 01 por 12 días calendario. Durante los trabajos de movimiento de tierras ${h.hecho}. Los trabajos estuvieron detenidos desde el ${fechaLarga(desde)} hasta el ${fechaLarga(hasta)}. La paralización afectó la ruta crítica del programa de ejecución (partidas de subrasante y base granular). Se adjunta el programa de ejecución actualizado.`,
    },
    {
      etiqueta: 'Consulta', tipo: 'consulta', fecha: consulta,
      texto: `ASIENTO N.° 22 DEL RESIDENTE DE OBRA (${fechaLarga(consulta)}). CONSULTA N.° 03: Se solicita precisar cuál es el espesor de la carpeta asfáltica en caliente y de la base granular de la calzada, para programar el suministro de materiales.`,
    },
    {
      etiqueta: 'Adicional de obra', tipo: 'adicional', fecha: adicional,
      texto: `ASIENTO N.° 45 DEL RESIDENTE DE OBRA (${fechaLarga(adicional)}). Se anota la necesidad de la PRESTACIÓN ADICIONAL DE OBRA N.° 01 para ${h.trabajo}, porque ${h.hecho}. El presupuesto estimado del adicional es de S/ ${montoAdicional.toLocaleString('en-US', { minimumFractionDigits: 2 })}. Se solicita a la supervisión ratificar la necesidad.`,
    },
  ];
}
