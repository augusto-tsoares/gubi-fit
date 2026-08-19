// Camada de dados - Dexie (IndexedDB)
const db = new Dexie('gubiFitDB');

db.version(1).stores({
  exercicios: '++id, treino, nome',
  registrosSeries: '++id, exercicio_id, data, semana_treino',
  registrosPeso: '++id, data',
  registrosMedidas: '++id, data',
  fasesPlano: '++id, nome, data_inicio',
  meta: 'chave'
});

db.version(2).stores({
  registrosCardio: '++id, data'
});

const TREINO_ORDER = ['A', 'B', 'C', 'D', 'E'];

const FASES_INFO = {
  bulking: { tipo: 'bulking', nome: 'Bulking' },
  cutting: { tipo: 'cutting', nome: 'Cutting' },
  transicao: { tipo: 'transicao', nome: 'Transição' }
};

// Usado só para sugerir um valor inicial na primeira execução; depois disso
// a fase passa a ser escolhida manualmente e fica salva em db.meta.
function faseSugeridaPorData(dataRef = new Date()) {
  const iso = dataRef.toISOString().slice(0, 10);
  if (iso >= '2026-08-19' && iso < '2026-10-21') return 'bulking';
  if (iso >= '2026-10-21' && iso < '2027-01-01') return 'cutting';
  if (iso >= '2027-01-01' && iso < '2027-02-09') return 'transicao';
  return 'bulking';
}

const BASELINE_PESO = { data: '2026-08-19', peso_kg: 69.8 };

// Roda em toda instalacao nova (inclusive a de um amigo que abrir o link):
// so cadastra a biblioteca de exercicios/treinos, sem nenhum dado pessoal.
async function seedIfNeeded() {
  const jaTemExercicios = (await db.exercicios.count()) > 0;
  if (jaTemExercicios) return;

  const raw = await fetch('dados-historicos.json').then(r => r.json());
  await db.exercicios.bulkAdd(raw.exercicios.map(ex => ({
    treino: ex.treino,
    nome: ex.exercicio,
    series_alvo: ex.series_alvo,
    reps_alvo: ex.reps_alvo,
    descanso: ex.descanso,
    nota: ex.nota || ''
  })));
}

async function getFaseAtual() {
  const registro = await db.meta.get('fase_atual');
  if (registro) return registro.valor;
  const sugerida = faseSugeridaPorData();
  await db.meta.put({ chave: 'fase_atual', valor: sugerida });
  return sugerida;
}

async function setFaseAtual(tipoFase) {
  await db.meta.put({ chave: 'fase_atual', valor: tipoFase });
}

async function proximoTreinoSugerido() {
  const ultimos = await db.registrosSeries.orderBy('data').reverse().limit(1).toArray();
  if (ultimos.length === 0) return 'A';
  const ex = await db.exercicios.get(ultimos[0].exercicio_id);
  const idx = TREINO_ORDER.indexOf(ex.treino);
  return TREINO_ORDER[(idx + 1) % TREINO_ORDER.length];
}
