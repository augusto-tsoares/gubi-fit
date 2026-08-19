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
const BASELINE_MEDIDAS = {
  data: '2026-01-27',
  cintura_cm: 78, quadril_cm: 91, coxa_cm: 53,
  panturrilha_cm: 35, peito_cm: 96, busto_cm: 121, biceps_cm: 33
};

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

// Fluxo antigo (antes de separar exercicios de historico) ja importava tudo
// de uma vez sob a flag 'seed_v1' — trata isso como "ja importado" pra nao
// duplicar os dados de quem instalou o app antes dessa mudanca.
async function jaImportouHistorico() {
  if (await db.meta.get('historico_importado')) return true;
  if (await db.meta.get('seed_v1')) {
    await db.meta.put({ chave: 'historico_importado', valor: true });
    return true;
  }
  return false;
}

// Import manual e opcional do historico de exemplo (carga/peso de jan-mai/2026).
// So faz sentido pra quem quer ver o app populado com dados reais de exemplo;
// amigos que forem usar o app do zero nao precisam disso.
async function importarHistoricoExemplo() {
  if (await jaImportouHistorico()) return { ok: false, motivo: 'ja_importado' };

  const raw = await fetch('dados-historicos.json').then(r => r.json());

  await db.transaction('rw', db.exercicios, db.registrosSeries, db.registrosPeso, db.meta, async () => {
    for (const ex of raw.exercicios) {
      const exercicioLocal = await db.exercicios.where({ treino: ex.treino, nome: ex.exercicio }).first();
      if (!exercicioLocal) continue;

      for (const h of (ex.historico || [])) {
        if (h.carga_kg == null && h.reps == null) continue;
        const repsList = parseRepsHistorico(h.reps);
        if (repsList.length === 0) {
          await db.registrosSeries.add({
            exercicio_id: exercicioLocal.id, data: h.data, semana_treino: h.semana,
            numero_serie: 1, carga_kg: h.carga_kg ?? null, reps: null
          });
        } else {
          for (let i = 0; i < repsList.length; i++) {
            await db.registrosSeries.add({
              exercicio_id: exercicioLocal.id, data: h.data, semana_treino: h.semana,
              numero_serie: i + 1, carga_kg: h.carga_kg ?? null, reps: repsList[i]
            });
          }
        }
      }
    }

    for (const semana of raw.acompanhamento_semanal) {
      if (typeof semana.peso_kg === 'number') {
        await db.registrosPeso.add({ data: semana.data, peso_kg: semana.peso_kg });
      }
    }
    const existeBaseline = await db.registrosPeso.where('data').equals(BASELINE_PESO.data).count();
    if (!existeBaseline) await db.registrosPeso.add(BASELINE_PESO);

    await db.meta.put({ chave: 'historico_importado', valor: true });
    await db.meta.put({ chave: 'baseline_medidas', valor: BASELINE_MEDIDAS });
  });

  return { ok: true };
}

// Converte campos "reps" do histórico (numero, string "8;7;6" ou texto tipo "CARNAVAL") em array de numeros
function parseRepsHistorico(reps) {
  if (reps == null) return [];
  if (typeof reps === 'number') return [reps];
  const partes = String(reps).split(';').map(s => s.trim()).filter(Boolean);
  const nums = partes.map(p => parseFloat(p)).filter(n => !isNaN(n));
  return nums;
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
