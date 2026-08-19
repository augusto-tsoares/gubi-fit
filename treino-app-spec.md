# App de treino — especificação técnica

## 1. Visão geral

App mobile-first (PWA — web app instalável) para substituir a planilha atual de acompanhamento de treino. A planilha original é uma matriz gigante (uma coluna por semana do ano inteiro) que ficou inviável de preencher pelo celular na academia — isso foi o principal motivo do abandono do registro desde março/2026. O app resolve isso com um fluxo de registro rápido: abrir, escolher o treino do dia, lançar carga/reps por exercício, salvar.

Formato escolhido: **PWA**. Acesso via navegador, instalável na tela inicial (ícone próprio, tela cheia, sem loja de app), funciona em Android e iOS, e permite uso offline com sincronização posterior — importante para academias com sinal ruim.

## 2. Design system (extraído da planilha original via inspeção de estilos de célula)

Paleta pastel padrão do Google Sheets, já em uso consistente na planilha:

**Cor por treino (accent)**
| Treino | Hex fundo | Hex texto (contraste) |
|---|---|---|
| A | `#D5A6BD` | `#6B3350` |
| B | `#B4A7D6` | `#3F3170` |
| C | `#9FC5E8` | `#1F4E78` |
| D | `#A2C4C9` | `#1F4F52` |
| E | `#B6D7A8` | `#2E5C1F` |

**Estrutura neutra**
| Uso | Hex |
|---|---|
| Cabeçalho principal (fundo) | `#666666` |
| Cabeçalho secundário (fundo) | `#999999` |
| Texto sobre cabeçalho | `#FFFFFF` |
| Linha de conteúdo (par) | `#EFEFEF` |
| Linha de conteúdo (ímpar) | `#F3F3F3` |
| Texto sobre linha de conteúdo | `#666666` |

**Tipografia**: Arial na planilha original — no app, usar a fonte padrão do sistema (native stack) para performance; manter os mesmos tamanhos relativos (título ~14px medium, corpo ~13-14px regular).

**Indicador de fase** (opcional, ver seção 5): a planilha original não muda a cor de fundo por fase, só a cor do texto sobre o mesmo cinza-escuro (`#666666`) — Bulking em rosa claro (`#F4CCCC`), Transição em pêssego (`#FCE5CD`), Cutting em branco. Pode ser reaproveitado como badge de fase no app.

Um mockup de referência da tela "hoje" já foi validado nesta conversa, usando exatamente essas cores.

## 3. Modelo de dados

```
Exercicio {
  id, treino: 'A'|'B'|'C'|'D'|'E', nome,
  series_alvo: number, reps_alvo: string (ex: "6-9 (RIR 1)"),
  descanso: string, nota: string
}

RegistroSerie {
  id, exercicio_id, data, semana_treino,
  carga_kg: number, reps: number
}

RegistroPeso {
  id, data, peso_kg: number
}

RegistroMedidas {
  id, data, cintura_cm, quadril_cm, coxa_cm,
  panturrilha_cm, peito_cm, busto_cm, biceps_cm
}

FasePlano {
  id, nome, data_inicio, data_fim, tipo: 'bulking'|'cutting'|'manutencao'
}
```

## 4. Biblioteca de exercícios (Treinos A-E)

24 exercícios distribuídos em 5 treinos, cada um com séries-alvo, faixa de reps, descanso e uma nota técnica curta (ex: "Foco em tensão mecânica na clavicular do peito"). Lista completa estruturada em `dados-historicos.json` (campo `exercicios`, com `series_alvo`, `reps_alvo`, `descanso`, `nota` por item).

## 5. Plano de fases (periodização)

| Fase | Período | Tipo |
|---|---|---|
| Bulking moderado | 19/ago – 21/out/2026 | bulking (~200-250g/semana) |
| Cutting | 21/out – 31/dez/2026 | cutting (~0,5%/semana) |
| Manutenção magra | jan – 9/fev/2027 (Carnaval) | manutenção |
| Bulking mais intenso | a partir de mar/2027 | bulking |

## 6. Dados históricos para importar

Arquivo `dados-historicos.json` (anexo) contém:
- **`exercicios`**: os 24 exercícios com metadados + histórico semanal de carga/reps já registrado (semanas 1-20, jan-mai/2026, extraído diretamente da planilha original).
- **`acompanhamento_semanal`**: peso corporal, meta de peso e o treino programado por dia da semana (segunda a domingo), semana a semana.

Nota: o registro consistente vai até a semana 10 (16/03/2026); a partir da semana 11 há uma pausa por doença, e depois disso os dados ficam esparsos. Isso é esperado — é justamente o ponto em que o acompanhamento antigo quebrou.

**Baseline de peso e medidas atual (19/ago/2026, para popular o estado inicial do app):**
- Peso: 69,8 kg
- Medidas mais recentes (27/jan/2026 — ainda não remedidas): cintura 78 cm, quadril 91 cm, coxa 53 cm, panturrilha 35 cm, peito 96 cm, busto 121 cm, bíceps 33 cm

## 7. Funcionalidades essenciais (MVP)

1. **Tela "hoje"**: mostra o treino do dia (A-E, com badge colorido), lista os exercícios com séries-alvo/reps-alvo, campo rápido de carga + reps por série, botão salvar.
2. **Sugestão automática de carga** (metodologia de progressão dupla já usada no treino):
   - Trabalhar dentro de uma faixa de reps-alvo (ex: 8-12).
   - Se a primeira série bateu o teto da faixa com boa técnica, sugerir subir a carga no próximo treino.
   - Fadiga entre séries é normal (ex: 12/10/8) — manter carga se todas as séries ficarem dentro da faixa.
   - Se alguma série cair abaixo do mínimo da faixa, sugerir reduzir 10-20% na próxima série (back-off).
   - Em isoladores pequenos (ombro, elevação lateral etc.), não subir carga cedo — progredir por reps (até ~15) ou drop-set.
3. **Tela de peso**: input semanal + gráfico de evolução, com a meta da fase atual sobreposta.
4. **Indicador de fase atual**, com transição automática de bulking → cutting → manutenção → bulking conforme as datas da seção 5.
5. **Histórico por exercício**: gráfico simples de carga ao longo do tempo, por exercício.
6. Modo claro/escuro.

## 8. Fora do escopo do MVP (v2)

- Registro de medidas corporais (campo existe no modelo de dados, mas UI pode vir depois).
- Tracking de macros/nutrição (proteína, calorias) — mencionado aqui como possível extensão futura, não bloqueia o MVP.

## 9. Stack sugerida

- Frontend: React + Tailwind (ou HTML/CSS/JS simples se preferir menos dependência).
- PWA: `manifest.json` + service worker para instalação e uso offline.
- Armazenamento: IndexedDB (via Dexie.js, por exemplo) — dados ficam no dispositivo, sem depender de backend para o MVP.
- Import inicial: carregar `dados-historicos.json` na primeira execução para popular o histórico.
