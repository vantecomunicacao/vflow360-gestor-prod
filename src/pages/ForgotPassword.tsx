import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bot, Mail, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useForceLightTheme } from "@/hooks/useForceLightTheme";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useForceLightTheme();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setSent(true);
      toast({ title: "Email enviado!", description: "Verifique sua caixa de entrada." });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <Bot className="w-8 h-8 text-primary" />
          <span className="text-2xl font-bold text-foreground">VFlow360</span>
        </div>

        <h2 className="text-2xl font-semibold text-foreground mb-1">Recuperar senha</h2>
        <p className="text-muted-foreground mb-8">Enviaremos um link para redefinir sua senha</p>

        {sent ? (
          <div className="glass-card p-6 text-center">
            <Mail className="w-12 h-12 text-primary mx-auto mb-4" />
            <p className="text-foreground font-medium mb-2">Email enviado!</p>
            <p className="text-muted-foreground text-sm">Verifique sua caixa de entrada e siga as instruções.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Enviando..." : "Enviar link de recuperação"}
            </Button>
          </form>
        )}

        <Link to="/login" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mt-6 justify-center">
          <ArrowLeft className="w-4 h-4" /> Voltar ao login
        </Link>
      </motion.div>
    </div>
  );
};

export default ForgotPassword;
