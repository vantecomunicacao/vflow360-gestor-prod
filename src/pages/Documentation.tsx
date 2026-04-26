import { Bot, Zap, Brain, Shield, Clock, MessageSquare, GitBranch, CheckCircle, XCircle, RefreshCw, ArrowRight, Lightbulb, Settings, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const Documentation = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Documentação</h1>
        <p className="text-muted-foreground mt-1">
          Entenda como o VFlow36 funciona por dentro.
        </p>
      </div>

      {/* Como a IA analisa */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            Como a IA analisa as conversas?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Análise em tempo real (automática)</p>
                <p className="text-sm text-muted-foreground">
                  Toda vez que o <strong>lead envia uma mensagem</strong> no WhatsApp, 
                  a IA é acionada automaticamente para analisar a conversa e gerar sugestões. 
                  Mensagens enviadas por você (atendente) <strong>não disparam</strong> a análise.
                </p>
              </div>
            </div>

            <Separator />

            <div className="flex items-start gap-3">
              <RefreshCw className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Análise manual (sob demanda)</p>
                <p className="text-sm text-muted-foreground">
                  Você pode forçar uma nova análise a qualquer momento clicando em 
                  "Analisar com IA" dentro de uma conversa. Isso usa o mesmo motor de análise.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contexto da análise */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            Quanto contexto a IA usa?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-4 space-y-1">
              <p className="text-2xl font-bold text-primary">50</p>
              <p className="text-sm text-muted-foreground">
                Últimas <strong>50 mensagens</strong> da conversa são enviadas como contexto para a IA.
              </p>
            </div>
            <div className="rounded-lg border p-4 space-y-1">
              <p className="text-2xl font-bold text-primary">20</p>
              <p className="text-sm text-muted-foreground">
                Últimas <strong>20 sugestões</strong> já geradas são incluídas como contexto 
                para evitar duplicatas e contradições.
              </p>
            </div>
          </div>

          <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
            <strong>💡 Dica:</strong> A IA recebe o histórico completo da conversa (até 50 mensagens) 
            e também sabe quais sugestões já foram geradas, aprovadas ou rejeitadas. Isso garante 
            que ela não repita ações e entenda o contexto atual do lead.
          </div>
        </CardContent>
      </Card>

      {/* Fluxo de processamento */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-primary" />
            Fluxo de processamento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { step: "1", title: "Mensagem recebida", desc: "Lead envia mensagem no WhatsApp → webhook recebe a mensagem e salva no banco de dados." },
              { step: "2", title: "Verificação de contato", desc: "O sistema verifica se o contato está com análise de IA desativada. Se estiver, a análise é ignorada." },
              { step: "3", title: "Coleta de contexto", desc: "Busca as últimas 50 mensagens, configurações do CRM (campos/etapas habilitadas), e as últimas 20 sugestões." },
              { step: "4", title: "Análise pela IA", desc: "A IA analisa a conversa usando as configurações de campos, etapas e prompt personalizado, e gera sugestões de ações via tool calling." },
              { step: "5", title: "Validação pós-geração", desc: "As sugestões passam por filtros: campos/etapas inválidos são removidos, contradições são eliminadas, e duplicatas (60%+ similaridade) são filtradas." },
              { step: "6", title: "Salvar e executar", desc: "Sugestões são salvas no banco. Se auto-aprovar está ativo para o tipo de ação, a sugestão é executada imediatamente no CRM." },
            ].map((item) => (
              <div key={item.step} className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                  {item.step}
                </div>
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tipos de ação */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-primary" />
            Tipos de ação suportados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { type: "mover_funil", label: "Mover Funil", desc: "Move o lead para outra etapa do funil/pipeline configurado.", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
              { type: "campo_personalizado", label: "Campo Personalizado", desc: "Atualiza campos do contato ou oportunidade no CRM (texto, dropdown, checkbox etc).", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
              { type: "adicionar_nota", label: "Adicionar Nota", desc: "Adiciona uma nota de texto no contato do CRM.", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
              { type: "valor_negociacao", label: "Valor da Negociação", desc: "Atualiza o valor monetário da oportunidade. A IA detecta automaticamente menções a preço/valor na conversa.", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
              { type: "agendar_lembrete", label: "Agendar Lembrete", desc: "Cria uma tarefa no CRM com título e data de vencimento. Se não informada, usa 24h a partir do momento.", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
              { type: "ganho_perdido", label: "Ganho/Perdido", desc: "Marca a oportunidade como ganha ou perdida no CRM.", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
            ].map((action) => (
              <div key={action.type} className="flex items-start gap-3 rounded-lg border p-3">
                <Badge variant="outline" className={`shrink-0 ${action.color}`}>
                  {action.label}
                </Badge>
                <p className="text-sm text-muted-foreground">{action.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filtros e validações */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-primary" />
            Filtros e validações automáticas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Após a IA gerar as sugestões, elas passam por uma série de validações antes de serem salvas:
          </p>
          <div className="space-y-2">
            {[
              "Campos e etapas de funil inválidos (não configurados) são removidos automaticamente",
              "Contradições no mesmo lote são eliminadas (ex: ganho E perdido ao mesmo tempo)",
              "Contradições com sugestões já aprovadas são filtradas (ex: se 'ganho' já foi aprovado, não sugere 'perdido')",
              "Duplicatas exatas (mesmo tipo + campo + valor) são removidas",
              "Duplicatas semelhantes (60%+ similaridade de palavras-chave no título) são filtradas",
              "Sugestões pendentes para o mesmo campo não são duplicadas",
            ].map((rule, i) => (
              <div key={i} className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">{rule}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Auto-aprovar vs manual */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            Auto-aprovar vs. Aprovação manual
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <p className="font-medium">Auto-aprovar</p>
              </div>
              <p className="text-sm text-muted-foreground">
                A sugestão é gerada e <strong>executada imediatamente</strong> no CRM sem intervenção humana. 
                Se a execução falhar, o status volta para "pendente" para retry manual.
              </p>
            </div>
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-yellow-500" />
                <p className="font-medium">Aprovação manual</p>
              </div>
              <p className="text-sm text-muted-foreground">
                A sugestão fica com status "pendente" até que você aprove ou rejeite manualmente 
                na página de Sugestões.
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
            <strong>⚙️ Configuração:</strong> Você pode ativar/desativar cada tipo de ação e 
            o auto-aprovar individualmente na página de <strong>Configurações → Motor de IA</strong>.
          </p>
        </CardContent>
      </Card>

      {/* Multimodal */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            Análise multimodal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            O sistema processa diferentes tipos de mídia nas conversas:
          </p>
          <div className="space-y-2">
            {[
              { icon: "🎤", text: "Áudios: transcritos automaticamente usando IA (Whisper/Gemini) e analisados como texto" },
              { icon: "🖼️", text: "Imagens: descritas pela IA e o conteúdo é usado como contexto da conversa" },
              { icon: "📝", text: "Texto: analisado diretamente como parte da conversa" },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-lg shrink-0">{item.icon}</span>
                <p className="text-sm text-muted-foreground">{item.text}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Contato com IA desativada */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Desativar IA para um contato
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Você pode desativar a análise de IA para contatos específicos. 
            Quando desativado, mensagens daquele contato são recebidas e salvas normalmente, 
            mas <strong>nenhuma sugestão é gerada</strong>. Isso é útil para conversas internas 
            ou contatos que não precisam de acompanhamento pelo CRM.
          </p>
        </CardContent>
      </Card>

      {/* FAQ */}
      <Card>
        <CardHeader>
          <CardTitle>Perguntas frequentes</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="q1">
              <AccordionTrigger>A IA analisa toda mensagem que chega?</AccordionTrigger>
              <AccordionContent>
                Sim, toda mensagem <strong>enviada pelo lead</strong> (inbound) dispara uma nova análise. 
                Mensagens enviadas pelo atendente não disparam análise automática. A IA sempre 
                recebe as últimas 50 mensagens como contexto completo.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q2">
              <AccordionTrigger>Por que a IA gerou uma sugestão errada?</AccordionTrigger>
              <AccordionContent>
                A IA é conservadora por design, mas pode interpretar mal o contexto. 
                Você pode rejeitar sugestões incorretas e ajustar o prompt personalizado 
                nas configurações do CRM para refinar o comportamento. Sugestões rejeitadas 
                ajudam a IA a não repetir o mesmo erro.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q3">
              <AccordionTrigger>O que acontece se a execução no CRM falhar?</AccordionTrigger>
              <AccordionContent>
                Se uma sugestão auto-aprovada falhar na execução, o status é revertido para 
                "pendente" automaticamente. Você pode tentar aprovar novamente manualmente. 
                O motivo do erro é salvo nos dados da sugestão para diagnóstico.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q4">
              <AccordionTrigger>A IA repete sugestões?</AccordionTrigger>
              <AccordionContent>
                Não. O sistema injeta as últimas 20 sugestões como contexto e aplica filtros 
                de deduplicação (exata e por similaridade de 60%+). Sugestões que contradizem 
                ações já aprovadas também são filtradas automaticamente.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q5">
              <AccordionTrigger>Qual modelo de IA é usado?</AccordionTrigger>
              <AccordionContent>
                Por padrão, o sistema usa o <strong>Gemini 2.5 Flash</strong> via Lovable AI. 
                Você pode configurar a OpenAI (GPT-4o) como provedor alternativo nas 
                configurações, fornecendo sua própria chave de API.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q6">
              <AccordionTrigger>Posso personalizar o comportamento da IA?</AccordionTrigger>
              <AccordionContent>
                Sim! Nas configurações de integração do CRM, você pode adicionar um <strong>prompt 
                personalizado</strong> que é injetado na análise. Use para dar instruções específicas 
                sobre seu negócio, como critérios de qualificação de leads ou regras de movimentação de funil.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
};

export default Documentation;
