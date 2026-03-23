import { Users, Target, DollarSign, MessageSquare, Sparkles, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const stats = [
  { label: "Total de Contatos", value: "1.284", icon: Users, change: "+12%" },
  { label: "Oportunidades", value: "342", icon: Target, change: "+8%" },
  { label: "Valor em Pipeline", value: "R$ 485.200", icon: DollarSign, change: "+23%" },
  { label: "Sugestões Pendentes", value: "18", icon: Sparkles, change: "3 novas" },
];

const pipelineData = [
  { name: "Novo Lead", value: 120 },
  { name: "Qualificado", value: 85 },
  { name: "Proposta", value: 45 },
  { name: "Negociação", value: 30 },
  { name: "Fechado", value: 62 },
];

const pieData = [
  { name: "Ganhas", value: 62, color: "hsl(155, 60%, 45%)" },
  { name: "Perdidas", value: 28, color: "hsl(0, 72%, 51%)" },
  { name: "Em andamento", value: 252, color: "hsl(210, 80%, 55%)" },
];

const recentConversations = [
  { name: "João Silva", message: "Quero saber mais sobre o plano premium", time: "2 min" },
  { name: "Maria Santos", message: "Pode me enviar a proposta?", time: "15 min" },
  { name: "Carlos Lima", message: "Já fechei com vocês!", time: "1h" },
  { name: "Ana Oliveira", message: "Qual o valor para 10 usuários?", time: "2h" },
];

const Dashboard = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral do seu CRM e conversas</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="glass-card p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <stat.icon className="w-5 h-5 text-primary" />
              <span className="text-xs text-primary font-medium">{stat.change}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            <p className="text-sm text-muted-foreground">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-card p-5 lg:col-span-2"
        >
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Oportunidades por Etapa
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={pipelineData}>
              <XAxis dataKey="name" tick={{ fill: "hsl(220, 10%, 50%)", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "hsl(220, 10%, 50%)", fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(220, 25%, 8%)",
                  border: "1px solid hsl(220, 20%, 14%)",
                  borderRadius: "8px",
                  color: "hsl(220, 10%, 90%)",
                }}
              />
              <Bar dataKey="value" fill="hsl(155, 60%, 45%)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Pie Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass-card p-5"
        >
          <h3 className="text-lg font-semibold text-foreground mb-4">Status Geral</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={4}>
                {pieData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {pieData.map((item) => (
              <div key={item.name} className="flex items-center gap-2 text-sm">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-muted-foreground">{item.name}</span>
                <span className="ml-auto text-foreground font-medium">{item.value}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Recent Conversations */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="glass-card p-5"
      >
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          Conversas Recentes
        </h3>
        <div className="space-y-3">
          {recentConversations.map((conv) => (
            <div key={conv.name} className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                {conv.name.split(" ").map(n => n[0]).join("")}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{conv.name}</p>
                <p className="text-sm text-muted-foreground truncate">{conv.message}</p>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{conv.time}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default Dashboard;
