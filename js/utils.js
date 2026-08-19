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
 * Sugere carga para a proxima sessao. A carga-base e sempre o maior peso ja
 * registrado para o exercicio (recorde pessoal) — o desempenho da ultima
 * sessao (reps) so decide se sobe, mantem ou reduz a partir desse recorde.
 * seriesUltimaSessao: [{numero_serie, carga_kg, reps}], ordenadas por numero_serie
 * cargaMaximaHistorica: maior carga_kg ja registrada para o exercicio (ou null)
 */
function sugerirCarga(exercicio, seriesUltimaSessao, cargaMaximaHistorica) {
  if (!seriesUltimaSessao || seriesUltimaSessao.length === 0) {
    if (cargaMaximaHistorica != null) {
      return {
        tipo: 'recorde',
        carga_sugerida: cargaMaximaHistorica,
        mensagem: `Sem sessão recente — sugestão baseada no seu recorde: ${cargaMaximaHistorica}kg.`
      };
    }
    return { tipo: 'sem_historico', mensagem: 'Sem histórico ainda — registre a primeira sessão.' };
  }
  const faixa = parseFaixaReps(exercicio.reps_alvo);
  if (!faixa) {
    return { tipo: 'indefinido', mensagem: 'Não foi possível interpretar a faixa de reps.' };
  }

  const base = cargaMaximaHistorica != null
    ? cargaMaximaHistorica
    : (seriesUltimaSessao.find(s => s.carga_kg != null)?.carga_kg ?? null);
  const primeira = seriesUltimaSessao[0];
  const algumaAbaixoDoMinimo = seriesUltimaSessao.some(s => s.reps != null && s.reps < faixa.min);
  const isolador = ehIsolador(exercicio.nome);

  if (algumaAbaixoDoMinimo) {
    const sugerida = base != null ? +(base * 0.85).toFixed(1) : null;
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
      return { tipo: 'aumentar_leve', carga_sugerida: base != null ? +(base + 1).toFixed(1) : null,
        mensagem: 'Bateu 15 reps — pode subir um pouco a carga ou fazer drop-set.' };
    }
    return { tipo: 'manter', carga_sugerida: base, mensagem: 'Isolador: progrida por reps até ~15 antes de subir carga.' };
  }

  if (primeira.reps != null && primeira.reps >= faixa.max) {
    const sugerida = base != null ? +(base + (base >= 40 ? 2.5 : 1.25)).toFixed(2) : null;
    return {
      tipo: 'aumentar',
      carga_sugerida: sugerida,
      mensagem: sugerida != null
        ? `Primeira série bateu o teto (${faixa.max}). Suba para ~${sugerida}kg.`
        : `Primeira série bateu o teto (${faixa.max}). Suba a carga.`
    };
  }

  return { tipo: 'manter', carga_sugerida: base, mensagem: 'Dentro da faixa — mantenha a carga (baseado no seu recorde).' };
}

// Janela de tempo (em meses) terminando hoje, para os graficos.
function calcularJanela(meses) {
  const fim = new Date();
  const inicio = new Date();
  inicio.setMonth(inicio.getMonth() - meses);
  return { inicio: inicio.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
}

// Gera uma data por semana entre inicioISO e fimISO (inclusive), para servir
// de eixo X continuo — assim uma semana sem registro aparece como um buraco
// real no grafico em vez de simplesmente sumir.
function gerarTimelineSemanal(inicioISO, fimISO) {
  const ticks = [];
  const d = new Date(inicioISO + 'T00:00:00');
  const fim = new Date(fimISO + 'T00:00:00');
  while (d <= fim) {
    ticks.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 7);
  }
  if (ticks.length === 0 || ticks[ticks.length - 1] < fimISO) ticks.push(fimISO);
  return ticks;
}

// Encaixa registros {data, valor} nos intervalos semanais da timeline.
// Semanas sem nenhum registro viram null (buraco real no grafico).
function encaixarNaTimeline(registros, ticks) {
  return ticks.map((tick, i) => {
    const proximo = ticks[i + 1] ?? null;
    const doIntervalo = registros.filter(r => r.data >= tick && (proximo === null || r.data < proximo));
    if (doIntervalo.length === 0) return null;
    return doIntervalo[doIntervalo.length - 1].valor;
  });
}

function escapeHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function agruparPorData(registros) {
  const grupos = {};
  for (const r of registros) {
    if (!grupos[r.data]) grupos[r.data] = [];
    grupos[r.data].push(r);
  }
  return grupos;
}
