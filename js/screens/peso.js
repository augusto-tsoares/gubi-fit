let pesoChartInstance = null;

async function renderPeso(container) {
  if (!state.pesoJanelaMeses) state.pesoJanelaMeses = 12;
  if (!state.pesoFaseFiltro) state.pesoFaseFiltro = 'todas';

  const registrosExistentes = await db.registrosPeso.orderBy('data').toArray();
  const ultimoRegistro = [...registrosExistentes].reverse().find(r => r.peso_kg != null);
  const bannerLembrete = ultimoRegistro && diasDesde(ultimoRegistro.data) >= 7
    ? `<div class="banner warning">Já se passaram ${diasDesde(ultimoRegistro.data)} dias desde sua última pesagem (${formatarDataBr(ultimoRegistro.data)}). Que tal registrar hoje?</div>`
    : '';

  container.innerHTML = `
    ${bannerLembrete}
    <div class="card">
      <h2>Registrar peso de hoje</h2>
      <div class="form-row">
        <input type="date" id="peso-data" value="${hoje()}">
        <input type="number" id="peso-valor" inputmode="decimal" step="0.1" placeholder="kg">
        <button class="btn-primary" id="peso-salvar">Salvar</button>
      </div>
    </div>
    <div class="card" id="peso-meta"></div>
    <div class="card">
      <div class="card-header-row">
        <h2>Evolução</h2>
        <div class="filtros-peso">
          <select class="janela-select" id="peso-fase-filtro">
            <option value="todas">Todas as fases</option>
            ${Object.values(FASES_INFO).map(f => `<option value="${f.tipo}">${f.nome}</option>`).join('')}
          </select>
          <select class="janela-select" id="peso-janela">
            <option value="1">1 mês</option>
            <option value="3">3 meses</option>
            <option value="6">6 meses</option>
            <option value="12">1 ano</option>
          </select>
        </div>
      </div>
      <canvas id="peso-chart" height="220"></canvas>
    </div>
    <div class="card" id="peso-resumo"></div>
    <div class="card" id="peso-tabela"></div>
    <div class="toast" id="toast">Peso salvo!</div>
  `;

  container.querySelector('#peso-salvar').addEventListener('click', () => salvarPeso(container));

  const janelaSelect = container.querySelector('#peso-janela');
  janelaSelect.value = String(state.pesoJanelaMeses);
  janelaSelect.addEventListener('change', () => {
    state.pesoJanelaMeses = parseInt(janelaSelect.value, 10);
    desenharGraficoPeso(container);
  });

  const faseFiltroSelect = container.querySelector('#peso-fase-filtro');
  faseFiltroSelect.value = state.pesoFaseFiltro;
  faseFiltroSelect.addEventListener('change', () => {
    state.pesoFaseFiltro = faseFiltroSelect.value;
    desenharGraficoPeso(container);
    renderTabelaPeso(container);
  });

  await renderMetaPeso(container);
  await desenharGraficoPeso(container);
  await renderResumoPeso(container);
  await renderTabelaPeso(container);
}

async function salvarPeso(container) {
  const data = container.querySelector('#peso-data').value;
  const valor = parseFloat(container.querySelector('#peso-valor').value);
  if (!data || isNaN(valor)) return;

  const fase = await getFaseAtual();
  const existente = await db.registrosPeso.where('data').equals(data).first();
  if (existente) {
    await db.registrosPeso.update(existente.id, { peso_kg: valor, fase });
  } else {
    await db.registrosPeso.add({ data, peso_kg: valor, fase });
  }

  container.querySelector('#peso-valor').value = '';
  const toast = container.querySelector('#toast');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);

  await desenharGraficoPeso(container);
  await renderResumoPeso(container);
  await renderTabelaPeso(container);
}

async function renderMetaPeso(container) {
  const el = container.querySelector('#peso-meta');
  const meta = await getMetaPeso();

  if (!meta) {
    el.innerHTML = `
      <h2>Definir meta de peso</h2>
      <div class="meta-peso-form">
        <input type="number" id="meta-peso-valor" inputmode="decimal" step="0.1" placeholder="peso desejado (kg)">
        <select id="meta-peso-prazo">
          <option value="1">em 1 mês</option>
          <option value="3" selected>em 3 meses</option>
          <option value="6">em 6 meses</option>
          <option value="12">em 1 ano</option>
        </select>
        <button class="btn-primary" id="meta-peso-salvar" type="button">Definir meta</button>
      </div>
    `;
    el.querySelector('#meta-peso-salvar').addEventListener('click', () => salvarMetaPeso(container));
    return;
  }

  const ritmo = calcularRitmoSemanal(meta);
  const agressiva = Math.abs(ritmo.percentPorSemana) > 0.5;
  const sinal = ritmo.kgPorSemana >= 0 ? '+' : '';

  el.innerHTML = `
    <h2>Meta de peso</h2>
    <div class="meta-peso-atual">
      <div class="stat-row"><span class="stat-label">Alvo</span><span class="stat-value">${meta.peso_alvo} kg até ${formatarDataBr(meta.data_alvo)}</span></div>
      <div class="stat-row"><span class="stat-label">Ritmo implícito</span><span class="stat-value">${sinal}${ritmo.kgPorSemana}kg/semana (${sinal}${ritmo.percentPorSemana}%)</span></div>
      ${agressiva ? `<div class="banner warning">Esse ritmo passa de 0,5% do peso corporal por semana — acima disso aumenta o risco de perder músculo (no cutting) ou ganhar gordura em excesso (no bulking). Ainda assim, a meta fica ativa se você preferir manter.</div>` : ''}
      <button class="link-btn" id="meta-peso-remover" type="button">Remover meta</button>
    </div>
  `;
  el.querySelector('#meta-peso-remover').addEventListener('click', async () => {
    await limparMetaPeso();
    await renderMetaPeso(container);
    await desenharGraficoPeso(container);
  });
}

async function salvarMetaPeso(container) {
  const valor = parseFloat(container.querySelector('#meta-peso-valor').value);
  const prazo = parseInt(container.querySelector('#meta-peso-prazo').value, 10);
  if (isNaN(valor)) return;

  const registros = await db.registrosPeso.orderBy('data').toArray();
  const ultimo = [...registros].reverse().find(r => r.peso_kg != null);
  const pesoInicial = ultimo ? ultimo.peso_kg : BASELINE_PESO.peso_kg;

  await setMetaPeso(valor, prazo, pesoInicial);
  await renderMetaPeso(container);
  await desenharGraficoPeso(container);
}

async function desenharGraficoPeso(container) {
  const todosRegistrosGeral = await db.registrosPeso.orderBy('data').toArray();
  const filtro = state.pesoFaseFiltro || 'todas';
  const todosRegistros = filtro === 'todas'
    ? todosRegistrosGeral
    : todosRegistrosGeral.filter(r => r.fase === filtro);
  const meta = await getMetaPeso();

  const janela = calcularJanela(state.pesoJanelaMeses);
  if (meta && meta.data_alvo > janela.fim) janela.fim = meta.data_alvo;
  const ticks = gerarTimelineSemanal(janela.inicio, janela.fim);
  const labels = ticks.map(formatarDataBr);

  const valores = [];
  const coresPorTick = [];
  ticks.forEach((tick, i) => {
    const proximo = ticks[i + 1] ?? null;
    const doIntervalo = todosRegistros.filter(r => r.data >= tick && (proximo === null || r.data < proximo));
    if (doIntervalo.length === 0) {
      valores.push(null);
      coresPorTick.push('transparent');
      return;
    }
    const ultimoDoIntervalo = doIntervalo[doIntervalo.length - 1];
    valores.push(ultimoDoIntervalo.peso_kg);
    const corVar = ultimoDoIntervalo.fase ? `--fase-marker-${ultimoDoIntervalo.fase}` : null;
    coresPorTick.push(corVar ? getComputedStyle(document.body).getPropertyValue(corVar).trim() : '#666666');
  });

  let linhaMeta = null;
  let labelMeta = 'Meta';
  if (meta) {
    linhaMeta = ticks.map(t => pesoTrajetoriaMeta(meta, t));
    labelMeta = `Meta (${meta.peso_alvo}kg até ${formatarDataBr(meta.data_alvo)})`;
  } else {
    const metaFase = await calcularMetaPesoFaseAtual(todosRegistrosGeral);
    if (metaFase != null) {
      linhaMeta = valores.map(() => metaFase);
      labelMeta = 'Referência da fase';
    }
  }

  const ctx = container.querySelector('#peso-chart').getContext('2d');
  if (pesoChartInstance) pesoChartInstance.destroy();

  const corTexto = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#222';
  const corGrid = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#ddd';

  pesoChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Peso (kg)',
          data: valores,
          borderColor: '#666666',
          backgroundColor: 'rgba(102,102,102,0.15)',
          pointBackgroundColor: coresPorTick,
          pointBorderColor: coresPorTick,
          pointRadius: 4,
          spanGaps: false,
          tension: 0.25
        },
        linhaMeta ? {
          label: labelMeta,
          data: linhaMeta,
          borderColor: '#B4A7D6',
          borderDash: [6, 4],
          pointRadius: 0,
          spanGaps: false
        } : null
      ].filter(Boolean)
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: corTexto } }
      },
      scales: {
        x: { ticks: { color: corTexto, maxRotation: 60, minRotation: 60, autoSkip: true, maxTicksLimit: 12 }, grid: { color: corGrid } },
        y: { ticks: { color: corTexto }, grid: { color: corGrid } }
      }
    }
  });
}

async function calcularMetaPesoFaseAtual(registrosPeso) {
  const tipoFase = await getFaseAtual();
  const ultimoRegistro = [...registrosPeso].reverse().find(r => r.peso_kg != null);
  const pesoBase = ultimoRegistro ? ultimoRegistro.peso_kg : BASELINE_PESO.peso_kg;
  if (tipoFase === 'bulking') return +(pesoBase + 0.3).toFixed(1);
  if (tipoFase === 'cutting') return +(pesoBase * 0.995).toFixed(1);
  return pesoBase;
}

async function renderResumoPeso(container) {
  const tipoFase = await getFaseAtual();
  const registros = await db.registrosPeso.orderBy('data').toArray();
  const ultimo = [...registros].reverse().find(r => r.peso_kg != null);
  const meta = await getMetaPeso();
  const referencia = meta ? pesoTrajetoriaMeta(meta, hoje()) : await calcularMetaPesoFaseAtual(registros);

  const el = container.querySelector('#peso-resumo');
  el.innerHTML = `
    <h2>Fase atual</h2>
    <div class="stat-row"><span class="stat-label">Fase</span><span class="stat-value">${FASES_INFO[tipoFase].nome}</span></div>
    <div class="stat-row"><span class="stat-label">Peso atual</span><span class="stat-value">${ultimo ? ultimo.peso_kg + ' kg' : '—'}</span></div>
    <div class="stat-row"><span class="stat-label">${meta ? 'Peso ideal hoje (meta)' : 'Referência semanal'}</span><span class="stat-value">${referencia != null ? referencia + ' kg' : '—'}</span></div>
  `;
}

async function renderTabelaPeso(container) {
  const filtro = state.pesoFaseFiltro || 'todas';
  const todos = await db.registrosPeso.orderBy('data').reverse().toArray();
  const registros = (filtro === 'todas' ? todos : todos.filter(r => r.fase === filtro)).slice(0, 15);
  const el = container.querySelector('#peso-tabela');

  const titulo = filtro === 'todas' ? 'Últimas pesagens' : `Últimas pesagens — ${FASES_INFO[filtro].nome}`;

  if (registros.length === 0) {
    el.innerHTML = `<h2>${titulo}</h2><div class="empty-state">Nenhum peso registrado ${filtro === 'todas' ? 'ainda' : 'nessa fase'}.</div>`;
    return;
  }

  const linhas = registros.map(r => `
    <tr>
      <td>${formatarDataBr(r.data)}</td>
      <td>${r.peso_kg} kg</td>
      <td>${r.fase ? `<span class="fase-dot ${r.fase}"></span>${FASES_INFO[r.fase]?.nome ?? r.fase}` : '—'}</td>
    </tr>
  `).join('');

  el.innerHTML = `
    <h2>${titulo}</h2>
    <table class="history-table">
      <thead><tr><th>Data</th><th>Peso</th><th>Fase</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>
  `;
}
