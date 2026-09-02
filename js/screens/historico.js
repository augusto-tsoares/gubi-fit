let historicoChartInstance = null;
let cardioChartInstance = null;

async function renderHistorico(container) {
  if (!state.historicoModo) state.historicoModo = 'musculacao';

  container.innerHTML = `
    <div class="treino-tabs-wrap">
      <div class="treino-tabs" id="historico-subtabs">
        <button class="treino-tab subtab ${state.historicoModo === 'musculacao' ? 'active' : ''}" data-modo="musculacao">Musculação</button>
        <button class="treino-tab subtab ${state.historicoModo === 'cardio' ? 'active' : ''}" data-modo="cardio">Cardio</button>
      </div>
    </div>
    <div id="historico-conteudo"></div>
  `;

  container.querySelectorAll('.subtab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.historicoModo = btn.dataset.modo;
      renderHistorico(container);
    });
  });

  const conteudo = container.querySelector('#historico-conteudo');
  if (state.historicoModo === 'cardio') {
    await renderHistoricoCardio(conteudo);
  } else {
    await renderHistoricoMusculacao(conteudo);
  }
}

async function renderHistoricoMusculacao(container) {
  const exercicios = await db.exercicios.orderBy('treino').toArray();
  if (!state.historicoJanelaMeses) state.historicoJanelaMeses = 12;

  if (exercicios.length === 0) {
    container.innerHTML = `<div class="empty-state">Nenhum exercício cadastrado.</div>`;
    return;
  }

  container.innerHTML = `
    <select class="exercicio-select" id="exercicio-select">
      ${exercicios.map(ex => `<option value="${ex.id}">${ex.treino} — ${escapeHtml(ex.nome)}</option>`).join('')}
    </select>
    <div class="card">
      <div class="card-header-row">
        <h2>Carga ao longo do tempo</h2>
        <select class="janela-select" id="historico-janela">
          <option value="1">1 mês</option>
          <option value="3">3 meses</option>
          <option value="6">6 meses</option>
          <option value="12">1 ano</option>
          <option value="todos">Todos os dados</option>
        </select>
      </div>
      <canvas id="historico-chart" height="220"></canvas>
    </div>
    <div class="card" id="historico-tabela"></div>
  `;

  const select = container.querySelector('#exercicio-select');
  if (state.exercicioHistoricoId) select.value = state.exercicioHistoricoId;

  const janelaSelect = container.querySelector('#historico-janela');
  janelaSelect.value = String(state.historicoJanelaMeses);

  select.addEventListener('change', () => {
    state.exercicioHistoricoId = parseInt(select.value, 10);
    atualizarHistorico(container, state.exercicioHistoricoId);
  });
  janelaSelect.addEventListener('change', () => {
    state.historicoJanelaMeses = janelaSelect.value === 'todos' ? 'todos' : parseInt(janelaSelect.value, 10);
    atualizarHistorico(container, state.exercicioHistoricoId);
  });

  const idInicial = state.exercicioHistoricoId || parseInt(select.value, 10);
  state.exercicioHistoricoId = idInicial;
  await atualizarHistorico(container, idInicial);
}

async function atualizarHistorico(container, exercicioId) {
  const registros = await db.registrosSeries.where('exercicio_id').equals(exercicioId).sortBy('data');
  const grupos = agruparPorData(registros);
  const datasComRegistro = Object.keys(grupos).sort();

  const registrosCargaMax = datasComRegistro.map(d => {
    const cargas = grupos[d].map(r => r.carga_kg).filter(c => c != null);
    return { data: d, valor: cargas.length ? Math.max(...cargas) : null };
  });

  const janela = resolverJanela(state.historicoJanelaMeses, datasComRegistro);
  const ticks = gerarTimelineSemanal(janela.inicio, janela.fim);
  const valores = encaixarNaTimeline(registrosCargaMax, ticks);
  const labels = ticks.map(formatarDataBr);

  const ctx = container.querySelector('#historico-chart').getContext('2d');
  if (historicoChartInstance) historicoChartInstance.destroy();

  const corTexto = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#222';
  const corGrid = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#ddd';

  historicoChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Carga máx. (kg)',
        data: valores,
        borderColor: '#9FC5E8',
        backgroundColor: 'rgba(159,197,232,0.2)',
        spanGaps: false,
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
  if (datasComRegistro.length === 0) {
    tabelaEl.innerHTML = `<div class="empty-state">Sem registros para este exercício ainda.</div>`;
    return;
  }
  const linhas = datasComRegistro.slice().reverse().slice(0, 15).map(d => {
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

async function renderHistoricoCardio(container) {
  if (!state.cardioJanelaMeses) state.cardioJanelaMeses = 12;

  container.innerHTML = `
    <div class="card">
      <div class="card-header-row">
        <h2>Cardio ao longo do tempo</h2>
        <select class="janela-select" id="cardio-janela">
          <option value="1">1 mês</option>
          <option value="3">3 meses</option>
          <option value="6">6 meses</option>
          <option value="12">1 ano</option>
          <option value="todos">Todos os dados</option>
        </select>
      </div>
      <canvas id="cardio-chart" height="220"></canvas>
    </div>
    <div class="card" id="cardio-tabela"></div>
  `;

  const janelaSelect = container.querySelector('#cardio-janela');
  janelaSelect.value = String(state.cardioJanelaMeses);
  janelaSelect.addEventListener('change', () => {
    state.cardioJanelaMeses = janelaSelect.value === 'todos' ? 'todos' : parseInt(janelaSelect.value, 10);
    atualizarHistoricoCardio(container);
  });

  await atualizarHistoricoCardio(container);
}

async function atualizarHistoricoCardio(container) {
  const registros = await db.registrosCardio.orderBy('data').toArray();
  const grupos = agruparPorData(registros);
  const datasComRegistro = Object.keys(grupos).sort();

  const registrosDuracaoTotal = datasComRegistro.map(d => {
    const duracoes = grupos[d].map(r => r.duracao_min).filter(v => Number.isFinite(v));
    return { data: d, valor: duracoes.length ? duracoes.reduce((a, b) => a + b, 0) : null };
  });

  const janela = resolverJanela(state.cardioJanelaMeses, datasComRegistro);
  const ticks = gerarTimelineSemanal(janela.inicio, janela.fim);
  const valores = encaixarNaTimeline(registrosDuracaoTotal, ticks);
  const labels = ticks.map(formatarDataBr);

  const ctx = container.querySelector('#cardio-chart').getContext('2d');
  if (cardioChartInstance) cardioChartInstance.destroy();

  const corTexto = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#222';
  const corGrid = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#ddd';

  cardioChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Duração total no dia (min)',
        data: valores,
        borderColor: '#B6D7A8',
        backgroundColor: 'rgba(182,215,168,0.25)',
        spanGaps: false,
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

  const tabelaEl = container.querySelector('#cardio-tabela');
  if (datasComRegistro.length === 0) {
    tabelaEl.innerHTML = `<div class="empty-state">Sem registros de cardio ainda.</div>`;
    return;
  }
  const linhas = datasComRegistro.slice().reverse().slice(0, 15).map(d => {
    const resumo = grupos[d].map(r => `${r.tipo} ${r.duracao_min ?? '-'}min${r.distancia_km ? ` (${r.distancia_km}km)` : ''}`).join(', ');
    return `<tr><td>${formatarDataBr(d)}</td><td>${resumo}</td></tr>`;
  }).join('');

  tabelaEl.innerHTML = `
    <h2>Últimas sessões</h2>
    <table class="history-table">
      <thead><tr><th>Data</th><th>Cardio</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>
  `;
}
