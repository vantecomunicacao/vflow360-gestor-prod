import { User, Bell, Shield, Palette } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { motion } from "framer-motion";

const SettingsPage = () => {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground">Gerencie seu perfil e preferências</p>
      </div>

      {/* Profile */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6">
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
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-6">
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
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-6">
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
