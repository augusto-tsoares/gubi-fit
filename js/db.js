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

const FASES_SEED = [
  { nome: 'Bulking moderado', data_inicio: '2026-08-19', data_fim: '2026-10-21', tipo: 'bulking' },
  { nome: 'Cutting', data_inicio: '2026-10-21', data_fim: '2026-12-31', tipo: 'cutting' },
  { nome: 'Manutenção magra', data_inicio: '2027-01-01', data_fim: '2027-02-09', tipo: 'manutencao' },
  { nome: 'Bulking mais intenso', data_inicio: '2027-03-01', data_fim: '2099-01-01', tipo: 'bulking' }
];

const BASELINE_PESO = { data: '2026-08-19', peso_kg: 69.8 };
const BASELINE_MEDIDAS = {
  data: '2026-01-27',
  cintura_cm: 78, quadril_cm: 91, coxa_cm: 53,
  panturrilha_cm: 35, peito_cm: 96, busto_cm: 121, biceps_cm: 33
};

async function seedIfNeeded() {
  const done = await db.meta.get('seed_v1');
  if (done) return;

  const raw = await fetch('dados-historicos.json').then(r => r.json());

  await db.transaction('rw', db.exercicios, db.registrosSeries, db.registrosPeso, db.fasesPlano, db.meta, async () => {
    for (const ex of raw.exercicios) {
      const exId = await db.exercicios.add({
        treino: ex.treino,
        nome: ex.exercicio,
        series_alvo: ex.series_alvo,
        reps_alvo: ex.reps_alvo,
        descanso: ex.descanso,
        nota: ex.nota || ''
      });

      for (const h of (ex.historico || [])) {
        if (h.carga_kg == null && h.reps == null) continue;
        const repsList = parseRepsHistorico(h.reps);
        if (repsList.length === 0) {
          await db.registrosSeries.add({
            exercicio_id: exId, data: h.data, semana_treino: h.semana,
            numero_serie: 1, carga_kg: h.carga_kg ?? null, reps: null
          });
        } else {
          for (let i = 0; i < repsList.length; i++) {
            await db.registrosSeries.add({
              exercicio_id: exId, data: h.data, semana_treino: h.semana,
              numero_serie: i + 1, carga_kg: h.carga_kg ?? null, reps: repsList[i]
            });
          }
        }
      }
    }

    for (const f of FASES_SEED) await db.fasesPlano.add(f);

    for (const semana of raw.acompanhamento_semanal) {
      if (typeof semana.peso_kg === 'number') {
        await db.registrosPeso.add({ data: semana.data, peso_kg: semana.peso_kg });
      }
    }
    const existeBaseline = await db.registrosPeso.where('data').equals(BASELINE_PESO.data).count();
    if (!existeBaseline) await db.registrosPeso.add(BASELINE_PESO);

    await db.meta.put({ chave: 'seed_v1', valor: true });
    await db.meta.put({ chave: 'baseline_medidas', valor: BASELINE_MEDIDAS });
  });
}

// Converte campos "reps" do histórico (numero, string "8;7;6" ou texto tipo "CARNAVAL") em array de numeros
function parseRepsHistorico(reps) {
  if (reps == null) return [];
  if (typeof reps === 'number') return [reps];
  const partes = String(reps).split(';').map(s => s.trim()).filter(Boolean);
  const nums = partes.map(p => parseFloat(p)).filter(n => !isNaN(n));
  return nums;
}

function faseAtual(dataRef = new Date()) {
  const iso = dataRef.toISOString().slice(0, 10);
  return FASES_SEED.find(f => iso >= f.data_inicio && iso < f.data_fim) || null;
}

async function proximoTreinoSugerido() {
  const ultimos = await db.registrosSeries.orderBy('data').reverse().limit(1).toArray();
  if (ultimos.length === 0) return 'A';
  const ex = await db.exercicios.get(ultimos[0].exercicio_id);
  const idx = TREINO_ORDER.indexOf(ex.treino);
  return TREINO_ORDER[(idx + 1) % TREINO_ORDER.length];
}
