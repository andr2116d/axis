'use client';
// Si una parte visual falla (mapa, dibujo), se muestra un aviso en su lugar y el resto de la página sigue funcionando.
import { Component, type ReactNode } from 'react';

export class Seguro extends Component<{ children: ReactNode; aviso?: string }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch(e: unknown) { console.error('Parte de la página no se pudo mostrar:', e); }
  render() {
    if (this.state.error) return <p className="rounded border border-junta bg-panel p-4 text-sm text-grafito">{this.props.aviso ?? 'Esta parte no se pudo mostrar. El resto del análisis sigue disponible.'}</p>;
    return this.props.children;
  }
}
