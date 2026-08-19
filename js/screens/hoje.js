const TREINO_LETTERS = ['A', 'B', 'C', 'D', 'E'];

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

  const sugestao = sugerirCarga(ex, seriesUltima);
  const treinoCorVar = `var(--treino-${ex.treino.toLowerCase()}-bg)`;

  const numSeriesIniciais = Math.max(ex.series_alvo || 3, 1);
  const linhasIniciais = [];
  for (let i = 1; i <= numSeriesIniciais; i++) {
    const cargaSugerida = sugestao.carga_sugerida != null ? sugestao.carga_sugerida : '';
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
