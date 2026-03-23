import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bot, Mail, Lock, User, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

const Register = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      toast({ title: "Conta criada com sucesso!" });
      navigate("/onboarding");
    }, 1000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="flex items-center gap-2 mb-8 justify-center">
          <Bot className="w-8 h-8 text-primary" />
          <span className="text-2xl font-bold text-foreground">Copiloto GHL</span>
        </div>

        <h2 className="text-2xl font-semibold text-foreground mb-1">Criar nova conta</h2>
        <p className="text-muted-foreground mb-8">Comece a usar o Copiloto GHL gratuitamente</p>

        <form onSubmit={handleRegister} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input id="name" placeholder="Seu nome" className="pl-10" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input id="email" type="email" placeholder="seu@email.com" className="pl-10" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input id="password" type="password" placeholder="Mínimo 8 caracteres" className="pl-10" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Criando..." : "Criar conta"}
            <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Já tem uma conta?{" "}
          <Link to="/login" className="text-primary hover:underline font-medium">Entrar</Link>
        </p>
      </motion.div>
    </div>
  );
};

export default Register;
