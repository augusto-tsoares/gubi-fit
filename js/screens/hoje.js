const TREINO_LETTERS = ['A', 'B', 'C', 'D', 'E'];
const TIPOS_CARDIO = ['Esteira', 'Bike', 'Elíptico', 'Corrida (rua)', 'Escada', 'Pular corda', 'Outro'];

async function renderHoje(container) {
  const sugerido = await proximoTreinoSugerido();
  let treinoAtivo = state.treinoSelecionado || sugerido;
  state.treinoSelecionado = treinoAtivo;

  container.innerHTML = `
    <div class="treino-tabs-wrap">
      <div class="treino-tabs" id="treino-tabs"></div>
    </div>
    <div id="exercicios-lista"></div>
    <button class="salvar-treino-btn" id="salvar-treino-btn">Salvar treino</button>
    <div class="toast" id="toast">Treino salvo!</div>
    <div class="card cardio-card">
      <h2>Cardio de hoje</h2>
      <div class="edit-row">
        <select id="cardio-tipo">
          ${TIPOS_CARDIO.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <input type="number" id="cardio-duracao" inputmode="numeric" step="1" min="0" placeholder="minutos">
        <input type="number" id="cardio-distancia" inputmode="decimal" step="0.1" min="0" placeholder="km (opcional)">
        <button class="btn-primary" id="cardio-salvar" type="button">Salvar cardio</button>
      </div>
      <div id="cardio-lista-hoje"></div>
    </div>
  `;

  const tabsEl = container.querySelector('#treino-tabs');
  tabsEl.innerHTML = TREINO_LETTERS.map(t => `
    <button class="treino-tab treino-${t} ${t === treinoAtivo ? 'active' : ''}" data-treino="${t}">
      Treino ${t}
    </button>
  `).join('');

  tabsEl.querySelectorAll('.treino-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.treinoSelecionado = btn.dataset.treino;
      renderHoje(container);
    });
  });

  await renderExerciciosDoTreino(container.querySelector('#exercicios-lista'), treinoAtivo);

  container.querySelector('#salvar-treino-btn').addEventListener('click', () => salvarTreino(container));

  container.querySelector('#cardio-salvar').addEventListener('click', () => salvarCardio(container));
  await renderCardioDeHoje(container);
}

async function renderCardioDeHoje(container) {
  const data = hoje();
  const registros = await db.registrosCardio.where('data').equals(data).toArray();
  const el = container.querySelector('#cardio-lista-hoje');

  if (registros.length === 0) {
    el.innerHTML = '';
    return;
  }

  el.innerHTML = registros.map(r => `
    <div class="stat-row" data-id="${r.id}">
      <span class="stat-label">${escapeHtml(r.tipo)} — ${r.duracao_min ?? '-'} min${r.distancia_km ? ` · ${r.distancia_km} km` : ''}</span>
      <button type="button" class="serie-remove cardio-remove" title="remover">×</button>
    </div>
  `).join('');

  el.querySelectorAll('.cardio-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.closest('[data-id]').dataset.id, 10);
      await db.registrosCardio.delete(id);
      await renderCardioDeHoje(container);
    });
  });
}

async function salvarCardio(container) {
  const tipo = container.querySelector('#cardio-tipo').value;
  const duracaoInput = container.querySelector('#cardio-duracao');
  const distanciaInput = container.querySelector('#cardio-distancia');
  const duracao = duracaoInput.value === '' ? null : parseFloat(duracaoInput.value);
  const distancia = distanciaInput.value === '' ? null : parseFloat(distanciaInput.value);

  if (duracao == null && distancia == null) return;

  await db.registrosCardio.add({
    data: hoje(),
    tipo,
    duracao_min: duracao,
    distancia_km: distancia
  });

  duracaoInput.value = '';
  distanciaInput.value = '';
  await renderCardioDeHoje(container);
}

async function renderExerciciosDoTreino(el, treino) {
  const exercicios = await db.exercicios.where('treino').equals(treino).toArray();
  if (exercicios.length === 0) {
    el.innerHTML = `<div class="empty-state">Nenhum exercício cadastrado para o treino ${treino}.</div>`;
    return;
  }

  const partes = await Promise.all(exercicios.map(ex => renderExercicioCard(ex)));
  el.innerHTML = partes.join('');

  el.querySelectorAll('.add-serie-btn').forEach(btn => {
    btn.addEventListener('click', () => adicionarLinhaSerie(btn));
  });
  el.querySelectorAll('.serie-remove').forEach(btn => {
    btn.addEventListener('click', () => btn.closest('.serie-row').remove());
  });
}

async function renderExercicioCard(ex) {
  const todosRegistros = await db.registrosSeries.where('exercicio_id').equals(ex.id).sortBy('data');
  const grupos = agruparPorData(todosRegistros);
  const datas = Object.keys(grupos).sort();
  const ultimaData = datas[datas.length - 1];
  const seriesUltima = ultimaData ? grupos[ultimaData].sort((a, b) => a.numero_serie - b.numero_serie) : [];
  const cargasHistoricas = todosRegistros.map(r => r.carga_kg).filter(c => Number.isFinite(c));
  const cargaMaximaHistorica = cargasHistoricas.length ? Math.max(...cargasHistoricas) : null;

  const sugestao = sugerirCarga(ex, seriesUltima, cargaMaximaHistorica);
  const treinoCorVar = `var(--treino-${ex.treino.toLowerCase()}-bg)`;

  const numSeriesIniciais = Math.max(ex.series_alvo || 3, 1);
  const linhasIniciais = [];
  for (let i = 1; i <= numSeriesIniciais; i++) {
    const cargaSugerida = Number.isFinite(sugestao.carga_sugerida) ? sugestao.carga_sugerida : '';
    linhasIniciais.push(linhaSerieHtml(i, cargaSugerida, ''));
  }

  return `
    <div class="exercicio-card" data-exercicio-id="${ex.id}">
      <div class="exercicio-card-header" style="--tcolor: ${treinoCorVar}">
        <p class="exercicio-nome">${ex.nome}</p>
        <div class="exercicio-meta">
          <span>${ex.series_alvo}x ${ex.reps_alvo}</span>
          <span>Descanso: ${ex.descanso}</span>
        </div>
        ${ex.nota ? `<div class="exercicio-nota">${ex.nota}</div>` : ''}
        ${sugestao.mensagem ? `<div class="sugestao ${sugestao.tipo}">${sugestao.mensagem}</div>` : ''}
      </div>
      <div class="series-lista">
        ${linhasIniciais.join('')}
        <button type="button" class="add-serie-btn">+ adicionar série</button>
      </div>
    </div>
  `;
}

function linhaSerieHtml(numero, carga, reps) {
  return `
    <div class="serie-row">
      <div class="serie-num">${numero}</div>
      <input type="number" inputmode="decimal" step="0.5" placeholder="kg" class="input-carga" value="${carga}">
      <input type="number" inputmode="numeric" step="1" placeholder="reps" class="input-reps" value="${reps}">
      <button type="button" class="serie-remove" title="remover">×</button>
    </div>
  `;
}

function adicionarLinhaSerie(btn) {
  const lista = btn.closest('.series-lista');
  const numero = lista.querySelectorAll('.serie-row').length + 1;
  const div = document.createElement('div');
  div.innerHTML = linhaSerieHtml(numero, '', '').trim();
  const novaLinha = div.firstChild;
  lista.insertBefore(novaLinha, btn);
  novaLinha.querySelector('.serie-remove').addEventListener('click', () => novaLinha.remove());
}

async function salvarTreino(container) {
  const data = hoje();
  const cards = container.querySelectorAll('.exercicio-card');
  let totalSalvo = 0;

  for (const card of cards) {
    const exercicioId = parseInt(card.dataset.exercicioId, 10);
    const linhas = card.querySelectorAll('.serie-row');
    let numero = 1;
    for (const linha of linhas) {
      const carga = linha.querySelector('.input-carga').value;
      const reps = linha.querySelector('.input-reps').value;
      if (carga === '' && reps === '') { continue; }
      await db.registrosSeries.add({
        exercicio_id: exercicioId,
        data,
        semana_treino: null,
        numero_serie: numero,
        carga_kg: carga === '' ? null : parseFloat(carga),
        reps: reps === '' ? null : parseFloat(reps)
      });
      numero++;
      totalSalvo++;
    }
  }

  const toast = container.querySelector('#toast');
  toast.textContent = totalSalvo > 0 ? 'Treino salvo!' : 'Nenhuma série preenchida.';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);

  if (totalSalvo > 0) {
    await renderExerciciosDoTreino(container.querySelector('#exercicios-lista'), state.treinoSelecionado);
  }
}
