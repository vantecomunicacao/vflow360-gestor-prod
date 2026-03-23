import { useState } from "react";
import { MessageSquare, Search, Link2, Phone } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

const contacts = [
  {
    id: "1", name: "João Silva", phone: "+55 11 99999-1234", lastMessage: "Quero comprar por R$1500", time: "2 min",
    linked: true, messages: [
      { from: "lead", text: "Oi, vi o anúncio de vocês", time: "10:30" },
      { from: "user", text: "Olá João! Tudo bem? Como posso ajudar?", time: "10:32" },
      { from: "lead", text: "Quero comprar por R$1500", time: "10:35" },
    ],
  },
  {
    id: "2", name: "Maria Santos", phone: "+55 21 98888-5678", lastMessage: "Pode me enviar a proposta?", time: "15 min",
    linked: false, messages: [
      { from: "lead", text: "Boa tarde!", time: "14:00" },
      { from: "user", text: "Boa tarde Maria! Em que posso ajudar?", time: "14:02" },
      { from: "lead", text: "Pode me enviar a proposta?", time: "14:05" },
    ],
  },
  {
    id: "3", name: "Carlos Lima", phone: "+55 31 97777-9012", lastMessage: "Já fechei com vocês!", time: "1h",
    linked: true, messages: [
      { from: "lead", text: "Pessoal, já fechei com vocês!", time: "09:00" },
      { from: "user", text: "Que ótimo Carlos! Parabéns!", time: "09:05" },
    ],
  },
  {
    id: "4", name: "Ana Oliveira", phone: "+55 41 96666-3456", lastMessage: "Pode me ligar amanhã às 10h?", time: "2h",
    linked: false, messages: [
      { from: "lead", text: "Pode me ligar amanhã às 10h?", time: "08:20" },
    ],
  },
];

const Conversations = () => {
  const [selected, setSelected] = useState(contacts[0]);
  const [search, setSearch] = useState("");

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  return (
    <div className="h-[calc(100vh-8rem)]">
      <h1 className="text-2xl font-bold text-foreground mb-1">Conversas</h1>
      <p className="text-muted-foreground mb-6">Mensagens recebidas do WhatsApp</p>

      <div className="flex gap-4 h-[calc(100%-4rem)]">
        {/* Contact List */}
        <div className="w-80 shrink-0 glass-card flex flex-col">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar contato..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            {filtered.map((contact) => (
              <div
                key={contact.id}
                onClick={() => setSelected(contact)}
                className={`flex items-center gap-3 p-4 cursor-pointer transition-colors border-b border-border/50 ${
                  selected.id === contact.id ? "bg-muted" : "hover:bg-muted/50"
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                  {contact.name.split(" ").map(n => n[0]).join("")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{contact.name}</span>
                    {contact.linked && <Link2 className="w-3 h-3 text-primary" />}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{contact.lastMessage}</p>
                </div>
                <span className="text-xs text-muted-foreground">{contact.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Chat View */}
        <div className="flex-1 glass-card flex flex-col">
          <div className="p-4 border-b border-border flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
              {selected.name.split(" ").map(n => n[0]).join("")}
            </div>
            <div>
              <p className="font-medium text-foreground">{selected.name}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Phone className="w-3 h-3" /> {selected.phone}
              </p>
            </div>
            <div className="ml-auto">
              {selected.linked ? (
                <Badge variant="outline" className="text-primary border-primary/30">
                  <Link2 className="w-3 h-3 mr-1" /> Vinculado ao GHL
                </Badge>
              ) : (
                <Badge variant="outline" className="text-warning border-warning/30">Não vinculado</Badge>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-3">
            {selected.messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[70%] rounded-xl px-4 py-2.5 ${
                  msg.from === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}>
                  <p className="text-sm">{msg.text}</p>
                  <p className={`text-xs mt-1 ${msg.from === "user" ? "text-primary-foreground/60" : "text-muted-foreground"}`}>{msg.time}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Conversations;
