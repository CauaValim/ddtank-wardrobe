import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Lock, Database, Mail, Users, FileCheck } from "lucide-react";

export default function Trust() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto max-w-4xl px-6 py-10">
          <div className="flex items-center gap-3">
            <Shield className="h-7 w-7 text-primary" aria-hidden />
            <h1 className="text-3xl font-bold">Central de Confiança</h1>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Esta página é mantida pela equipe responsável pelo Painel Staff DDTank 337 para
            responder dúvidas comuns sobre segurança, privacidade e operação do painel. Não
            constitui certificação independente — descreve os controles atualmente habilitados
            e práticas declaradas pelos responsáveis pelo aplicativo.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Lock className="h-5 w-5 text-primary" aria-hidden /> Acesso e Autenticação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              O acesso ao painel exige autenticação por e-mail e senha. Não há cadastro
              público — contas são criadas apenas por um Super Administrador.
            </p>
            <p>
              O painel utiliza um modelo de papéis (Moderador, Analista, Administrador e
              Super Administrador). Cada papel libera somente as funções compatíveis com sua
              responsabilidade.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Database className="h-5 w-5 text-primary" aria-hidden /> Plataforma e Hospedagem
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              O aplicativo é hospedado na plataforma Lovable e utiliza Supabase como banco
              de dados gerenciado. Comunicação entre o navegador e os serviços ocorre por
              HTTPS. A responsabilidade pela configuração do projeto, papéis e dados é dos
              mantenedores do painel; recursos da plataforma seguem a documentação oficial
              de cada provedor.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileCheck className="h-5 w-5 text-primary" aria-hidden /> Dados Tratados
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              O painel armazena catálogo de itens do jogo, imagens associadas e dados de
              uso interno (papéis e e-mails de operadores). Não há coleta de dados de
              jogadores finais nesta interface.
            </p>
            <p>
              Políticas de acesso a nível de linha (RLS) restringem leitura e escrita das
              tabelas conforme o papel do usuário autenticado.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-primary" aria-hidden /> Subprocessadores
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Provedores utilizados pelo painel: <strong>Lovable</strong> (hospedagem da
              aplicação) e <strong>Supabase</strong> (banco de dados, autenticação e
              armazenamento de arquivos).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Mail className="h-5 w-5 text-primary" aria-hidden /> Contato de Segurança
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Para relatar uma vulnerabilidade ou incidente, entre em contato com a
              administração do painel pelo canal interno da equipe Staff DDTank 337.
            </p>
          </CardContent>
        </Card>

        <div className="pt-4">
          <Link to="/login" className="text-sm text-primary underline">
            Voltar para o login
          </Link>
        </div>
      </main>
    </div>
  );
}