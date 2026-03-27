import { User, Bell, Shield, Brain, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SettingsPage = () => {
  const { user } = useAuth();
  const [aiProvider, setAiProvider] = useState("lovable");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o");
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingAi, setSavingAi] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchConfig = async () => {
      const { data } = await supabase
        .from("ai_provider_config" as any)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        const d = data as any;
        setAiProvider(d.provider || "lovable");
        setOpenaiApiKey(d.api_key || "");
        setOpenaiModel(d.model || "gpt-4o");
      }
    };
    fetchConfig();
  }, [user]);

  const saveAiProvider = async () => {
    if (!user) return;
    setSavingAi(true);
    try {
      if (aiProvider === "openai" && !openaiApiKey.trim()) {
        toast.error("Informe a chave da API da OpenAI");
        setSavingAi(false);
        return;
      }

      const payload = {
        user_id: user.id,
        provider: aiProvider,
        api_key: aiProvider === "openai" ? openaiApiKey.trim() : null,
        model: aiProvider === "openai" ? openaiModel : null,
      };

      const { data: existing } = await supabase
        .from("ai_provider_config" as any)
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        await (supabase.from("ai_provider_config" as any) as any)
          .update(payload)
          .eq("user_id", user.id);
      } else {
        await supabase.from("ai_provider_config" as any).insert(payload as any);
      }

      toast.success("Configuração de IA salva com sucesso!");
    } catch (e) {
      toast.error("Erro ao salvar configuração de IA");
    } finally {
      setSavingAi(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground">Gerencie seu perfil e preferências</p>
      </div>

      {/* AI Provider */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6">
        <h3 className="font-semibold text-foreground flex items-center gap-2 mb-4">
          <Brain className="w-5 h-5 text-primary" /> Provedor de IA
        </h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Provedor</Label>
            <Select value={aiProvider} onValueChange={setAiProvider}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lovable">Lovable AI (Padrão)</SelectItem>
                <SelectItem value="openai">OpenAI (ChatGPT)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {aiProvider === "lovable"
                ? "Usando IA integrada do Lovable — sem necessidade de configuração extra."
                : "Use sua própria chave da OpenAI para análises com ChatGPT."}
            </p>
          </div>

          {aiProvider === "openai" && (
            <>
              <div className="space-y-2">
                <Label>Chave da API (OpenAI)</Label>
                <div className="relative">
                  <Input
                    type={showApiKey ? "text" : "password"}
                    placeholder="sk-..."
                    value={openaiApiKey}
                    onChange={(e) => setOpenaiApiKey(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Obtenha em{" "}
                  <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener" className="text-primary underline">
                    platform.openai.com/api-keys
                  </a>
                </p>
              </div>

              <div className="space-y-2">
                <Label>Modelo</Label>
                <Select value={openaiModel} onValueChange={setOpenaiModel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                    <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                    <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                    <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <Button onClick={saveAiProvider} disabled={savingAi}>
            {savingAi ? "Salvando..." : "Salvar configuração de IA"}
          </Button>
        </div>
      </motion.div>

      {/* Profile */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-6">
        <h3 className="font-semibold text-foreground flex items-center gap-2 mb-4">
          <User className="w-5 h-5 text-primary" /> Perfil
        </h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input defaultValue="Usuário Demo" />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input defaultValue="demo@copilotoghl.com" type="email" />
          </div>
          <Button>Salvar alterações</Button>
        </div>
      </motion.div>

      {/* Notifications */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-6">
        <h3 className="font-semibold text-foreground flex items-center gap-2 mb-4">
          <Bell className="w-5 h-5 text-primary" /> Notificações
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">Novas sugestões da IA</p>
              <p className="text-xs text-muted-foreground">Receber notificação quando uma nova sugestão for gerada</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">Novas mensagens</p>
              <p className="text-xs text-muted-foreground">Notificar quando receber mensagens no WhatsApp</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">Relatórios semanais</p>
              <p className="text-xs text-muted-foreground">Resumo semanal de atividades por email</p>
            </div>
            <Switch />
          </div>
        </div>
      </motion.div>

      {/* Security */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card p-6">
        <h3 className="font-semibold text-foreground flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-primary" /> Segurança
        </h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Senha atual</Label>
            <Input type="password" placeholder="••••••••" />
          </div>
          <div className="space-y-2">
            <Label>Nova senha</Label>
            <Input type="password" placeholder="••••••••" />
          </div>
          <Button variant="outline">Alterar senha</Button>
        </div>
      </motion.div>
    </div>
  );
};

export default SettingsPage;
