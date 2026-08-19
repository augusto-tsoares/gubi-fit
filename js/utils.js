// Utilitarios: datas, faixas de reps, sugestao de carga (progressao dupla)

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function formatarDataBr(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Extrai {min, max} de textos como "6 - 9 (RIR 1)", "8-12 (RIR 0)", "10 - 12 (cada) (RIR 0)"
function parseFaixaReps(repsAlvo) {
  const match = String(repsAlvo).match(/(\d+)\s*-\s*(\d+)/);
  if (!match) return null;
  return { min: parseInt(match[1], 10), max: parseInt(match[2], 10) };
}

const ISOLADORES_KEYWORDS = ['Elevação Lateral', 'Elevação de Pernas', 'Panturrilha', 'Cadeira Abdutora', 'Voador'];

function ehIsolador(nomeExercicio) {
  return ISOLADORES_KEYWORDS.some(k => nomeExercicio.includes(k));
}

/**
 * Sugere carga para a proxima sessao com base na ultima sessao registrada.
 * seriesUltimaSessao: [{numero_serie, carga_kg, reps}], ordenadas por numero_serie
 */
function sugerirCarga(exercicio, seriesUltimaSessao) {
  if (!seriesUltimaSessao || seriesUltimaSessao.length === 0) {
    return { tipo: 'sem_historico', mensagem: 'Sem histórico ainda — registre a primeira sessão.' };
  }
  const faixa = parseFaixaReps(exercicio.reps_alvo);
  if (!faixa) {
    return { tipo: 'indefinido', mensagem: 'Não foi possível interpretar a faixa de reps.' };
  }

  const cargaAnterior = seriesUltimaSessao.find(s => s.carga_kg != null)?.carga_kg ?? null;
  const primeira = seriesUltimaSessao[0];
  const algumaAbaixoDoMinimo = seriesUltimaSessao.some(s => s.reps != null && s.reps < faixa.min);
  const isolador = ehIsolador(exercicio.nome);

  if (algumaAbaixoDoMinimo) {
    const sugerida = cargaAnterior != null ? +(cargaAnterior * 0.85).toFixed(1) : null;
    return {
      tipo: 'reduzir',
      carga_sugerida: sugerida,
      mensagem: sugerida != null
        ? `Alguma série ficou abaixo da faixa. Reduza para ~${sugerida}kg (back-off 10-20%).`
        : 'Alguma série ficou abaixo da faixa. Reduza a carga em 10-20%.'
    };
  }

  if (isolador) {
    if (primeira.reps != null && primeira.reps >= 15) {
      return { tipo: 'aumentar_leve', carga_sugerida: cargaAnterior != null ? +(cargaAnterior + 1).toFixed(1) : null,
        mensagem: 'Bateu 15 reps — pode subir um pouco a carga ou fazer drop-set.' };
    }
    return { tipo: 'manter', carga_sugerida: cargaAnterior, mensagem: 'Isolador: progrida por reps até ~15 antes de subir carga.' };
  }

  if (primeira.reps != null && primeira.reps >= faixa.max) {
    const sugerida = cargaAnterior != null ? +(cargaAnterior + (cargaAnterior >= 40 ? 2.5 : 1.25)).toFixed(2) : null;
    return {
      tipo: 'aumentar',
      carga_sugerida: sugerida,
      mensagem: sugerida != null
        ? `Primeira série bateu o teto (${faixa.max}). Suba para ~${sugerida}kg.`
        : `Primeira série bateu o teto (${faixa.max}). Suba a carga.`
    };
  }

  return { tipo: 'manter', carga_sugerida: cargaAnterior, mensagem: 'Dentro da faixa — mantenha a carga.' };
}

function agruparPorData(registros) {
  const grupos = {};
  for (const r of registros) {
    if (!grupos[r.data]) grupos[r.data] = [];
    grupos[r.data].push(r);
  }
  return grupos;
}
