'use client';

import { useState } from 'react';
import { Icono } from '../Icono';
import { Citas } from '../motor/Citas';
import { motor, type RespuestaNormativa } from '../motor/cliente';

// Una pregunta en lenguaje del evaluador; responde con los artículos que aplican, cada uno
// con su extracto literal verificado contra el texto oficial.

export function PreguntaNormativa() {
  const [pregunta, setPregunta] = useState('');
  const [caso, setCaso] = useState('');
  const [respuesta, setRespuesta] = useState<RespuestaNormativa | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');

  const consultar = async () => {
    setBuscando(true);
    setError('');
    setRespuesta(null);
    try {
      setRespuesta(await motor.consultar(pregunta.trim(), caso.trim()));
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setBuscando(false);
    }
  };

  return (
    <section className="content-panel pregunta-normativa" aria-labelledby="titulo-pregunta">
      <div className="section-heading">
        <h2 id="titulo-pregunta">Pregúntale a la ley</h2>
        <p>Describe el caso como lo explicarías a un colega. Axis busca en la Ley 32069 y su Reglamento y responde con los artículos que aplican y el texto exacto.</p>
      </div>
      <label className="campo campo-ancho"><span>Pregunta</span>
        <input value={pregunta} onChange={(x) => setPregunta(x.target.value)} placeholder="¿Qué pasa si el contratista pide mayores metrados en la obra?" />
      </label>
      <label className="campo campo-ancho"><span>Caso (opcional)</span>
        <textarea rows={3} value={caso} onChange={(x) => setCaso(x.target.value)} placeholder="Obra de pistas y veredas a precios unitarios; el residente anotó en el cuaderno que faltan 120 m³ de excavación." />
      </label>
      <div className="upload-actions">
        <button type="button" className="btn primary" disabled={buscando || pregunta.trim().length < 3} onClick={consultar}><Icono nombre={buscando ? 'clock' : 'arrow'} tamano={18} />{buscando ? 'Leyendo la normativa…' : 'Buscar en la ley'}</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {respuesta && <Citas respuesta={respuesta} />}
    </section>
  );
}
