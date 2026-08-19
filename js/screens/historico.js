let historicoChartInstance = null;

async function renderHistorico(container) {
  const exercicios = await db.exercicios.orderBy('treino').toArray();

  container.innerHTML = `
    <select class="exercicio-select" id="exercicio-select">
      ${exercicios.map(ex => `<option value="${ex.id}">${ex.treino} — ${ex.nome}</option>`).join('')}
    </select>
    <div class="card">
      <h2>Carga ao longo do tempo</h2>
      <canvas id="historico-chart" height="220"></canvas>
    </div>
    <div class="card" id="historico-tabela"></div>
  `;

  const select = container.querySelector('#exercicio-select');
  if (state.exercicioHistoricoId) select.value = state.exercicioHistoricoId;

  select.addEventListener('change', () => {
    state.exercicioHistoricoId = parseInt(select.value, 10);
    atualizarHistorico(container, state.exercicioHistoricoId);
  });

  const idInicial = state.exercicioHistoricoId || parseInt(select.value, 10);
  state.exercicioHistoricoId = idInicial;
  await atualizarHistorico(container, idInicial);
}

async function atualizarHistorico(container, exercicioId) {
  const registros = await db.registrosSeries.where('exercicio_id').equals(exercicioId).sortBy('data');
  const grupos = agruparPorData(registros);
  const datas = Object.keys(grupos).sort();

  const cargasMaxPorData = datas.map(d => {
    const cargas = grupos[d].map(r => r.carga_kg).filter(c => c != null);
    return cargas.length ? Math.max(...cargas) : null;
  });

  const ctx = container.querySelector('#historico-chart').getContext('2d');
  if (historicoChartInstance) historicoChartInstance.destroy();

  const corTexto = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#222';
  const corGrid = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#ddd';

  historicoChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: datas.map(formatarDataBr),
      datasets: [{
        label: 'Carga máx. (kg)',
        data: cargasMaxPorData,
        borderColor: '#9FC5E8',
        backgroundColor: 'rgba(159,197,232,0.2)',
        spanGaps: true,
        tension: 0.25,
        pointRadius: 2
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: corTexto } } },
      scales: {
        x: { ticks: { color: corTexto, maxRotation: 60, minRotation: 60, autoSkip: true, maxTicksLimit: 12 }, grid: { color: corGrid } },
        y: { ticks: { color: corTexto }, grid: { color: corGrid } }
      }
    }
  });

  const tabelaEl = container.querySelector('#historico-tabela');
  if (datas.length === 0) {
    tabelaEl.innerHTML = `<div class="empty-state">Sem registros para este exercício ainda.</div>`;
    return;
  }
  const linhas = datas.slice().reverse().slice(0, 15).map(d => {
    const series = grupos[d].sort((a, b) => a.numero_serie - b.numero_serie);
    const resumo = series.map(s => `${s.carga_kg ?? '-'}kg×${s.reps ?? '-'}`).join(', ');
    return `<tr><td>${formatarDataBr(d)}</td><td>${resumo}</td></tr>`;
  }).join('');

  tabelaEl.innerHTML = `
    <h2>Últimas sessões</h2>
    <table class="history-table">
      <thead><tr><th>Data</th><th>Séries</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>
  `;
}
