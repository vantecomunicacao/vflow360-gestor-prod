import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bot, MessageSquare, Link2, CheckCircle, ArrowRight, QrCode } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const steps = [
  { id: 1, title: "Conectar WhatsApp", icon: MessageSquare, description: "Vincule seu WhatsApp via QR Code para começar a receber mensagens." },
  { id: 2, title: "Conectar CRM", icon: Link2, description: "Insira suas credenciais para conectar seu CRM ao VFlow360." },
  { id: 3, title: "Tudo pronto!", icon: CheckCircle, description: "Seu VFlow360 está configurado e pronto para usar." },
];

const Onboarding = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [ghlApiKey, setGhlApiKey] = useState("");
  const [ghlLocationId, setGhlLocationId] = useState("");
  const navigate = useNavigate();

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      navigate("/dashboard");
    }
  };

  const handleSkip = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <Bot className="w-8 h-8 text-primary" />
          <span className="text-2xl font-bold text-foreground">VFlow360</span>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-10 justify-center">
          {steps.map((step, i) => (
            <div key={step.id} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                i <= currentStep ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {i < currentStep ? <CheckCircle className="w-4 h-4" /> : step.id}
              </div>
              {i < steps.length - 1 && (
                <div className={`w-12 h-0.5 ${i < currentStep ? "bg-primary" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            className="glass-card p-8"
          >
            {currentStep === 0 && (
              <div className="text-center">
                <MessageSquare className="w-12 h-12 text-primary mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-foreground mb-2">{steps[0].title}</h3>
                <p className="text-muted-foreground mb-6">{steps[0].description}</p>
                <div className="bg-muted rounded-lg p-8 mb-6 flex items-center justify-center">
                  <div className="w-48 h-48 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-3">
                    <QrCode className="w-16 h-16 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">QR Code aparecerá aqui</span>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 1 && (
              <div>
                <Link2 className="w-12 h-12 text-primary mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-foreground mb-2 text-center">{steps[1].title}</h3>
                <p className="text-muted-foreground mb-6 text-center">{steps[1].description}</p>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>API Key do CRM</Label>
                    <Input placeholder="Sua API Key" value={ghlApiKey} onChange={(e) => setGhlApiKey(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Location ID</Label>
                    <Input placeholder="Seu Location ID" value={ghlLocationId} onChange={(e) => setGhlLocationId(e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="text-center">
                <CheckCircle className="w-16 h-16 text-primary mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-foreground mb-2">{steps[2].title}</h3>
                <p className="text-muted-foreground mb-2">{steps[2].description}</p>
                <p className="text-sm text-muted-foreground">Você pode configurar as integrações a qualquer momento nas Configurações.</p>
              </div>
            )}

            <div className="flex gap-3 mt-8">
              {currentStep < steps.length - 1 && (
                <Button variant="outline" className="flex-1" onClick={handleSkip}>
                  Pular
                </Button>
              )}
              <Button className="flex-1" onClick={handleNext}>
                {currentStep === steps.length - 1 ? "Ir para o Dashboard" : "Continuar"}
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Onboarding;
