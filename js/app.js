const state = {
  tela: 'hoje',
  treinoSelecionado: null,
  exercicioHistoricoId: null
};

const TELAS = {
  hoje: { titulo: 'Hoje', render: renderHoje },
  peso: { titulo: 'Peso', render: renderPeso },
  historico: { titulo: 'Histórico', render: renderHistorico },
  exercicios: { titulo: 'Exercícios', render: renderExercicios }
};

function aplicarTema(tema) {
  document.documentElement.setAttribute('data-theme', tema);
  localStorage.setItem('gubi_fit_tema', tema);
}

function temaInicial() {
  const salvo = localStorage.getItem('gubi_fit_tema');
  if (salvo) return salvo;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

async function renderFaseBadge() {
  const select = document.getElementById('fase-select');
  if (!select.dataset.montado) {
    select.innerHTML = Object.values(FASES_INFO).map(f =>
      `<option value="${f.tipo}">${f.nome}</option>`
    ).join('');
    select.dataset.montado = '1';
    select.addEventListener('change', async () => {
      await setFaseAtual(select.value);
      atualizarClasseFaseBadge(select.value);
      if (state.tela === 'peso') await renderTela('peso');
    });
  }
  const tipoAtual = await getFaseAtual();
  select.value = tipoAtual;
  atualizarClasseFaseBadge(tipoAtual);
}

function atualizarClasseFaseBadge(tipo) {
  document.getElementById('fase-select').className = 'fase-badge ' + tipo;
}

function renderSubheader() {
  document.getElementById('app-subheader').textContent = `Semana ${semanaAtual()}`;
}

async function renderTela(nome) {
  state.tela = nome;
  const main = document.getElementById('main-content');
  await TELAS[nome].render(main);

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tela === nome);
  });
}

function montarNav() {
  const nav = document.getElementById('bottom-nav');
  nav.innerHTML = Object.entries(TELAS).map(([key, t]) => `
    <button class="nav-btn" data-tela="${key}">
      <span>${t.titulo}</span>
    </button>
  `).join('');

  nav.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => renderTela(btn.dataset.tela));
  });
}

async function bootstrap() {
  aplicarTema(temaInicial());
  await seedIfNeeded();

  montarNav();
  await renderFaseBadge();
  renderSubheader();

  document.getElementById('toggle-tema').addEventListener('click', () => {
    const atual = document.documentElement.getAttribute('data-theme');
    aplicarTema(atual === 'dark' ? 'light' : 'dark');
    renderTela(state.tela);
  });

  await renderTela('hoje');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

bootstrap();
