let pesoChartInstance = null;

async function renderPeso(container) {
  container.innerHTML = `
    <div class="card">
      <h2>Registrar peso de hoje</h2>
      <div class="form-row">
        <input type="date" id="peso-data" value="${hoje()}">
        <input type="number" id="peso-valor" inputmode="decimal" step="0.1" placeholder="kg">
        <button class="btn-primary" id="peso-salvar">Salvar</button>
      </div>
    </div>
    <div class="card">
      <h2>Evolução</h2>
      <canvas id="peso-chart" height="220"></canvas>
    </div>
    <div class="card" id="peso-resumo"></div>
    <div class="toast" id="toast">Peso salvo!</div>
  `;

  container.querySelector('#peso-salvar').addEventListener('click', () => salvarPeso(container));

  await desenharGraficoPeso(container);
  await renderResumoPeso(container);
}

async function salvarPeso(container) {
  const data = container.querySelector('#peso-data').value;
  const valor = parseFloat(container.querySelector('#peso-valor').value);
  if (!data || isNaN(valor)) return;

  const existente = await db.registrosPeso.where('data').equals(data).first();
  if (existente) {
    await db.registrosPeso.update(existente.id, { peso_kg: valor });
  } else {
    await db.registrosPeso.add({ data, peso_kg: valor });
  }

  container.querySelector('#peso-valor').value = '';
  const toast = container.querySelector('#toast');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);

  await desenharGraficoPeso(container);
  await renderResumoPeso(container);
}

async function desenharGraficoPeso(container) {
  const registros = await db.registrosPeso.orderBy('data').toArray();
  const labels = registros.map(r => formatarDataBr(r.data));
  const valores = registros.map(r => r.peso_kg);

  const metaAtual = calcularMetaPesoFaseAtual(registros);
  const linhaMeta = registros.map(() => metaAtual);

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
          spanGaps: true,
          tension: 0.25,
          pointRadius: 2
        },
        metaAtual != null ? {
          label: 'Meta da fase',
          data: linhaMeta,
          borderColor: '#B4A7D6',
          borderDash: [6, 4],
          pointRadius: 0
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

function calcularMetaPesoFaseAtual(registrosPeso) {
  const fase = faseAtual();
  if (!fase) return null;
  const ultimoRegistro = [...registrosPeso].reverse().find(r => r.peso_kg != null);
  const pesoBase = ultimoRegistro ? ultimoRegistro.peso_kg : BASELINE_PESO.peso_kg;
  if (fase.tipo === 'bulking') return +(pesoBase + 0.3).toFixed(1);
  if (fase.tipo === 'cutting') return +(pesoBase * 0.995).toFixed(1);
  return pesoBase;
}

async function renderResumoPeso(container) {
  const fase = faseAtual();
  const registros = await db.registrosPeso.orderBy('data').toArray();
  const ultimo = [...registros].reverse().find(r => r.peso_kg != null);
  const meta = calcularMetaPesoFaseAtual(registros);

  const el = container.querySelector('#peso-resumo');
  el.innerHTML = `
    <h2>Fase atual</h2>
    <div class="stat-row"><span class="stat-label">Fase</span><span class="stat-value">${fase ? fase.nome : '—'}</span></div>
    <div class="stat-row"><span class="stat-label">Período</span><span class="stat-value">${fase ? `${formatarDataBr(fase.data_inicio)} – ${formatarDataBr(fase.data_fim)}` : '—'}</span></div>
    <div class="stat-row"><span class="stat-label">Peso atual</span><span class="stat-value">${ultimo ? ultimo.peso_kg + ' kg' : '—'}</span></div>
    <div class="stat-row"><span class="stat-label">Referência semanal</span><span class="stat-value">${meta != null ? meta + ' kg' : '—'}</span></div>
  `;
}
