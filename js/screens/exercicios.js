async function renderExercicios(container) {
  container.innerHTML = `
    <div class="card">
      <h2>Dados</h2>
      <p class="ajuda-texto">O botão abaixo importa o histórico real de treino e peso de jan-mai/2026 já registrado nesse app — não é um exemplo genérico, é dado de treino de verdade. Só faz sentido usar se esse histórico for seu.</p>
      <div class="config-actions">
        <button class="btn-primary" id="btn-importar-historico" type="button">Importar meu histórico (jan-mai/2026)</button>
        <button class="btn-primary" id="btn-exportar-treinos" type="button">Exportar treinos (CSV)</button>
        <button class="btn-primary" id="btn-exportar-peso" type="button">Exportar peso (CSV)</button>
      </div>
      <div class="toast" id="toast-config">Feito!</div>
    </div>
    <div class="card">
      <h2>Exercícios por treino</h2>
      <p class="ajuda-texto">Edite nome, treino, séries, faixa de reps, descanso ou nota. Toque em Salvar em cada card para gravar.</p>
      <button class="add-serie-btn" id="btn-add-exercicio" type="button">+ novo exercício</button>
      <div id="lista-exercicios-editor"></div>
    </div>
  `;

  const btnImportar = container.querySelector('#btn-importar-historico');
  if (await jaImportouHistorico()) {
    btnImportar.disabled = true;
    btnImportar.textContent = 'Histórico já importado';
  }
  btnImportar.addEventListener('click', async () => {
    const resultado = await importarHistoricoExemplo();
    if (resultado.ok) {
      btnImportar.disabled = true;
      btnImportar.textContent = 'Histórico já importado';
      mostrarToastConfig(container, 'Histórico importado!');
    } else {
      mostrarToastConfig(container, 'Esse histórico já tinha sido importado antes.');
    }
  });

  container.querySelector('#btn-exportar-treinos').addEventListener('click', exportarTreinosCSV);
  container.querySelector('#btn-exportar-peso').addEventListener('click', exportarPesoCSV);
  container.querySelector('#btn-add-exercicio').addEventListener('click', () => criarExercicioNovo(container));

  await renderListaExercicios(container);
}

function mostrarToastConfig(container, texto) {
  const toast = container.querySelector('#toast-config');
  toast.textContent = texto;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

async function renderListaExercicios(container) {
  const el = container.querySelector('#lista-exercicios-editor');
  const exercicios = await db.exercicios.orderBy('treino').toArray();

  if (exercicios.length === 0) {
    el.innerHTML = `<div class="empty-state">Nenhum exercício cadastrado.</div>`;
    return;
  }

  el.innerHTML = exercicios.map(exercicioEditCardHtml).join('');

  el.querySelectorAll('.exercicio-edit-card').forEach(card => {
    const id = parseInt(card.dataset.id, 10);
    card.querySelector('.btn-salvar-exercicio').addEventListener('click', () => salvarExercicio(container, card, id));
    card.querySelector('.btn-excluir-exercicio').addEventListener('click', () => excluirExercicio(container, id));
  });
}

function exercicioEditCardHtml(ex) {
  return `
    <div class="exercicio-edit-card" data-id="${ex.id}">
      <div class="edit-row">
        <select class="edit-treino">
          ${TREINO_LETTERS.map(t => `<option value="${t}" ${t === ex.treino ? 'selected' : ''}>Treino ${t}</option>`).join('')}
        </select>
        <input type="text" class="edit-nome" value="${escapeHtml(ex.nome)}" placeholder="Nome do exercício">
      </div>
      <div class="edit-row">
        <input type="number" class="edit-series" value="${ex.series_alvo ?? ''}" placeholder="séries" step="1" min="1">
        <input type="text" class="edit-reps" value="${escapeHtml(ex.reps_alvo ?? '')}" placeholder="faixa de reps (ex: 8 - 12)">
      </div>
      <div class="edit-row">
        <input type="text" class="edit-descanso" value="${escapeHtml(ex.descanso ?? '')}" placeholder="descanso (ex: 2 min)">
      </div>
      <textarea class="edit-nota" placeholder="nota técnica (opcional)">${escapeHtml(ex.nota ?? '')}</textarea>
      <div class="edit-actions">
        <button type="button" class="btn-excluir-exercicio">Excluir</button>
        <button type="button" class="btn-salvar-exercicio">Salvar</button>
      </div>
    </div>
  `;
}

async function salvarExercicio(container, card, id) {
  const dados = {
    treino: card.querySelector('.edit-treino').value,
    nome: card.querySelector('.edit-nome').value.trim(),
    series_alvo: parseFloat(card.querySelector('.edit-series').value) || null,
    reps_alvo: card.querySelector('.edit-reps').value.trim(),
    descanso: card.querySelector('.edit-descanso').value.trim(),
    nota: card.querySelector('.edit-nota').value.trim()
  };
  if (!dados.nome) return;

  await db.exercicios.update(id, dados);
  mostrarToastConfig(container, 'Exercício salvo!');
  await renderListaExercicios(container);
}

async function excluirExercicio(container, id) {
  const ok = confirm('Excluir este exercício? O histórico de cargas registrado nele também será apagado.');
  if (!ok) return;

  await db.transaction('rw', db.exercicios, db.registrosSeries, async () => {
    await db.registrosSeries.where('exercicio_id').equals(id).delete();
    await db.exercicios.delete(id);
  });

  mostrarToastConfig(container, 'Exercício excluído.');
  await renderListaExercicios(container);
}

async function criarExercicioNovo(container) {
  await db.exercicios.add({
    treino: 'A',
    nome: 'Novo exercício',
    series_alvo: 3,
    reps_alvo: '8 - 12',
    descanso: '2 min',
    nota: ''
  });
  await renderListaExercicios(container);
  const cards = container.querySelectorAll('.exercicio-edit-card');
  cards[cards.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function exportarTreinosCSV() {
  const exercicios = await db.exercicios.toArray();
  const porId = Object.fromEntries(exercicios.map(e => [e.id, e]));
  const registros = await db.registrosSeries.orderBy('data').toArray();

  const linhas = [['data', 'treino', 'exercicio', 'numero_serie', 'carga_kg', 'reps']];
  for (const r of registros) {
    const ex = porId[r.exercicio_id];
    linhas.push([r.data, ex?.treino ?? '', ex?.nome ?? '(excluído)', r.numero_serie, r.carga_kg ?? '', r.reps ?? '']);
  }
  baixarCSV(linhas, 'gubi-fit-treinos.csv');
}

async function exportarPesoCSV() {
  const registros = await db.registrosPeso.orderBy('data').toArray();
  const linhas = [['data', 'peso_kg']];
  for (const r of registros) linhas.push([r.data, r.peso_kg]);
  baixarCSV(linhas, 'gubi-fit-peso.csv');
}

function baixarCSV(linhas, nomeArquivo) {
  const csv = linhas.map(l => l.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(valor) {
  const s = String(valor ?? '');
  if (/[",;\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
