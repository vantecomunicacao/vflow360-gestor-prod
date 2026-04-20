

# Filtro de Data Adicional

## O que vai acontecer

1. **Configurações → Campo de data adicional** vira um **dropdown** (não mais input livre) listando apenas campos customizados do GHL cujo `data_type` indica data (`DATE`, `DATETIME` ou similar). Salva o `ghl_id` do campo escolhido.

2. **Dashboard** ganha **novo filtro "Data adicional"** ao lado dos demais (só aparece quando há campo configurado), com seu próprio seletor de período (mesmos atalhos do filtro principal).

3. **Backend (`ghl-dashboard`)** passa a aplicar o filtro adicional como **AND** sobre o período principal: a oportunidade só entra no resultado se o valor do campo customizado de data (lido de `custom_fields[ghl_id]`) cair dentro do range adicional.

## Caso de uso (exatamente como descrito)

Período principal = "última semana" → filtra por `ghl_created_at`.  
Campo adicional configurado = "Data de Fechamento" + período adicional = "última semana" → leads precisam ter `custom_fields["dataFechamento"]` também na semana. Resultado: só leads **criados E fechados** na mesma semana.

## Mudanças por arquivo

```text
supabase/functions/ghl-sync/index.ts
  └─ garantir que data_type já está sendo gravado (já está, ok)

src/pages/DashboardSettings.tsx
  └─ trocar Input por Select; popular com customFields filtrados por
     data_type ∈ {DATE, DATETIME, DATE_TIME, date, datetime}
  └─ opção "Nenhum" para desabilitar

src/hooks/useGhlData.ts
  └─ adicionar additionalStartDate / additionalEndDate em DashboardFilters
  └─ enviar no body para ghl-dashboard
  └─ adicionar additionalDateField (lido de settings) na resposta para a UI
     saber se mostra o filtro

src/pages/Dashboard.tsx
  └─ novo state additionalDateRange
  └─ resetar ao trocar workspace
  └─ passar para useGhlData

src/components/dashboard/Header.tsx
  └─ aceitar props: additionalDateRange, onAdditionalDateRangeChange,
     additionalDateLabel (nome do campo)
  └─ renderizar segundo DateRangeFilter rotulado "<nome do campo>" só quando
     additionalDateLabel existir
  └─ incluir botão "limpar" e contar no activeFilterCount

supabase/functions/ghl-dashboard/index.ts
  └─ ler additional_date_field das settings + addStartDate/addEndDate do body
  └─ após carregar opps (sem o filtro adicional aplicado no SQL), filtrar
     em memória: parsear custom_fields[fieldGhlId] como Date e checar range
  └─ aplicar a TODOS os agregados (funil, KPIs, sellers, origens, etc.)
  └─ retornar additionalDateFieldName na resposta para o front identificar
```

## Detalhes técnicos

- **Identificação de campos de data**: filtrar `customFields` por `data_type` em `["DATE","DATETIME","DATE_TIME","date","datetime"]` (GHL às vezes retorna em maiúsculas, às vezes em PascalCase). Se nenhum campo bater, mostrar "Nenhum campo de data sincronizado" no Select.
- **Leitura do valor**: em `ghl_opportunities.custom_fields` o GHL grava como `{ [fieldId]: "ISO string" | unix_ms }`. Tratar ambos: se número → `new Date(n)`; se string → `new Date(parse)`. Inválido → exclui do resultado.
- **Filtro no backend**: aplicado **após** o fetch (SQL JSON path complicaria com unknown id). Performance ok porque o range principal já reduziu o conjunto.
- **Persistência**: `additional_date_field` continua na coluna existente (texto = `ghl_id`). Sem migração.
- **Comparação período-anterior** (trends dos KPIs): manter usando só o range principal (não duplicar complexidade).

## Não está no escopo

- Lembrar a última seleção do range adicional entre sessões.
- Filtro adicional baseado em data **não-customizada** (ex: `last_status_change_at`) — isso seria outro recurso, fora do que foi pedido.

