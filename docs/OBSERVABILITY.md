# Observabilidade & Aprendizado (fase 0)

> Decisão de projeto: **não** vamos construir um "agente de aprendizado" que muda
> prompts sozinho. Isso é fonte de regressão silenciosa. Em vez disso construímos
> agora só a **fundação de logging**; o aprendizado de verdade é um pipeline
> **offline, revisado por humano**, mais tarde, quando houver volume.
>
> Este doc descreve o que já logamos, a lacuna, e o esquema mínimo para fechá-la.
> Atualizado em 2026-06-03.

---

## 1. O princípio

Como **toda ação da IA passa por aprovação do gestor** (ver
[`AI_DECISIONS.md`](./AI_DECISIONS.md)), cada aprovação/edição/rejeição já é um
**rótulo de qualidade de graça**. O trabalho é capturar isso de forma estruturada e
ligável à decisão que o gerou. Nada de auto-mutação.

## 2. O que já existe

| Sinal | Tabela | Conteúdo |
|---|---|---|
| Erros / eventos | `system_logs` | nível, source, mensagem, stack, contexto (front via `log-event`, edge via `_shared/error-reporter`) |
| Custo de IA | `ai_usage_log` | tokens (prompt/completion/total), `cost_usd`, modelo, provider, por workspace |
| Resultado da decisão | `suggestions` | `type`, `status` (pending/approved/rejected), `action_data` (incl. `executed`, `execution_result`) |

Já dá pra responder "quanto a IA custa" e "quantas sugestões foram aprovadas". **Não**
dá pra responder "esta sugestão ruim veio de qual prompt e qual contexto".

## 3. A lacuna

Falta a **tripla ligável**:

```
input (conversa + contexto) → prompt_version → output (sugestão) → decisão do gestor (aprovou/editou/rejeitou)
```

Hoje:
- O `input` exato dado ao LLM não é persistido.
- A `prompt_version` não existe (ver Decisão #2 do AI_DECISIONS).
- A `decisão do gestor` está em `suggestions.status`, mas sem o "editou" (se o gestor mudou o valor antes de aprovar, isso é o sinal mais rico e se perde).

## 4. Esquema mínimo proposto (fase 0)

Não precisa de tabela nova grande. Proposta enxuta:

1. **`PROMPT_VERSION`** — constante no código das functions de análise, gravada em cada sugestão (`action_data.prompt_version` ou coluna). Resolve a rastreabilidade sem custo.
2. **Capturar edição na aprovação** — quando o gestor aprova com valor diferente do sugerido, gravar `original_value` vs `approved_value` em `action_data`. É o sinal de aprendizado de maior valor.
3. **Snapshot leve do input** — opcional: hash ou referência das mensagens analisadas (não o texto inteiro, por privacidade/custo) + os IDs de campos/etapas oferecidos. Suficiente para reconstruir o contexto da decisão.

Com isso, uma query offline já responde: "para o tipo X, com prompt vN, qual a taxa
de aprovação? Onde o gestor mais edita? Que campos a IA mais erra?"

## 5. O pipeline de aprendizado (futuro, offline)

Quando houver volume, **fora do caminho de produção**:
1. Agregar `suggestions` + `ai_usage_log` por `type` e `prompt_version`.
2. Identificar padrões (tipos com baixa aprovação, edições recorrentes).
3. Propor ajuste de prompt/guardrail → **revisão humana** → muda a constante/código → novo `PROMPT_VERSION`.
4. Comparar aprovação antes/depois da versão.

Isso é o "Agente de Aprendizado" do diagrama IA-first — mas implementado como
**processo revisado**, não como runtime autônomo. A IA nunca reescreve a si mesma.

## 6. Métricas que valem acompanhar

- **Custo:** `cost_usd` por workspace / por sugestão gerada (já temos).
- **Taxa de aprovação** por `type` e por `prompt_version`.
- **Taxa de edição** (aprovado-com-mudança / aprovado) — proxy de "quase certo".
- **Volume barrado pelos gates** (quantas análises nem chegaram ao LLM) — eficiência de custo.
- **Erros** por function (`system_logs`).

## 7. Ordem sugerida de implementação

1. `PROMPT_VERSION` nas functions de análise (barato, destrava tudo).
2. Capturar edição na aprovação no front + `ghl-manage`.
3. (Opcional) snapshot leve do input.
4. Dashboard/queries de qualidade — só depois de ter dados acumulando.

Nada disso muda o comportamento da IA — só observa. É seguro implementar a qualquer
momento.
