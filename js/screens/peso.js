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
        <input type="text" id="peso-valor" inputmode="decimal" placeholder="kg">
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
            <option value="todos">Todos os dados</option>
          </select>
        </div>
      </div>
      <canvas id="peso-chart" height="220"></canvas>
    </div>
    <div class="card" id="peso-resumo"></div>
    <div class="card" id="peso-tabela"></div>
    <div class="card">
      <h2>Composição corporal</h2>
      <p class="ajuda-texto">Bioimpedância e medidas — não precisa preencher toda pesagem, só quando tiver esses dados (ex: a cada 3-6 meses).</p>
      <button class="add-serie-btn" id="btn-toggle-composicao" type="button">+ Novo registro de composição</button>
      <div id="composicao-form-wrap" hidden></div>
      <p class="ajuda-texto" style="margin-top: 10px;">Importar/exportar CSV de composição fica na aba Exercícios, junto com os outros dados.</p>
      <div class="card-header-row" style="margin-top: 16px;">
        <h2 style="margin: 0;">Evolução</h2>
        <div class="filtros-peso">
          <select class="janela-select" id="composicao-metrica">
            ${METRICAS_COMPOSICAO.map(m => `<option value="${m.chave}">${m.label}</option>`).join('')}
          </select>
          <select class="janela-select" id="composicao-janela">
            <option value="3">3 meses</option>
            <option value="6">6 meses</option>
            <option value="12" selected>1 ano</option>
            <option value="24">2 anos</option>
            <option value="todos">Todos os dados</option>
          </select>
        </div>
      </div>
      <canvas id="composicao-chart" height="220"></canvas>

      <h2 style="margin-top: 20px;">Distribuição percentual (registro mais recente)</h2>
      <canvas id="composicao-donut" height="220"></canvas>
      <div id="composicao-donut-vazio"></div>

      <h2 style="margin-top: 20px;">Medidas por parte do corpo (registro mais recente)</h2>
      <p class="ajuda-texto">Cada medida é um valor único (não separado por lado esquerdo/direito).</p>
      <canvas id="composicao-barras" height="260"></canvas>
      <div id="composicao-barras-vazio"></div>

      <div id="composicao-lista"></div>
    </div>
    <div class="toast" id="toast">Peso salvo!</div>
    <div class="toast" id="toast-composicao">Registro salvo!</div>
  `;

  container.querySelector('#peso-salvar').addEventListener('click', () => salvarPeso(container));

  const janelaSelect = container.querySelector('#peso-janela');
  janelaSelect.value = String(state.pesoJanelaMeses);
  janelaSelect.addEventListener('change', () => {
    state.pesoJanelaMeses = janelaSelect.value === 'todos' ? 'todos' : parseInt(janelaSelect.value, 10);
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
  await inicializarComposicaoCorporal(container);
}

async function salvarPeso(container) {
  const data = container.querySelector('#peso-data').value;
  const valor = parseNumeroDecimal(container.querySelector('#peso-valor').value);
  if (!data || valor == null) return;

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
        <input type="text" id="meta-peso-valor" inputmode="decimal" placeholder="peso desejado (kg)">
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
  const valor = parseNumeroDecimal(container.querySelector('#meta-peso-valor').value);
  const prazo = parseInt(container.querySelector('#meta-peso-prazo').value, 10);
  if (valor == null) return;

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

  const janela = resolverJanela(state.pesoJanelaMeses, todosRegistros.map(r => r.data));
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

const METRICAS_COMPOSICAO = [
  { chave: 'peso_kg', label: 'Peso (kg)' },
  { chave: 'gordura_pct', label: '% Gordura corporal' },
  { chave: 'massa_muscular_pct', label: '% Massa muscular' },
  { chave: 'agua_pct', label: '% Água corporal' },
  { chave: 'massa_ossea_kg', label: 'Massa óssea (kg)' },
  { chave: 'gordura_visceral', label: 'Gordura visceral' },
  { chave: 'tmb_kcal', label: 'Taxa metabólica basal (kcal)' },
  { chave: 'idade_metabolica', label: 'Idade metabólica' },
  { chave: 'cintura_cm', label: 'Cintura (cm)' },
  { chave: 'quadril_cm', label: 'Quadril (cm)' },
  { chave: 'coxa_cm', label: 'Coxa (cm)' },
  { chave: 'panturrilha_cm', label: 'Panturrilha (cm)' },
  { chave: 'peito_cm', label: 'Peito (cm)' },
  { chave: 'busto_cm', label: 'Busto (cm)' },
  { chave: 'biceps_cm', label: 'Bíceps (cm)' }
];

let composicaoChartInstance = null;

async function inicializarComposicaoCorporal(container) {
  container.querySelector('#btn-toggle-composicao').addEventListener('click', () => {
    const wrap = container.querySelector('#composicao-form-wrap');
    if (wrap.hidden && wrap.innerHTML === '') {
      wrap.innerHTML = composicaoFormHtml();
      wrap.querySelector('#comp-salvar').addEventListener('click', () => salvarComposicao(container));
    }
    wrap.hidden = !wrap.hidden;
  });

  if (!state.composicaoMetrica) state.composicaoMetrica = 'peso_kg';
  if (!state.composicaoJanelaMeses) state.composicaoJanelaMeses = 12;

  const metricaSelect = container.querySelector('#composicao-metrica');
  metricaSelect.value = state.composicaoMetrica;
  metricaSelect.addEventListener('change', () => {
    state.composicaoMetrica = metricaSelect.value;
    desenharGraficoComposicao(container);
  });

  const janelaSelect = container.querySelector('#composicao-janela');
  janelaSelect.value = String(state.composicaoJanelaMeses);
  janelaSelect.addEventListener('change', () => {
    state.composicaoJanelaMeses = janelaSelect.value === 'todos' ? 'todos' : parseInt(janelaSelect.value, 10);
    desenharGraficoComposicao(container);
  });

  await desenharGraficoComposicao(container);
  await renderGraficosResumoComposicao(container);
  await renderListaComposicao(container);
}

function composicaoFormHtml() {
  return `
    <div class="composicao-form">
      <div class="edit-row"><input type="date" id="comp-data" value="${hoje()}"></div>
      <div class="edit-row">
        <input type="text" inputmode="decimal" id="comp-peso" placeholder="Peso (kg)">
        <input type="text" inputmode="decimal" id="comp-gordura" placeholder="% Gordura">
      </div>
      <div class="edit-row">
        <input type="text" inputmode="decimal" id="comp-musculo" placeholder="% Massa muscular">
        <input type="text" inputmode="decimal" id="comp-agua" placeholder="% Água">
      </div>
      <div class="edit-row">
        <input type="text" inputmode="decimal" id="comp-ossea" placeholder="Massa óssea (kg)">
        <input type="text" inputmode="decimal" id="comp-visceral" placeholder="Gordura visceral">
      </div>
      <div class="edit-row">
        <input type="text" inputmode="decimal" id="comp-tmb" placeholder="TMB (kcal)">
        <input type="text" inputmode="decimal" id="comp-idade-metab" placeholder="Idade metabólica">
      </div>
      <p class="ajuda-texto" style="margin: 4px 0;">Medidas (cm)</p>
      <div class="edit-row">
        <input type="text" inputmode="decimal" id="comp-cintura" placeholder="Cintura">
        <input type="text" inputmode="decimal" id="comp-quadril" placeholder="Quadril">
      </div>
      <div class="edit-row">
        <input type="text" inputmode="decimal" id="comp-coxa" placeholder="Coxa">
        <input type="text" inputmode="decimal" id="comp-panturrilha" placeholder="Panturrilha">
      </div>
      <div class="edit-row">
        <input type="text" inputmode="decimal" id="comp-peito" placeholder="Peito">
        <input type="text" inputmode="decimal" id="comp-busto" placeholder="Busto">
      </div>
      <div class="edit-row">
        <input type="text" inputmode="decimal" id="comp-biceps" placeholder="Bíceps">
      </div>
      <button class="btn-primary" id="comp-salvar" type="button" style="width: 100%; margin-top: 4px;">Salvar registro</button>
    </div>
  `;
}

async function salvarComposicao(container) {
  const campo = (id) => parseNumeroDecimal(container.querySelector(id).value);
  const data = container.querySelector('#comp-data').value || hoje();

  const registro = {
    data,
    peso_kg: campo('#comp-peso'),
    gordura_pct: campo('#comp-gordura'),
    massa_muscular_pct: campo('#comp-musculo'),
    agua_pct: campo('#comp-agua'),
    massa_ossea_kg: campo('#comp-ossea'),
    gordura_visceral: campo('#comp-visceral'),
    tmb_kcal: campo('#comp-tmb'),
    idade_metabolica: campo('#comp-idade-metab'),
    cintura_cm: campo('#comp-cintura'),
    quadril_cm: campo('#comp-quadril'),
    coxa_cm: campo('#comp-coxa'),
    panturrilha_cm: campo('#comp-panturrilha'),
    peito_cm: campo('#comp-peito'),
    busto_cm: campo('#comp-busto'),
    biceps_cm: campo('#comp-biceps')
  };

  const temAlgumDado = Object.entries(registro).some(([chave, valor]) => chave !== 'data' && valor != null);
  if (!temAlgumDado) return;

  const existente = await db.registrosMedidas.where('data').equals(data).first();
  if (existente) {
    // So manda os campos preenchidos desta vez — update() faz merge por
    // chave, entao um campo deixado em branco agora nao apaga o valor que
    // ja tinha sido salvo numa vez anterior pra essa mesma data.
    const camposPreenchidos = Object.fromEntries(
      Object.entries(registro).filter(([chave, valor]) => chave === 'data' || valor != null)
    );
    await db.registrosMedidas.update(existente.id, camposPreenchidos);
  } else {
    await db.registrosMedidas.add(registro);
  }

  // Aproveita o peso, se preenchido, pra tambem alimentar o registro de
  // peso normal — evita ter que lancar o mesmo numero duas vezes.
  if (registro.peso_kg != null) {
    const fase = await getFaseAtual();
    const existentePeso = await db.registrosPeso.where('data').equals(data).first();
    if (existentePeso) {
      await db.registrosPeso.update(existentePeso.id, { peso_kg: registro.peso_kg, fase });
    } else {
      await db.registrosPeso.add({ data, peso_kg: registro.peso_kg, fase });
    }
    await desenharGraficoPeso(container);
    await renderResumoPeso(container);
    await renderTabelaPeso(container);
  }

  const wrap = container.querySelector('#composicao-form-wrap');
  wrap.innerHTML = '';
  wrap.hidden = true;

  const toast = container.querySelector('#toast-composicao');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);

  await desenharGraficoComposicao(container);
  await renderGraficosResumoComposicao(container);
  await renderListaComposicao(container);
}

async function desenharGraficoComposicao(container) {
  const metricaChave = state.composicaoMetrica;
  const metricaInfo = METRICAS_COMPOSICAO.find(m => m.chave === metricaChave);
  const registros = await db.registrosMedidas.orderBy('data').toArray();
  const pontos = registros.filter(r => r[metricaChave] != null).map(r => ({ data: r.data, valor: r[metricaChave] }));

  const janela = resolverJanela(state.composicaoJanelaMeses, pontos.map(p => p.data));
  const ticks = gerarTimelineSemanal(janela.inicio, janela.fim);
  const valores = encaixarNaTimeline(pontos, ticks);
  const labels = ticks.map(formatarDataBr);

  const ctx = container.querySelector('#composicao-chart').getContext('2d');
  if (composicaoChartInstance) composicaoChartInstance.destroy();

  const corTexto = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#222';
  const corGrid = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#ddd';

  composicaoChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: metricaInfo ? metricaInfo.label : metricaChave,
        data: valores,
        borderColor: '#A2C4C9',
        backgroundColor: 'rgba(162,196,201,0.2)',
        spanGaps: false,
        tension: 0.25,
        pointRadius: 3
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
}

async function renderListaComposicao(container) {
  const registros = await db.registrosMedidas.orderBy('data').reverse().limit(8).toArray();
  const el = container.querySelector('#composicao-lista');

  if (registros.length === 0) {
    el.innerHTML = `<div class="empty-state">Nenhum registro de composição ainda.</div>`;
    return;
  }

  const linhas = registros.map(r => {
    const partes = METRICAS_COMPOSICAO
      .filter(m => r[m.chave] != null)
      .map(m => `${m.label}: ${r[m.chave]}`);
    return `
      <div class="composicao-item">
        <div class="composicao-item-data">${formatarDataBr(r.data)}</div>
        <div class="composicao-item-detalhes">${partes.join(' · ')}</div>
      </div>
    `;
  }).join('');

  el.innerHTML = `<h2>Últimos registros</h2>${linhas}`;
}

// Import/export CSV de composicao ficam em js/screens/exercicios.js, junto
// com os outros botoes de dados (treinos/peso) — usam METRICAS_COMPOSICAO
// definido aqui em cima.

let composicaoDonutInstance = null;
let composicaoBarrasInstance = null;

const CAMPOS_PERCENTUAIS_DONUT = [
  { chave: 'gordura_pct', label: '% Gordura', cor: '#D5A6BD' },
  { chave: 'massa_muscular_pct', label: '% Massa muscular', cor: '#9FC5E8' },
  { chave: 'agua_pct', label: '% Água', cor: '#A2C4C9' }
];

const CAMPOS_MEDIDAS_BARRAS = [
  { chave: 'biceps_cm', label: 'Bíceps' },
  { chave: 'peito_cm', label: 'Peito' },
  { chave: 'busto_cm', label: 'Busto' },
  { chave: 'cintura_cm', label: 'Cintura' },
  { chave: 'quadril_cm', label: 'Quadril' },
  { chave: 'coxa_cm', label: 'Coxa' },
  { chave: 'panturrilha_cm', label: 'Panturrilha' }
];

async function renderGraficosResumoComposicao(container) {
  const registros = await db.registrosMedidas.orderBy('data').toArray();

  const ultimoComPercentuais = [...registros].reverse()
    .find(r => CAMPOS_PERCENTUAIS_DONUT.some(c => r[c.chave] != null));
  renderDonutComposicao(container, ultimoComPercentuais);

  const ultimoComMedidas = [...registros].reverse()
    .find(r => CAMPOS_MEDIDAS_BARRAS.some(c => r[c.chave] != null));
  renderBarrasMedidas(container, ultimoComMedidas);
}

function renderDonutComposicao(container, registro) {
  const canvas = container.querySelector('#composicao-donut');
  const vazioEl = container.querySelector('#composicao-donut-vazio');
  if (composicaoDonutInstance) {
    composicaoDonutInstance.destroy();
    composicaoDonutInstance = null;
  }

  const dados = registro
    ? CAMPOS_PERCENTUAIS_DONUT.filter(c => registro[c.chave] != null)
    : [];

  if (dados.length === 0) {
    canvas.hidden = true;
    vazioEl.innerHTML = `<div class="empty-state">Sem % de gordura, massa muscular ou água registrados ainda.</div>`;
    return;
  }
  canvas.hidden = false;
  vazioEl.innerHTML = `<p class="ajuda-texto">Registro de ${formatarDataBr(registro.data)}. Os percentuais podem se sobrepor (ex: água já faz parte da massa muscular) — é uma visão rápida, não uma soma exata de 100%.</p>`;

  const corTexto = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#222';

  composicaoDonutInstance = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: dados.map(d => d.label),
      datasets: [{
        data: dados.map(d => registro[d.chave]),
        backgroundColor: dados.map(d => d.cor)
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { color: corTexto } }
      }
    }
  });
}

function renderBarrasMedidas(container, registro) {
  const canvas = container.querySelector('#composicao-barras');
  const vazioEl = container.querySelector('#composicao-barras-vazio');
  if (composicaoBarrasInstance) {
    composicaoBarrasInstance.destroy();
    composicaoBarrasInstance = null;
  }

  const presentes = registro
    ? CAMPOS_MEDIDAS_BARRAS.filter(c => registro[c.chave] != null)
    : [];

  if (presentes.length === 0) {
    canvas.hidden = true;
    vazioEl.innerHTML = `<div class="empty-state">Sem medidas de corpo registradas ainda.</div>`;
    return;
  }
  canvas.hidden = false;
  vazioEl.innerHTML = '';

  const corTexto = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#222';
  const corGrid = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#ddd';

  composicaoBarrasInstance = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: presentes.map(c => c.label),
      datasets: [{
        label: `Medidas (cm) — ${formatarDataBr(registro.data)}`,
        data: presentes.map(c => registro[c.chave]),
        backgroundColor: '#B6D7A8'
      }]
    },
    options: {
      responsive: true,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: corTexto }, grid: { color: corGrid } },
        y: { ticks: { color: corTexto }, grid: { color: corGrid } }
      }
    }
  });
}
