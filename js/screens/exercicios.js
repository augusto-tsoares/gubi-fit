async function renderExercicios(container) {
  container.innerHTML = `
    <p class="aviso-armazenamento">Os dados deste app ficam armazenados apenas no navegador deste aparelho (não em um servidor). Limpar o cache/dados do navegador apaga tudo. Para evitar perda, recomendamos exportar o histórico (CSV) de vez em quando.</p>
    <div class="card">
      <h2>Importar histórico (CSV)</h2>
      <p class="ajuda-texto">Cada pessoa importa o próprio arquivo. Baixe um modelo em branco se for preencher do zero, ou exporte o seu daqui de baixo pra editar/guardar. O import não duplica: se uma linha já existe (mesma data/exercício/série), ela é ignorada.</p>
      <div class="config-actions">
        <label class="btn-primary file-btn" for="input-importar-treinos">Importar treinos (CSV)</label>
        <input type="file" id="input-importar-treinos" accept=".csv,text/csv" class="visually-hidden">
        <label class="btn-primary file-btn" for="input-importar-peso">Importar peso (CSV)</label>
        <input type="file" id="input-importar-peso" accept=".csv,text/csv" class="visually-hidden">
        <label class="btn-primary file-btn" for="input-importar-composicao">Importar composição (CSV)</label>
        <input type="file" id="input-importar-composicao" accept=".csv,text/csv" class="visually-hidden">
      </div>
      <div class="toast" id="toast-config">Feito!</div>
    </div>
    <div class="card">
      <h2>Modelos e exportação</h2>
      <div class="config-actions">
        <button class="btn-primary" id="btn-modelo-treinos" type="button">Baixar modelo de treinos (CSV)</button>
        <button class="btn-primary" id="btn-modelo-peso" type="button">Baixar modelo de peso (CSV)</button>
        <button class="btn-primary" id="btn-modelo-composicao" type="button">Baixar modelo de composição (CSV)</button>
        <button class="btn-primary" id="btn-exportar-treinos" type="button">Exportar meus treinos (CSV)</button>
        <button class="btn-primary" id="btn-exportar-peso" type="button">Exportar meu peso (CSV)</button>
        <button class="btn-primary" id="btn-exportar-composicao" type="button">Exportar minha composição (CSV)</button>
      </div>
    </div>
    <div class="card">
      <h2>Exercícios por treino</h2>
      <p class="ajuda-texto">Edite nome, treino, séries, faixa de reps, descanso ou nota. Toque em Salvar em cada card para gravar.</p>
      <button class="add-serie-btn" id="btn-add-exercicio" type="button">+ novo exercício</button>
      <div id="lista-exercicios-editor"></div>
    </div>
  `;

  container.querySelector('#input-importar-treinos').addEventListener('change', async (e) => {
    const arquivo = e.target.files[0];
    e.target.value = '';
    if (!arquivo) return;
    await importarTreinosCSV(container, arquivo);
  });
  container.querySelector('#input-importar-peso').addEventListener('change', async (e) => {
    const arquivo = e.target.files[0];
    e.target.value = '';
    if (!arquivo) return;
    await importarPesoCSV(container, arquivo);
  });
  container.querySelector('#input-importar-composicao').addEventListener('change', async (e) => {
    const arquivo = e.target.files[0];
    e.target.value = '';
    if (!arquivo) return;
    await importarComposicaoCSV(container, arquivo);
  });

  container.querySelector('#btn-modelo-treinos').addEventListener('click', baixarModeloTreinos);
  container.querySelector('#btn-modelo-peso').addEventListener('click', baixarModeloPeso);
  container.querySelector('#btn-modelo-composicao').addEventListener('click', baixarModeloComposicao);
  container.querySelector('#btn-exportar-treinos').addEventListener('click', exportarTreinosCSV);
  container.querySelector('#btn-exportar-peso').addEventListener('click', exportarPesoCSV);
  container.querySelector('#btn-exportar-composicao').addEventListener('click', exportarComposicaoCSV);
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
    card.querySelector('.edit-nome-picker').addEventListener('change', (e) => {
      const valor = e.target.value;
      const inputNome = card.querySelector('.edit-nome');
      if (valor && valor !== 'Outro') {
        inputNome.value = valor;
      }
      if (valor === 'Outro') {
        inputNome.focus();
      }
    });
  });
}

const EXERCICIOS_COMUNS = {
  'Peito': ['Supino Reto (Barra)', 'Supino Reto (Halteres)', 'Supino Inclinado (Barra)', 'Supino Inclinado (Halteres)', 'Supino Declinado', 'Crucifixo (Halteres)', 'Crossover (Polia)', 'Peck Deck (Voador)', 'Flexão de Braço'],
  'Costas': ['Puxada Alta (Pulley)', 'Puxada Alta (Pegada Fechada)', 'Remada Curvada (Barra)', 'Remada Cavalinho', 'Remada Unilateral (Serrote)', 'Remada Baixa (Polia)', 'Pull-over', 'Barra Fixa'],
  'Ombro': ['Desenvolvimento Militar (Barra)', 'Desenvolvimento com Halteres', 'Elevação Lateral', 'Elevação Frontal', 'Elevação Posterior (Voador Invertido)', 'Encolhimento de Ombros (Trapézio)'],
  'Bíceps': ['Rosca Direta (Barra)', 'Rosca Alternada (Halteres)', 'Rosca Martelo', 'Rosca Scott', 'Rosca Concentrada'],
  'Tríceps': ['Tríceps Testa', 'Tríceps Corda (Polia)', 'Tríceps Francês', 'Tríceps Coice', 'Mergulho no Banco'],
  'Perna': ['Agachamento Livre', 'Agachamento no Smith', 'Agachamento Búlgaro', 'Leg Press 45º', 'Cadeira Extensora', 'Mesa Flexora', 'Cadeira Flexora', 'Stiff (RDL)', 'Afundo (Passada)'],
  'Glúteo': ['Elevação Pélvica (Hip Thrust)', 'Cadeira Abdutora', 'Cadeira Adutora', 'Glúteo na Polia (Coice)'],
  'Panturrilha': ['Panturrilha em Pé', 'Panturrilha Sentado', 'Panturrilha no Leg Press'],
  'Abdômen': ['Abdominal Supra', 'Abdominal na Polia (Crunch)', 'Elevação de Pernas', 'Prancha Isométrica', 'Abdominal Infra']
};

function opcoesExerciciosComunsHtml() {
  const grupos = Object.entries(EXERCICIOS_COMUNS).map(([grupo, nomes]) => `
    <optgroup label="${grupo}">
      ${nomes.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('')}
    </optgroup>
  `).join('');
  return `
    <option value="">Escolher da lista de exercícios comuns...</option>
    ${grupos}
    <option value="Outro">Outro (digitar abaixo)</option>
  `;
}

function exercicioEditCardHtml(ex) {
  return `
    <div class="exercicio-edit-card" data-id="${ex.id}">
      <select class="edit-nome-picker">
        ${opcoesExerciciosComunsHtml()}
      </select>
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

function baixarModeloTreinos() {
  db.exercicios.orderBy('treino').toArray().then(exercicios => {
    const linhas = [['data', 'treino', 'exercicio', 'numero_serie', 'carga_kg', 'reps']];
    for (const ex of exercicios) {
      linhas.push(['AAAA-MM-DD', ex.treino, ex.nome, 1, '', '']);
    }
    baixarCSV(linhas, 'modelo-treinos.csv');
  });
}

function baixarModeloPeso() {
  baixarCSV([['data', 'peso_kg'], ['AAAA-MM-DD', '']], 'modelo-peso.csv');
}

// Parser de CSV simples (RFC4180-ish): lida com campos entre aspas contendo
// virgula, ponto-e-virgula ou quebra de linha.
function parseCSV(texto) {
  const linhas = texto.replace(/^﻿/, '').split(/\r\n|\n/).filter(l => l.trim() !== '');
  return linhas.map(parseLinhaCSV);
}

function parseLinhaCSV(linha) {
  const campos = [];
  let atual = '';
  let dentroAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (dentroAspas) {
      if (c === '"') {
        if (linha[i + 1] === '"') { atual += '"'; i++; }
        else dentroAspas = false;
      } else {
        atual += c;
      }
    } else if (c === '"') {
      dentroAspas = true;
    } else if (c === ',') {
      campos.push(atual);
      atual = '';
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos;
}

async function importarTreinosCSV(container, arquivo) {
  const texto = await arquivo.text();
  const linhas = parseCSV(texto);
  if (linhas.length < 2) {
    mostrarToastConfig(container, 'Arquivo vazio.');
    return;
  }
  const cabecalho = linhas[0].map(h => h.trim().toLowerCase());
  const idx = {
    data: cabecalho.indexOf('data'),
    treino: cabecalho.indexOf('treino'),
    exercicio: cabecalho.indexOf('exercicio'),
    numero_serie: cabecalho.indexOf('numero_serie'),
    carga_kg: cabecalho.indexOf('carga_kg'),
    reps: cabecalho.indexOf('reps')
  };
  if (idx.data === -1 || idx.exercicio === -1) {
    mostrarToastConfig(container, 'Colunas esperadas: data,treino,exercicio,numero_serie,carga_kg,reps');
    return;
  }

  const exercicios = await db.exercicios.toArray();
  const chave = (treino, nome) => `${treino}|${nome}`.trim().toLowerCase();
  const porChave = new Map(exercicios.map(e => [chave(e.treino, e.nome), e]));

  let importados = 0, duplicados = 0, naoEncontrados = 0;
  for (const linha of linhas.slice(1)) {
    const data = linha[idx.data]?.trim();
    if (!data || data === 'AAAA-MM-DD') continue;
    const nomeExercicio = linha[idx.exercicio]?.trim();
    const treino = linha[idx.treino]?.trim();
    const numeroSerie = parseInt(linha[idx.numero_serie], 10) || 1;
    const cargaTexto = linha[idx.carga_kg]?.trim();
    const repsTexto = linha[idx.reps]?.trim();

    const ex = porChave.get(chave(treino, nomeExercicio));
    if (!ex) { naoEncontrados++; continue; }

    const jaExiste = await db.registrosSeries.where('exercicio_id').equals(ex.id)
      .and(r => r.data === data && r.numero_serie === numeroSerie).count();
    if (jaExiste > 0) { duplicados++; continue; }

    await db.registrosSeries.add({
      exercicio_id: ex.id,
      data,
      semana_treino: null,
      numero_serie: numeroSerie,
      carga_kg: cargaTexto ? parseFloat(cargaTexto) : null,
      reps: repsTexto ? parseFloat(repsTexto) : null
    });
    importados++;
  }

  mostrarToastConfig(container, `${importados} importadas, ${duplicados} já existiam, ${naoEncontrados} exercícios não encontrados.`);
}

async function importarPesoCSV(container, arquivo) {
  const texto = await arquivo.text();
  const linhas = parseCSV(texto);
  if (linhas.length < 2) {
    mostrarToastConfig(container, 'Arquivo vazio.');
    return;
  }
  const cabecalho = linhas[0].map(h => h.trim().toLowerCase());
  const idxData = cabecalho.indexOf('data');
  const idxPeso = cabecalho.indexOf('peso_kg');
  if (idxData === -1 || idxPeso === -1) {
    mostrarToastConfig(container, 'Colunas esperadas: data,peso_kg');
    return;
  }

  let novos = 0, atualizados = 0;
  for (const linha of linhas.slice(1)) {
    const data = linha[idxData]?.trim();
    if (!data || data === 'AAAA-MM-DD') continue;
    const peso = parseFloat(linha[idxPeso]);
    if (!Number.isFinite(peso)) continue;

    const existente = await db.registrosPeso.where('data').equals(data).first();
    if (existente) {
      await db.registrosPeso.update(existente.id, { peso_kg: peso });
      atualizados++;
    } else {
      await db.registrosPeso.add({ data, peso_kg: peso });
      novos++;
    }
  }

  mostrarToastConfig(container, `${novos} novos, ${atualizados} atualizados.`);
}

const COLUNAS_COMPOSICAO_CSV = ['data', ...METRICAS_COMPOSICAO.map(m => m.chave)];

async function importarComposicaoCSV(container, arquivo) {
  const texto = await arquivo.text();
  const linhas = parseCSV(texto);
  if (linhas.length < 2) {
    mostrarToastConfig(container, 'Arquivo vazio.');
    return;
  }
  const cabecalho = linhas[0].map(h => h.trim().toLowerCase());
  const idx = {};
  COLUNAS_COMPOSICAO_CSV.forEach(c => { idx[c] = cabecalho.indexOf(c); });
  if (idx.data === -1) {
    mostrarToastConfig(container, 'Coluna "data" não encontrada no arquivo.');
    return;
  }

  let novos = 0, atualizados = 0, ignorados = 0;
  for (const linha of linhas.slice(1)) {
    const data = linha[idx.data]?.trim();
    if (!data || data === 'AAAA-MM-DD') continue;

    const registro = { data };
    let temAlgumDado = false;
    for (const campo of COLUNAS_COMPOSICAO_CSV) {
      if (campo === 'data' || idx[campo] === -1) continue;
      const valor = parseNumeroDecimal(linha[idx[campo]]);
      if (valor != null) {
        registro[campo] = valor;
        temAlgumDado = true;
      }
    }
    if (!temAlgumDado) { ignorados++; continue; }

    const existente = await db.registrosMedidas.where('data').equals(data).first();
    if (existente) {
      await db.registrosMedidas.update(existente.id, registro);
      atualizados++;
    } else {
      await db.registrosMedidas.add(registro);
      novos++;
    }
  }

  mostrarToastConfig(container, `${novos} novos, ${atualizados} atualizados, ${ignorados} sem dados.`);
}

function baixarModeloComposicao() {
  baixarCSV([COLUNAS_COMPOSICAO_CSV, ['AAAA-MM-DD', ...COLUNAS_COMPOSICAO_CSV.slice(1).map(() => '')]], 'modelo-composicao.csv');
}

async function exportarComposicaoCSV() {
  const registros = await db.registrosMedidas.orderBy('data').toArray();
  const linhas = [COLUNAS_COMPOSICAO_CSV];
  for (const r of registros) {
    linhas.push(COLUNAS_COMPOSICAO_CSV.map(c => r[c] ?? ''));
  }
  baixarCSV(linhas, 'gubi-fit-composicao.csv');
}
