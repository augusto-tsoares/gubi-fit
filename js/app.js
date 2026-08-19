const state = {
  tela: 'hoje',
  treinoSelecionado: null,
  exercicioHistoricoId: null
};

const TELAS = {
  hoje: { titulo: 'Hoje', render: renderHoje },
  peso: { titulo: 'Peso', render: renderPeso },
  historico: { titulo: 'Histórico', render: renderHistorico }
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

function renderFaseBadge() {
  const fase = faseAtual();
  const badge = document.getElementById('fase-badge');
  if (!fase) { badge.textContent = ''; return; }
  badge.textContent = fase.nome;
  badge.className = 'fase-badge ' + fase.tipo;
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
  renderFaseBadge();

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
